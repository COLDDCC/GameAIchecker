#!/usr/bin/env python3
"""Incremental intake: stdlib only; private evidence never lives under data/."""
import argparse, contextlib, hashlib, json, os, re, socket, subprocess, sys, tempfile, time, unicodedata
from pathlib import Path
try:
    import fcntl
except ImportError:  # Windows: msvcrt gives the same non-blocking advisory lock
    fcntl = None
ROOT = Path(os.environ.get('INTAKE_ROOT', Path(__file__).resolve().parents[2]))
STATE = ROOT/'scripts/review/state'
CACHE = ROOT/'.cache/gameaichecker-review'
AREAS = 'ingame code art music voice writing translation marketing'.split()
POLICY = '2026-10-27-demand-en-v2'
def now():
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()
def read(p, default=None):
    return json.loads(p.read_text(encoding='utf-8')) if p.exists() else default
def atomic(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p.parent, prefix='.tmp-')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            f.write(json.dumps(value, ensure_ascii=False, indent=2)+'\n'); f.flush(); os.fsync(f.fileno())
        os.replace(tmp, p)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args): return subprocess.check_output(['git', *args], cwd=ROOT, text=True, encoding='utf-8').strip()
@contextlib.contextmanager
def lock(name='queue'):
    STATE.mkdir(parents=True, exist_ok=True)
    f = (STATE/f'.{name}.lock').open('a+')
    try:
        if fcntl:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        else:
            import msvcrt
            f.seek(0)
            try:
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as ex:
                raise BlockingIOError(ex.errno, 'queue lock held', ex.filename) from ex
    except BaseException:
        f.close()
        raise
    try:
        yield
    finally:
        try:
            if fcntl:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            else:
                import msvcrt
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        finally:
            f.close()

def existing(): return {p.stem: sha(p) for p in (ROOT/'data/games').glob('*.json')}
def excluded():
    ids = set(existing())
    for file, key in [('next-fest-100.json','removedEntries'), ('community-game-submissions.json','removedSubmissions')]:
        for r in read(ROOT/'data'/file, {}).get(key, []):
            if r.get('steamAppId'): ids.add(str(r['steamAppId']))
    return ids

def queue():
    p=STATE/'candidates.jsonl'
    return [json.loads(s) for s in p.read_text(encoding='utf-8').splitlines() if s.strip()] if p.exists() else []
def save_queue(rows):
    # JSONL also uses fsync + atomic replacement.
    p=STATE/'candidates.jsonl'; p.parent.mkdir(parents=True,exist_ok=True)
    fd,tmp=tempfile.mkstemp(dir=p.parent)
    try:
        with os.fdopen(fd,'w', encoding='utf-8') as f:
            for r in rows: f.write(json.dumps(r,ensure_ascii=False)+'\n')
            f.flush(); os.fsync(f.fileno())
        os.replace(tmp,p)
    finally:
        if os.path.exists(tmp): os.unlink(tmp)
def batch_path(b):
    if not re.fullmatch(r'[A-Za-z0-9_-]+',b): raise ValueError('unsafe batch ID')
    return STATE/'batches'/f'{b}.json'
def load_batch(b):
    value=read(batch_path(b))
    if value is None: raise ValueError('batch not found')
    return value
def save_batch(b): atomic(batch_path(b['batchId']),b)
def work(b): return CACHE/b['batchId']
def slug(name):
    return re.sub('[^a-z0-9]+','-',unicodedata.normalize('NFKD',name).encode('ascii','ignore').decode().lower()).strip('-')[:64] or 'game'
