import { spawnSync } from "node:child_process";

const steps = [
  ["typecheck", "pnpm", ["exec", "tsc", "--noEmit"]],
  ["unit tests", "pnpm", ["test", "--", "--runInBand"]],
  ["production build", "pnpm", ["build"]],
];

for (const [name, command, args] of steps) {
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    throw new Error(`${name} failed`);
  }
}

console.log("QuickFill verification passed");
