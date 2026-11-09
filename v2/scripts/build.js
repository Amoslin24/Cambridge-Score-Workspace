import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(path.join(root, "index.html"), path.join(dist, "index.html"));
cpSync(path.join(root, "css"), path.join(dist, "css"), { recursive: true });
cpSync(path.join(root, "src"), path.join(dist, "src"), { recursive: true });
writeFileSync(path.join(dist, "RUN.txt"), "在这个目录执行: python3 -m http.server 8765\n然后打开 http://127.0.0.1:8765/\n这是静态文件，不需要安装依赖。\n");
console.log(`built ${dist}`);
