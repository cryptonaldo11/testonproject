export async function seedScenarioUsers() {
  const { seedBaseData } = await import("../../../../scripts/src/seed-base");
  return seedBaseData();
}

export async function createAttendanceLog(data: any) {
  const { db, attendanceLogsTable } = await import("@workspace/db");
  const [record] = await db.insert(attendanceLogsTable).values(data).returning();
  return record;
}

export async function createLeaveApplication(data: any) {
  const { db, leaveApplicationsTable } = await import("@workspace/db");
  const [record] = await db.insert(leaveApplicationsTable).values(data).returning();
  return record;
}

export async function createAttendanceException(data: any) {
  const { db, attendanceExceptionsTable } = await import("@workspace/db");
  const [record] = await db.insert(attendanceExceptionsTable).values(data).returning();
  return record;
}

export async function createFaceVerificationAttempt(data: any) {
  const { db, faceVerificationAttemptsTable } = await import("@workspace/db");
  const [record] = await db.insert(faceVerificationAttemptsTable).values(data).returning();
  return record;
}

export async function getProductivityScoresForUser(userId: number) {
  const { db, productivityScoresTable } = await import("@workspace/db");
  const { eq } = await import("drizzle-orm");
  return db.select().from(productivityScoresTable).where(eq(productivityScoresTable.userId, userId));
}
