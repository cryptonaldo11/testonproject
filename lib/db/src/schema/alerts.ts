import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const alertTypeEnum = [
  "missing_attendance",
  "missing_document",
  "frequent_absence",
  "policy_violation",
  "ghost_worker",
  "leave_limit_exceeded",
  "mc_expiring_soon",
  "mc_expired",
] as const;
export type AlertType = typeof alertTypeEnum[number];

export const alertSeverityEnum = ["info", "warning", "critical"] as const;
export type AlertSeverity = typeof alertSeverityEnum[number];

export const alertStatusEnum = ["new", "acknowledged", "in_progress", "resolved", "dismissed"] as const;
export type AlertStatus = typeof alertStatusEnum[number];

export const alertsTable = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id),
  alertType: text("alert_type").$type<AlertType>().notNull(),
  severity: text("severity").$type<AlertSeverity>().notNull().default("warning"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  status: text("status").$type<AlertStatus>().notNull().default("new"),
  relatedDate: text("related_date"),
  assignedTo: integer("assigned_to").references(() => usersTable.id),
  assignedBy: integer("assigned_by").references(() => usersTable.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }),
  resolvedBy: integer("resolved_by").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNotes: text("resolution_notes"),
  dismissedBy: integer("dismissed_by").references(() => usersTable.id),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAlertSchema = createInsertSchema(alertsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Alert = typeof alertsTable.$inferSelect;
