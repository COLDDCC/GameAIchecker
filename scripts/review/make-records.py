"""Write canonical game records for one batch and wire them into the site.

Usage: python3 make-records.py <batch.json>
batch.json: {"date": "...", "games": [{"appId": ..., "discussion": {...}, "press": "...", "oldName": "..."}]}
Store-page facts come from reviews.jsonl (keyed by appId).
"""
import json, re, sys, unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRATCH = Path(__file__).parent
AREAS = ['ingame', 'code', 'art', 'music', 'voice', 'writing', 'translation', 'marketing']

def slugify(v):
    v = unicodedata.normalize('NFKD', str(v))
    v = re.sub(r'[̀-ͯ]', '', v).lower()
    v = re.sub(r'[^a-z0-9]+', '-', v).strip('-')[:64]
    return v or 'game'

reviews = {}
for line in (SCRATCH / 'store-facts.jsonl').read_text().splitlines():
    if line.strip():
        r = json.loads(line)
        reviews[r['appId']] = r

batch = json.loads(Path(sys.argv[1]).read_text())
date = batch['date']
slugs, ids = [], []

for item in batch['games']:
    app = str(item['appId'])
    r = reviews[app]
    store = f'https://store.steampowered.com/app/{app}/'
    disc = item['discussion']
    sources = []
    kind = r.get('ai')
    if kind == 'official':
        sources.append({'type': 'official_disclosure', 'url': store, 'label': 'Steam 开发者生成式 AI 使用披露', 'date': date,
                        'excerpt': f"Steam 商店页 AI 生成内容披露栏，{date} 核查。" + (('；'.join(r['notes'][k].rstrip('。') for k in r['notes']) + '。') if r['notes'] else '披露未指明具体素材类别。')})
    else:
        excerpt = f"Steam 商店页（{r['dev']} 开发、{r['pub']} 发行，{r['release']}）没有 AI 生成内容披露栏。"
        if kind == 'human_claim':
            excerpt += r['humanClaim']
        sources.append({'type': 'steam_store', 'url': store, 'label': 'Steam 商店页：AI 生成内容披露栏核查', 'date': date, 'excerpt': excerpt})
    sources.append({'type': 'steam_page', 'url': f'https://steamcommunity.com/app/{app}/discussions/',
                    'label': disc['label'], 'date': date, 'excerpt': disc['excerpt']})
    for extra in item.get('extraSources', []):
        sources.append({**extra, 'date': extra.get('date', date)})

    rec = {'appId': app, 'name': r['name']}
    if kind == 'official':
        used = [k for k, v in r['areas'].items() if v == 'used']
        rec.update(category='official_ai_disclosure', verification='steam_developer_self_disclosure',
                   summary=f"{r['desc']} Steam 开发者披露：{'；'.join(r['notes'][k].rstrip('。').removeprefix('开发者披露') for k in used)}。其他领域未被披露提及。",
                   aiUsageCategories=used,
                   aiAreas={k: r['areas'].get(k, 'not_stated') for k in AREAS},
                   aiAreaNotes=r['notes'],
                   aiAreaSources={k: 'official' for k in used},
                   disclosureQuote=r['quote'],
                   disclosureQuoteNote=f'Steam 商店页 AI 生成内容披露栏原文（首句），{date} 核查；可能随商店页更新。')
        note = '结论来源于 Steam 开发者自述披露，不是独立技术审计。披露未提及的领域标为“未提及”，不代表确认未使用。'
    else:
        none_note = 'Steam 商店页没有 AI 生成内容披露，也未检索到开发者声明；未披露不等于确认未使用。'
        rec.update(category='no_verified_genai_evidence', verification='reviewed_no_substantiated_genai_claim',
                   summary=f"{r['desc']} 本次核查未发现生成式 AI 使用证据：Steam 商店页无 AI 生成内容披露，讨论区与公开报道中也未见可核实的相关声明。",
                   aiUsageCategories=[], aiAreas={k: 'not_stated' for k in AREAS},
                   aiAreaNotes={k: none_note for k in AREAS}, aiAreaSources={})
        if kind == 'human_claim':
            rec['summary'] = f"{r['desc']} Steam 商店页无 AI 生成内容披露栏；简介中开发者自称全部素材为人工制作（自述，未经独立审计）。"
        note = ('本次核查了 Steam 商店页 AI 生成内容披露栏、Steam 社区讨论区和公开网络报道，均未发现可核实的生成式 AI 使用证据或开发者声明。'
                'Steam 要求开发者披露预生成 AI 内容，因此未披露是一个弱信号，但不是“零 AI”证明；八个领域均标为“未提及”。')
    if r.get('demo'):
        note += f" 本页对应正式版 App ID {app}；试玩版另有 App ID {r['demo']}，不混用结论。"
    if item.get('press'):
        note += ' ' + item['press']
    # Optional per-area overrides: {"art": ["claimed_none", "note"]}
    for k, (state, note_text) in item.get('areas', {}).items():
        rec['aiAreas'][k] = state
        rec['aiAreaNotes'][k] = note_text
        rec.setdefault('aiAreaSources', {})[k] = 'developer_statement'
    for k in ('summary', 'disclosureQuote', 'disclosureQuoteNote', 'category', 'verification'):
        if item.get(k): rec[k] = item[k]
    for k, v in item.get('fields', {}).items():
        rec[k] = v
    if item.get('reviewNote'):
        note = item['reviewNote']
    if item.get('noteReplace'):
        note = note.replace(*item['noteReplace'])
    rec.update(steamUrl=store, genres=r['genres'], sources=sources, reviewNote=note,
               developer=r['dev'], publisher=r['pub'], steamReleaseDate=r['release'], reviewedAt=date)
    (REPO / 'data' / 'games' / f'{app}.json').write_text(json.dumps(rec, ensure_ascii=False, indent=2) + '\n')
    slugs.append(f'{app}-{slugify(r["name"])}')
    ids.append(app)

    # Attach the App ID to list entries so they merge instead of producing an empty duplicate page.
    old = item.get('oldName', r['name'])
    for fname, key in [('next-fest-100.json', 'games'), ('next-fest-october-2026.json', 'games')]:
        p = REPO / 'data' / fname
        d = json.loads(p.read_text())
        for g in d[key]:
            if g.get('name') == old and not g.get('steamAppId'):
                g['steamAppId'] = int(app)
                g['steamVerificationUrl'] = store
                g['steamIdVerifiedAt'] = date
                if fname == 'next-fest-100.json':
                    g['note'] = 'Event listing; Steam App ID verified. AI review recorded in data/games.'
        p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n')

