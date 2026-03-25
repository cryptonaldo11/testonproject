import React from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListProductivityScores } from "@workspace/api-client-react";
import { Card, Badge } from "@/components/ui/core";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function Productivity() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  
  const { data: scoreData } = useListProductivityScores(
    isAdminHR ? {} : { userId: user?.id }
  );

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">Productivity Scores</h1>
        <p className="text-muted-foreground">AI-computed efficiency metrics based on attendance data.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {scoreData?.scores?.map((score) => {
          const s = parseInt(score.score);
          const isGood = s >= 80;
          const isWarn = s >= 60 && s < 80;
          return (
            <Card key={score.id} className="overflow-hidden">
              <div className={`p-6 border-b text-white flex justify-between items-center ${isGood ? 'bg-primary' : isWarn ? 'bg-amber-500' : 'bg-destructive'}`}>
                <div>
                  <p className="font-semibold text-white/80 uppercase tracking-wider text-xs mb-1">Emp #{score.userId} • {score.month}/{score.year}</p>
                  <h3 className="text-4xl font-display font-bold tabular-nums">{score.score}<span className="text-lg opacity-70">/100</span></h3>
                </div>
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-sm">
                  {isGood ? <TrendingUp className="w-8 h-8" /> : <TrendingDown className="w-8 h-8" />}
                </div>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground font-medium">Attendance Rate</span>
                    <span className="font-bold">{score.attendanceRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${score.attendanceRate}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground font-medium">Punctuality</span>
                    <span className="font-bold">{score.punctualityRate}%</span>
                  </div>
                  <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${score.punctualityRate}%` }}></div>
                  </div>
                </div>
                <div className="pt-4 border-t border-dashed">
                  <p className="text-sm font-medium italic text-muted-foreground flex gap-2">
                    <Activity className="w-4 h-4 text-primary shrink-0" />
                    {score.notes || "Solid performance metrics this month."}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </DashboardLayout>
  );
}
