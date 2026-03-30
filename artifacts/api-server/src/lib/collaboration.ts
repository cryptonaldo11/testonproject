import {
  collaborationCommentsTable,
  ownershipHandoffsTable,
  type CollaborationWorkflowType,
  type OwnershipHandoffWorkflowType,
  usersTable,
  db,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import type { JWTPayload } from "./auth";
import { canAccessUserId } from "./auth";

function parseMentionedUserIds(raw: string | null | undefined): number[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is number => Number.isInteger(value));
  } catch {
    return [];
  }
}

export function serializeMentionedUserIds(userIds: number[] | undefined): string {
  const normalized = Array.from(new Set((userIds ?? []).filter((value) => Number.isInteger(value) && value > 0)));
  return JSON.stringify(normalized);
}

export function mapComment(comment: typeof collaborationCommentsTable.$inferSelect) {
  return {
    id: comment.id,
    workflowType: comment.workflowType,
    recordId: comment.recordId,
    authorId: comment.authorId,
    body: comment.body,
    mentionedUserIds: parseMentionedUserIds(comment.mentionedUserIds),
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

export function mapHandoff(handoff: typeof ownershipHandoffsTable.$inferSelect) {
  return {
    id: handoff.id,
    workflowType: handoff.workflowType,
    recordId: handoff.recordId,
    fromUserId: handoff.fromUserId ?? null,
    toUserId: handoff.toUserId,
    handedOffBy: handoff.handedOffBy,
    note: handoff.note ?? null,
    createdAt: handoff.createdAt,
  };
}

export async function assertMentionTargetsInScope(user: JWTPayload, mentionedUserIds: number[]): Promise<boolean> {
  for (const mentionedUserId of mentionedUserIds) {
    if (!(await canAccessUserId(user, mentionedUserId))) {
      return false;
    }
  }

  return true;
}

export async function assertAssignableTargetInScope(user: JWTPayload, targetUserId: number): Promise<boolean> {
  return canAccessUserId(user, targetUserId);
}

export async function createComment(input: {
  workflowType: CollaborationWorkflowType;
  recordId: number;
  authorId: number;
  body: string;
  mentionedUserIds?: number[];
}) {
  const [comment] = await db.insert(collaborationCommentsTable).values({
    workflowType: input.workflowType,
    recordId: input.recordId,
    authorId: input.authorId,
    body: input.body,
    mentionedUserIds: serializeMentionedUserIds(input.mentionedUserIds),
  }).returning();

  return comment;
}

export async function listComments(workflowType: CollaborationWorkflowType, recordId: number) {
  return db.select().from(collaborationCommentsTable)
    .where(and(
      eq(collaborationCommentsTable.workflowType, workflowType),
      eq(collaborationCommentsTable.recordId, recordId),
    ))
    .orderBy(asc(collaborationCommentsTable.createdAt), asc(collaborationCommentsTable.id));
}

export async function createHandoff(input: {
  workflowType: OwnershipHandoffWorkflowType;
  recordId: number;
  fromUserId?: number | null;
  toUserId: number;
  handedOffBy: number;
  note?: string;
}) {
  const [handoff] = await db.insert(ownershipHandoffsTable).values({
    workflowType: input.workflowType,
    recordId: input.recordId,
    fromUserId: input.fromUserId ?? null,
    toUserId: input.toUserId,
    handedOffBy: input.handedOffBy,
    note: input.note ?? null,
  }).returning();

  return handoff;
}

export async function listHandoffs(workflowType: OwnershipHandoffWorkflowType, recordId: number) {
  return db.select().from(ownershipHandoffsTable)
    .where(and(
      eq(ownershipHandoffsTable.workflowType, workflowType),
      eq(ownershipHandoffsTable.recordId, recordId),
    ))
    .orderBy(asc(ownershipHandoffsTable.createdAt), asc(ownershipHandoffsTable.id));
}

export async function getUserBasicProfile(userId: number) {
  const [user] = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    role: usersTable.role,
    departmentId: usersTable.departmentId,
  }).from(usersTable).where(eq(usersTable.id, userId));

  return user ?? null;
}
