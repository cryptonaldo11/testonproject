import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  interventionsTable,
  type InterventionIssueType,
  type InterventionStatus,
} from "../../../../lib/db/src/schema/interventions";
import { requireAuth, canManageInterventions, getScopedUserIds } from "../lib/auth";

const router: IRouter = Router();

function mapIntervention(row: typeof interventionsTable.$inferSelect) {
  return {
    id: row.id,
    userId: row.workerUserId,
    ownerId: row.ownerUserId,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy ?? null,
    relatedAlertId: row.linkedAlertId ?? null,
    relatedAttendanceExceptionId: null,
    type: "coaching",
    issueType: row.issueType,
    status: row.status,
    title: row.summary,
    actionPlan: row.agreedAction ?? "",
    notes: row.outcomeNotes ?? null,
    dueDate: row.followUpDueAt?.toISOString().slice(0, 10) ?? null,
    completedAt: row.followUpCompletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/interventions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canManageInterventions(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser);
  const conditions = [] as any[];

  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) {
      res.json({ interventions: [], total: 0 });
      return;
    }
    conditions.push(inArray(interventionsTable.workerUserId, scopedUserIds));
  }

  const userId = req.query.userId ? Number(req.query.userId) : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const relatedAlertId = req.query.relatedAlertId ? Number(req.query.relatedAlertId) : undefined;

  if (userId) conditions.push(eq(interventionsTable.workerUserId, userId));
  if (status) conditions.push(eq(interventionsTable.status, status as InterventionStatus));
  if (relatedAlertId) conditions.push(eq(interventionsTable.linkedAlertId, relatedAlertId));

  const interventions = await db
    .select()
    .from(interventionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(interventionsTable.createdAt));

  res.json({ interventions: interventions.map(mapIntervention), total: interventions.length });
});

router.post("/interventions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canManageInterventions(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser);
  const {
    userId,
    ownerId,
    relatedAlertId,
    issueType,
    status,
    title,
    actionPlan,
    notes,
    dueDate,
  } = req.body ?? {};

  if (!userId || !ownerId || !title || !actionPlan) {
    res.status(400).json({ error: "userId, ownerId, title, and actionPlan are required" });
    return;
  }

  if (scopedUserIds !== null && (!scopedUserIds.includes(Number(userId)) || !scopedUserIds.includes(Number(ownerId)))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [created] = await db.insert(interventionsTable).values({
    workerUserId: Number(userId),
    ownerUserId: Number(ownerId),
    createdBy: jwtUser.userId,
    updatedBy: jwtUser.userId,
    linkedAlertId: relatedAlertId ? Number(relatedAlertId) : null,
    issueType: (issueType ?? "other") as InterventionIssueType,
    status: (status ?? "open") as InterventionStatus,
    summary: String(title),
    agreedAction: String(actionPlan),
    outcomeNotes: notes ? String(notes) : null,
    followUpDueAt: dueDate ? new Date(`${String(dueDate)}T00:00:00.000Z`) : null,
  }).returning();

  res.status(201).json(mapIntervention(created));
});

router.get("/interventions/:id", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canManageInterventions(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Number(req.params.id);
  const [record] = await db.select().from(interventionsTable).where(eq(interventionsTable.id, id));
  if (!record) {
    res.status(404).json({ error: "Intervention not found" });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser);
  if (scopedUserIds !== null && !scopedUserIds.includes(record.workerUserId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(mapIntervention(record));
});

router.patch("/interventions/:id", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canManageInterventions(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const id = Number(req.params.id);
  const [existing] = await db.select().from(interventionsTable).where(eq(interventionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Intervention not found" });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser);
  if (scopedUserIds !== null && !scopedUserIds.includes(existing.workerUserId)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const body = req.body ?? {};
  const nextStatus = (body.status ?? existing.status) as InterventionStatus;
  const [updated] = await db.update(interventionsTable).set({
    ownerUserId: body.ownerId ? Number(body.ownerId) : existing.ownerUserId,
    linkedAlertId: body.relatedAlertId !== undefined ? (body.relatedAlertId ? Number(body.relatedAlertId) : null) : existing.linkedAlertId,
    issueType: (body.issueType ?? existing.issueType) as InterventionIssueType,
    status: nextStatus,
    summary: body.title ?? existing.summary,
    agreedAction: body.actionPlan ?? existing.agreedAction,
    outcomeNotes: body.notes !== undefined ? (body.notes ? String(body.notes) : null) : existing.outcomeNotes,
    followUpDueAt: body.dueDate !== undefined ? (body.dueDate ? new Date(`${String(body.dueDate)}T00:00:00.000Z`) : null) : existing.followUpDueAt,
    followUpCompletedAt: nextStatus === "completed" ? new Date() : null,
    updatedBy: jwtUser.userId,
  }).where(eq(interventionsTable.id, id)).returning();

  res.json(mapIntervention(updated));
});

export default router;
