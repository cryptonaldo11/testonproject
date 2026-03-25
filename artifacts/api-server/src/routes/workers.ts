import { Router, type IRouter } from "express";
import { db, workersTable, type WorkerStatus } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import { requireAuth, requireRole, isRestrictedRole } from "../lib/auth";

const router: IRouter = Router();

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
  const conditions: SQL[] = [];

  if (isRestrictedRole(jwtUser.role)) {
    conditions.push(eq(workersTable.userId, jwtUser.userId));
  } else {
    const departmentId = req.query.departmentId ? parseInt(req.query.departmentId as string, 10) : undefined;
    const status = req.query.status as WorkerStatus | undefined;
    if (departmentId && !isNaN(departmentId)) {
      conditions.push(eq(workersTable.departmentId, departmentId));
    }
    if (status) {
      conditions.push(eq(workersTable.status, status));
    }
  }

  const workers = await db.select().from(workersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json({ workers: workers.map(mapWorker), total: workers.length });
});

router.post("/workers", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const body = req.body as {
    userId?: number;
    departmentId?: number;
    employeeId?: string;
    jobTitle?: string;
    workLocation?: string;
    contractType?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };

  if (!body.userId || typeof body.userId !== "number") {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const [worker] = await db.insert(workersTable).values({
    userId: body.userId,
    departmentId: body.departmentId ?? null,
    employeeId: body.employeeId ?? null,
    jobTitle: body.jobTitle ?? null,
    workLocation: body.workLocation ?? null,
    contractType: body.contractType ?? "full_time",
    status: (body.status as WorkerStatus) ?? "active",
    startDate: body.startDate ?? null,
    endDate: body.endDate ?? null,
  }).returning();

  res.status(201).json(mapWorker(worker));
});

router.get("/workers/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
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
  if (isRestrictedRole(jwtUser.role) && worker.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(mapWorker(worker));
});

router.patch("/workers/:id", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const body = req.body as {
    departmentId?: number;
    jobTitle?: string;
    workLocation?: string;
    contractType?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
  };

  const updateData: Partial<typeof workersTable.$inferInsert> = {};
  if (body.departmentId !== undefined) updateData.departmentId = body.departmentId;
  if (body.jobTitle !== undefined) updateData.jobTitle = body.jobTitle;
  if (body.workLocation !== undefined) updateData.workLocation = body.workLocation;
  if (body.contractType !== undefined) updateData.contractType = body.contractType;
  if (body.status !== undefined) updateData.status = body.status as WorkerStatus;
  if (body.startDate !== undefined) updateData.startDate = body.startDate;
  if (body.endDate !== undefined) updateData.endDate = body.endDate;

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

export default router;
