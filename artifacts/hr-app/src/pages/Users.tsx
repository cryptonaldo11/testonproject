import React, { useEffect, useState } from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListUsers } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { OpsHero, OpsPageHeader, OpsQueueNotice, OpsSection, OpsStatCard, OpsStatGrid } from "@/components/ui/ops-cockpit";
import { ADMIN_ONLY_ROLES, useAuth } from "@/lib/auth";
import { UserPlus, UserCheck, UserX, ShieldCheck } from "lucide-react";

const PAGE_SIZE = 10;

type PaginatedUsersResponse = {
  users: Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    employeeId?: string | null;
    phone?: string | null;
    hourlyRate: string;
    isActive: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export default function Users() {
  const { hasRole, hasPermission } = useAuth();
  const canReadUsers = hasPermission("users:read");
  const isAdminOnly = hasRole(ADMIN_ONLY_ROLES);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListUsers(
    { page, pageSize: PAGE_SIZE } as never,
    { query: { queryKey: ["users", "list", page, PAGE_SIZE], enabled: canReadUsers } },
  );
  const usersData = data as PaginatedUsersResponse | undefined;

  useEffect(() => {
    if (usersData && usersData.totalPages > 0 && page > usersData.totalPages) {
      setPage(usersData.totalPages);
    }
  }, [page, usersData]);

  if (!canReadUsers) {
    return <Redirect to="/dashboard" />;
  }

  const users = usersData?.users ?? [];
  const totalUsers = usersData?.total ?? 0;
  const totalPages = usersData?.totalPages ?? 0;
  const currentPage = usersData?.page ?? page;
  const startItem = totalUsers === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = totalUsers === 0 ? 0 : startItem + users.length - 1;

  const activeUsers = users.filter((u) => u.isActive === "true").length;
  const inactiveUsers = users.filter((u) => u.isActive !== "true").length;
  const adminHrUsers = users.filter((u) => ["admin", "hr"].includes(u.role)).length;

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Employees"
        description="Monitor who is in scope, which accounts are active, and where role-based ownership may affect downstream attendance, compliance, and reporting workflows."
        actions={
          isAdminOnly ? (
            <Button>
              <UserPlus className="w-5 h-5 mr-2" /> Add Employee
            </Button>
          ) : null
        }
      />

      <OpsHero
        badge="Access and workforce coverage"
        icon={ShieldCheck}
        title="Review people records before work enters the queues."
        description="This page keeps the current read flow intact while reframing employee records as the source of truth for permissions, contactability, and downstream operational visibility."
      >
        <OpsQueueNotice
          title="Operator note"
          description="Edits still use the existing placeholder action. Shell and theme work may adjust surrounding chrome, but this page is intentionally limited to the employee listing surface."
        />
      </OpsHero>

      <OpsStatGrid>
        <OpsStatCard label="Visible employees" value={totalUsers} hint="Accounts currently returned by your scoped API query." icon={ShieldCheck} tone="success" />
        <OpsStatCard label="Active now" value={activeUsers} hint="Users able to participate in current operations." icon={UserCheck} tone="success" />
        <OpsStatCard label="Inactive" value={inactiveUsers} hint="Records that may need cleanup before routing work." icon={UserX} tone={inactiveUsers > 0 ? "attention" : "default"} />
        <OpsStatCard label="Admin / HR roles" value={adminHrUsers} hint="Higher-privilege accounts in the visible slice." icon={ShieldCheck} />
      </OpsStatGrid>

      <OpsSection
        title="Employee registry"
        description="Use this list as an operations reference for contact details, access role, and workforce status."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold">Contact</th>
                <th className="px-6 py-4 font-semibold">Role</th>
                <th className="px-6 py-4 font-semibold">Rate / Hr</th>
                <th className="px-6 py-4 font-semibold">Status</th>
                <th className="px-6 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!isLoading && users.map((u) => (
                <tr key={u.id} className="hover:bg-accent/20 transition-colors align-top">
                  <td className="px-6 py-4">
                    <p className="font-bold text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">ID: {u.employeeId || `EMP-${u.id}`}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p>{u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.phone || "No phone on file"}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      <Badge variant={u.role === "admin" ? "default" : u.role === "hr" ? "secondary" : "outline"} className="uppercase text-[10px]">
                        {u.role}
                      </Badge>
                      <p className="text-xs text-muted-foreground">Role controls what queues and reports this employee can see.</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 font-mono font-medium">${u.hourlyRate}</td>
                  <td className="px-6 py-4">
                     <Badge variant={u.isActive === "true" ? "success" : "destructive"}>
                        {u.isActive === "true" ? "Active" : "Inactive"}
                     </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary-foreground">Edit</Button>
                  </td>
                </tr>
              ))}
              {!isLoading && users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center">
                    <OpsQueueNotice
                      title="No users found in your visible scope"
                      description="This usually means there are no employee accounts for the current filters or your role has a narrower visibility window."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalUsers > 0 && (
          <div className="flex items-center justify-between border-t bg-card px-6 py-4">
            <p className="text-sm text-muted-foreground">
              Showing {startItem}–{endItem} of {totalUsers}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading}>
                Previous
              </Button>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => p + 1)} disabled={isLoading || totalPages === 0 || currentPage >= totalPages}>
                Next
              </Button>
            </div>
          </div>
        )}
      </OpsSection>
    </DashboardLayout>
  );
}
