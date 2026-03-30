import React, { useState } from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useGetAttendanceSummary, type AttendanceSummaryResponse } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/core";
import { OpsHero, OpsPageHeader, OpsQueueNotice, OpsSection, OpsStatCard, OpsStatGrid } from "@/components/ui/ops-cockpit";
import { useAuth } from "@/lib/auth";
import { FileDown, DollarSign, Clock, ReceiptText } from "lucide-react";

function exportToCsv(data: AttendanceSummaryResponse, startDate: string, endDate: string) {
  const headers = ["Employee", "User ID", "Days Worked", "Total Hours", "Hourly Rate (SGD)", "Total Cost (SGD)"];
  const rows = data.items.map(item => [
    `"${item.userName}"`,
    item.userId,
    item.presentDays,
    item.totalHours,
    item.hourlyRate,
    item.totalCost,
  ]);

  const summaryRows = [
    [],
    ["Summary"],
    ["Period", `${startDate} to ${endDate}`],
    ["Total Man-Hours", data.totalManHours],
    ["Total Cost (SGD)", data.totalCost],
  ];

  const csvContent = [
    headers.join(","),
    ...rows.map(r => r.join(",")),
    ...summaryRows.map(r => r.join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `manhours_${startDate}_${endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function ManHours() {
  const { hasPermission } = useAuth();
  const canReadReports = hasPermission("reports:read:team");
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);

  const { data: summaryData, isLoading } = useGetAttendanceSummary({ startDate, endDate }, { query: { queryKey: ["attendance", "summary", startDate, endDate], enabled: canReadReports } });

  if (!canReadReports) {
    return <Redirect to="/dashboard" />;
  }

  const handleExport = () => {
    if (!summaryData?.items?.length) return;
    exportToCsv(summaryData, startDate, endDate);
  };

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Man-Hours & Cost"
        description="Translate attendance into labor exposure for the visible workforce while preserving the current CSV export flow used for finance and operational review."
        actions={
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-auto" />
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-auto" />
            <button
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-primary font-semibold rounded-xl hover:bg-secondary/80 transition-colors disabled:opacity-50"
              onClick={handleExport}
              disabled={!summaryData?.items?.length}
            >
              <FileDown className="w-4 h-4" /> Export CSV
            </button>
          </div>
        }
      />

      <OpsHero
        badge="Cost and workforce coverage"
        icon={ReceiptText}
        title="Use this as the labor-cost control room for the selected period."
        description="The figures below preserve the existing reporting contract while making the primary decisions clearer: validate the date range, review total exposure, and export the underlying rows for downstream analysis."
      >
        <OpsQueueNotice
          title="Export behavior preserved"
          description="CSV generation is unchanged so finance and print/export workflows continue to work as before."
          tone="success"
        />
      </OpsHero>

      <OpsStatGrid>
        <OpsStatCard label="Total man-hours" value={`${summaryData?.totalManHours || "0"} hrs`} hint="Tracked hours in the selected period." icon={Clock} tone="success" />
        <OpsStatCard label="Estimated cost" value={`SGD $${summaryData?.totalCost || "0.00"}`} hint="Calculated from visible employee hourly rates." icon={DollarSign} tone="attention" />
      </OpsStatGrid>

      <OpsSection
        title="Detailed labor ledger"
        description="Review employee-by-employee hours and cost before exporting or sharing the report."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-secondary/50 text-muted-foreground uppercase text-xs">
              <tr>
                <th className="px-6 py-4 font-semibold">Employee</th>
                <th className="px-6 py-4 font-semibold text-center">Days Worked</th>
                <th className="px-6 py-4 font-semibold text-center">Total Hours</th>
                <th className="px-6 py-4 font-semibold text-right">Hourly Rate</th>
                <th className="px-6 py-4 font-semibold text-right">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="p-8 text-center">Loading data...</td></tr>
              ) : summaryData?.items?.map((item) => (
                <tr key={item.userId} className="hover:bg-accent/10 transition-colors">
                  <td className="px-6 py-4 font-medium text-foreground">{item.userName}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-primary font-bold">{item.presentDays}</span>
                  </td>
                  <td className="px-6 py-4 text-center font-mono font-semibold">{item.totalHours}</td>
                  <td className="px-6 py-4 text-right text-muted-foreground">SGD ${item.hourlyRate}/hr</td>
                  <td className="px-6 py-4 text-right font-display font-bold text-lg">SGD ${item.totalCost}</td>
                </tr>
              ))}
              {!isLoading && !summaryData?.items?.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center">
                    <OpsQueueNotice
                      title="No labor data for this period"
                      description="Adjust the date range or wait for attendance records to populate before exporting the report."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </OpsSection>
    </DashboardLayout>
  );
}
