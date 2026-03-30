import { useToast } from "@/hooks/use-toast";
import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListAttendance, useListUsers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge, Input } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatDateTime } from "@/lib/utils";
import { OPERATIONAL_ROLES, useAuth } from "@/lib/auth";
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
import { AlertTriangle, ClipboardCheck, FileWarning, CalendarSearch, ScanFace, ShieldCheck, Clock3 } from "lucide-react";
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

type AttendanceExceptionType =
  | "missed_checkout"
  | "camera_unavailable"
  | "face_mismatch"
  | "manual_correction"
  | "dispute";

type AttendanceExceptionStatus = "open" | "under_review" | "approved" | "rejected" | "escalated";

interface AttendanceExceptionRecord {
  id: number;
  userId: number;
  attendanceLogId: number | null;
  exceptionType: AttendanceExceptionType;
  status: AttendanceExceptionStatus;
  requestedBy: number;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reason: string;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

const openQueueStatuses: AttendanceExceptionStatus[] = ["open", "under_review", "escalated"];

function getExceptionTypeLabel(type: AttendanceExceptionType) {
  return type.replace(/_/g, " ");
}

function getStatusBadge(status: AttendanceExceptionStatus) {
  switch (status) {
    case "approved":
      return <Badge variant="success">Approved</Badge>;
    case "rejected":
      return <Badge variant="destructive">Rejected</Badge>;
    case "under_review":
      return <Badge variant="default">Under Review</Badge>;
    case "escalated":
      return <Badge variant="warning">Escalated</Badge>;
    default:
      return <Badge variant="outline">Open</Badge>;
  }
}

export default function Attendance() {
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [exceptions, setExceptions] = useState<AttendanceExceptionRecord[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submitAttendanceLogId, setSubmitAttendanceLogId] = useState<number | null>(null);
  const [exceptionType, setExceptionType] = useState<AttendanceExceptionType>("manual_correction");
  const [exceptionReason, setExceptionReason] = useState("");
  const [isSubmittingException, setIsSubmittingException] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<AttendanceExceptionRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AttendanceExceptionStatus>("under_review");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isUpdatingException, setIsUpdatingException] = useState(false);
    const [exceptionPage, setExceptionPage] = useState(1);
    const EXCEPTION_PAGE_SIZE = 10;

  const { data: attendanceData, isLoading } = useListAttendance({
    startDate: date,
    endDate: date,
    ...(isOperational ? {} : { userId: user?.id })
  });

  const { data: usersData } = useListUsers({}, { query: { queryKey: ["users", "attendance"], enabled: isOperational } });

  const userNameMap = useMemo(() => {
    const map = new Map<number, string>();
    usersData?.users?.forEach((account) => map.set(account.id, account.name || `User #${account.id}`));
    if (user?.id) {
      map.set(user.id, user.name || `User #${user.id}`);
    }
    return map;
  }, [user, usersData?.users]);

  const getUserName = (id: number) => userNameMap.get(id) || `User #${id}`;

