import { db, departmentsTable, usersTable, rolesTable, workersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // --- Departments ---
  const deptValues = [
    { name: "Landscape Operations", description: "Field workers and landscape crew" },
    { name: "Contracting", description: "Construction and contracting teams" },
    { name: "Administration", description: "Administrative and support staff" },
    { name: "Drivers", description: "Vehicle drivers and logistics" },
  ];

  for (const dept of deptValues) {
    const existing = await db.select().from(departmentsTable).where(eq(departmentsTable.name, dept.name));
    if (existing.length === 0) {
      await db.insert(departmentsTable).values(dept);
    }
  }

  const allDepts = await db.select().from(departmentsTable);
  const deptMap: Record<string, number> = {};
  for (const d of allDepts) {
    deptMap[d.name] = d.id;
  }
  console.log("Departments ready:", Object.keys(deptMap));

  // --- Roles ---
  const roleValues = [
    { name: "admin", description: "System administrator — full access", permissions: '["*"]' },
    { name: "hr", description: "HR manager — manage employees, approve leaves, view reports", permissions: '["users:read","users:write","attendance:read","leaves:read","leaves:write","reports:read","alerts:read","medical:read"]' },
    { name: "worker", description: "Field worker — own attendance, leave applications, MCs", permissions: '["attendance:own","leaves:own","medical:own"]' },
    { name: "driver", description: "Driver — own attendance, leave applications, MCs", permissions: '["attendance:own","leaves:own","medical:own"]' },
  ];

  for (const role of roleValues) {
    const existing = await db.select().from(rolesTable).where(eq(rolesTable.name, role.name));
    if (existing.length === 0) {
      await db.insert(rolesTable).values(role);
      console.log(`Created role: ${role.name}`);
    }
  }

  // --- Users ---
  const hashPass = async (p: string) => bcrypt.hash(p, 10);

  const usersToSeed = [
    {
      name: "Admin User",
      email: "admin@teston.com",
      passwordHash: await hashPass("Admin@123"),
      role: "admin" as const,
      employeeId: "EMP001",
      departmentId: deptMap["Administration"],
      position: "System Administrator",
      hourlyRate: "0",
      phone: "+65 9000 0001",
      isActive: "true",
    },
    {
      name: "Sarah Lim",
      email: "hr@teston.com",
      passwordHash: await hashPass("HR@12345"),
      role: "hr" as const,
      employeeId: "EMP002",
      departmentId: deptMap["Administration"],
      position: "HR Manager",
      hourlyRate: "25",
      phone: "+65 9000 0002",
      isActive: "true",
    },
    {
      name: "Ahmad Bin Hassan",
      email: "worker1@teston.com",
      passwordHash: await hashPass("Worker@123"),
      role: "worker" as const,
      employeeId: "EMP003",
      departmentId: deptMap["Landscape Operations"],
      position: "Landscape Technician",
      hourlyRate: "12",
      phone: "+65 9000 0003",
      isActive: "true",
    },
    {
      name: "Raj Kumar",
      email: "worker2@teston.com",
      passwordHash: await hashPass("Worker@123"),
      role: "worker" as const,
      employeeId: "EMP004",
      departmentId: deptMap["Contracting"],
      position: "Construction Worker",
      hourlyRate: "14",
      phone: "+65 9000 0004",
      isActive: "true",
    },
    {
      name: "David Tan",
      email: "driver1@teston.com",
      passwordHash: await hashPass("Driver@123"),
      role: "driver" as const,
      employeeId: "EMP005",
      departmentId: deptMap["Drivers"],
      position: "Driver",
      hourlyRate: "15",
      phone: "+65 9000 0005",
      isActive: "true",
    },
    {
      name: "Lee Wei Ming",
      email: "driver2@teston.com",
      passwordHash: await hashPass("Driver@123"),
      role: "driver" as const,
      employeeId: "EMP006",
      departmentId: deptMap["Drivers"],
      position: "Senior Driver",
      hourlyRate: "16",
      phone: "+65 9000 0006",
      isActive: "true",
    },
  ];

  const userMap: Record<string, number> = {};

  for (const user of usersToSeed) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, user.email));
    if (existing.length === 0) {
      const [created] = await db.insert(usersTable).values(user).returning();
      userMap[user.email] = created.id;
      console.log(`Created user: ${user.name} (${user.email}) — role: ${user.role}`);
    } else {
      userMap[user.email] = existing[0].id;
      console.log(`User already exists: ${user.email}`);
    }
  }

  // --- Workers (worker/driver role users get a worker record) ---
  const workerEntries = [
    {
      userId: userMap["worker1@teston.com"],
      departmentId: deptMap["Landscape Operations"],
      employeeId: "EMP003",
      jobTitle: "Landscape Technician",
      workLocation: "Tannery Lane Site A",
      contractType: "full_time",
      status: "active" as const,
      startDate: "2024-01-15",
    },
    {
      userId: userMap["worker2@teston.com"],
      departmentId: deptMap["Contracting"],
      employeeId: "EMP004",
      jobTitle: "Construction Worker",
      workLocation: "Tannery Lane Site B",
      contractType: "full_time",
      status: "active" as const,
      startDate: "2024-03-01",
    },
    {
      userId: userMap["driver1@teston.com"],
      departmentId: deptMap["Drivers"],
      employeeId: "EMP005",
      jobTitle: "Driver",
      workLocation: "Vehicle Pool",
      contractType: "full_time",
      status: "active" as const,
      startDate: "2023-06-01",
    },
    {
      userId: userMap["driver2@teston.com"],
      departmentId: deptMap["Drivers"],
      employeeId: "EMP006",
      jobTitle: "Senior Driver",
      workLocation: "Vehicle Pool",
      contractType: "full_time",
      status: "active" as const,
      startDate: "2022-11-01",
    },
  ];

  for (const entry of workerEntries) {
    if (!entry.userId) continue;
    const existing = await db.select().from(workersTable).where(eq(workersTable.userId, entry.userId));
    if (existing.length === 0) {
      await db.insert(workersTable).values(entry);
      console.log(`Created worker record for userId: ${entry.userId}`);
    }
  }

  console.log("\nSeed complete!");
  console.log("\nDemo accounts:");
  console.log("  Admin:  admin@teston.com / Admin@123");
  console.log("  HR:     hr@teston.com / HR@12345");
  console.log("  Worker: worker1@teston.com / Worker@123");
  console.log("  Worker: worker2@teston.com / Worker@123");
  console.log("  Driver: driver1@teston.com / Driver@123");
  console.log("  Driver: driver2@teston.com / Driver@123");
}

seed().catch(console.error).finally(() => process.exit(0));
