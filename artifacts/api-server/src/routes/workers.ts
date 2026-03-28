import { Router, type IRouter } from "express";
import { db, workersTable, insertWorkerSchema, type WorkerStatus } from "@workspace/db";
import { eq, and, SQL, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole, getScopedUserIds, canAccessUserId } from "../lib/auth";
import { RegisterFaceBody, RegisterFaceParams } from "@workspace/api-zod";

const router: IRouter = Router();

const createWorkerBodySchema = insertWorkerSchema.pick({
  userId: true,
  departmentId: true,
  employeeId: true,
  jobTitle: true,
  workLocation: true,
  contractType: true,
  status: true,
  startDate: true,
  endDate: true,
});

const updateWorkerBodySchema = insertWorkerSchema.pick({
  departmentId: true,
  jobTitle: true,
  workLocation: true,
  contractType: true,
  status: true,
  startDate: true,
  endDate: true,
}).partial();

function mapWorker(w: typeof workersTable.$inferSelect) {
  return {
    id: w.id,
    userId: w.userId,
    departmentId: w.departmentId ?? null,
    employeeId: w.employeeId ?? null,
    jobTitle: w.jobTitle ?? null,
    workLocation: w.workLocation ?? null,
    contractType: w.contractType ?? null,
    status: w.status,
    startDate: w.startDate ?? null,
    endDate: w.endDate ?? null,
    hasFaceRegistered: !!w.faceDescriptor,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
  };
}

router.get("/workers", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  const requestedUserId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const scopedUserIds = await getScopedUserIds(jwtUser, requestedUserId);

  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json({ workers: [], total: 0 });
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(workersTable.userId, scopedUserIds));
  }

  const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string, 10) : undefined;
  const status = req.query.status as WorkerStatus | undefined;
  if (departmentId && !isNaN(departmentId)) {
    conditions.push(eq(workersTable.departmentId, departmentId));
  }
  if (status) {
    conditions.push(eq(workersTable.status, status));
  }

  const workers = await db.select().from(workersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({ workers: workers.map(mapWorker), total: workers.length });
});

router.post("/workers", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const parsed = createWorkerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  const [worker] = await db.insert(workersTable).values({
    userId: parsed.data.userId,
    departmentId: parsed.data.departmentId ?? null,
    employeeId: parsed.data.employeeId ?? null,
    jobTitle: parsed.data.jobTitle ?? null,
    workLocation: parsed.data.workLocation ?? null,
    contractType: parsed.data.contractType ?? "full_time",
    status: (parsed.data.status as WorkerStatus) ?? "active",
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
  }).returning();

  res.status(201).json(mapWorker(worker));
});

router.get("/workers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [worker] = await db.select().from(workersTable).where(eq(workersTable.id, id));
  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, worker.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(mapWorker(worker));
});

router.patch("/workers/:id", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = updateWorkerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  const updateData: Partial<typeof workersTable.$inferInsert> = {};
  if (parsed.data.departmentId !== undefined) updateData.departmentId = parsed.data.departmentId;
  if (parsed.data.jobTitle !== undefined) updateData.jobTitle = parsed.data.jobTitle;
  if (parsed.data.workLocation !== undefined) updateData.workLocation = parsed.data.workLocation;
  if (parsed.data.contractType !== undefined) updateData.contractType = parsed.data.contractType;
  if (parsed.data.status !== undefined) updateData.status = parsed.data.status as WorkerStatus;
  if (parsed.data.startDate !== undefined) updateData.startDate = parsed.data.startDate;
  if (parsed.data.endDate !== undefined) updateData.endDate = parsed.data.endDate;

  const [worker] = await db.update(workersTable)
    .set(updateData)
    .where(eq(workersTable.id, id))
    .returning();

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(mapWorker(worker));
});

/**
 * GET /workers/me/face-descriptor
 * Returns the logged-in worker's registered face descriptor (their own only).
 * Used by the check-in page for client-side face matching.
 */
router.get("/workers/me/face-descriptor", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  const [worker] = await db.select().from(workersTable).where(eq(workersTable.userId, jwtUser.userId));
  if (!worker) {
    res.status(404).json({ error: "Worker profile not found" });
    return;
  }
  if (!worker.faceDescriptor) {
    res.json({ registered: false, descriptor: null });
    return;
  }
  res.json({ registered: true, descriptor: worker.faceDescriptor });
});

router.post("/workers/:workerId/face", requireAuth, requireRole("admin", "hr"), async (req, res) => {
  const params = RegisterFaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid workerId" });
    return;
  }

  const body = RegisterFaceBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [worker] = await db
    .update(workersTable)
    .set({ faceDescriptor: body.data.faceDescriptor })
    .where(eq(workersTable.id, params.data.workerId))
    .returning();

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(mapWorker(worker));
});

router.delete("/workers/:workerId/face", requireAuth, requireRole("admin", "hr"), async (req, res) => {
  const params = RegisterFaceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid workerId" });
    return;
  }

  const [worker] = await db
    .update(workersTable)
    .set({ faceDescriptor: null })
    .where(eq(workersTable.id, params.data.workerId))
    .returning();

  if (!worker) {
    res.status(404).json({ error: "Worker not found" });
    return;
  }

  res.json(mapWorker(worker));
});

export default router;
