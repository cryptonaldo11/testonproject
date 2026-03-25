import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const productivityScoresTable = pgTable("productivity_scores", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  score: text("score").notNull().default("0"),
  attendanceRate: text("attendance_rate").notNull().default("0"),
  punctualityRate: text("punctuality_rate").notNull().default("0"),
  leaveFrequency: text("leave_frequency").notNull().default("0"),
  month: text("month").notNull(),
  year: text("year").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProductivityScoreSchema = createInsertSchema(productivityScoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductivityScore = z.infer<typeof insertProductivityScoreSchema>;
export type ProductivityScore = typeof productivityScoresTable.$inferSelect;
