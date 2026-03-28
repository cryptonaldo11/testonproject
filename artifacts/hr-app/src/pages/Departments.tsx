import React from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListDepartments } from "@workspace/api-client-react";
import { Card, Button } from "@/components/ui/core";
import { ADMIN_ONLY_ROLES, useAuth } from "@/lib/auth";
import { Building2, Plus } from "lucide-react";

export default function Departments() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ADMIN_ONLY_ROLES);
  const { data: deptData } = useListDepartments({ query: { queryKey: ["departments", "admin"], enabled: isAdmin } });

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Departments</h1>
          <p className="text-muted-foreground">Manage organizational structure.</p>
        </div>
        <Button>
          <Plus className="w-5 h-5 mr-2" /> Add Department
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {deptData?.departments?.map((dept) => (
          <Card key={dept.id} className="p-6 hover:-translate-y-1 transition-transform border-t-4 border-t-primary">
            <div className="flex items-start justify-between mb-4">
              <div className="p-3 bg-secondary rounded-xl text-primary">
                <Building2 className="w-6 h-6" />
              </div>
              <Button variant="ghost" size="sm">Edit</Button>
            </div>
            <h3 className="text-xl font-bold font-display mb-2">{dept.name}</h3>
            <p className="text-muted-foreground text-sm line-clamp-2">{dept.description || "No description provided."}</p>
          </Card>
        ))}
      </div>
    </DashboardLayout>
  );
}
