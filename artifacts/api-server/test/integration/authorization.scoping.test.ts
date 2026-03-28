import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";

const hasTestEnv = Boolean(process.env.DATABASE_URL && process.env.JWT_SECRET);

if (!hasTestEnv) {
  describe("authorization scoping integration", () => {
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

  type SeededIds = {
    managerId: number;
    sameWorkerId: number;
    crossWorkerId: number;
  };

  async function createScopedRecords(hrToken: string, ids: SeededIds) {
    const sameAttendance = await request(app)
      .post("/api/attendance")
      .set(withBearer(hrToken))
      .send({
        userId: ids.sameWorkerId,
        date: "2026-03-10",
        status: "present",
        checkIn: "2026-03-10T08:55:00.000Z",
        checkOut: "2026-03-10T17:00:00.000Z",
        hoursWorked: "8.08",
        isManualEntry: "true",
      });

    const crossAttendance = await request(app)
      .post("/api/attendance")
      .set(withBearer(hrToken))
      .send({
        userId: ids.crossWorkerId,
        date: "2026-03-10",
        status: "present",
        checkIn: "2026-03-10T08:50:00.000Z",
        checkOut: "2026-03-10T17:15:00.000Z",
        hoursWorked: "8.42",
        isManualEntry: "true",
      });

    expect(sameAttendance.status).toBe(201);
    expect(crossAttendance.status).toBe(201);

    const sameProductivity = await request(app)
      .post("/api/productivity/calculate")
      .set(withBearer(hrToken))
      .send({ userId: ids.sameWorkerId, year: 2026, month: 3 });

    const crossProductivity = await request(app)
      .post("/api/productivity/calculate")
      .set(withBearer(hrToken))
      .send({ userId: ids.crossWorkerId, year: 2026, month: 3 });

    expect(sameProductivity.status).toBe(200);
    expect(crossProductivity.status).toBe(200);

    const sameLeave = await request(app)
      .post("/api/leaves")
      .set(withBearer(hrToken))
      .send({
        userId: ids.sameWorkerId,
        leaveType: "annual",
        startDate: "2026-03-11",
        endDate: "2026-03-11",
        reason: "Same department leave",
      });

    const crossLeave = await request(app)
      .post("/api/leaves")
      .set(withBearer(hrToken))
      .send({
        userId: ids.crossWorkerId,
        leaveType: "annual",
        startDate: "2026-03-12",
        endDate: "2026-03-12",
        reason: "Cross department leave",
      });

    expect(sameLeave.status).toBe(201);
    expect(crossLeave.status).toBe(201);

    const sameAlert = await request(app)
      .post("/api/alerts")
      .set(withBearer(hrToken))
      .send({
        userId: ids.sameWorkerId,
        alertType: "policy_violation",
        severity: "warning",
        title: "Same department alert",
        message: "Visible to the manager's team",
      });

    const crossAlert = await request(app)
      .post("/api/alerts")
      .set(withBearer(hrToken))
      .send({
        userId: ids.crossWorkerId,
        alertType: "missing_attendance",
        severity: "warning",
        title: "Cross department alert",
        message: "Should stay hidden from the manager",
      });

    const globalAlert = await request(app)
      .post("/api/alerts")
      .set(withBearer(hrToken))
      .send({
        alertType: "ghost_worker",
        severity: "critical",
        title: "Global alert",
        message: "Visible across operational dashboards",
      });

    expect(sameAlert.status).toBe(201);
    expect(crossAlert.status).toBe(201);
    expect(globalAlert.status).toBe(201);

    return {
      sameAttendanceId: sameAttendance.body.id as number,
      crossAttendanceId: crossAttendance.body.id as number,
      sameLeaveId: sameLeave.body.id as number,
      crossLeaveId: crossLeave.body.id as number,
      sameAlertId: sameAlert.body.id as number,
      crossAlertId: crossAlert.body.id as number,
      globalAlertId: globalAlert.body.id as number,
    };
  }

  describe("authorization scoping integration", () => {
    let ids: SeededIds;

    beforeAll(async () => {
      ensureApiTestEnv();
    });

    beforeEach(async () => {
      await truncateTestTables();
      const seeded = await seedScenarioUsers();
      ids = {
        managerId: seeded.users["manager@teston.com"],
        sameWorkerId: seeded.users["worker1@teston.com"],
        crossWorkerId: seeded.users["worker2@teston.com"],
      };
    });

    afterAll(async () => {
      await closeTestDb();
    });

    it("limits manager reads to same-department data while allowing in-scope records", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      const records = await createScopedRecords(hrToken, ids);

      const usersResponse = await request(app)
        .get("/api/users")
        .set(withBearer(managerToken));

      expect(usersResponse.status).toBe(200);
      expect(usersResponse.body.users.map((user: { id: number }) => user.id)).toEqual(
        expect.arrayContaining([ids.managerId, ids.sameWorkerId]),
      );
      expect(usersResponse.body.users.map((user: { id: number }) => user.id)).not.toContain(ids.crossWorkerId);

      const workersResponse = await request(app)
        .get("/api/workers")
        .set(withBearer(managerToken));

      expect(workersResponse.status).toBe(200);
      expect(workersResponse.body.workers.map((worker: { userId: number }) => worker.userId)).toContain(ids.sameWorkerId);
      expect(workersResponse.body.workers.map((worker: { userId: number }) => worker.userId)).not.toContain(ids.crossWorkerId);

      const sameAttendanceResponse = await request(app)
        .get(`/api/attendance/${records.sameAttendanceId}`)
        .set(withBearer(managerToken));

      const crossAttendanceResponse = await request(app)
        .get(`/api/attendance/${records.crossAttendanceId}`)
        .set(withBearer(managerToken));

      expect(sameAttendanceResponse.status).toBe(200);
      expect(crossAttendanceResponse.status).toBe(403);

      const sameProductivityResponse = await request(app)
        .get(`/api/productivity/${ids.sameWorkerId}`)
        .set(withBearer(managerToken));

      const crossProductivityResponse = await request(app)
        .get(`/api/productivity/${ids.crossWorkerId}`)
        .set(withBearer(managerToken));

      expect(sameProductivityResponse.status).toBe(200);
      expect(crossProductivityResponse.status).toBe(403);

      const alertsResponse = await request(app)
        .get("/api/alerts")
        .set(withBearer(managerToken));

      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.alerts.map((alert: { id: number }) => alert.id)).toEqual(
        expect.arrayContaining([records.sameAlertId, records.globalAlertId]),
      );
      expect(alertsResponse.body.alerts.map((alert: { id: number }) => alert.id)).not.toContain(records.crossAlertId);
    });

    it("prevents managers from widening scope through query parameters", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const managerToken = await loginAs("manager@teston.com", "Manager@123");
      await createScopedRecords(hrToken, ids);

      const usersResponse = await request(app)
        .get("/api/users")
        .query({ departmentId: 2 })
        .set(withBearer(managerToken));

      const attendanceResponse = await request(app)
        .get("/api/attendance")
        .query({ userId: ids.crossWorkerId, startDate: "2026-03-10", endDate: "2026-03-10" })
        .set(withBearer(managerToken));

      const productivityResponse = await request(app)
        .get("/api/productivity")
        .query({ userId: ids.crossWorkerId, month: "3", year: "2026" })
        .set(withBearer(managerToken));

      const alertsResponse = await request(app)
        .get("/api/alerts")
        .query({ userId: ids.crossWorkerId })
        .set(withBearer(managerToken));

      expect(usersResponse.status).toBe(200);
      expect(usersResponse.body.total).toBe(0);
      expect(attendanceResponse.status).toBe(200);
      expect(attendanceResponse.body.total).toBe(0);
      expect(productivityResponse.status).toBe(200);
      expect(productivityResponse.body.total).toBe(0);
      expect(alertsResponse.status).toBe(200);
      expect(alertsResponse.body.total).toBe(0);
    });

    it("keeps workers self-scoped for profile, leave, and alert actions", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const workerToken = await loginAs("worker1@teston.com", "Worker@123");
      const records = await createScopedRecords(hrToken, ids);

      const ownProfileResponse = await request(app)
        .get(`/api/users/${ids.sameWorkerId}`)
        .set(withBearer(workerToken));

      const otherProfileResponse = await request(app)
        .get(`/api/users/${ids.crossWorkerId}`)
        .set(withBearer(workerToken));

      expect(ownProfileResponse.status).toBe(200);
      expect(otherProfileResponse.status).toBe(403);

      const leavesResponse = await request(app)
        .get("/api/leaves")
        .set(withBearer(workerToken));

      expect(leavesResponse.status).toBe(200);
      expect(leavesResponse.body.leaves).toHaveLength(1);
      expect(leavesResponse.body.leaves[0].userId).toBe(ids.sameWorkerId);
      expect(leavesResponse.body.leaves[0].id).toBe(records.sameLeaveId);

      const dismissOwnAlertResponse = await request(app)
        .patch(`/api/alerts/${records.sameAlertId}`)
        .set(withBearer(workerToken))
        .send({ status: "dismissed" });

      const resolveOwnAlertResponse = await request(app)
        .patch(`/api/alerts/${records.sameAlertId}`)
        .set(withBearer(workerToken))
        .send({ status: "resolved" });

      const otherAlertResponse = await request(app)
        .patch(`/api/alerts/${records.crossAlertId}`)
        .set(withBearer(workerToken))
        .send({ status: "dismissed" });

      expect(dismissOwnAlertResponse.status).toBe(200);
      expect(resolveOwnAlertResponse.status).toBe(403);
      expect(otherAlertResponse.status).toBe(403);
    });

    it("preserves hr global access across departments", async () => {
      const hrToken = await loginAs("hr@teston.com", "HR@12345");
      const records = await createScopedRecords(hrToken, ids);

      const usersResponse = await request(app)
        .get("/api/users")
        .set(withBearer(hrToken));

      const attendanceSummaryResponse = await request(app)
        .get("/api/attendance/summary")
        .query({ startDate: "2026-03-10", endDate: "2026-03-10" })
        .set(withBearer(hrToken));

      const productivityResponse = await request(app)
        .get(`/api/productivity/${ids.crossWorkerId}`)
        .set(withBearer(hrToken));

      const resolveGlobalAlertResponse = await request(app)
        .patch(`/api/alerts/${records.globalAlertId}`)
        .set(withBearer(hrToken))
        .send({ status: "resolved" });

      expect(usersResponse.status).toBe(200);
      expect(usersResponse.body.users.map((user: { id: number }) => user.id)).toEqual(
        expect.arrayContaining([ids.sameWorkerId, ids.crossWorkerId]),
      );

      expect(attendanceSummaryResponse.status).toBe(200);
      expect(attendanceSummaryResponse.body.items.map((item: { userId: number }) => item.userId)).toEqual(
        expect.arrayContaining([ids.sameWorkerId, ids.crossWorkerId]),
      );

      expect(productivityResponse.status).toBe(200);
      expect(productivityResponse.body.scores).toHaveLength(1);
      expect(productivityResponse.body.scores[0].userId).toBe(ids.crossWorkerId);

      expect(resolveGlobalAlertResponse.status).toBe(200);
      expect(resolveGlobalAlertResponse.body.status).toBe("resolved");
    });
  });
}
