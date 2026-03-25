import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { departmentsTable } from "./departments";

export const workerStatusEnum = ["active", "inactive", "on_leave", "terminated"] as const;
export type WorkerStatus = typeof workerStatusEnum[number];

export const workersTable = pgTable("workers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id).unique(),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  employeeId: text("employee_id").unique(),
  jobTitle: text("job_title"),
  workLocation: text("work_location"),
  contractType: text("contract_type").default("full_time"),
  status: text("status").$type<WorkerStatus>().notNull().default("active"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  faceDescriptor: text("face_descriptor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertWorkerSchema = createInsertSchema(workersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWorker = z.infer<typeof insertWorkerSchema>;
export type Worker = typeof workersTable.$inferSelect;
