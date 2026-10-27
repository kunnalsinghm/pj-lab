// Starts the API (4000) and the web app (5173) together. Ctrl+C stops both.
import { spawn } from "node:child_process";
const run = (name, dir) => {
  const p = spawn(`npm run dev --prefix ${dir}`, { shell: true, stdio: "inherit" });
  p.on("exit", code => { console.log(`[${name}] exited (${code})`); process.exit(code ?? 0); });
  return p;
};
console.log("Starting DeptFlow:  web http://localhost:5173   api http://localhost:4000");
const procs = [run("api", "backend"), run("web", "frontend")];
process.on("SIGINT", () => { procs.forEach(p => p.kill()); process.exit(0); });
