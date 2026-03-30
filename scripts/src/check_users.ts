import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function main() {
  const users = await db.select({ id: usersTable.id, email: usersTable.email, role: usersTable.role }).from(usersTable).limit(5);
  console.table(users);
}

main().catch(console.error).finally(() => process.exit(0));
