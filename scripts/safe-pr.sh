#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${BASE_BRANCH:-main}"
APP_DIR="${APP_DIR:-app}"

usage() {
  cat <<'USAGE'
Usage:
  scripts/safe-pr.sh "commit message" ["PR title"] ["PR body"]

Behavior:
  - creates a branch automatically when run on main
  - stages all non-ignored changes
  - blocks staged env/key files and common secret patterns
  - runs npm --prefix app run test:all
  - commits, pushes, and opens a GitHub PR with gh
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

COMMIT_MESSAGE="${1:-}"
PR_TITLE="${2:-$COMMIT_MESSAGE}"
PR_BODY="${3:-Automated PR created by scripts/safe-pr.sh.}"

if [[ -z "$COMMIT_MESSAGE" ]]; then
  usage >&2
  exit 2
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "safe-pr: this directory is not inside a git repository." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "safe-pr: GitHub CLI is required. Install gh, then run gh auth login --git-protocol https --web." >&2
  exit 1
fi

gh auth status >/dev/null

current_branch="$(git branch --show-current)"
if [[ -z "$current_branch" ]]; then
  echo "safe-pr: detached HEAD is not supported." >&2
  exit 1
fi

slug="$(printf '%s' "$COMMIT_MESSAGE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' | cut -c1-48)"
if [[ -z "$slug" ]]; then
  slug="update"
fi

if [[ "$current_branch" == "$BASE_BRANCH" ]]; then
  new_branch="codex/$(date +%Y%m%d-%H%M%S)-$slug"
  git switch -c "$new_branch"
  current_branch="$new_branch"
fi

git add -A

if git diff --cached --quiet; then
  echo "safe-pr: no staged changes to commit." >&2
  exit 1
fi

echo "safe-pr: staged changes"
git diff --cached --stat

if git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.p8$|\.p12$|\.pfx$|(^|/)(secrets|credentials)\.' >/dev/null; then
  echo "safe-pr: refusing to commit staged env, key, secret, or credential files." >&2
  git diff --cached --name-only | grep -E '(^|/)\.env($|\.)|\.pem$|\.key$|\.p8$|\.p12$|\.pfx$|(^|/)(secrets|credentials)\.' >&2
  exit 1
fi

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks protect --staged --redact --verbose
else
  found_secret=0
  for pattern in \
    'sk-[A-Za-z0-9_-]{20,}' \
    'ghp_[A-Za-z0-9_]{30,}' \
    'github_pat_[A-Za-z0-9_]{80,}' \
    'AKIA[0-9A-Z]{16}' \
    '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  do
    if git grep -I -n -E "$pattern" --cached -- . ':(exclude)scripts/safe-pr.sh' >/dev/null; then
      git grep -I -n -E "$pattern" --cached -- . ':(exclude)scripts/safe-pr.sh' >&2
      found_secret=1
    fi
  done

  if [[ "$found_secret" == "1" ]]; then
    echo "safe-pr: refusing to commit staged content with likely secrets." >&2
    exit 1
  fi
fi

git diff --cached --check
npm --prefix "$APP_DIR" run test:all

git commit -m "$COMMIT_MESSAGE"
git push -u origin "$current_branch"
gh pr create --base "$BASE_BRANCH" --head "$current_branch" --title "$PR_TITLE" --body "$PR_BODY"
