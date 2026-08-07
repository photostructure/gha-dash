import { describe, expect, it } from "vitest";
import {
  assertSupportedNpmVersion,
  minimumNpmVersion,
  npmVersionFromUserAgent,
} from "./check-npm-version.mjs";

describe("npm version guard", () => {
  it("accepts the minimum supported npm version", () => {
    expect(
      assertSupportedNpmVersion(
        "npm/" + minimumNpmVersion + " node/v24.19.0 linux x64",
      ),
    ).toBe(minimumNpmVersion);
  });

  it("accepts a newer npm version", () => {
    expect(assertSupportedNpmVersion("npm/12.0.0 node/v26.7.0 linux x64")).toBe(
      "12.0.0",
    );
  });

  it("rejects npm versions that ignore min-release-age", () => {
    expect(() =>
      assertSupportedNpmVersion("npm/11.9.9 node/v24.19.0 linux x64"),
    ).toThrow(/npm >= 11\.10\.0/);
  });

  it("rejects missing or unstable npm versions", () => {
    expect(() => npmVersionFromUserAgent()).toThrow(
      /Run dependency updates through an npm script/,
    );
    expect(() => npmVersionFromUserAgent("npm/11.10.0-beta.1")).toThrow(
      /Could not parse stable npm version/,
    );
  });
});
