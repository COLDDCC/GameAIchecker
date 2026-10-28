#!/usr/bin/env python3
"""Bounded HTTP collector. Searches are supplied by an available search adapter."""
import argparse, hashlib, html, json, re, subprocess, sys, time
from html.parser import HTMLParser
from urllib.parse import urljoin
from pathlib import Path
from types import SimpleNamespace
from intake import ROOT, CACHE, atomic, read, now, sha, work, load_batch, save_batch
import remote_fetch
class Node:
    def __init__(self,tag='',attrs=(),parent=None): self.tag=tag; self.attrs=dict(attrs); self.parent=parent; self.children=[]
    def text(self): return re.sub(r'\s+',' ',''.join(c.text()+' ' if isinstance(c,Node) else c for c in self.children)).strip()
    def find(self,**attrs): return [n for n in self.walk() if all(v in n.attrs.get(k,'').split() if k=='class' else n.attrs.get(k)==v for k,v in attrs.items())]
    def walk(self):
        yield self
        for c in self.children:
            if isinstance(c,Node): yield from c.walk()
class Tree(HTMLParser):
    def __init__(self,s):
        super().__init__(convert_charrefs=True); self.root=Node(); self.current=self.root; self.feed(s)
    def handle_starttag(self,t,a):
        n=Node(t,a,self.current); self.current.children.append(n)
        if t not in ('area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'): self.current=n
    def handle_endtag(self,t):
        n=self.current
        while n.parent:
            if n.tag==t: self.current=n.parent; return
            n=n.parent
    def handle_data(self,d): self.current.children.append(d)
def one(root,**kw):
    a=root.find(**kw); return a[0] if a else None
def parse_store(s,app):
    root=Tree(s).root
    if re.search('agecheck_form|agegate_box|not available in your region|not available in your country',s,re.I): raise ValueError('age/region wall')
    name=one(root,id='appHubAppName'); desc=one(root,id='game_area_description'); sysreq=one(root,**{'class':'sysreq_contents'})
    if not name or not desc or not sysreq or '</html>' not in s.lower(): raise ValueError('incomplete store HTML')
    if not re.search(r'(?:appids?\s*[:=]\s*["\']?|/app/|data-appid=["\'])'+re.escape(app)+r'\b',s): raise ValueError('store App ID mismatch')
    disclosure=[]
    for n in root.walk():
        if n.tag=='h2' and n.text()=='AI Generated Content Disclosure':
            parent=n.parent; italics=[x for x in parent.walk() if x.tag=='i']
            if not italics: raise ValueError('disclosure missing/truncated')
            disclosure.append(' '.join(x.text() for x in italics))
    if len(disclosure)>1: raise ValueError('ambiguous disclosures')
    return {'name':name.text(),'quote':disclosure[0] if disclosure else '', 'disclosurePresent':bool(disclosure)}
RELATED=re.compile(r'\bAI\b|generat|slop|asset.?flip|artwork|artist|美术|画师|生成|人工知能',re.I)
def parse_discussion(s,app,name):
    root=Tree(s).root; appname=one(root,**{'class':'apphub_AppName'})
    if not appname or appname.text()!=name or '</html>' not in s.lower(): raise ValueError('discussion identity/incomplete')
    totals=re.findall(r'id="forum_[^"]+_pagetotal"[^>]*>\s*([0-9,]+)',s)
    if not totals: raise ValueError('discussion scope unavailable')
    topics=[]
    for n in root.find(**{'class':'forum_topic'}):
        title=one(n,**{'class':'forum_topic_name'}); link=one(n,**{'class':'forum_topic_overlay'})
        if title and link: topics.append({'title':title.text(),'url':html.unescape(link.attrs.get('href',''))})
    total=int(totals[0].replace(',',''))
    if total and not topics: raise ValueError('topics could not be parsed')
    return {'pagesScanned':1,'visibleTopics':len(topics),'totalTopics':total,'topics':topics,'related':[dict(t,status='pending') for t in topics if RELATED.search(t['title'])],'coverageLimits':['仅扫描英文讨论区首页；不代表完整历史或其他语言分区。']}
def parse_thread(s,title):
    root=Tree(s).root; heading=one(root,**{'class':'forum_op'})
    if not heading or '</html>' not in s.lower(): raise ValueError('thread unreadable')
    ht=one(heading,**{'class':'topic'}); body=one(heading,**{'class':'content'})
    if not ht or ht.text()!=title or not body: raise ValueError('thread title/body mismatch')
    # Include all visible replies, including developer badges, rather than first comment only.
    replies=root.find(**{'class':'commentthread_comment'})
    return body.text()+'\n'+'\n'.join(n.text() for n in replies)
