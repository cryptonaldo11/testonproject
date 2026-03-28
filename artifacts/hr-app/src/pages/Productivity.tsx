import React, { useMemo, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  useCalculateAllProductivity,
  useCalculateProductivity,
  useGetProductivityReport,
  useListDepartments,
  useListProductivityScores,
  useListUsers,
} from "@workspace/api-client-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, Card, Input, Label, Badge } from "@/components/ui/core";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Activity,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileDown,
  Printer,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  RotateCw,
  Building2,
} from "lucide-react";
import { ADMIN_HR_ROLES, OPERATIONAL_ROLES, useAuth } from "@/lib/auth";

type ScoreCard = {
  id: number;
  userId: number;
  score: string;
  attendanceRate: string;
  punctualityRate: string;
  leaveFrequency: string;
  month: string;
  year: string;
  notes?: string | null;
};

type ProductivityReportData = {
  score: {
    score: string;
    attendanceRate: string;
    punctualityRate: string;
    leaveFrequency: string;
    notes?: string | null;
  };
  details: {
    totalDays: number;
    presentDays: number;
    lateDays: number;
    absentDays: number;
    halfDays: number;
    totalHoursWorked: number;
    averageCheckInTime?: string | null;
  };
  period: {
    month: number;
    year: number;
  };
};

type SortMode = "score-desc" | "score-asc" | "employee-asc" | "employee-desc";

const MONTH_OPTIONS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function getCurrentMonth(): string {
  return String(new Date().getMonth() + 1);
}

function getCurrentYear(): string {
  return String(new Date().getFullYear());
}

function monthLabel(month: string): string {
  return MONTH_OPTIONS.find((option) => option.value === month)?.label ?? month;
}

function employeeFallback(userId: number): string {
  return `Employee #${userId}`;
}

