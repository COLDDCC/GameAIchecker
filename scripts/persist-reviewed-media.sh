#!/usr/bin/env bash
# Fail the workflow unless every requested gallery is complete and committed.
set -euo pipefail
mapfile -t ids < <(sed -n '/^[0-9][0-9]*$/p' scripts/persist-media-ids.txt | sort -u)
missing=()
for id in "${ids[@]}"; do
  if ! python3 scripts/review/intake.py media-check --app "$id" --tracked --allow-legacy-gallery >/dev/null 2>&1; then missing+=("$id"); fi
done
[ "${#missing[@]}" -gt 0 ] || exit 0
node scripts/fetch-steam-metadata.mjs
node scripts/fetch-steam-images.mjs
for id in "${missing[@]}"; do
  node scripts/localize-game-media.mjs "$id"
  python3 scripts/review/intake.py media-check --app "$id"
  git add -f "public/images/steam/apps/$id/gallery.json" "public/images/steam/apps/$id/"*.webp "data/steam/$id.json"
done
if ! git diff --cached --quiet; then
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  git commit -m "chore(media): persist Steam media for reviewed games ${missing[*]}"
  git pull --rebase origin main
  git push origin HEAD:main
fi
for id in "${missing[@]}"; do python3 scripts/review/intake.py media-check --app "$id" --tracked; done
