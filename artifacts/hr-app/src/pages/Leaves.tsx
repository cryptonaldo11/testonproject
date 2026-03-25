import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListLeaves, useCreateLeave, useUpdateLeave } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, Label } from "@/components/ui/core";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Plus } from "lucide-react";

export default function Leaves() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  const [isApplying, setIsApplying] = useState(false);
  
  const { data: leavesData, refetch } = useListLeaves(
    isAdminHR ? {} : { userId: user?.id }
  );

  const createLeaveMutation = useCreateLeave({ onSuccess: () => { setIsApplying(false); refetch(); }});
  const updateLeaveMutation = useUpdateLeave({ onSuccess: () => refetch() });

  const handleApply = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if(user?.id) {
      createLeaveMutation.mutate({
        data: {
          userId: user.id,
          leaveType: fd.get("leaveType") as "annual" | "medical" | "emergency" | "unpaid" | "other",
          startDate: fd.get("startDate") as string,
          endDate: fd.get("endDate") as string,
          reason: fd.get("reason") as string,
        }
      });
    }
  };

  const handleStatusChange = (id: number, status: "pending" | "approved" | "rejected" | "cancelled") => {
    updateLeaveMutation.mutate({ id, data: { status } });
  };

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Leave Management</h1>
          <p className="text-muted-foreground">Manage and track leave applications.</p>
        </div>
        {!isAdminHR && (
          <Button onClick={() => setIsApplying(!isApplying)}>
            <Plus className="w-5 h-5 mr-2" /> Apply Leave
          </Button>
        )}
      </div>

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
                  <option value="unpaid">Unpaid Leave</option>
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
                <th className="px-6 py-4 font-semibold">User ID</th>
                <th className="px-6 py-4 font-semibold">Type</th>
                <th className="px-6 py-4 font-semibold">Duration</th>
                <th className="px-6 py-4 font-semibold">Reason</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                {isAdminHR && <th className="px-6 py-4 font-semibold text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {leavesData?.leaves?.map((leave) => (
                <tr key={leave.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-4 font-medium">Emp #{leave.userId}</td>
                  <td className="px-6 py-4 capitalize font-semibold text-primary">{leave.leaveType}</td>
                  <td className="px-6 py-4 text-muted-foreground">
                    {formatDate(leave.startDate)} <br/>to {formatDate(leave.endDate)}
                    <span className="block mt-1 text-xs font-semibold text-foreground">{leave.totalDays} Days</span>
                  </td>
                  <td className="px-6 py-4 max-w-[200px] truncate" title={leave.reason}>{leave.reason}</td>
                  <td className="px-6 py-4">
                    <Badge variant={
                      leave.status === 'approved' ? 'success' : 
                      leave.status === 'rejected' ? 'destructive' : 
                      leave.status === 'pending' ? 'warning' : 'secondary'
                    } className="capitalize">
                      {leave.status}
                    </Badge>
                  </td>
                  {isAdminHR && (
                    <td className="px-6 py-4 text-right space-x-2">
                      {leave.status === 'pending' && (
                        <>
                          <Button size="sm" variant="outline" className="border-emerald-500 text-emerald-600 hover:bg-emerald-50" onClick={() => handleStatusChange(leave.id, 'approved')}>Approve</Button>
                          <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" onClick={() => handleStatusChange(leave.id, 'rejected')}>Reject</Button>
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
    </DashboardLayout>
  );
}
