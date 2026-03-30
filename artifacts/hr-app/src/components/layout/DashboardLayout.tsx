import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import {
  ADMIN_HR_ROLES,
  ADMIN_ONLY_ROLES,
  SELF_SERVICE_ROLES,
  type AppPermission,
  useAuth,
} from "@/lib/auth";
import {
  Activity,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ScanFace,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  show: boolean;
  description: string;
};

type NavSection = {
  title: string;
  description: string;
  items: NavItem[];
};

const roleLabels: Record<string, string> = {
  admin: "Platform administrator",
  hr: "HR operations",
  manager: "Operations manager",
  worker: "Workforce self-service",
  driver: "Field self-service",
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, logout, hasRole, hasPermission } = useAuth();
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [sidebarOpen]);

  const currentPageLabel = useMemo(() => {
    if (!user) return "Operations workspace";

    const allItems = buildNavSections({ hasRole, hasPermission }).flatMap((section) => section.items);
    return allItems.find((item) => location === item.href || (location.startsWith(item.href) && item.href !== "/dashboard"))?.label ?? "Operations workspace";
  }, [hasPermission, hasRole, location, user]);

  if (!user) return null;

  const navSections = buildNavSections({ hasRole, hasPermission })
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.show),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_35%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.22))] text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75 lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
                WO
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Workforce Operations</p>
                <p className="truncate text-xs text-muted-foreground">{currentPageLabel}</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition-colors hover:bg-muted"
            aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={sidebarOpen}
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="mx-auto flex min-h-[calc(100vh-65px)] max-w-7xl lg:min-h-screen lg:px-4 xl:px-6">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.button
              key="mobile-overlay"
              type="button"
              aria-label="Close navigation overlay"
              className="fixed inset-0 z-40 bg-slate-950/45 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <motion.aside
          initial={false}
          animate={sidebarOpen ? "open" : "closed"}
          variants={{
            open: { x: 0 },
            closed: { x: "-100%" },
          }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className={cn(
            "fixed inset-y-0 left-0 z-50 w-[88vw] max-w-[22rem] border-r border-border/70 bg-card/98 px-4 pb-4 pt-4 shadow-2xl shadow-slate-950/20 backdrop-blur md:w-80 lg:sticky lg:top-0 lg:z-20 lg:h-screen lg:w-80 lg:max-w-none lg:translate-x-0 lg:border-r lg:bg-card/80 lg:shadow-none",
            !sidebarOpen && "pointer-events-none lg:pointer-events-auto hidden lg:flex",
            sidebarOpen && "flex"
          )}
        >
          <div className="flex h-full flex-col">
            <div className="rounded-3xl border border-border/70 bg-background/85 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
                    WO
                  </div>
                  <div>
                    <h1 className="text-base font-semibold tracking-tight">Workforce Operations</h1>
                    <p className="text-xs text-muted-foreground">Trusted attendance, compliance, and response workflows</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
                  aria-label="Close navigation"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-4 rounded-2xl border border-primary/10 bg-primary/5 p-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Operational trust by design</p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      Role-based access, clear accountability, and auditable workflows remain in place across the platform.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <nav className="mt-4 flex-1 overflow-y-auto pr-1" aria-label="Primary">
              <div className="space-y-5 pb-4">
                {navSections.map((section) => (
                  <div key={section.title} className="space-y-2">
                    <div className="px-2">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {section.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground/90">{section.description}</p>
                    </div>
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const isActive =
                          location === item.href ||
                          (location.startsWith(item.href) && item.href !== "/dashboard");

                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            className={cn(
                              "group block rounded-2xl border px-3 py-3 transition-all duration-200",
                              isActive
                                ? "border-primary/30 bg-primary/10 text-foreground shadow-sm"
                                : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-background/85 hover:text-foreground"
                            )}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                                  isActive
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted text-primary group-hover:bg-primary/10"
                                )}
                              >
                                <item.icon className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-medium">{item.label}</span>
                                  <ChevronRight
                                    className={cn(
                                      "h-4 w-4 shrink-0 transition-transform",
                                      isActive ? "text-primary" : "text-muted-foreground group-hover:translate-x-0.5"
                                    )}
                                  />
                                </div>
                                <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </nav>

            <div className="border-t border-border/70 pt-4">
              <div className="rounded-2xl border border-border/70 bg-background/85 p-4 shadow-sm">
                <p className="truncate text-sm font-semibold">{user.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{roleLabels[user.role] ?? user.role}</p>
              </div>
              <button
                onClick={logout}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                Sign out securely
              </button>
            </div>
          </div>
        </motion.aside>

        <main className="min-w-0 flex-1 lg:pl-6">
          <div className="px-4 py-4 sm:px-6 sm:py-6 lg:px-0 lg:py-8">
            <div className="mb-6 hidden rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm backdrop-blur lg:block">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-foreground">{currentPageLabel}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Coordinate workforce performance, compliance, and day-to-day operations from a single, role-aware workspace.
                  </p>
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-right">
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Signed in as</p>
                  <p className="mt-1 text-sm font-medium">{roleLabels[user.role] ?? user.role}</p>
                </div>
              </div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
            >
              {children}
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}

function buildNavSections({
  hasRole,
  hasPermission,
}: {
  hasRole: (roles: readonly string[]) => boolean;
  hasPermission: (permission: AppPermission) => boolean;
}): NavSection[] {
  const isAdminOnly = hasRole(ADMIN_ONLY_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const canReadReports = hasPermission("reports:read:team");
  const canReadUsers = hasPermission("users:read");
  const isSelfServiceAttendanceUser = hasRole(SELF_SERVICE_ROLES);

  return [
    {
      title: "Overview",
      description: "Start with the health of the workforce and active risks.",
      items: [
        {
          label: "Command center",
          href: "/dashboard",
          icon: LayoutDashboard,
          show: true,
          description: "Review workforce KPIs, anomalies, and operational signals.",
        },
        {
          label: "Alerts",
          href: "/alerts",
          icon: Bell,
          show: true,
          description: "Track exceptions and priority follow-ups needing attention.",
        },
      ],
    },
    {
      title: "Workforce operations",
      description: "Manage attendance, availability, and field execution.",
      items: [
        {
          label: "Attendance logs",
          href: "/attendance",
          icon: CalendarDays,
          show: true,
          description: "Review attendance records, exceptions, and daily trends.",
        },
        {
          label: "Check in / out",
          href: "/attendance/checkin",
          icon: Clock,
          show: isSelfServiceAttendanceUser,
          description: "Complete field self-service attendance actions.",
        },
        {
          label: "Leave requests",
          href: "/leaves",
          icon: FileText,
          show: true,
          description: "Submit or review leave activity across the workforce.",
        },
        {
          label: "Medical certificates",
          href: "/medical-certificates",
          icon: FileText,
          show: true,
          description: "Manage MC submissions with clear documentation trails.",
        },
        {
          label: "Productivity",
          href: "/productivity",
          icon: Activity,
          show: true,
          description: "Monitor operational throughput and team performance.",
        },
      ],
    },
    {
      title: "People and compliance",
      description: "Support accountable interventions and workforce governance.",
      items: [
        {
          label: "Interventions",
          href: "/interventions",
          icon: ClipboardList,
          show: isAdminHR,
          description: "Coordinate actions, ownership, and workforce support measures.",
        },
        {
          label: "People directory",
          href: "/users",
          icon: Users,
          show: canReadUsers,
          description: "Access workforce records and role-aware administration views.",
        },
        {
          label: "Face registration",
          href: "/face-registration",
          icon: ScanFace,
          show: isAdminHR,
          description: "Manage biometric enrollment with controlled access.",
        },
      ],
    },
    {
      title: "Administration and reporting",
      description: "Maintain structure and review operational reporting outputs.",
      items: [
        {
          label: "Man-hours report",
          href: "/reports/manhours",
          icon: BarChart3,
          show: canReadReports,
          description: "Analyze labor allocation and time usage trends.",
        },
        {
          label: "Departments",
          href: "/departments",
          icon: Building2,
          show: isAdminOnly,
          description: "Maintain workforce structure and department ownership.",
        },
      ],
    },
  ];
}
