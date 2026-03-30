import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const ownershipHandoffWorkflowTypeEnum = ["alert", "attendance_exception"] as const;
export type OwnershipHandoffWorkflowType = typeof ownershipHandoffWorkflowTypeEnum[number];

export const ownershipHandoffsTable = pgTable("ownership_handoffs", {
  id: serial("id").primaryKey(),
  workflowType: text("workflow_type").$type<OwnershipHandoffWorkflowType>().notNull(),
  recordId: integer("record_id").notNull(),
  fromUserId: integer("from_user_id").references(() => usersTable.id),
  toUserId: integer("to_user_id").notNull().references(() => usersTable.id),
  handedOffBy: integer("handed_off_by").notNull().references(() => usersTable.id),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertOwnershipHandoffSchema = createInsertSchema(ownershipHandoffsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertOwnershipHandoff = z.infer<typeof insertOwnershipHandoffSchema>;
export type OwnershipHandoff = typeof ownershipHandoffsTable.$inferSelect;
