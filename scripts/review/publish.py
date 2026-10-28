#!/usr/bin/env python3
"""Two-phase publisher: explicit paths, per-SHA gates, persistent recovery."""
import argparse, json, re, subprocess, sys, time, os, hashlib, tempfile, shutil
from types import SimpleNamespace
from pathlib import Path
from intake import ROOT, STATE, atomic, read, now, git, lock, load_batch, save_batch, verify_old, validate, work, media_check, slug, sha
import remote_fetch
REPO='COLDDCC/GameAIchecker'
BATCH_SUB='scripts/review/state/batches'
QUEUE_REL='scripts/review/state/candidates.jsonl'
def run(*args): subprocess.run(args,cwd=ROOT,check=True)
def is_ancestor(a,b): return subprocess.run(['git','merge-base','--is-ancestor',a,b],cwd=ROOT).returncode==0
def render(b,phase=None):
    c=json.loads(json.dumps(b)); c['phase']=phase or b['phase']; return c
def batch_rel(b): return f'{BATCH_SUB}/{b["batchId"]}.json'
def own_paths(b): return {batch_rel(b),QUEUE_REL}
def write_state(b,phase=None):
    atomic(ROOT/batch_rel(b),render(b,phase))
    out={batch_rel(b):(ROOT/batch_rel(b)).read_text(encoding='utf-8')}
    if (ROOT/QUEUE_REL).exists(): out[QUEUE_REL]=(ROOT/QUEUE_REL).read_text(encoding='utf-8')
    return out
def dirty_paths(b):
    return (set(git('diff','--name-only','HEAD').splitlines())|set(git('ls-files','--others','--exclude-standard').splitlines()))-own_paths(b)
def mark_published(b):
    from intake import queue,save_queue
    with lock('queue'):
        q=queue()
        for r in q:
            if any(r['appId']==g['appId'] for g in b['games']): r.update(status='published',batchId=b['batchId'])
        save_queue(q)
def api(path):
    # Short-lived raw connector responses support environments without API network access.
    cache=os.environ.get('INTAKE_GITHUB_RESPONSE_DIR')
    if cache:
        snapshot=read(Path(cache)/(hashlib.sha256(path.encode()).hexdigest()+'.json'))
        if not snapshot or snapshot.get('path')!=path or time.time()-snapshot.get('recordedAt',0)>180: raise ValueError('fresh GitHub connector response required: '+path)
        return snapshot['payload']
    url='https://api.github.com/repos/'+REPO+'/'+path
    if shutil.which('gh'):
        # gh keeps the credential out of argv; an unauthenticated curl is rate-limited to 403 behind a proxy.
        try: return json.loads(subprocess.check_output(['gh','api',url],text=True,encoding='utf-8'))
        except (subprocess.CalledProcessError,json.JSONDecodeError): pass
    result=subprocess.check_output(['curl','-fLsS','--max-time','30',url],text=True,encoding='utf-8')
    return json.loads(result)
def verify_remote(b):
    git('fetch','origin','main'); remote=git('rev-parse','origin/main')
    head=git('rev-parse','HEAD')
    if head!=remote:
        # A locally committed state checkpoint may sit on top of the remote head; nothing else may differ.
        if not is_ancestor(remote,head): raise ValueError('remote advanced; inspect changes and fast-forward explicitly before resume: '+remote)
        extra=set(git('diff','--name-only',remote,head).splitlines())-own_paths(b)
        if extra: raise ValueError('unpublished non-state commits ahead of remote: '+str(sorted(extra)))
    verify_old(b)
def push_confirm(b,key,phase):
    commit=b['publishShas'][key]
    # A prior push may have succeeded before state save. Never regenerate or recommit.
    git('fetch','origin','main')
    present=subprocess.run(['git','merge-base','--is-ancestor',commit,'origin/main'],cwd=ROOT).returncode==0
    if not present: run('git','push','origin','HEAD:main'); git('fetch','origin','main')
    run('git','merge-base','--is-ancestor',commit,'origin/main')
    b['phase']=phase;save_batch(b)
