# gha-dash — GitHub Actions Dashboard

## Project Overview

A GitHub Actions dashboard application. Licensed under Apache 2.0.

## TPP Workflow

This project uses Technical Project Plans (TPPs) to preserve context between
sessions. See `docs/TPP-GUIDE.md` for the full guide.

- Active TPPs live in `_todo/*.md`
- Completed TPPs live in `_done/*.md`
- Use `/tpp [path]` to work on a TPP
- Use `/handoff` before ending a session to update the TPP

## Conventions

- Write clear commit messages explaining "why" not "what"
- Keep files focused and reasonably sized
- Add tests for new functionality
- Document non-obvious decisions in the relevant TPP
