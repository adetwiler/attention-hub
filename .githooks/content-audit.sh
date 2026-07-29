#!/usr/bin/env bash
#
# content-audit.sh: full-TREE scan for content that should not appear in a
# public repo. The pre-commit hook checks each commit's additions; this checks
# the WHOLE tracked tree at once, which is what you want before a batch push or
# a release. It greps every tracked file for the denylist plus email addresses
# and absolute home paths, and exits non-zero with a report if anything matches.
#
#   bash .githooks/content-audit.sh        (run from anywhere in the repo)
#   bash .githooks/content-audit.sh --generic-only   (skip the denylist half)
#
# SCOPE NOTE, and it is exact: git grep -I reads TRACKED TEXT files only. Two
# things follow, and both are handled rather than assumed away:
#   - Untracked files are not scanned. Green means "what would ship is clean",
#     not "the directory on disk is clean".
#   - Binary files are invisible to grep. A screenshot with metadata, a stray
#     database, or a compiled artifact is exactly how private content reaches a
#     public repo unnoticed, so binaries get a SEPARATE pass through their
#     printable strings and the count is named in the summary. A report that
#     says "clean" about a check it did not run is the same failure mode as a
#     gate that passes on an empty list.
#
# The fail-closed machinery is shared with the pre-commit hook in
# .githooks/gate-lib.sh. Read its header before changing anything here.
#
# The denylist lives in .githooks/denylist.local (gitignored) because publishing
# your content scanner must never publish the list of things you are keeping out.
# Copy .githooks/denylist.example to .githooks/denylist.local and fill it in.
#
# --generic-only exists for CI on a public repo, where the machine-local
# denylist cannot exist and must not become a repo secret (workflow code in a
# public repo can read secrets). The skip is EXPLICIT and flagged, never
# inferred from a missing file.

set -euo pipefail
repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

# shellcheck source=.githooks/gate-lib.sh
. "$repo_root/.githooks/gate-lib.sh"
hub_scratch_init

generic_only=0
[ "${1:-}" = "--generic-only" ] && generic_only=1

HUB_DENYLIST=""
if [ "$generic_only" -eq 0 ]; then
  denylist_file="$repo_root/.githooks/denylist.local"
  if [ ! -f "$denylist_file" ]; then
    echo "REFUSED: $denylist_file is missing. Run bash .githooks/install.sh and"
    echo "fill in your terms (it is gitignored). For CI: --generic-only."
    exit 2
  fi
  if ! hub_load_denylist "$denylist_file" "REFUSED"; then
    exit 2
  fi
fi

# Machine-generated lockfiles carry upstream package-author addresses. An npm
# package author's email is not your content problem.
LOCK_EXCLUDES=(':(exclude)*package-lock.json' ':(exclude)*yarn.lock' ':(exclude)*pnpm-lock.yaml' ':(exclude)*Cargo.lock' ':(exclude)*poetry.lock' ':(exclude)*uv.lock')

hits=0
report=""

# scan <label> <pattern> <exclude-or-empty> [extra git pathspecs...]
# Fail closed throughout: git grep exit 1 is clean, exit 2 or more is a broken
# scanner and stops the run rather than reporting clean.
scan() {
  local label="$1" pattern="$2" exclude="$3"
  shift 3
  hub_git_grep -I -n -i -E "$pattern" -- . "$@"
  local out="$HUB_SCAN_OUT"
  if [ -n "$exclude" ] && [ -n "$out" ]; then
    printf '%s\n' "$out" > "$HUB_SCRATCH/filter.in"
    hub_scan "$HUB_SCRATCH/filter.in" -ivE "$exclude"
    out="$HUB_SCAN_OUT"
  fi
  if [ -n "$out" ]; then
    report="${report}
== ${label} ==
${out}
"
    hits=1
  fi
}

summary="no denylisted terms, emails, or home paths"
if [ -n "$HUB_DENYLIST" ]; then
  scan "denylisted term" "$HUB_DENYLIST" ""
else
  echo "NOTE: --generic-only, the denylist scan was SKIPPED on purpose."
  # Say what was actually checked. A clean report that names a check it did not
  # run is the same failure mode as a gate that passes on an empty list.
  summary="no emails or home paths (denylist NOT checked)"
fi
scan "email address" "$HUB_EMAIL" "$HUB_EXAMPLE_DOMAINS" "${LOCK_EXCLUDES[@]}"
scan "absolute home path" "$HUB_HOMEPATH" "" "${LOCK_EXCLUDES[@]}"

# --- Binary pass -------------------------------------------------------------
# git grep -I skipped these entirely. Every tracked file that is NOT text gets
# its printable strings scanned instead, and the count goes in the summary so
# nobody reads a green line as a claim about files nobody looked at.
git ls-files | sort > "$HUB_SCRATCH/all-files"
hub_git_grep -I -l -e '' -- .
printf '%s\n' "$HUB_SCAN_OUT" | sort > "$HUB_SCRATCH/text-files"
comm -23 "$HUB_SCRATCH/all-files" "$HUB_SCRATCH/text-files" > "$HUB_SCRATCH/binaries"

binary_count=0
binary_pattern="$HUB_HOMEPATH"
[ -n "$HUB_DENYLIST" ] && binary_pattern="${HUB_DENYLIST}|${HUB_HOMEPATH}"
while IFS= read -r blob; do
  [ -z "$blob" ] && continue
  [ -f "$blob" ] || continue
  # An empty tracked file has no text to match and is not binary. Skip it so the
  # reported count means what it says.
  [ -s "$blob" ] || continue
  binary_count=$((binary_count + 1))
  hub_printable < "$blob" > "$HUB_SCRATCH/blob.txt" || true
  hub_scan "$HUB_SCRATCH/blob.txt" -iE "$binary_pattern"
  if [ -n "$HUB_SCAN_OUT" ]; then
    report="${report}
== denylisted content inside binary file ${blob} ==
$(printf '%s\n' "$HUB_SCAN_OUT" | head -20)
"
    hits=1
  fi
done < "$HUB_SCRATCH/binaries"

if [ "$hits" -ne 0 ]; then
  echo "CONTENT AUDIT FAILED. The tracked tree contains:"
  printf '%s\n' "$report"
  echo "Remove the matches above before publishing."
  exit 1
fi
echo "Content audit clean: $summary in the tracked tree."
echo "  ($binary_count binary file(s) also scanned through their printable strings.)"
exit 0