def fetch(url,p,source,app,deadline=None):
    meta=p.with_suffix('.response.json'); cached=read(meta,{})
    if p.exists() and cached.get('readStatus')=='complete' and sha(p)==cached.get('contentHash') and cached.get('url')==url: return p.read_text(encoding='utf-8'),cached
    last=''
    for attempt in range(3):
        if deadline and time.monotonic()>deadline: raise ValueError('collector deadline exceeded')
        p.parent.mkdir(parents=True,exist_ok=True); temp=p.with_suffix('.download')
        if remote_fetch.enabled():
            # GitHub Actions relay: the runner already retried 429/5xx within its budget.
            rm=remote_fetch.fetch_many([{'url':url}])[0]
            status=remote_fetch.store_into(rm,temp,p.with_suffix('.headers'))
            res=SimpleNamespace(returncode=0 if status==200 else 1,stderr=rm.get('error',''))
        else:
            res=subprocess.run(['curl','-LsS','--max-time','20','--retry','0','-D',str(p.with_suffix('.headers')),'-o',str(temp),'-w','%{http_code}',url],text=True,encoding='utf-8',errors='replace',capture_output=True)
            status=int(res.stdout) if res.stdout.isdigit() else 0
        last=f'HTTP {status}: {res.stderr[:120]}'
        if status==200 and res.returncode==0:
            temp.replace(p); text=p.read_text(encoding='utf-8',errors='replace')
            m=dict(appId=app,sourceType=source,url=url,fetchedAt=now(),httpStatus=200,language='english',contentHash=sha(p),readStatus='complete',cachePath=str(p.relative_to(ROOT)),locator='full response',quote='')
            atomic(meta,m); return text,m
        atomic(meta,dict(url=url,httpStatus=status,readStatus='blocked',reason=last,fetchedAt=now()))
        if status in (403,404) or remote_fetch.enabled(): break
        if attempt<2:
            headers=p.with_suffix('.headers').read_text(encoding='utf-8',errors='replace') if p.with_suffix('.headers').exists() else ''
            retry=re.findall(r'(?im)^retry-after:\s*(\d+)',headers)
            delay=int(retry[-1]) if retry else 2**attempt
            if delay>30: raise ValueError('source paused: Retry-After exceeds retry budget')
            time.sleep(delay)
    raise ValueError(last)
def _adopt(meta,url,p,source,app):
    """Store one relay response so fetch() finds it as a complete cache entry (exact bytes + hash)."""
    if int(meta.get('httpStatus') or 0)!=200 or 'body' not in meta: return False
    remote_fetch.store_into(meta,p,p.with_suffix('.headers'))
    atomic(p.with_suffix('.response.json'),dict(appId=app,sourceType=source,url=url,fetchedAt=meta.get('fetchedAt',now()),httpStatus=200,language='english',contentHash=sha(p),readStatus='complete',cachePath=str(p.relative_to(ROOT)),locator='full response',quote=''))
    return True
def _cached(url,p):
    m=read(p.with_suffix('.response.json'),{})
    return p.exists() and m.get('readStatus')=='complete' and m.get('url')==url and sha(p)==m.get('contentHash')
def prefetch(b,games):
    """Relay mode: fetch every page a batch needs in two round trips instead of one per URL."""
    plan=[]
    for g in games:
        app=g['appId'];p=work(b)/app
        if g['store']!='complete' or g['identity']!='complete':
            plan+=[(f'https://store.steampowered.com/app/{app}/?l=english',p/'store.html','store',app),(f'https://store.steampowered.com/api/appdetails?appids={app}&l=english',p/'appdetails.json','identity',app)]
        if g['discussion']!='complete': plan.append((f'https://steamcommunity.com/app/{app}/discussions/?l=english',p/'discussion.html','discussion',app))
    plan=[x for x in plan if not _cached(x[0],x[1])]
    if plan:
        for meta,(url,p,source,app) in zip(remote_fetch.fetch_many([{'url':x[0]} for x in plan]),plan): _adopt(meta,url,p,source,app)
    threads=[]
    for g in games:
        if g['discussion']=='complete': continue
        app=g['appId'];p=work(b)/app;url=f'https://steamcommunity.com/app/{app}/discussions/?l=english'
        if not _cached(url,p/'discussion.html'): continue
        try: di=parse_discussion((p/'discussion.html').read_text(encoding='utf-8',errors='replace'),app,g['name'])
        except ValueError: continue
        threads+=[(t['url'],p/f'thread-{i}.html','thread',app) for i,t in enumerate(di['related']) if t['url'].startswith('https://')]
    threads=[x for x in threads if not _cached(x[0],x[1])]
    if threads:
        for meta,(url,p,source,app) in zip(remote_fetch.fetch_many([{'url':x[0]} for x in threads]),threads): _adopt(meta,url,p,source,app)
    return {'pages':len(plan),'threads':len(threads)}
