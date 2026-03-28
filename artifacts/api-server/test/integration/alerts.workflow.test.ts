import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("alerts workflow integration", () => {
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

  describe("alerts workflow integration", () => {
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

    // ── Lifecycle transitions ────────────────────────────────────────────────

    it("creates alert with status new", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");
      const res = await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({
          alertType: "missing_attendance",
          severity: "warning",
          title: "Worker missed attendance",
          message: "Worker 1 did not check in today.",
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("new");
      expect(res.body.severity).toBe("warning");
      expect(res.body.title).toBe("Worker missed attendance");
    });

    it("transitions alert through acknowledged and in_progress", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");
      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({
          alertType: "frequent_absence",
          severity: "critical",
          title: "Frequent absences",
          message: "Three absences this week.",
        });

      expect(created.status).toBe(201);

      const ack = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(token))
        .send({ status: "acknowledged" });

      expect(ack.status).toBe(200);
      expect(ack.body.status).toBe("acknowledged");

      const inProg = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(token))
        .send({ status: "in_progress" });

      expect(inProg.status).toBe(200);
      expect(inProg.body.status).toBe("in_progress");
    });

    it("resolves alert and stamps resolvedBy / resolvedAt / resolutionNotes", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");
      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({
          alertType: "policy_violation",
          severity: "warning",
          title: "Policy violation detected",
          message: "Worker not wearing safety gear.",
        });

      expect(created.status).toBe(201);

      const resolved = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(token))
        .send({ status: "resolved", resolutionNotes: "Worker has been warned and will comply." });

      expect(resolved.status).toBe(200);
      expect(resolved.body.status).toBe("resolved");
      expect(resolved.body.resolvedBy).toBeTruthy();
      expect(resolved.body.resolvedAt).toBeTruthy();
      expect(resolved.body.resolutionNotes).toBe("Worker has been warned and will comply.");
    });

    it("dismisses alert and stamps dismissedBy / dismissedAt", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");
      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({
          alertType: "missing_document",
          severity: "info",
          title: "Missing document",
          message: "ID card expired.",
        });

      const dismissed = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(token))
        .send({ status: "dismissed" });

      expect(dismissed.status).toBe(200);
      expect(dismissed.body.status).toBe("dismissed");
      expect(dismissed.body.dismissedBy).toBeTruthy();
      expect(dismissed.body.dismissedAt).toBeTruthy();
    });

    // ── Assignment ──────────────────────────────────────────────────────────

    it("assigns alert to another user and stamps assignedBy / assignedAt", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");

      // Get manager user ID
      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));
      const managerId = managerMe.body.id;

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          alertType: "ghost_worker",
          severity: "critical",
          title: "Possible ghost worker",
          message: "Check-in recorded without attendance log.",
        });

      const assigned = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ assignedTo: managerId });

      expect(assigned.status).toBe(200);
      expect(assigned.body.assignedTo).toBe(managerId);
      expect(assigned.body.assignedBy).toBeTruthy();
      expect(assigned.body.assignedAt).toBeTruthy();
    });

    it("filters alerts by assignedTo", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");

      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));
      const managerId = managerMe.body.id;

      // Create an alert and assign to manager
      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          alertType: "leave_limit_exceeded",
          severity: "warning",
          title: "Leave limit exceeded",
          message: "Annual leave quota used up.",
        });

      await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ assignedTo: managerId });

      // Filter by assignedTo should return the alert
      const filtered = await request(app)
        .get("/api/alerts")
        .query({ assignedTo: managerId })
        .set(withBearer(managerToken));

      expect(filtered.status).toBe(200);
      const found = filtered.body.alerts.find((a: any) => a.id === created.body.id);
      expect(found).toBeTruthy();
    });

    it("filters alerts by status", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({ alertType: "missing_attendance", severity: "warning", title: "A", message: "A" });

      const resolved = await request(app)
        .post("/api/alerts")
        .set(withBearer(token))
        .send({ alertType: "missing_attendance", severity: "warning", title: "B", message: "B" });

      await request(app)
        .patch(`/api/alerts/${resolved.body.id}`)
        .set(withBearer(token))
        .send({ status: "resolved" });

      const openOnly = await request(app)
        .get("/api/alerts")
        .query({ status: "new" })
        .set(withBearer(token));

      expect(openOnly.status).toBe(200);
      const resolvedAlert = openOnly.body.alerts.find((a: any) => a.id === resolved.body.id);
      expect(resolvedAlert).toBeUndefined();
    });

    // ── Permission boundaries ─────────────────────────────────────────────────

    it("worker cannot resolve or assign alerts", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({ alertType: "frequent_absence", severity: "warning", title: "Test", message: "Test" });

      const resolveAttempt = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(workerToken))
        .send({ status: "resolved" });

      expect(resolveAttempt.status).toBe(403);

      const assignAttempt = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(workerToken))
        .send({ assignedTo: 2 });

      expect(assignAttempt.status).toBe(403);
    });

    it("worker can acknowledge an alert assigned to them", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");

      const workerMe = await request(app).get("/api/auth/me").set(withBearer(workerToken));
      const workerId = workerMe.body.id;

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          alertType: "missing_attendance",
          severity: "warning",
          title: "Attendance issue",
          message: "Worker missed shift.",
          userId: workerId,
        });

      // Assign to worker
      await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ assignedTo: workerId });

      // Worker acknowledges
      const ack = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(workerToken))
        .send({ status: "acknowledged" });

      expect(ack.status).toBe(200);
      expect(ack.body.status).toBe("acknowledged");
    });
  });
}
