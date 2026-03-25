import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListAlerts, useUpdateAlert } from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui/core";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, Info, ShieldAlert } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Alerts() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  
  const { data: alertsData, refetch } = useListAlerts(
    isAdminHR ? {} : { userId: user?.id }
  );

  const updateAlertMutation = useUpdateAlert({ onSuccess: () => refetch() });

  const resolveAlert = (id: number) => {
    updateAlertMutation.mutate({ id, data: { status: "resolved" }});
  };

  const getIcon = (severity: string) => {
    switch(severity) {
      case 'critical': return <ShieldAlert className="w-6 h-6 text-destructive" />;
      case 'warning': return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      default: return <Info className="w-6 h-6 text-blue-500" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">System Alerts</h1>
        <p className="text-muted-foreground">Notifications for policy violations and system events.</p>
      </div>

      <div className="space-y-4">
        {alertsData?.alerts?.length === 0 && (
           <Card className="p-12 text-center text-muted-foreground bg-transparent border-dashed">
              <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-4 opacity-50" />
              All clear! No active alerts.
           </Card>
        )}
        
        {alertsData?.alerts?.map((alert) => (
          <Card key={alert.id} className={`border-l-4 ${alert.status === 'resolved' ? 'border-l-muted opacity-60' : alert.severity === 'critical' ? 'border-l-destructive' : alert.severity === 'warning' ? 'border-l-amber-500' : 'border-l-blue-500'}`}>
            <div className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="mt-1">{getIcon(alert.severity)}</div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-bold text-lg">{alert.title}</h4>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">{alert.alertType.replace('_', ' ')}</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">{alert.message}</p>
                  <p className="text-xs text-muted-foreground mt-2 font-mono">{formatDate(alert.createdAt)}</p>
                </div>
              </div>
              {alert.status === 'active' && (
                <Button variant="outline" size="sm" onClick={() => resolveAlert(alert.id)}>
                  Mark Resolved
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}

// Just importing the icon missing above
import { CheckCircle2 } from "lucide-react";
