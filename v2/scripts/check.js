import { readdirSync, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith(".js") ? [full] : [];
  });
}

const files = walk(root).filter((file) => !file.includes(`${path.sep}node_modules${path.sep}`));
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed = true;
    process.stderr.write(`${file}\n${result.stderr}`);
  }
}
const html = readFileSync(path.join(root, "index.html"), "utf8");
for (const asset of ["./css/app.css", "./src/app.js"]) {
  if (!html.includes(asset)) {
    failed = true;
    process.stderr.write(`index.html 没有引用 ${asset}\n`);
  }
}
if (failed) process.exit(1);
console.log(`checked ${files.length} files`);
