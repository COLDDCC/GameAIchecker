"""Fold a name-keyed legacy record into the new <appId>.json review, then delete it."""
import json, re, sys
from pathlib import Path
REPO = Path(__file__).resolve().parents[2]
def key(url):
    m = re.match(r'https://store\.steampowered\.com/app/(\d+)', url or '')
    return f'steam:{m.group(1)}' if m else (url or '').rstrip('/')
for name in sys.argv[1:]:
    old_p = REPO / 'data' / 'games' / f'{name}.json'
    old = json.loads(old_p.read_text())
    new_p = REPO / 'data' / 'games' / f"{old['appId']}.json"
    new = json.loads(new_p.read_text())
    have = {key(s.get('url')) for s in new['sources']}
    moved = []
    for s in old.get('sources', []):
        if key(s.get('url')) not in have:
            new['sources'].append(s); have.add(key(s.get('url'))); moved.append(s.get('url'))
    extras = [k for k in ('tags', 'features', 'languages', 'website', 'links', 'originalReleaseYear') if old.get(k) and not new.get(k)]
    for k in extras: new[k] = old[k]
    kept = []
    for k, note in (old.get('aiAreaNotes') or {}).items():
        # keep an explanatory note only where both records reach the same area state
        if note and not (new.get('aiAreaNotes') or {}).get(k) and (old.get('aiAreas') or {}).get(k) == (new.get('aiAreas') or {}).get(k):
            new.setdefault('aiAreaNotes', {})[k] = note; kept.append(k)
    if kept: print(f'  notes kept for {kept}')
    new_p.write_text(json.dumps(new, ensure_ascii=False, indent=2) + '\n')
    old_p.unlink()
    print(f'{name} -> {new_p.name}: sources moved {moved}; fields {extras}')
