import React, { useEffect, useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListAttendance, useListUsers } from "@workspace/api-client-react";
import { Card, Badge, Input, Button } from "@/components/ui/core";
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
import { AlertTriangle, ClipboardCheck, FileWarning } from "lucide-react";

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
  const { user, hasRole } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [exceptions, setExceptions] = useState<AttendanceExceptionRecord[]>([]);
  const [exceptionsLoading, setExceptionsLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false);
  const [submitAttendanceLogId, setSubmitAttendanceLogId] = useState<number | null>(null);
  const [exceptionType, setExceptionType] = useState<AttendanceExceptionType>("manual_correction");
  const [exceptionReason, setExceptionReason] = useState("");
  const [isSubmittingException, setIsSubmittingException] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<AttendanceExceptionRecord | null>(null);
  const [reviewStatus, setReviewStatus] = useState<AttendanceExceptionStatus>("under_review");
  const [reviewNotes, setReviewNotes] = useState("");
  const [isUpdatingException, setIsUpdatingException] = useState(false);

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
      const response = await fetch(`/api/attendance-exceptions${query}`);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load attendance exceptions.");
      }

      setExceptions(payload.exceptions || []);
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to load attendance exceptions.",
      });
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

  const openSubmitDialog = (log?: { id: number; checkIn?: string | null; checkOut?: string | null }) => {
    setFeedback(null);
    setSubmitAttendanceLogId(log?.id ?? null);
    setExceptionType(log?.checkIn && !log?.checkOut ? "missed_checkout" : "manual_correction");
    setExceptionReason("");
    setIsSubmitDialogOpen(true);
  };

  const submitException = async () => {
    if (!user?.id || !exceptionReason.trim()) return;

    setIsSubmittingException(true);
    try {
      const response = await fetch("/api/attendance-exceptions", {
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

      setFeedback({ type: "success", message: "Attendance exception submitted successfully." });
      setIsSubmitDialogOpen(false);
      setExceptionReason("");
      await loadExceptions();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to submit attendance exception.",
      });
    } finally {
      setIsSubmittingException(false);
    }
  };

  const openReviewDialog = (exception: AttendanceExceptionRecord) => {
    setFeedback(null);
    setReviewTarget(exception);
    setReviewStatus(exception.status === "open" ? "under_review" : exception.status);
    setReviewNotes(exception.reviewNotes || "");
  };

  const submitReviewUpdate = async () => {
    if (!reviewTarget) return;

    setIsUpdatingException(true);
    try {
      const response = await fetch(`/api/attendance-exceptions/${reviewTarget.id}`, {
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

      setFeedback({ type: "success", message: "Attendance exception updated." });
      setReviewTarget(null);
      setReviewNotes("");
      await loadExceptions();
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Failed to update attendance exception.",
      });
    } finally {
      setIsUpdatingException(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Attendance Logs</h1>
          <p className="text-muted-foreground">View daily check-in and check-out records for your visible scope.</p>
        </div>
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
      </div>

      {feedback && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      <Card className="mb-6 border-0 shadow-lg">
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3">
            {isOperational ? <ClipboardCheck className="w-5 h-5 text-primary" /> : <FileWarning className="w-5 h-5 text-primary" />}
            <div>
              <h2 className="font-display text-xl font-bold">{isOperational ? "Attendance exception review queue" : "My attendance exceptions"}</h2>
              <p className="text-sm text-muted-foreground">
                {isOperational
                  ? "Review missed check-outs, disputes, and manual correction requests from your visible team."
                  : "Track your submitted attendance issues and request corrections when needed."}
              </p>
            </div>
          </div>

          {exceptionsLoading ? (
            <p className="text-sm text-muted-foreground">Loading attendance exceptions...</p>
          ) : visibleExceptions.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
              {isOperational ? "No open attendance exceptions right now." : "No attendance exceptions submitted yet."}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleExceptions.map((exception) => (
                <div key={exception.id} className="rounded-xl border bg-secondary/20 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold capitalize">{getExceptionTypeLabel(exception.exceptionType)}</p>
                        {getStatusBadge(exception.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">{exception.reason}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                        <span>{getUserName(exception.userId)}</span>
                        <span>Submitted {formatDateTime(exception.createdAt)}</span>
                        {exception.reviewedAt && <span>Reviewed {formatDateTime(exception.reviewedAt)}</span>}
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
            </div>
          )}
        </div>
      </Card>

      <Card>
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
                <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : attendanceData?.logs?.length === 0 ? (
                <tr><td colSpan={7} className="px-6 py-8 text-center text-muted-foreground">No records found for this date.</td></tr>
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
      </Card>

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
