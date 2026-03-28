import React from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListUsers } from "@workspace/api-client-react";
import { Card, Badge, Button } from "@/components/ui/core";
import { ADMIN_ONLY_ROLES, useAuth } from "@/lib/auth";
import { UserPlus } from "lucide-react";

export default function Users() {
  const { hasRole, hasPermission } = useAuth();
  const canReadUsers = hasPermission("users:read");
  const isAdminOnly = hasRole(ADMIN_ONLY_ROLES);
  const { data: usersData } = useListUsers(undefined, { query: { queryKey: ["users", "list"], enabled: canReadUsers } });

  if (!canReadUsers) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Employees</h1>
          <p className="text-muted-foreground">View visible employee accounts and roles.</p>
        </div>
        {isAdminOnly && (
          <Button>
            <UserPlus className="w-5 h-5 mr-2" /> Add Employee
          </Button>
        )}
      </div>

      <Card>
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
              {usersData?.users?.map((u) => (
                <tr key={u.id} className="hover:bg-accent/20 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-bold text-foreground">{u.name}</p>
                    <p className="text-xs text-muted-foreground">ID: {u.employeeId || `EMP-${u.id}`}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p>{u.email}</p>
                    <p className="text-xs text-muted-foreground">{u.phone || "-"}</p>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant={u.role === "admin" ? "default" : u.role === "hr" ? "secondary" : "outline"} className="uppercase text-[10px]">
                      {u.role}
                    </Badge>
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
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