# Register the batch with the audit/export lists and the compact detail refresh.
for script in ['scripts/audit-reviewed-games.mjs', 'scripts/export-reviewed-games.mjs']:
    p = REPO / script
    s = p.read_text()
    m = re.search(r"const ids = \[(.*?)\];", s, re.S)
    existing = re.findall(r"'(\d+)'", m.group(1))
    add = [i for i in ids if i not in existing]
    if add:
        new = m.group(1).rstrip() + ', ' + ', '.join(f"'{i}'" for i in add)
        s = s[:m.start(1)] + new + s[m.end(1):]
        p.write_text(s)
p = REPO / 'scripts/localize-game-media.mjs'
s = p.read_text()
for pat in [r"(\['1222140'.*?)(\])", r"(requiredIds = new Set\(\[.*?)(\])"]:
    m = re.search(pat, s, re.S)
    have = set(re.findall(r"'(\d+)'", m.group(1)))
    add = [i for i in ids if i not in have]
    if add:
        s = s[:m.end(1)] + ''.join(f", '{i}'" for i in add) + s[m.end(1):]
p.write_text(s)
p = REPO / 'scripts/persist-media-ids.txt'
have = set(p.read_text().split()) if p.exists() else set()
with p.open('a') as f:
    for i in ids:
        if i not in have:
            f.write(i + '\n')
for tpl in ['src/pages/games/[slug].astro']:
    p = REPO / tpl
    s = p.read_text()
    marker = '"4544110-project-vanguard"'
    add = [x for x in slugs if f'"{x}"' not in s]
    if add:
        s = s.replace(marker, marker + ',\n  // Next Fest / player-report pages reviewed in later batches\n  ' + ','.join(f'"{x}"' for x in add), 1) if '// Next Fest / player-report' not in s else \
            s.replace('// Next Fest / player-report pages reviewed in later batches\n  ', '// Next Fest / player-report pages reviewed in later batches\n  ' + ','.join(f'"{x}"' for x in add) + ',', 1)
        p.write_text(s)
print('\n'.join(slugs))
