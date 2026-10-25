#!/usr/bin/env bash
# Ship one reviewed batch: records -> push data+media IDs -> wait for media commit
# -> push audit lists + redirects -> wait for production deploy.
# Usage: ship.sh <batch.json> "<commit title>" "<commit body>"
set -euo pipefail
S=$(cd "$(dirname "$0")" && pwd); B=$1; TITLE=$2; BODY=$3
R=$(git -C "$S" rev-parse --show-toplevel); cd "$R"
TRAILER=${COMMIT_TRAILER:-}  # optional attribution lines appended to commit messages
repo=COLDDCC/GameAIchecker

wait_runs() { # sha, needs persist?(1/0)
  local sha=$1 want=$2 r
  sleep 40
  for i in $(seq 1 45); do
    r=$(gh api "repos/$repo/actions/runs?head_sha=$sha" --jq '[.workflow_runs[]|.name+":"+.status+"/"+(.conclusion//"")]|join(", ")')
    if [ -n "$r" ] && ! echo "$r" | grep -qE "in_progress|queued|waiting"; then
      [ "$want" = 0 ] || echo "$r" | grep -q "Persist media" && break
    fi
    sleep 20
  done
  echo "  actions: $r"
}
wait_cf() { # sha -> production (no branch preview) deployment conclusion
  local sha=$1 r
  for i in $(seq 1 45); do
    r=$(gh api "repos/$repo/commits/$sha/check-runs?filter=all" --jq '[.check_runs[]|select(.name=="Cloudflare Pages" and .conclusion!=null and (.output.summary|contains("Branch Preview")|not))|.conclusion]|first // ""')
    [ -n "$r" ] && break; sleep 20
  done
  echo "  cloudflare production: ${r:-unknown}"
  [ "$r" = success ]
}

git fetch -q origin main && git rebase -q origin/main
python3 "$S/make-records.py" "$B" > "$S/last-slugs.txt"
[ -n "${FOLD:-}" ] && python3 "$S/fold-legacy.py" $FOLD
# EXTRA_IDS: already-reviewed games to register for media persistence + audit (no content change).
if [ -n "${EXTRA_IDS:-}" ]; then python3 - $EXTRA_IDS <<'PYEOF'
import re, sys
from pathlib import Path
ids = sys.argv[1:]
p = Path('scripts/persist-media-ids.txt'); have = set(p.read_text().split())
with p.open('a') as f:
    for i in ids:
        if i not in have: f.write(i + '\n')
for script, pats in [('scripts/audit-reviewed-games.mjs', [r"(const ids = \[.*?)(\];)"]),
                     ('scripts/export-reviewed-games.mjs', [r"(const ids = \[.*?)(\];)"]),
                     ('scripts/localize-game-media.mjs', [r"(\['1222140'.*?)(\])", r"(requiredIds = new Set\(\[.*?)(\])"])]:
    q = Path(script); s = q.read_text()
    for pat in pats:
        m = re.search(pat, s, re.S); have = set(re.findall(r"'(\d+)'", m.group(1)))
        add = [i for i in ids if i not in have]
        if add: s = s[:m.end(1)] + ''.join(f", '{i}'" for i in add) + s[m.end(1):]
    q.write_text(s)
print('  extra ids registered:', ids)
PYEOF
fi
cat "$S/last-slugs.txt"
node scripts/build-game-index.mjs >/dev/null

# Redirect the old shell URLs (same convention as earlier batches).
python3 - "$B" <<'EOF'
import json, re, sys, unicodedata
from pathlib import Path
def slug(v):
    v = unicodedata.normalize('NFKD', v); v = re.sub(r'[̀-ͯ]', '', v).lower()
    return re.sub(r'[^a-z0-9]+', '-', v).strip('-')[:64] or 'game'
batch = json.load(open(sys.argv[1]))
p = Path('public/_redirects'); s = p.read_text(); add = []
for g in batch['games']:
    if g.get('legacy'): continue  # already had a real /games/<appid>-<name>/ URL
    d = json.load(open(f"data/games/{g['appId']}.json"))
    old = 'unverified-' + slug(g.get('oldName', d['name'])); new = f"{g['appId']}-{slug(d['name'])}"
    for pre in ['/games/', '/games/en/', '/games/zh-cn/']:
        line = f"{pre}{old}/ {pre}{new}/ 301"
        if line not in s: add.append(line)
if add: p.write_text(s.rstrip('\n') + '\n' + '\n'.join(add) + '\n')
print(f"  {len(add)} redirects added")
EOF

# Step 1: data + media list (build does not require these galleries yet).
git add data scripts/persist-media-ids.txt public/_redirects
git commit -q -m "$TITLE" -m "$BODY" -m "$TRAILER"
git stash -q
git push -q origin HEAD:main 2>&1 | grep -v '^remote' || true
sha=$(git rev-parse HEAD); echo "step1 $sha"
wait_runs "$sha" 1
git fetch -q origin main && git rebase -q origin/main && git stash pop -q
git log --oneline -1 origin/main

# Step 2: require the now-committed galleries in the audit.
git add scripts src
git commit -q -m "Require local media for the newly reviewed batch in the build audit" \
  -m "Galleries for these games are now committed by the media workflow; add them to the audit, export and localize lists and the compact detail refresh." -m "$TRAILER"
git push -q origin HEAD:main 2>&1 | grep -v '^remote' || true
sha=$(git rev-parse HEAD); echo "step2 $sha"
wait_runs "$sha" 0
wait_cf "$sha"
git fetch -q origin
