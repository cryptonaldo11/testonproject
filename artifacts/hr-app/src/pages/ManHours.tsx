import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useGetAttendanceSummary } from "@workspace/api-client-react";
import { Card, Input } from "@/components/ui/core";
import { FileDown, DollarSign, Clock } from "lucide-react";

export default function ManHours() {
  const [startDate, setStartDate] = useState(new Date(new Date().setDate(1)).toISOString().split('T')[0]); // First day of month
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: summaryData, isLoading } = useGetAttendanceSummary({ startDate, endDate });

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Man-Hours & Cost</h1>
          <p className="text-muted-foreground">Financial summary based on attendance logs.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-auto" />
          <span className="self-center font-medium text-muted-foreground">to</span>
          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-auto" />
          <button className="flex items-center gap-2 px-4 py-2 bg-secondary text-primary font-semibold rounded-xl hover:bg-secondary/80 transition-colors">
            <FileDown className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <Card className="bg-primary text-white border-0 shadow-xl shadow-primary/20">
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="text-primary-foreground/80 font-medium mb-1">Total Man-Hours</p>
              <h2 className="text-4xl font-display font-bold">{summaryData?.totalManHours || "0"} <span className="text-xl font-normal opacity-80">hrs</span></h2>
            </div>
            <Clock className="w-12 h-12 opacity-50" />
          </div>
        </Card>
        <Card className="bg-emerald-900 text-white border-0 shadow-xl shadow-emerald-900/20">
          <div className="p-6 flex items-center justify-between">
            <div>
              <p className="text-emerald-100/80 font-medium mb-1">Total Estimated Cost</p>
              <h2 className="text-4xl font-display font-bold"><span className="text-xl font-normal opacity-80">$</span>{summaryData?.totalCost || "0.00"}</h2>
            </div>
            <DollarSign className="w-12 h-12 opacity-50" />
          </div>
        </Card>
      </div>

      <Card>
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
                  <td className="px-6 py-4 text-right text-muted-foreground">${item.hourlyRate}/hr</td>
                  <td className="px-6 py-4 text-right font-display font-bold text-lg">${item.totalCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
