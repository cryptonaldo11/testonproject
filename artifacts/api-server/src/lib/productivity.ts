import { db, productivityScoresTable, attendanceLogsTable, leaveApplicationsTable } from "@workspace/db";
import { and, eq, gte, lte, sql } from "drizzle-orm";

const WORK_START_HOUR = 9;
const ON_TIME_GRACE_MINUTES = 15;

const WEIGHTS = {
  attendance: 0.4,
  punctuality: 0.35,
  leaveBalance: 0.25,
};

function formatMonthDay(value: number): string {
  return String(value).padStart(2, "0");
}

function getMonthStartDateString(year: number, month: number): string {
  return `${year}-${formatMonthDay(month)}-01`;
}

function getMonthEndDateString(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function parseDateString(dateString: string): Date {
  return new Date(`${dateString}T00:00:00Z`);
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getYearMonthFromDateString(dateString: string): { year: number; month: number } {
  const [year, month] = dateString.split("-").map(Number);
  return { year, month };
}

function compareDateStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function maxDateString(a: string, b: string): string {
  return compareDateStrings(a, b) >= 0 ? a : b;
}

function minDateString(a: string, b: string): string {
  return compareDateStrings(a, b) <= 0 ? a : b;
}

function countInclusiveDays(startDate: string, endDate: string): number {
  const start = parseDateString(startDate);
  const end = parseDateString(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
}

export function getExpectedWorkDays(year: number, month: number): number {
  const daysInMonth = new Date(year, month, 0).getDate();
  let workDays = 0;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month - 1, day));
    const dayOfWeek = date.getUTCDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workDays++;
    }
  }

  return workDays;
}

export async function calculateAttendanceRate(
  userId: number,
  year: number,
  month: number,
): Promise<number> {
  const startDate = getMonthStartDateString(year, month);
  const endDate = getMonthEndDateString(year, month);

  const attendanceRecords = await db
    .select()
    .from(attendanceLogsTable)
    .where(
      and(
        eq(attendanceLogsTable.userId, userId),
        gte(attendanceLogsTable.date, startDate),
        lte(attendanceLogsTable.date, endDate),
      ),
    );

  const expectedWorkDays = getExpectedWorkDays(year, month);
  if (expectedWorkDays === 0) return 100;

  let presentDays = 0;
  for (const record of attendanceRecords) {
    if (record.status === "present" || record.status === "late") {
      presentDays += 1;
    } else if (record.status === "half_day") {
      presentDays += 0.5;
    }
  }

  return Math.round((presentDays / expectedWorkDays) * 100);
}

export async function calculatePunctualityRate(
  userId: number,
  year: number,
  month: number,
): Promise<number> {
  const startDate = getMonthStartDateString(year, month);
  const endDate = getMonthEndDateString(year, month);

  const attendanceRecords = await db
    .select()
    .from(attendanceLogsTable)
    .where(
      and(
        eq(attendanceLogsTable.userId, userId),
        gte(attendanceLogsTable.date, startDate),
        lte(attendanceLogsTable.date, endDate),
        sql`${attendanceLogsTable.checkIn} IS NOT NULL`,
      ),
    );

  if (attendanceRecords.length === 0) return 100;

  let onTimeCount = 0;
  for (const record of attendanceRecords) {
    if (!record.checkIn) continue;

    const checkIn = new Date(record.checkIn);
    const checkInHour = checkIn.getHours();
    const checkInMinute = checkIn.getMinutes();

    if (
      checkInHour < WORK_START_HOUR ||
      (checkInHour === WORK_START_HOUR && checkInMinute <= ON_TIME_GRACE_MINUTES)
    ) {
      onTimeCount++;
    }
  }

  return Math.round((onTimeCount / attendanceRecords.length) * 100);
}

export async function calculateLeaveFrequencyScore(
  userId: number,
  year: number,
  month: number,
): Promise<number> {
  const monthStart = getMonthStartDateString(year, month);
  const monthEnd = getMonthEndDateString(year, month);

  const leaves = await db
    .select()
    .from(leaveApplicationsTable)
    .where(
      and(
        eq(leaveApplicationsTable.userId, userId),
        eq(leaveApplicationsTable.status, "approved"),
        lte(leaveApplicationsTable.startDate, monthEnd),
        gte(leaveApplicationsTable.endDate, monthStart),
      ),
    );

  let leaveDaysTaken = 0;
  for (const leave of leaves) {
    const overlapStart = maxDateString(leave.startDate, monthStart);
    const overlapEnd = minDateString(leave.endDate, monthEnd);

    if (compareDateStrings(overlapStart, overlapEnd) <= 0) {
      leaveDaysTaken += countInclusiveDays(overlapStart, overlapEnd);
    }
  }

  const reasonableMonthlyLeave = 3;

  if (leaveDaysTaken === 0) return 100;
  if (leaveDaysTaken <= 1) return 95;
  if (leaveDaysTaken <= 2) return 90;
  if (leaveDaysTaken <= reasonableMonthlyLeave) return 80;

  const excessDays = leaveDaysTaken - reasonableMonthlyLeave;
  return Math.round(Math.max(0, 80 - excessDays * 10));
}

