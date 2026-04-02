import { readFile, writeFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type AppConfig, type CacheEntry, defaultConfig } from "../types.js";

export function getConfigDir(): string {
  if (process.platform === "win32") {
    return join(
      process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
      "gha-dash",
    );
  }
  return join(
    process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
    "gha-dash",
  );
}

function configPath(): string {
  return join(getConfigDir(), "config.json");
}

function cachePath(): string {
  return join(getConfigDir(), "cache.json");
}

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(configPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ...defaultConfig };
    }
    throw err;
  }
}

export async function writeConfig(config: AppConfig): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  await writeFile(configPath(), JSON.stringify(config, null, 2) + "\n");
}

export async function readCacheFromDisk<T>(): Promise<Map<string, CacheEntry<T>> | null> {
  try {
    const raw = await readFile(cachePath(), "utf-8");
    const entries: Array<[string, CacheEntry<T>]> = JSON.parse(raw);
    return new Map(entries);
  } catch {
    return null;
  }
}

export async function writeCacheToDisk<T>(
  store: IterableIterator<[string, CacheEntry<T>]>,
): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
  await writeFile(cachePath(), JSON.stringify([...store]) + "\n");
}
