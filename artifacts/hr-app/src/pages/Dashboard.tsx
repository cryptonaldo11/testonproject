import React, { useEffect, useMemo } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ADMIN_HR_ROLES, MANAGER_ROLES, SELF_SERVICE_ROLES, useAuth } from "@/lib/auth";
import { trackKpiEvent } from "@/lib/kpiTracking";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Clock, CalendarX, TrendingUp, TrendingDown, AlertTriangle, FileText, Activity, CalendarDays, ShieldAlert, CheckSquare, Sparkles, Building2, ScanFace, ArrowRight } from "lucide-react";
import {
  OpsHero,
  OpsPageHeader,
  OpsQueueNotice,
  OpsSection,
} from "@/components/ui/ops-cockpit";
import { useListUsers, useListWorkers, useListDepartments, useListAttendance, useListLeaves, useListAlerts, useListMedicalCertificates, useListProductivityScores, useGetLeaveBalance, useGetAttendanceSummary, useListAttendanceExceptions, useListFaceVerificationAttemptsByUser } from "@workspace/api-client-react";
import {
  computeWorkerSummary,
  computeManagerSummary,
  computeAdminSummary,
  type WorkerSummary,
  type ManagerSummary,
  type AdminSummary,
} from "@/lib/aiSummaryService";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
} from "recharts";
import type { ProductivityScoreResponse } from "@workspace/api-client-react";

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

interface GoLiveChecklistItem {
  label: string;
  description: string;
  done: boolean;
  href: string;
  cta: string;
}

