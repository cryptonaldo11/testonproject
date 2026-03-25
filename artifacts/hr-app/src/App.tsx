import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth";

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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/attendance" component={Attendance} />
      <Route path="/attendance/checkin" component={CheckIn} />
      <Route path="/leaves" component={Leaves} />
      <Route path="/medical-certificates" component={MedicalCertificates} />
      <Route path="/reports/manhours" component={ManHours} />
      <Route path="/users" component={Users} />
      <Route path="/departments" component={Departments} />
      <Route path="/alerts" component={Alerts} />
      <Route path="/productivity" component={Productivity} />
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
