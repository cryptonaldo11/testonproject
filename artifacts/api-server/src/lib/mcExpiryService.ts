import { db, medicalCertificatesTable, alertsTable, usersTable } from "@workspace/db";
import { isNull, isNotNull, or, and, inArray, eq, SQL } from "drizzle-orm";
import type { AlertType, AlertSeverity } from "@workspace/db";

const DEFAULT_EXPIRY_DAYS = 7;
const DEFAULT_EXPIRED_DAYS_AGO = 0;

export interface McExpiryCheckResult {
  expiringSoon: number;
  alreadyExpired: number;
  alertsCreated: number;
  skipped: number;
}

/**
 * Scans medical certificates for those expiring within `expiryDays` days or
 * already past their mcEndDate, and creates mc_expiring_soon / mc_expired
 * alerts for any that haven't already received a reminder.
 *
 * Call this from a cron job (e.g. daily) via POST /medical-certificates/check-expiry.
 */
export async function checkMcExpiry(expiryDays = DEFAULT_EXPIRY_DAYS): Promise<McExpiryCheckResult> {
  const now = new Date();

  // Compute date boundaries as ISO date strings (YYYY-MM-DD)
  const todayStr = toDateStr(now);
  const futureDateStr = toDateStr(addDays(now, expiryDays));
  const pastDateStr = toDateStr(addDays(now, DEFAULT_EXPIRED_DAYS_AGO - expiryDays));

  // Select MCs where:
  //   - mcEndDate is set
  //   - reminderSentAt is NULL (not yet alerted)
  //   - (mcEndDate <= today  → already expired)
  //     OR (mcEndDate > today AND mcEndDate <= futureDateStr  → expiring soon)
  const qualifying = await db
    .select({
      id: medicalCertificatesTable.id,
      userId: medicalCertificatesTable.userId,
      mcEndDate: medicalCertificatesTable.mcEndDate,
      fileName: medicalCertificatesTable.fileName,
    })
    .from(medicalCertificatesTable)
    .where(
      and(
        isNull(medicalCertificatesTable.reminderSentAt),
        isNotNull(medicalCertificatesTable.mcEndDate),
      ),
    );

  const toAlert: typeof qualifying = [];

  for (const mc of qualifying) {
    if (!mc.mcEndDate) continue;
    if (mc.mcEndDate <= todayStr) {
      // Already expired
      toAlert.push(mc);
    } else if (mc.mcEndDate <= futureDateStr) {
      // Expiring within the window
      toAlert.push(mc);
    }
  }

  if (toAlert.length === 0) {
    return { expiringSoon: 0, alreadyExpired: 0, alertsCreated: 0, skipped: 0 };
  }

  const userIds = [...new Set(toAlert.map((m) => m.userId))];

  // Fetch user names for alert messages
  const users = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(inArray(usersTable.id, userIds));

  const userMap = new Map(users.map((u) => [u.id, u.name ?? "Unknown"]));

  // Check for existing open alerts to avoid duplicates
  const openAlertTypes: AlertType[] = ["mc_expiring_soon", "mc_expired"];
  const existingAlerts = await db
    .select({ userId: alertsTable.userId, alertType: alertsTable.alertType })
    .from(alertsTable)
    .where(
      and(
        inArray(alertsTable.userId, userIds),
        inArray(alertsTable.alertType, openAlertTypes),
        or(
          eq(alertsTable.status, "new"),
          eq(alertsTable.status, "acknowledged"),
          eq(alertsTable.status, "in_progress"),
        ),
      ),
    );

  const existingKey = new Set(existingAlerts.map((a) => `${a.userId}-${a.alertType}`));

  const alertsToInsert: {
    userId: number;
    alertType: AlertType;
    severity: AlertSeverity;
    title: string;
    message: string;
    relatedDate: string;
  }[] = [];

  let expiringSoon = 0;
  let alreadyExpired = 0;

  for (const mc of toAlert) {
    const isExpired = mc.mcEndDate! <= todayStr;
    const alertType: AlertType = isExpired ? "mc_expired" : "mc_expiring_soon";
    const severity: AlertSeverity = isExpired ? "critical" : "warning";
    const key = `${mc.userId}-${alertType}`;

    if (existingKey.has(key)) continue;

    const userName = userMap.get(mc.userId) ?? "Unknown";
    const certName = mc.fileName;

    if (isExpired) {
      alreadyExpired++;
      alertsToInsert.push({
        userId: mc.userId,
        alertType,
        severity,
        title: `Medical certificate expired for ${userName}`,
        message: `The medical certificate "${certName}" (ended ${mc.mcEndDate}) has passed its end date and may require follow-up.`,
        relatedDate: mc.mcEndDate!,
      });
    } else {
      expiringSoon++;
      alertsToInsert.push({
        userId: mc.userId,
        alertType,
        severity,
        title: `Medical certificate expiring soon for ${userName}`,
        message: `The medical certificate "${certName}" will expire on ${mc.mcEndDate}. Please review and take action before the expiry date.`,
        relatedDate: mc.mcEndDate!,
      });
    }
  }

  if (alertsToInsert.length > 0) {
    await db.insert(alertsTable).values(alertsToInsert);
  }

  // Stamp all qualifying MCs as reminded
  await db
    .update(medicalCertificatesTable)
    .set({ reminderSentAt: new Date() })
    .where(
      inArray(
        medicalCertificatesTable.id,
        toAlert.map((m) => m.id),
      ),
    );

  return {
    expiringSoon,
    alreadyExpired,
    alertsCreated: alertsToInsert.length,
    skipped: toAlert.length - alertsToInsert.length,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