function GoLiveCenter({ items, loading }: { items: GoLiveChecklistItem[]; loading: boolean }) {
  const completed = items.filter((item) => item.done).length;
  const progressPercent = items.length === 0 ? 0 : Math.round((completed / items.length) * 100);

  return (
    <Card className="mb-8 border-0 shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-primary" />
              Go-Live Center
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Track setup readiness before rolling Phase 4A into wider internal use.
            </p>
          </div>
          <div className="rounded-xl border bg-secondary/20 px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Readiness</p>
            <p className="text-2xl font-display font-bold">{loading ? "—" : `${completed}/${items.length}`}</p>
            <p className="text-xs text-muted-foreground">{loading ? "Loading status" : `${progressPercent}% complete`}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {items.map((item) => (
              <a key={item.label} href={item.href} className="rounded-xl border bg-secondary/20 p-4 transition-colors hover:bg-accent">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${item.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {item.done ? "Ready" : "Needs setup"}
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm font-medium">
                  <span>{item.cta}</span>
                  <ArrowRight className="h-4 w-4" />
                </div>
              </a>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
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

// ─── Productivity Chart Components ───────────────────────────────────────────

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getBarColor(score: number): string {
  if (score >= 80) return "#22c55e"; // green-500
  if (score >= 60) return "#f59e0b"; // amber-500
  return "#ef4444"; // red-500
}

interface WorkerProductivityTrendProps {
  scores: ProductivityScoreResponse[];
  userId: number;
}

function WorkerProductivityTrend({ scores, userId }: WorkerProductivityTrendProps) {
  const chartData = useMemo(() => {
    // Filter to the worker's own scores and sort by year-month
    const myScores = scores
      .filter((s) => s.userId === userId)
      .sort((a, b) => {
        const ma = new Date(Number(a.year), Number(a.month) - 1).getTime();
        const mb = new Date(Number(b.year), Number(b.month) - 1).getTime();
        return ma - mb;
      })
      .slice(-6);

    return myScores.map((s) => ({
      label: `${MONTH_SHORT[Number(s.month) - 1]}`,
      score: Number(s.score),
      fullLabel: `${MONTH_SHORT[Number(s.month) - 1]} ${s.year}`,
    }));
  }, [scores, userId]);

  if (chartData.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader><CardTitle>Productivity Trend</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No productivity data available yet.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Productivity Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="label" tick={{ fontSize: 12, className: "text-muted-foreground" }} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, className: "text-muted-foreground" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "0.5rem",
                fontSize: "0.75rem",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              labelFormatter={(_label, payload) => {
                const entry = payload?.[0]?.payload as typeof chartData[0] | undefined;
                return entry?.fullLabel ?? "";
              }}
              formatter={(value: number) => [`${value}/100`, "Score"]}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface ManagerTeamChartProps {
  scores: ProductivityScoreResponse[];
  userLabelMap: Map<number, string>;
}

function ManagerTeamProductivityChart({ scores, userLabelMap }: ManagerTeamChartProps) {
  const chartData = useMemo(() => {
    const latest = new Map<string, ProductivityScoreResponse>();
    scores.forEach((s) => {
      const key = `${s.userId}`;
      const existing = latest.get(key);
      if (!existing) {
        latest.set(key, s);
      } else {
        const ek = new Date(Number(existing.year), Number(existing.month) - 1).getTime();
        const sk = new Date(Number(s.year), Number(s.month) - 1).getTime();
        if (sk > ek) latest.set(key, s);
      }
    });
    return Array.from(latest.entries())
      .map(([_, score]) => ({
        name: userLabelMap.get(score.userId) ?? `User ${score.userId}`,
        score: Number(score.score),
        attendanceRate: Number(score.attendanceRate),
      }))
      .sort((a, b) => b.score - a.score);
  }, [scores, userLabelMap]);

  const avgScore =
    chartData.length > 0
      ? Math.round(chartData.reduce((sum, d) => sum + d.score, 0) / chartData.length)
      : 0;

  const avgData = chartData.map((d) => ({ name: d.name, avg: avgScore }));

  if (chartData.length === 0) {
    return (
      <Card className="mb-6">
        <CardHeader><CardTitle>Team Productivity</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No team productivity data available yet.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          Team Productivity
          <span className="ml-auto text-sm font-normal text-muted-foreground">
            Avg: {avgScore}/100
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, className: "text-muted-foreground" }}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={52}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12, className: "text-muted-foreground" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--background)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "0.5rem",
                fontSize: "0.75rem",
                boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
              }}
              formatter={(value: number, name: string) => {
                if (name === "avg") return [`${value}/100`, "Team Avg"];
                return [`${value}/100`, "Score"];
              }}
            />
            <Bar dataKey="score" radius={[4, 4, 0, 0]} fill="#3b82f6" name="Score">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.score)} />
              ))}
            </Bar>
            <Line type="monotone" dataKey="avg" stroke="#94a3b8" strokeWidth={2} dot={false} name="Avg" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

interface AdminProductivitySectionProps {
  scores: ProductivityScoreResponse[];
  userLabelMap: Map<number, string>;
}

function AdminProductivitySection({ scores, userLabelMap }: AdminProductivitySectionProps) {
  const distributionData = useMemo(() => {
    let low = 0, mid = 0, high = 0;
    scores.forEach((s) => {
      const score = Number(s.score);
      if (score >= 80) high++;
      else if (score >= 60) mid++;
      else low++;
    });
    return [
      { label: "0–59", labelFull: "At Risk (< 60)", count: low, fill: "#ef4444" },
      { label: "60–79", labelFull: "Needs Attention (60–79)", count: mid, fill: "#f59e0b" },
      { label: "80–100", labelFull: "Good (80+)", count: high, fill: "#22c55e" },
    ];
  }, [scores]);

  const ranked = useMemo(() => {
    return [...scores]
      .map((s) => ({ ...s, numericScore: Number(s.score), label: userLabelMap.get(s.userId) ?? `User ${s.userId}` }))
      .sort((a, b) => b.numericScore - a.numericScore);
  }, [scores, userLabelMap]);

  const top5 = ranked.slice(0, 5);
  const bottom5 = ranked.slice(-5).reverse();

  const totalEmployees = scores.length;
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + Number(s.score), 0) / scores.length)
    : 0;

  return (
    <div className="space-y-6 mb-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Score Distribution
              <span className="ml-auto text-sm font-normal text-muted-foreground">
                {totalEmployees} employees
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={distributionData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 12, className: "text-muted-foreground" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, className: "text-muted-foreground" }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    padding: "0.5rem",
                    fontSize: "0.75rem",
                    boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                  labelFormatter={(_label, payload) => {
                    const entry = payload?.[0]?.payload as typeof distributionData[0] | undefined;
                    return entry?.labelFull ?? "";
                  }}
                  formatter={(value: number) => [`${value} employees`, "Count"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Summary stats */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Workforce Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-3xl font-display font-bold">{avgScore}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg Score /100</p>
              </div>
              <div className="rounded-xl border bg-muted/30 p-4 text-center">
                <p className="text-3xl font-display font-bold">{totalEmployees}</p>
                <p className="text-xs text-muted-foreground mt-1">Employees Scored</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-2xl font-display font-bold text-emerald-600">{distributionData[2].count}</p>
                <p className="text-xs text-emerald-700 mt-1">Good (80+)</p>
              </div>
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center">
                <p className="text-2xl font-display font-bold text-red-600">{distributionData[0].count}</p>
                <p className="text-xs text-red-700 mt-1">At Risk (&lt;60)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top and Bottom performers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              Top 5 Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-2">
                {top5.map((entry, i) => (
                  <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium">{entry.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
                        {entry.numericScore}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-red-500" />
              Bottom 5 Performers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {bottom5.length === 0 ? (
              <p className="text-sm text-muted-foreground">No data yet.</p>
            ) : (
              <div className="space-y-2">
                {bottom5.map((entry, i) => {
                  const colorClass =
                    entry.numericScore < 60
                      ? "bg-red-100 text-red-700"
                      : "bg-amber-100 text-amber-700";
                  return (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                          {ranked.length - i}
                        </span>
                        <span className="text-sm font-medium">{entry.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${colorClass}`}>
                          {entry.numericScore}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const isManager = hasRole(MANAGER_ROLES);
  const isSelfService = hasRole(SELF_SERVICE_ROLES);

  useEffect(() => {
    trackKpiEvent({ name: "dashboard_viewed", properties: { role: isAdminHR ? "admin_hr" : isManager ? "manager" : isSelfService ? "worker" : "unknown" } });
  }, []);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = String(new Date().getMonth() + 1);
  const currentYear = String(new Date().getFullYear());
  const currentYearNum = new Date().getFullYear();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const { data: usersData, isLoading: usersLoading } = useListUsers({}, { query: { queryKey: ["dashboard", "users"], enabled: isAdminHR || isManager } });
  const { data: workersData, isLoading: workersLoading } = useListWorkers(undefined, { query: { queryKey: ["dashboard", "workers"], enabled: isAdminHR } });
  const { data: departmentsData, isLoading: departmentsLoading } = useListDepartments({ query: { queryKey: ["dashboard", "departments"], enabled: isAdminHR } });
  const { data: attendanceData, isLoading: attendanceLoading } = useListAttendance({ startDate: today, endDate: today });
  const { data: leavesData, isLoading: leavesLoading } = useListLeaves({ status: "pending" }, { query: { queryKey: ["dashboard", "leaves"], enabled: isAdminHR || isManager } });
  const { data: alertsData } = useListAlerts({}, { query: { queryKey: ["dashboard", "alerts"], enabled: true } });
  const { data: certificatesData } = useListMedicalCertificates(
    { verificationStatus: "pending" },
    { query: { queryKey: ["dashboard", "medical-certificates", "pending"], enabled: isAdminHR } }
  );
  const { data: productivityData, isLoading: productivityLoading } = useListProductivityScores(
    isSelfService ? { userId: user?.id, month: currentMonth, year: currentYear } : { month: currentMonth, year: currentYear },
    { query: { queryKey: ["dashboard", "productivity", user?.id], enabled: true } }
  );

  // Worker trend: fetch all productivity scores for the current user (to show 6-month trend)
  const { data: trendData } = useListProductivityScores(
    { userId: user?.id },
    {
      query: {
        queryKey: ["dashboard", "productivity", "trend", user?.id],
        enabled: isSelfService && !!user?.id,
      },
    }
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
  const departmentsCount = departmentsData?.departments?.length || 0;
  const workersCount = workersData?.workers?.length || 0;
  const registeredWorkersCount = workersData?.workers?.filter((worker) => worker.hasFaceRegistered).length || 0;
  const presentToday = attendanceData?.logs?.filter((l) => l.status === "present").length || 0;
  const pendingLeaves = leavesData?.total || 0;
  const pendingCertificateReviews = certificatesData?.total || 0;
  const openWorkflowAlerts = alertsData?.alerts?.filter((alert) => ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const assignedAlerts = alertsData?.alerts?.filter((alert) => alert.assignedTo === user?.id && ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const unresolvedCriticalAlerts = alertsData?.alerts?.filter((alert) => alert.severity === "critical" && ["new", "acknowledged", "in_progress"].includes(alert.status)).length || 0;
  const productivityAverage = productivityData?.scores?.length
    ? Math.round(productivityData.scores.reduce((sum, item) => sum + Number(item.score), 0) / productivityData.scores.length)
    : 0;
  const userLabelMap = useMemo(() => {
    const map = new Map<number, string>();
    usersData?.users?.forEach((u) => {
      map.set(u.id, u.name ?? `User ${u.id}`);
    });
    return map;
  }, [usersData?.users]);

  const goLiveItems: GoLiveChecklistItem[] = [
    {
      label: "Departments configured",
      description: departmentsCount > 0 ? `${departmentsCount} departments available for team scoping.` : "Set up departments before assigning teams and reporting lines.",
      done: departmentsCount > 0,
      href: "/departments",
      cta: departmentsCount > 0 ? "Review departments" : "Set up departments",
    },
    {
      label: "Employees imported",
      description: activeUsers > 0 ? `${activeUsers} active employee accounts are available.` : "Add employees so they can log in and appear in operational workflows.",
      done: activeUsers > 0,
      href: "/users",
      cta: activeUsers > 0 ? "Review employees" : "Add employees",
    },
    {
      label: "Face registration started",
      description: workersCount > 0 ? `${registeredWorkersCount} of ${workersCount} workers have registered face descriptors.` : "Enroll workers for biometric check-in and fallback coverage.",
      done: workersCount > 0 && registeredWorkersCount > 0,
      href: "/face-registration",
      cta: registeredWorkersCount > 0 ? "Continue registration" : "Start registration",
    },
    {
      label: "Operational workflows active",
      description: openWorkflowAlerts > 0 || pendingCertificateReviews > 0 || presentToday > 0
        ? `${openWorkflowAlerts} open alerts, ${pendingCertificateReviews} pending certificate reviews, ${presentToday} present today.`
        : "Verify attendance, alerts, and certificate workflows before wider rollout.",
      done: openWorkflowAlerts > 0 || pendingCertificateReviews > 0 || presentToday > 0,
      href: pendingCertificateReviews > 0 ? "/medical-certificates" : "/alerts",
      cta: pendingCertificateReviews > 0 ? "Review certificates" : "Review workflows",
    },
  ];

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title={`Welcome back, ${user?.name}`}
        description="See the clearest operational signals for your role first: status, emerging insight, and the fastest next action for today’s workforce work."
      />

      <OpsHero
        badge={isAdminHR ? "Admin / HR control center" : isManager ? "Manager operations view" : "Worker daily view"}
        icon={isAdminHR ? Building2 : isManager ? Activity : Clock}
        tone={unresolvedCriticalAlerts > 0 ? "attention" : "default"}
        title={isAdminHR ? "Coordinate workforce health, compliance, and readiness from one command surface." : isManager ? "Keep team attendance, productivity, and queue ownership aligned." : "See today’s work status, then act with confidence."}
        description={isAdminHR
          ? "The dashboard now frames open work as queues and readiness checks, without changing the data contracts behind attendance, alerts, certificates, or labor reporting."
          : isManager
            ? "Your role-aware view keeps the same team data, but now foregrounds the queues and risk indicators most likely to need a decision today."
            : "Your personal view keeps existing self-service behavior while making leave balance, attendance, and next actions easier to understand at a glance."}
      >
        <OpsQueueNotice
          tone={unresolvedCriticalAlerts > 0 ? "attention" : "default"}
          title={isAdminHR || isManager ? `${unresolvedCriticalAlerts} critical alert${unresolvedCriticalAlerts === 1 ? "" : "s"} still open` : `${myPendingLeaveCount} pending leave request${myPendingLeaveCount === 1 ? "" : "s"}`}
          description={isAdminHR || isManager
            ? "Use critical signals and assigned work to decide where to intervene first, then capture notes in the relevant queue page."
            : "Use the action buttons below to complete attendance, submit leave, or upload supporting documents without losing visibility into status."}
        />
      </OpsHero>

      {isAdminHR ? (
        <>
          <GoLiveCenter items={goLiveItems} loading={usersLoading || workersLoading || departmentsLoading || attendanceLoading} />
          {usersLoading || attendanceLoading || leavesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard title="Total Active Employees" value={activeUsers} icon={Users} trend="Across the current workforce" trendUp={true} />
              <StatCard title="Present Today" value={presentToday} icon={Clock} trend="Live attendance snapshot" trendUp={true} />
              <StatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarX} trend="Awaiting workflow review" trendUp={false} />
              <StatCard title="Pending MC Reviews" value={pendingCertificateReviews} icon={CheckSquare} trend="Compliance queue" trendUp={false} />
            </div>
          )}
          {adminSummary && (
            <AdminProductivitySection scores={productivityData?.scores ?? []} userLabelMap={userLabelMap} />
          )}
          {adminSummary && (
            <AISummaryCard summary={adminSummary} role="admin" />
          )}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <OpsSection
              title="Workflow queue"
              description="Use queue counts to decide where intervention is needed first, then jump into the underlying workflow pages."
              className="lg:col-span-2 border-0 shadow-lg"
            >
              <div className="space-y-4">
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
              </div>
            </OpsSection>

            <Card className="border-0 shadow-lg">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <a href="/users" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "review_employees", role: "admin_hr" } })}>
                  <Users className="w-5 h-5" />
                  Review employees
                </a>
                <a href="/medical-certificates" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "review_certificates", role: "admin_hr" } })}>
                  <CheckSquare className="w-5 h-5" />
                  Review certificates
                </a>
                <a href="/alerts" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "investigate_alerts", role: "admin_hr" } })}>
                  <AlertTriangle className="w-5 h-5" />
                  Investigate alerts
                </a>
                <a href="/reports/manhours" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "view_manhours", role: "admin_hr" } })}>
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
            <ManagerTeamProductivityChart scores={productivityData?.scores ?? []} userLabelMap={userLabelMap} />
          )}
          {managerSummary && (
            <AISummaryCard summary={managerSummary} role="manager" />
          )}
          {usersLoading || attendanceLoading || leavesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <StatCard title="Present Today" value={presentToday} icon={Clock} trend="Operations pulse" trendUp={true} />
              <StatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarX} trend="Awaiting review" trendUp={false} />
              <StatCard title="Assigned Alerts" value={assignedAlerts} icon={AlertTriangle} trend="My workflow queue" trendUp={false} />
              <StatCard title="Critical Alerts" value={unresolvedCriticalAlerts} icon={ShieldAlert} trend="Needs escalation" trendUp={false} />
            </div>
          )}
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
                <a href="/attendance" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "review_team_attendance", role: "manager" } })}>
                  <Clock className="w-5 h-5" />
                  Review team attendance
                </a>
                <a href="/alerts" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "work_assigned_alerts", role: "manager" } })}>
                  <AlertTriangle className="w-5 h-5" />
                  Work assigned alerts
                </a>
                <a href="/leaves" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "review_leave_requests", role: "manager" } })}>
                  <CalendarX className="w-5 h-5" />
                  Review leave requests
                </a>
                <a href="/productivity" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "review_team_productivity", role: "manager" } })}>
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
            <WorkerProductivityTrend scores={trendData?.scores ?? []} userId={user?.id!} />
          )}
          {workerSummary && (
            <AISummaryCard summary={workerSummary} role="worker" />
          )}
          {attendanceLoading || productivityLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </div>
          ) : (
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
          )}

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
                <a href="/leaves" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "apply_leave", role: "worker" } })}>
                  <CalendarX className="w-5 h-5" />
                  Apply for Leave
                </a>
                <a href="/medical-certificates" className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-input hover:bg-accent transition-colors font-semibold" onClick={() => trackKpiEvent({ name: "dashboard_quick_action_clicked", properties: { action: "upload_mc", role: "worker" } })}>
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
