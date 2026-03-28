import { Router, type IRouter } from "express";
import { db, usersTable, type UserRole } from "@workspace/db";
import { eq, and, SQL, inArray } from "drizzle-orm";
import {
  ListUsersQueryParams,
  ListUsersResponse,
  CreateUserBody,
  GetUserParams,
  GetUserResponse,
  UpdateUserParams,
  UpdateUserBody,
  UpdateUserResponse,
  DeleteUserParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole, hashPassword, getScopedUserIds, canAccessUserId, canReadUsers } from "../lib/auth";

const router: IRouter = Router();

function mapUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employeeId: user.employeeId ?? null,
    departmentId: user.departmentId ?? null,
    phone: user.phone ?? null,
    position: user.position ?? null,
    hourlyRate: user.hourlyRate,
    isActive: user.isActive,
    hasFaceRegistered: !!user.faceDescriptor,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canReadUsers(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden: insufficient permissions" });
    return;
  }

  const params = ListUsersQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const scopedUserIds = await getScopedUserIds(jwtUser);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json(ListUsersResponse.parse({ users: [], total: 0 }));
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(usersTable.id, scopedUserIds));
  }
  if (params.data.role) {
    conditions.push(eq(usersTable.role, params.data.role as UserRole));
  }
  if (params.data.departmentId) {
    conditions.push(eq(usersTable.departmentId, params.data.departmentId));
  }
  if (params.data.isActive !== undefined) {
    conditions.push(eq(usersTable.isActive, params.data.isActive ? "true" : "false"));
  }

  const users = await db.select().from(usersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(ListUsersResponse.parse({ users: users.map(mapUser), total: users.length }));
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { password, role, ...rest } = parsed.data;
  const passwordHash = await hashPassword(password);

  const [user] = await db.insert(usersTable).values({
    ...rest,
    role: role as UserRole,
    passwordHash,
  }).returning();

  res.status(201).json(GetUserResponse.parse(mapUser(user)));
});

router.get("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, params.data.id))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, params.data.id));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetUserResponse.parse(mapUser(user)));
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = UpdateUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateUserBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const updateData: Partial<typeof usersTable.$inferInsert> = {};
  if (body.data.name) updateData.name = body.data.name;
  if (body.data.email) updateData.email = body.data.email;
  if (body.data.role) updateData.role = body.data.role as UserRole;
  if (body.data.departmentId !== undefined) updateData.departmentId = body.data.departmentId;
  if (body.data.phone !== undefined) updateData.phone = body.data.phone;
  if (body.data.position !== undefined) updateData.position = body.data.position;
  if (body.data.hourlyRate !== undefined) updateData.hourlyRate = body.data.hourlyRate;
  if (body.data.isActive !== undefined) updateData.isActive = body.data.isActive;
  if (body.data.password) {
    updateData.passwordHash = await hashPassword(body.data.password);
  }

  const [user] = await db.update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, params.data.id))
    .returning();

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(UpdateUserResponse.parse(mapUser(user)));
});

router.delete("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteUserParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [user] = await db.delete(usersTable).where(eq(usersTable.id, params.data.id)).returning();
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
