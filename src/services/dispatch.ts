import type { Octokit } from "@octokit/rest";
import { parse as parseYaml } from "yaml";
import type { DispatchInput, WorkflowDispatchInfo } from "../types.js";
import { Cache } from "./cache.js";

// Cache parsed workflow definitions for 5 minutes
const dispatchCache = new Cache<WorkflowDispatchInfo | null>(300);

/**
 * Fetch workflow YAML and parse dispatch inputs.
 * Returns null if the workflow doesn't support workflow_dispatch.
 */
export async function getDispatchInfo(
  octokit: Octokit,
  owner: string,
  repo: string,
  workflowId: number,
  workflowPath: string,
): Promise<WorkflowDispatchInfo | null> {
  const cacheKey = `${owner}/${repo}/${workflowId}`;
  const cached = dispatchCache.get(cacheKey);
  if (cached && !dispatchCache.isStale(cacheKey)) {
    return cached.data;
  }

  const content = await fetchWorkflowYaml(octokit, owner, repo, workflowPath);
  const info = parseWorkflowDispatch(content, workflowId, workflowPath);
  dispatchCache.set(cacheKey, info);
  return info;
}

async function fetchWorkflowYaml(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const { data } = await octokit.repos.getContent({ owner, repo, path });

  if (!("content" in data) || !data.content) {
    throw new Error(`No content found at ${path}`);
  }

  return Buffer.from(data.content, "base64").toString();
}

/**
 * Parse a workflow YAML string and extract workflow_dispatch info.
 * Returns null if the workflow doesn't support workflow_dispatch.
 *
 * Handles all `on` syntax variants:
 *   on: workflow_dispatch
 *   on: [push, workflow_dispatch]
 *   on: { workflow_dispatch: {} }
 *   on: { workflow_dispatch: { inputs: { ... } } }
 */
export function parseWorkflowDispatch(
  yamlContent: string,
  workflowId: number,
  workflowName: string,
): WorkflowDispatchInfo | null {
  let doc: Record<string, unknown>;
  try {
    doc = parseYaml(yamlContent);
  } catch {
    return null;
  }
  if (!doc || typeof doc !== "object") return null;

  const on = doc.on ?? doc.true; // YAML parser treats `on:` as boolean key `true`

  if (!on) return null;

  // on: workflow_dispatch
  if (typeof on === "string") {
    if (on === "workflow_dispatch") {
      return { workflowId, workflowName, inputs: [] };
    }
    return null;
  }

  // on: [push, workflow_dispatch]
  if (Array.isArray(on)) {
    if (on.includes("workflow_dispatch")) {
      return { workflowId, workflowName, inputs: [] };
    }
    return null;
  }

  // on: { workflow_dispatch: ... }
  if (typeof on === "object" && on !== null) {
    const onObj = on as Record<string, unknown>;
    const wd = onObj.workflow_dispatch;
    if (wd === undefined) return null;

    // on: { workflow_dispatch: null } or { workflow_dispatch: {} }
    if (
      !wd ||
      typeof wd !== "object" ||
      !(wd as Record<string, unknown>).inputs
    ) {
      return { workflowId, workflowName, inputs: [] };
    }

    // on: { workflow_dispatch: { inputs: { ... } } }
    const inputs = parseInputs(
      (wd as Record<string, unknown>).inputs as Record<string, unknown>,
    );
    return { workflowId, workflowName, inputs };
  }

  return null;
}

function parseInputs(rawInputs: Record<string, unknown>): DispatchInput[] {
  return Object.entries(rawInputs).map(([name, def]) => {
    const d = (def ?? {}) as Record<string, unknown>;
    return {
      name,
      type: normalizeType(d.type as string | undefined),
      description: String(d.description ?? ""),
      required: Boolean(d.required),
      default: String(d.default ?? ""),
      options: Array.isArray(d.options) ? d.options.map(String) : [],
    };
  });
}

function normalizeType(t: string | undefined): DispatchInput["type"] {
  if (t === "choice" || t === "boolean" || t === "environment") return t;
  return "string";
}

/**
 * Dispatch a workflow run.
 */
export async function dispatchWorkflow(
  octokit: Octokit,
  owner: string,
  repo: string,
  workflowId: number,
  ref: string,
  inputs: Record<string, string>,
): Promise<void> {
  await octokit.actions.createWorkflowDispatch({
    owner,
    repo,
    workflow_id: workflowId,
    ref,
    inputs,
  });
}
