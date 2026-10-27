import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import readline from "node:readline/promises";
const run = (cmd) => { const r = spawnSync(cmd, { cwd: "backend", stdio: "inherit", shell: true }); if (r.status !== 0) process.exit(r.status ?? 1); };
if (!existsSync("backend/.env")) {
  copyFileSync("backend/.env.example", "backend/.env");
  writeFileSync("backend/.env", readFileSync("backend/.env.example", "utf8").replace("CHANGE_ME_TO_A_LONG_RANDOM_STRING", randomBytes(32).toString("hex")));
  console.log("Created backend/.env with a fresh JWT secret.");
}
const hadDb = existsSync("backend/prisma/dev.db"); // checked BEFORE prisma creates it
run("npx prisma generate");
run("npx prisma db push");
let seed = true;
if (hadDb && !process.argv.includes("--yes")) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  seed = /^y/i.test(await rl.question("A database already exists. Re-seed demo data (this ERASES existing data)? [y/N] "));
  rl.close();
}
if (seed) run("npx tsx prisma/seed.ts");
console.log("\nSetup complete. Run: npm run dev   (web: http://localhost:5173, api: http://localhost:4000)");
