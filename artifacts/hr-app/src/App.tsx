import React from "react";
import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
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
