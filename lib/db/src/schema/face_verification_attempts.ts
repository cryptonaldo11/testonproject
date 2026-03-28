import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { attendanceLogsTable } from "./attendance";

export const faceVerificationAttemptTypeEnum = [
  "check_in",
  "check_out",
  "registration",
] as const;
export type FaceVerificationAttemptType = typeof faceVerificationAttemptTypeEnum[number];

export const faceVerificationOutcomeEnum = [
  "success",
  "failure",
  "fallback_used",
] as const;
export type FaceVerificationOutcome = typeof faceVerificationOutcomeEnum[number];

export const faceVerificationFailureReasonEnum = [
  "no_face",
  "low_lighting",
  "mismatch",
  "camera_unavailable",
  "quality_insufficient",
] as const;
export type FaceVerificationFailureReason = typeof faceVerificationFailureReasonEnum[number];

export const faceVerificationAttemptsTable = pgTable("face_verification_attempts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  attendanceLogId: integer("attendance_log_id").references(() => attendanceLogsTable.id),
  attemptType: text("attempt_type").$type<FaceVerificationAttemptType>().notNull(),
  outcome: text("outcome").$type<FaceVerificationOutcome>().notNull(),
  failureReason: text("failure_reason").$type<FaceVerificationFailureReason>(),
  confidenceScore: real("confidence_score"),
  fallbackMethod: text("fallback_method"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertFaceVerificationAttemptSchema = createInsertSchema(faceVerificationAttemptsTable).omit({ id: true, createdAt: true });
export type InsertFaceVerificationAttempt = z.infer<typeof insertFaceVerificationAttemptSchema>;
export type FaceVerificationAttempt = typeof faceVerificationAttemptsTable.$inferSelect;
