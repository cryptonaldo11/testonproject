import { Router, type IRouter, type Request, type Response } from "express";
import { db, attendanceExceptionsTable, type AttendanceExceptionStatus, type AttendanceExceptionType } from "@workspace/db";
import { eq, and, SQL, inArray } from "drizzle-orm";
import { requireAuth, getScopedUserIds, canReviewExceptions, canAccessUserId } from "../lib/auth";
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

function mapException(e: typeof attendanceExceptionsTable.$inferSelect) {
  return {
    id: e.id,
    userId: e.userId,
    attendanceLogId: e.attendanceLogId ?? null,
    exceptionType: e.exceptionType,
    status: e.status,
    requestedBy: e.requestedBy,
    assignedTo: e.assignedTo ?? null,
    assignedBy: e.assignedBy ?? null,
    assignedAt: e.assignedAt ?? null,
    reviewedBy: e.reviewedBy ?? null,
    reviewedAt: e.reviewedAt ?? null,
    reason: e.reason,
    reviewNotes: e.reviewNotes ?? null,
    evidenceUrl: e.evidenceUrl ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

async function getAccessibleExceptionOrRespond(req: Request, res: Response, id: number) {
  const [exception] = await db.select().from(attendanceExceptionsTable).where(eq(attendanceExceptionsTable.id, id));
  if (!exception) {
    res.status(404).json({ error: "Exception not found" });
    return null;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, exception.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }

  return exception;
}

router.get("/attendance-exceptions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

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
  if (canReviewExceptions(jwtUser.role)) {
    conditions.push(inArray(attendanceExceptionsTable.status, ["open", "under_review", "escalated"]));
  }

  const exceptions = await db.select().from(attendanceExceptionsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(attendanceExceptionsTable.createdAt);

  res.json({ exceptions: exceptions.map(mapException), total: exceptions.length });
});

router.post("/attendance-exceptions", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

  const { userId, attendanceLogId, exceptionType, reason, evidenceUrl } = req.body;

  if (!userId || !exceptionType || !reason) {
    res.status(400).json({ error: "userId, exceptionType, and reason are required" });
    return;
  }

  if (!["admin", "hr"].includes(jwtUser.role) && userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only create exceptions for yourself" });
    return;
  }

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

router.get("/attendance-exceptions/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const exception = await getAccessibleExceptionOrRespond(req, res, id);
  if (!exception) return;

  res.json(mapException(exception));
});

router.get("/attendance-exceptions/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const exception = await getAccessibleExceptionOrRespond(req, res, id);
  if (!exception) return;

  const comments = await listComments("attendance_exception", exception.id);
  res.json({ comments: comments.map(mapComment), total: comments.length });
});

router.post("/attendance-exceptions/:id/comments", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const exception = await getAccessibleExceptionOrRespond(req, res, id);
  if (!exception) return;

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
    workflowType: "attendance_exception",
    recordId: exception.id,
    authorId: req.user!.userId,
    body: commentBody,
    mentionedUserIds,
  });

  res.status(201).json(mapComment(comment));
});

router.get("/attendance-exceptions/:id/handoffs", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const exception = await getAccessibleExceptionOrRespond(req, res, id);
  if (!exception) return;

  const handoffs = await listHandoffs("attendance_exception", exception.id);
  res.json({ handoffs: handoffs.map(mapHandoff), total: handoffs.length });
});

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

  if (!(await canAccessUserId(jwtUser, existing.userId))) {
    res.status(403).json({ error: "Forbidden: cannot access this exception" });
    return;
  }

  const { status, reviewNotes, assignedTo } = req.body;

  const allowedStatuses = ["under_review", "approved", "rejected", "escalated"];
  if (status && !allowedStatuses.includes(status)) {
    res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(", ")}` });
    return;
  }

  if (!canReviewExceptions(jwtUser.role)) {
    if (existing.requestedBy !== jwtUser.userId) {
      res.status(403).json({ error: "Forbidden: cannot modify another user's exception" });
      return;
    }
    if (status && status !== "escalated") {
      res.status(403).json({ error: "Forbidden: workers can only escalate exceptions" });
      return;
    }
    if (assignedTo !== undefined) {
      res.status(403).json({ error: "Forbidden: workers cannot reassign exceptions" });
      return;
    }
  }

  const updateData: Partial<typeof attendanceExceptionsTable.$inferInsert> = {};
  if (status) {
    updateData.status = status as AttendanceExceptionStatus;
    if (["approved", "rejected"].includes(status)) {
      updateData.reviewedBy = jwtUser.userId;
      updateData.reviewedAt = new Date();
    }
  }
  if (reviewNotes !== undefined) {
    updateData.reviewNotes = reviewNotes;
  }
  if (assignedTo !== undefined) {
    if (!canReviewExceptions(jwtUser.role)) {
      res.status(403).json({ error: "Forbidden: cannot assign exceptions" });
      return;
    }
    if (!Number.isInteger(assignedTo) || assignedTo <= 0) {
      res.status(400).json({ error: "assignedTo must be a positive integer" });
      return;
    }
    if (!(await assertAssignableTargetInScope(jwtUser, assignedTo))) {
      res.status(403).json({ error: "Forbidden: cannot assign exceptions outside your scope" });
      return;
    }
    updateData.assignedTo = assignedTo;
    updateData.assignedBy = jwtUser.userId;
    updateData.assignedAt = new Date();
  }

  const [exception] = await db.update(attendanceExceptionsTable)
    .set(updateData)
    .where(eq(attendanceExceptionsTable.id, id))
    .returning();

  if (assignedTo !== undefined && assignedTo !== existing.assignedTo) {
    await createHandoff({
      workflowType: "attendance_exception",
      recordId: existing.id,
      fromUserId: existing.assignedTo ?? null,
      toUserId: assignedTo,
      handedOffBy: jwtUser.userId,
      note: typeof req.body?.handoffNote === "string" ? req.body.handoffNote.trim() || undefined : undefined,
    });
  }

  res.json(mapException(exception));
});

export default router;
