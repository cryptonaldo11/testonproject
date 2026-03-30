import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("collaboration workflow integration", () => {
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

  describe("collaboration workflow integration", () => {
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

    it("creates alert comments with mention-ready structure and lists them", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          alertType: "policy_violation",
          severity: "warning",
          title: "Coordination needed",
          message: "Alert needs a shared note",
          userId: managerMe.body.id,
        });

      const comment = await request(app)
        .post(`/api/alerts/${created.body.id}/comments`)
        .set(withBearer(hrToken))
        .send({
          body: "Please review this before tomorrow.",
          mentionedUserIds: [managerMe.body.id],
        });

      expect(comment.status).toBe(201);
      expect(comment.body.body).toBe("Please review this before tomorrow.");
      expect(comment.body.mentionedUserIds).toEqual([managerMe.body.id]);

      const listed = await request(app)
        .get(`/api/alerts/${created.body.id}/comments`)
        .set(withBearer(managerToken));

      expect(listed.status).toBe(200);
      expect(listed.body.total).toBe(1);
      expect(listed.body.comments[0].mentionedUserIds).toEqual([managerMe.body.id]);
    });

    it("records alert handoff history when assignment changes", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          alertType: "missing_attendance",
          severity: "warning",
          title: "Assignable alert",
          message: "Needs explicit ownership",
          userId: managerMe.body.id,
        });

      const reassigned = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(hrToken))
        .send({ assignedTo: managerMe.body.id, handoffNote: "Manager owns the next step." });

      expect(reassigned.status).toBe(200);
      expect(reassigned.body.assignedTo).toBe(managerMe.body.id);

      const handoffs = await request(app)
        .get(`/api/alerts/${created.body.id}/handoffs`)
        .set(withBearer(managerToken));

      expect(handoffs.status).toBe(200);
      expect(handoffs.body.total).toBe(1);
      expect(handoffs.body.handoffs[0].toUserId).toBe(managerMe.body.id);
      expect(handoffs.body.handoffs[0].note).toBe("Manager owns the next step.");
    });

    it("supports attendance exception collaboration and handoff for reviewers", async () => {
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const workerMe = await request(app).get("/api/auth/me").set(withBearer(workerToken));
      const managerMe = await request(app).get("/api/auth/me").set(withBearer(managerToken));

      const created = await request(app)
        .post("/api/attendance-exceptions")
        .set(withBearer(workerToken))
        .send({
          userId: workerMe.body.id,
          exceptionType: "dispute",
          reason: "Needs manager review",
        });

      const comment = await request(app)
        .post(`/api/attendance-exceptions/${created.body.id}/comments`)
        .set(withBearer(managerToken))
        .send({
          body: "I will review the badge logs.",
          mentionedUserIds: [workerMe.body.id],
        });

      expect(comment.status).toBe(201);
      expect(comment.body.mentionedUserIds).toEqual([workerMe.body.id]);

      const reassigned = await request(app)
        .patch(`/api/attendance-exceptions/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ assignedTo: managerMe.body.id, handoffNote: "Manager taking first review pass." });

      expect(reassigned.status).toBe(200);
      expect(reassigned.body.assignedTo).toBe(managerMe.body.id);

      const handoffs = await request(app)
        .get(`/api/attendance-exceptions/${created.body.id}/handoffs`)
        .set(withBearer(managerToken));

      expect(handoffs.status).toBe(200);
      expect(handoffs.body.total).toBe(1);
      expect(handoffs.body.handoffs[0].note).toBe("Manager taking first review pass.");
    });

    it("blocks out-of-scope mentions and assignments", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const crossWorkerToken = await loginAs("worker2@teston.com", "Worker@123");
      const workerMe = await request(app).get("/api/auth/me").set(withBearer(workerToken));
      const crossWorkerMe = await request(app).get("/api/auth/me").set(withBearer(crossWorkerToken));

      const created = await request(app)
        .post("/api/alerts")
        .set(withBearer(hrToken))
        .send({
          userId: workerMe.body.id,
          alertType: "missing_document",
          severity: "warning",
          title: "Permission boundary",
          message: "Do not leak cross-team access",
        });

      const comment = await request(app)
        .post(`/api/alerts/${created.body.id}/comments`)
        .set(withBearer(managerToken))
        .send({ body: "Tagging out of scope user", mentionedUserIds: [crossWorkerMe.body.id] });

      expect(comment.status).toBe(403);

      const assign = await request(app)
        .patch(`/api/alerts/${created.body.id}`)
        .set(withBearer(managerToken))
        .send({ assignedTo: crossWorkerMe.body.id, handoffNote: "Invalid cross-scope assignment" });

      expect(assign.status).toBe(403);
    });
  });
}
