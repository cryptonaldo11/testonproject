/**
 * Anomaly Detection Engine -- pure TypeScript service.
 * Analyzes existing attendance, leave, and productivity data for unusual patterns.
 * No DB writes; all detection is computed from input arrays.
 */

export type AnomalyType = "attendance" | "leave" | "productivity" | "compliance";
export type AnomalySeverity = "info" | "warning" | "critical";

export interface AnomalyEvidence {
  key: string;
  label: string;
  value: string;
  numericValue?: number;
  threshold?: string;
}

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  userId: number;
  userName?: string;
  message: string;
  detail: string;
  detectedAt: string;
  ruleKey?: string;
  recommendations?: string[];
  evidence?: AnomalyEvidence[];
}

// ---------------------------------------------------------------------------
// Attendance anomaly detection
// ---------------------------------------------------------------------------

export interface AttendanceLog {
  userId: number;
  date: string;
  status: string;
}

function getMonthBounds(month: string): { startDate: string; endDate: string } {
  const [year, mon] = month.split("-").map(Number);
  const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);
  return { startDate, endDate };
}

function countWorkDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workDays = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow !== 0 && dow !== 6) workDays++;
  }
  return workDays;
}

/**
 * Detect users with attendance rate below the threshold within the given month.
 * month format: "YYYY-MM"
 */
