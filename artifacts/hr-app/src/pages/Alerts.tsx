import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { trackKpiEvent } from "@/lib/kpiTracking";
import { useListAlerts, useUpdateAlert, useListUsers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { formatDate } from "@/lib/utils";
import {
  AlertTriangle,
  Info,
  ShieldAlert,
  CheckCircle2,
  Filter,
  SearchX,
  UserCheck,
  UserX,
  MessageSquare,
  Siren,
  Workflow,
  ShieldCheck,
} from "lucide-react";
import { ADMIN_HR_ROLES, OPERATIONAL_ROLES, useAuth } from "@/lib/auth";
import {
  OpsHero,
  OpsPageHeader,
  OpsQueueNotice,
  OpsSection,
  OpsStatCard,
  OpsStatGrid,
} from "@/components/ui/ops-cockpit";
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
  const { toast } = useToast();
  const { user, hasRole, hasPermission } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const canAssign = hasPermission("alerts:assign");
  const canResolve = hasPermission("alerts:resolve");

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedAlert, setSelectedAlert] = useState<any | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [assignToUserId, setAssignToUserId] = useState<string>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const alertStatuses = ["new", "acknowledged", "in_progress", "resolved", "dismissed"] as const;

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

  const rawSearch = typeof window === "undefined" ? "" : window.location.search;
  const queryParams = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);
  const requestedAlertId = queryParams.get("alertId");
  const requestedStatus = queryParams.get("status");

  const userMap = useMemo(() => {
    const map = new Map<number, string>();
    usersData?.users?.forEach((u) => map.set(u.id, u.name || `User #${u.id}`));
    if (user?.id) {
      map.set(user.id, user.name || `User #${user.id}`);
    }
    return map;
  }, [user, usersData?.users]);

  useEffect(() => {
    if (requestedStatus && alertStatuses.includes(requestedStatus as (typeof alertStatuses)[number])) {
      setStatusFilter(requestedStatus);
    }
  }, [requestedStatus]);

  useEffect(() => {
    if (!requestedAlertId || selectedAlert) return;
    const alertId = Number(requestedAlertId);
    if (!Number.isFinite(alertId)) return;

    const target = (alertsData?.alerts ?? []).find((alert) => alert.id === alertId);
    if (target && (canAssign || canResolve)) {
      openActionDialog(target);
    }
  }, [requestedAlertId, alertsData?.alerts, canAssign, canResolve, selectedAlert]);

  const alertCounts = useMemo(() => {
    return (alertsData?.alerts ?? []).reduce(
      (counts, alert) => {
        counts.total += 1;
        if (alert.status in counts) {
          counts[alert.status as "new" | "acknowledged" | "in_progress" | "resolved" | "dismissed"] += 1;
        }
        if (!alert.assignedTo && alert.status !== "resolved" && alert.status !== "dismissed") {
          counts.unassigned += 1;
        }
        if (alert.severity === "critical" && alert.status !== "resolved" && alert.status !== "dismissed") {
          counts.criticalOpen += 1;
        }
        return counts;
      },
      {
        total: 0,
        new: 0,
        acknowledged: 0,
        in_progress: 0,
        resolved: 0,
        dismissed: 0,
        unassigned: 0,
        criticalOpen: 0,
      },
    );
  }, [alertsData?.alerts]);

  const paginatedAlerts = useMemo(() => {
    const all = alertsData?.alerts ?? [];
    return all.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }, [alertsData?.alerts, page]);
  const totalAlerts = alertsData?.total ?? alertsData?.alerts?.length ?? 0;
  const hasActiveFilters = statusFilter !== "all";
  const totalPages = Math.max(1, Math.ceil(totalAlerts / PAGE_SIZE));

  const updateAlertMutation = useUpdateAlert({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Alert updated successfully." });
        refetch();
        setSelectedAlert(null);
        setResolutionNotes("");
        setAssignToUserId("");
      },
      onError: () => {
        toast({ title: "Error", description: "Failed to update alert. Please try again.", variant: "destructive" });
      },
    },
  });

  const resolveAlert = (id: number, notes?: string) => {
    trackKpiEvent({ name: "alert_resolved", properties: { alertId: id, role: isAdminHR ? "admin_hr" : isOperational ? "operational" : "self_service" } });
    updateAlertMutation.mutate({ id, data: { status: "resolved", resolutionNotes: notes } });
  };

  const dismissAlert = (id: number) => {
    trackKpiEvent({ name: "alert_dismissed", properties: { alertId: id, role: isAdminHR ? "admin_hr" : isOperational ? "operational" : "self_service" } });
    updateAlertMutation.mutate({ id, data: { status: "dismissed" } });
  };

  const acknowledgeAlert = (id: number) => {
    trackKpiEvent({ name: "alert_acknowledged", properties: { alertId: id, role: isAdminHR ? "admin_hr" : isOperational ? "operational" : "self_service" } });
    updateAlertMutation.mutate({ id, data: { status: "acknowledged" } });
  };

  const assignAlert = (id: number, assignedTo: number) => {
    trackKpiEvent({ name: "alert_assigned", properties: { alertId: id, assignedTo, role: isAdminHR ? "admin_hr" : isOperational ? "operational" : "self_service" } });
    updateAlertMutation.mutate({ id, data: { assignedTo } });
  };

  const openActionDialog = (alert: any) => {
    trackKpiEvent({ name: "alert_manage_opened", properties: { alertId: alert.id, status: alert.status, severity: alert.severity } });
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

  const queueTitle = isOperational ? "Alert command queue" : "My alerts and follow-ups";
  const queueDescription = isOperational
    ? "Triage signal-driven alerts in the order that protects operations: critical first, unassigned next, then items already in motion."
    : "Track the alerts that affect your work and review the latest notes, ownership, and workflow status.";

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Alerts"
        description="Review operational signals with clear ownership, explainable status changes, and fast escalation paths without changing the underlying alert workflow."
        actions={
          isOperational ? (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={statusFilter} onValueChange={(value) => {
                  setStatusFilter(value);
                  setPage(1);
                  trackKpiEvent({ name: "alerts_filter_changed", properties: { status: value, role: isAdminHR ? "admin_hr" : isOperational ? "operational" : "self_service" } });
                }}>
                <SelectTrigger className="w-[190px]">
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
          ) : null
        }
      />

      <OpsHero
        badge={isOperational ? "Live operational queue" : "Personal visibility"}
        icon={Siren}
        tone={alertCounts.criticalOpen > 0 ? "critical" : alertCounts.unassigned > 0 ? "attention" : "default"}
        title={isOperational ? "Work the highest-risk signals before they become incidents." : "See what needs your awareness without losing audit context."}
        description={isOperational
          ? "This queue keeps the existing alert contracts intact while making triage simpler: severity, ownership, and workflow state are surfaced first so operators can decide quickly and explain decisions later."
          : "Your visible alerts stay scoped to you, but the page now frames each item around status, message context, and the next likely action so nothing important is buried."}
      >
        <OpsQueueNotice
          tone={alertCounts.criticalOpen > 0 ? "critical" : "default"}
          title={alertCounts.criticalOpen > 0 ? `${alertCounts.criticalOpen} critical alert${alertCounts.criticalOpen === 1 ? "" : "s"} need attention` : "Queue guidance"}
          description={alertCounts.criticalOpen > 0
            ? "Prioritize unresolved critical signals first, then assign any unowned items so downstream accountability is clear."
            : isOperational
              ? "Acknowledge to confirm awareness, assign to establish ownership, and resolve only after notes explain the outcome."
              : "Read the latest notes and status before escalating through your manager or HR."}
        />
      </OpsHero>

      {isOperational && alertCounts.total > 0 && (
        <OpsStatGrid>
          <OpsStatCard label="New" value={alertCounts.new} hint="Fresh signals waiting for first triage." icon={Siren} tone={alertCounts.new > 0 ? "attention" : "default"} />
          <OpsStatCard label="Needs owner" value={alertCounts.unassigned} hint="Open alerts without explicit operational ownership." icon={UserCheck} tone={alertCounts.unassigned > 0 ? "attention" : "success"} />
          <OpsStatCard label="Critical open" value={alertCounts.criticalOpen} hint="Highest-severity alerts still unresolved." icon={ShieldAlert} tone={alertCounts.criticalOpen > 0 ? "critical" : "success"} />
          <OpsStatCard label="In progress" value={alertCounts.in_progress} hint="Alerts already moving through an active workflow." icon={Workflow} tone="success" />
        </OpsStatGrid>
      )}

      <OpsSection
        title={queueTitle}
        description={queueDescription}
      >
        <div className="space-y-4">
        {totalAlerts === 0 ? (
          hasActiveFilters ? (
            <Empty className="py-16">
              <EmptyMedia variant="icon"><SearchX className="w-10 h-10" /></EmptyMedia>
              <EmptyHeader><EmptyTitle>No alerts match this filter</EmptyTitle></EmptyHeader>
              <EmptyContent>
                <EmptyDescription>Try a different status or clear the filter to see all alerts.</EmptyDescription>
                <Button variant="outline" size="sm" onClick={() => setStatusFilter("all")} className="mt-4">Clear filter</Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Empty className="py-16">
              <EmptyMedia variant="icon"><CheckCircle2 className="w-10 h-10" /></EmptyMedia>
              <EmptyHeader><EmptyTitle>All clear</EmptyTitle></EmptyHeader>
              <EmptyContent>
                <EmptyDescription>No active alert signals are visible in this scope right now.</EmptyDescription>
              </EmptyContent>
            </Empty>
          )
        ) : (
        paginatedAlerts.map((alert) => (
          <Card
            key={alert.id}
            className={`border-l-4 shadow-sm ${
              alert.status === "resolved" || alert.status === "dismissed"
                ? "border-l-muted opacity-75"
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
                  <div className="space-y-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <h4 className="font-bold text-lg">{alert.title}</h4>
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                          {alert.alertType.replace(/_/g, " ")}
                        </Badge>
                        {getStatusBadge(alert.status)}
                        {!alert.assignedTo && alert.status !== "resolved" && alert.status !== "dismissed" && (
                          <Badge variant="warning" className="text-[10px]">Needs owner</Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground text-sm">{alert.message}</p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Severity</p>
                        <p className="mt-1 text-sm font-medium capitalize">{alert.severity}</p>
                      </div>
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Observed</p>
                        <p className="mt-1 text-sm font-medium">{formatDate(alert.createdAt)}</p>
                      </div>
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Ownership</p>
                        <p className="mt-1 text-sm font-medium">{alert.assignedTo ? getEmployeeName(alert.assignedTo) : "Unassigned"}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-background/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why this is in queue</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {alert.status === "new"
                          ? "This signal is newly created and still needs first acknowledgement or assignment."
                          : alert.status === "acknowledged"
                            ? "The alert has been seen, but ownership or resolution still needs to be completed."
                            : alert.status === "in_progress"
                              ? "Work is underway. Keep notes current so the next reviewer understands the current state."
                              : alert.status === "resolved"
                                ? "The signal is closed, with notes preserved for auditability and later review."
                                : "The signal was dismissed and remains visible as part of workflow history."}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      {alert.assignedTo && (
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="w-3 h-3" />
                          Assigned to {getEmployeeName(alert.assignedTo)}
                        </span>
                      )}
                      {alert.dismissedBy && (
                        <span className="inline-flex items-center gap-1">
                          <UserX className="w-3 h-3" />
                          Dismissed from active queue
                        </span>
                      )}
                      {alert.status === "resolved" && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Resolution preserved in workflow history
                        </span>
                      )}
                    </div>

                    {alert.resolutionNotes && (
                      <div className="rounded-lg bg-secondary/40 px-3 py-2 text-xs text-muted-foreground inline-flex items-start gap-2">
                        <MessageSquare className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{alert.resolutionNotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 md:justify-end md:max-w-[220px]">
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
        ))
        )}
        {totalAlerts > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border rounded-xl bg-card">
            <p className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalAlerts)} of {totalAlerts}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</Button>
              <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={paginatedAlerts.length < PAGE_SIZE}>Next</Button>
            </div>
          </div>
        )}
      </div>
      </OpsSection>

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
