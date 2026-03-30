import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    globals: true,
    isolate: true,
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    maxWorkers: 1,
  },
});
