import type {
  LeaveBalanceResponse,
  AttendanceSummaryResponse,
  ProductivityListResponse,
  LeaveListResponse,
  AlertResponse,
  FaceVerificationAttemptResponse,
  AttendanceExceptionListResponse,
  MedicalCertificateListResponse,
} from "@workspace/api-client-react";

// ─────────────────────────────────────────────
// INPUT INTERFACES (what the Dashboard actually passes)
// ─────────────────────────────────────────────

/**
 * Raw data from React Query hooks — all fields are optional for defensive coding.
 *
 * Note: `todayAttendance` accepts the raw logs array extracted from
 * AttendanceListResponse via attendanceData?.logs.
 */
export interface WorkerHookData {
  /** attendanceData?.logs — today's attendance rows for the user. */
  todayAttendance?: Array<{ id: number; userId: number; checkIn?: string | null; status: string; date: string }>;
  /** Result of useGetLeaveBalance. */
  leaveBalance?: LeaveBalanceResponse;
  /** Result of useGetAttendanceSummary for the current month, scoped to the worker. */
  monthAttendanceSummary?: AttendanceSummaryResponse;
  /** Result of useListFaceVerificationAttemptsByUser — { attempts, total }. */
  faceAttempts?: { attempts: FaceVerificationAttemptResponse[]; total: number };
  /** Self-filtered pending leaves: { leaves: LeaveResponse[], total: number }. */
  myPendingLeaves?: LeaveListResponse;
  /** Pre-scoped alerts for this worker. */
  myAlerts?: AlertResponse[];
  /** Current user id for self-filtering. */
  userId?: number;
  /** Raw productivity scores for the current month. */
  productivityScores?: ProductivityListResponse;
}

/**
 * Raw data for the manager summary.
 *
 * Note: `todayAttendance` accepts the logs array from AttendanceListResponse
 * (attendanceData?.logs) — the Dashboard pre-extracts this.
 */
export interface ManagerHookData {
  /** attendanceData?.logs — today's attendance rows for the department/team. */
  todayAttendance?: Array<{ id: number; userId: number; checkIn?: string | null; status: string; date: string }>;
  /** useListAttendanceExceptions result (all exceptions, pre-filtered in the Dashboard if needed). */
  teamExceptions?: AttendanceExceptionListResponse;
  /** Pre-filtered open alerts for the manager's scope. */
  teamAlerts?: AlertResponse[];
  /** Pending leave count (Dashboard pre-computes leavesData.total). */
  pendingLeaveCount?: number;
  /** useListProductivityScores for the current month. */
  productivityScores?: ProductivityListResponse;
  /** Total active users in the department (from useListUsers). */
  totalUsers?: number;
}

export interface AdminHookData {
  /** Open alerts (Dashboard pre-filters: status !== resolved/dismissed). */
  openAlerts?: AlertResponse[];
  /** Overdue alerts (Dashboard pre-computes: relatedDate < today). */
  overdueAlerts?: AlertResponse[];
  /** Critical severity open alerts. */
  criticalAlerts?: AlertResponse[];
  /** useListAttendanceExceptions. */
  pendingExceptions?: AttendanceExceptionListResponse;
  /** useListMedicalCertificates with verificationStatus=pending. */
  pendingCertificates?: MedicalCertificateListResponse;
  /** useListProductivityScores. */
  productivityScores?: ProductivityListResponse;
  /** MC expiring soon alerts (Dashboard pre-filters by alertType). */
  mcExpiringSoonAlerts?: AlertResponse[];
}

// ─────────────────────────────────────────────
// OUTPUT INTERFACES (what each compute fn returns)
// ─────────────────────────────────────────────

export interface WorkerSummary {
  headline: string;
  todayStatus: { checkedIn: boolean; checkInTime?: string; statusLabel: string };
  attendanceRateThisMonth: { value: number | null; label: string; narrative: string };
  leaveBalance: { annualRemaining: number | null; medicalRemaining: number | null; narrative: string };
  hoursWorkedThisMonth: { value: number | null; narrative: string };
  faceVerification: { lastAttempt: FaceVerificationAttemptResponse | null; narrative: string };
  pendingLeaves: { count: number; narrative: string };
  myAlerts: { count: number; critical: number; narrative: string };
}

export interface ManagerSummary {
  headline: string;
  teamToday: { checkedIn: number; absent: number; late: number; total: number; narrative: string };
  teamAttendanceTrend: { thisMonth: number | null; narrative: string };
  openExceptions: { count: number; narrative: string };
  alerts: { total: number; critical: number; narrative: string };
  pendingLeaves: { count: number; narrative: string };
  overallHealth: { score: "good" | "attention" | "critical"; narrative: string; actionCount: number };
}

