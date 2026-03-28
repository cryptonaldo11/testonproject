import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("productivity recalculation integration", () => {
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
  const { getProductivityScoresForUser, seedScenarioUsers } = await import("../helpers/fixtures");

  describe("productivity recalculation integration", () => {
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

    it("rejects invalid productivity calculation payloads", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const response = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(token))
        .send({ year: 2026, month: 3 });

      expect(response.status).toBe(400);
    });

    it("calculates productivity for a user/month and updates the same row on rerun", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");

      const first = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(token))
        .send({ userId: 3, year: 2026, month: 3 });

      expect(first.status).toBe(200);
      expect(first.body.success).toBe(true);
      expect(first.body.score.userId).toBe(3);
      expect(first.body.score.month).toBe("3");
      expect(first.body.score.year).toBe("2026");

      const second = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(token))
        .send({ userId: 3, year: 2026, month: 3 });

      expect(second.status).toBe(200);

      const scores = await getProductivityScoresForUser(3);
      const matching = scores.filter((score) => score.year === "2026" && score.month === "3");
      expect(matching).toHaveLength(1);

      const forbidden = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(workerToken))
        .send({ userId: 3, year: 2026, month: 3 });

      expect(forbidden.status).toBe(403);
    });

    it("recalculates productivity after manual attendance create and update", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const createAttendance = await request(app)
        .post("/api/attendance")
        .set(withBearer(token))
        .send({
          userId: 3,
          date: "2026-03-10",
          status: "present",
          checkIn: "2026-03-10T08:55:00.000Z",
          checkOut: "2026-03-10T17:00:00.000Z",
          hoursWorked: "8.08",
          isManualEntry: "true",
        });

      expect(createAttendance.status).toBe(201);

      const afterCreate = await getProductivityScoresForUser(3);
      const marchScore = afterCreate.find((score) => score.year === "2026" && score.month === "3");
      expect(marchScore).toBeTruthy();
      expect(Number(marchScore?.attendanceRate)).toBeGreaterThan(0);

      const updateAttendance = await request(app)
        .patch(`/api/attendance/${createAttendance.body.id}`)
        .set(withBearer(token))
        .send({
          status: "absent",
        });

      expect(updateAttendance.status).toBe(200);

      const afterUpdate = await getProductivityScoresForUser(3);
      const updatedMarchScore = afterUpdate.find((score) => score.year === "2026" && score.month === "3");
      expect(updatedMarchScore).toBeTruthy();
      expect(Number(updatedMarchScore?.attendanceRate)).toBeLessThanOrEqual(Number(marchScore?.attendanceRate ?? "100"));
    });

    it("creating pending leave does not affect productivity until approval", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const baseline = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(token))
        .send({ userId: 3, year: 2026, month: 3 });

      expect(baseline.status).toBe(200);
      const baselineLeaveFrequency = Number(baseline.body.score.leaveFrequency);

      const leave = await request(app)
        .post("/api/leaves")
        .set(withBearer(token))
        .send({
          userId: 3,
          leaveType: "annual",
          startDate: "2026-03-11",
          endDate: "2026-03-12",
          reason: "Pending leave should not count yet",
        });

      expect(leave.status).toBe(201);

      const scores = await getProductivityScoresForUser(3);
      const marchScore = scores.find((score) => score.year === "2026" && score.month === "3");
      expect(marchScore).toBeTruthy();
      expect(Number(marchScore?.leaveFrequency)).toBe(baselineLeaveFrequency);
    });

    it("recalculates productivity when leave moves into and out of approved state", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const leave = await request(app)
        .post("/api/leaves")
        .set(withBearer(token))
        .send({
          userId: 3,
          leaveType: "annual",
          startDate: "2026-03-11",
          endDate: "2026-03-12",
          reason: "Family matter",
        });

      expect(leave.status).toBe(201);

      const beforeApproval = await request(app)
        .post("/api/productivity/calculate")
        .set(withBearer(token))
        .send({ userId: 3, year: 2026, month: 3 });

      expect(beforeApproval.status).toBe(200);
      const scoreBeforeApproval = Number(beforeApproval.body.score.leaveFrequency);

      const approved = await request(app)
        .patch(`/api/leaves/${leave.body.id}`)
        .set(withBearer(token))
        .send({ status: "approved" });

      expect(approved.status).toBe(200);

      const afterApprovalScores = await getProductivityScoresForUser(3);
      const marchAfterApproval = afterApprovalScores.find((score) => score.year === "2026" && score.month === "3");
      expect(marchAfterApproval).toBeTruthy();
      expect(Number(marchAfterApproval?.leaveFrequency)).toBeLessThan(scoreBeforeApproval);

      const cancelled = await request(app)
        .patch(`/api/leaves/${leave.body.id}`)
        .set(withBearer(token))
        .send({ status: "cancelled" });

      expect(cancelled.status).toBe(200);

      const afterCancelScores = await getProductivityScoresForUser(3);
      const marchAfterCancel = afterCancelScores.find((score) => score.year === "2026" && score.month === "3");
      expect(marchAfterCancel).toBeTruthy();
      expect(Number(marchAfterCancel?.leaveFrequency)).toBeGreaterThanOrEqual(Number(marchAfterApproval?.leaveFrequency ?? "0"));
    });

    it("recalculates both months for leave spanning two months", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const leave = await request(app)
        .post("/api/leaves")
        .set(withBearer(token))
        .send({
          userId: 3,
          leaveType: "annual",
          startDate: "2026-03-30",
          endDate: "2026-04-02",
          reason: "Cross month leave",
        });

      expect(leave.status).toBe(201);

      const approved = await request(app)
        .patch(`/api/leaves/${leave.body.id}`)
        .set(withBearer(token))
        .send({ status: "approved" });

      expect(approved.status).toBe(200);

      const scores = await getProductivityScoresForUser(3);
      const marchScore = scores.find((score) => score.year === "2026" && score.month === "3");
      const aprilScore = scores.find((score) => score.year === "2026" && score.month === "4");

      expect(marchScore).toBeTruthy();
      expect(aprilScore).toBeTruthy();
      expect(Number(marchScore?.leaveFrequency)).toBeLessThan(100);
      expect(Number(aprilScore?.leaveFrequency)).toBeLessThan(100);
    });

    it("recalculates both year-boundary months for approved leave", async () => {
      const token = await loginAs("hr@teston.com", "HR@12345");

      const leave = await request(app)
        .post("/api/leaves")
        .set(withBearer(token))
        .send({
          userId: 3,
          leaveType: "annual",
          startDate: "2026-12-30",
          endDate: "2027-01-02",
          reason: "Year boundary leave",
        });

      expect(leave.status).toBe(201);

      const approved = await request(app)
        .patch(`/api/leaves/${leave.body.id}`)
        .set(withBearer(token))
        .send({ status: "approved" });

      expect(approved.status).toBe(200);

      const scores = await getProductivityScoresForUser(3);
      const decemberScore = scores.find((score) => score.year === "2026" && score.month === "12");
      const januaryScore = scores.find((score) => score.year === "2027" && score.month === "1");

      expect(decemberScore).toBeTruthy();
      expect(januaryScore).toBeTruthy();
    });
  });
}
