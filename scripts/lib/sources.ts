import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";

const CACHE_DIR = join(__dirname, "..", ".cache");

/** Downloads a URL to the local cache (curl: honors HTTPS_PROXY environments,
 * which plain Node fetch does not). Re-runs are served from cache. */
export function fetchCached(url: string, cacheName: string): string {
  const cachePath = join(CACHE_DIR, cacheName);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath, "utf8");
  }
  mkdirSync(dirname(cachePath), { recursive: true });
  console.log(`  downloading ${url}`);
  const body = execFileSync("curl", ["-sS", "--fail", "--max-time", "300", url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  writeFileSync(cachePath, body);
  return body;
}