export function calculateOverallScore(
  attendanceRate: number,
  punctualityRate: number,
  leaveFrequencyScore: number,
): number {
  return Math.round(
    attendanceRate * WEIGHTS.attendance +
      punctualityRate * WEIGHTS.punctuality +
      leaveFrequencyScore * WEIGHTS.leaveBalance,
  );
}

export function generateScoreNotes(
  attendanceRate: number,
  punctualityRate: number,
  leaveFrequencyScore: number,
): string {
  const notes: string[] = [];

  if (attendanceRate >= 95) {
    notes.push("Excellent attendance");
  } else if (attendanceRate >= 85) {
    notes.push("Good attendance");
  } else if (attendanceRate < 75) {
    notes.push("Attendance needs improvement");
  }

  if (punctualityRate >= 95) {
    notes.push("Always punctual");
  } else if (punctualityRate < 80) {
    notes.push("Punctuality needs improvement");
  }

  if (leaveFrequencyScore >= 90) {
    notes.push("Minimal leave usage");
  } else if (leaveFrequencyScore < 70) {
    notes.push("High leave usage");
  }

  return notes.join("; ") || "Standard performance";
}

export async function calculateAndSaveProductivityScore(
  userId: number,
  year: number,
  month: number,
): Promise<typeof productivityScoresTable.$inferSelect> {
  const attendanceRate = await calculateAttendanceRate(userId, year, month);
  const punctualityRate = await calculatePunctualityRate(userId, year, month);
  const leaveFrequencyScore = await calculateLeaveFrequencyScore(userId, year, month);
  const overallScore = calculateOverallScore(
    attendanceRate,
    punctualityRate,
    leaveFrequencyScore,
  );
  const notes = generateScoreNotes(
    attendanceRate,
    punctualityRate,
    leaveFrequencyScore,
  );

  const existingScores = await db
    .select()
    .from(productivityScoresTable)
    .where(
      and(
        eq(productivityScoresTable.userId, userId),
        eq(productivityScoresTable.year, String(year)),
        eq(productivityScoresTable.month, String(month)),
      ),
    );

  if (existingScores.length > 0) {
    const [updated] = await db
      .update(productivityScoresTable)
      .set({
        score: String(overallScore),
        attendanceRate: String(attendanceRate),
        punctualityRate: String(punctualityRate),
        leaveFrequency: String(leaveFrequencyScore),
        notes,
      })
      .where(eq(productivityScoresTable.id, existingScores[0].id))
      .returning();

    return updated;
  }

  const [created] = await db
    .insert(productivityScoresTable)
    .values({
      userId,
      score: String(overallScore),
      attendanceRate: String(attendanceRate),
      punctualityRate: String(punctualityRate),
      leaveFrequency: String(leaveFrequencyScore),
      month: String(month),
      year: String(year),
      notes,
    })
    .returning();

  return created;
}

export async function recalculateProductivityForMonth(
  userId: number,
  year: number,
  month: number,
): Promise<typeof productivityScoresTable.$inferSelect> {
  return calculateAndSaveProductivityScore(userId, year, month);
}

export async function recalculateProductivityForDate(
  userId: number,
  dateString: string,
): Promise<typeof productivityScoresTable.$inferSelect> {
  const { year, month } = getYearMonthFromDateString(dateString);
  return recalculateProductivityForMonth(userId, year, month);
}

export async function recalculateProductivityForDateRange(
  userId: number,
  startDate: string,
  endDate: string,
): Promise<Array<typeof productivityScoresTable.$inferSelect>> {
  const start = getYearMonthFromDateString(startDate);
  const end = getYearMonthFromDateString(endDate);

  let year = start.year;
  let month = start.month;
  const results: Array<typeof productivityScoresTable.$inferSelect> = [];

  while (year < end.year || (year === end.year && month <= end.month)) {
    results.push(await recalculateProductivityForMonth(userId, year, month));
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return results;
}

export function calculateAverageCheckInTime(
  records: typeof attendanceLogsTable.$inferSelect[],
): string | null {
  const checkIns = records
    .filter((record) => record.checkIn && record.status !== "absent")
    .map((record) => new Date(record.checkIn!));

  if (checkIns.length === 0) return null;

  const totalMinutes = checkIns.reduce((sum, date) => {
    return sum + date.getHours() * 60 + date.getMinutes();
  }, 0);

  const averageMinutes = Math.round(totalMinutes / checkIns.length);
  const hours = Math.floor(averageMinutes / 60);
  const minutes = averageMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function getMonthBounds(year: number, month: number): {
  startDate: string;
  endDate: string;
} {
  return {
    startDate: getMonthStartDateString(year, month),
    endDate: getMonthEndDateString(year, month),
  };
}

export function getTodayDateString(): string {
  return toDateString(new Date());
}