def wait_for(probe, timeout, interval=45):  # unauthenticated GitHub API: 60 requests/hour
    deadline=time.monotonic()+timeout
    while True:
        result=probe()
        if result: return result
        if time.monotonic()>=deadline: raise TimeoutError('workflow/deployment timeout; resume saved batch')
        print('Waiting for exact commit checks...',flush=True);time.sleep(min(interval,max(0,deadline-time.monotonic())))
def workflow_gate(sha,names):
    runs=api(f'actions/runs?head_sha={sha}')['workflow_runs']; found={}
    for r in runs:
        if r['head_sha']==sha and r['name'] in names and r['name'] not in found: found[r['name']]=r
    for r in found.values():
        if r['status']=='completed' and r['conclusion']!='success': raise ValueError('workflow failed: '+r['html_url'])
    return found if all(n in found and found[n]['status']=='completed' and found[n]['conclusion']=='success' for n in names) else None
def production_gate(sha):
    checks=api(f'commits/{sha}/check-runs?filter=all')['check_runs']
    for c in checks:
        summary=(c.get('output') or {}).get('summary') or ''
        if c['name']=='Cloudflare Pages' and 'Branch Preview' not in summary:
            if c['status']=='completed' and c['conclusion']!='success': raise ValueError('production deployment failed')
            if c['status']=='completed' and c['conclusion']=='success': return c
    return None

def check_images(b,urls):
    urls=list(dict.fromkeys(urls));cache=work(b)/('online-images-'+b['publishShas']['site']+'.json')
    saved=read(cache,{})
    pending=[url for url in urls if url not in saved or time.time()-saved[url].get('checkedAt',0)>300]
    if pending:
        cache.parent.mkdir(parents=True,exist_ok=True)
        for url in pending:
            if not url.startswith('https://gameaichecker.com/images/steam/apps/') or any(c in url for c in ('\n','\r','"')): raise ValueError('unsafe image URL')
        if remote_fetch.enabled():
            # Relay mode: status + content type per URL from a GitHub runner; same acceptance rule.
            metas=remote_fetch.fetch_many([{'url':u,'mode':'status'} for u in pending])
            result=SimpleNamespace(returncode=0,stdout=''.join(f"{u}\t{m.get('httpStatus')}\t{m.get('contentType','')}\n" for u,m in zip(pending,metas)))
        else:
            # curl on Windows cannot read a config file another process still holds open, so write a closed, unpredictable path.
            config=cache.parent/('curl-config-'+os.urandom(6).hex()+'.txt')
            try:
                config.write_text(''.join('url = "'+url+'"\noutput = "'+os.devnull+'"\n' for url in pending),encoding='utf-8')
                # Reuse two connections; still require every image response, not just one cover.
                result=subprocess.run(['curl','--parallel','--parallel-max','2','-fLsS','--max-time','30','--write-out','%{url_effective}\t%{http_code}\t%{content_type}\n','--config',str(config)],text=True,encoding='utf-8',capture_output=True)
            finally:
                config.unlink(missing_ok=True)
        for line in result.stdout.splitlines():
            parts=line.split('\t')
            if len(parts)==3 and parts[0] in pending and parts[1]=='200' and parts[2].startswith('image/'):
                saved[parts[0]]={'httpStatus':200,'contentType':parts[2],'checkedAt':time.time()}
        atomic(cache,saved)
        missing=[url for url in pending if url not in saved or time.time()-saved[url].get('checkedAt',0)>300]
        if result.returncode or missing: raise ValueError('online image verification incomplete; successful responses checkpointed: '+str(missing[:3]))
    return {'responses':len(urls),'cache':str(cache.relative_to(ROOT))}

