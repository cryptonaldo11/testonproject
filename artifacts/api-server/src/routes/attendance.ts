import { Router, type IRouter } from "express";
import { db, attendanceLogsTable, usersTable, departmentsTable, workersTable, type AttendanceStatus } from "@workspace/db";
import { eq, and, gte, lte, SQL } from "drizzle-orm";

import {
  ListAttendanceQueryParams,
  ListAttendanceResponse,
  CreateAttendanceBody,
  GetAttendanceParams,
  GetAttendanceResponse,
  UpdateAttendanceParams,
  UpdateAttendanceBody,
  UpdateAttendanceResponse,
  CheckInBody,
  CheckInResponse,
  CheckOutBody,
  CheckOutResponse,
  GetAttendanceSummaryQueryParams,
  GetAttendanceSummaryResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, isRestrictedRole } from "../lib/auth";

const FACE_MATCH_THRESHOLD = 0.6;

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

const router: IRouter = Router();

function mapLog(log: typeof attendanceLogsTable.$inferSelect) {
  return {
    id: log.id,
    userId: log.userId,
    checkIn: log.checkIn ?? null,
    checkOut: log.checkOut ?? null,
    date: log.date,
    status: log.status,
    hoursWorked: log.hoursWorked ?? null,
    faceMatchScore: log.faceMatchScore ?? null,
    isManualEntry: log.isManualEntry,
    notes: log.notes ?? null,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
  };
}

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const params = ListAttendanceQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  const conditions: SQL[] = [];

  if (isRestrictedRole(jwtUser.role)) {
    conditions.push(eq(attendanceLogsTable.userId, jwtUser.userId));
  } else if (params.data.userId) {
    conditions.push(eq(attendanceLogsTable.userId, params.data.userId));
  }

  if (params.data.startDate) {
    conditions.push(gte(attendanceLogsTable.date, params.data.startDate));
  }
  if (params.data.endDate) {
    conditions.push(lte(attendanceLogsTable.date, params.data.endDate));
  }
  if (params.data.status) {
    const status = params.data.status as AttendanceStatus;
    conditions.push(eq(attendanceLogsTable.status, status));
  }

  const logs = await db.select().from(attendanceLogsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(attendanceLogsTable.date);

  res.json(ListAttendanceResponse.parse({ logs: logs.map(mapLog), total: logs.length }));
});