def demand_valid(row):
    """A lead or a SERP is not measured search demand. Verify the saved metric row."""
    from datetime import datetime, timezone
    try:
        d=row['demand']; rel=Path(d['evidencePath'])
        if rel.is_absolute() or '..' in rel.parts or rel.parts[:2]!=('.cache','search-demand'): return False
        proof=ROOT/rel
        if not proof.is_file() or sha(proof)!=d['contentHash']: return False
        raw=read(proof)
        if str(raw['appId'])!=str(row['appId']) or raw['query']!=d['query'] or len(raw['query'].strip())<3: return False
        if raw['kind'] not in ('gsc','keyword_tool') or not raw.get('sourceUrl','').startswith('https://'): return False
        if isinstance(raw['value'],bool) or not isinstance(raw['value'],(int,float)) or raw['value']<=0: return False
        if raw['metric']!=('impressions' if raw['kind']=='gsc' else 'monthly_searches'): return False
        age=(datetime.now(timezone.utc)-datetime.fromisoformat(raw['observedAt'].replace('Z','+00:00'))).total_seconds()
        return 0<=age<=90*86400
    except (KeyError,ValueError,TypeError,OSError): return False

def waiver(instruction):
    """Measure demand or record the owner waiving it; an empty instruction is not a waiver."""
    text=str(instruction or '').strip()
    if len(text)<10: raise ValueError('--waive-demand needs the owner instruction verbatim (min 10 characters)')
    return {'authorizedBy':'site_owner','instruction':text,'scope':'This batch only: waive measured search demand; all evidence and English gates remain required.','recordedAt':now()}

def validate_english_decision(en):
    if not isinstance(en,dict): raise ValueError('English editorial fields required')
    fields=[en.get('summary'),en.get('reviewNote')]+[en.get('aiAreaNotes',{}).get(k) for k in AREAS]
    if any(not isinstance(v,str) or len(v.strip())<12 or re.search('[\u3400-\u9fff]',v) for v in fields): raise ValueError('missing or untranslated English editorial fields')

def import_candidates(rows, dry=False):
    with lock():
        q=queue(); have={x['appId'] for x in q}; skip=excluded(); added=[]
        for r in rows:
            app=str(r['appId'])
            if not re.fullmatch('[1-9][0-9]*',app): raise ValueError('invalid App ID')
            if app in skip or r.get('isDemo'): continue
            if app in have:
                old=next(x for x in q+added if x['appId']==app)
                if old['status']=='queued' and demand_valid(r): old['demand']=r['demand']
                continue
            if not r.get('name') or not r.get('sourceUrl'): raise ValueError('candidate missing name/source')
            added.append(dict(appId=app,name=r['name'],sourceUrl=r['sourceUrl'],discoveredAt=r.get('discoveredAt',now()),priority=int(r.get('priority',100)),demand=r.get('demand'),status='queued',batchId=None,reason=None))
            have.add(app)
        if not dry: save_queue(q+added)
        return {'added':len(added),'excluded':len(rows)-len(added)}
def start(count, dry=False, waive=None):
    if not 1<=count<=30: raise ValueError('count must be 1..30')
    override=waiver(waive) if waive else None
    with lock():
        unfinished=[v for v in (read(p) for p in sorted((STATE/'batches').glob('*.json'))) if v and v['phase'] not in ('deployed','cancelled')]
        if unfinished: return {'resume':unfinished[0]['batchId'],'phase':unfinished[0]['phase']}
        q=queue(); skip=excluded()
        choices=sorted([r for r in q if r['status']=='queued' and r['appId'] not in skip and (demand_valid(r) or override)],key=lambda r:(-r['priority'],r['discoveredAt'],int(r['appId'])))[:count]
        if len(choices)<count: raise ValueError(f'queue shortage with verified search demand: {len(choices)}/{count}; attach recent GSC or keyword metrics before review')
        if dry: return {'selected':[r['appId'] for r in choices],'demandWaived':bool(override)}
        bid=time.strftime('%Y%m%dT%H%M%S')+'-'+os.urandom(3).hex()
        b=dict(schemaVersion=1,batchId=bid,requestedCount=count,baseSha=git('rev-parse','HEAD'),policyVersion=POLICY,phase='reserved',createdAt=now(),oldHashes=existing(),games=[],checkResults={},publishShas={},attempts=len(choices),maxAttempts=min(30,3*count))
        if override: b['selectionOverride']=override
        for r in choices:
            r.update(status='reserved',batchId=bid,worker=socket.gethostname(),leaseUntil=time.time()+86400)
            b['games'].append(dict(appId=r['appId'],name=r['name'],identity='pending',store='pending',discussion='pending',press='pending',coverageLimits=[],retries=0))
        # Batch is authoritative; queue reconciliation on resume handles a crash between writes.
        save_batch(b); save_queue(q)
        return {'batchId':bid,'selected':[r['appId'] for r in choices]}