def online(b):
    results=[];image_urls=[];pages={}
    if remote_fetch.enabled():
        urls=[]
        for g in b['games']:
            name=read(ROOT/'data/games'/(g['appId']+'.json'))['name']
            urls.append(f"https://gameaichecker.com/games/{g['appId']}-{slug(name)}/")
        for u,m in zip(urls,remote_fetch.fetch_many([{'url':u} for u in urls])):
            if int(m.get('httpStatus') or 0)!=200 or 'body' not in m: raise ValueError(f"online page HTTP {m.get('httpStatus')}: {u}")
            pages[u]=m['body'].decode('utf-8',errors='replace')
    for g in b['games']:
        r=read(ROOT/f'data/games/{g["appId"]}.json');url=f'https://gameaichecker.com/games/{g["appId"]}-{slug(r["name"])}/'
        html=pages[url] if url in pages else subprocess.check_output(['curl','-fLsS','--max-time','30',url],text=True,encoding='utf-8',errors='replace')
        import html as h
        plain=h.unescape(re.sub('<[^>]+>',' ',html));plain=re.sub(r'\s+',' ',plain)
        if r['name'] not in plain or url not in html or 'canonical' not in html or '<title>' not in html: raise ValueError('online title/canonical mismatch '+url)
        if r.get('disclosureQuote') and re.sub(r'\s+',' ',r['disclosureQuote']) not in plain: raise ValueError('online disclosure missing '+url)
        if not all(s['url'].replace('&','&amp;') in html or s['url'] in html for s in r['sources']): raise ValueError('online sources missing '+url)
        gallery=read(ROOT/f'public/images/steam/apps/{g["appId"]}/gallery.json')
        if not any(i['src'].split('?')[0] in html for i in gallery['images']): raise ValueError('online gallery missing')
        for image in gallery['images']:
            for k in ('src','thumbnail','full'):
                image_urls.append('https://gameaichecker.com'+image[k])
        results.append({'appId':g['appId'],'url':url,'checkedAt':now(),'status':'passed'})
    b['checkResults']['onlineImages']=check_images(b,image_urls);save_batch(b)
    return results

