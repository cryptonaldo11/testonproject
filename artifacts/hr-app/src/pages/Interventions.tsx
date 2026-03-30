import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Badge, Input } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { OPERATIONAL_ROLES, useAuth } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useListUsers } from "@workspace/api-client-react";
import { CalendarClock, ClipboardList, PlusCircle, UserRound, Workflow, Target, ShieldCheck } from "lucide-react";
import {
  OpsHero,
  OpsPageHeader,
  OpsQueueNotice,
  OpsSection,
  OpsStatCard,
  OpsStatGrid,
} from "@/components/ui/ops-cockpit";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const apiPath = (path: string) => `${apiBaseUrl}${path}`;

const interventionTypes = ["coaching", "improvement_plan", "recognition", "follow_up"] as const;
const interventionIssueTypes = [
  "lateness",
  "no_show",
  "overtime",
  "attendance_reliability",
  "workflow_issue",
  "positive_recognition",
  "other",
] as const;
const interventionStatuses = ["open", "in_progress", "completed", "monitoring", "cancelled"] as const;

type InterventionType = (typeof interventionTypes)[number];
type InterventionIssueType = (typeof interventionIssueTypes)[number];
type InterventionStatus = (typeof interventionStatuses)[number];

interface InterventionRecord {
  id: number;
  userId: number;
  ownerId: number;
  createdBy: number;
  updatedBy: number | null;
  relatedAlertId: number | null;
  relatedAttendanceExceptionId: number | null;
  type: InterventionType;
  issueType: InterventionIssueType;
  status: InterventionStatus;
  title: string;
  actionPlan: string;
  notes: string | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface InterventionListResponse {
  interventions: InterventionRecord[];
  total: number;
}

interface InterventionFormState {
  userId: string;
  ownerId: string;
  type: InterventionType;
  issueType: InterventionIssueType;
  status: InterventionStatus;
  title: string;
  actionPlan: string;
  notes: string;
  dueDate: string;
}

const defaultFormState: InterventionFormState = {
  userId: "",
  ownerId: "",
  type: "coaching",
  issueType: "attendance_reliability",
  status: "open",
  title: "",
  actionPlan: "",
  notes: "",
  dueDate: "",
};

function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusBadge(status: InterventionStatus) {
  switch (status) {
    case "completed":
      return <Badge variant="success">Completed</Badge>;
    case "in_progress":
      return <Badge variant="default">In Progress</Badge>;
    case "monitoring":
      return <Badge variant="warning">Monitoring</Badge>;
    case "cancelled":
      return <Badge variant="secondary">Cancelled</Badge>;
    default:
      return <Badge variant="outline">Open</Badge>;
  }
}

export default function Interventions() {
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const [, setLocation] = useLocation();
  const isOperational = hasRole(OPERATIONAL_ROLES);

  const [interventions, setInterventions] = useState<InterventionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIntervention, setEditingIntervention] = useState<InterventionRecord | null>(null);
  const [formState, setFormState] = useState<InterventionFormState>(defaultFormState);
  const [isSaving, setIsSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const searchParams = useMemo(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);
  const selectedUserId = searchParams.get("userId");
  const relatedAlertId = searchParams.get("relatedAlertId");
  const relatedAttendanceExceptionId = searchParams.get("relatedAttendanceExceptionId");
  const prefillIssueType = searchParams.get("issueType");
  const prefillTitle = searchParams.get("title");

  const { data: usersData } = useListUsers(undefined, {
    query: { queryKey: ["interventions", "users"], enabled: !!user?.id && isOperational },
  });

  const availableUsers = useMemo(() => {
    if (isOperational) return usersData?.users ?? [];
    return user ? [user] : [];
  }, [isOperational, user, usersData?.users]);

  const userNameMap = useMemo(() => {
    const map = new Map<number, string>();
    availableUsers.forEach((entry) => map.set(entry.id, entry.name));
    if (user?.id && user.name) {
      map.set(user.id, user.name);
    }
    return map;
  }, [availableUsers, user]);

  const loadInterventions = async () => {
    if (!user?.id) return;

    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUserId) {
        params.set("userId", selectedUserId);
      } else if (!isOperational) {
        params.set("userId", String(user.id));
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (relatedAlertId) {
        params.set("relatedAlertId", relatedAlertId);
      }
      if (relatedAttendanceExceptionId) {
        params.set("relatedAttendanceExceptionId", relatedAttendanceExceptionId);
      }

      const response = await fetch(apiPath(`/api/interventions${params.toString() ? `?${params.toString()}` : ""}`));
      const payload = (await response.json()) as InterventionListResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in payload ? payload.error || "Failed to load interventions." : "Failed to load interventions.");
      }