def replace_blocked(b, app):
    with lock():
        if b['phase'] not in ('reserved','collecting','needs_judgment','blocked'): raise ValueError('cannot replace prepared/published batch')
        old=next((g for g in b['games'] if g['appId']==app),None)
        if not old or not old.get('reason'): raise ValueError('candidate must have a recorded blocking reason')
        if b['attempts']>=b['maxAttempts']: raise ValueError('attempt limit reached')
        q=queue();override=b.get('selectionOverride');choices=sorted([r for r in q if r['status']=='queued' and r['appId'] not in excluded() and (demand_valid(r) or override)],key=lambda r:(-r['priority'],r['discoveredAt'],int(r['appId'])))
        if not choices: raise ValueError('queue shortage for replacement')
        r=choices[0];b.setdefault('blockedGames',[]).append(old);b['games'].remove(old)
        b['games'].append(dict(appId=r['appId'],name=r['name'],identity='pending',store='pending',discussion='pending',press='pending',coverageLimits=[],retries=0))
        b['attempts']+=1;b['phase']='reserved';r.update(status='reserved',batchId=b['batchId'],worker=socket.gethostname(),leaseUntil=time.time()+86400)
        for row in q:
            if row['appId']==app:row.update(status='blocked',reason=old['reason'])
        save_batch(b);save_queue(q);return {'replaced':app,'selected':r['appId'],'attempts':b['attempts']}

def verify_old(b):
    current=existing()
    for app,h in b['oldHashes'].items():
        if current.get(app)!=h: raise ValueError('existing record changed: '+app)
def evidence_ok(e, app):
    if str(e.get('appId'))!=app or e.get('readStatus')!='complete' or e.get('httpStatus')!=200: raise ValueError('incomplete evidence '+app)
    for k in ('url','fetchedAt','contentHash','language','locator','quote','sourceType'):
        if k not in e or (k!='quote' and not e[k]): raise ValueError('missing evidence '+k)
    if not e['url'].startswith('https://'): raise ValueError('invalid source URL')
    raw=ROOT/e.get('cachePath','__missing__')
    if not raw.is_file() or sha(raw)!=e['contentHash']: raise ValueError('missing/changed raw evidence cache')