def execute(b,timeout=900,connector=False):
    with lock('publish'):
        if b['phase']=='deployed':
            # A local file may claim deployed while its commit never reached main; the remote copy is the proof.
            if state_on_remote(b): return {'phase':'deployed','publishShas':b['publishShas'],'alreadyComplete':True}
            return record_state(b,connector)
        if b['phase']=='prepared':
            if dirty_paths(b): raise ValueError('publisher requires clean worktree: '+str(sorted(dirty_paths(b))))
            verify_remote(b);validate(b,'prepublish')
            planned={}
            for g in b['games']:
                app=g['appId'];target=f'data/games/{app}.json'
                if (ROOT/target).exists(): raise ValueError('existing canonical')
                planned[target]=(work(b)/'staging'/f'{app}.json').read_text(encoding='utf-8')
            registry=read(STATE/'registered-games.json');registry['pendingMedia']=list(dict.fromkeys(registry['pendingMedia']+[g['appId'] for g in b['games']]))
            planned['scripts/review/state/registered-games.json']=json.dumps(registry,ensure_ascii=False,indent=2)+'\n'
            ids=(ROOT/'scripts/persist-media-ids.txt').read_text(encoding='utf-8').split()
            planned['scripts/persist-media-ids.txt']='\n'.join(dict.fromkeys(ids+[g['appId'] for g in b['games']]))+'\n'
            atomic(work(b)/'apply-plan.json',{'files':planned,'state':[batch_rel(b),QUEUE_REL]})
            b['applyBase']=git('rev-parse','HEAD');b['phase']='applying';save_batch(b)
        if b['phase']=='applying':
            plan=read(work(b)/'apply-plan.json')
            planned=plan.get('files',{}); statefiles=set(plan.get('state',[]))
            if not planned or not statefiles: raise ValueError('apply plan missing')
            # Recover a commit made just before state checkpoint. Exact tree is required.
            if b.get('pendingTree') and git('rev-parse','HEAD^{tree}')==b['pendingTree'] and git('rev-parse','HEAD')!=b['applyBase']:
                if git('rev-parse','HEAD^')!=b['applyBase']: raise ValueError('unexpected commit parent')
            else:
                if git('rev-parse','HEAD')!=b['applyBase']: raise ValueError('remote/local advanced during apply; inspect before resume')
                verify_remote(b)
                changed=set(git('diff','--name-only','HEAD').splitlines())|set(git('ls-files','--others','--exclude-standard').splitlines())
                if changed-set(planned)-statefiles: raise ValueError('unrelated changes during apply')
                for target,text in planned.items():
                    path=ROOT/target
                    if target.startswith('data/games/') and path.exists() and path.read_text(encoding='utf-8')!=text: raise ValueError('canonical recovery hash mismatch')
                    if not target.startswith('data/games/') and path.exists():
                        original=subprocess.check_output(['git','show',b['applyBase']+':'+target],cwd=ROOT,text=True,encoding='utf-8')
                        if path.read_text(encoding='utf-8') not in (text,original): raise ValueError('registration recovery mismatch')
                    if path.exists() and path.read_text(encoding='utf-8')==text: continue
                    path.parent.mkdir(parents=True,exist_ok=True)
                    # Canonical files are only adopted when exact staged bytes match.
                    if target.startswith('data/games/'):
                        with path.open('x',encoding='utf-8') as f: f.write(text)
                    else:
                        temp=path.with_suffix(path.suffix+'.intake-tmp');temp.write_text(text,encoding='utf-8');temp.replace(path)
                snapshot=write_state(b,'prepared')
                run('git','add','--',*planned,*snapshot)
                staged=set(git('diff','--cached','--name-only').splitlines())
                if staged-set(planned)-set(snapshot): raise ValueError('unexpected index contents')
                b['pendingTree']=git('write-tree');save_batch(b)
                run('git','commit','-m',f'feat(intake): add {b["requestedCount"]} verified games ({b["batchId"]})')
            b['publishShas']['media']=git('rev-parse','HEAD');b['phase']='media_committed';save_batch(b)
        if b['phase']=='media_committed':
            if connector: return export_push(b,'media')
            push_confirm(b,'media','media_pushed')
        if b['phase']=='media_pushed':
            checks=wait_for(lambda:workflow_gate(b['publishShas']['media'],['Persist media for reviewed games']),timeout)
            git('fetch','origin','main');run('git','merge','--ff-only','origin/main');verify_old(b)
            size=sum(media_check(g['appId'],tracked=True) for g in b['games'])
            b['checkResults']['media']={'checks':{n:r['html_url'] for n,r in checks.items()},'bytes':size,'verifiedRemoteSha':git('rev-parse','origin/main')};b['phase']='media_ready';save_batch(b)
        if b['phase']=='media_ready':
            verify_remote(b)
            registry=read(STATE/'registered-games.json');ids=[g['appId'] for g in b['games']]
            for app in ids: media_check(app,tracked=True)
            registry['active']=list(dict.fromkeys(registry['active']+ids));registry['pendingMedia']=[i for i in registry['pendingMedia'] if i not in ids]
            atomic(work(b)/'site-plan.json',registry)
            b['siteBase']=git('rev-parse','HEAD');b['phase']='site_applying';save_batch(b)
        if b['phase']=='site_applying':
            if b.get('siteTree') and git('rev-parse','HEAD^{tree}')==b['siteTree'] and git('rev-parse','HEAD')!=b['siteBase']:
                if git('rev-parse','HEAD^')!=b['siteBase']: raise ValueError('unexpected activation commit parent')
            else:
                if git('rev-parse','HEAD')!=b['siteBase']: raise ValueError('unexpected activation head')
                verify_remote(b)
                path='scripts/review/state/registered-games.json'
                changed=set(git('diff','--name-only','HEAD').splitlines())|set(git('ls-files','--others','--exclude-standard').splitlines())
                if changed-{path}-own_paths(b): raise ValueError('unrelated activation changes')
                current=read(ROOT/path);before=json.loads(subprocess.check_output(['git','show',b['siteBase']+':'+path],cwd=ROOT,text=True,encoding='utf-8'));after=read(work(b)/'site-plan.json')
                if current not in (before,after): raise ValueError('activation registration changed')
                atomic(ROOT/path,after)
                snapshot=write_state(b,'media_ready')
                run('git','add','--',path,*snapshot)
                if set(git('diff','--cached','--name-only').splitlines())-{path}-set(snapshot): raise ValueError('unexpected activation index')
                b['siteTree']=git('write-tree');save_batch(b)
                run('git','commit','-m',f'feat(intake): activate complete local galleries ({b["batchId"]})')
            b['publishShas']['site']=git('rev-parse','HEAD');b['phase']='site_committed';save_batch(b)
        if b['phase']=='site_committed':
            if connector: return export_push(b,'site')
            push_confirm(b,'site','site_pushed')
        if b['phase']=='site_pushed':
            commit=b['publishShas']['site'];checks=wait_for(lambda:workflow_gate(commit,['Astro build','Validate game detail build']),timeout)
            cf=wait_for(lambda:production_gate(commit),timeout)
            b['checkResults']['ci']={n:r['html_url'] for n,r in checks.items()};b['checkResults']['production']={'sha':commit,'checkUrl':cf.get('details_url'),'summary':cf.get('output',{}).get('summary'),'checkedAt':now()};save_batch(b)
            b['checkResults']['online']=online(b);b['phase']='site_verified';save_batch(b)
        if b['phase']=='site_verified':
            return record_state(b,connector)
        return {'phase':b['phase'],'publishShas':b['publishShas']}
