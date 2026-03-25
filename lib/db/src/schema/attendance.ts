import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const attendanceStatusEnum = ["present", "absent", "late", "half_day"] as const;
export type AttendanceStatus = typeof attendanceStatusEnum[number];

export const attendanceLogsTable = pgTable("attendance_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  checkIn: timestamp("check_in", { withTimezone: true }),
  checkOut: timestamp("check_out", { withTimezone: true }),
  date: text("date").notNull(),
  status: text("status").$type<AttendanceStatus>().notNull().default("present"),
  hoursWorked: text("hours_worked"),
  faceMatchScore: text("face_match_score"),
  isManualEntry: text("is_manual_entry").notNull().default("false"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertAttendanceLogSchema = createInsertSchema(attendanceLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAttendanceLog = z.infer<typeof insertAttendanceLogSchema>;
export type AttendanceLog = typeof attendanceLogsTable.$inferSelect;
