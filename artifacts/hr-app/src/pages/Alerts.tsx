import React, { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListAlerts, useUpdateAlert, useListUsers } from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui/core";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  Filter,
  UserCheck,
  UserX,
  MessageSquare,
} from "lucide-react";
import { ADMIN_HR_ROLES, OPERATIONAL_ROLES, useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Alerts() {
  const { user, hasRole, hasPermission } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const canAssign = hasPermission("alerts:assign");
  const canResolve = hasPermission("alerts:resolve");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [assignToUserId, setAssignToUserId] = useState<string>("");

  const alertsQuery = isOperational
    ? statusFilter !== "all"
      ? { status: statusFilter }
      : {}
    : { userId: user?.id };

  const { data: alertsData, refetch } = useListAlerts(alertsQuery);
  const { data: usersData } = useListUsers(undefined, {
    query: {
      queryKey: ["alerts", "users"],
      enabled: isOperational && canAssign,
    },
  });

  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    usersData?.users?.forEach((u) => map.set(u.id, u.name || `User #${u.id}`));
    if (user?.id) {
      map.set(user.id, user.name || `User #${user.id}`);
    }
    return map;
  }, [user, usersData?.users]);

  const updateAlertMutation = useUpdateAlert({
    mutation: {
      onSuccess: () => {
        refetch();
        setSelectedAlert(null);
        setResolutionNotes("");
        setAssignToUserId("");
      },
    },
  });

  const resolveAlert = (id: number, notes?: string) => {
    updateAlertMutation.mutate({ id, data: { status: "resolved", resolutionNotes: notes } });
  };

  const dismissAlert = (id: number) => {
    updateAlertMutation.mutate({ id, data: { status: "dismissed" } });
  };

  const acknowledgeAlert = (id: number) => {
    updateAlertMutation.mutate({ id, data: { status: "acknowledged" } });
  };

  const assignAlert = (id: number, assignedTo: number) => {
    updateAlertMutation.mutate({ id, data: { assignedTo } });
  };

  const openActionDialog = (alert: any) => {
    setSelectedAlert(alert);
    setResolutionNotes(alert.resolutionNotes || "");
    setAssignToUserId(alert.assignedTo ? String(alert.assignedTo) : "");
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case "critical":
        return <ShieldAlert className="w-6 h-6 text-destructive" />;
      case "warning":
        return <AlertTriangle className="w-6 h-6 text-amber-500" />;
      default:
        return <Info className="w-6 h-6 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "resolved":
        return <Badge variant="success">Resolved</Badge>;
      case "dismissed":
        return <Badge variant="secondary">Dismissed</Badge>;
      case "in_progress":
        return <Badge variant="default">In Progress</Badge>;
      case "acknowledged":
        return <Badge variant="outline">Acknowledged</Badge>;
      default:
        return <Badge variant="warning">New</Badge>;
    }
  };

  const getEmployeeName = (userId?: number | null) => {
    if (!userId) return "Unassigned";
    return userMap.get(userId) || `User #${userId}`;
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">System Alerts</h1>
          <p className="text-muted-foreground">
            Notifications for policy violations and system events in your visible scope.
          </p>
        </div>
        {isOperational && (
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-muted-foreground" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="acknowledged">Acknowledged</SelectItem>
                <SelectItem value="in_progress">In progress</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
                <SelectItem value="dismissed">Dismissed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {alertsData?.alerts?.length === 0 && (
          <Card className="p-12 text-center text-muted-foreground bg-transparent border-dashed">
            <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-400 mb-4 opacity-50" />
            All clear! No alerts found.
          </Card>
        )}

        {alertsData?.alerts?.map((alert) => (
          <Card
            key={alert.id}
            className={`border-l-4 ${
              alert.status === "resolved" || alert.status === "dismissed"
                ? "border-l-muted opacity-70"
                : alert.severity === "critical"
                  ? "border-l-destructive"
                  : alert.severity === "warning"
                    ? "border-l-amber-500"
                    : "border-l-blue-500"
            }`}
          >
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1">{getIcon(alert.severity)}</div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h4 className="font-bold text-lg">{alert.title}</h4>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        {alert.alertType.replace(/_/g, " ")}
                      </Badge>
                      {getStatusBadge(alert.status)}
                    </div>
                    <p className="text-muted-foreground text-sm">{alert.message}</p>
                    <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="font-mono">{formatDate(alert.createdAt)}</span>
                      {alert.assignedTo && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Assigned to {getEmployeeName(alert.assignedTo)}
                        </span>
                      )}
                      {alert.dismissedBy && (
                        <span className="inline-flex items-center gap-1">
                          <UserX className="w-3 h-3" />
                          Dismissed
                        </span>
                      )}
                    </div>
                    {alert.resolutionNotes && (
                      <div className="mt-3 rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground inline-flex items-start gap-2">
                        <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{alert.resolutionNotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end">
                  {alert.status === "new" && isOperational && (
                    <Button variant="outline" size="sm" onClick={() => acknowledgeAlert(alert.id)}>
                      Acknowledge
                    </Button>
                  )}
                  {(canAssign || canResolve) && (
                    <Button variant="ghost" size="sm" onClick={() => openActionDialog(alert)}>
                      Manage
                    </Button>
                  )}
                  {alert.status !== "resolved" && alert.status !== "dismissed" && canResolve && (
                    <Button variant="outline" size="sm" onClick={() => resolveAlert(alert.id)}>
                      Resolve now
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedAlert} onOpenChange={(open) => !open && setSelectedAlert(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage alert workflow</DialogTitle>
            <DialogDescription>
              Update assignment, add resolution notes, or change the alert status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {canAssign && (
              <div className="space-y-2">
                <Label htmlFor="assign-alert-user">Assign to</Label>
                <Select value={assignToUserId} onValueChange={setAssignToUserId}>
                  <SelectTrigger id="assign-alert-user">
                    <SelectValue placeholder="Select assignee" />
                  </SelectTrigger>
                  <SelectContent>
                    {usersData?.users?.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="alert-resolution-notes">Resolution notes</Label>
              <Textarea
                id="alert-resolution-notes"
                value={resolutionNotes}
                onChange={(event) => setResolutionNotes(event.target.value)}
                placeholder="Add context for the workflow history"
              />
            </div>
          </div>

          <DialogFooter className="flex flex-wrap gap-2 sm:justify-between">
            <div className="flex flex-wrap gap-2">
              {selectedAlert && selectedAlert.status !== "dismissed" && (
                <Button
                  variant="ghost"
                  onClick={() => dismissAlert(selectedAlert.id)}
                  disabled={updateAlertMutation.isPending}
                >
                  Dismiss
                </Button>
              )}
              {selectedAlert && selectedAlert.status !== "resolved" && canResolve && (
                <Button
                  variant="outline"
                  onClick={() => resolveAlert(selectedAlert.id, resolutionNotes || undefined)}
                  disabled={updateAlertMutation.isPending}
                >
                  {updateAlertMutation.isPending ? "Saving..." : "Resolve"}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setSelectedAlert(null)}>
                Cancel
              </Button>
              {selectedAlert && canAssign && assignToUserId && (
                <Button
                  onClick={() => assignAlert(selectedAlert.id, Number(assignToUserId))}
                  disabled={updateAlertMutation.isPending}
                >
                  Assign
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
