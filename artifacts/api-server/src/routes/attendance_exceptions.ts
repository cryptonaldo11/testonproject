import { Router, type IRouter } from "express";
import { db, attendanceExceptionsTable, type AttendanceExceptionStatus, type AttendanceExceptionType } from "@workspace/db";
import { eq, and, SQL, inArray } from "drizzle-orm";
import { requireAuth, requireRole, getScopedUserIds, canReviewExceptions, canAccessUserId } from "../lib/auth";

const router: IRouter = Router();

function mapException(e: typeof attendanceExceptionsTable.$inferSelect) {
  return {
    id: e.id,
    userId: e.userId,
    attendanceLogId: e.attendanceLogId ?? null,
    exceptionType: e.exceptionType,
    status: e.status,
    requestedBy: e.requestedBy,
    reviewedBy: e.reviewedBy ?? null,
    reviewedAt: e.reviewedAt ?? null,
    reason: e.reason,
    reviewNotes: e.reviewNotes ?? null,
    evidenceUrl: e.evidenceUrl ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

// List attendance exceptions with scoping
router.get("/attendance-exceptions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

  // Parse query params
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const status = req.query.status as string | undefined;
  const exceptionType = req.query.exceptionType as string | undefined;

  const scopedUserIds = await getScopedUserIds(jwtUser, userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json({ exceptions: [], total: 0 });
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(attendanceExceptionsTable.userId, scopedUserIds));
  }

  if (status) {
    conditions.push(eq(attendanceExceptionsTable.status, status as AttendanceExceptionStatus));
  }
  if (exceptionType) {
    conditions.push(eq(attendanceExceptionsTable.exceptionType, exceptionType as AttendanceExceptionType));
  }

  const exceptions = await db.select().from(attendanceExceptionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(attendanceExceptionsTable.createdAt);

  res.json({ exceptions: exceptions.map(mapException), total: exceptions.length });
});

// Create attendance exception (worker self-service or admin/hr on behalf)
router.post("/attendance-exceptions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

  const { userId, attendanceLogId, exceptionType, reason, evidenceUrl } = req.body;

  if (!userId || !exceptionType || !reason) {
    res.status(400).json({ error: "userId, exceptionType, and reason are required" });
    return;
  }

  // Workers can only create exceptions for themselves
  if (!["admin", "hr"].includes(jwtUser.role) && userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only create exceptions for yourself" });
    return;
  }

  // Validate exception type
  const validTypes = ["missed_checkout", "camera_unavailable", "face_mismatch", "manual_correction", "dispute"];
  if (!validTypes.includes(exceptionType)) {
    res.status(400).json({ error: `Invalid exceptionType. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const [exception] = await db.insert(attendanceExceptionsTable).values({
    userId,
    attendanceLogId: attendanceLogId ?? null,
    exceptionType: exceptionType as AttendanceExceptionType,
    status: "open",
    requestedBy: jwtUser.userId,
    reason,
    evidenceUrl: evidenceUrl ?? null,
  }).returning();

  res.status(201).json(mapException(exception));
});

// Get single attendance exception
router.get("/attendance-exceptions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [exception] = await db.select().from(attendanceExceptionsTable).where(eq(attendanceExceptionsTable.id, id));
  if (!exception) {
    res.status(404).json({ error: "Exception not found" });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, exception.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(mapException(exception));
});

// Review/update attendance exception (manager/HR/admin only)
router.patch("/attendance-exceptions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const jwtUser = req.user!;

  const [existing] = await db.select().from(attendanceExceptionsTable).where(eq(attendanceExceptionsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Exception not found" });
    return;
  }

  // Check access scope
  if (!(await canAccessUserId(jwtUser, existing.userId))) {
    res.status(403).json({ error: "Forbidden: cannot access this exception" });
    return;
  }

  const { status, reviewNotes } = req.body;

  // Only reviewers (manager/HR/admin) can change status beyond certain transitions
  const allowedStatuses = ["under_review", "approved", "rejected", "escalated"];
  if (status && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` });
    return;
  }

  // Workers can only escalate their own exceptions
  if (!canReviewExceptions(jwtUser.role)) {
    if (existing.requestedBy !== jwtUser.userId) {
      res.status(403).json({ error: "Forbidden: cannot modify another user's exception" });
      return;
    }
    if (status && status !== "escalated") {
      res.status(403).json({ error: "Forbidden: workers can only escalate exceptions" });
      return;
    }
  }

  const updateData: Partial<typeof attendanceExceptionsTable.$inferInsert> = {};
  if (status) {
    updateData.status = status as AttendanceExceptionStatus;
    // Stamp reviewer when status changes to a final state
    if (["approved", "rejected"].includes(status)) {
      updateData.reviewedBy = jwtUser.userId;
      updateData.reviewedAt = new Date();
    }
  }
  if (reviewNotes !== undefined) {
    updateData.reviewNotes = reviewNotes;
  }

  const [exception] = await db.update(attendanceExceptionsTable)
    .set(updateData)
    .where(eq(attendanceExceptionsTable.id, id))
    .returning();

  res.json(mapException(exception));
});

export default router;
