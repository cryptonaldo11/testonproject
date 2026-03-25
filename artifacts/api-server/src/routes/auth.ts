import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody, GetMeResponse } from "@workspace/api-zod";
import { signToken, comparePassword, requireAuth, type JWTPayload } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  if (user.isActive !== "true") {
    res.status(401).json({ error: "Account is inactive" });
    return;
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const payload: JWTPayload = { userId: user.id, email: user.email, role: user.role };
  const token = signToken(payload);

  const userResponse = GetMeResponse.parse({
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
  });

  res.json({ token, user: userResponse });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ message: "Logged out successfully" });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, jwtUser.userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const userResponse = GetMeResponse.parse({
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
  });

  res.json(userResponse);
});

export default router;
