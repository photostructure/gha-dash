import { describe, it, expect } from "vitest";
import { formatDuration, relativeTime, displayStatus } from "../../types.js";
import type { WorkflowRun } from "../../types.js";

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(5_000)).toBe("5s");
    expect(formatDuration(45_000)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(150_000)).toBe("2m 30s");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3_661_000)).toBe("1h 1m 1s");
    expect(formatDuration(7_200_000)).toBe("2h 0m 0s");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

describe("relativeTime", () => {
  it("formats seconds ago", () => {
    const now = new Date(Date.now() - 30_000).toISOString();
    expect(relativeTime(now)).toBe("30s ago");
  });

  it("formats minutes ago", () => {
    const now = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(relativeTime(now)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const now = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(relativeTime(now)).toBe("3h ago");
  });

  it("formats days ago", () => {
    const now = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(relativeTime(now)).toBe("2d ago");
  });
});

describe("displayStatus", () => {
  const run = (status: string, conclusion: string | null) =>
    ({ status, conclusion }) as WorkflowRun;

  it("shows conclusion for completed runs", () => {
    expect(displayStatus(run("completed", "success"))).toBe("success");
    expect(displayStatus(run("completed", "failure"))).toBe("failure");
  });

  it("shows status for in-progress runs", () => {
    expect(displayStatus(run("in_progress", null))).toBe("in_progress");
    expect(displayStatus(run("queued", null))).toBe("queued");
  });

  it("shows status for pending runs", () => {
    expect(displayStatus(run("pending", null))).toBe("pending");
  });
});
