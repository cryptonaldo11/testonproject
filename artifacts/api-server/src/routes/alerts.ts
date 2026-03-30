import { Router, type IRouter, type Request, type Response } from "express";
import { db, alertsTable, type AlertType, type AlertSeverity, type AlertStatus } from "@workspace/db";
import { eq, and, SQL, inArray, isNull, or } from "drizzle-orm";
import {
  ListAlertsQueryParams,
  ListAlertsResponse,
  CreateAlertBody,
  UpdateAlertParams,
  UpdateAlertBody,
  UpdateAlertResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, getScopedUserIds, canResolveAlerts, canAssignAlerts } from "../lib/auth";
import {
  assertAssignableTargetInScope,
  assertMentionTargetsInScope,
  createComment,
  createHandoff,
  listComments,
  listHandoffs,
  mapComment,
  mapHandoff,
} from "../lib/collaboration";

const router: IRouter = Router();

function mapAlert(a: typeof alertsTable.$inferSelect) {
  return {
    id: a.id,
    userId: a.userId ?? null,
    alertType: a.alertType,
    severity: a.severity,
    title: a.title,
    message: a.message,
    status: a.status,
    relatedDate: a.relatedDate ?? null,
    assignedTo: a.assignedTo ?? null,
    assignedBy: a.assignedBy ?? null,
    assignedAt: a.assignedAt ?? null,
    resolvedBy: a.resolvedBy ?? null,
    resolvedAt: a.resolvedAt ?? null,
    resolutionNotes: a.resolutionNotes ?? null,
    dismissedBy: a.dismissedBy ?? null,
    dismissedAt: a.dismissedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

async function getAccessibleAlertOrRespond(req: Request, res: Response, id: number) {
  const [existing] = await db.select().from(alertsTable).where(eq(alertsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Alert not found" });
    return null;
  }

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser, existing.userId ?? undefined);
  const canAccessAlert = existing.userId === null
    ? canResolveAlerts(jwtUser.role) || canAssignAlerts(jwtUser.role)
    : scopedUserIds === null || scopedUserIds.length > 0;

  if (!canAccessAlert) {
    res.status(403).json({ error: "Forbidden: cannot access alert outside your scope" });
    return null;
  }

  return existing;
}

router.get("/alerts", requireAuth, async (req, res): Promise<void> => {
  const params = ListAlertsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser, params.data.userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json(ListAlertsResponse.parse({ alerts: [], total: 0 }));
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(or(inArray(alertsTable.userId, scopedUserIds), isNull(alertsTable.userId))!);
  }

  if (params.data.alertType) {
    conditions.push(eq(alertsTable.alertType, params.data.alertType as AlertType));
  }
  if (params.data.status) {
    conditions.push(eq(alertsTable.status, params.data.status as AlertStatus));
  }
  if (params.data.severity) {
    conditions.push(eq(alertsTable.severity, params.data.severity as AlertSeverity));
  }
  if (params.data.assignedTo !== undefined) {
    conditions.push(eq(alertsTable.assignedTo, params.data.assignedTo));
  }

  const alerts = await db.select().from(alertsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(alertsTable.createdAt);

  res.json(ListAlertsResponse.parse({ alerts: alerts.map(mapAlert), total: alerts.length }));
});

router.get("/alerts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const alert = await getAccessibleAlertOrRespond(req, res, id);
  if (!alert) return;

  const comments = await listComments("alert", alert.id);
  res.json({ comments: comments.map(mapComment), total: comments.length });
});

router.post("/alerts/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const alert = await getAccessibleAlertOrRespond(req, res, id);
  if (!alert) return;

  const commentBody = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  const mentionedUserIds = Array.isArray(req.body?.mentionedUserIds)
    ? req.body.mentionedUserIds.filter((value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0)
    : [];

  if (!commentBody) {
    res.status(400).json({ error: "Comment body is required" });
    return;
  }

  if (!(await assertMentionTargetsInScope(req.user!, mentionedUserIds))) {
    res.status(403).json({ error: "Forbidden: cannot mention users outside your scope" });
    return;
  }

  const comment = await createComment({
    workflowType: "alert",
    recordId: alert.id,
    authorId: req.user!.userId,
    body: commentBody,
    mentionedUserIds,
  });

  res.status(201).json(mapComment(comment));
});

router.get("/alerts/:id/handoffs", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const alert = await getAccessibleAlertOrRespond(req, res, id);
  if (!alert) return;

  const handoffs = await listHandoffs("alert", alert.id);
  res.json({ handoffs: handoffs.map(mapHandoff), total: handoffs.length });
});

router.post("/alerts", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [alert] = await db.insert(alertsTable).values({
    userId: parsed.data.userId ?? null,
    alertType: parsed.data.alertType as AlertType,
    severity: (parsed.data.severity as AlertSeverity) ?? "warning",
    title: parsed.data.title,
    message: parsed.data.message,
    relatedDate: parsed.data.relatedDate ?? null,
    status: "new",
  }).returning();

  res.status(201).json(mapAlert(alert));
});

router.patch("/alerts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdateAlertParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateAlertBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const jwtUser = req.user!;

  const [existing] = await db.select().from(alertsTable).where(eq(alertsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser, existing.userId ?? undefined);
  const canAccessAlert = existing.userId === null
    ? canResolveAlerts(jwtUser.role)
    : scopedUserIds === null || scopedUserIds.length > 0;

  if (!canAccessAlert) {
    res.status(403).json({ error: "Forbidden: cannot modify alert outside your scope" });
    return;
  }

  if (!canResolveAlerts(jwtUser.role)) {
    if (existing.userId !== jwtUser.userId) {
      res.status(403).json({ error: "Forbidden: cannot modify another user's alert" });
      return;
    }
    if (body.data.status === "resolved") {
      res.status(403).json({ error: "Forbidden: only HR or admin can resolve alerts" });
      return;
    }
  }

  const updateData: Partial<typeof alertsTable.$inferInsert> = {};
  if (body.data.status) updateData.status = body.data.status as AlertStatus;
  if (body.data.resolutionNotes) updateData.resolutionNotes = body.data.resolutionNotes;

  if (body.data.status === "resolved") {
    updateData.resolvedBy = jwtUser.userId;
    updateData.resolvedAt = new Date();
  }

  if (body.data.status === "dismissed") {
    updateData.dismissedBy = jwtUser.userId;
    updateData.dismissedAt = new Date();
  }

  if (body.data.assignedTo !== undefined) {
    if (!canAssignAlerts(jwtUser.role)) {
      res.status(403).json({ error: "Forbidden: cannot assign alerts" });
      return;
    }
    if (!(await assertAssignableTargetInScope(jwtUser, body.data.assignedTo))) {
      res.status(403).json({ error: "Forbidden: cannot assign alerts outside your scope" });
      return;
    }
    updateData.assignedTo = body.data.assignedTo;
    updateData.assignedBy = jwtUser.userId;
    updateData.assignedAt = new Date();
  }

  const [alert] = await db.update(alertsTable)
    .set(updateData)
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  if (body.data.assignedTo !== undefined && body.data.assignedTo !== existing.assignedTo) {
    await createHandoff({
      workflowType: "alert",
      recordId: existing.id,
      fromUserId: existing.assignedTo ?? null,
      toUserId: body.data.assignedTo,
      handedOffBy: jwtUser.userId,
      note: typeof req.body?.handoffNote === "string" ? req.body.handoffNote.trim() || undefined : undefined,
    });
  }

  res.json(UpdateAlertResponse.parse(mapAlert(alert)));
});

export default router;