export interface AdminSummary {
  headline: string;
  workforceHealth: { openAlerts: number; overdueAlerts: number; criticalAlerts: number; narrative: string };
  queues: { pendingMC: number; pendingLeaves: number; pendingExceptions: number; narrative: string };
  mcExpiringSoon: { count: number; narrative: string };
  productivityOutliers: { count: number; narrative: string };
  topPriorityItems: Array<{ label: string; count: number; severity: "critical" | "high" | "medium" }>;
  overallHealth: { score: "good" | "attention" | "critical"; narrative: string };
}

// ─────────────────────────────────────────────
// PURE HELPER FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Compute overall attendance % across all items in an AttendanceSummaryResponse.
 * Returns null if no items exist or all totalDays are zero.
 */
export function computeAttendanceRateFromSummary(
  summary: AttendanceSummaryResponse | undefined
): number | null {
  if (!summary?.items?.length) return null;
  const items = summary.items;
  let totalPresent = 0;
  let totalDays = 0;
  for (const item of items) {
    totalPresent += item.presentDays ?? 0;
    totalDays += item.totalDays ?? 0;
  }
  if (totalDays === 0) return null;
  return Math.round((totalPresent / totalDays) * 100);
}

/** Returns date boundaries for the current calendar month. */
export function getMonthBounds(): {
  monthStart: string;
  monthEnd: string;
  today: string;
  month: number;
  year: number;
} {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);
  return {
    monthStart: monthStart.toISOString().split("T")[0],
    monthEnd: monthEnd.toISOString().split("T")[0],
    today: now.toISOString().split("T")[0],
    month,
    year,
  };
}

export function getAttendanceNarrative(rate: number | null): string {
  if (rate === null) return "No attendance data recorded yet this month";
  if (rate >= 95) return "Excellent attendance this month — keep it up";
  if (rate >= 85) return "Good attendance this month";
  if (rate >= 75) return "Attendance is moderate — a few absences noted this month";
  return "Attendance needs attention — please discuss with your supervisor";
}

export function getLeaveBalanceNarrative(
  annual: number | null,
  medical: number | null
): string {
  if (annual === null) return "Leave balance is loading";
  if (annual === 0) return "No annual leave days remaining for this year";
  if (annual <= 3) return `Only ${annual} annual leave days remaining — plan ahead`;
  if (annual <= 7) return `${annual} annual leave days remaining — good time to review your usage`;
  return `${annual} annual leave days remaining`;
}

export function getFaceVerificationNarrative(
  attempts: FaceVerificationAttemptResponse[] | undefined
): string {
  if (!attempts || attempts.length === 0) return "No face verification records found";
  const last = attempts[0];
  const now = new Date();
  const created = new Date(last.createdAt);
  const daysSince = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));

  if (last.outcome === "success") {
    if (daysSince <= 7) return "Face verification successful within the last week";
    return `Last face verification was ${daysSince} days ago`;
  }
  if (last.outcome === "fallback_used") {
    return "Face verification used fallback method last time — contact HR if this was unexpected";
  }
  if (last.outcome === "failure") {
    const label: Record<string, string> = {
      no_face: "No face detected",
      low_lighting: "Low lighting",
      mismatch: "Face did not match your registered profile",
      camera_unavailable: "Camera unavailable",
      quality_insufficient: "Image quality insufficient",
    };
    const reasonLabel = last.failureReason ? (label[last.failureReason] ?? last.failureReason) : "Verification failed";
    return `Last face verification had an issue: ${reasonLabel}`;
  }
  return "No face verification records found";
}

export function getWorkerHeadline(checkedIn: boolean, attendanceRate: number | null): string {
  if (!checkedIn) return "Not checked in yet today";
  if (attendanceRate !== null && attendanceRate >= 95) return "You're checked in and performing well";
  if (attendanceRate !== null && attendanceRate >= 85) return "You're checked in and on track";
  return "You're checked in today";
}

export function getTeamTodayNarrative(
  checkedIn: number,
  late: number,
  absent: number,
  total: number
): string {
  if (absent === 0 && late === 0) return `All ${total} team members checked in today`;
  if (absent === 0) return `${checkedIn} checked in, ${late} late, ${total} team members total`;
  if (late === 0) return `${checkedIn} checked in, ${absent} absent, ${total} team members total`;
  return `${checkedIn} checked in, ${late} late, ${absent} absent out of ${total} team members`;
}

