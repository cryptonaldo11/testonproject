import { and, inArray, isNull, or } from "drizzle-orm";
import {
  alertsTable,
  attendanceExceptionsTable,
  db,
  medicalCertificatesTable,
  usersTable,
  type AlertSeverity,
  type AlertStatus,
  type AttendanceExceptionStatus,
  type McVerificationStatus,
} from "@workspace/db";

export const operationalWorkflowEnum = ["alerts", "attendance_exceptions", "medical_certificates"] as const;
export type OperationalWorkflow = typeof operationalWorkflowEnum[number];

const SLA_CONFIG = {
  alerts: {
    responseHours: 4,
    resolutionHours: 24,
  },
  attendance_exceptions: {
    responseHours: 8,
    resolutionHours: 48,
  },
  medical_certificates: {
    responseHours: 24,
    resolutionHours: 72,
  },
} satisfies Record<OperationalWorkflow, { responseHours: number; resolutionHours: number }>;

const OPEN_ALERT_STATUSES: AlertStatus[] = ["new", "acknowledged", "in_progress"];
const OPEN_EXCEPTION_STATUSES: AttendanceExceptionStatus[] = ["open", "under_review", "escalated"];
const OPEN_MC_STATUSES: McVerificationStatus[] = ["pending", "suspicious", "unreadable"];

const ALERT_SEVERITY_SCORE: Record<AlertSeverity, number> = {
  critical: 30,
  warning: 15,
  info: 5,
};

const MS_PER_HOUR = 1000 * 60 * 60;

interface QueueItem {
  workflow: OperationalWorkflow;
  itemId: number;
  userId: number | null;
  status: string;
  ownerId: number | null;
  ownerName: string | null;
  createdAt: Date;
  updatedAt: Date;
  responseDueAt: Date;
  resolutionDueAt: Date;
  ageHours: number;
  hoursToResolutionDue: number;
  responseBreached: boolean;
  resolutionBreached: boolean;
  severityScore: number;
  complianceRisk: boolean;
  recurrenceHint: number;
}

type AgeBucket = "0_24h" | "24_48h" | "48_72h" | "72h_plus";

function toHours(from: Date, to: Date): number {
  return Number(((to.getTime() - from.getTime()) / MS_PER_HOUR).toFixed(2));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * MS_PER_HOUR);
}

function ageBucket(ageHours: number): AgeBucket {
  if (ageHours < 24) return "0_24h";
  if (ageHours < 48) return "24_48h";
  if (ageHours < 72) return "48_72h";
  return "72h_plus";
}

function computePriorityScore(item: QueueItem): number {
  const overdueBoost = item.resolutionBreached ? 40 : item.responseBreached ? 20 : 0;
  const breachRiskBoost = item.hoursToResolutionDue <= 8 ? 12 : item.hoursToResolutionDue <= 24 ? 6 : 0;
  const complianceBoost = item.complianceRisk ? 18 : 0;
  const ageBoost = Math.min(20, Math.floor(item.ageHours / 12));
  const recurrenceBoost = item.recurrenceHint * 4;

  return item.severityScore + overdueBoost + breachRiskBoost + complianceBoost + ageBoost + recurrenceBoost;
}

function getBreachRiskSummary(items: QueueItem[]) {
  const dueWithin4HoursCount = items.filter(
    (item) => !item.resolutionBreached && item.hoursToResolutionDue >= 0 && item.hoursToResolutionDue <= 4,
  ).length;
  const dueWithin8HoursCount = items.filter(
    (item) => !item.resolutionBreached && item.hoursToResolutionDue >= 0 && item.hoursToResolutionDue <= 8,
  ).length;
  const dueWithin24HoursCount = items.filter(
    (item) => !item.resolutionBreached && item.hoursToResolutionDue >= 0 && item.hoursToResolutionDue <= 24,
  ).length;

  return {
    atRiskCount: dueWithin24HoursCount,
    dueWithin4HoursCount,
    dueWithin8HoursCount,
    dueWithin24HoursCount,
  };
}

