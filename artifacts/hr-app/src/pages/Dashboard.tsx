import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/core";
import { Users, Clock, CalendarX, TrendingUp, AlertTriangle, FileText } from "lucide-react";
import { useListUsers, useListAttendance, useListLeaves, useListAlerts } from "@workspace/api-client-react";

function StatCard({ title, value, icon: Icon, trend, trendUp }: any) {
  return (
    <Card className="hover:-translate-y-1 transition-transform duration-300">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-display font-bold">{value}</p>
          </div>
          <div className={`p-4 rounded-2xl ${trendUp ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center text-sm font-medium">
            <span className={trendUp ? 'text-primary' : 'text-destructive'}>{trend}</span>
            <span className="text-muted-foreground ml-2">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);

  // Fetch some aggregate data for the dashboard
  const { data: usersData } = useListUsers({}, { query: { enabled: isAdminHR } });
  const { data: attendanceData } = useListAttendance({ date: new Date().toISOString().split('T')[0] });
  const { data: leavesData } = useListLeaves({ status: "pending" }, { query: { enabled: isAdminHR } });
  const { data: alertsData } = useListAlerts({ status: "active" }, { query: { enabled: isAdminHR } });

  const activeUsers = usersData?.users?.filter(u => u.isActive === 'true').length || 0;
  const presentToday = attendanceData?.logs?.filter(l => l.status === 'present').length || 0;
  const pendingLeaves = leavesData?.total || 0;
  const activeAlerts = alertsData?.total || 0;

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold">Welcome back, {user?.name}</h1>
        <p className="text-muted-foreground mt-1">Here's what's happening today at Teston Landscape.</p>
      </div>

      {isAdminHR ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Active Employees" value={activeUsers} icon={Users} trend="+2%" trendUp={true} />
          <StatCard title="Present Today" value={presentToday} icon={Clock} trend="95% rate" trendUp={true} />
          <StatCard title="Pending Leaves" value={pendingLeaves} icon={CalendarX} trend="Needs review" trendUp={false} />
          <StatCard title="Active Alerts" value={activeAlerts} icon={AlertTriangle} trend="Action required" trendUp={false} />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <StatCard title="My Attendance Rate" value="98%" icon={TrendingUp} trend="+1%" trendUp={true} />
          <StatCard title="Leaves Available" value="12 Days" icon={CalendarX} />
          <StatCard title="Hours Logged (Week)" value="42 hrs" icon={Clock} />
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
    </DashboardLayout>
  );
}
