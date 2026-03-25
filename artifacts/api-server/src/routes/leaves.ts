import { Router, type IRouter } from "express";
import { db, leaveApplicationsTable } from "@workspace/db";
import { eq, and, gte, lte, SQL } from "drizzle-orm";
import {
  ListLeavesQueryParams,
  ListLeavesResponse,
  CreateLeaveBody,
  GetLeaveParams,
  GetLeaveResponse,
  UpdateLeaveParams,
  UpdateLeaveBody,
  UpdateLeaveResponse,
  GetLeaveBalanceParams,
  GetLeaveBalanceQueryParams,
  GetLeaveBalanceResponse,
} from "@workspace/api-zod";
import { requireAuth, type JWTPayload } from "../lib/auth";

const ANNUAL_LEAVE_TOTAL = 21;
const MEDICAL_LEAVE_TOTAL = 14;

const router: IRouter = Router();

function mapLeave(l: typeof leaveApplicationsTable.$inferSelect) {
  return {
    id: l.id,
    userId: l.userId,
    leaveType: l.leaveType,
    startDate: l.startDate,
    endDate: l.endDate,
    totalDays: l.totalDays,
    reason: l.reason,
    status: l.status,
    reviewedBy: l.reviewedBy ?? null,
    reviewedAt: l.reviewedAt ?? null,
    reviewNotes: l.reviewNotes ?? null,
    aiClassification: l.aiClassification ?? null,
    aiConfidence: l.aiConfidence ?? null,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/leaves", requireAuth, async (req, res): Promise<void> => {
  const params = ListLeavesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;
  const conditions: SQL[] = [];

  if (jwtUser.role === "worker" || jwtUser.role === "driver") {
    conditions.push(eq(leaveApplicationsTable.userId, jwtUser.userId));
  } else if (params.data.userId) {
    conditions.push(eq(leaveApplicationsTable.userId, params.data.userId));
  }

  if (params.data.status) {
    conditions.push(eq(leaveApplicationsTable.status, params.data.status as any));
  }
  if (params.data.leaveType) {
    conditions.push(eq(leaveApplicationsTable.leaveType, params.data.leaveType as any));
  }
  if (params.data.startDate) {
    conditions.push(gte(leaveApplicationsTable.startDate, params.data.startDate));
  }
  if (params.data.endDate) {
    conditions.push(lte(leaveApplicationsTable.endDate, params.data.endDate));
  }

  const leaves = await db.select().from(leaveApplicationsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(leaveApplicationsTable.createdAt);

  res.json(ListLeavesResponse.parse({ leaves: leaves.map(mapLeave), total: leaves.length }));
});

router.post("/leaves", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateLeaveBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const [leave] = await db.insert(leaveApplicationsTable).values({
    userId: parsed.data.userId,
    leaveType: parsed.data.leaveType as any,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    totalDays: String(totalDays),
    reason: parsed.data.reason,
    status: "pending",
  }).returning();

  res.status(201).json(GetLeaveResponse.parse(mapLeave(leave)));
});

router.get("/leaves/balance/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeaveBalanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const query = GetLeaveBalanceQueryParams.safeParse(req.query);
  const year = query.success && query.data.year ? query.data.year : new Date().getFullYear();

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const leaves = await db.select().from(leaveApplicationsTable)
    .where(and(
      eq(leaveApplicationsTable.userId, params.data.userId),
      eq(leaveApplicationsTable.status, "approved"),
      gte(leaveApplicationsTable.startDate, yearStart),
      lte(leaveApplicationsTable.endDate, yearEnd),
    ));

  const annualLeaveUsed = leaves
    .filter(l => l.leaveType === "annual")
    .reduce((s, l) => s + parseFloat(l.totalDays), 0);

  const medicalLeaveUsed = leaves
    .filter(l => l.leaveType === "medical")
    .reduce((s, l) => s + parseFloat(l.totalDays), 0);

  res.json(GetLeaveBalanceResponse.parse({
    userId: params.data.userId,
    year,
    annualLeaveUsed,
    annualLeaveTotal: ANNUAL_LEAVE_TOTAL,
    annualLeaveRemaining: Math.max(0, ANNUAL_LEAVE_TOTAL - annualLeaveUsed),
    medicalLeaveUsed,
    medicalLeaveTotal: MEDICAL_LEAVE_TOTAL,
    medicalLeaveRemaining: Math.max(0, MEDICAL_LEAVE_TOTAL - medicalLeaveUsed),
  }));
});

router.get("/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeaveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [leave] = await db.select().from(leaveApplicationsTable).where(eq(leaveApplicationsTable.id, params.data.id));
  if (!leave) {
    res.status(404).json({ error: "Leave not found" });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;
  if ((jwtUser.role === "worker" || jwtUser.role === "driver") && leave.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetLeaveResponse.parse(mapLeave(leave)));
});

router.patch("/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateLeaveParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateLeaveBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;

  const [existing] = await db.select().from(leaveApplicationsTable).where(eq(leaveApplicationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Leave not found" });
    return;
  }

  if (jwtUser.role === "worker" || jwtUser.role === "driver") {
    if (existing.userId !== jwtUser.userId || body.data.status === "approved" || body.data.status === "rejected") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }

  const updateData: Record<string, any> = { ...body.data };
  if (body.data.status === "approved" || body.data.status === "rejected") {
    updateData.reviewedBy = jwtUser.userId;
    updateData.reviewedAt = new Date();
  }

  const [leave] = await db.update(leaveApplicationsTable)
    .set(updateData)
    .where(eq(leaveApplicationsTable.id, params.data.id))
    .returning();

  res.json(UpdateLeaveResponse.parse(mapLeave(leave)));
});

export default router;