export function getManagerHealthScore(
  openExceptions: number,
  criticalAlerts: number,
  pendingLeaves: number,
  absentToday: number
): ManagerSummary["overallHealth"] {
  const actionCount = openExceptions + criticalAlerts + pendingLeaves;
  if (criticalAlerts >= 1 || absentToday >= 3) {
    return {
      score: "critical",
      narrative: `${actionCount} items need your immediate attention`,
      actionCount,
    };
  }
  if (actionCount >= 3) {
    return {
      score: "attention",
      narrative: `${actionCount} items need your attention`,
      actionCount,
    };
  }
  if (actionCount > 0) {
    return {
      score: "attention",
      narrative: `${actionCount} item(s) need your attention`,
      actionCount,
    };
  }
  return { score: "good", narrative: "Team is performing well", actionCount: 0 };
}

export function getManagerHeadline(healthScore: string, absent: number): string {
  if (healthScore === "critical") return "Your team needs attention today";
  if (healthScore === "attention") return "Your team has items requiring attention";
  if (absent === 0) return "Your team is doing well today";
  return "Team overview for today";
}

export function getTeamAttendanceTrendNarrative(
  productivityScores: ProductivityListResponse | undefined
): ManagerSummary["teamAttendanceTrend"] {
  if (!productivityScores?.scores?.length) {
    return { thisMonth: null, narrative: "No productivity data for this month yet" };
  }
  const total = productivityScores.scores.reduce((sum, s) => sum + Number(s.score), 0);
  const value = Math.round(total / productivityScores.scores.length);
  if (value >= 85) return { thisMonth: value, narrative: "Team productivity is strong this month" };
  if (value >= 70) return { thisMonth: value, narrative: "Team productivity is moderate this month" };
  return { thisMonth: value, narrative: "Team productivity needs attention" };
}

export function getAdminHealthScore(
  topPriorityItems: AdminSummary["topPriorityItems"]
): AdminSummary["overallHealth"] {
  const critical = topPriorityItems.filter((p) => p.severity === "critical").length;
  const high = topPriorityItems.filter((p) => p.severity === "high").length;
  const n = topPriorityItems.length;
  if (critical >= 2) {
    return { score: "critical", narrative: "Multiple critical items require immediate attention" };
  }
  if (critical >= 1 || high >= 2) {
    return { score: "attention", narrative: `${n} priority items need attention` };
  }
  if (n > 0) {
    return { score: "attention", narrative: `${n} item(s) on the priority list` };
  }
  return { score: "good", narrative: "Workforce health is good — all queues are clear" };
}

export function getAdminPriorityItems(
  overdueAlerts: AlertResponse[] | undefined,
  criticalAlerts: AlertResponse[] | undefined,
  pendingExceptions: AttendanceExceptionListResponse | undefined,
  pendingMC: MedicalCertificateListResponse | undefined,
  mcExpiringSoonAlerts: AlertResponse[] | undefined
): AdminSummary["topPriorityItems"] {
  const overdueCount = overdueAlerts?.length ?? 0;
  const criticalCount = criticalAlerts?.length ?? 0;
  const pendingExc = pendingExceptions?.total ?? 0;
  const pendingMCCount = pendingMC?.total ?? 0;
  const mcExpiringCount = mcExpiringSoonAlerts?.length ?? 0;

  const items: AdminSummary["topPriorityItems"] = [];

  if (overdueCount > 0) {
    items.push({ label: "Overdue alerts", count: overdueCount, severity: "critical" });
  }
  if (criticalCount > 0) {
    items.push({ label: "Critical open alerts", count: criticalCount, severity: "critical" });
  }
  if (pendingExc > 0) {
    items.push({ label: "Pending exceptions", count: pendingExc, severity: "high" });
  }
  if (pendingMCCount > 0) {
    items.push({ label: "Pending MC reviews", count: pendingMCCount, severity: "high" });
  }
  if (mcExpiringCount > 0) {
    items.push({ label: "MC expiring soon", count: mcExpiringCount, severity: "medium" });
  }

  const severityOrder = { critical: 0, high: 1, medium: 2 };
  return items
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
    .slice(0, 3);
}

export function getAdminHeadline(score: AdminSummary["overallHealth"]["score"]): string {
  if (score === "critical") return "Workforce needs immediate attention";
  if (score === "attention") return "Workforce has items requiring attention";
  return "Workforce overview — all clear";
}

// ─────────────────────────────────────────────
// MAIN COMPUTE FUNCTIONS
// ─────────────────────────────────────────────

