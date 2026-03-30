import { z } from "zod";

export const kpiActorRoleSchema = z.enum(["worker", "manager", "admin", "hr", "system"]);
export type KpiActorRole = z.infer<typeof kpiActorRoleSchema>;

export const kpiSurfaceSchema = z.enum([
  "dashboard",
  "go_live_center",
  "alerts",
  "attendance",
  "leaves",
  "medical_certificates",
  "face_registration",
  "productivity",
  "users",
  "departments",
]);
export type KpiSurface = z.infer<typeof kpiSurfaceSchema>;

export const kpiEventNameSchema = z.enum([
  "go_live_center_viewed",
  "go_live_checklist_item_clicked",
  "dashboard_action_clicked",
  "dashboard_queue_opened",
  "alert_acknowledged",
  "alert_assigned",
  "alert_resolved",
  "attendance_exception_reviewed",
  "medical_certificate_reviewed",
  "face_registration_started",
  "face_registration_completed",
  "face_registration_removed",
]);
export type KpiEventName = z.infer<typeof kpiEventNameSchema>;

export const kpiEventSchema = z.object({
  eventName: kpiEventNameSchema,
  role: kpiActorRoleSchema,
  surface: kpiSurfaceSchema,
  target: z.string().min(1).max(120),
  targetId: z.union([z.string(), z.number()]).optional(),
  status: z.string().min(1).max(60).optional(),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  occurredAt: z.string().datetime().optional(),
});
export type KpiEvent = z.infer<typeof kpiEventSchema>;

export const phase4aKpiDefinitions = {
  onboardingCompletionRate: "Percentage of admin/HR workspaces that complete all Go-Live checklist items.",
  timeToFirstSuccessfulSetup: "Elapsed time from first admin/HR visit to the first verified check-in and minimum setup completion.",
  faceRegistrationCoverage: "Share of workers with an active registered face descriptor.",
  alertAcknowledgementTime: "Elapsed time from alert creation to first acknowledgement by an authorized user.",
  alertResolutionTime: "Elapsed time from alert creation to resolution.",
  exceptionResolutionTime: "Elapsed time from attendance exception creation to final review outcome.",
} as const;

export type Phase4aKpiKey = keyof typeof phase4aKpiDefinitions;
