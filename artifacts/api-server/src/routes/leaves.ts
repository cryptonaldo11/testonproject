import { Router, type IRouter } from "express";
import { db, leaveApplicationsTable, type LeaveType, type LeaveStatus } from "@workspace/db";
import { eq, and, gte, lte, SQL, inArray } from "drizzle-orm";
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
import { requireAuth, getScopedUserIds, canAccessUserId, canReviewLeaves } from "../lib/auth";
import { recalculateProductivityForDateRange } from "../lib/productivity";
import { classifyLeaveReason } from "../lib/leaveClassification";

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

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser, params.data.userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json(ListLeavesResponse.parse({ leaves: [], total: 0 }));
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(leaveApplicationsTable.userId, scopedUserIds));
  }

  if (params.data.status) {
    conditions.push(eq(leaveApplicationsTable.status, params.data.status as LeaveStatus));
  }
  if (params.data.leaveType) {
    conditions.push(eq(leaveApplicationsTable.leaveType, params.data.leaveType as LeaveType));
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

  const jwtUser = req.user!;

  if (!["admin", "hr"].includes(jwtUser.role) && parsed.data.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only apply leave for yourself" });
    return;
  }

  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const aiResult = classifyLeaveReason(parsed.data.reason);

  const [leave] = await db.insert(leaveApplicationsTable).values({
    userId: parsed.data.userId,
    leaveType: parsed.data.leaveType as LeaveType,
    startDate: parsed.data.startDate,
    endDate: parsed.data.endDate,
    totalDays: String(totalDays),
    reason: parsed.data.reason,
    status: "pending",
    aiClassification: aiResult.classification,
    aiConfidence: aiResult.confidence,
  }).returning();

  res.status(201).json(GetLeaveResponse.parse(mapLeave(leave)));
});

router.get("/leaves/balance/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = GetLeaveBalanceParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, params.data.userId))) {
    res.status(403).json({ error: "Forbidden: can only view leave balances within your scope" });
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

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, leave.userId))) {
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

  const jwtUser = req.user!;

  const [existing] = await db.select().from(leaveApplicationsTable).where(eq(leaveApplicationsTable.id, params.data.id));
  if (!existing) {
    res.status(404).json({ error: "Leave not found" });
    return;
  }

  // Workers/drivers can only cancel their own pending leave; cannot approve or reject
  if (!(await canAccessUserId(jwtUser, existing.userId))) {
    res.status(403).json({ error: "Forbidden: cannot modify leave outside your scope" });
    return;
  }

  if (!canReviewLeaves(jwtUser.role) && (body.data.status === "approved" || body.data.status === "rejected")) {
    res.status(403).json({ error: "Forbidden: only HR or admin can approve or reject leave" });
    return;
  }

  if (!canReviewLeaves(jwtUser.role) && existing.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: cannot modify another user's leave" });
    return;
  }

  const updateData: Partial<typeof leaveApplicationsTable.$inferInsert> = {};
  if (body.data.status) updateData.status = body.data.status as LeaveStatus;
  if (body.data.reviewNotes !== undefined) updateData.reviewNotes = body.data.reviewNotes;

  if (body.data.status === "approved" || body.data.status === "rejected") {
    updateData.reviewedBy = jwtUser.userId;
    updateData.reviewedAt = new Date();
  }

  const [leave] = await db.update(leaveApplicationsTable)
    .set(updateData)
    .where(eq(leaveApplicationsTable.id, params.data.id))
    .returning();

  const wasApproved = existing.status === "approved";
  const isApproved = leave.status === "approved";

  if (wasApproved !== isApproved) {
    try {
      await recalculateProductivityForDateRange(leave.userId, leave.startDate, leave.endDate);
    } catch (error) {
      console.error("Failed to recalculate productivity after leave status change", {
        userId: leave.userId,
        leaveId: leave.id,
        startDate: leave.startDate,
        endDate: leave.endDate,
        previousStatus: existing.status,
        nextStatus: leave.status,
        error,
      });
    }
  }

  res.json(UpdateLeaveResponse.parse(mapLeave(leave)));
});

export default router;
