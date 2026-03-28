import { Router, type IRouter } from "express";
import { db, rolesTable, insertRoleSchema } from "@workspace/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

const createRoleBodySchema = insertRoleSchema.pick({
  name: true,
  description: true,
  permissions: true,
});

function mapRole(r: typeof rolesTable.$inferSelect) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    permissions: r.permissions,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

router.get("/roles", requireAuth, async (_req, res): Promise<void> => {
  const roles = await db.select().from(rolesTable);
  res.json({ roles: roles.map(mapRole), total: roles.length });
});

router.post("/roles", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = createRoleBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Validation failed", details: parsed.error.issues });
    return;
  }

  const [role] = await db.insert(rolesTable).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    permissions: parsed.data.permissions ?? "[]",
  }).returning();

  res.status(201).json(mapRole(role));
});

router.get("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [role] = await db.select().from(rolesTable).where(eq(rolesTable.id, id));
  if (!role) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  res.json(mapRole(role));
});

export default router;
