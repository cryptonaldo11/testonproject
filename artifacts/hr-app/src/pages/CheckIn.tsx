import React, { useState, useEffect } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useCheckIn, useCheckOut, useListAttendance } from "@workspace/api-client-react";
import { Card, CardContent, Button } from "@/components/ui/core";
import { Clock, MapPin, CheckCircle2, UserCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default function CheckIn() {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toISOString().split('T')[0];
  
  const { data: attendanceData, refetch } = useListAttendance({ 
    userId: user?.id, 
    date: today 
  }, { query: { enabled: !!user?.id } });

  const checkInMutation = useCheckIn({ mutation: { onSuccess: () => refetch() } });
  const checkOutMutation = useCheckOut({ mutation: { onSuccess: () => refetch() } });

  const todayLog = attendanceData?.logs?.[0];
  const isCheckedIn = !!todayLog?.checkIn;
  const isCheckedOut = !!todayLog?.checkOut;

  const handleCheckIn = () => {
    if (user?.id) checkInMutation.mutate({ data: { userId: user.id, faceMatchScore: "0.98" } });
  };

  const handleCheckOut = () => {
    if (user?.id) checkOutMutation.mutate({ data: { userId: user.id } });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto mt-8">
        <Card className="overflow-hidden border-0 shadow-2xl">
          <div className="bg-primary p-8 text-center text-white relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <h2 className="text-6xl font-display font-bold tabular-nums tracking-tight relative z-10">
              {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
            </h2>
            <p className="text-primary-foreground/80 mt-2 font-medium relative z-10">
              {time.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          
          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-8">
              
              <div className="w-48 h-48 rounded-full border-4 border-dashed border-primary/20 flex items-center justify-center bg-secondary/30 relative overflow-hidden">
                {/* Placeholder for Face Recognition feed */}
                <UserCircle2 className="w-24 h-24 text-primary/40" />
                <div className="absolute bottom-4 bg-primary/80 backdrop-blur text-white text-xs px-3 py-1 rounded-full font-medium">
                  Camera Active
                </div>
              </div>

              <div className="flex gap-4 w-full">
                <Button 
                  size="lg" 
                  className="flex-1 text-lg h-16" 
                  disabled={isCheckedIn || checkInMutation.isPending}
                  onClick={handleCheckIn}
                >
                  <Clock className="w-5 h-5 mr-2" />
                  {isCheckedIn ? "Checked In" : "Check In"}
                </Button>
                
                <Button 
                  size="lg" 
                  variant="outline" 
                  className="flex-1 text-lg h-16 border-2" 
                  disabled={!isCheckedIn || isCheckedOut || checkOutMutation.isPending}
                  onClick={handleCheckOut}
                >
                  Check Out
                </Button>
              </div>

              <div className="w-full bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Today's Status
                </h3>
                
                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check In</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedIn ? formatDateTime(todayLog?.checkIn) : '--:--'}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${isCheckedOut ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check Out</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedOut ? formatDateTime(todayLog?.checkOut) : '--:--'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
