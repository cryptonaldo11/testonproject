import { Router, type IRouter } from "express";
import { db, rolesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth";

const router: IRouter = Router();

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
  const { name, description, permissions } = req.body as { name?: string; description?: string; permissions?: string };
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const [role] = await db.insert(rolesTable).values({
    name,
    description: description ?? null,
    permissions: permissions ?? "[]",
  }).returning();

  res.status(201).json(mapRole(role));
});

router.get("/roles/:id", requireAuth, async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
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
