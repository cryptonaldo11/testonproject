import { Router, type IRouter } from "express";
import { db, faceVerificationAttemptsTable, type FaceVerificationAttemptType, type FaceVerificationOutcome, type FaceVerificationFailureReason } from "@workspace/db";
import { eq, and, SQL, inArray, desc } from "drizzle-orm";
import { requireAuth, getScopedUserIds, canAccessUserId } from "../lib/auth";

const router: IRouter = Router();

function mapAttempt(a: typeof faceVerificationAttemptsTable.$inferSelect) {
  return {
    id: a.id,
    userId: a.userId,
    attendanceLogId: a.attendanceLogId ?? null,
    attemptType: a.attemptType,
    outcome: a.outcome,
    failureReason: a.failureReason ?? null,
    confidenceScore: a.confidenceScore ?? null,
    fallbackMethod: a.fallbackMethod ?? null,
    reviewedBy: a.reviewedBy ?? null,
    notes: a.notes ?? null,
    createdAt: a.createdAt,
  };
}

// List face verification attempts with scoping
router.get("/face-verification-attempts", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

  // Parse query params
  const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;
  const outcome = req.query.outcome as string | undefined;
  const attemptType = req.query.attemptType as string | undefined;

  const scopedUserIds = await getScopedUserIds(jwtUser, userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json({ attempts: [], total: 0 });
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(faceVerificationAttemptsTable.userId, scopedUserIds));
  }

  if (outcome) {
    conditions.push(eq(faceVerificationAttemptsTable.outcome, outcome as FaceVerificationOutcome));
  }
  if (attemptType) {
    conditions.push(eq(faceVerificationAttemptsTable.attemptType, attemptType as FaceVerificationAttemptType));
  }

  const attempts = await db.select().from(faceVerificationAttemptsTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(faceVerificationAttemptsTable.createdAt));

  res.json({ attempts: attempts.map(mapAttempt), total: attempts.length });
});

// Get face verification attempts for a specific user (self or scoped)
router.get("/face-verification-attempts/user/:userId", requireAuth, async (req, res): Promise<void> => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

  const attempts = await db.select().from(faceVerificationAttemptsTable)
    .where(eq(faceVerificationAttemptsTable.userId, userId))
    .orderBy(desc(faceVerificationAttemptsTable.createdAt))
    .limit(limit);

  res.json({ attempts: attempts.map(mapAttempt), total: attempts.length });
});

// Get single face verification attempt
router.get("/face-verification-attempts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [attempt] = await db.select().from(faceVerificationAttemptsTable).where(eq(faceVerificationAttemptsTable.id, id));
  if (!attempt) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, attempt.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(mapAttempt(attempt));
});

// Create face verification attempt (called by check-in/out routes)
// This endpoint is primarily for internal use but exposed for admin/hr manual logging
router.post("/face-verification-attempts", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;

  const {
    userId,
    attendanceLogId,
    attemptType,
    outcome,
    failureReason,
    confidenceScore,
    fallbackMethod,
    notes,
  } = req.body;

  if (!userId || !attemptType || !outcome) {
    res.status(400).json({ error: "userId, attemptType, and outcome are required" });
    return;
  }

  // Validate enums
  const validTypes = ["check_in", "check_out", "registration"];
  if (!validTypes.includes(attemptType)) {
    res.status(400).json({ error: `Invalid attemptType. Must be one of: ${validTypes.join(", ")}` });
    return;
  }

  const validOutcomes = ["success", "failure", "fallback_used"];
  if (!validOutcomes.includes(outcome)) {
    res.status(400).json({ error: `Invalid outcome. Must be one of: ${validOutcomes.join(", ")}` });
    return;
  }

  if (failureReason) {
    const validReasons = ["no_face", "low_lighting", "mismatch", "camera_unavailable", "quality_insufficient"];
    if (!validReasons.includes(failureReason)) {
      res.status(400).json({ error: `Invalid failureReason. Must be one of: ${validReasons.join(", ")}` });
      return;
    }
  }

  // Only admin/hr can log attempts for other users
  if (!["admin", "hr"].includes(jwtUser.role) && userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only log attempts for yourself" });
    return;
  }

  const [attempt] = await db.insert(faceVerificationAttemptsTable).values({
    userId,
    attendanceLogId: attendanceLogId ?? null,
    attemptType: attemptType as FaceVerificationAttemptType,
    outcome: outcome as FaceVerificationOutcome,
    failureReason: failureReason as FaceVerificationFailureReason ?? null,
    confidenceScore: confidenceScore ?? null,
    fallbackMethod: fallbackMethod ?? null,
    notes: notes ?? null,
  }).returning();

  res.status(201).json(mapAttempt(attempt));
});

// Add note or review to a face verification attempt (admin/hr only)
router.patch("/face-verification-attempts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const jwtUser = req.user!;

  const [existing] = await db.select().from(faceVerificationAttemptsTable).where(eq(faceVerificationAttemptsTable.id, id));
  if (!existing) {
    res.status(404).json({ error: "Attempt not found" });
    return;
  }

  // Check access scope
  if (!(await canAccessUserId(jwtUser, existing.userId))) {
    res.status(403).json({ error: "Forbidden: cannot access this attempt" });
    return;
  }

  // Only admin/hr can add notes or mark as reviewed
  if (!["admin", "hr"].includes(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden: only HR or admin can update verification attempts" });
    return;
  }

  const { notes, reviewed } = req.body;

  const updateData: Partial<typeof faceVerificationAttemptsTable.$inferInsert> = {};
  if (notes !== undefined) {
    updateData.notes = notes;
  }
  if (reviewed === true) {
    updateData.reviewedBy = jwtUser.userId;
  }

  const [attempt] = await db.update(faceVerificationAttemptsTable)
    .set(updateData)
    .where(eq(faceVerificationAttemptsTable.id, id))
    .returning();

  res.json(mapAttempt(attempt));
});

export default router;