export function detectAttendanceAnomalies(
  logs: AttendanceLog[],
  threshold: number = 0.8,
  month?: string,
): Anomaly[] {
  if (logs.length === 0) return [];

  let filteredLogs = logs;
  if (month) {
    const { startDate, endDate } = getMonthBounds(month);
    filteredLogs = logs.filter((l) => l.date >= startDate && l.date <= endDate);
  }

  const byUser = new Map<number, AttendanceLog[]>();
  for (const log of filteredLogs) {
    if (!byUser.has(log.userId)) byUser.set(log.userId, []);
    byUser.get(log.userId)!.push(log);
  }

  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const [userId, userLogs] of byUser) {
    const firstDate = userLogs[0]?.date;
    if (!firstDate) continue;
    const [year, mon] = firstDate.split("-").map(Number);
    const expectedDays = countWorkDays(year, mon);
    if (expectedDays === 0) continue;

    let presentDays = 0;
    for (const l of userLogs) {
      if (l.status === "present" || l.status === "late") presentDays += 1;
      else if (l.status === "half_day") presentDays += 0.5;
    }

    const rate = presentDays / expectedDays;
    if (rate < threshold) {
      const severity: AnomalySeverity = rate < 0.5 ? "critical" : rate < 0.65 ? "warning" : "info";
      const pct = Math.round(rate * 100);
      anomalies.push({
        id: `att-${userId}-${month ?? firstDate.slice(0, 7)}`,
        type: "attendance",
        severity,
        userId,
        message: `Low attendance rate: ${pct}% (threshold ${Math.round(threshold * 100)}%)`,
        detail: `User ${userId} attended ${presentDays}/${expectedDays} expected work days in ${month ?? firstDate.slice(0, 7)}.`,
        detectedAt: now,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Leave anomaly detection
// ---------------------------------------------------------------------------

export interface LeaveRecord {
  userId: number;
  leaveType: string;
  startDate: string;
  endDate: string;
  status: string;
}

function parseMonth(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function countDays(start: string, end: string): number {
  const s = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1);
}

/**
 * Detect suspicious leave patterns:
 * - Repeated single-day leaves (3+ single-day approved leaves in the same month)
 * - Consecutive month-end leaves (leave ending on the last 2 days of a month)
 * - More than 5 approved leave days in a month
 */
export function detectLeaveAnomalies(
  leaves: LeaveRecord[],
  month?: string,
): Anomaly[] {
  const relevant = leaves.filter(
    (l) => l.status === "approved" && (!month || parseMonth(l.startDate) === month),
  );

  const byUser = new Map<number, LeaveRecord[]>();
  for (const l of relevant) {
    if (!byUser.has(l.userId)) byUser.set(l.userId, []);
    byUser.get(l.userId)!.push(l);
  }

  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();
  const targetMonth = month ?? "unknown";

  for (const [userId, userLeaves] of byUser) {
    // 1. Repeated single-day leaves
    const singleDayLeaves = userLeaves.filter(
      (l) => l.startDate === l.endDate || countDays(l.startDate, l.endDate) === 1,
    );
    if (singleDayLeaves.length >= 3) {
      anomalies.push({
        id: `leave-single-${userId}-${targetMonth}`,
        type: "leave",
        severity: singleDayLeaves.length >= 5 ? "warning" : "info",
        userId,
        message: `Frequent single-day leaves: ${singleDayLeaves.length} single-day approved leaves in ${targetMonth}`,
        detail: `User ${userId} took ${singleDayLeaves.length} single-day leaves in ${targetMonth}. This may indicate abuse of leave policy.`,
        detectedAt: now,
      });
    }

    // 2. Consecutive month-end leaves
    const [ty, tm] = targetMonth.split("-").map(Number);
    const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
    const monthEndLeaves = userLeaves.filter((l) => {
      if (l.endDate.slice(0, 7) !== targetMonth) return false;
      const d = parseInt(l.endDate.slice(8, 10), 10);
      return d >= lastDay - 1;
    });

    if (monthEndLeaves.length >= 2) {
      anomalies.push({
        id: `leave-monthend-${userId}-${targetMonth}`,
        type: "leave",
        severity: "warning",
        userId,
        message: `Multiple month-end leaves in ${targetMonth}`,
        detail: `User ${userId} had ${monthEndLeaves.length} leaves ending near the end of ${targetMonth}. Consider reviewing scheduling impact.`,
        detectedAt: now,
      });
    }

    // 3. High leave volume (more than 5 approved days in the month)
    const totalDays = userLeaves.reduce((sum, l) => sum + countDays(l.startDate, l.endDate), 0);
    if (totalDays > 5) {
      anomalies.push({
        id: `leave-volume-${userId}-${targetMonth}`,
        type: "leave",
        severity: totalDays > 10 ? "critical" : "warning",
        userId,
        message: `High leave volume: ${totalDays} approved leave days in ${targetMonth}`,
        detail: `User ${userId} had ${totalDays} approved leave days in ${targetMonth}, exceeding the typical 5-day threshold.`,
        detectedAt: now,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Productivity anomaly detection
// ---------------------------------------------------------------------------

export interface ProductivityScore {
  userId: number;
  month: string;
  score: number;
}

/**
 * Flag users whose productivity score falls below the threshold.
 * Scores are integers 0-100.
 */
export function detectProductivityAnomalies(
  scores: ProductivityScore[],
  threshold: number = 60,
): Anomaly[] {
  if (scores.length === 0) return [];

  const anomalies: Anomaly[] = [];
  const now = new Date().toISOString();

  for (const s of scores) {
    if (s.score < threshold) {
      const severity: AnomalySeverity =
        s.score < 40 ? "critical" : s.score < 50 ? "warning" : "info";
      anomalies.push({
        id: `prod-${s.userId}-${s.month}`,
        type: "productivity",
        severity,
        userId: s.userId,
        message: `Low productivity score: ${s.score} (threshold ${threshold})`,
        detail: `User ${s.userId} scored ${s.score}/100 in ${s.month}, below the ${threshold} threshold. Review attendance, punctuality, and leave patterns.`,
        detectedAt: now,
      });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------------
// Combined detector
// ---------------------------------------------------------------------------

export interface DetectAllAnomaliesParams {
  attendanceLogs?: AttendanceLog[];
  leaves?: LeaveRecord[];
  productivityScores?: ProductivityScore[];
  userLabelMap?: Map<number, string>;
  month?: string;
}

function applyLabels(anomalies: Anomaly[], labelMap?: Map<number, string>): Anomaly[] {
  if (!labelMap) return anomalies;
  return anomalies.map((a) => ({ ...a, userName: labelMap.get(a.userId) ?? a.userName }));
}

const SEVERITY_ORDER: Record<AnomalySeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/**
 * Run all three detectors and merge results.
 * Deduplicates by userId + type (keeping the most severe).
 * Sorts by severity then by userId.
 */
export function detectAllAnomalies(params: DetectAllAnomaliesParams): Anomaly[] {
  const attendanceAnomalies = detectAttendanceAnomalies(params.attendanceLogs ?? [], 0.8, params.month);
  const leaveAnomalies = detectLeaveAnomalies(params.leaves ?? [], params.month);
  const productivityAnomalies = detectProductivityAnomalies(params.productivityScores ?? []);

  const all = [...attendanceAnomalies, ...leaveAnomalies, ...productivityAnomalies];

  const seen = new Map<string, Anomaly>();
  for (const a of all) {
    const key = `${a.userId}::${a.type}`;
    const existing = seen.get(key);
    if (!existing || SEVERITY_ORDER[a.severity] < SEVERITY_ORDER[existing.severity]) {
      seen.set(key, a);
    }
  }

  const result = Array.from(seen.values());

  result.sort((a, b) => {
    const sevDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return a.userId - b.userId;
  });

  return applyLabels(result, params.userLabelMap);
}