router.post("/attendance/checkin", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckInBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const jwtUser = req.user!;

  // Workers and drivers can only check in for themselves
  if (isRestrictedRole(jwtUser.role) && parsed.data.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only check in for yourself" });
    return;
  }

  // Server-side face descriptor validation
  const [workerRecord] = await db
    .select({ faceDescriptor: workersTable.faceDescriptor })
    .from(workersTable)
    .where(eq(workersTable.userId, parsed.data.userId));

  if (workerRecord?.faceDescriptor) {
    const submittedDescriptorStr = parsed.data.faceDescriptor;
    if (!submittedDescriptorStr) {
      res.status(422).json({ error: "Face verification required: no descriptor submitted" });
      return;
    }
    const submitted = submittedDescriptorStr.split(",").map(Number);
    const registered = workerRecord.faceDescriptor.split(",").map(Number);
    const distance = euclideanDistance(submitted, registered);
    if (distance > FACE_MATCH_THRESHOLD) {
      res.status(422).json({ error: "Face verification failed: face not recognized" });
      return;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const existing = await db.select().from(attendanceLogsTable)
    .where(and(
      eq(attendanceLogsTable.userId, parsed.data.userId),
      eq(attendanceLogsTable.date, today),
    ));

  if (existing.length > 0 && existing[0].checkIn) {
    res.status(400).json({ error: "Already checked in for today" });
    return;
  }

  const [log] = await db.insert(attendanceLogsTable).values({
    userId: parsed.data.userId,
    date: today,
    checkIn: now,
    status: "present",
    faceMatchScore: parsed.data.faceMatchScore ?? null,
    isManualEntry: "false",
  }).returning();

  res.json(CheckInResponse.parse(mapLog(log)));
});

router.post("/attendance/checkout", requireAuth, async (req, res): Promise<void> => {
  const parsed = CheckOutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const jwtUser = req.user!;

  // Workers and drivers can only check out for themselves
  if (isRestrictedRole(jwtUser.role) && parsed.data.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only check out for yourself" });
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  const [existing] = await db.select().from(attendanceLogsTable)
    .where(and(
      eq(attendanceLogsTable.userId, parsed.data.userId),
      eq(attendanceLogsTable.date, today),
    ));

  if (!existing || !existing.checkIn) {
    res.status(400).json({ error: "Not checked in today" });
    return;
  }

  if (existing.checkOut) {
    res.status(400).json({ error: "Already checked out" });
    return;
  }

  const hoursWorked = ((now.getTime() - existing.checkIn.getTime()) / (1000 * 60 * 60)).toFixed(2);

  const [log] = await db.update(attendanceLogsTable)
    .set({ checkOut: now, hoursWorked })
    .where(eq(attendanceLogsTable.id, existing.id))
    .returning();

  res.json(CheckOutResponse.parse(mapLog(log)));
});

router.get("/attendance/summary", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const params = GetAttendanceSummaryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const startDate = params.data.startDate ?? new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const endDate = params.data.endDate ?? new Date().toISOString().slice(0, 10);

  const conditions: SQL[] = [
    gte(attendanceLogsTable.date, startDate),
    lte(attendanceLogsTable.date, endDate),
  ];

  const logs = await db.select().from(attendanceLogsTable)
    .where(and(...conditions));

  const users = await db.select().from(usersTable);
  const depts = await db.select().from(departmentsTable);

  const deptMap = new Map(depts.map(d => [d.id, d.name]));

  let filteredUsers = users;
  if (params.data.departmentId) {
    filteredUsers = users.filter(u => u.departmentId === params.data.departmentId);
  }

  const items = filteredUsers.map(user => {
    const userLogs = logs.filter(l => l.userId === user.id);
    const presentDays = userLogs.filter(l => l.status === "present" || l.status === "late").length;
    const absentDays = userLogs.filter(l => l.status === "absent").length;
    const lateDays = userLogs.filter(l => l.status === "late").length;
    const totalHours = userLogs.reduce((sum, l) => sum + parseFloat(l.hoursWorked ?? "0"), 0);
    const rate = parseFloat(user.hourlyRate);
    const totalCost = (totalHours * rate).toFixed(2);

    return {
      userId: user.id,
      userName: user.name,
      employeeId: user.employeeId ?? null,
      department: user.departmentId ? (deptMap.get(user.departmentId) ?? null) : null,
      totalDays: userLogs.length,
      presentDays,
      absentDays,
      lateDays,
      totalHours: totalHours.toFixed(2),
      totalCost,
      hourlyRate: user.hourlyRate,
    };
  });

  const totalManHours = items.reduce((s, i) => s + parseFloat(i.totalHours), 0).toFixed(2);
  const totalCost = items.reduce((s, i) => s + parseFloat(i.totalCost), 0).toFixed(2);

  res.json(GetAttendanceSummaryResponse.parse({ items, startDate, endDate, totalManHours, totalCost }));
});

router.get("/attendance/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [log] = await db.select().from(attendanceLogsTable).where(eq(attendanceLogsTable.id, params.data.id));
  if (!log) {
    res.status(404).json({ error: "Attendance record not found" });
    return;
  }

  const jwtUser = req.user!;
  if (isRestrictedRole(jwtUser.role) && log.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetAttendanceResponse.parse(mapLog(log)));
});

router.post("/attendance", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const parsed = CreateAttendanceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const status: AttendanceStatus = (parsed.data.status as AttendanceStatus) ?? "present";

  const [log] = await db.insert(attendanceLogsTable).values({
    userId: parsed.data.userId,
    date: parsed.data.date,
    status,
    checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : null,
    checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : null,
    notes: parsed.data.notes ?? null,
    isManualEntry: parsed.data.isManualEntry ?? "true",
  }).returning();

  res.status(201).json(GetAttendanceResponse.parse(mapLog(log)));
});

router.patch("/attendance/:id", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const params = UpdateAttendanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateAttendanceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof attendanceLogsTable.$inferInsert> = {};
  if (body.data.status) updateData.status = body.data.status as AttendanceStatus;
  if (body.data.checkIn) updateData.checkIn = new Date(body.data.checkIn);
  if (body.data.checkOut) updateData.checkOut = new Date(body.data.checkOut);
  if (body.data.notes) updateData.notes = body.data.notes;
  if (body.data.hoursWorked) updateData.hoursWorked = body.data.hoursWorked;

  const [log] = await db.update(attendanceLogsTable)
    .set(updateData)
    .where(eq(attendanceLogsTable.id, params.data.id))
    .returning();

  if (!log) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  res.json(UpdateAttendanceResponse.parse(mapLog(log)));
});

export default router;
