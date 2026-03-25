import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { 
  LayoutDashboard, 
  Users, 
  Clock, 
  CalendarDays, 
  FileText, 
  Building2, 
  Bell, 
  LogOut, 
  Menu,
  Activity,
  BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  if (!user) return null;

  const isAdmin = hasRole(["admin"]);
  const isHR = hasRole(["hr", "admin"]);

  const navItems = [
    { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, show: true },
    { label: "Check In/Out", href: "/attendance/checkin", icon: Clock, show: !isAdmin }, // Admins rarely clock in
    { label: "Attendance Logs", href: "/attendance", icon: CalendarDays, show: true },
    { label: "Leave Requests", href: "/leaves", icon: FileText, show: true },
    { label: "Medical Certs", href: "/medical-certificates", icon: FileText, show: true },
    { label: "Man-Hours Report", href: "/reports/manhours", icon: BarChart3, show: isHR },
    { label: "Productivity", href: "/productivity", icon: Activity, show: true },
    { label: "Employees", href: "/users", icon: Users, show: isAdmin },
    { label: "Departments", href: "/departments", icon: Building2, show: isAdmin },
    { label: "Alerts", href: "/alerts", icon: Bell, show: true },
  ].filter(item => item.show);

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 bg-card border-b sticky top-0 z-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-white font-bold">T</div>
          <span className="font-display font-bold text-lg">Teston HR</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 bg-secondary rounded-lg">
          <Menu className="w-5 h-5 text-primary" />
        </button>
      </div>

      {/* Sidebar */}
      <AnimatePresence>
        {(sidebarOpen || window.innerWidth >= 768) && (
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            className={cn(
              "fixed md:sticky top-0 left-0 z-40 h-screen w-72 bg-card border-r flex flex-col shrink-0 transition-transform md:translate-x-0",
              !sidebarOpen && "-translate-x-full md:translate-x-0"
            )}
          >
            <div className="p-6 flex items-center gap-3 hidden md:flex">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-emerald-400 shadow-lg shadow-primary/20 flex items-center justify-center text-white font-display font-bold text-xl">
                T
              </div>
              <div>
                <h1 className="font-display font-bold text-xl leading-none">Teston</h1>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Landscape</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
              {navItems.map((item) => {
                const isActive = location === item.href || (location.startsWith(item.href) && item.href !== "/dashboard");
                return (
                  <Link 
                    key={item.href} 
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 group",
                      isActive 
                        ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <item.icon className={cn("w-5 h-5 transition-transform group-hover:scale-110", isActive ? "text-primary-foreground" : "text-primary")} />
                    {item.label}
                  </Link>
                );
              })}
            </div>

            <div className="p-4 border-t">
              <div className="mb-4 px-4 py-3 rounded-xl bg-secondary/50 border border-border/50">
                <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground capitalize">{user.role}</p>
              </div>
              <button
                onClick={logout}
                className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {children}
          </motion.div>
        </div>
      </main>

      {/* Overlay for mobile sidebar */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  );
}
