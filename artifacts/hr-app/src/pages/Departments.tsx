import React from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListDepartments } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OpsHero, OpsPageHeader, OpsSection, OpsStatCard, OpsStatGrid } from "@/components/ui/ops-cockpit";
import { ADMIN_ONLY_ROLES, useAuth } from "@/lib/auth";
import { Building2, Plus, Layers3, ClipboardList } from "lucide-react";

export default function Departments() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole(ADMIN_ONLY_ROLES);
  const { data: deptData } = useListDepartments({ query: { queryKey: ["departments", "admin"], enabled: isAdmin } });

  if (!isAdmin) {
    return <Redirect to="/dashboard" />;
  }

  const departmentCount = deptData?.departments?.length ?? 0;
  const withDescriptions = deptData?.departments?.filter((dept) => dept.description?.trim()).length ?? 0;

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Departments"
        description="Review the organizational map that scopes managers, queues, and reporting lines before making broader workforce changes."
        actions={
          <Button>
            <Plus className="w-5 h-5 mr-2" /> Add Department
          </Button>
        }
      />

      <OpsHero
        badge="Structure and scope"
        icon={Building2}
        title="Keep department ownership clear before routing work."
        description="Department setup shapes who sees attendance issues, leave queues, and productivity trends. Use this page as a control surface for organizational coverage, not just a static list."
      >
        <div className="rounded-2xl border bg-background/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Control note</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Shell and navigation updates may change surrounding spacing, but this page keeps its current add and edit entry points intact.
          </p>
        </div>
      </OpsHero>

      <OpsStatGrid>
        <OpsStatCard label="Departments live" value={departmentCount} hint="Visible org units in the current workspace." icon={Layers3} tone="success" />
        <OpsStatCard label="Profiles described" value={withDescriptions} hint="Departments with context for managers and admins." icon={ClipboardList} />
      </OpsStatGrid>

      <OpsSection
        title="Department registry"
        description="Use the current cards to review coverage before editing structure."
      >
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          {deptData?.departments?.map((dept) => (
            <Card key={dept.id} className="border shadow-sm transition-transform hover:-translate-y-1">
              <div className="border-b bg-secondary/20 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-background p-3 text-primary shadow-sm">
                      <Building2 className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Department</p>
                      <h3 className="mt-1 text-xl font-bold font-display">{dept.name}</h3>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm">Edit</Button>
                </div>
              </div>
              <div className="p-6">
                <p className="text-sm text-muted-foreground">
                  {dept.description || "No description provided yet. Add one so routing and reporting decisions are easier to explain."}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </OpsSection>
    </DashboardLayout>
  );
}