function getInitials(label: string): string {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "NA";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function getScoreStatus(score: number): {
  label: string;
  variant: "success" | "warning" | "destructive" | "secondary";
} {
  if (score >= 85) return { label: "Excellent", variant: "success" };
  if (score >= 70) return { label: "Good", variant: "secondary" };
  if (score >= 55) return { label: "Needs Attention", variant: "warning" };
  return { label: "High Risk", variant: "destructive" };
}

function toPreviousMonth(month: string, year: string): { month: string; year: string } {
  const numericMonth = Number(month);
  const numericYear = Number(year);
  if (numericMonth === 1) return { month: "12", year: String(numericYear - 1) };
  return { month: String(numericMonth - 1), year: String(numericYear) };
}

function toNextMonth(month: string, year: string): { month: string; year: string } {
  const numericMonth = Number(month);
  const numericYear = Number(year);
  if (numericMonth === 12) return { month: "1", year: String(numericYear + 1) };
  return { month: String(numericMonth + 1), year: String(numericYear) };
}

function exportScoresToCsv(scores: ScoreCard[], getEmployeeLabel: (userId: number) => string) {
  const headers = [
    "Employee",
    "User ID",
    "Month",
    "Year",
    "Score",
    "Attendance Rate",
    "Punctuality Rate",
    "Leave Frequency",
    "Notes",
  ];

  const rows = scores.map((score) => [
    `"${getEmployeeLabel(score.userId)}"`,
    score.userId,
    `"${monthLabel(score.month)}"`,
    score.year,
    score.score,
    score.attendanceRate,
    score.punctualityRate,
    score.leaveFrequency,
    `"${(score.notes ?? "").replaceAll('"', '""')}"`,
  ]);

  const csvContent = [headers.join(","), ...rows.map((row) => row.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `productivity_visible_cards.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportDetailReportToCsv(
  employeeLabel: string,
  report: ProductivityReportData,
) {
  const csvContent = [
    ["Employee", `"${employeeLabel}"`],
    ["Month", `"${monthLabel(String(report.period.month))}"`],
    ["Year", report.period.year],
    [],
    ["Metric", "Value"],
    ["Overall Score", report.score.score],
    ["Attendance Rate", report.score.attendanceRate],
    ["Punctuality Rate", report.score.punctualityRate],
    ["Leave Frequency", report.score.leaveFrequency],
    ["Total Days", report.details.totalDays],
    ["Present Days", report.details.presentDays],
    ["Late Days", report.details.lateDays],
    ["Absent Days", report.details.absentDays],
    ["Half Days", report.details.halfDays],
    ["Total Hours Worked", report.details.totalHoursWorked],
    ["Average Check-In Time", report.details.averageCheckInTime ?? ""],
    ["Notes", `"${(report.score.notes ?? "").replaceAll('"', '""')}"`],
  ]
    .map((row) => row.join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `productivity_report_${employeeLabel.replaceAll(/\s+/g, "_").toLowerCase()}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Productivity() {
  const { user, hasRole } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedUserId, setSelectedUserId] = useState<string>("all");
  const [cardFilterUserId, setCardFilterUserId] = useState<string>("all");
  const [departmentFilterId, setDepartmentFilterId] = useState<string>("all");
  const [sortMode, setSortMode] = useState<SortMode>("score-desc");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [bulkRecalcFailures, setBulkRecalcFailures] = useState<Array<{ userId: number; success: boolean; error?: string }> | null>(null);
  const [detailScore, setDetailScore] = useState<ScoreCard | null>(null);

  const listParams = isOperational
    ? { month: selectedMonth, year: selectedYear }
    : { userId: user?.id, month: selectedMonth, year: selectedYear };
  const previousPeriod = toPreviousMonth(selectedMonth, selectedYear);
  const previousListParams = isOperational
    ? { month: previousPeriod.month, year: previousPeriod.year }
    : { userId: user?.id, month: previousPeriod.month, year: previousPeriod.year };

  const { data: scoreData, isLoading, refetch } = useListProductivityScores(listParams);
  const { data: previousScoreData } = useListProductivityScores(previousListParams, {
    query: {
      queryKey: ["productivity", "previous-period", previousListParams],
    },
  });
  const { data: usersData } = useListUsers(undefined, {
    query: {
      queryKey: ["productivity", "users"],
      enabled: isOperational,
    },
  });
  const { data: departmentsData } = useListDepartments({
    query: {
      queryKey: ["productivity", "departments"],
      enabled: isOperational,
    },
  });

  const visibleScores = scoreData?.scores ?? [];
  const previousScores = previousScoreData?.scores ?? [];

  const userLabelMap = useMemo(() => {
    const entries = new Map<number, string>();
    usersData?.users?.forEach((account) => {
      entries.set(account.id, account.name || employeeFallback(account.id));
    });
    if (user?.id) {
      entries.set(user.id, user.name || employeeFallback(user.id));
    }
    return entries;
  }, [user, usersData?.users]);

  const userDepartmentMap = useMemo(() => {
    const entries = new Map<number, number | null>();
    usersData?.users?.forEach((account) => {
      entries.set(account.id, account.departmentId ?? null);
    });
    return entries;
  }, [usersData?.users]);

  const previousScoreMap = useMemo(() => {
    const entries = new Map<number, ScoreCard>();
    previousScores.forEach((score) => entries.set(score.userId, score));
    return entries;
  }, [previousScores]);

  const getEmployeeLabel = (userId: number) => userLabelMap.get(userId) ?? employeeFallback(userId);
  const getDepartmentLabel = (departmentId: number | null | undefined) => {
    if (!departmentId) return "No department";
    return departmentsData?.departments?.find((department) => department.id === departmentId)?.name ?? "Unknown department";
  };

  const availableUsers = useMemo(() => {
    const seen = new Set<number>();
    return visibleScores
      .filter((score) => {
        if (seen.has(score.userId)) return false;
        seen.add(score.userId);
        return true;
      })
      .map((score) => ({
        userId: score.userId,
        label: getEmployeeLabel(score.userId),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [visibleScores, userLabelMap]);

  const displayedScores = useMemo(() => {
    let nextScores = [...visibleScores];

    if (cardFilterUserId !== "all") {
      nextScores = nextScores.filter((score) => String(score.userId) === cardFilterUserId);
    }

    if (isAdminHR && departmentFilterId !== "all") {
      nextScores = nextScores.filter(
        (score) => String(userDepartmentMap.get(score.userId) ?? "") === departmentFilterId,
      );
    }

    nextScores.sort((left, right) => {
      if (sortMode === "score-desc") return Number(right.score) - Number(left.score);
      if (sortMode === "score-asc") return Number(left.score) - Number(right.score);
      if (sortMode === "employee-asc") {
        return getEmployeeLabel(left.userId).localeCompare(getEmployeeLabel(right.userId));
      }
      return getEmployeeLabel(right.userId).localeCompare(getEmployeeLabel(left.userId));
    });

    return nextScores;
  }, [visibleScores, cardFilterUserId, departmentFilterId, sortMode, userLabelMap, userDepartmentMap, isAdminHR]);

  const calculateOneMutation = useCalculateProductivity();
  const calculateAllMutation = useCalculateAllProductivity();

  const detailUserId = detailScore ? detailScore.userId : 0;
  const detailMonth = detailScore?.month ? Number(detailScore.month) : undefined;
  const detailYear = detailScore?.year ? Number(detailScore.year) : undefined;
  const detailEmployeeLabel = detailScore ? getEmployeeLabel(detailScore.userId) : "Employee";
  const detailDepartmentLabel = detailScore ? getDepartmentLabel(userDepartmentMap.get(detailScore.userId)) : "";

  const {
    data: detailReport,
    isLoading: isDetailLoading,
    refetch: refetchDetail,
  } = useGetProductivityReport(detailUserId, {
    month: detailMonth,
    year: detailYear,
  });

  const handlePreviousMonth = () => {
    const previous = toPreviousMonth(selectedMonth, selectedYear);
    setSelectedMonth(previous.month);
    setSelectedYear(previous.year);
  };

  const handleNextMonth = () => {
    const next = toNextMonth(selectedMonth, selectedYear);
    setSelectedMonth(next.month);
    setSelectedYear(next.year);
  };

  const handleRecalculateSelected = async () => {
    if (selectedUserId === "all") {
      setFeedback({ type: "error", message: "Choose a person before running a single-user recalculation." });
      return;
    }

    setBulkRecalcFailures(null);

    try {
      const response = await calculateOneMutation.mutateAsync({
        data: {
          userId: Number(selectedUserId),
          month: Number(selectedMonth),
          year: Number(selectedYear),
        },
      });

      setFeedback({ type: "success", message: response.message });
      await refetch();
      if (
        detailScore &&
        detailScore.userId === Number(selectedUserId) &&
        detailScore.month === selectedMonth &&
        detailScore.year === selectedYear
      ) {
        await refetchDetail();
      }
    } catch {
      setFeedback({ type: "error", message: "Could not recalculate the selected employee right now." });
    }
  };

  const handleQuickRecalculate = async (score: ScoreCard) => {
    setBulkRecalcFailures(null);
    try {
      const response = await calculateOneMutation.mutateAsync({
        data: {
          userId: score.userId,
          month: Number(score.month),
          year: Number(score.year),
        },
      });
      setFeedback({ type: "success", message: response.message });
      await refetch();
      if (detailScore && detailScore.id === score.id) {
        await refetchDetail();
      }
    } catch {
      setFeedback({ type: "error", message: `Could not recalculate ${getEmployeeLabel(score.userId)} right now.` });
    }
  };

  const handleRecalculateAll = async () => {
    setBulkRecalcFailures(null);
    try {
      const response = await calculateAllMutation.mutateAsync({
        data: {
          month: Number(selectedMonth),
          year: Number(selectedYear),
        },
      });

      const failures = response.results ?? [];
      setBulkRecalcFailures(failures.length > 0 ? failures : null);
      setFeedback({
        type: failures.length > 0 ? "error" : "success",
        message:
          failures.length > 0
            ? `Recalculated ${response.summary.successful} of ${response.summary.total} employees. ${response.summary.failed} failed.`
            : `Recalculated ${response.summary.successful} of ${response.summary.total} employees for ${monthLabel(selectedMonth)} ${selectedYear}.`,
      });
      await refetch();
      if (detailScore && detailScore.month === selectedMonth && detailScore.year === selectedYear) {
        await refetchDetail();
      }
    } catch {
      setFeedback({ type: "error", message: "Could not recalculate all productivity scores right now." });
    }
  };

  const handleExportVisible = () => {
    if (!displayedScores.length) return;
    exportScoresToCsv(displayedScores, getEmployeeLabel);
  };

  const handleExportDetail = () => {
    if (!detailReport) return;
    exportDetailReportToCsv(detailEmployeeLabel, detailReport);
  };

  const handlePrintDetail = () => {
    if (!detailReport) return;
    window.print();
  };

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold">Productivity Scores</h1>
          <p className="text-muted-foreground">
            Review monthly productivity, attendance reliability, punctuality, and leave impact for your visible scope.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-full border bg-card px-2 py-2 text-sm text-muted-foreground shadow-sm">
            <Button variant="ghost" size="icon" onClick={handlePreviousMonth} aria-label="View previous month">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span>Viewing {monthLabel(selectedMonth)} {selectedYear}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={handleNextMonth} aria-label="View next month">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="outline" onClick={handleExportVisible} disabled={!displayedScores.length}>
            <FileDown className="mr-2 h-4 w-4" /> Export visible CSV
          </Button>
        </div>
      </div>

      {isAdminHR && (
        <Card className="mb-6 p-5 print:hidden">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Monthly recalculation controls</h2>
              <p className="text-sm text-muted-foreground">
                Refresh one employee or everyone for the selected reporting period.
              </p>
            </div>
            <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary w-fit">
              Admin / HR only
            </div>
          </div>

          {feedback && (
            <div
              className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                feedback.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-destructive/20 bg-destructive/10 text-destructive"
              }`}
            >
              {feedback.message}
            </div>
          )}

          {bulkRecalcFailures && bulkRecalcFailures.length > 0 && (
            <div className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 p-4">
              <p className="mb-3 text-sm font-semibold text-destructive">Employees that failed to recalculate</p>
              <div className="space-y-2 text-sm">
                {bulkRecalcFailures.map((failure) => (
                  <div key={failure.userId} className="rounded-lg border bg-background px-3 py-2">
                    <div className="font-medium">{getEmployeeLabel(failure.userId)} <span className="text-muted-foreground">(User ID: {failure.userId})</span></div>
                    <div className="text-muted-foreground">{failure.error || "Unknown error"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Year</Label>
              <Input
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
                inputMode="numeric"
                placeholder="e.g. 2026"
              />
            </div>

            <div className="space-y-2">
              <Label>Employee</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visible employees</SelectItem>
                  {availableUsers.map((option) => (
                    <SelectItem key={option.userId} value={String(option.userId)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-2 self-end">
              <Button
                onClick={handleRecalculateSelected}
                disabled={calculateOneMutation.isPending || selectedUserId === "all" || !selectedYear}
              >
                {calculateOneMutation.isPending ? "Recalculating employee..." : "Recalculate selected employee"}
              </Button>
              <Button
                onClick={handleRecalculateAll}
                variant="outline"
                disabled={calculateAllMutation.isPending || !selectedYear}
              >
                {calculateAllMutation.isPending ? "Recalculating everyone..." : "Recalculate everyone"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="sticky top-20 z-20 mb-6 border bg-background/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85 print:hidden">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Sort</Label>
            <Select value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
              <SelectTrigger>
                <SelectValue placeholder="Sort productivity cards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score-desc">Highest score first</SelectItem>
                <SelectItem value="score-asc">Lowest score first</SelectItem>
                <SelectItem value="employee-asc">Employee A–Z</SelectItem>
                <SelectItem value="employee-desc">Employee Z–A</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Employee</Label>
            <Select value={cardFilterUserId} onValueChange={setCardFilterUserId}>
              <SelectTrigger>
                <SelectValue placeholder="Filter displayed cards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All displayed employees</SelectItem>
                {availableUsers.map((option) => (
                  <SelectItem key={option.userId} value={String(option.userId)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isAdminHR && (
            <div className="space-y-2">
              <Label>Department</Label>
              <Select value={departmentFilterId} onValueChange={setDepartmentFilterId}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by department" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departmentsData?.departments?.map((department) => (
                    <SelectItem key={department.id} value={String(department.id)}>
                      {department.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-end text-sm text-muted-foreground">
            Showing {displayedScores.length} of {visibleScores.length} records for {monthLabel(selectedMonth)} {selectedYear}.
          </div>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4 animate-pulse text-primary" />
            Loading productivity scores for {monthLabel(selectedMonth)} {selectedYear}...
          </div>
        </Card>
      ) : displayedScores.length === 0 ? (
        <Card className="p-8">
          <div className="flex flex-col items-start gap-3">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">No productivity records match this view</h2>
              <p className="text-sm text-muted-foreground">
                {visibleScores.length === 0
                  ? `There are no productivity scores for ${monthLabel(selectedMonth)} ${selectedYear}. ${isAdminHR ? "Run a recalculation after attendance or approved leave exists." : "Check back after attendance and leave data has been processed."}`
                  : "Try a different filter or sort combination to broaden the current view."}
              </p>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {displayedScores.map((score) => {
            const numericScore = parseInt(score.score, 10);
            const isGood = numericScore >= 80;
            const isWarn = numericScore >= 60 && numericScore < 80;
            const employeeLabel = getEmployeeLabel(score.userId);
            const departmentLabel = getDepartmentLabel(userDepartmentMap.get(score.userId));
            const scoreStatus = getScoreStatus(numericScore);
            const previousScore = previousScoreMap.get(score.userId);
            const trendDelta = previousScore ? numericScore - Number(previousScore.score) : null;

            return (
              <Card key={score.id} className="overflow-hidden">
                <div className={`flex items-start justify-between gap-4 border-b p-6 text-white ${isGood ? "bg-primary" : isWarn ? "bg-amber-500" : "bg-destructive"}`}>
                  <div className="flex items-start gap-3">
                    <Avatar className="h-12 w-12 border border-white/30">
                      <AvatarFallback className="bg-white/15 text-sm font-semibold text-white">
                        {getInitials(employeeLabel)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-2">
                      <div>
                        <p className="text-sm font-semibold text-white">{employeeLabel}</p>
                        <p className="text-xs text-white/80">{departmentLabel}</p>
                        <p className="text-xs text-white/80">
                          {monthLabel(score.month)} {score.year}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={scoreStatus.variant}>{scoreStatus.label}</Badge>
                        {trendDelta !== null && (
                          <span className="text-xs text-white/90">
                            {trendDelta > 0 ? "+" : ""}{trendDelta} vs previous month
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-4xl font-bold tabular-nums">
                        {score.score}
                        <span className="text-lg opacity-70">/100</span>
                      </h3>
                    </div>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
                    {isGood ? <TrendingUp className="h-8 w-8" /> : <TrendingDown className="h-8 w-8" />}
                  </div>
                </div>

                <div className="space-y-4 p-6">
                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-muted-foreground">Attendance rate</span>
                      <span className="font-bold">{score.attendanceRate}%</span>
                    </div>
                    <Progress value={Number(score.attendanceRate)} />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-muted-foreground">Punctuality</span>
                      <span className="font-bold">{score.punctualityRate}%</span>
                    </div>
                    <Progress value={Number(score.punctualityRate)} className="[&>div]:bg-emerald-500" />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-muted-foreground">Leave frequency</span>
                      <span className="font-bold">{score.leaveFrequency}%</span>
                    </div>
                    <Progress value={Number(score.leaveFrequency)} className="[&>div]:bg-amber-500" />
                  </div>

                  <div className="rounded-xl border border-dashed bg-muted/30 p-4">
                    <p className="flex gap-2 text-sm font-medium text-muted-foreground">
                      <Activity className="h-4 w-4 shrink-0 text-primary" />
                      {score.notes || "Monthly performance is within the expected range."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs text-muted-foreground">Score mix: 40% attendance • 35% punctuality • 25% leave</div>
                    <div className="flex flex-wrap gap-2">
                      {isAdminHR && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleQuickRecalculate(score)}
                          disabled={calculateOneMutation.isPending}
                        >
                          <RotateCw className="mr-2 h-4 w-4" /> Quick recalc
                        </Button>
                      )}
                      <Button size="sm" onClick={() => setDetailScore(score)}>
                        View details
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!detailScore} onOpenChange={(open) => !open && setDetailScore(null)}>
        <DialogContent className="max-w-4xl print:max-w-none print:border-0 print:shadow-none">
          <DialogHeader className="print:mb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between print:hidden">
              <div className="flex items-center gap-3">
                <Avatar className="h-12 w-12">
                  <AvatarFallback className="bg-primary/10 font-semibold text-primary">
                    {getInitials(detailEmployeeLabel)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <DialogTitle>Productivity breakdown • {detailEmployeeLabel}</DialogTitle>
                  <DialogDescription>
                    {detailScore ? `${monthLabel(detailScore.month)} ${detailScore.year} • ${detailDepartmentLabel}` : "Detailed monthly productivity report."}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={handleExportDetail} disabled={!detailReport}>
                  <FileDown className="mr-2 h-4 w-4" /> Export report
                </Button>
                <Button variant="outline" onClick={handlePrintDetail} disabled={!detailReport}>
                  <Printer className="mr-2 h-4 w-4" /> Print
                </Button>
              </div>
            </div>
            <div className="hidden print:block">
              <h2 className="text-2xl font-bold">Productivity breakdown • {detailEmployeeLabel}</h2>
              <p className="text-sm text-muted-foreground">
                {detailScore ? `${monthLabel(detailScore.month)} ${detailScore.year} • ${detailDepartmentLabel}` : "Detailed monthly productivity report."}
              </p>
            </div>
          </DialogHeader>

          {!detailScore || isDetailLoading || !detailReport ? (
            <div className="py-10 text-sm text-muted-foreground">Loading productivity report...</div>
          ) : (
            <div className="space-y-6 print:space-y-4">
              <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
                <Card className="p-4 print:border print:shadow-none">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Overall score</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-3xl font-bold">{detailReport.score.score}/100</p>
                    <Badge variant={getScoreStatus(Number(detailReport.score.score)).variant}>
                      {getScoreStatus(Number(detailReport.score.score)).label}
                    </Badge>
                  </div>
                </Card>
                <Card className="p-4 print:border print:shadow-none">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Attendance</p>
                  <p className="mt-2 text-2xl font-bold">{detailReport.score.attendanceRate}%</p>
                </Card>
                <Card className="p-4 print:border print:shadow-none">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Punctuality</p>
                  <p className="mt-2 text-2xl font-bold">{detailReport.score.punctualityRate}%</p>
                </Card>
                <Card className="p-4 print:border print:shadow-none">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Leave frequency</p>
                  <p className="mt-2 text-2xl font-bold">{detailReport.score.leaveFrequency}%</p>
                </Card>
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr] print:grid-cols-2">
                <Card className="p-5 print:border print:shadow-none">
                  <p className="mb-3 text-sm font-semibold">Weighted score inputs</p>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Attendance (40%)</span>
                        <span>{detailReport.score.attendanceRate}%</span>
                      </div>
                      <Progress value={Number(detailReport.score.attendanceRate)} />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Punctuality (35%)</span>
                        <span>{detailReport.score.punctualityRate}%</span>
                      </div>
                      <Progress value={Number(detailReport.score.punctualityRate)} className="[&>div]:bg-emerald-500" />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-sm">
                        <span>Leave frequency (25%)</span>
                        <span>{detailReport.score.leaveFrequency}%</span>
                      </div>
                      <Progress value={Number(detailReport.score.leaveFrequency)} className="[&>div]:bg-amber-500" />
                    </div>
                  </div>
                </Card>

                <Card className="p-5 print:border print:shadow-none">
                  <p className="mb-3 text-sm font-semibold">At a glance</p>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span className="flex items-center gap-2 text-muted-foreground"><CalendarDays className="h-4 w-4" />Tracked days</span>
                      <span className="font-semibold">{detailReport.details.totalDays}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Average check-in</span>
                      <span className="font-semibold">{detailReport.details.averageCheckInTime ?? "—"}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span className="flex items-center gap-2 text-muted-foreground"><Activity className="h-4 w-4" />Hours worked</span>
                      <span className="font-semibold">{detailReport.details.totalHoursWorked.toFixed(2)}</span>
                    </div>
                  </div>
                </Card>
              </div>

              <Card className="p-5 print:border print:shadow-none">
                <p className="mb-3 text-sm font-semibold">Attendance detail report</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Total days</TableHead>
                      <TableHead>Present</TableHead>
                      <TableHead>Late</TableHead>
                      <TableHead>Absent</TableHead>
                      <TableHead>Half days</TableHead>
                      <TableHead>Total hours</TableHead>
                      <TableHead>Avg check-in</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>{detailReport.details.totalDays}</TableCell>
                      <TableCell>{detailReport.details.presentDays}</TableCell>
                      <TableCell>{detailReport.details.lateDays}</TableCell>
                      <TableCell>{detailReport.details.absentDays}</TableCell>
                      <TableCell>{detailReport.details.halfDays}</TableCell>
                      <TableCell>{detailReport.details.totalHoursWorked.toFixed(2)}</TableCell>
                      <TableCell>{detailReport.details.averageCheckInTime ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-5 print:border print:shadow-none">
                <p className="mb-2 text-sm font-semibold">Notes</p>
                <p className="text-sm text-muted-foreground">{detailReport.score.notes || "Performance remained within the expected operating range for this period."}</p>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