def export_push(b,key,commit=None):
    commit=commit or b['publishShas'][key];parent=git('rev-parse',commit+'^')
    changed=git('diff-tree','--no-commit-id','--name-only','-r',commit).splitlines()
    elements=[]
    for path in changed:
        elements.append({'path':path,'mode':'100644','type':'blob','content':subprocess.check_output(['git','show',commit+':'+path],cwd=ROOT,text=True,encoding='utf-8')})
    packet={'parentSha':parent,'baseTreeSha':git('rev-parse',parent+'^{tree}'),'localTreeSha':git('rev-parse',commit+'^{tree}'),'message':git('log','-1','--format=%B',commit),'treeElements':elements}
    atomic(work(b)/f'{key}-push.json',packet)
    return {'phase':b['phase'],'transport':'GitHub connector required','packet':str(work(b)/f'{key}-push.json'),'next':'create tree + commit + update_ref with expected parent; then --adopt-push SHA --push-stage '+key}
def record_state(b,connector=False):
    """Persist the finished batch to git; a fresh clone must never see a deployed batch as unfinished."""
    mark_published(b)
    local=pending_state_commit(b)
    if not local:
        snapshot=write_state(b,'deployed')
        changed=(set(git('diff','--name-only','HEAD').splitlines())|set(git('ls-files','--others','--exclude-standard').splitlines()))
        if changed-set(snapshot): raise ValueError('unrelated changes during state record: '+str(sorted(changed-set(snapshot))))
        if changed:
            run('git','add','--',*sorted(changed))
            if set(git('diff','--cached','--name-only').splitlines())!=changed: raise ValueError('unexpected state index')
            run('git','commit','-m',f'chore(intake): record batch {b["batchId"]} deployed')
        write_state(b,'deployed')  # worktree matches the commit so a rebase stays possible
        local=git('rev-parse','HEAD')
    if connector: return export_push(b,'state',local)
    git('fetch','origin','main')
    if git('rev-parse','HEAD')!=git('rev-parse','origin/main'):
        if not is_ancestor('origin/main','HEAD'): raise ValueError('remote advanced during state record; inspect and fast-forward before resume')
        if set(git('diff','--name-only','origin/main','HEAD').splitlines())-own_paths(b): raise ValueError('unexpected local commits ahead of remote before state push')
        run('git','rebase','origin/main');local=git('rev-parse','HEAD')
    run('git','push','origin','HEAD:main')
    b['phase']='deployed';save_batch(b)
    if not state_on_remote(b): raise ValueError('pushed batch state is not visible on origin/main')
    return {'phase':'deployed','stateCommit':local,'publishShas':b['publishShas']}
def state_on_remote(b):
    want=json.dumps(render(b,'deployed'),ensure_ascii=False,indent=2)+'\n'
    try: git('fetch','origin','main')
    except subprocess.CalledProcessError: return False
    try: return subprocess.check_output(['git','show','origin/main:'+batch_rel(b)],cwd=ROOT,text=True,encoding='utf-8')==want
    except subprocess.CalledProcessError: return False
def pending_state_commit(b):
    """A state-only local commit already waiting to be transported; nothing else may be ahead of origin/main."""
    try: remote=git('rev-parse','origin/main')
    except subprocess.CalledProcessError: return None
    ahead=[s for s in git('rev-list',remote+'..HEAD').splitlines() if s]
    if len(ahead)!=1: return None
    files=set(git('diff-tree','--no-commit-id','--name-only','-r',ahead[0]).splitlines())
    return ahead[0] if files and files<=own_paths(b) else None
