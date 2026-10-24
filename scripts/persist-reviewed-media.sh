#!/usr/bin/env bash
# Download Steam metadata + local gallery for reviewed games whose media is not in Git,
# then commit what succeeded. Safe to re-run: games already committed are skipped.
set -uo pipefail

# One Steam App ID per line; append each newly reviewed batch.
ids=$(grep -Eo '^[0-9]+' scripts/persist-media-ids.txt | sort -u)

missing=()
for id in $ids; do
  if ! git ls-files --error-unmatch "public/images/steam/apps/$id/gallery.json" >/dev/null 2>&1; then
    missing+=("$id")
  fi
done
echo "Reviewed games without committed media: ${missing[*]:-none}"
[ ${#missing[@]} -eq 0 ] && exit 0

# Metadata failures are recorded as {unavailable: true}; retry those with backoff.
for attempt in 1 2 3; do
  node scripts/fetch-steam-metadata.mjs
  pending=0
  for id in "${missing[@]}"; do
    grep -q '"unavailable": true' "data/steam/$id.json" 2>/dev/null && { rm -f "data/steam/$id.json"; pending=1; }
  done
  [ $pending -eq 0 ] && break
  sleep $((attempt * 30))
done
node scripts/fetch-steam-images.mjs || true

saved=()
for id in "${missing[@]}"; do
  for attempt in 1 2 3; do
    if node scripts/localize-game-media.mjs "$id"; then break; fi
    sleep $((attempt * 15))
  done
  if node -e "const g=require('./public/images/steam/apps/$id/gallery.json'); process.exit(g.images && g.images.length ? 0 : 1)" 2>/dev/null; then
    git add -f "public/images/steam/apps/$id/gallery.json" "public/images/steam/apps/$id/"*.webp
    [ -f "data/steam/$id.json" ] && ! grep -q '"unavailable": true' "data/steam/$id.json" && git add -f "data/steam/$id.json"
    saved+=("$id")
  else
    echo "::warning::$id: gallery could not be generated; re-run this workflow later."
  fi
done

if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "chore(media): persist Steam media for reviewed games ${saved[*]}"
for attempt in 1 2 3; do
  git pull --rebase origin main && git push && exit 0
  sleep 10
done
exit 1
