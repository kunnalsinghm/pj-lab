import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["tests/api/**/*.test.ts"], globalSetup: ["tests/api/global-setup.ts"], env: { DATABASE_URL: "file:./test.db", JWT_SECRET: "test-secret-test-secret-123", NODE_ENV: "test" }, testTimeout: 30000, fileParallelism: false } });
