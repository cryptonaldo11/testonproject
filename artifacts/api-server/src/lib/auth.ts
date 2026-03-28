import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Request, Response, NextFunction } from "express";
import { db, usersTable, type UserRole } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required");
}

export interface JWTPayload {
  userId: number;
  email: string;
  role: UserRole;
}

export type AppPermission =
  | "operational:read:all"
  | "operational:read:team"
  | "reports:read:all"
  | "reports:read:team"
  | "users:read"
  | "users:write"
  | "leaves:review"
  | "alerts:resolve"
  | "alerts:assign"
  | "exceptions:review"
  | "productivity:manage"
  | "face:manage";

const ALL_PERMISSIONS: readonly AppPermission[] = [
  "operational:read:all",
  "operational:read:team",
  "reports:read:all",
  "reports:read:team",
  "users:read",
  "users:write",
  "leaves:review",
  "alerts:resolve",
  "alerts:assign",
  "exceptions:review",
  "productivity:manage",
  "face:manage",
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly AppPermission[]> = {
  admin: ALL_PERMISSIONS,
  hr: [
    "operational:read:all",
    "reports:read:all",
    "users:read",
    "leaves:review",
    "alerts:resolve",
    "alerts:assign",
    "exceptions:review",
    "productivity:manage",
    "face:manage",
  ],
  manager: [
    "operational:read:team",
    "reports:read:team",
    "users:read",
    "alerts:assign",
    "exceptions:review",
  ],
  worker: [],
  driver: [],
};

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "7d" });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET!) as JWTPayload;
  } catch {
    return null;
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  req.user = payload;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden: insufficient permissions" });
      return;
    }
    next();
  };
}

export function isRestrictedRole(role: UserRole): boolean {
  return role === "worker" || role === "driver";
}

export function isManagerRole(role: UserRole): boolean {
  return role === "manager";
}

export function hasPermission(role: UserRole, permission: AppPermission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function canReadOperationalData(role: UserRole): boolean {
  return hasPermission(role, "operational:read:all") || hasPermission(role, "operational:read:team");
}

export function canReadUsers(role: UserRole): boolean {
  return hasPermission(role, "users:read");
}

export function canReadReports(role: UserRole): boolean {
  return hasPermission(role, "reports:read:all") || hasPermission(role, "reports:read:team");
}

export function canReviewLeaves(role: UserRole): boolean {
  return hasPermission(role, "leaves:review");
}

export function canResolveAlerts(role: UserRole): boolean {
  return hasPermission(role, "alerts:resolve");
}

export function canAssignAlerts(role: UserRole): boolean {
  return hasPermission(role, "alerts:assign");
}

export function canReviewExceptions(role: UserRole): boolean {
  return hasPermission(role, "exceptions:review");
}

export function canManageProductivity(role: UserRole): boolean {
  return hasPermission(role, "productivity:manage");
}

export async function getUserDepartmentId(userId: number): Promise<number | null> {
  const [user] = await db
    .select({ departmentId: usersTable.departmentId })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  return user?.departmentId ?? null;
}

export async function getVisibleUserIds(user: JWTPayload): Promise<number[] | null> {
  if (hasPermission(user.role, "operational:read:all")) {
    return null;
  }

  if (hasPermission(user.role, "operational:read:team")) {
    const departmentId = await getUserDepartmentId(user.userId);
    if (!departmentId) {
      return [];
    }

    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.departmentId, departmentId));

    return users.map(({ id }) => id);
  }

  return [user.userId];
}

export async function getScopedUserIds(user: JWTPayload, requestedUserId?: number): Promise<number[] | null> {
  const visibleUserIds = await getVisibleUserIds(user);

  if (visibleUserIds === null) {
    return requestedUserId !== undefined ? [requestedUserId] : null;
  }

  if (requestedUserId !== undefined) {
    return visibleUserIds.includes(requestedUserId) ? [requestedUserId] : [];
  }

  return visibleUserIds;
}

export async function canAccessUserId(user: JWTPayload, targetUserId: number): Promise<boolean> {
  const scopedUserIds = await getScopedUserIds(user, targetUserId);
  return scopedUserIds === null || scopedUserIds.length > 0;
}
