import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { departmentsTable } from "./departments";

export const userRoleEnum = ["admin", "hr", "manager", "driver", "worker"] as const;
export type UserRole = typeof userRoleEnum[number];

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<UserRole>().notNull().default("worker"),
  employeeId: text("employee_id").unique(),
  departmentId: integer("department_id").references(() => departmentsTable.id),
  phone: text("phone"),
  position: text("position"),
  hourlyRate: text("hourly_rate").notNull().default("0"),
  faceDescriptor: text("face_descriptor"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
