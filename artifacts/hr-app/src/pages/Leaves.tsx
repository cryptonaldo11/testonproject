import React, { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListLeaves, useCreateLeave, useListUsers, useUpdateLeave } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, Label } from "@/components/ui/core";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { OPERATIONAL_ROLES, ADMIN_HR_ROLES, useAuth } from "@/lib/auth";
import { Plus } from "lucide-react";

function employeeFallback(userId: number): string {
  return `Employee #${userId}`;
}

function hasStrongMismatch(leaveType: string, aiClassification?: string | null, aiConfidence?: string | null): boolean {
  const confidence = aiConfidence ? Number(aiConfidence) : 0;
  if (!aiClassification || aiClassification === "unclassified" || confidence < 0.75) return false;

  const compatibilityMap: Record<string, string[]> = {
    medical: ["medical"],
    emergency: ["emergency"],
    bereavement: ["annual", "other", "unpaid"],
    family: ["annual", "other", "unpaid"],
    personal: ["annual", "other", "unpaid"],
  };

  return !(compatibilityMap[aiClassification] ?? []).includes(leaveType);
}

function normalizeReason(reason: string): string {
  return reason.trim().toLowerCase().replace(/\s+/g, " ");
}

function skeletonRow(isAdminHR: boolean) {
  return (
    <tr>
      <td className="px-6 py-4"><Skeleton className="h-4 w-24" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-32" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-48" /></td>
      <td className="px-6 py-4"><Skeleton className="h-4 w-16" /></td>
      {isAdminHR && <td className="px-6 py-4"><Skeleton className="h-4 w-20" /></td>}
    </tr>
  );
}

