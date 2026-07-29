#!/usr/bin/env bash
#
# gate-lib.sh: the shared machinery behind every content gate in this repo.
# Sourced by .githooks/pre-commit and .githooks/content-audit.sh so the two
# never drift. It is not executable on its own.
#
# ONE IDEA RUNS THROUGH ALL OF IT: A GATE THAT CANNOT CHECK MUST REFUSE.
#
# Three ways a shell gate silently passes everything while looking green, all
# three of which were found in this repo by review and all three of which are
# closed here:
#
#   1. A malformed pattern. grep exits 2 on a bad regex, and `|| true` swallows
#      both the error and the exit code. One unbalanced paren in a company name
#      in your denylist and the ENTIRE gate stops checking, with no output. So
#      the joined pattern is compiled once up front and a compile failure is
#      fatal, and every scan distinguishes rc 0 (hits) from rc 1 (clean) from
#      rc >= 2 (the scanner itself broke).
#
#   2. CRLF. denylist.local is untracked by design, so .gitattributes cannot
#      pin its line endings, and a Windows editor writes CRLF. Every term then
#      carries a trailing carriage return, matches nothing, and the non-empty
#      check still passes. So carriage returns are stripped on read.
#
#   3. No proof. A gate nobody tests is a gate nobody knows is working. Every
#      plain-literal term in the list is fed back through the assembled pattern
#      and must match itself, on every single run.
#
# Note on shell mechanics: these functions set globals instead of echoing,
# because a function called inside $(...) or on the right of a pipe runs in a
# SUBSHELL, where `exit` kills only that subshell. Fail-closed has to be able to
# stop the whole script, so the fatal paths must run in the parent shell.

# The scratch directory every scan writes through. The caller sets it up.
hub_scratch_init() {
  HUB_SCRATCH="$(mktemp -d)"
  trap 'rm -rf "$HUB_SCRATCH"' EXIT
}

# Fatal: print why the gate is refusing, and stop. Never called from a subshell.
hub_gate_error() {
  echo ""
  echo "GATE ERROR: $1"
  echo "Refusing. A scanner that cannot run must never report clean."
  exit 1
}

