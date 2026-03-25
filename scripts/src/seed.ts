import { db, departmentsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

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

  const hashPass = async (p: string) => bcrypt.hash(p, 10);

  const users = [
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

  for (const user of users) {
    const existing = await db.select().from(usersTable).where(eq(usersTable.email, user.email));
    if (existing.length === 0) {
      await db.insert(usersTable).values(user);
      console.log(`Created user: ${user.name} (${user.email}) — role: ${user.role}`);
    } else {
      console.log(`User already exists: ${user.email}`);
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
