import { Router, type IRouter } from "express";
import {
  db,
  attendanceLogsTable,
  leaveApplicationsTable,
  productivityScoresTable,
  usersTable,
} from "@workspace/db";
import { and, gte, lte, inArray, eq, SQL } from "drizzle-orm";

import { requireAuth, requireRole, getScopedUserIds } from "../lib/auth";
import {
  detectAllAnomalies,
  type AttendanceLog,
  type LeaveRecord,
  type ProductivityScore,
} from "../lib/anomalyDetection";

const router: IRouter = Router();

function formatMonthDay(value: number): string {
  return String(value).padStart(2, "0");
}

function getMonthStartDateString(year: number, month: number): string {
  return `${year}-${formatMonthDay(month)}-01`;
}

function getMonthEndDateString(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function getMonthFromParam(monthParam?: string): { year: number; month: number } {
  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    return { year: y, month: m };
  }
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/**
 * GET /api/anomalies
 *
 * Detects anomalies from attendance, leave, and productivity data.
 *
 * Query params:
 *   - month     optional, format "YYYY-MM"  (defaults to current month)
 *   - severity  optional, filter by "critical" | "warning" | "info"
 *
 * Role: admin, hr, manager
 */
router.get("/anomalies", requireAuth, requireRole("admin", "hr", "manager"), async (req, res): Promise<void> => {
  const monthParam = typeof req.query.month === "string" ? req.query.month : undefined;
  const severityFilter = typeof req.query.severity === "string"
    ? (req.query.severity as "critical" | "warning" | "info")
    : undefined;

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json({ anomalies: [], total: 0 });
    return;
  }

  const { year, month } = getMonthFromParam(monthParam);
  const startDate = getMonthStartDateString(year, month);
  const endDate = getMonthEndDateString(year, month);
  const monthLabel = `${year}-${formatMonthDay(month)}`;

  // -------------------------------------------------------------------------
  // 1. Fetch attendance logs for the month
  // -------------------------------------------------------------------------
  const attendanceConditions: SQL[] = [
    gte(attendanceLogsTable.date, startDate),
    lte(attendanceLogsTable.date, endDate),
  ];
  if (scopedUserIds !== null) {
    attendanceConditions.push(inArray(attendanceLogsTable.userId, scopedUserIds));
  }

  const attendanceRows = await db
    .select({ userId: attendanceLogsTable.userId, date: attendanceLogsTable.date, status: attendanceLogsTable.status })
    .from(attendanceLogsTable)
    .where(and(...attendanceConditions));

  const attendanceLogs: AttendanceLog[] = attendanceRows.map((r) => ({
    userId: r.userId,
    date: r.date,
    status: r.status,
  }));

  // -------------------------------------------------------------------------
  // 2. Fetch approved leaves for the month
  // -------------------------------------------------------------------------
  const leaveConditions: SQL[] = [
    eq(leaveApplicationsTable.status, "approved"),
    lte(leaveApplicationsTable.startDate, endDate),
    gte(leaveApplicationsTable.endDate, startDate),
  ];
  if (scopedUserIds !== null) {
    leaveConditions.push(inArray(leaveApplicationsTable.userId, scopedUserIds));
  }

  const leaveRows = await db
    .select({
      userId: leaveApplicationsTable.userId,
      leaveType: leaveApplicationsTable.leaveType,
      startDate: leaveApplicationsTable.startDate,
      endDate: leaveApplicationsTable.endDate,
      status: leaveApplicationsTable.status,
    })
    .from(leaveApplicationsTable)
    .where(and(...leaveConditions));

  const leaves: LeaveRecord[] = leaveRows.map((r) => ({
    userId: r.userId,
    leaveType: r.leaveType,
    startDate: r.startDate,
    endDate: r.endDate,
    status: r.status,
  }));

  // -------------------------------------------------------------------------
  // 3. Fetch productivity scores for the month
  // -------------------------------------------------------------------------
  const scoreConditions: SQL[] = [
    eq(productivityScoresTable.year, String(year)),
    eq(productivityScoresTable.month, String(month)),
  ];
  if (scopedUserIds !== null) {
    scoreConditions.push(inArray(productivityScoresTable.userId, scopedUserIds));
  }

  const scoreRows = await db
    .select({ userId: productivityScoresTable.userId, score: productivityScoresTable.score })
    .from(productivityScoresTable)
    .where(and(...scoreConditions));

  const productivityScores: ProductivityScore[] = scoreRows
    .map((r) => ({ userId: r.userId, month: monthLabel, score: parseInt(r.score, 10) }))
    .filter((s) => !isNaN(s.score));

  // -------------------------------------------------------------------------
  // 4. Build user label map for readable output
  // -------------------------------------------------------------------------
  const allUserIds = new Set<number>();
  for (const log of attendanceLogs) allUserIds.add(log.userId);
  for (const l of leaves) allUserIds.add(l.userId);
  for (const s of productivityScores) allUserIds.add(s.userId);

  const userLabelMap = new Map<number, string>();
  if (allUserIds.size > 0) {
    const userRows = await db
      .select({ id: usersTable.id, name: usersTable.name })
      .from(usersTable)
      .where(inArray(usersTable.id, Array.from(allUserIds)));
    for (const u of userRows) {
      userLabelMap.set(u.id, u.name);
    }
  }

  // -------------------------------------------------------------------------
  // 5. Run anomaly detection
  // -------------------------------------------------------------------------
  const anomalies = detectAllAnomalies({
    attendanceLogs,
    leaves,
    productivityScores,
    userLabelMap,
    month: monthLabel,
  });

  // -------------------------------------------------------------------------
  // 6. Apply severity filter
  // -------------------------------------------------------------------------
  const filtered = severityFilter ? anomalies.filter((a) => a.severity === severityFilter) : anomalies;

  res.json({ anomalies: filtered, total: filtered.length });
});

export default router;
