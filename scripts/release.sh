#!/usr/bin/env bash
set -euo pipefail

# ─── Release script for @buildd/memory ───
# Usage:
#   bash scripts/release.sh            # auto-detect bump, create release PR
#   bash scripts/release.sh --hotfix   # patch bump from current branch → main
#   bash scripts/release.sh --cleanup  # delete stale merged branches

MAIN_BRANCH="main"
DEV_BRANCH="dev"

# ─── Helpers ──────────────────────────────────────────────────────────────────

die()  { echo "ERROR: $*" >&2; exit 1; }
info() { echo "── $*"; }

current_version() {
  grep -oP '"version":\s*"\K[0-9]+\.[0-9]+\.[0-9]+' package.json
}

bump_version() {
  local cur="$1" part="$2"
  IFS='.' read -r major minor patch <<< "$cur"
  case "$part" in
    major) echo "$((major + 1)).0.0" ;;
    minor) echo "$major.$((minor + 1)).0" ;;
    patch) echo "$major.$minor.$((patch + 1))" ;;
    *)     die "Unknown bump type: $part" ;;
  esac
}

detect_bump() {
  local range="$1"
  local logs
  logs=$(git log "$range" --pretty=format:"%s" 2>/dev/null || true)

  if echo "$logs" | grep -qiE 'BREAKING[ _-]CHANGE'; then
    echo "major"
  elif echo "$logs" | grep -qE '^feat(\(.*\))?!?:'; then
    echo "minor"
  else
    echo "patch"
  fi
}

# ─── Cleanup mode ────────────────────────────────────────────────────────────

cleanup_branches() {
  info "Fetching and pruning remotes…"
  git fetch --prune

  info "Deleting local branches already merged into $MAIN_BRANCH…"
  git branch --merged "$MAIN_BRANCH" \
    | grep -vE "^\*|${MAIN_BRANCH}|${DEV_BRANCH}" \
    | xargs -r git branch -d

  info "Deleting remote branches already merged into $MAIN_BRANCH…"
  git branch -r --merged "origin/$MAIN_BRANCH" \
    | grep -v "origin/$MAIN_BRANCH" \
    | grep -v "origin/$DEV_BRANCH" \
    | sed 's|origin/||' \
    | xargs -r -I{} git push origin --delete {}

  info "Done."
  exit 0
}

# ─── Hotfix mode ─────────────────────────────────────────────────────────────

hotfix() {
  local branch
  branch=$(git branch --show-current)
  [[ "$branch" == "$MAIN_BRANCH" ]] && die "Cannot hotfix from $MAIN_BRANCH"
  [[ "$branch" == "$DEV_BRANCH" ]]  && die "Cannot hotfix from $DEV_BRANCH"

  local cur next
  cur=$(current_version)
  next=$(bump_version "$cur" "patch")

  info "Hotfix: $cur → $next"

  # Bump version in package.json
  sed -i "s/\"version\": \"$cur\"/\"version\": \"$next\"/" package.json
  git add package.json
  git commit -m "chore: bump version to $next"
  git push

  # Create PR to main
  gh pr create \
    --base "$MAIN_BRANCH" \
    --title "Release v$next" \
    --body "Hotfix release v$next from \`$branch\`." \
    || info "PR already exists — updating title"

  # Update existing PR title if needed
  local pr_number
  pr_number=$(gh pr list --base "$MAIN_BRANCH" --head "$branch" --json number -q '.[0].number' 2>/dev/null || true)
  if [ -n "$pr_number" ]; then
    gh pr edit "$pr_number" --title "Release v$next"
  fi

  info "Done. Merge the PR to trigger release-tag workflow."
  exit 0
}

# ─── Normal release ──────────────────────────────────────────────────────────

release() {
  # Ensure we're on dev and up to date
  local branch
  branch=$(git branch --show-current)
  [[ "$branch" != "$DEV_BRANCH" ]] && die "Switch to $DEV_BRANCH first (currently on $branch)"

  git fetch origin
  git pull --ff-only origin "$DEV_BRANCH"

  # Detect bump type from commits since last tag or main
  local base
  base=$(git merge-base origin/"$MAIN_BRANCH" HEAD)
  local bump
  bump=$(detect_bump "$base..HEAD")

  local cur next
  cur=$(current_version)
  next=$(bump_version "$cur" "$bump")

  info "Release: $cur → $next ($bump bump)"

  # Bump version in package.json
  sed -i "s/\"version\": \"$cur\"/\"version\": \"$next\"/" package.json
  git add package.json
  git commit -m "chore: bump version to $next"
  git push origin "$DEV_BRANCH"

  # Create or update PR
  local pr_number
  pr_number=$(gh pr list --base "$MAIN_BRANCH" --head "$DEV_BRANCH" --json number -q '.[0].number' 2>/dev/null || true)

  if [ -n "$pr_number" ]; then
    info "Updating existing PR #$pr_number"
    gh pr edit "$pr_number" --title "Release v$next"
  else
    info "Creating release PR"
    gh pr create \
      --base "$MAIN_BRANCH" \
      --head "$DEV_BRANCH" \
      --title "Release v$next" \
      --body "Release v$next"
  fi

  info "Done. Merge the PR to trigger release-tag workflow."
}

# ─── Entry point ─────────────────────────────────────────────────────────────

case "${1:-}" in
  --cleanup) cleanup_branches ;;
  --hotfix)  hotfix ;;
  *)         release ;;
esac
