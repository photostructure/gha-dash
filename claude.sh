#!/bin/bash
# claude.sh — Wrapper that injects TPP-aware system prompt into every session.
#
# Claude is _supposed_ to follow CLAUDE.md instructions, but in practice it
# reliably ignores both CLAUDE.md and hooks within a few turns. This wrapper
# ensures the TPP workflow stays in Claude's system prompt for the entire session.
#
# Usage: Called via the `cla` shell function (see docs/TPP-GUIDE.md)
#   cla              — start a new session with TPP system prompt
#   cla --resume     — resume a session with TPP system prompt
#   cla [any args]   — all arguments are passed through to claude

DATE=$(date +%Y-%m-%d)

exec claude --append-system-prompt "$(
  cat <<SYSTEM
- The current date is $DATE

This project uses Technical Project Plans (TPPs) in \`_todo/*.md\` to share
research, design decisions, and next steps between sessions.

IMPORTANT TPP rules:
- When you exit plan mode, your first step should be to write or update a
  relevant TPP using the /handoff skill.
- When you run low on context and you are working on a TPP, run the /handoff skill.
- Before starting any significant work, check \`_todo/\` for relevant TPPs.
- Always read CLAUDE.md and docs/TPP-GUIDE.md at the start of a session.
- Document failed approaches — this is the highest-value content in a TPP.
SYSTEM
)" "$@"
