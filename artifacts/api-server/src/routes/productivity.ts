import { Router, type IRouter } from "express";
import { db, productivityScoresTable } from "@workspace/db";
import { eq, and, SQL } from "drizzle-orm";
import {
  ListProductivityScoresQueryParams,
  ListProductivityScoresResponse,
  GetUserProductivityParams,
  GetUserProductivityResponse,
} from "@workspace/api-zod";
import { requireAuth, type JWTPayload } from "../lib/auth";

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

router.get("/productivity", requireAuth, async (req, res): Promise<void> => {
  const params = ListProductivityScoresQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;
  const conditions: SQL[] = [];

  if (jwtUser.role === "worker" || jwtUser.role === "driver") {
    conditions.push(eq(productivityScoresTable.userId, jwtUser.userId));
  } else if (params.data.userId) {
    conditions.push(eq(productivityScoresTable.userId, params.data.userId));
  }

  if (params.data.month) {
    conditions.push(eq(productivityScoresTable.month, params.data.month));
  }
  if (params.data.year) {
    conditions.push(eq(productivityScoresTable.year, params.data.year));
  }

  const scores = await db.select().from(productivityScoresTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(ListProductivityScoresResponse.parse({ scores: scores.map(mapScore), total: scores.length }));
});

router.get("/productivity/:userId", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserProductivityParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = (req as any).user as JWTPayload;
  if ((jwtUser.role === "worker" || jwtUser.role === "driver") && jwtUser.userId !== params.data.userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const scores = await db.select().from(productivityScoresTable)
    .where(eq(productivityScoresTable.userId, params.data.userId));

  res.json(GetUserProductivityResponse.parse({ scores: scores.map(mapScore), total: scores.length }));
});

export default router;
