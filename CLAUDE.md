# gha-dash — GitHub Actions Dashboard

## Project Overview

A GitHub Actions dashboard that shows workflow status across multiple
orgs/accounts. The only prerequisite is an authenticated `gh` CLI.
Licensed under Apache 2.0.

## Architecture

See `docs/ARCHITECTURE.md` for the tech stack, core types, routes, security
constraints, and consolidated lore/gotchas.

## Active TPPs

- `_todo/20260401-phase1-dashboard.md` — Server + dashboard + settings (Phase 1)
- `_todo/20260401-phase2-dispatch.md` — Workflow dispatch forms (Phase 2)

## TPP Workflow

See `docs/TPP-GUIDE.md` for the full guide.

- Active TPPs live in `_todo/*.md`
- Completed TPPs live in `_done/*.md`
- Use `/tpp [path]` to work on a TPP
- Use `/handoff` before ending a session to update the TPP

## Design Principles

Follow the guidelines in `docs/DESIGN-PRINCIPLES.md` — Simple Design & Tidy First.

Key points:
- Four Rules: passes tests, reveals intention, no duplication, fewest elements
- Fail early and visibly — no bogus guardrails or silent defaults
- Keep tidyings in separate commits from behavior changes
- Reduce coupling; prefer explicit dependencies over hidden ones

## Conventions

- TypeScript with strict mode, ESM (`"type": "module"`)
- Test with vitest + msw (Mock Service Worker)
- Write clear commit messages explaining "why" not "what"
- Keep files focused and reasonably sized
- Add tests for new functionality
- Document non-obvious decisions in the relevant TPP
