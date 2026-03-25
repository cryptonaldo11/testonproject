import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { leaveApplicationsTable } from "./leaves";

export const mcVerificationStatusEnum = ["pending", "verified", "suspicious", "unreadable"] as const;
export type McVerificationStatus = typeof mcVerificationStatusEnum[number];

export const medicalCertificatesTable = pgTable("medical_certificates", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  leaveApplicationId: integer("leave_application_id").references(() => leaveApplicationsTable.id),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  doctorName: text("doctor_name"),
  clinicName: text("clinic_name"),
  issueDate: text("issue_date"),
  mcStartDate: text("mc_start_date"),
  mcEndDate: text("mc_end_date"),
  verificationStatus: text("verification_status").$type<McVerificationStatus>().notNull().default("pending"),
  verificationNotes: text("verification_notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMedicalCertificateSchema = createInsertSchema(medicalCertificatesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMedicalCertificate = z.infer<typeof insertMedicalCertificateSchema>;
export type MedicalCertificate = typeof medicalCertificatesTable.$inferSelect;
