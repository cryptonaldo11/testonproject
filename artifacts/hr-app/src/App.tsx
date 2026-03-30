import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  ADMIN_HR_ROLES,
  ADMIN_ONLY_ROLES,
  SELF_SERVICE_ROLES,
  type AppPermission,
  AuthProvider,
  useAuth,
} from "@/lib/auth";

// Pages
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Attendance from "@/pages/Attendance";
import CheckIn from "@/pages/CheckIn";
import Leaves from "@/pages/Leaves";
import MedicalCertificates from "@/pages/MedicalCertificates";
import Users from "@/pages/Users";
import Departments from "@/pages/Departments";
import Alerts from "@/pages/Alerts";
import ManHours from "@/pages/ManHours";
import Productivity from "@/pages/Productivity";
import FaceRegistration from "@/pages/FaceRegistration";
import Interventions from "@/pages/Interventions";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function AppLoadingScreen({ message = "Loading workspace access..." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_35%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.22))] px-6">
      <div className="w-full max-w-md rounded-3xl border border-border/70 bg-card/85 p-8 text-center shadow-xl backdrop-blur">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20">
          WO
        </div>
        <h1 className="mt-5 text-xl font-semibold tracking-tight">Workforce Operations</h1>
        <p className="mt-2 text-sm text-muted-foreground">Secure workforce oversight, compliance, and response workflows.</p>
        <div className="mx-auto mt-6 h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {message}
        </div>
      </div>
    </div>
  );
}

function RequireAuth({
  component: Component,
  roles,
  permission,
}: {
  component: React.ComponentType;
  roles?: readonly string[];
  permission?: AppPermission;
}) {
  const { user, isLoading, hasPermission } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return <AppLoadingScreen />;
  }

  if (!user) {
    const redirect = encodeURIComponent(location || "/dashboard");
    return <Redirect to={`/login?redirect=${redirect}`} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Redirect to="/dashboard" />;
  }

  if (permission && !hasPermission(permission)) {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={() => <RequireAuth component={Dashboard} />} />
      <Route path="/dashboard" component={() => <RequireAuth component={Dashboard} />} />
      <Route path="/attendance" component={() => <RequireAuth component={Attendance} />} />
      <Route path="/attendance/checkin" component={() => <RequireAuth component={CheckIn} roles={SELF_SERVICE_ROLES} />} />
      <Route path="/leaves" component={() => <RequireAuth component={Leaves} />} />
      <Route path="/medical-certificates" component={() => <RequireAuth component={MedicalCertificates} />} />
      <Route path="/reports/manhours" component={() => <RequireAuth component={ManHours} permission="reports:read:team" />} />
      <Route path="/users" component={() => <RequireAuth component={Users} permission="users:read" />} />
      <Route path="/departments" component={() => <RequireAuth component={Departments} roles={ADMIN_ONLY_ROLES} />} />
      <Route path="/alerts" component={() => <RequireAuth component={Alerts} />} />
      <Route path="/productivity" component={() => <RequireAuth component={Productivity} />} />
      <Route path="/interventions" component={() => <RequireAuth component={Interventions} roles={ADMIN_HR_ROLES} />} />
      <Route path="/face-registration" component={() => <RequireAuth component={FaceRegistration} roles={ADMIN_HR_ROLES} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <AuthProvider>
          <TooltipProvider>
            <Router />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
