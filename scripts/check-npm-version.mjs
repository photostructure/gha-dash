import { pathToFileURL } from "node:url";

export const minimumNpmVersion = "11.10.0";

function parseStableVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error("Could not parse stable npm version: " + version);
  }
  return match.slice(1).map(Number);
}

function compareVersions(left, right) {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] - right[index];
    }
  }
  return 0;
}

export function npmVersionFromUserAgent(userAgent) {
  const match = /(?:^|\s)npm\/([^\s]+)/.exec(userAgent ?? "");
  if (!match) {
    throw new Error(
      "Could not determine npm version from npm_config_user_agent. " +
        "Run dependency updates through an npm script.",
    );
  }
  parseStableVersion(match[1]);
  return match[1];
}

export function assertSupportedNpmVersion(
  userAgent = process.env.npm_config_user_agent ??
    process.env.NPM_CONFIG_USER_AGENT,
) {
  const actual = npmVersionFromUserAgent(userAgent);
  if (
    compareVersions(
      parseStableVersion(actual),
      parseStableVersion(minimumNpmVersion),
    ) < 0
  ) {
    throw new Error(
      "npm " +
        actual +
        " is too old to enforce min-release-age; use npm >= " +
        minimumNpmVersion,
    );
  }
  return actual;
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    assertSupportedNpmVersion();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
