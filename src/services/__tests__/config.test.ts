import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readConfig, writeConfig } from "../config.js";
import { defaultConfig } from "../../types.js";

// Use a temp dir for config during tests
const testDir = join(tmpdir(), `gha-dash-test-${process.pid}`);

beforeEach(() => {
  // Stub both so it works on Windows (APPDATA) and Unix (XDG_CONFIG_HOME)
  vi.stubEnv("XDG_CONFIG_HOME", testDir);
  vi.stubEnv("APPDATA", testDir);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(testDir, { recursive: true, force: true });
});

describe("readConfig", () => {
  it("returns default config when no file exists", async () => {
    const config = await readConfig();
    expect(config).toEqual(defaultConfig);
  });

  it("reads and merges saved config with defaults", async () => {
    await writeConfig({ ...defaultConfig, repos: ["owner/repo"], port: 4000 });
    const config = await readConfig();
    expect(config.repos).toEqual(["owner/repo"]);
    expect(config.port).toBe(4000);
    expect(config.refreshInterval).toBe(defaultConfig.refreshInterval);
  });

  it("throws on corrupt JSON that is not ENOENT", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const dir = join(testDir, "gha-dash");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "config.json"), "not json!!!");
    await expect(readConfig()).rejects.toThrow();
  });
});

describe("writeConfig", () => {
  it("creates config directory and writes file", async () => {
    await writeConfig({ ...defaultConfig, repos: ["a/b"] });

    const configPath = join(testDir, "gha-dash", "config.json");
    const raw = await readFile(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    expect(parsed.repos).toEqual(["a/b"]);
  });

  it("overwrites existing config", async () => {
    await writeConfig({ ...defaultConfig, port: 3000 });
    await writeConfig({ ...defaultConfig, port: 4000 });

    const config = await readConfig();
    expect(config.port).toBe(4000);
  });
});
