#!/usr/bin/env bash
#
# install.sh: point this repo's git at the tracked hooks in .githooks/.
# Run once per clone AND once per worktree:  bash .githooks/install.sh
#
# Git never pushes hooks: .git/hooks/ is per-clone local state that no clone or
# pull carries. So the hook FILES ride along in the tracked .githooks/ directory
# and this one command opts a checkout in by setting core.hooksPath. That is the
# entire delivery mechanism.

set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

git config core.hooksPath .githooks
chmod +x .githooks/pre-commit .githooks/content-audit.sh .githooks/release-check.sh 2>/dev/null || true
chmod +x start.sh 2>/dev/null || true

if [ ! -f .githooks/denylist.local ] && [ -f .githooks/denylist.example ]; then
  cp .githooks/denylist.example .githooks/denylist.local
  echo "Created .githooks/denylist.local from the example."
  echo ""
  echo "IT IS A PLACEHOLDER AND THE HOOK WILL REFUSE TO RUN AGAINST IT."
  echo "That is deliberate: a list that passes a non-empty check while matching"
  echo "nothing is worse than no gate at all, because it looks armed. Replace"
  echo "the <your-username> placeholders with your real home paths, personal or"
  echo "client domains, and internal names, then commit as normal."
fi

echo "Installed: git will run .githooks/pre-commit on every commit in this checkout."
