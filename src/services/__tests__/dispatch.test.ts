import { describe, it, expect } from "vitest";
import { parseWorkflowDispatch } from "../dispatch.js";

describe("parseWorkflowDispatch", () => {
  describe("on syntax variants", () => {
    it("parses 'on: workflow_dispatch' (string)", () => {
      const yaml = `
name: Deploy
on: workflow_dispatch
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps: []
`;
      const result = parseWorkflowDispatch(yaml, 1, "Deploy");
      expect(result).toEqual({
        workflowId: 1,
        workflowName: "Deploy",
        inputs: [],
      });
    });

    it("parses 'on: [push, workflow_dispatch]' (array)", () => {
      const yaml = `
name: CI
on: [push, workflow_dispatch]
jobs:
  test:
    runs-on: ubuntu-latest
    steps: []
`;
      const result = parseWorkflowDispatch(yaml, 2, "CI");
      expect(result).toEqual({
        workflowId: 2,
        workflowName: "CI",
        inputs: [],
      });
    });

    it("parses 'on: { workflow_dispatch: {} }' (empty object)", () => {
      const yaml = `
name: Build
on:
  workflow_dispatch: {}
jobs:
  build:
    runs-on: ubuntu-latest
    steps: []
`;
      const result = parseWorkflowDispatch(yaml, 3, "Build");
      expect(result).toEqual({
        workflowId: 3,
        workflowName: "Build",
        inputs: [],
      });
    });

    it("parses workflow_dispatch with inputs", () => {
      const yaml = `
name: Deploy
on:
  workflow_dispatch:
    inputs:
      environment:
        type: choice
        description: Deploy target
        required: true
        options:
          - staging
          - production
      dry_run:
        type: boolean
        description: Dry run mode
        default: "false"
      version:
        description: Version to deploy
        required: true
`;
      const result = parseWorkflowDispatch(yaml, 4, "Deploy");
      expect(result).not.toBeNull();
      expect(result!.inputs).toHaveLength(3);

      expect(result!.inputs[0]).toEqual({
        name: "environment",
        type: "choice",
        description: "Deploy target",
        required: true,
        default: "",
        options: ["staging", "production"],
      });

      expect(result!.inputs[1]).toEqual({
        name: "dry_run",
        type: "boolean",
        description: "Dry run mode",
        required: false,
        default: "false",
        options: [],
      });

      expect(result!.inputs[2]).toEqual({
        name: "version",
        type: "string",
        description: "Version to deploy",
        required: true,
        default: "",
        options: [],
      });
    });

    it("parses workflow_dispatch alongside other triggers", () => {
      const yaml = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
    inputs:
      debug:
        type: boolean
        default: "false"
`;
      const result = parseWorkflowDispatch(yaml, 5, "CI");
      expect(result).not.toBeNull();
      expect(result!.inputs).toHaveLength(1);
      expect(result!.inputs[0].name).toBe("debug");
    });
  });

  describe("non-dispatchable workflows", () => {
    it("returns null for 'on: push' (string, not dispatch)", () => {
      const yaml = `
name: CI
on: push
jobs:
  test:
    runs-on: ubuntu-latest
    steps: []
`;
      expect(parseWorkflowDispatch(yaml, 1, "CI")).toBeNull();
    });

    it("returns null for 'on: [push, pull_request]' (array, no dispatch)", () => {
      const yaml = `
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps: []
`;
      expect(parseWorkflowDispatch(yaml, 1, "CI")).toBeNull();
    });

    it("returns null for object triggers without workflow_dispatch", () => {
      const yaml = `
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  test:
    runs-on: ubuntu-latest
    steps: []
`;
      expect(parseWorkflowDispatch(yaml, 1, "CI")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles malformed YAML gracefully", () => {
      expect(parseWorkflowDispatch("not: valid: yaml: {{", 1, "x")).toBeNull();
    });

    it("handles empty document", () => {
      expect(parseWorkflowDispatch("", 1, "x")).toBeNull();
    });

    it("handles workflow_dispatch: null", () => {
      const yaml = `
name: Build
on:
  workflow_dispatch:
`;
      const result = parseWorkflowDispatch(yaml, 1, "Build");
      expect(result).toEqual({
        workflowId: 1,
        workflowName: "Build",
        inputs: [],
      });
    });

    it("handles input with unknown type as string", () => {
      const yaml = `
name: Build
on:
  workflow_dispatch:
    inputs:
      foo:
        type: number
        description: Some number
`;
      const result = parseWorkflowDispatch(yaml, 1, "Build");
      expect(result!.inputs[0].type).toBe("string");
    });

    it("handles input with no type as string", () => {
      const yaml = `
name: Build
on:
  workflow_dispatch:
    inputs:
      message:
        description: A message
`;
      const result = parseWorkflowDispatch(yaml, 1, "Build");
      expect(result!.inputs[0].type).toBe("string");
    });
  });
});