/**
 * Computes a strongly-typed narrative summary for a worker (self-service role).
 * All fields are optional — returns sensible defaults when data is absent.
 */
export function computeWorkerSummary(data: WorkerHookData): WorkerSummary {
  const rate = computeAttendanceRateFromSummary(data.monthAttendanceSummary);
  const rateNarrative = getAttendanceNarrative(rate);

  // Today status — todayAttendance is the logs array
  const todayLogs = data.todayAttendance ?? [];
  const todayLog = todayLogs[0];
  const checkedIn =
    todayLog != null && todayLog.status !== "absent" && todayLog.status !== "off";
  const checkInTime = checkedIn ? (todayLog?.checkIn ?? undefined) : undefined;
  const statusLabel = todayLog?.status
    ? todayLog.status.charAt(0).toUpperCase() + todayLog.status.slice(1)
    : "Not checked in";

  const headline = getWorkerHeadline(checkedIn, rate);

  const annualRemaining = data.leaveBalance?.annualLeaveRemaining ?? null;
  const medicalRemaining = data.leaveBalance?.medicalLeaveRemaining ?? null;

  // Hours worked this month — sum totalHours across all items
  let hoursWorked: number | null = null;
  if (data.monthAttendanceSummary?.items?.length) {
    hoursWorked = data.monthAttendanceSummary.items.reduce(
      (sum, item) => sum + parseFloat(item.totalHours || "0"),
      0
    );
    if (
      hoursWorked === 0 &&
      data.monthAttendanceSummary.items.every((i) => !i.totalHours)
    ) {
      hoursWorked = null;
    }
  }

  // Pending leaves self-filtered (Dashboard already pre-filters by userId)
  const pendingCount = data.myPendingLeaves?.total ?? 0;
  const pendingNarrative =
    pendingCount === 0
      ? "No pending leave requests"
      : pendingCount === 1
      ? "1 leave request pending approval"
      : `${pendingCount} leave requests pending approval`;

  // My alerts (Dashboard pre-scopes to this user)
  const myAlerts = data.myAlerts ?? [];
  const openStatuses = ["new", "acknowledged", "in_progress"];
  const alertCount = myAlerts.length;
  const criticalCount = myAlerts.filter(
    (a) => a.severity === "critical" && openStatuses.includes(a.status)
  ).length;

  let alertNarrative = "No alerts at this time";
  if (alertCount > 0) {
    alertNarrative =
      criticalCount > 0
        ? `${alertCount} alert(s), ${criticalCount} critical`
        : `${alertCount} alert(s) requiring attention`;
  }

  return {
    headline,
    todayStatus: { checkedIn, checkInTime, statusLabel },
    attendanceRateThisMonth: {
      value: rate,
      label: rate !== null ? `${rate}%` : "—",
      narrative: rateNarrative,
    },
    leaveBalance: {
      annualRemaining,
      medicalRemaining,
      narrative: getLeaveBalanceNarrative(annualRemaining, medicalRemaining),
    },
    hoursWorkedThisMonth: {
      value: hoursWorked,
      narrative:
        hoursWorked !== null
          ? `${Math.round(hoursWorked)} hours logged this month`
          : "No hours data available yet",
    },
    faceVerification: {
      lastAttempt: data.faceAttempts?.attempts?.[0] ?? null,
      narrative: getFaceVerificationNarrative(data.faceAttempts?.attempts),
    },
    pendingLeaves: { count: pendingCount, narrative: pendingNarrative },
    myAlerts: { count: alertCount, critical: criticalCount, narrative: alertNarrative },
  };
}

/**
 * Computes a strongly-typed narrative summary for a manager role.
 * todayAttendance is the raw AttendanceListResponse object; the function extracts .logs.
 */