function summarizeWorkflow(workflow: OperationalWorkflow, items: QueueItem[]) {
  const config = SLA_CONFIG[workflow];
  const sortedByAge = [...items].sort((a, b) => b.ageHours - a.ageHours);
  const sortedByPriority = [...items]
    .map((item) => ({ item, priorityScore: computePriorityScore(item) }))
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const agingBuckets: Record<AgeBucket, number> = {
    "0_24h": 0,
    "24_48h": 0,
    "48_72h": 0,
    "72h_plus": 0,
  };

  for (const item of items) {
    agingBuckets[ageBucket(item.ageHours)] += 1;
  }

  const ownerMap = new Map<string, {
    ownerId: number | null;
    ownerName: string;
    activeCount: number;
    overdueCount: number;
    oldestItemAgeHours: number;
  }>();

  for (const item of items) {
    const key = item.ownerId === null ? "unassigned" : String(item.ownerId);
    const existing = ownerMap.get(key) ?? {
      ownerId: item.ownerId,
      ownerName: item.ownerName ?? "Unassigned",
      activeCount: 0,
      overdueCount: 0,
      oldestItemAgeHours: 0,
    };
    existing.activeCount += 1;
    if (item.resolutionBreached) {
      existing.overdueCount += 1;
    }
    existing.oldestItemAgeHours = Math.max(existing.oldestItemAgeHours, item.ageHours);
    ownerMap.set(key, existing);
  }

  const ownerLoad = [...ownerMap.values()].sort((a, b) => {
    if (b.activeCount !== a.activeCount) return b.activeCount - a.activeCount;
    if (b.overdueCount !== a.overdueCount) return b.overdueCount - a.overdueCount;
    return b.oldestItemAgeHours - a.oldestItemAgeHours;
  });

  const overdueCount = items.filter((item) => item.resolutionBreached).length;
  const responseBreachedCount = items.filter((item) => item.responseBreached).length;
  const withinSlaCount = items.length - overdueCount;
  const slaAttainmentRate = items.length === 0 ? 100 : Number(((withinSlaCount / items.length) * 100).toFixed(2));
  const avgAgeHours = items.length === 0 ? 0 : Number((items.reduce((sum, item) => sum + item.ageHours, 0) / items.length).toFixed(2));
  const breachRiskSummary = getBreachRiskSummary(items);

  return {
    workflow,
    queueLabel: workflow.replaceAll("_", " "),
    sla: {
      responseHours: config.responseHours,
      resolutionHours: config.resolutionHours,
    },
    backlogCount: items.length,
    overdueCount,
    responseBreachedCount,
    slaAttainmentRate,
    averageAgeHours: avgAgeHours,
    oldestOpenItem: sortedByAge[0]
      ? {
          itemId: sortedByAge[0].itemId,
          ownerId: sortedByAge[0].ownerId,
          ownerName: sortedByAge[0].ownerName,
          status: sortedByAge[0].status,
          ageHours: sortedByAge[0].ageHours,
          resolutionDueAt: sortedByAge[0].resolutionDueAt,
        }
      : null,
    agingBuckets,
    ownerLoad,
    breachRiskSummary,
    topPriorityItems: sortedByPriority.slice(0, 5).map(({ item, priorityScore }) => ({
      workflow: item.workflow,
      itemId: item.itemId,
      userId: item.userId,
      ownerId: item.ownerId,
      ownerName: item.ownerName,
      status: item.status,
      ageHours: item.ageHours,
      responseBreached: item.responseBreached,
      resolutionBreached: item.resolutionBreached,
      resolutionDueAt: item.resolutionDueAt,
      priorityScore,
    })),
  };
}

