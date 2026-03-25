import { Router, type IRouter } from "express";
import { db, alertsTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListAlertsQueryParams,
  ListAlertsResponse,
  CreateAlertBody,
  UpdateAlertParams,
  UpdateAlertBody,
  UpdateAlertResponse,
} from "@workspace/api-zod";
import { requireAuth, type JWTPayload } from "../lib/auth";

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
    resolvedBy: a.resolvedBy ?? null,
    resolvedAt: a.resolvedAt ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

router.get("/alerts", requireAuth, async (req, res): Promise<void> => {
  const params = ListAlertsQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;
  const conditions: SQL[] = [];

  if (jwtUser.role === "worker" || jwtUser.role === "driver") {
    conditions.push(eq(alertsTable.userId, jwtUser.userId));
  } else if (params.data.userId) {
    conditions.push(eq(alertsTable.userId, params.data.userId));
  }

  if (params.data.alertType) {
    conditions.push(eq(alertsTable.alertType, params.data.alertType as any));
  }
  if (params.data.status) {
    conditions.push(eq(alertsTable.status, params.data.status as any));
  }
  if (params.data.severity) {
    conditions.push(eq(alertsTable.severity, params.data.severity as any));
  }

  const alerts = await db.select().from(alertsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(alertsTable.createdAt);

  res.json(ListAlertsResponse.parse({ alerts: alerts.map(mapAlert), total: alerts.length }));
});

router.post("/alerts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateAlertBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [alert] = await db.insert(alertsTable).values({
    userId: parsed.data.userId ?? null,
    alertType: parsed.data.alertType as any,
    severity: (parsed.data.severity as any) ?? "warning",
    title: parsed.data.title,
    message: parsed.data.message,
    relatedDate: parsed.data.relatedDate ?? null,
    status: "active",
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

  const jwtUser = (req as any).user as JWTPayload;
  const updateData: Record<string, any> = { ...body.data };

  if (body.data.status === "resolved") {
    updateData.resolvedBy = jwtUser.userId;
    updateData.resolvedAt = new Date();
  }

  const [alert] = await db.update(alertsTable)
    .set(updateData)
    .where(eq(alertsTable.id, params.data.id))
    .returning();

  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }

  res.json(UpdateAlertResponse.parse(mapAlert(alert)));
});

export default router;
