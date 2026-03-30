import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { attendanceLogsTable } from "./attendance";

export const attendanceExceptionTypeEnum = [
  "missed_checkout",
  "camera_unavailable",
  "face_mismatch",
  "manual_correction",
  "dispute",
] as const;
export type AttendanceExceptionType = typeof attendanceExceptionTypeEnum[number];

export const attendanceExceptionStatusEnum = [
  "open",
  "under_review",
  "approved",
  "rejected",
  "escalated",
] as const;
export type AttendanceExceptionStatus = typeof attendanceExceptionStatusEnum[number];

export const attendanceExceptionsTable = pgTable("attendance_exceptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  attendanceLogId: integer("attendance_log_id").references(() => attendanceLogsTable.id),
  exceptionType: text("exception_type").$type<AttendanceExceptionType>().notNull(),
  status: text("status").$type<AttendanceExceptionStatus>().notNull().default("open"),
  requestedBy: integer("requested_by").notNull().references(() => usersTable.id),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  assignedBy: integer("assigned_by").references(() => usersTable.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reason: text("reason").notNull(),
  reviewNotes: text("review_notes"),
  evidenceUrl: text("evidence_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAttendanceExceptionSchema = createInsertSchema(attendanceExceptionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendanceException = z.infer<typeof insertAttendanceExceptionSchema>;
export type AttendanceException = typeof attendanceExceptionsTable.$inferSelect;
