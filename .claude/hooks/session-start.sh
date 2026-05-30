#!/bin/bash
# SessionStart hook for Claude Code on the web.
# Ensures the design skills are installed at the start of every session.
# Idempotent and non-interactive; never blocks session start on failure.
set -uo pipefail

# Only run in the remote (Claude Code on the web) environment.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Skills to ensure are installed: "repo-url|skill-name"
SKILLS=(
  "https://github.com/anthropics/skills|frontend-design"
  "https://github.com/nextlevelbuilder/ui-ux-pro-max-skill|ui-ux-pro-max"
)

install_skill() {
  local repo="$1" name="$2"
  if [ -e ".claude/skills/$name" ]; then
    echo "✓ skill '$name' already present"
    return 0
  fi
  echo "→ installing skill '$name' from $repo"
  if npx -y skills add "$repo" --skill "$name" >"/tmp/skill-$name.log" 2>&1; then
    echo "✓ installed skill '$name'"
  else
    echo "⚠ could not install skill '$name' (see /tmp/skill-$name.log) — continuing"
  fi
}

if command -v npx >/dev/null 2>&1; then
  for entry in "${SKILLS[@]}"; do
    install_skill "${entry%%|*}" "${entry##*|}"
  done
else
  echo "⚠ npx not found — skipping skill installation"
fi

# --- Add project dependency setup below if needed (kept synchronous) ---
# e.g. npm install  /  pip install -r requirements.txt

exit 0