  const loadExceptions = async () => {
    if (!user?.id) return;

    setExceptionsLoading(true);
    try {
      const query = isOperational ? "" : `?userId=${user.id}`;
      const response = await fetch(apiPath(`/api/attendance-exceptions${query}`));
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load attendance exceptions.");
      }

      setExceptions(payload.exceptions || []);
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to load attendance exceptions.", variant: "destructive" });
    } finally {
      setExceptionsLoading(false);
    }
  };

  useEffect(() => {
    void loadExceptions();
  }, [isOperational, user?.id]);

  const visibleExceptions = isOperational
    ? exceptions.filter((exception) => openQueueStatuses.includes(exception.status))
    : exceptions;
  const paginatedExceptions = visibleExceptions.slice((exceptionPage - 1) * EXCEPTION_PAGE_SIZE, exceptionPage * EXCEPTION_PAGE_SIZE);
  const totalExceptionPages = Math.max(1, Math.ceil(visibleExceptions.length / EXCEPTION_PAGE_SIZE));

  const openSubmitDialog = (log?: { id: number; checkIn?: string | null; checkOut?: string | null }) => {
    setSubmitAttendanceLogId(log?.id ?? null);
    setExceptionType(log?.checkIn && !log?.checkOut ? "missed_checkout" : "manual_correction");
    setExceptionReason("");
    setIsSubmitDialogOpen(true);
  };

  const submitException = async () => {
    if (!user?.id || !exceptionReason.trim()) return;

    setIsSubmittingException(true);
    try {
      const response = await fetch(apiPath("/api/attendance-exceptions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          attendanceLogId: submitAttendanceLogId,
          exceptionType,
          reason: exceptionReason.trim(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to submit attendance exception.");
      }

      toast({ title: "Success", description: "Attendance exception submitted successfully." });
      setIsSubmitDialogOpen(false);
      setExceptionReason("");
      await loadExceptions();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to submit attendance exception.", variant: "destructive" });
    } finally {
      setIsSubmittingException(false);
    }
  };

  const openReviewDialog = (exception: AttendanceExceptionRecord) => {
    setReviewTarget(exception);
    setReviewStatus(exception.status === "open" ? "under_review" : exception.status);
    setReviewNotes(exception.reviewNotes || "");
  };

  const submitReviewUpdate = async () => {
    if (!reviewTarget) return;

    setIsUpdatingException(true);
    try {
      const response = await fetch(apiPath(`/api/attendance-exceptions/${reviewTarget.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: reviewStatus,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update attendance exception.");
      }

      toast({ title: "Success", description: "Attendance exception updated." });
      setReviewTarget(null);
      setReviewNotes("");
      await loadExceptions();
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to update attendance exception.", variant: "destructive" });
    } finally {
      setIsUpdatingException(false);
    }
  };

  const openExceptionCount = exceptions.filter((exception) => openQueueStatuses.includes(exception.status)).length;
  const escalatedExceptionCount = exceptions.filter((exception) => exception.status === "escalated").length;
  const biometricFallbackCount = exceptions.filter((exception) => ["camera_unavailable", "face_mismatch"].includes(exception.exceptionType)).length;
  const missingCheckoutCount = exceptions.filter((exception) => exception.exceptionType === "missed_checkout" && openQueueStatuses.includes(exception.status)).length;

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Attendance"
        description="Review attendance records, exception queues, and biometric fallback requests with clearer status-to-action framing while preserving existing correction and review flows."
        actions={
          <div className="flex gap-2 w-full sm:w-auto">
            {!isOperational && (
              <Button onClick={() => openSubmitDialog(attendanceData?.logs?.[0])} className="whitespace-nowrap">
                Request exception
              </Button>
            )}
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full sm:w-auto"
            />
          </div>
        }
      />

      <OpsHero
        badge={isOperational ? "Attendance control surface" : "My attendance record"}
        icon={ClipboardCheck}
        tone={isOperational && escalatedExceptionCount > 0 ? "attention" : "default"}
        title={isOperational ? "Triage exceptions before they distort payroll, compliance, or workforce visibility." : "See your daily record, then raise fair fallback requests when something is missing."}
        description={isOperational
          ? "Operators still use the same APIs and review endpoints, but the page now foregrounds exception pressure, biometric fallback fairness, and the audit notes needed to explain decisions."
          : "Your attendance record and exception history stay intact, with a clearer path to report missed check-outs, camera issues, and face mismatches without losing review context."}
      >
        <OpsQueueNotice
          tone={isOperational && escalatedExceptionCount > 0 ? "attention" : "default"}
          title={isOperational ? `${openExceptionCount} open exception${openExceptionCount === 1 ? "" : "s"} in queue` : "Fair fallback is preserved"}
          description={isOperational
            ? "Prioritize escalated and biometric-fallback cases first so payroll-impacting gaps and fairness-sensitive verification issues are handled quickly."
            : "If biometric verification or checkout capture fails, submit an exception so a manager or HR reviewer can assess the record manually."}
        />
      </OpsHero>

      <OpsStatGrid>
        <OpsStatCard label={isOperational ? "Open queue" : "My open issues"} value={openExceptionCount} hint={isOperational ? "Exceptions needing triage or review." : "Requests still in review."} icon={ClipboardCheck} tone={openExceptionCount > 0 ? "attention" : "success"} />
        <OpsStatCard label="Biometric fallback" value={biometricFallbackCount} hint="Camera unavailable or face mismatch requests." icon={ScanFace} tone={biometricFallbackCount > 0 ? "attention" : "default"} />
        <OpsStatCard label="Missed checkout" value={missingCheckoutCount} hint="Missing end-of-day logs that may affect hours worked." icon={Clock3} tone={missingCheckoutCount > 0 ? "attention" : "default"} />
        <OpsStatCard label="Escalated" value={escalatedExceptionCount} hint="Exceptions flagged for priority follow-up." icon={AlertTriangle} tone={escalatedExceptionCount > 0 ? "critical" : "success"} />
      </OpsStatGrid>

      <OpsSection
        title={isOperational ? "Attendance exception queue" : "My attendance exceptions"}
        description={isOperational
          ? "Use the queue to validate payroll-impacting gaps, review biometric fallbacks, and capture notes that support compliance and auditability."
          : "Follow the status of your exception requests and review any notes left by managers or HR."}
      >
        <div className="space-y-4">
          {exceptionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading attendance exceptions...</p>
          ) : visibleExceptions.length === 0 ? (
            <Empty className="py-10">
              <EmptyMedia variant="icon">{isOperational ? <ClipboardCheck className="w-10 h-10" /> : <FileWarning className="w-10 h-10" />}</EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{isOperational ? "No open attendance exceptions" : "No attendance exceptions yet"}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>
                  {isOperational
                    ? "Your visible teams have no open missed check-outs, disputes, or manual correction requests right now."
                    : "If a check-in or check-out is missing, submit an exception request so HR or your manager can review it fairly."}
                </EmptyDescription>
                {!isOperational && (
                  <Button variant="outline" size="sm" onClick={() => openSubmitDialog(attendanceData?.logs?.[0])}>
                    Request exception
                  </Button>
                )}
              </EmptyContent>
            </Empty>
          ) : (
            <div className="space-y-3">
              {paginatedExceptions.map((exception) => (
                <div key={exception.id} className="rounded-2xl border bg-secondary/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold capitalize">{getExceptionTypeLabel(exception.exceptionType)}</p>
                        {getStatusBadge(exception.status)}
                        {exception.status === "open" && <Badge variant="warning">Needs triage</Badge>}
                        {exception.status === "escalated" && <Badge variant="destructive">Priority follow-up</Badge>}
                        {["camera_unavailable", "face_mismatch"].includes(exception.exceptionType) && <Badge variant="outline">Biometric fallback</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{exception.reason}</p>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border bg-background/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Worker</p>
                          <p className="mt-1 text-sm font-medium">{getUserName(exception.userId)}</p>
                        </div>
                        <div className="rounded-xl border bg-background/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Submitted</p>
                          <p className="mt-1 text-sm font-medium">{formatDateTime(exception.createdAt)}</p>
                        </div>
                        <div className="rounded-xl border bg-background/70 px-3 py-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review state</p>
                          <p className="mt-1 text-sm font-medium">
                            {exception.reviewedAt ? `Updated ${formatDateTime(exception.reviewedAt)}` : "Awaiting review"}
                          </p>
                        </div>
                      </div>

                      <div className="rounded-2xl border bg-background/70 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why this matters</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {exception.exceptionType === "missed_checkout"
                            ? "A missing checkout can understate worked hours unless it is reviewed and corrected."
                            : exception.exceptionType === "camera_unavailable"
                              ? "Camera issues should not block fair attendance review, so this request preserves a manual audit path."
                              : exception.exceptionType === "face_mismatch"
                                ? "Face mismatch cases need careful human review to balance security, explainability, and fallback fairness."
                                : "This exception keeps a documented review trail for attendance corrections and disputes."}
                        </p>
                      </div>

                      {exception.reviewNotes && (
                        <p className="text-xs text-muted-foreground">Review notes: {exception.reviewNotes}</p>
                      )}
                    </div>
                    {isOperational && (
                      <Button variant="outline" size="sm" onClick={() => openReviewDialog(exception)}>
                        Review
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {visibleExceptions.length > EXCEPTION_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-sm text-muted-foreground">
                    Page {exceptionPage} of {totalExceptionPages} · Showing {(exceptionPage - 1) * EXCEPTION_PAGE_SIZE + 1}–{Math.min(exceptionPage * EXCEPTION_PAGE_SIZE, visibleExceptions.length)} of {visibleExceptions.length}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setExceptionPage(p => Math.max(1, p - 1))} disabled={exceptionPage === 1}>Previous</Button>
                    <Button size="sm" variant="outline" onClick={() => setExceptionPage(p => p + 1)} disabled={paginatedExceptions.length < EXCEPTION_PAGE_SIZE}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </OpsSection>

      <OpsSection
        title="Daily attendance ledger"
        description={isOperational
          ? "Use the selected date to review live records before escalating exceptions or reconciling hours."
          : "Review your attendance record for the selected day before requesting a correction."}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Date</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold">Check In</th>
                <th className="px-6 py-4 font-semibold">Check Out</th>
                <th className="px-6 py-4 font-semibold">Hours</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <>
                  {[...Array(5)].map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-4 w-12" /></td>
                      <td className="px-6 py-4"><Skeleton className="h-6 w-24" /></td>
                    </tr>
                  ))}
                </>
              ) : attendanceData?.logs?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8">
                    <Empty className="border-0 p-0 py-6">
                      <EmptyMedia variant="icon"><CalendarSearch className="w-10 h-10" /></EmptyMedia>
                      <EmptyHeader><EmptyTitle>No attendance records for this date</EmptyTitle></EmptyHeader>
                      <EmptyContent>
                        <EmptyDescription>
                          {isOperational
                            ? "Try another day or review the exception queue to confirm whether a correction is pending."
                            : "If you expected a check-in or check-out here, submit an attendance exception for review."}
                        </EmptyDescription>
                        {!isOperational && (
                          <Button variant="outline" size="sm" onClick={() => openSubmitDialog()}>
                            Request exception
                          </Button>
                        )}
                      </EmptyContent>
                    </Empty>
                  </td>
                </tr>
              ) : (
                attendanceData?.logs?.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{getUserName(log.userId)}</td>
                    <td className="px-6 py-4">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        log.status === "present" ? "success" :
                        log.status === "absent" ? "destructive" :
                        log.status === "late" ? "warning" : "secondary"
                      } className="capitalize">
                        {log.status.replace("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono">{log.checkIn ? formatDateTime(log.checkIn).split(", ")[1] : "-"}</td>
                    <td className="px-6 py-4 font-mono">{log.checkOut ? formatDateTime(log.checkOut).split(", ")[1] : "-"}</td>
                    <td className="px-6 py-4 font-semibold text-primary">{log.hoursWorked || "-"}</td>
                    <td className="px-6 py-4 text-right">
                      {isOperational ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => openSubmitDialog(log)}>
                          {log.checkIn && !log.checkOut ? "Report missed checkout" : "Request correction"}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </OpsSection>

      <Dialog open={isSubmitDialogOpen} onOpenChange={setIsSubmitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit attendance exception</DialogTitle>
            <DialogDescription>
              Report a missed checkout, correction request, camera issue, or dispute for HR and managers to review.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-exception-type">Exception type</Label>
              <Select value={exceptionType} onValueChange={(value) => setExceptionType(value as AttendanceExceptionType)}>
                <SelectTrigger id="attendance-exception-type">
                  <SelectValue placeholder="Select exception type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="missed_checkout">Missed checkout</SelectItem>
                  <SelectItem value="manual_correction">Manual correction</SelectItem>
                  <SelectItem value="dispute">Dispute</SelectItem>
                  <SelectItem value="camera_unavailable">Camera unavailable</SelectItem>
                  <SelectItem value="face_mismatch">Face mismatch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-exception-reason">Reason</Label>
              <Textarea
                id="attendance-exception-reason"
                value={exceptionReason}
                onChange={(event) => setExceptionReason(event.target.value)}
                placeholder="Describe what happened and what needs to be corrected"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsSubmitDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitException} disabled={isSubmittingException || !exceptionReason.trim()}>
              {isSubmittingException ? "Submitting..." : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review attendance exception</DialogTitle>
            <DialogDescription>
              Update the workflow status and capture optional review notes for audit history.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="attendance-review-status">Status</Label>
              <Select value={reviewStatus} onValueChange={(value) => setReviewStatus(value as AttendanceExceptionStatus)}>
                <SelectTrigger id="attendance-review-status">
                  <SelectValue placeholder="Select review status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="under_review">Under review</SelectItem>
                  <SelectItem value="approved">Approve</SelectItem>
                  <SelectItem value="rejected">Reject</SelectItem>
                  <SelectItem value="escalated">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="attendance-review-notes">Review notes</Label>
              <Textarea
                id="attendance-review-notes"
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                placeholder="Add context for the worker and audit trail"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={submitReviewUpdate} disabled={isUpdatingException}>
              {isUpdatingException ? "Saving..." : "Save update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
