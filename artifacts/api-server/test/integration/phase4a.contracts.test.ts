import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("phase 4A contract integration", () => {
    it.skip("requires DATABASE_URL and JWT_SECRET", () => {
      expect(true).toBe(true);
    });
  });
} else {
  const request = (await import("supertest")).default;
  const { default: app } = await import("../../src/app");
  const { ensureApiTestEnv } = await import("../helpers/env");
  const { closeTestDb, truncateTestTables } = await import("../helpers/db");
  const { loginAs, withBearer } = await import("../helpers/auth");
  const { seedScenarioUsers, createAttendanceLog } = await import("../helpers/fixtures");

  describe("phase 4A contract integration", () => {
    beforeAll(async () => {
      ensureApiTestEnv();
    });

    beforeEach(async () => {
      await truncateTestTables();
      await seedScenarioUsers();
    });

    afterAll(async () => {
      await closeTestDb();
    });

    it("returns paginated users contract metadata", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const response = await request(app)
        .get("/api/users")
        .query({ page: 1, pageSize: 2 })
        .set(withBearer(token));

      expect(response.status).toBe(200);
      expect(response.body.page).toBe(1);
      expect(response.body.pageSize).toBe(2);
      expect(response.body.total).toBeGreaterThanOrEqual(response.body.users.length);
      expect(response.body.totalPages).toBe(Math.ceil(response.body.total / response.body.pageSize));
      expect(response.body.users.length).toBeLessThanOrEqual(2);

      for (const user of response.body.users as Array<Record<string, unknown>>) {
        expect(user).toMatchObject({
          id: expect.any(Number),
          name: expect.any(String),
          email: expect.any(String),
          role: expect.any(String),
          hasFaceRegistered: expect.any(Boolean),
        });
      }
    });

    it("rejects invalid pagination values for the users contract", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const badPage = await request(app)
        .get("/api/users")
        .query({ page: 0, pageSize: 10 })
        .set(withBearer(token));

      const badPageSize = await request(app)
        .get("/api/users")
        .query({ page: 1, pageSize: 101 })
        .set(withBearer(token));

      expect(badPage.status).toBe(400);
      expect(badPage.body.error).toBeTruthy();
      expect(badPageSize.status).toBe(400);
      expect(badPageSize.body.error).toBeTruthy();
    });

    it("returns anomalies with explainability-ready contract fields", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      for (const day of ["2026-03-03", "2026-03-04", "2026-03-05", "2026-03-06", "2026-03-09"]) {
        await createAttendanceLog({
          userId: 3,
          date: day,
          status: "absent",
          isManualEntry: "true",
        });
      }

      const response = await request(app)
        .get("/api/anomalies")
        .query({ month: "2026-03", severity: "critical" })
        .set(withBearer(token));

      expect(response.status).toBe(200);
      expect(response.body.total).toBeGreaterThan(0);
      expect(response.body.anomalies.length).toBeGreaterThan(0);

      for (const anomaly of response.body.anomalies as Array<Record<string, unknown>>) {
        expect(anomaly).toMatchObject({
          id: expect.any(String),
          type: expect.stringMatching(/attendance|leave|productivity|compliance/),
          severity: "critical",
          userId: expect.any(Number),
          message: expect.any(String),
          detail: expect.any(String),
          detectedAt: expect.any(String),
        });

        if ("recommendations" in anomaly && anomaly.recommendations != null) {
          expect(Array.isArray(anomaly.recommendations)).toBe(true);
        }

        if ("evidence" in anomaly && anomaly.evidence != null) {
          expect(Array.isArray(anomaly.evidence)).toBe(true);
        }
      }
    });
  });
}
