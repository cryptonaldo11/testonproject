import { Router, type IRouter } from "express";
import { db, departmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListDepartmentsResponse,
  CreateDepartmentBody,
  GetDepartmentParams,
  GetDepartmentResponse,
  UpdateDepartmentParams,
  UpdateDepartmentBody,
  UpdateDepartmentResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

router.get("/departments", requireAuth, async (_req, res): Promise<void> => {
  const departments = await db.select().from(departmentsTable);
  res.json(ListDepartmentsResponse.parse({ departments, total: departments.length }));
});

router.post("/departments", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateDepartmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [dept] = await db.insert(departmentsTable).values(parsed.data).returning();
  res.status(201).json(GetDepartmentResponse.parse(dept));
});

router.get("/departments/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [dept] = await db.select().from(departmentsTable).where(eq(departmentsTable.id, params.data.id));
  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.json(GetDepartmentResponse.parse(dept));
});

router.patch("/departments/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateDepartmentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateDepartmentBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [dept] = await db.update(departmentsTable)
    .set(body.data)
    .where(eq(departmentsTable.id, params.data.id))
    .returning();

  if (!dept) {
    res.status(404).json({ error: "Department not found" });
    return;
  }

  res.json(UpdateDepartmentResponse.parse(dept));
});

export default router;
