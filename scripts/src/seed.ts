import { seedBaseData } from "./seed-base";

async function seed() {
  console.log("Seeding database...");
  await seedBaseData();

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
