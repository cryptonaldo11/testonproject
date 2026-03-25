import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leaveTypeEnum = ["annual", "medical", "emergency", "unpaid", "other"] as const;
export type LeaveType = typeof leaveTypeEnum[number];

export const leaveStatusEnum = ["pending", "approved", "rejected", "cancelled"] as const;
export type LeaveStatus = typeof leaveStatusEnum[number];

export const leaveApplicationsTable = pgTable("leave_applications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  leaveType: text("leave_type").$type<LeaveType>().notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  totalDays: text("total_days").notNull().default("1"),
  reason: text("reason").notNull(),
  status: text("status").$type<LeaveStatus>().notNull().default("pending"),
  reviewedBy: integer("reviewed_by").references(() => usersTable.id),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewNotes: text("review_notes"),
  aiClassification: text("ai_classification"),
  aiConfidence: text("ai_confidence"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLeaveApplicationSchema = createInsertSchema(leaveApplicationsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaveApplication = z.infer<typeof insertLeaveApplicationSchema>;
export type LeaveApplication = typeof leaveApplicationsTable.$inferSelect;
