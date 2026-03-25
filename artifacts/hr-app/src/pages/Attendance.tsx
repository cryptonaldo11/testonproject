import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListAttendance, useListUsers } from "@workspace/api-client-react";
import { Card, Badge, Input, Select } from "@/components/ui/core";
import { formatDate, formatDateTime } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export default function Attendance() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const { data: attendanceData, isLoading } = useListAttendance({ 
    date,
    ...(isAdminHR ? {} : { userId: user?.id }) 
  });
  
  const { data: usersData } = useListUsers({}, { query: { enabled: isAdminHR } });
  
  const getUserName = (id: number) => {
    if (!isAdminHR && user?.id === id) return user.name;
    return usersData?.users?.find(u => u.id === id)?.name || "Unknown User";
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-display font-bold">Attendance Logs</h1>
          <p className="text-muted-foreground">View daily check-in and check-out records.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Input 
            type="date" 
            value={date} 
            onChange={(e) => setDate(e.target.value)}
            className="w-full sm:w-auto"
          />
        </div>
      </div>

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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading...</td></tr>
              ) : attendanceData?.logs?.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">No records found for this date.</td></tr>
              ) : (
                attendanceData?.logs?.map((log) => (
                  <tr key={log.id} className="hover:bg-accent/20 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{getUserName(log.userId)}</td>
                    <td className="px-6 py-4">{formatDate(log.date)}</td>
                    <td className="px-6 py-4">
                      <Badge variant={
                        log.status === 'present' ? 'success' : 
                        log.status === 'absent' ? 'destructive' : 
                        log.status === 'late' ? 'warning' : 'secondary'
                      } className="capitalize">
                        {log.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-mono">{log.checkIn ? formatDateTime(log.checkIn).split(', ')[1] : '-'}</td>
                    <td className="px-6 py-4 font-mono">{log.checkOut ? formatDateTime(log.checkOut).split(', ')[1] : '-'}</td>
                    <td className="px-6 py-4 font-semibold text-primary">{log.hoursWorked || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </DashboardLayout>
  );
}
