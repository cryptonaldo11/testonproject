import React, { useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ADMIN_HR_ROLES, MANAGER_ROLES, SELF_SERVICE_ROLES, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/core";
import { Users, Clock, CalendarX, TrendingUp, AlertTriangle, FileText, Activity, CalendarDays, ShieldAlert, CheckSquare, Sparkles } from "lucide-react";
import { useListUsers, useListAttendance, useListLeaves, useListAlerts, useListMedicalCertificates, useListProductivityScores, useGetLeaveBalance, useGetAttendanceSummary, useGetProductivityReport, useListAttendanceExceptions, useListFaceVerificationAttemptsByUser } from "@workspace/api-client-react";
import {
  computeWorkerSummary,
  computeManagerSummary,
  computeAdminSummary,
  type WorkerSummary,
  type ManagerSummary,
  type AdminSummary,
} from "@/lib/aiSummaryService";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  trend?: string;
  trendUp?: boolean;
}

function StatCard({ title, value, icon: Icon, trend, trendUp }: StatCardProps) {
  return (
    <Card className="hover:-translate-y-1 transition-transform duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-display font-bold">{value}</p>
          </div>
          <div className={`p-4 rounded-2xl ${trendUp ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 text-sm font-medium">
            <span className={trendUp ? "text-primary" : "text-muted-foreground"}>{trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TopPriorityItem {
  label: string;
  count: number;
  severity: string;
}

function AISummaryCard({ summary, role }: { summary: WorkerSummary | ManagerSummary | AdminSummary; role: "worker" | "manager" | "admin" }) {
  const getHealthColor = (score: string) => {
    switch (score) {
      case "good": return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "attention": return "bg-amber-50 text-amber-700 border-amber-200";
      case "critical": return "bg-red-50 text-red-700 border-red-200";
      default: return "bg-secondary/20 text-muted-foreground border-border";
    }
  };

  const getHealthLabel = (score: string) => {
    switch (score) {
      case "good": return "All clear";
      case "attention": return "Needs attention";
      case "critical": return "Action required";
      default: return "Unknown";
    }
  };

  const getHealthIcon = (score: string) => {
    if (score === "critical") return "🚨";
    if (score === "attention") return "⚠️";
    return "✅";
  };

  const healthScore = "overallHealth" in summary ? summary.overallHealth.score : "good";
  const healthClass = getHealthColor(healthScore);
  const healthLabel = getHealthLabel(healthScore);

  return (
    <div className={`mb-6 rounded-xl border-2 p-5 ${healthClass}`}>
      <div className="flex items-start gap-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="text-sm font-semibold uppercase tracking-wide">{role === "admin" ? "AI Overview" : role === "manager" ? "AI Team Summary" : "AI Summary"}</span>
        </div>
        <span className="ml-auto text-xs font-semibold px-2.5 py-0.5 rounded-full bg-white/60 border">
          {getHealthIcon(healthScore)} {healthLabel}
        </span>
      </div>
      <h3 className="mt-3 font-display text-xl font-bold">{summary.headline}</h3>
      <div className="mt-3 space-y-1.5 text-sm">
        {"todayStatus" in summary && (
          <p className="text-muted-foreground">{summary.todayStatus.statusLabel}</p>
        )}
        {"attendanceRateThisMonth" in summary && summary.attendanceRateThisMonth.narrative && (
          <p>{summary.attendanceRateThisMonth.narrative}</p>
        )}
        {"leaveBalance" in summary && (
          <p>{summary.leaveBalance.narrative}</p>
        )}
        {"faceVerification" in summary && (
          <p>{summary.faceVerification.narrative}</p>
        )}
        {"pendingLeaves" in summary && (
          <p>{summary.pendingLeaves.narrative}</p>
        )}
        {"myAlerts" in summary && summary.myAlerts.count > 0 && (
          <p className="font-medium">{summary.myAlerts.narrative}</p>
        )}
        {"teamToday" in summary && (
          <p>{summary.teamToday.narrative}</p>
        )}
        {"teamAttendanceTrend" in summary && summary.teamAttendanceTrend.narrative && (
          <p>{summary.teamAttendanceTrend.narrative}</p>
        )}
        {"openExceptions" in summary && summary.openExceptions.count > 0 && (
          <p>{summary.openExceptions.narrative}</p>
        )}
        {"alerts" in summary && summary.alerts.total > 0 && (
          <p className={summary.alerts.critical > 0 ? "font-semibold text-red-700" : ""}>{summary.alerts.narrative}</p>
        )}
        {"queues" in summary && (
          <p>{summary.queues.narrative}</p>
        )}
        {"mcExpiringSoon" in summary && summary.mcExpiringSoon.count > 0 && (
          <p>{summary.mcExpiringSoon.narrative}</p>
        )}
        {"productivityOutliers" in summary && summary.productivityOutliers.count > 0 && (
          <p>{summary.productivityOutliers.narrative}</p>
        )}
        {"topPriorityItems" in summary && summary.topPriorityItems.length > 0 && (
          <div className="mt-2 space-y-1">
            {(summary.topPriorityItems as TopPriorityItem[]).slice(0, 3).map((item: TopPriorityItem, i: number) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${item.severity === "critical" ? "bg-red-500" : item.severity === "high" ? "bg-amber-500" : "bg-yellow-400"}`} />
                <span className="font-medium">{item.count} {item.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const isManager = hasRole(MANAGER_ROLES);
  const isSelfService = hasRole(SELF_SERVICE_ROLES);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = String(new Date().getMonth() + 1);
  const currentYear = String(new Date().getFullYear());
  const currentYearNum = new Date().getFullYear();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const { data: usersData } = useListUsers({}, { query: { queryKey: ["dashboard", "users"], enabled: isAdminHR || isManager } });
  const { data: attendanceData } = useListAttendance({ startDate: today, endDate: today });
  const { data: leavesData } = useListLeaves({ status: "pending" }, { query: { queryKey: ["dashboard", "leaves"], enabled: isAdminHR || isManager } });
  const { data: alertsData } = useListAlerts({}, { query: { queryKey: ["dashboard", "alerts"], enabled: true } });
  const { data: certificatesData } = useListMedicalCertificates(
    { verificationStatus: "pending" },
    { query: { queryKey: ["dashboard", "medical-certificates", "pending"], enabled: isAdminHR } }
  );
  const { data: productivityData } = useListProductivityScores(
    isSelfService ? { userId: user?.id, month: currentMonth, year: currentYear } : { month: currentMonth, year: currentYear },
    { query: { queryKey: ["dashboard", "productivity", user?.id], enabled: true } }
  );

  // Worker-specific hooks
  const { data: leaveBalance } = useGetLeaveBalance(
    user?.id!,
    { year: currentYearNum },
    { query: { queryKey: ["dashboard", "leaveBalance", user?.id], enabled: !!user?.id } }
  );
  const { data: monthAttendanceSummary } = useGetAttendanceSummary(
    { startDate: monthStart, endDate: today },
    { query: { queryKey: ["dashboard", "monthAttendance", user?.id], enabled: !!user?.id } }
  );
  const { data: faceAttempts } = useListFaceVerificationAttemptsByUser(
    user?.id!,
    {},
    { query: { queryKey: ["dashboard", "faceAttempts", user?.id], enabled: !!user?.id } }
  );

  // Manager/Admin shared hooks
  const { data: teamExceptions } = useListAttendanceExceptions(
    {},
    { query: { queryKey: ["dashboard", "exceptions"], enabled: isManager || isAdminHR } }
  );

  // Worker: compute personal leave pending count
  const myPendingLeaveCount = (leavesData?.leaves ?? []).filter(l => l.userId === user?.id && l.status === "pending").length;
  const myPendingLeavesData = { leaves: (leavesData?.leaves ?? []).filter(l => l.userId === user?.id), total: myPendingLeaveCount };

  const workerSummary = useMemo(() => {
    if (!isSelfService) return null;
    return computeWorkerSummary({
      todayAttendance: attendanceData?.logs,
      leaveBalance,
      monthAttendanceSummary,
      faceAttempts,
      myPendingLeaves: myPendingLeavesData,
      myAlerts: (alertsData?.alerts ?? []).filter(a => a.userId === user?.id),
      userId: user?.id!,
      productivityScores: productivityData,
    });
  }, [isSelfService, attendanceData, leaveBalance, monthAttendanceSummary, faceAttempts, myPendingLeaveCount, leavesData, user?.id, alertsData, productivityData]);

  const managerSummary = useMemo(() => {
    if (!isManager) return null;
    const pendingLeaveCount = leavesData?.total ?? 0;
    return computeManagerSummary({
      todayAttendance: attendanceData?.logs,
      teamExceptions,
      teamAlerts: (alertsData?.alerts ?? []).filter(a => {
        if (a.status === "resolved" || a.status === "dismissed") return false;
        if (a.severity === "critical") return true;
        return true;
      }),
      pendingLeaveCount,
      productivityScores: productivityData,
      totalUsers: usersData?.total ?? 0,
    });
  }, [isManager, attendanceData, teamExceptions, alertsData, leavesData, productivityData, usersData]);

  const adminSummary = useMemo(() => {
    if (!isAdminHR) return null;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const openAlerts = (alertsData?.alerts ?? []).filter(a => a.status !== "resolved" && a.status !== "dismissed");
    const overdueAlerts = openAlerts.filter(a => a.relatedDate && a.relatedDate < todayStr && a.status !== "resolved" && a.status !== "dismissed");
    const mcExpiringSoon = openAlerts.filter(a => a.alertType === "mc_expiring_soon" || a.alertType === "mc_expired");
    return computeAdminSummary({
      openAlerts,
      overdueAlerts,
      criticalAlerts: openAlerts.filter(a => a.severity === "critical"),
      pendingExceptions: teamExceptions,
      pendingCertificates: certificatesData,
      productivityScores: productivityData,
      mcExpiringSoonAlerts: mcExpiringSoon,
    });
  }, [isAdminHR, alertsData, teamExceptions, certificatesData, productivityData]);

  const activeUsers = usersData?.users?.filter((u) => u.isActive === "true").length || 0;
  const presentToday = attendanceData?.logs?.filter((l) => l.status === "present").length || 0;
  const pendingLeaves = leavesData?.total || 0;
  const pendingCertificateReviews = certificatesData?.total || 0;
  const openWorkflowAlerts = alertsData?.alerts?.filter((alert) => ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const assignedAlerts = alertsData?.alerts?.filter((alert) => alert.assignedTo === user?.id && ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const unresolvedCriticalAlerts = alertsData?.alerts?.filter((alert) => alert.severity === "critical" && ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const productivityAverage = productivityData?.scores?.length
    ? Math.round(productivityData.scores.reduce((sum, item) => sum + Number(item.score), 0) / productivityData.scores.length)
    : 0;

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold">Welcome back, {user?.name}</h1>
        <p className="text-muted-foreground mt-1">Here&apos;s what&apos;s happening today across your Teston workspace.</p>
      </div>

      {isAdminHR ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard title="Total Active Employees" value={activeUsers} icon={Users} trend="Across the current workforce" trendUp={true} />
            <StatCard title="Present Today" value={presentToday} icon={Clock} trend="Live attendance snapshot" trendUp={true} />
            <StatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarX} trend="Awaiting workflow review" trendUp={false} />
            <StatCard title="Pending MC Reviews" value={pendingCertificateReviews} icon={CheckSquare} trend="Compliance queue" trendUp={false} />
          </div>
          {adminSummary && (
            <AISummaryCard summary={adminSummary} role="admin" />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Workflow queue</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border bg-secondary/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Open alerts</p>
                      <p className="mt-1 text-2xl font-display font-bold">{openWorkflowAlerts}</p>
                    </div>
                    <AlertTriangle className="h-6 w-6 text-destructive" />
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Assigned to me</p>
                      <p className="mt-1 text-2xl font-display font-bold">{assignedAlerts}</p>
                    </div>
                    <CheckSquare className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="rounded-xl border bg-secondary/20 p-4 text-sm text-muted-foreground">
                  Use alerts and certificate queues to assign ownership, capture review notes, and keep compliance work moving.
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <a href="/users" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                  <Users className="w-5 h-5" />
                  Review employees
                </a>
                <a href="/medical-certificates" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <CheckSquare className="w-5 h-5" />
                  Review certificates
                </a>
                <a href="/alerts" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <AlertTriangle className="w-5 h-5" />
                  Investigate alerts
                </a>
                <a href="/reports/manhours" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <CalendarDays className="w-5 h-5" />
                  View man-hours
                </a>
              </CardContent>
            </Card>
          </div>
        </>
      ) : isManager ? (
        <>
          {managerSummary && (
            <AISummaryCard summary={managerSummary} role="manager" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard title="Present Today" value={presentToday} icon={Clock} trend="Operations pulse" trendUp={true} />
            <StatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarX} trend="Awaiting review" trendUp={false} />
            <StatCard title="Assigned Alerts" value={assignedAlerts} icon={AlertTriangle} trend="My workflow queue" trendUp={false} />
            <StatCard title="Critical Alerts" value={unresolvedCriticalAlerts} icon={ShieldAlert} trend="Needs escalation" trendUp={false} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Manager overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-muted-foreground">
                <div className="rounded-xl border bg-secondary/20 p-4">
                  Track attendance, leave requests, assigned alerts, and critical exceptions across your department from one place.
                </div>
                <div className="rounded-xl border bg-secondary/20 p-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Team productivity average</p>
                    <p className="mt-1 text-2xl font-display font-bold text-foreground">{productivityAverage || 0}/100</p>
                  </div>
                  <Activity className="h-6 w-6 text-primary" />
                </div>
                <div className="rounded-xl border bg-secondary/20 p-4">
                  Manager access is scoped to your department, so these summaries reflect your team instead of the full workforce.
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <a href="/attendance" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                  <Clock className="w-5 h-5" />
                  Review team attendance
                </a>
                <a href="/alerts" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <AlertTriangle className="w-5 h-5" />
                  Work assigned alerts
                </a>
                <a href="/leaves" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <CalendarX className="w-5 h-5" />
                  Review leave requests
                </a>
                <a href="/productivity" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <Activity className="w-5 h-5" />
                  Review team productivity
                </a>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <>
          {workerSummary && (
            <AISummaryCard summary={workerSummary} role="worker" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard
              title="My Attendance Rate"
              value={workerSummary?.attendanceRateThisMonth.label ?? "—"}
              icon={TrendingUp}
              trend={workerSummary?.attendanceRateThisMonth.narrative ?? ""}
              trendUp={workerSummary?.attendanceRateThisMonth?.value != null && workerSummary?.attendanceRateThisMonth?.value >= 85}
            />
            <StatCard
              title="Annual Leave"
              value={leaveBalance ? `${leaveBalance.annualLeaveRemaining ?? "—"} Days` : "—"}
              icon={CalendarX}
              trend={workerSummary?.leaveBalance.narrative ?? ""}
            />
            <StatCard
              title="Hours This Month"
              value={workerSummary?.hoursWorkedThisMonth?.value !== null && workerSummary?.hoursWorkedThisMonth?.value !== undefined ? `${Math.round(Number(workerSummary.hoursWorkedThisMonth.value))} hrs` : "—"}
              icon={Clock}
              trend={workerSummary?.hoursWorkedThisMonth.narrative ?? ""}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <Card className="lg:col-span-2 border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Recent Announcements</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border bg-secondary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-bold uppercase tracking-wider">Company</span>
                      <span className="text-xs text-muted-foreground">Today</span>
                    </div>
                    <h4 className="font-semibold mb-1">Safety Briefing for New Project Sites</h4>
                    <p className="text-sm text-muted-foreground">All site supervisors must attend the mandatory safety briefing tomorrow morning at 8:00 AM.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <a href="/attendance/checkin" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                  <Clock className="w-5 h-5" />
                  Check In / Out
                </a>
                <a href="/leaves" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <CalendarX className="w-5 h-5" />
                  Apply for Leave
                </a>
                <a href="/medical-certificates" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold">
                  <FileText className="w-5 h-5" />
                  Upload MC
                </a>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