def collect_game(b,g):
    app=g['appId']; p=work(b)/app; p.mkdir(parents=True,exist_ok=True); e=read(p/'evidence.json',{'sources':[]}); deadline=time.monotonic()+180
    if g['store']!='complete' or g['identity']!='complete':
        s,m=fetch(f'https://store.steampowered.com/app/{app}/?l=english',p/'store.html','store',app,deadline)
        facts=parse_store(s,app)
        raw,meta=fetch(f'https://store.steampowered.com/api/appdetails?appids={app}&l=english',p/'appdetails.json','identity',app,deadline)
        api=json.loads(raw).get(app,{})
        if not api.get('success'): raise ValueError('appdetails unavailable')
        d=api['data']
        if str(d['steam_appid'])!=app or d['name']!=facts['name'] or d['name']!=g['name'] or not d.get('developers') or d.get('type')!='game': raise ValueError('identity mismatch/demo')
        # Cross-check developer name against visible storefront.
        if not all(dev in Tree(s).root.text() for dev in d['developers']): raise ValueError('developer mismatch')
        e['identity']=dict(appId=app,name=d['name'],developer=', '.join(d['developers']),publisher=', '.join(d.get('publishers',[])),type=d['type'],verified=True,release=d.get('release_date',{}).get('date','待公布'),comingSoon=d.get('release_date',{}).get('coming_soon'),genres=[v['description'] for v in d.get('genres',[])],description=html.unescape(re.sub('<[^>]+>',' ',d.get('short_description',''))),identityEvidence=meta)
        m.update(id='store',quote=facts['quote'],disclosurePresent=facts['disclosurePresent'],locator='game_area_content_descriptors / AI Generated Content Disclosure' if facts['disclosurePresent'] else 'complete store page: description + system requirements',label='Steam 商店完整 AI 披露',publicExcerpt=facts['quote'] if facts['quote'] else '完整商店页未显示 AI 生成内容披露栏；未披露不等于未使用。')
        e['sources']=[x for x in e['sources'] if x['id']!='store']+[m]; g['identity']=g['store']='complete'; atomic(p/'evidence.json',e); save_batch(b)
    if g['discussion']!='complete':
        url=f'https://steamcommunity.com/app/{app}/discussions/?l=english'; s,m=fetch(url,p/'discussion.html','discussion',app,deadline); di=parse_discussion(s,app,g['name'])
        m.update(id='discussion',quote='\n'.join(t['title'] for t in di['topics']),label='Steam 讨论区首页核查',locator='forum topics container',publicExcerpt=f"英文讨论区首页显示 {di['visibleTopics']} 个主题（总数 {di['totalTopics']}）；仅覆盖首页。" )
        e['sources']=[x for x in e['sources'] if x['id']!='discussion']+[m]
        e['discussion']=di; atomic(p/'evidence.json',e)
        for i,t in enumerate(di['related']):
            body,tm=fetch(t['url'],p/f'thread-{i}.html','thread',app,deadline); quote=parse_thread(body,t['title']); key=f'thread-{i}'
            tm.update(id=key,quote=quote,label=t['title'],locator='forum_op + all visible replies')
            e['sources']=[x for x in e['sources'] if x['id']!=key]+[tm]
            t.update(status='complete',evidenceId=key,identityVerified=True,repliesChecked=True)
        g['discussion']='complete'; atomic(p/'evidence.json',e); save_batch(b)
    g.pop('reason',None)
def main():
    p=argparse.ArgumentParser();p.add_argument('--batch',required=True);p.add_argument('--pending-only',action='store_true');a=p.parse_args();b=load_batch(a.batch)
    if b['phase'] in ('prepared','media_pushed','media_ready','site_pushed','deployed'): raise ValueError('collection closed for prepared batch')
    b['phase']='collecting';save_batch(b)
    if remote_fetch.enabled():
        todo=[g for g in b['games'] if not (g['store']==g['discussion']==g['identity']=='complete')]
        if todo: print('relay prefetch',json.dumps(prefetch(b,todo)),flush=True)
    for g in b['games']:
        if a.pending_only and g['store']==g['discussion']==g['identity']=='complete':
            e=read(work(b)/g['appId']/'evidence.json',{})
            cached=e.get('sources',[])+[e.get('identity',{}).get('identityEvidence',{})]
            intact=bool(cached) and all((ROOT/s.get('cachePath','__missing__')).is_file() and sha(ROOT/s['cachePath'])==s.get('contentHash') for s in cached)
            if intact: continue
            g['store']=g['discussion']=g['identity']='pending'
            g['press']='pending' # Lost evidence must be refreshed, including independent search.
            g['coverageLimits'].append('缓存丢失或变更，重新抓取并要求重新核查。')
        try: collect_game(b,g); print(g['appId'],'collected')
        except (ValueError,OSError,KeyError) as ex:
            g['reason']=str(ex);g['retries']+=1;g['coverageLimits'].append(str(ex));print(g['appId'],'blocked:',ex)
        save_batch(b)
    b['phase']='needs_judgment';save_batch(b)
if __name__=='__main__': main()
