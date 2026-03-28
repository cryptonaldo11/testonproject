import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { ADMIN_HR_ROLES, MANAGER_ROLES, SELF_SERVICE_ROLES, useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/core";
import { Users, Clock, CalendarX, TrendingUp, AlertTriangle, FileText, Activity, CalendarDays, ShieldAlert, CheckSquare } from "lucide-react";
import { useListUsers, useListAttendance, useListLeaves, useListAlerts, useListMedicalCertificates, useListProductivityScores } from "@workspace/api-client-react";

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

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const isManager = hasRole(MANAGER_ROLES);
  const isSelfService = hasRole(SELF_SERVICE_ROLES);

  const today = new Date().toISOString().split("T")[0];
  const currentMonth = String(new Date().getMonth() + 1);
  const currentYear = String(new Date().getFullYear());

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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <StatCard title="My Attendance Rate" value="98%" icon={TrendingUp} trend="Steady this month" trendUp={true} />
            <StatCard title="Leaves Available" value="12 Days" icon={CalendarX} />
            <StatCard title="Hours Logged (Week)" value="42 hrs" icon={Clock} />
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