def validate_game(b,g):
    app=g['appId']; p=work(b)/app
    e=read(p/'evidence.json',{})
    d=read(p/'decision.json',{})
    if any(g.get(k)!='complete' for k in ('identity','store','discussion','press')): raise ValueError('coverage incomplete '+app)
    if not e.get('identity',{}).get('verified') or e['identity'].get('appId')!=app or e['identity'].get('name')!=g['name']: raise ValueError('identity mismatch')
    if not e['identity'].get('developer') or e['identity'].get('type')!='game': raise ValueError('missing developer or not full game')
    identity_evidence=e['identity'].get('identityEvidence',{})
    evidence_ok(identity_evidence,app)
    identity_raw=read(ROOT/identity_evidence['cachePath'],{}).get(app,{})
    data=identity_raw.get('data',{})
    if not identity_raw.get('success') or str(data.get('steam_appid'))!=app or data.get('name')!=g['name'] or ', '.join(data.get('developers',[]))!=e['identity']['developer'] or data.get('type')!='game': raise ValueError('identity raw mismatch')
    from collect import parse_store, parse_discussion, parse_thread, Tree
    for source in e.get('sources',[]):
        evidence_ok(source,app)
        raw=(ROOT/source['cachePath']).read_text(encoding='utf-8')
        if source['sourceType']=='store':
            parsed=parse_store(raw,app)
            if parsed['name']!=g['name'] or parsed['quote']!=source['quote'] or parsed['disclosurePresent']!=source.get('disclosurePresent'): raise ValueError('store quote/raw mismatch')
        elif source['sourceType']=='discussion':
            parsed=parse_discussion(raw,app,g['name'])
            for key in ('visibleTopics','totalTopics','topics'):
                if parsed[key]!=e.get('discussion',{}).get(key): raise ValueError('discussion raw mismatch')
        elif source['sourceType']=='thread':
            if parse_thread(raw,source['label'])!=source['quote']: raise ValueError('thread quote/raw mismatch')
        elif source['quote'] and re.sub(r'\s+',' ',source['quote']) not in Tree(raw).root.text(): raise ValueError('source quote/raw mismatch')
    sources={s['id']:s for s in e.get('sources',[])}
    for kind in ('store','discussion'):
        if not any(s['sourceType']==kind for s in sources.values()): raise ValueError('missing '+kind)
    pr=e.get('press',{})
    if not pr.get('query') or not pr.get('searchedAt') or pr.get('status')!='complete' or 'results' not in pr or 'coverageLimits' not in pr: raise ValueError('press search incomplete')
    searchraw=ROOT/pr.get('cachePath','__missing__')
    if not searchraw.is_file() or sha(searchraw)!=pr.get('contentHash'): raise ValueError('press search cache missing')
    if set(pr.get('readUrls',[])) != {r['url'] for r in pr['results'] if r.get('relevant')}: raise ValueError('relevant press unread')
    if not set(pr.get('readUrls',[])) <= {s['url'] for s in sources.values() if s['sourceType'] in ('press','developer','community')}: raise ValueError('press source missing')
    di=e.get('discussion',{})
    if not di.get('pagesScanned') or 'visibleTopics' not in di or 'coverageLimits' not in di: raise ValueError('discussion scope missing')
    for t in di.get('related',[]):
        if t.get('status')!='complete' or t.get('evidenceId') not in sources or not t.get('identityVerified') or not t.get('repliesChecked'): raise ValueError('related discussion unread/mismatch')
    if d.get('identityName')!=g['name'] or d.get('identityDeveloper')!=e['identity']['developer']: raise ValueError('decision identity not confirmed')
    if set(d.get('areas',{}))!=set(AREAS): raise ValueError('eight areas required')
    category=d.get('category')
    if category not in ('official_ai_disclosure','developer_no_genai_statement','no_verified_genai_evidence'): raise ValueError('invalid category')
    official=[s for s in sources.values() if s['sourceType']=='store' and s.get('disclosurePresent')]
    if category=='official_ai_disclosure' and (not official or d.get('disclosureQuote')!=official[0]['quote'] or not d['disclosureQuote']): raise ValueError('official full disclosure missing')
    if official and category!='official_ai_disclosure': raise ValueError('cannot discard official disclosure')
    for k,v in d['areas'].items():
        if v.get('state') not in ('used','claimed_none','none','not_stated','unreviewed'): raise ValueError('invalid area state')
        if v['state'] not in ('not_stated','unreviewed'):
            s=sources.get(v.get('evidenceId'))
            if not s or not v.get('quote') or v['quote'] not in s['quote'] or s['sourceType'] not in ('store','developer'): raise ValueError('unbound area '+k)
            if not v.get('note'): raise ValueError('area note required')
    if category=='developer_no_genai_statement' and not any(v['state']=='claimed_none' for v in d['areas'].values()): raise ValueError('human statement missing')
    if category=='no_verified_genai_evidence' and any(v['state'] not in ('not_stated','unreviewed') for v in d['areas'].values()): raise ValueError('no-evidence state conflict')
    if d.get('aiScopeUnspecified') and any(v['state']!='not_stated' for v in d['areas'].values()): raise ValueError('unspecified scope conflict')
    if category=='official_ai_disclosure' and not any(v['state']=='used' for v in d['areas'].values()) and not d.get('aiScopeUnspecified'): raise ValueError('scope flag required')
    if set(d)-{'identityName','identityDeveloper','category','areas','disclosureQuote','aiScopeUnspecified','summary','reviewNote','description','releaseNote','english'}: raise ValueError('unsafe decision fields')
    for k in ('summary','reviewNote','description'):
        if not d.get(k): raise ValueError('missing '+k)
        if any(x in d[k] for x in ('。；','。。','开发者披露：开发者披露')): raise ValueError('duplicate punctuation')
    if category=='developer_no_genai_statement' and '未经独立审计' not in d['reviewNote']: raise ValueError('human claim caveat missing')
    if b.get('policyVersion')==POLICY or d.get('english') is not None: validate_english_decision(d.get('english'))
    return e,d