export default function Leaves() {
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const [isApplying, setIsApplying] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<{ id: number; action: "approved" | "rejected" } | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");

  const { data: leavesData, isLoading: leavesLoading, refetch } = useListLeaves(
    isOperational ? {} : { userId: user?.id },
  );
  const { data: usersData } = useListUsers(undefined, {
    query: {
      queryKey: ["leaves", "users"],
      enabled: isOperational,
    },
  });

  const userLabelMap = useMemo(() => {
    const entries = new Map<number, string>();
    usersData?.users?.forEach((account) => {
      entries.set(account.id, account.name || employeeFallback(account.id));
    });
    if (user?.id) {
      entries.set(user.id, user.name || employeeFallback(user.id));
    }
    return entries;
  }, [user, usersData?.users]);

  const getEmployeeLabel = (userId: number) => userLabelMap.get(userId) ?? employeeFallback(userId);

  const analytics = useMemo(() => {
    if (!isAdminHR || !leavesData?.leaves) {
      return {
        unclassifiedCount: 0,
        mismatchCount: 0,
        repeatedReasons: [] as Array<{ reason: string; count: number }>,
      };
    }

    const reasonCounts = new Map<string, number>();
    let unclassifiedCount = 0;
    let mismatchCount = 0;

    leavesData.leaves.forEach((leave) => {
      if (leave.aiClassification === "unclassified") {
        unclassifiedCount += 1;
      }
      if (hasStrongMismatch(leave.leaveType, leave.aiClassification, leave.aiConfidence)) {
        mismatchCount += 1;
      }
      const normalizedReason = normalizeReason(leave.reason);
      reasonCounts.set(normalizedReason, (reasonCounts.get(normalizedReason) ?? 0) + 1);
    });

    const repeatedReasons = Array.from(reasonCounts.entries())
      .filter(([, count]) => count > 1)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([reason, count]) => ({ reason, count }));

    return {
      unclassifiedCount,
      mismatchCount,
      repeatedReasons,
    };
  }, [isAdminHR, leavesData?.leaves]);

  const createLeaveMutation = useCreateLeave({
    mutation: {
      onSuccess: () => {
        setIsApplying(false);
        toast({ title: "Success", description: "Leave application submitted successfully." });
        refetch();
      },
      onError: (err: Error & { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error || "Failed to submit leave application. Please try again.", variant: "destructive" });
      },
    },
  });
  const updateLeaveMutation = useUpdateLeave({
    mutation: {
      onSuccess: () => {
        toast({ title: "Success", description: "Leave status updated successfully." });
        setReviewTarget(null);
        setReviewNotes("");
        refetch();
      },
      onError: (err: Error & { response?: { data?: { error?: string } } }) => {
        toast({ title: "Error", description: err?.response?.data?.error || "Failed to update leave status. Please try again.", variant: "destructive" });
      },
    },
  });

  const handleApply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const startDate = fd.get("startDate") as string;
    const endDate = fd.get("endDate") as string;

    if (!user?.id) return;

    if (startDate > endDate) {
      toast({ title: "Invalid dates", description: "End date must be on or after the start date.", variant: "destructive" });
      return;
    }

    createLeaveMutation.mutate({
      data: {
        userId: user.id,
        leaveType: fd.get("leaveType") as "annual" | "medical" | "emergency" | "unpaid" | "other",
        startDate,
        endDate,
        reason: fd.get("reason") as string,
      },
    });
  };

  const openReviewDialog = (id: number, action: "approved" | "rejected") => {
    setReviewTarget({ id, action });
    setReviewNotes("");
  };

  const submitReview = () => {
    if (!reviewTarget) return;
    updateLeaveMutation.mutate({
      id: reviewTarget.id,
      data: {
        status: reviewTarget.action,
        reviewNotes,
      },
    });
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Leave Management</h1>
          <p className="text-muted-foreground">Manage and track leave applications in your visible scope.</p>
        </div>
        {!isAdminHR && (
          <Button onClick={() => setIsApplying(!isApplying)}>
            <Plus className="w-5 h-5 mr-2" /> Apply Leave
          </Button>
        )}
      </div>

      {isAdminHR && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Unclassified reasons</p>
            <p className="mt-2 text-2xl font-bold">{analytics.unclassifiedCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">High-confidence mismatches</p>
            <p className="mt-2 text-2xl font-bold">{analytics.mismatchCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Repeated patterns</p>
            {analytics.repeatedReasons.length > 0 ? (
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {analytics.repeatedReasons.map((item) => (
                  <div key={item.reason} className="flex justify-between gap-4">
                    <span className="truncate">{item.reason}</span>
                    <span className="font-medium text-foreground">×{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No repeated reasons yet.</p>
            )}
          </Card>
        </div>
      )}

      {isApplying && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <div className="p-6">
            <h3 className="font-display font-bold text-xl mb-4">New Leave Application</h3>
            <form onSubmit={handleApply} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Leave Type</Label>
                <select name="leaveType" className="flex h-12 w-full rounded-xl border-2 border-input bg-card px-4 py-2 text-sm focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10">
                  <option value="annual">Annual Leave</option>
                  <option value="medical">Medical Leave</option>
                  <option value="emergency">Emergency Leave</option>
                  <option value="unpaid">Unpaid Leave</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" name="startDate" required />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" name="endDate" required />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input type="text" name="reason" placeholder="Detailed reason..." required />
              </div>
              <div className="col-span-full flex justify-end gap-3 mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsApplying(false)}>Cancel</Button>
                <Button type="submit" disabled={createLeaveMutation.isPending}>Submit Application</Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-6 py-4 font-semibold">Duration</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                {isAdminHR && <th className="px-6 py-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leavesLoading
                ? [...Array(5)].map((_, i) => skeletonRow(isAdminHR))
                : leavesData?.leaves?.map((leave) => (
                  <tr key={leave.id} className="hover:bg-accent/20 transition-colors align-top">
                    <td className="px-6 py-4 font-medium">{getEmployeeLabel(leave.userId)}</td>
                    <td className="px-6 py-4 capitalize font-semibold text-primary">{leave.leaveType}</td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {formatDate(leave.startDate)} <br />to {formatDate(leave.endDate)}
                      <span className="block mt-1 text-xs font-semibold text-foreground">{leave.totalDays} Days</span>
                    </td>
                    <td className="px-6 py-4 max-w-[240px]">
                      <div className="truncate" title={leave.reason}>{leave.reason}</div>
                      {isAdminHR && (leave.aiClassification || leave.aiConfidence) && (
                        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                          <p>
                            AI suggestion: <span className="font-medium capitalize">{leave.aiClassification || "unclassified"}</span>
                            {leave.aiConfidence ? ` • Confidence ${Math.round(Number(leave.aiConfidence) * 100)}%` : ""}
                          </p>
                          {hasStrongMismatch(leave.leaveType, leave.aiClassification, leave.aiConfidence) && (
                            <p className="text-amber-700 font-medium">Possible mismatch: selected leave type may not match the reason text.</p>
                          )}
                          {leave.aiClassification === "unclassified" && (
                            <p className="text-muted-foreground">Low-confidence AI suggestion. HR review recommended.</p>
                          )}
                        </div>
                      )}
                      {leave.reviewNotes && (
                        <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">Review note: {leave.reviewNotes}</p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <Badge
                        variant={
                          leave.status === "approved"
                            ? "success"
                            : leave.status === "rejected"
                              ? "destructive"
                              : leave.status === "pending"
                                ? "warning"
                                : "secondary"
                        }
                        className="capitalize"
                      >
                        {leave.status}
                      </Badge>
                    </td>
                    {isAdminHR && (
                      <td className="px-6 py-4 text-right space-x-2">
                        {leave.status === "pending" && (
                          <>
                            <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => openReviewDialog(leave.id, "approved")}>Approve</Button>
                            <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => openReviewDialog(leave.id, "rejected")}>Reject</Button>
                          </>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{reviewTarget?.action === "approved" ? "Approve leave request" : "Reject leave request"}</DialogTitle>
            <DialogDescription>
              Add an optional review note for this decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="leave-review-notes">Review notes</Label>
            <Textarea
              id="leave-review-notes"
              value={reviewNotes}
              onChange={(event) => setReviewNotes(event.target.value)}
              placeholder="Optional notes for the employee or audit history"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={submitReview} disabled={updateLeaveMutation.isPending}>
              {updateLeaveMutation.isPending ? "Saving..." : reviewTarget?.action === "approved" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
