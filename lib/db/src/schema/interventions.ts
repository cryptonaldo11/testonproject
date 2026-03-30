import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { alertsTable } from "./alerts";

export const interventionIssueTypeEnum = [
  "lateness",
  "no_show",
  "overtime_strain",
  "attendance_reliability",
  "workflow_issue",
  "improvement_plan",
  "recognition",
  "other",
] as const;
export type InterventionIssueType = typeof interventionIssueTypeEnum[number];

export const interventionStatusEnum = ["open", "in_progress", "completed", "cancelled"] as const;
export type InterventionStatus = typeof interventionStatusEnum[number];

export const interventionsTable = pgTable("interventions", {
  id: serial("id").primaryKey(),
  workerUserId: integer("worker_user_id").notNull().references(() => usersTable.id),
  ownerUserId: integer("owner_user_id").notNull().references(() => usersTable.id),
  createdBy: integer("created_by").notNull().references(() => usersTable.id),
  updatedBy: integer("updated_by").references(() => usersTable.id),
  linkedAlertId: integer("linked_alert_id").references(() => alertsTable.id),
  issueType: text("issue_type").$type<InterventionIssueType>().notNull(),
  status: text("status").$type<InterventionStatus>().notNull().default("open"),
  summary: text("summary").notNull(),
  agreedAction: text("agreed_action"),
  outcomeNotes: text("outcome_notes"),
  followUpDueAt: timestamp("follow_up_due_at", { withTimezone: true }),
  followUpCompletedAt: timestamp("follow_up_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertInterventionSchema = createInsertSchema(interventionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertIntervention = z.infer<typeof insertInterventionSchema>;
export type Intervention = typeof interventionsTable.$inferSelect;