# hub_load_denylist <file> [label]
#
# Reads the denylist into HUB_DENYLIST as one joined extended-regex pattern.
# Returns non-zero (with a printed reason) rather than ever handing back an
# empty, malformed, or unproven pattern.
hub_load_denylist() {
  local file="$1"
  local label="${2:-BLOCKED}"
  local raw literals line rc

  # tr -d '\r' comes FIRST, before the comment and blank filtering and before
  # the join. See reason 2 in the header: this one call is what stands between a
  # Windows user and a gate that blocks nothing.
  raw="$(tr -d '\r' < "$file" | grep -v '^[[:space:]]*#' | grep -v '^[[:space:]]*$' || true)"
  if [ -z "$raw" ]; then
    echo "$label: $file has no terms in it."
    echo "A gate with nothing to check passes everything. Fill it in."
    return 1
  fi

  HUB_DENYLIST="$(printf '%s\n' "$raw" | paste -sd'|' -)"

  # Compile check. grep exits >= 2 on a malformed pattern, so an empty input is
  # enough to find out whether the joined list is even usable.
  rc=0
  printf '' | grep -qE "$HUB_DENYLIST" >/dev/null 2>&1 || rc=$?
  if [ "$rc" -gt 1 ]; then
    echo "$label: $file is not a valid extended regex, so the gate cannot run."
    echo "ONE bad line disables the WHOLE list. Look for an unbalanced ( [ or {"
    echo "in a company or product name, and escape it."
    printf '%s\n' "$raw" | while IFS= read -r line; do
      local inner=0
      printf '' | grep -qE "$line" >/dev/null 2>&1 || inner=$?
      if [ "$inner" -gt 1 ]; then echo "  bad pattern: $line"; fi
    done
    return 1
  fi

  # Self test. Every term made only of ordinary characters is a literal, so it
  # must match itself through the assembled pattern. This is what catches a CRLF
  # file, a mangled paste, or a join that went wrong: the gate proves itself on
  # every run instead of assuming.
  literals="$(printf '%s\n' "$raw" | grep -E '^[A-Za-z0-9/._ @&-]+$' || true)"
  if [ -n "$literals" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      if ! printf '%s\n' "$line" | grep -qiE "$HUB_DENYLIST"; then
        echo "$label: the denylist does not match its own term \"$line\"."
        echo "The gate is NOT working. Check $file for stray characters."
        return 1
      fi
    done <<< "$literals"
  fi

  # A placeholder is not a denylist. install.sh copies the example so a fresh
  # clone has something, and says out loud that it protects nothing. This is the
  # mechanical half of that warning: an untouched copy cannot pose as armed.
  if grep -q '<your-username>' "$file" 2>/dev/null; then
    echo "$label: $file is still the unedited example."
    echo "It passes every check while protecting nothing. Replace the"
    echo "<your-username> placeholders with your real home paths and terms."
    return 1
  fi

  return 0
}

# hub_scan <input-file> <grep args...>
#
# One fail-closed grep. Sets HUB_SCAN_OUT to the matching lines. rc 1 (no match)
# is clean; rc >= 2 means grep itself failed and that is fatal.
# MUST be called from the parent shell, never inside $(...) or a pipeline.
hub_scan() {
  local input="$1"
  shift
  local rc=0
  grep "$@" "$input" > "$HUB_SCRATCH/scan.out" 2> "$HUB_SCRATCH/scan.err" || rc=$?
  if [ "$rc" -gt 1 ]; then
    hub_gate_error "grep exited $rc scanning $(basename "$input"): $(cat "$HUB_SCRATCH/scan.err")"
  fi
  HUB_SCAN_OUT="$(cat "$HUB_SCRATCH/scan.out")"
}

# hub_git_grep <grep args...>
#
# The same contract over the tracked tree. git grep exits >= 2 on a bad pattern
# or a broken repo, and that is fatal for the same reason.
# MUST be called from the parent shell.
hub_git_grep() {
  local rc=0
  git grep "$@" > "$HUB_SCRATCH/scan.out" 2> "$HUB_SCRATCH/scan.err" || rc=$?
  if [ "$rc" -gt 1 ]; then
    hub_gate_error "git grep exited $rc: $(cat "$HUB_SCRATCH/scan.err")"
  fi
  HUB_SCAN_OUT="$(cat "$HUB_SCRATCH/scan.out")"
}

# Turn a binary blob into greppable text. `strings` is not guaranteed to be
# installed, so tr is the fallback. Binaries are invisible to grep -I, which is
# how a screenshot with metadata or a stray database reaches a public repo while
# every gate reports clean.
hub_printable() {
  if command -v strings >/dev/null 2>&1; then
    strings -n 4
  else
    LC_ALL=C tr -cs '[:print:]' '\n'
  fi
}

# ------------------------------------------------------------------ patterns
#
# The generic rules. They are DEFINED HERE, once, because the per-commit hook
# and the whole-tree audit have to agree: a rule that only the release check
# enforces protects nothing until release day, which is exactly when it is too
# late.

HUB_EMAIL='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'

# Home paths on all three platforms. macOS-only was a hole in a repo that calls
# Windows users first class.
HUB_HOMEPATH='/Users/[A-Za-z0-9._-]+|/home/[A-Za-z0-9._-]+|[A-Za-z]:[\\/]+Users[\\/]+[A-Za-z0-9._-]+'

# Reserved documentation domains (RFC 2606 / 6761): a stand-in in a doc, not a
# real address. Also the placeholder shapes the example denylist ships with.
HUB_EXAMPLE_DOMAINS='@(example|test|invalid|localhost)\.(com|org|net)|@example$|<your-username>|<your-'
