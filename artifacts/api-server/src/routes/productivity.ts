import { Router, type IRouter } from "express";
import { db, productivityScoresTable, attendanceLogsTable } from "@workspace/db";
import { eq, and, SQL, gte, lte, sql, inArray } from "drizzle-orm";
import {
  ListProductivityScoresQueryParams,
  ListProductivityScoresResponse,
  GetUserProductivityParams,
  GetUserProductivityResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, getScopedUserIds, canAccessUserId } from "../lib/auth";
import {
  calculateAndSaveProductivityScore,
  calculateAverageCheckInTime,
  getMonthBounds,
} from "../lib/productivity";
import { z } from "zod";

const router: IRouter = Router();

function mapScore(s: typeof productivityScoresTable.$inferSelect) {
  return {
    id: s.id,
    userId: s.userId,
    score: s.score,
    attendanceRate: s.attendanceRate,
    punctualityRate: s.punctualityRate,
    leaveFrequency: s.leaveFrequency,
    month: s.month,
    year: s.year,
    notes: s.notes ?? null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

// GET /api/productivity - List productivity scores
router.get("/productivity", requireAuth, async (req, res): Promise<void> => {
  const params = ListProductivityScoresQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser, params.data.userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json(
      ListProductivityScoresResponse.parse({
        scores: [],
        total: 0,
      })
    );
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(productivityScoresTable.userId, scopedUserIds));
  }

  if (params.data.month) {
    conditions.push(eq(productivityScoresTable.month, params.data.month));
  }
  if (params.data.year) {
    conditions.push(eq(productivityScoresTable.year, params.data.year));
  }

  const scores = await db
    .select()
    .from(productivityScoresTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(
    ListProductivityScoresResponse.parse({
      scores: scores.map(mapScore),
      total: scores.length,
    })
  );
});

// GET /api/productivity/:userId - Get productivity for specific user
router.get("/productivity/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserProductivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, params.data.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const scores = await db
    .select()
    .from(productivityScoresTable)
    .where(eq(productivityScoresTable.userId, params.data.userId));

  res.json(
    GetUserProductivityResponse.parse({
      scores: scores.map(mapScore),
      total: scores.length,
    })
  );
});

// POST /api/productivity/calculate - Calculate productivity for a user (admin/hr only)
const CalculateProductivityBody = z.object({
  userId: z.number(),
  year: z.number().optional(),
  month: z.number().optional(),
});

router.post(
  "/productivity/calculate",
  requireAuth,
  requireRole("admin", "hr"),
  async (req, res): Promise<void> => {
    const body = CalculateProductivityBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid request body", details: body.error.issues });
      return;
    }

    const now = new Date();
    const year = body.data.year ?? now.getFullYear();
    const month = body.data.month ?? now.getMonth() + 1;

    try {
      const score = await calculateAndSaveProductivityScore(body.data.userId, year, month);
      res.json({
        success: true,
        score: mapScore(score),
        message: `Productivity score calculated for ${year}-${String(month).padStart(2, "0")}`,
      });
    } catch (error) {
      console.error("Failed to calculate productivity:", error);
      res.status(500).json({ error: "Failed to calculate productivity score" });
    }
  }
);

// POST /api/productivity/calculate-all - Calculate productivity for all users (admin/hr only)
router.post(
  "/productivity/calculate-all",
  requireAuth,
  requireRole("admin", "hr"),
  async (req, res): Promise<void> => {
    const body = z
      .object({
        year: z.number().optional(),
        month: z.number().optional(),
      })
      .safeParse(req.body);

    if (!body.success) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    const now = new Date();
    const year = body.data.year ?? now.getFullYear();
    const month = body.data.month ?? now.getMonth() + 1;

    // Get all active users
    const users = await db.select({ id: sql<number>`id` }).from(sql`users`);

    const results: { userId: number; success: boolean; error?: string }[] = [];

    for (const user of users) {
      try {
        await calculateAndSaveProductivityScore(user.id, year, month);
        results.push({ userId: user.id, success: true });
      } catch (error) {
        results.push({
          userId: user.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;

    res.json({
      success: true,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failCount,
        year,
        month,
      },
      results: failCount > 0 ? results.filter((r) => !r.success) : undefined,
    });
  }
);

// GET /api/productivity/report/:userId - Get detailed productivity report
router.get(
  "/productivity/report/:userId",
  requireAuth,
  async (req, res): Promise<void> => {
    const params = z
      .object({
        userId: z.coerce.number(),
      })
      .safeParse(req.params);

    if (!params.success) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }

    const jwtUser = req.user!;
    if (!(await canAccessUserId(jwtUser, params.data.userId))) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const query = z
      .object({
        year: z.coerce.number().optional(),
        month: z.coerce.number().optional(),
      })
      .safeParse(req.query);

    const now = new Date();
    const year = query.data?.year ?? now.getFullYear();
    const month = query.data?.month ?? now.getMonth() + 1;

    // Get or calculate score
    let score = await calculateAndSaveProductivityScore(params.data.userId, year, month);

    // Get detailed attendance stats
    const { startDate, endDate } = getMonthBounds(year, month);

    const attendanceRecords = await db
      .select()
      .from(attendanceLogsTable)
      .where(
        and(
          eq(attendanceLogsTable.userId, params.data.userId),
          gte(attendanceLogsTable.date, startDate),
          lte(attendanceLogsTable.date, endDate)
        )
      );

    const stats = {
      totalDays: attendanceRecords.length,
      presentDays: attendanceRecords.filter((r) => r.status === "present").length,
      lateDays: attendanceRecords.filter((r) => r.status === "late").length,
      absentDays: attendanceRecords.filter((r) => r.status === "absent").length,
      halfDays: attendanceRecords.filter((r) => r.status === "half_day").length,
      totalHoursWorked: attendanceRecords.reduce((sum, r) => {
        const hours = parseFloat(r.hoursWorked || "0");
        return sum + (isNaN(hours) ? 0 : hours);
      }, 0),
      averageCheckInTime: calculateAverageCheckInTime(attendanceRecords),
    };

    res.json({
      score: mapScore(score),
      details: stats,
      period: { year, month },
    });
  }
);

export default router;
