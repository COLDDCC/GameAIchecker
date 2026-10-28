#!/usr/bin/env python3
"""Attach a manually checked GSC/keyword metric snapshot; never infer volume from SERPs."""
import argparse, json, re
from pathlib import Path
import intake as i
p=argparse.ArgumentParser();p.add_argument('--input',required=True);p.add_argument('--dry-run',action='store_true');a=p.parse_args()
rows=i.read(Path(a.input));candidates=[]
if not isinstance(rows,list): raise ValueError('expected an array of reviewed metric rows')
for row in rows:
    app=str(row['appId'])
    if not re.fullmatch('[1-9][0-9]*',app): raise ValueError('invalid App ID')
    if not row.get('name') or not row.get('query'):raise ValueError('name and reviewed query required')
    # Each input row must be manually associated with the exact Steam identity.
    proof={k:row[k] for k in ['appId','query','kind','metric','value','observedAt','sourceUrl']}
    proof['appId']=app
    key=__import__('hashlib').sha256(json.dumps(proof,sort_keys=True).encode()).hexdigest()[:16]
    target=i.ROOT/'.cache/search-demand'/f'{app}-{key}.json'
    i.atomic(target,proof)
    candidate=dict(appId=app,name=row['name'],sourceUrl=f'https://store.steampowered.com/app/{app}/',priority=int(row.get('priority',100)),demand=dict(query=row['query'],evidencePath=str(target.relative_to(i.ROOT)),contentHash=i.sha(target)))
    if not i.demand_valid(candidate):raise ValueError('missing, zero, stale or invalid measured demand for '+app)
    candidates.append(candidate)
print(json.dumps(i.import_candidates(candidates,a.dry_run)))
