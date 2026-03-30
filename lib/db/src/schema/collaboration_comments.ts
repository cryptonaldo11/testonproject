import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const collaborationWorkflowTypeEnum = ["alert", "attendance_exception"] as const;
export type CollaborationWorkflowType = typeof collaborationWorkflowTypeEnum[number];

export const collaborationCommentsTable = pgTable("collaboration_comments", {
  id: serial("id").primaryKey(),
  workflowType: text("workflow_type").$type<CollaborationWorkflowType>().notNull(),
  recordId: integer("record_id").notNull(),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  body: text("body").notNull(),
  mentionedUserIds: text("mentioned_user_ids").notNull().default("[]"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCollaborationCommentSchema = createInsertSchema(collaborationCommentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCollaborationComment = z.infer<typeof insertCollaborationCommentSchema>;
export type CollaborationComment = typeof collaborationCommentsTable.$inferSelect;
