export async function truncateTestTables(): Promise<void> {
  const { db } = await import("@workspace/db");
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`TRUNCATE TABLE
    ownership_handoffs,
    collaboration_comments,
    productivity_scores,
    face_verification_attempts,
    attendance_exceptions,
    medical_certificates,
    alerts,
    attendance_logs,
    leave_applications,
    workers,
    users,
    roles,
    departments
    RESTART IDENTITY CASCADE`);
}

export async function closeTestDb(): Promise<void> {
  const { pool } = await import("@workspace/db");
  await pool.end();
}
