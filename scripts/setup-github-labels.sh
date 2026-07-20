#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   gh auth login
#   ./scripts/setup-github-labels.sh
#
# This script is idempotent. It creates or updates the minimal Tipovačka label set
# in the current GitHub repository. It intentionally does not hardcode an owner
# or repository name; run it from a checked-out repo with `gh` configured.

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI 'gh' is required." >&2
  exit 1
fi

ensure_label() {
  local name="$1"
  local color="$2"
  local description="$3"

  if gh label list --search "$name" --json name --jq '.[].name' | grep -Fxq "$name"; then
    gh label edit "$name" --color "$color" --description "$description"
  else
    gh label create "$name" --color "$color" --description "$description"
  fi
}

ensure_label "type: bug" "d73a4a" "Existing behavior is broken."
ensure_label "type: feature" "1f6feb" "New product capability."
ensure_label "type: improvement" "a2eeef" "Improves existing behavior."
ensure_label "type: research" "d4c5f9" "Investigation or decision before implementation."

ensure_label "priority: P0" "b60205" "Security incident, data loss, or major outage."
ensure_label "priority: P1" "d93f0b" "Blocks release or a core user flow."
ensure_label "priority: P2" "fbca04" "Important but not blocking."
ensure_label "priority: P3" "cfd3d7" "Low priority or backlog."

ensure_label "agent: ready" "0e8a16" "Ready for Codex or another agent to analyze/implement."
ensure_label "needs: decision" "fbca04" "Needs owner/product/technical decision."
ensure_label "blocked" "5319e7" "Cannot progress until dependency is resolved."
ensure_label "needs: verification" "1d76db" "Implemented but needs manual or owner verification."

ensure_label "area: frontend" "bfd4f2" "React/UI/client-side code."
ensure_label "area: backend" "bfdadc" "Server, Netlify Functions, or service logic."
ensure_label "area: database" "c5def5" "Supabase schema, data access, RLS, or SQL."
ensure_label "area: integrations" "fef2c0" "External APIs, TheSportsDB, cron, sync providers."
ensure_label "area: security" "ee0701" "Auth, secrets, permissions, RLS, or security-sensitive work."