      if ("interventions" in payload) {
        setInterventions(payload.interventions ?? []);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load interventions.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadInterventions();
  }, [user?.id, isOperational, selectedUserId, statusFilter, relatedAlertId, relatedAttendanceExceptionId]);

  const filteredInterventions = interventions;

  const resetForm = () => {
    setEditingIntervention(null);
    setFormState({
      ...defaultFormState,
      userId: selectedUserId || (!isOperational && user?.id ? String(user.id) : ""),
      ownerId: user?.id ? String(user.id) : "",
      issueType: interventionIssueTypes.includes((prefillIssueType as InterventionIssueType) || "other")
        ? (prefillIssueType as InterventionIssueType)
        : "attendance_reliability",
      title: prefillTitle || "",
    });
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (record: InterventionRecord) => {
    setEditingIntervention(record);
    setFormState({
      userId: String(record.userId),
      ownerId: String(record.ownerId),
      type: record.type,
      issueType: record.issueType,
      status: record.status,
      title: record.title,
      actionPlan: record.actionPlan,
      notes: record.notes || "",
      dueDate: record.dueDate || "",
    });
    setIsDialogOpen(true);
  };

  const saveIntervention = async () => {
    if (!formState.userId || !formState.ownerId || !formState.title.trim() || !formState.actionPlan.trim()) {
      toast({ title: "Missing details", description: "Complete the required intervention fields.", variant: "destructive" });
      return;
    }

    setIsSaving(true);
    try {
      const body = {
        userId: Number(formState.userId),
        ownerId: Number(formState.ownerId),
        type: formState.type,
        issueType: formState.issueType,
        status: formState.status,
        title: formState.title.trim(),
        actionPlan: formState.actionPlan.trim(),
        notes: formState.notes.trim() || undefined,
        dueDate: formState.dueDate || undefined,
        relatedAlertId: relatedAlertId ? Number(relatedAlertId) : undefined,
        relatedAttendanceExceptionId: relatedAttendanceExceptionId ? Number(relatedAttendanceExceptionId) : undefined,
      };

      const response = await fetch(editingIntervention ? apiPath(`/api/interventions/${editingIntervention.id}`) : apiPath("/api/interventions"), {
        method: editingIntervention ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((payload as { error?: string }).error || "Failed to save intervention.");
      }

      toast({ title: editingIntervention ? "Intervention updated" : "Intervention created", description: "The intervention record was saved." });
      setIsDialogOpen(false);
      resetForm();
      await loadInterventions();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to save intervention.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const openCount = filteredInterventions.filter((record) => record.status === "open" || record.status === "in_progress").length;
  const overdueCount = filteredInterventions.filter((record) => record.status !== "completed" && record.dueDate && record.dueDate < new Date().toISOString().slice(0, 10)).length;

  const monitoringCount = filteredInterventions.filter((record) => record.status === "monitoring").length;
  const completedCount = filteredInterventions.filter((record) => record.status === "completed").length;

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Interventions"
        description="Track coaching, action plans, recognition, and follow-up work with clearer ownership, due-date visibility, and linked workflow context."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void loadInterventions()}>
              <ClipboardList className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={openCreateDialog}>
              <PlusCircle className="w-4 h-4 mr-2" />
              Add intervention
            </Button>
          </div>
        }
      />

      <OpsHero
        badge={selectedUserId ? "Worker-focused workflow" : "Reliability and recognition"}
        icon={Target}
        tone={overdueCount > 0 ? "attention" : "default"}
        title="Turn operational signals into coached action, not just case records."
        description="Interventions still use the current POST and PATCH flows, but the page now emphasizes owner clarity, due dates, linked alerts or attendance exceptions, and progress states that explain what happens next."
      >
        <OpsQueueNotice
          tone={overdueCount > 0 ? "attention" : "default"}
          title={overdueCount > 0 ? `${overdueCount} overdue follow-up${overdueCount === 1 ? "" : "s"}` : "Workflow note"}
          description={overdueCount > 0
            ? "Review overdue items first so action plans do not stall after an alert or exception enters the intervention workflow."
            : "Use open for newly created work, in progress for active coaching, monitoring for watch periods, and completed when the outcome is documented."}
        />
      </OpsHero>

      <OpsStatGrid>
        <OpsStatCard label="Open follow-ups" value={openCount} hint="Active intervention work still in motion." icon={Workflow} tone={openCount > 0 ? "attention" : "success"} />
        <OpsStatCard label="Overdue" value={overdueCount} hint="Items whose due date has already passed." icon={CalendarClock} tone={overdueCount > 0 ? "critical" : "success"} />
        <OpsStatCard label="Monitoring" value={monitoringCount} hint="Interventions in watch mode after the initial action plan." icon={ShieldCheck} />
        <OpsStatCard label="Completed" value={completedCount} hint="Closed records preserved for audit and learning." icon={Target} tone="success" />
      </OpsStatGrid>

      <OpsSection
        title="Queue filters"
        description="Narrow the intervention view without changing the underlying dataset or linked workflow context."
      >
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
          <div className="max-w-sm">
            <Label htmlFor="intervention-status-filter">Status filter</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger id="intervention-status-filter">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {interventionStatuses.map((status) => (
                  <SelectItem key={status} value={status}>{humanize(status)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {selectedUserId && (
            <Button variant="ghost" onClick={() => setLocation("/interventions")}>
              Clear worker filter
            </Button>
          )}
        </div>
      </OpsSection>

      <OpsSection
        title="Intervention queue"
        description="Review action plans, linked workflow records, and ownership details before updating the status."
      >
        <div className="space-y-4">
          {isLoading ? (
            <Card className="p-6 text-muted-foreground">Loading interventions...</Card>
          ) : filteredInterventions.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground border-dashed">
              <ClipboardList className="w-10 h-10 mx-auto mb-4 opacity-50" />
              No interventions found for the current filter.
            </Card>
          ) : (
            filteredInterventions.map((record) => (
              <Card key={record.id} className="p-5">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-display text-xl font-bold">{record.title}</h3>
                      {statusBadge(record.status)}
                      <Badge variant="outline">{humanize(record.type)}</Badge>
                      <Badge variant="secondary">{humanize(record.issueType)}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{record.actionPlan}</p>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Worker</p>
                        <p className="mt-1 text-sm font-medium">{userNameMap.get(record.userId) ?? `User #${record.userId}`}</p>
                      </div>
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Owner</p>
                        <p className="mt-1 text-sm font-medium">{userNameMap.get(record.ownerId) ?? `User #${record.ownerId}`}</p>
                      </div>
                      <div className="rounded-xl border bg-secondary/20 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Due date</p>
                        <p className="mt-1 text-sm font-medium">{record.dueDate ? formatDate(record.dueDate) : "No due date set"}</p>
                      </div>
                    </div>

                    <div className="rounded-2xl border bg-background/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Progress framing</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {record.status === "open"
                          ? "This intervention has been created but still needs active follow-through or owner outreach."
                          : record.status === "in_progress"
                            ? "The action plan is active. Keep notes current so the next reviewer sees what changed."
                            : record.status === "monitoring"
                              ? "Initial action is complete and the case is being observed for sustained improvement or follow-up risk."
                              : record.status === "completed"
                                ? "The outcome has been closed and remains visible as part of the performance and audit record."
                                : "The intervention was cancelled and is retained for historical context."}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><UserRound className="w-3 h-3" /> Worker: {userNameMap.get(record.userId) ?? `User #${record.userId}`}</span>
                      <span>Created {formatDateTime(record.createdAt)}</span>
                      {record.relatedAlertId && <span>Linked alert #{record.relatedAlertId}</span>}
                      {record.relatedAttendanceExceptionId && <span>Attendance exception #{record.relatedAttendanceExceptionId}</span>}
                    </div>
                    {record.notes && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{record.notes}</p>}
                  </div>
                  <div className="flex gap-2 lg:flex-col lg:min-w-[160px]">
                    <Button variant="outline" onClick={() => openEditDialog(record)}>Update</Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </OpsSection>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingIntervention ? "Update intervention" : "Create intervention"}</DialogTitle>
            <DialogDescription>
              Track coaching, action plans, and follow-up commitments for workforce reliability and recognition.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Worker</Label>
              <Select value={formState.userId} onValueChange={(value) => setFormState((prev) => ({ ...prev, userId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select worker" /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.id)}>{entry.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={formState.ownerId} onValueChange={(value) => setFormState((prev) => ({ ...prev, ownerId: value }))}>
                <SelectTrigger><SelectValue placeholder="Select owner" /></SelectTrigger>
                <SelectContent>
                  {availableUsers.map((entry) => (
                    <SelectItem key={entry.id} value={String(entry.id)}>{entry.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Intervention type</Label>
              <Select value={formState.type} onValueChange={(value) => setFormState((prev) => ({ ...prev, type: value as InterventionType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {interventionTypes.map((type) => (
                    <SelectItem key={type} value={type}>{humanize(type)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Issue type</Label>
              <Select value={formState.issueType} onValueChange={(value) => setFormState((prev) => ({ ...prev, issueType: value as InterventionIssueType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {interventionIssueTypes.map((issueType) => (
                    <SelectItem key={issueType} value={issueType}>{humanize(issueType)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={formState.status} onValueChange={(value) => setFormState((prev) => ({ ...prev, status: value as InterventionStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {interventionStatuses.map((status) => (
                    <SelectItem key={status} value={status}>{humanize(status)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Follow-up due date</Label>
              <Input type="date" value={formState.dueDate} onChange={(event) => setFormState((prev) => ({ ...prev, dueDate: event.target.value }))} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Title</Label>
              <Input value={formState.title} onChange={(event) => setFormState((prev) => ({ ...prev, title: event.target.value }))} placeholder="Attendance coaching follow-up" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Action plan</Label>
              <Textarea value={formState.actionPlan} onChange={(event) => setFormState((prev) => ({ ...prev, actionPlan: event.target.value }))} placeholder="Define the agreed next steps and review cadence" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea value={formState.notes} onChange={(event) => setFormState((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Add outcome notes, context, or recognition details" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveIntervention} disabled={isSaving}>{isSaving ? "Saving..." : editingIntervention ? "Save update" : "Create intervention"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
