import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("attendance exceptions integration", () => {
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

  describe("attendance exceptions integration", () => {
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

    // ── Worker submission ────────────────────────────────────────────────────

    it("worker can submit an attendance exception for themselves", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(token))
        .send({
          userId: me.body.id,
          exceptionType: "missed_checkout",
          reason: "Forgot to check out due to emergency.",
        });

      expect(res.status).toBe(201);
      expect(res.body.exceptionType).toBe("missed_checkout");
      expect(res.body.status).toBe("open");
      expect(res.body.requestedBy).toBe(me.body.id);
      expect(res.body.reason).toBe("Forgot to check out due to emergency.");
    });

    it("worker cannot submit an exception for another user", async () => {
      const worker1Token = await loginAs("worker1@teston.com", "Worker@123");
      const worker2 = await request(app).get("/api/auth/me").set(withBearer(worker1Token));
      // worker1 attempts to create exception for worker2 (id !== worker1.id)
      const forbidden = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(worker1Token))
        .send({ userId: worker2.body.id + 1, exceptionType: "dispute", reason: "Test" });

      expect(forbidden.status).toBe(403);
    });

    it("rejects invalid exception type", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(token));

      const res = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(token))
        .send({ userId: me.body.id, exceptionType: "not_a_valid_type", reason: "Test" });

      expect(res.status).toBe(400);
    });

    it("requires userId, exceptionType, and reason", async () => {
      const token = await loginAs("worker1@teston.com", "Worker@123");

      const missingUserId = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(token))
        .send({ exceptionType: "missed_checkout", reason: "Test" });

      expect(missingUserId.status).toBe(400);

      const missingReason = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(token))
        .send({ userId: 3, exceptionType: "missed_checkout", reason: "" });

      expect(missingReason.status).toBe(400);
    });

    // ── Manager/HR review ─────────────────────────────────────────────────

    it("manager can transition exception to under_review", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "dispute", reason: "Wrong hours recorded." });

      expect(created.status).toBe(201);

      const reviewed = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "under_review" });

      expect(reviewed.status).toBe(200);
      expect(reviewed.body.status).toBe("under_review");
    });

    it("manager can approve exception and stamps reviewedBy / reviewedAt", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "manual_correction", reason: "Please correct check-in time." });

      const approved = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "approved", reviewNotes: "Approved — corrected manually." });

      expect(approved.status).toBe(200);
      expect(approved.body.status).toBe("approved");
      expect(approved.body.reviewedBy).toBeTruthy();
      expect(approved.body.reviewedAt).toBeTruthy();
      expect(approved.body.reviewNotes).toBe("Approved — corrected manually.");
    });

    it("manager can reject exception with notes", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "dispute", reason: "I was there." });

      const rejected = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "rejected", reviewNotes: "Attendance record is accurate." });

      expect(rejected.status).toBe(200);
      expect(rejected.body.status).toBe("rejected");
      expect(rejected.body.reviewedBy).toBeTruthy();
      expect(rejected.body.reviewNotes).toBe("Attendance record is accurate.");
    });

    it("worker can escalate their own exception", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "missed_checkout", reason: "Escalating." });

      const escalated = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(workerToken))
        .send({ status: "escalated" });

      expect(escalated.status).toBe(200);
      expect(escalated.body.status).toBe("escalated");
    });

    it("worker cannot approve or reject their own exception", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "manual_correction", reason: "Test" });

      const approveAttempt = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(workerToken))
        .send({ status: "approved" });

      expect(approveAttempt.status).toBe(403);
    });

    // ── Scoping ────────────────────────────────────────────────────────────

    it("worker sees only their own exceptions via list endpoint", async () => {
      const token1 = await loginAs("worker1@teston.com", "Worker@123");
      const me1 = await request(app).get("/api/auth/me").set(withBearer(token1));

      await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(token1))
        .send({ userId: me1.body.id, exceptionType: "missed_checkout", reason: "My exception" });

      const listed = await request(app)
        .get("/api/attendance-exceptions")
        .set(withBearer(token1));

      expect(listed.status).toBe(200);
      for (const exc of listed.body.exceptions) {
        expect(exc.userId).toBe(me1.body.id);
      }
    });

    it("manager sees open/under_review/escalated exceptions in review queue", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      // Create multiple exceptions with different statuses
      const open = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "missed_checkout", reason: "Open one" });

      const underReview = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "dispute", reason: "Under review one" });

      await request(app)
        .patch(`/api/attendance-exceptions/${underReview.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "under_review" });

      const approved = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "camera_unavailable", reason: "Approved one" });

      await request(app)
        .patch(`/api/attendance-exceptions/${approved.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "approved" });

      const listed = await request(app)
        .get("/api/attendance-exceptions")
        .set(withBearer(managerToken));

      expect(listed.status).toBe(200);
      const ids = listed.body.exceptions.map((e: any) => e.id);
      expect(ids).toContain(open.body.id);
      expect(ids).toContain(underReview.body.id);
      expect(ids).not.toContain(approved.body.id); // approved is closed
    });

    it("filters exceptions by status", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const me = await request(app).get("/api/auth/me").set(withBearer(workerToken));

      const e1 = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "missed_checkout", reason: "E1" });

      const e2 = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({ userId: me.body.id, exceptionType: "dispute", reason: "E2" });

      await request(app)
        .patch(`/api/attendance-exceptions/${e1.body.id}`)
        .set(withBearer(managerToken))
        .send({ status: "approved" });

      const filtered = await request(app)
        .get("/api/attendance-exceptions")
        .query({ status: "open" })
        .set(withBearer(managerToken));

      expect(filtered.status).toBe(200);
      const ids = filtered.body.exceptions.map((e: any) => e.id);
      expect(ids).toContain(e2.body.id);
      expect(ids).not.toContain(e1.body.id);
    });
  });
}