def validate(b,stage='evidence'):
    verify_old(b)
    ids=[g['appId'] for g in b['games']]
    if len(ids)!=len(set(ids)) or len(ids)!=b['requestedCount']: raise ValueError('wrong unique batch count')
    if b['attempts']>b['maxAttempts']: raise ValueError('attempt limit')
    for g in b['games']:
        if g['appId'] in b['oldHashes']: raise ValueError('existing App ID')
        validate_game(b,g)
    if stage=='prepublish':
        manifest=read(work(b)/'manifest.json',{})
        if set(manifest)!=set(ids): raise ValueError('missing staging manifest')
        for app,h in manifest.items():
            if sha(work(b)/'staging'/f'{app}.json')!=h: raise ValueError('staging changed')
    return {'valid':len(ids),'stage':stage}

def dedupe_credit(value):
    """Steam repeats a self-published studio in both array slots; keep each credit once."""
    parts = [x.strip() for x in str(value or '').split(',')]
    return ', '.join(dict.fromkeys(x for x in parts if x))


def record(b,g,e,d):
    app=g['appId']; ident=e['identity']; date=e['sources'][0]['fetchedAt'][:10]
    states={k:v['state'] for k,v in d['areas'].items()}; used=[k for k,v in states.items() if v=='used']
    official=d['category']=='official_ai_disclosure'
    sources=[]
    for s in e['sources']:
        typ={'store':'official_disclosure' if official else 'steam_store','discussion':'steam_page','thread':'community','press':'third_party','developer':'developer_statement','community':'community'}[s['sourceType']]
        sources.append(dict(type=typ,url=s['url'],label=s.get('label',s['sourceType']),date=s['fetchedAt'][:10],excerpt=s.get('publicExcerpt',s['quote']),**({'publishedAt':s['publishedAt']} if s.get('publishedAt') else {})))
    release=d.get('releaseNote') or ident.get('release','待公布')
    if ident.get('comingSoon') and not d.get('releaseNote'): release+='（计划；核查时尚未发售）'
    r=dict(appId=app,name=g['name'],category=d['category'],verification='steam_developer_self_disclosure' if official else ('developer_self_statement' if d['category']=='developer_no_genai_statement' else 'reviewed_no_substantiated_genai_claim'),summary=d['summary'],aiUsageCategories=used,aiAreas=states,aiAreaNotes={k:v['note'] for k,v in d['areas'].items() if v.get('note')},aiAreaSources={k:('official' if next(s for s in e['sources'] if s['id']==v['evidenceId'])['sourceType']=='store' else 'developer_statement') for k,v in d['areas'].items() if v['state'] not in ('not_stated','unreviewed')},steamUrl=f'https://store.steampowered.com/app/{app}/',developer=dedupe_credit(ident['developer']),publisher=dedupe_credit(ident.get('publisher','')),steamReleaseDate=release,genres=ident.get('genres',[]),reviewedAt=date,sources=sources,reviewNote=d['reviewNote'])
    if official: r.update(disclosureQuote=d['disclosureQuote'],disclosureQuoteNote=f'Steam 商店 AI 生成内容披露栏完整原文，{date} 核查；可能随商店页更新。')
    if d.get('aiScopeUnspecified'): r['aiScopeUnspecified']=True
    if d.get('english'):
        en=dict(d['english'])
        en['sourceRecordHash']=hashlib.sha256(json.dumps(r,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
        r['english']=en
    return r

def prepare(b,dry=False):
    validate(b)
    manifest={}
    for g in b['games']:
        target=ROOT/'data/games'/f"{g['appId']}.json"
        if target.exists(): raise ValueError('refusing existing canonical '+g['appId'])
        e,d=validate_game(b,g); r=record(b,g,e,d)
        g['evidenceRefs']=[{k:s[k] for k in ('id','sourceType','url','fetchedAt','contentHash','locator')} for s in e['sources']]
        g['evidenceHash']=sha(work(b)/app/'evidence.json') if (app:=g['appId']) else ''
        g['decisionHash']=sha(work(b)/app/'decision.json')
        if not dry:
            p=work(b)/'staging'/target.name; atomic(p,r); manifest[g['appId']]=sha(p)
    if not dry:
        atomic(work(b)/'manifest.json',manifest)
        b['phase']='prepared'; save_batch(b)
    return {'staged':len(b['games']),'dryRun':dry}

def media_queue():
    """Intake-managed ids must be metadata-complete; older ids keep the legacy probe so the bot never mass-redownloads them."""
    reg=read(STATE/'registered-games.json',{})
    strict=list(dict.fromkeys(reg.get('active',[])+reg.get('pendingMedia',[])))
    legacy=[i for i in (ROOT/'scripts/persist-media-ids.txt').read_text(encoding='utf-8').split() if i not in set(strict)]
    return {'strict':strict,'legacy':legacy}

def media_check(app, tracked=False, full=True):
    p=ROOT/f'public/images/steam/apps/{app}/gallery.json'; g=read(p,{})
    if not g.get('images'): raise ValueError('empty media '+app)
    paths=[p.relative_to(ROOT).as_posix()]
    for img in g['images']:
        for k in ('src','thumbnail','full'):
            url=img.get(k,'').split('?')[0]
            if not url.startswith(f'/images/steam/apps/{app}/') or '..' in url: raise ValueError('unsafe/missing media path')
            paths.append('public'+url)
    for movie in g.get('movies',[]):
        if movie.get('thumbnail'):
            url=movie['thumbnail'].split('?')[0]
            if not url.startswith(f'/images/steam/apps/{app}/'): raise ValueError('remote movie thumbnail')
            paths.append('public'+url)
    for path in paths:
        if not (ROOT/path).is_file() or (ROOT/path).stat().st_size==0: raise ValueError('missing media '+path)
        if tracked: git('ls-files','--error-unmatch',path)
    if full:
        meta=read(ROOT/f'data/steam/{app}.json',{})
        urls={u for u in [meta.get('background'),meta.get('header')]+[s.get('full') or s.get('thumbnail') for s in meta.get('screenshots',[])] if u}
        if not meta.get('name') or meta.get('unavailable') or not urls or not urls <= {i.get('source') for i in g['images']}: raise ValueError('incomplete full gallery '+app)
        expected_movies=meta.get('movies',[])
        if len(g.get('movies',[]))!=len(expected_movies) or any(m.get('thumbnail') and not g['movies'][idx].get('thumbnail') for idx,m in enumerate(expected_movies)): raise ValueError('incomplete movie thumbnails '+app)
    return sum((ROOT/p).stat().st_size for p in set(paths))

def main():
    p=argparse.ArgumentParser(); p.add_argument('command',choices=['inventory','discover-import','start','pack','validate','prepare','status','resume','media-check','media-queue','replace-blocked']); p.add_argument('--batch'); p.add_argument('--input'); p.add_argument('--count',type=int,default=10); p.add_argument('--stage',default='evidence',choices=['evidence','prepublish']); p.add_argument('--dry-run',action='store_true'); p.add_argument('--pending-only',action='store_true'); p.add_argument('--summary',action='store_true'); p.add_argument('--app'); p.add_argument('--tracked',action='store_true'); p.add_argument('--allow-legacy-gallery',action='store_true'); p.add_argument('--mode',choices=['strict','legacy']); p.add_argument('--waive-demand'); a=p.parse_args()
    if a.command=='inventory': out={'canonical':len(existing()),'queue':len(queue()),'pendingBatches':[{'batchId':x.stem,'phase':read(x)['phase']} for x in sorted((STATE/'batches').glob('*.json')) if read(x)['phase'] not in ('deployed','cancelled')],'publishedBatches':sum(1 for x in (STATE/'batches').glob('*.json') if read(x)['phase']=='deployed'),'policyVersion':POLICY}
    elif a.command=='discover-import': out=import_candidates(read(Path(a.input)),a.dry_run)
    elif a.command=='start': out=start(a.count,a.dry_run,a.waive_demand)
    elif a.command=='media-check': out={'bytes':media_check(a.app,a.tracked,not a.allow_legacy_gallery)}
    elif a.command=='media-queue': out=(media_queue()[a.mode] if a.mode else media_queue())
    else:
        b=load_batch(a.batch)
        if a.command=='validate': out=validate(b,a.stage)
        elif a.command=='prepare': out=prepare(b,a.dry_run)
        elif a.command=='replace-blocked': out=replace_blocked(b,a.app)
        elif a.command=='pack':
            out=[]
            for g in b['games']:
                if a.app and g['appId']!=a.app: continue
                skip=False
                if a.pending_only and (work(b)/g['appId']/'decision.json').exists():
                    try: validate_game(b,g);skip=True
                    except (ValueError,OSError,KeyError): pass
                if skip:
                    out.append({'appId':g['appId'],'phase':b['phase'],'decisionHash':sha(work(b)/g['appId']/'decision.json')}); continue
                e=read(work(b)/g['appId']/'evidence.json',{})
                out.append({'game':{k:v for k,v in g.items() if k not in ('evidenceRefs',)},'identity':{k:v for k,v in e.get('identity',{}).items() if k!='identityEvidence'},'sources':[{k:s[k] for k in ('id','sourceType','url','fetchedAt','quote','locator') if k in s} for s in e.get('sources',[])],'discussion':e.get('discussion'),'press':{k:v for k,v in e.get('press',{}).items() if k not in ('results','contentHash','cachePath')},'resultCount':len(e.get('press',{}).get('results',[])),'fullEvidencePath':str(work(b)/g['appId']/'evidence.json')})
        elif a.command=='resume':
            git('fetch','origin','main'); verify_old(b)
            with lock():
                q=queue()
                for r in q:
                    if any(r['appId']==g['appId'] for g in b['games']): r.update(batchId=b['batchId'],status='published' if b['phase']=='deployed' else 'reserved',leaseUntil=time.time()+86400)
                save_queue(q)
            out={'batchId':b['batchId'],'phase':b['phase'],'remoteSha':git('rev-parse','origin/main'),'publishShas':b['publishShas'],'next':f'bash scripts/review/publish-batch.sh --batch {b["batchId"]} --execute' if b['phase'] in ('prepared','media_committed','media_pushed','media_ready','site_committed','site_pushed','site_verified','deployed') else 'collect pending sources, then review decisions and validate'}
        else: out={k:v for k,v in b.items() if k!='oldHashes'}
    if a.command=='media-queue' and a.mode: print('\n'.join(out))
    else: print(json.dumps(out,ensure_ascii=False,indent=2))
if __name__=='__main__':
    try: main()
    except (ValueError, OSError, subprocess.CalledProcessError) as ex: print(str(ex),file=sys.stderr); sys.exit(1)
