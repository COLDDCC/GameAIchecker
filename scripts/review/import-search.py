#!/usr/bin/env python3
"""Attach search-tool response + manually reviewed URL selection without exposing raw results."""
import argparse,json,re
from pathlib import Path
from intake import ROOT,load_batch,work,read,atomic,sha,save_batch
p=argparse.ArgumentParser();p.add_argument('--batch',required=True);p.add_argument('--app',required=True);p.add_argument('--search',required=True);p.add_argument('--selection',required=True);a=p.parse_args()
b=load_batch(a.batch);g=next(g for g in b['games'] if g['appId']==a.app);folder=work(b)/a.app
response=read(Path(a.search));selection=read(Path(a.selection));e=read(folder/'evidence.json')
if not response.get('query') or not response.get('searchedAt') or response['response'].get('isError'): raise ValueError('search failed')
rawpath=Path(a.search).resolve();rawpath.relative_to(ROOT)
results=selection['results'];selected={r['url'] for r in results if r['relevant']}
response_text=json.dumps(response,ensure_ascii=False)
for result in results:
 if result['url'] not in response_text: raise ValueError('URL not in actual search response: '+result['url'])
 if not result.get('reason'): raise ValueError('result disposition reason required')
sources=selection.get('sources',[])
if selected!={s['url'] for s in sources}: raise ValueError('relevant sources not read exactly')
for s in sources:
 if s['sourceType'] not in ('press','developer','community'):raise ValueError('invalid supplemental source')
 if not (ROOT/s['cachePath']).is_file() or sha(ROOT/s['cachePath'])!=s['contentHash']:raise ValueError('source raw missing')
e['sources']=[s for s in e['sources'] if not s['id'].startswith('press-')]+sources
e['press']=dict(query=response['query'],searchedAt=response['searchedAt'],status='complete',results=results,readUrls=sorted(selected),coverageLimits=selection['coverageLimits'],cachePath=str(rawpath.relative_to(ROOT)),contentHash=sha(rawpath))
atomic(folder/'evidence.json',e);g['press']='complete';save_batch(b)
print(json.dumps({'appId':a.app,'results':len(results),'sourcesRead':len(sources)}))
