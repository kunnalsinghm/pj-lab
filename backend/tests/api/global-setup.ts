import { execSync } from "node:child_process";
export default function setup() {
  const env = { ...process.env, DATABASE_URL: "file:./test.db", NODE_ENV: "test", JWT_SECRET: "test-secret-test-secret-123" };
  execSync("npx prisma db push --force-reset --skip-generate", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