export function computeManagerSummary(data: ManagerHookData): ManagerSummary {
  const logs = data.todayAttendance ?? [];
  const checkedIn = logs.filter((i) => i.status === "present" || i.status === "late").length;
  const late = logs.filter((i) => i.status === "late").length;
  const absent = logs.filter((i) => i.status === "absent").length;
  const total = data.totalUsers ?? logs.length;

  const teamTodayNarrative = getTeamTodayNarrative(checkedIn, late, absent, total);
  const trend = getTeamAttendanceTrendNarrative(data.productivityScores);

  const openStatuses = ["open", "under_review", "escalated"];
  const openExceptions =
    data.teamExceptions?.exceptions?.filter((e) => openStatuses.includes(e.status))
      .length ?? 0;
  const exceptionsNarrative =
    openExceptions === 0
      ? "No open exceptions"
      : openExceptions === 1
      ? "1 exception needs review"
      : `${openExceptions} exceptions need review`;

  const teamAlerts = data.teamAlerts ?? [];
  const alertOpenStatuses = ["new", "acknowledged", "in_progress"];
  const alertTotal = teamAlerts.filter((a) => alertOpenStatuses.includes(a.status)).length;
  const criticalCount = teamAlerts.filter(
    (a) => a.severity === "critical" && alertOpenStatuses.includes(a.status)
  ).length;
  const alertsNarrative =
    alertTotal === 0
      ? "No active alerts"
      : criticalCount > 0
      ? `${alertTotal} active alert(s), ${criticalCount} critical`
      : `${alertTotal} active alert(s)`;

  const pendingLeaveCount = data.pendingLeaveCount ?? 0;
  const pendingLeaveNarrative =
    pendingLeaveCount === 0
      ? "No pending leaves"
      : pendingLeaveCount === 1
      ? "1 leave pending review"
      : `${pendingLeaveCount} leaves pending review`;

  const health = getManagerHealthScore(openExceptions, criticalCount, pendingLeaveCount, absent);
  const headline = getManagerHeadline(health.score, absent);

  return {
    headline,
    teamToday: { checkedIn, absent, late, total, narrative: teamTodayNarrative },
    teamAttendanceTrend: trend,
    openExceptions: { count: openExceptions, narrative: exceptionsNarrative },
    alerts: { total: alertTotal, critical: criticalCount, narrative: alertsNarrative },
    pendingLeaves: { count: pendingLeaveCount, narrative: pendingLeaveNarrative },
    overallHealth: health,
  };
}

/**
 * Computes a strongly-typed narrative summary for an admin/HR role.
 */
export function computeAdminSummary(data: AdminHookData): AdminSummary {
  const openAlerts = data.openAlerts ?? [];
  const openAlertsCount = openAlerts.length;
  const overdueCount = data.overdueAlerts?.length ?? 0;
  const criticalCount = data.criticalAlerts?.length ?? 0;

  const workforceNarrative =
    openAlertsCount === 0
      ? "No open alerts — workforce is healthy"
      : openAlertsCount === 1
      ? "1 open alert in the system"
      : `${openAlertsCount} open alerts, ${criticalCount} critical`;

  const pendingMC = data.pendingCertificates?.total ?? 0;
  const pendingExceptions = data.pendingExceptions?.total ?? 0;
  const mcExpiringCount = data.mcExpiringSoonAlerts?.length ?? 0;

  const queuesNarrative =
    pendingMC === 0 && pendingExceptions === 0
      ? "All queues are clear"
      : [pendingMC > 0 ? `${pendingMC} MC review(s)` : null,
          pendingExceptions > 0 ? `${pendingExceptions} exception(s)` : null]
          .filter(Boolean)
          .join(", ") + " pending";

  const mcExpiringNarrative =
    mcExpiringCount === 0
      ? "No MCs expiring within the next 30 days"
      : mcExpiringCount === 1
      ? "1 MC certificate expiring within 30 days"
      : `${mcExpiringCount} MC certificates expiring within 30 days`;

  const productivityOutliers =
    data.productivityScores?.scores?.filter((s) => Number(s.score) < 60).length ?? 0;
  const productivityNarrative =
    productivityOutliers === 0
      ? "No significant productivity outliers"
      : productivityOutliers === 1
      ? "1 worker with low productivity this month"
      : `${productivityOutliers} workers with low productivity this month`;

  const topPriorityItems = getAdminPriorityItems(
    data.overdueAlerts,
    data.criticalAlerts,
    data.pendingExceptions,
    data.pendingCertificates,
    data.mcExpiringSoonAlerts
  );
  const overallHealth = getAdminHealthScore(topPriorityItems);
  const headline = getAdminHeadline(overallHealth.score);

  return {
    headline,
    workforceHealth: {
      openAlerts: openAlertsCount,
      overdueAlerts: overdueCount,
      criticalAlerts: criticalCount,
      narrative: workforceNarrative,
    },
    queues: {
      pendingMC,
      pendingLeaves: 0,
      pendingExceptions,
      narrative: queuesNarrative,
    },
    mcExpiringSoon: { count: mcExpiringCount, narrative: mcExpiringNarrative },
    productivityOutliers: { count: productivityOutliers, narrative: productivityNarrative },
    topPriorityItems,
    overallHealth,
  };
}