def adopt_state(b,remote):
    if b['phase']!='site_verified': raise ValueError('state adopt requires site_verified')
    git('fetch','origin','main');run('git','merge-base','--is-ancestor',remote,'origin/main')
    files=set(git('diff-tree','--no-commit-id','--name-only','-r',remote).splitlines())
    if not files or files-own_paths(b): raise ValueError('connector state commit carries unexpected files')
    want=json.dumps(render(b,'deployed'),ensure_ascii=False,indent=2)+'\n'
    if subprocess.check_output(['git','show',remote+':'+batch_rel(b)],cwd=ROOT,text=True,encoding='utf-8')!=want: raise ValueError('connector state content mismatch')
    run('git','reset','--soft',remote)
    b['phase']='deployed';save_batch(b)
    return {'phase':'deployed','stateCommit':remote}
def adopt_push(b,key,remote):
    if key=='state': return adopt_state(b,remote)
    if b['phase']!=key+'_committed': raise ValueError('unexpected adopt stage')
    git('fetch','origin','main');run('git','merge-base','--is-ancestor',remote,'origin/main')
    local=b['publishShas'][key]
    if git('rev-parse',local+'^{tree}')!=git('rev-parse',remote+'^{tree}'): raise ValueError('connector tree mismatch')
    if git('rev-parse',local+'^')!=git('rev-parse',remote+'^'): raise ValueError('connector parent mismatch')
    run('git','reset','--soft',remote)
    b['publishShas'][key]=remote;b['phase']='media_pushed' if key=='media' else 'site_pushed';save_batch(b)
    return {'phase':b['phase'],'remoteSha':remote}
def supersede_site(b,remote):
    if b['phase']!='site_pushed': raise ValueError('follow-up requires site_pushed')
    git('fetch','origin','main')
    if git('rev-parse','HEAD')!=remote or git('rev-parse','origin/main')!=remote: raise ValueError('synchronize exact follow-up head first')
    old=b['publishShas']['site'];run('git','merge-base','--is-ancestor',old,remote)
    if git('diff','--name-only',old,remote,'--','data/games','public/images/steam/apps','scripts/review/state/registered-games.json'): raise ValueError('follow-up changed reviewed content/media; revalidate separately')
    verify_old(b)
    for g in b['games']: media_check(g['appId'],tracked=True)
    b['publishShas'].setdefault('siteHistory',[]).append(old);b['publishShas']['site']=remote
    b['checkResults'].pop('ci',None);b['checkResults'].pop('production',None);save_batch(b)
    return {'phase':b['phase'],'siteSha':remote,'superseded':old}
def main():
    p=argparse.ArgumentParser();p.add_argument('--batch',required=True);p.add_argument('--dry-run',action='store_true');p.add_argument('--execute',action='store_true');p.add_argument('--timeout',type=int,default=900);p.add_argument('--connector',action='store_true');p.add_argument('--adopt-push');p.add_argument('--supersede-site');p.add_argument('--push-stage',choices=['media','site','state']);a=p.parse_args();b=load_batch(a.batch)
    if a.supersede_site: print(json.dumps(supersede_site(b,a.supersede_site)))
    elif a.adopt_push: print(json.dumps(adopt_push(b,a.push_stage,a.adopt_push)))
    elif a.dry_run:
        validate(b,'prepublish');print(json.dumps({'phase':b['phase'],'games':[g['appId'] for g in b['games']],'actions':['commit data, pending media IDs and batch state','push main and verify exact media SHA','verify all committed gallery files and full metadata coverage','activate registration and record media SHA/bytes in batch state, push main','check exact CI + production + every online page','commit batch state as deployed']}))
    elif a.execute: print(json.dumps(execute(b,a.timeout,a.connector)))
    else: p.error('choose --dry-run or --execute')
if __name__=='__main__':
    try: main()
    except (ValueError,OSError,TimeoutError,subprocess.CalledProcessError) as e: print(str(e),file=sys.stderr);sys.exit(1)