export async function getOperationalControlSummary(options: {
  visibleUserIds: number[] | null;
  workflow?: OperationalWorkflow;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  const workflowFilter = options.workflow;

  const owners = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
  const ownerNameById = new Map(owners.map((owner) => [owner.id, owner.name]));

  const [alerts, attendanceExceptions, medicalCertificates] = await Promise.all([
    workflowFilter && workflowFilter !== "alerts"
      ? Promise.resolve([])
      : db
          .select()
          .from(alertsTable)
          .where(
            and(
              inArray(alertsTable.status, OPEN_ALERT_STATUSES),
              options.visibleUserIds === null
                ? undefined
                : or(inArray(alertsTable.userId, options.visibleUserIds), isNull(alertsTable.userId)),
            ),
          ),
    workflowFilter && workflowFilter !== "attendance_exceptions"
      ? Promise.resolve([])
      : db
          .select()
          .from(attendanceExceptionsTable)
          .where(
            and(
              inArray(attendanceExceptionsTable.status, OPEN_EXCEPTION_STATUSES),
              options.visibleUserIds === null
                ? undefined
                : inArray(attendanceExceptionsTable.userId, options.visibleUserIds),
            ),
          ),
    workflowFilter && workflowFilter !== "medical_certificates"
      ? Promise.resolve([])
      : db
          .select()
          .from(medicalCertificatesTable)
          .where(
            and(
              inArray(medicalCertificatesTable.verificationStatus, OPEN_MC_STATUSES),
              options.visibleUserIds === null
                ? undefined
                : inArray(medicalCertificatesTable.userId, options.visibleUserIds),
            ),
          ),
  ]);

  const alertItems: QueueItem[] = alerts.map((alert) => {
    const createdAt = new Date(alert.createdAt);
    const responseDueAt = addHours(createdAt, SLA_CONFIG.alerts.responseHours);
    const resolutionDueAt = addHours(createdAt, SLA_CONFIG.alerts.resolutionHours);
    return {
      workflow: "alerts",
      itemId: alert.id,
      userId: alert.userId ?? null,
      status: alert.status,
      ownerId: alert.assignedTo ?? null,
      ownerName: alert.assignedTo ? (ownerNameById.get(alert.assignedTo) ?? null) : null,
      createdAt,
      updatedAt: new Date(alert.updatedAt),
      responseDueAt,
      resolutionDueAt,
      ageHours: toHours(createdAt, now),
      hoursToResolutionDue: toHours(now, resolutionDueAt),
      responseBreached: now > responseDueAt,
      resolutionBreached: now > resolutionDueAt,
      severityScore: ALERT_SEVERITY_SCORE[alert.severity],
      complianceRisk: alert.alertType === "missing_document" || alert.alertType === "mc_expiring_soon" || alert.alertType === "mc_expired",
      recurrenceHint: alert.alertType === "frequent_absence" ? 2 : 0,
    };
  });

  const exceptionCountByUser = new Map<number, number>();
  for (const item of attendanceExceptions) {
    exceptionCountByUser.set(item.userId, (exceptionCountByUser.get(item.userId) ?? 0) + 1);
  }

  const attendanceExceptionItems: QueueItem[] = attendanceExceptions.map((exception) => {
    const createdAt = new Date(exception.createdAt);
    const responseDueAt = addHours(createdAt, SLA_CONFIG.attendance_exceptions.responseHours);
    const resolutionDueAt = addHours(createdAt, SLA_CONFIG.attendance_exceptions.resolutionHours);
    return {
      workflow: "attendance_exceptions",
      itemId: exception.id,
      userId: exception.userId,
      status: exception.status,
      ownerId: exception.assignedTo ?? null,
      ownerName: exception.assignedTo ? (ownerNameById.get(exception.assignedTo) ?? null) : null,
      createdAt,
      updatedAt: new Date(exception.updatedAt),
      responseDueAt,
      resolutionDueAt,
      ageHours: toHours(createdAt, now),
      hoursToResolutionDue: toHours(now, resolutionDueAt),
      responseBreached: now > responseDueAt,
      resolutionBreached: now > resolutionDueAt,
      severityScore: exception.status === "escalated" ? 18 : 12,
      complianceRisk: false,
      recurrenceHint: Math.max(0, (exceptionCountByUser.get(exception.userId) ?? 1) - 1),
    };
  });

  const certCountByUser = new Map<number, number>();
  for (const item of medicalCertificates) {
    certCountByUser.set(item.userId, (certCountByUser.get(item.userId) ?? 0) + 1);
  }

  const medicalCertificateItems: QueueItem[] = medicalCertificates.map((certificate) => {
    const createdAt = new Date(certificate.createdAt);
    const responseDueAt = addHours(createdAt, SLA_CONFIG.medical_certificates.responseHours);
    const resolutionDueAt = addHours(createdAt, SLA_CONFIG.medical_certificates.resolutionHours);
    return {
      workflow: "medical_certificates",
      itemId: certificate.id,
      userId: certificate.userId,
      status: certificate.verificationStatus,
      ownerId: certificate.verifiedBy ?? null,
      ownerName: certificate.verifiedBy ? (ownerNameById.get(certificate.verifiedBy) ?? null) : null,
      createdAt,
      updatedAt: new Date(certificate.updatedAt),
      responseDueAt,
      resolutionDueAt,
      ageHours: toHours(createdAt, now),
      hoursToResolutionDue: toHours(now, resolutionDueAt),
      responseBreached: now > responseDueAt,
      resolutionBreached: now > resolutionDueAt,
      severityScore: certificate.verificationStatus === "pending" ? 14 : 20,
      complianceRisk: true,
      recurrenceHint: Math.max(0, (certCountByUser.get(certificate.userId) ?? 1) - 1),
    };
  });

  const summaries = [
    summarizeWorkflow("alerts", alertItems),
    summarizeWorkflow("attendance_exceptions", attendanceExceptionItems),
    summarizeWorkflow("medical_certificates", medicalCertificateItems),
  ].filter((summary) => !workflowFilter || summary.workflow === workflowFilter);

  const allItems = [...alertItems, ...attendanceExceptionItems, ...medicalCertificateItems];
  const totalBacklog = allItems.length;
  const totalOverdue = allItems.filter((item) => item.resolutionBreached).length;
  const totalResponseBreached = allItems.filter((item) => item.responseBreached).length;
  const globalPriority = allItems
    .map((item) => ({ item, priorityScore: computePriorityScore(item) }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 10)
    .map(({ item, priorityScore }) => ({
      workflow: item.workflow,
      itemId: item.itemId,
      userId: item.userId,
      ownerId: item.ownerId,
      ownerName: item.ownerName,
      status: item.status,
      ageHours: item.ageHours,
      responseBreached: item.responseBreached,
      resolutionBreached: item.resolutionBreached,
      resolutionDueAt: item.resolutionDueAt,
      priorityScore,
    }));

  return {
    asOf: now,
    workflowFilter: workflowFilter ?? null,
    workflows: summaries,
    totals: {
      backlogCount: totalBacklog,
      overdueCount: totalOverdue,
      responseBreachedCount: totalResponseBreached,
      breachRiskSummary: getBreachRiskSummary(allItems),
    },
    priorityQueue: globalPriority,
  };
}
