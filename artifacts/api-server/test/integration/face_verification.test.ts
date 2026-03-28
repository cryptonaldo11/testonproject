import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("face verification audit integration", () => {
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
  const { seedScenarioUsers } = await import("../helpers/fixtures");

  describe("face verification audit integration", () => {
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

    // ── Attempt creation ──────────────────────────────────────────────────────

    it("worker can log a successful face verification attempt for themselves", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({
          userId: me.body.id,
          attemptType: "check_in",
          outcome: "success",
          confidenceScore: 0.97,
        });

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("success");
      expect(res.body.attemptType).toBe("check_in");
      expect(res.body.userId).toBe(me.body.id);
      expect(res.body.confidenceScore).toBe(0.97);
      expect(res.body.failureReason).toBeNull();
      expect(res.body.reviewedBy).toBeNull();
    });

    it("worker can log a failed face verification attempt with failure reason", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({
          userId: me.body.id,
          attemptType: "check_in",
          outcome: "failure",
          failureReason: "no_face",
          confidenceScore: 0.12,
          notes: "Camera did not detect face in frame.",
        });

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("failure");
      expect(res.body.failureReason).toBe("no_face");
      expect(res.body.notes).toBe("Camera did not detect face in frame.");
    });

    it("worker can log a fallback_used attempt", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({
          userId: me.body.id,
          attemptType: "check_out",
          outcome: "fallback_used",
          fallbackMethod: "manual_override",
          notes: "Approved by supervisor after camera malfunction.",
        });

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("fallback_used");
      expect(res.body.fallbackMethod).toBe("manual_override");
    });

    it("worker cannot log an attempt for another user", async () => {
      const worker1Token = await loginAs("worker1@teston.com", "Worker@123");
      const worker2 = await request(app).get("/api/auth/me").set(withBearer(worker1Token));

      const forbidden = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(worker1Token))
        .send({
          userId: worker2.body.id + 1,
          attemptType: "check_in",
          outcome: "success",
        });

      expect(forbidden.status).toBe(403);
    });

    it("rejects invalid attemptType", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "invalid_type", outcome: "success" });

      expect(res.status).toBe(400);
    });

    it("rejects invalid outcome", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "maybe" });

      expect(res.status).toBe(400);
    });

    it("rejects invalid failureReason", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({
          userId: me.body.id,
          attemptType: "check_in",
          outcome: "failure",
          failureReason: "unknown_reason",
        });

      expect(res.status).toBe(400);
    });

    it("requires userId, attemptType, and outcome", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");

      const missingUserId = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ attemptType: "check_in", outcome: "success" });

      expect(missingUserId.status).toBe(400);

      const missingOutcome = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: 3, attemptType: "check_in" });

      expect(missingOutcome.status).toBe(400);
    });

    // ── HR/admin creates attempts for other users ─────────────────────────────

    it("hr can log an attempt on behalf of another user", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const workerMe = await request(app).get("/api/auth/me").set(hrToken);

      const res = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(hrToken))
        .send({
          userId: workerMe.body.id,
          attemptType: "check_in",
          outcome: "fallback_used",
          fallbackMethod: "supervisor_approval",
          notes: "Camera was unavailable due to maintenance.",
        });

      expect(res.status).toBe(201);
      expect(res.body.outcome).toBe("fallback_used");
    });

    // ── Listing and scoping ───────────────────────────────────────────────────

    it("worker sees only their own attempts via list endpoint", async () => {
      const token1 = await loginAs("worker1@teston.com", "Worker@123");
      const me1 = await request(app).get("/api/auth/me").set(withBearer(token1));

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token1))
        .send({ userId: me1.body.id, attemptType: "check_in", outcome: "success" });

      const listed = await request(app)
        .get("/api/face-verification-attempts")
        .set(withBearer(token1));

      expect(listed.status).toBe(200);
      for (const attempt of listed.body.attempts) {
        expect(attempt.userId).toBe(me1.body.id);
      }
    });

    it("hr sees all attempts via list endpoint", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");

      const workerMe = await request(app).get("/api/auth/me").set(withBearer(workerToken));
      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: workerMe.body.id, attemptType: "check_in", outcome: "success" });

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(managerToken))
        .send({ userId: managerMe.body.id, attemptType: "check_out", outcome: "failure", failureReason: "mismatch" });

      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const listed = await request(app)
        .get("/api/face-verification-attempts")
        .set(withBearer(hrToken));

      expect(listed.status).toBe(200);
      const ids = listed.body.attempts.map((a: any) => a.id);
      expect(ids.length).toBeGreaterThanOrEqual(2);
    });

    it("filters attempts by outcome", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "success" });

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "check_out", outcome: "failure", failureReason: "camera_unavailable" });

      const filtered = await request(app)
        .get("/api/face-verification-attempts")
        .query({ outcome: "failure" })
        .set(withBearer(token));

      expect(filtered.status).toBe(200);
      for (const attempt of filtered.body.attempts) {
        expect(attempt.outcome).toBe("failure");
      }
    });

    it("filters attempts by attemptType", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "success" });

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "registration", outcome: "success" });

      const filtered = await request(app)
        .get("/api/face-verification-attempts")
        .query({ attemptType: "check_in" })
        .set(withBearer(token));

      expect(filtered.status).toBe(200);
      for (const attempt of filtered.body.attempts) {
        expect(attempt.attemptType).toBe("check_in");
      }
    });

    it("retrieves attempts for a specific user via /user/:userId", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "success" });

      const byUser = await request(app)
        .get(`/api/face-verification-attempts/user/${me.body.id}`)
        .set(withBearer(workerToken));

      expect(byUser.status).toBe(200);
      for (const attempt of byUser.body.attempts) {
        expect(attempt.userId).toBe(me.body.id);
      }
    });

    it("worker cannot retrieve attempts for another user via /user/:userId", async () => {
      const worker1Token = await loginAs("worker1@teston.com", "Worker@123");
      const worker2 = await request(app).get("/api/auth/me").set(withBearer(worker1Token));

      const forbidden = await request(app)
        .get(`/api/face-verification-attempts/user/${worker2.body.id + 1}`)
        .set(withBearer(worker1Token));

      expect(forbidden.status).toBe(403);
    });

    // ── Single attempt retrieval ─────────────────────────────────────────────

    it("retrieves a single attempt by id", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const created = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(token))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "success" });

      const retrieved = await request(app)
        .get(`/api/face-verification-attempts/${created.body.id}`)
        .set(withBearer(token));

      expect(retrieved.status).toBe(200);
      expect(retrieved.body.id).toBe(created.body.id);
      expect(retrieved.body.outcome).toBe("success");
    });

    it("returns 404 for non-existent attempt id", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");

      const res = await request(app)
        .get("/api/face-verification-attempts/999999")
        .set(withBearer(token));

      expect(res.status).toBe(404);
    });

    // ── HR/admin review ──────────────────────────────────────────────────────

    it("hr can add notes to a verification attempt", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "failure", failureReason: "mismatch" });

      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const reviewed = await request(app)
        .patch(`/api/face-verification-attempts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ notes: "Verified via CCTV footage — genuine mismatch." });

      expect(reviewed.status).toBe(200);
      expect(reviewed.body.notes).toBe("Verified via CCTV footage — genuine mismatch.");
    });

    it("hr can mark an attempt as reviewed", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, attemptType: "check_out", outcome: "fallback_used", fallbackMethod: "supervisor_approval" });

      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const reviewed = await request(app)
        .patch(`/api/face-verification-attempts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ reviewed: true, notes: "Fallback was appropriate given circumstances." });

      expect(reviewed.status).toBe(200);
      expect(reviewed.body.reviewedBy).toBeTruthy();
    });

    it("manager cannot add notes to an attempt", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "failure", failureReason: "no_face" });

      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const denied = await request(app)
        .patch(`/api/face-verification-attempts/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ notes: "Manager trying to add notes." });

      expect(denied.status).toBe(403);
    });

    it("manager cannot mark an attempt as reviewed", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/face-verification-attempts")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, attemptType: "check_in", outcome: "failure", failureReason: "low_lighting" });

      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const denied = await request(app)
        .patch(`/api/face-verification-attempts/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ reviewed: true });

      expect(denied.status).toBe(403);
    });
  });
}
