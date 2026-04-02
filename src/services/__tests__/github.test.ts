import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractToken } from "../github.js";
import { execSync } from "node:child_process";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

const mockExecSync = vi.mocked(execSync);

describe("extractToken", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("extracts and trims the token from gh auth token", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExecSync.mockImplementation(((cmd: string) => {
      if (cmd === "which gh") return "/usr/bin/gh\n";
      if (cmd === "gh auth token") return "gho_abc123\n";
      return "";
    }) as any);

    expect(extractToken()).toBe("gho_abc123");
  });

  it("throws if gh CLI is not found", () => {
    mockExecSync.mockImplementation((() => {
      throw new Error("not found");
    }) as any);

    expect(() => extractToken()).toThrow("gh CLI not found");
  });

  it("throws if gh CLI is not authenticated", () => {
    let calls = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockExecSync.mockImplementation((() => {
      calls++;
      if (calls === 1) return "/usr/bin/gh\n"; // which gh
      throw new Error("not logged in"); // gh auth token
    }) as any);

    expect(() => extractToken()).toThrow("gh CLI not authenticated");
  });
});
