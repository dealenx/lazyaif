import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveVersion(): string {
  if (process.env.LAZYAIF_VERSION) {
    console.debug(`[shared:version] resolved VERSION=${process.env.LAZYAIF_VERSION} (env)`);
    return process.env.LAZYAIF_VERSION;
  }

  const candidates = [
    join(__dirname, "..", "package.json"),
    join(__dirname, "..", "..", "package.json"),
    join(__dirname, "..", "..", "..", "package.json"),
  ];

  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const pkg = JSON.parse(readFileSync(p, "utf-8")) as { version?: string };
        if (pkg.version) {
          console.debug(`[shared:version] resolved VERSION=${pkg.version} (${p})`);
          return pkg.version;
        }
      } catch {
        continue;
      }
    }
  }

  console.debug("[shared:version] resolved VERSION=0.0.0-unknown (fallback)");
  return "0.0.0-unknown";
}

export const VERSION: string = resolveVersion();