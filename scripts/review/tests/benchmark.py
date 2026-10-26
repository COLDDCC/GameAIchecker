"""Offline proxy metrics; never claim tokenizer counts or end-to-end build capacity."""
import json, resource, time
from pathlib import Path
root=Path(__file__).resolve().parents[3]
docs=sum((root/p).stat().st_size for p in ['docs/AGENT_HANDOFF.md','docs/plans/2026-10-26-low-token-game-intake-skill.md'])
skill=(root/'.agents/skills/gameaichecker-intake/SKILL.md').stat().st_size
# Same ten complete synthetic disclosures, once vs repeated whole workflow context.
raw='x'*12000;quote='Official disclosure: pre-rendered backgrounds use AI. '*30
legacy=10*(docs+len(raw)+len(quote));incremental=skill+10*(len(quote)+500)
out={'metric':'UTF-8 bytes; synthetic context proxy, not model tokens','fixtureGames':10,'legacyRepeatedContextBytes':legacy,'incrementalContextBytes':incremental,'contextReduction':1-incremental/legacy,'scope':'Documentation+raw page repetition compared with short skill+selected disclosure; excludes actual model calls'}
scales=[]
for n in [1000,10000]:
 start=time.perf_counter();rows=[{'appId':str(100000+x),'status':'queued','priority':100,'discoveredAt':'2026-10-26','quote':quote} for x in range(n)];ids={r['appId'] for r in rows};assert len(ids)==n
 sorted(rows,key=lambda r:(-r['priority'],r['discoveredAt'],int(r['appId'])))
 encoded=json.dumps(rows);json.loads(encoded)
 scales.append({'syntheticRecords':n,'queueSortAndJsonSeconds':time.perf_counter()-start,'jsonBytes':len(encoded),'maxRssKiB':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
out['queueScale']=scales;out['getAllGamesScale']='not measured; existing quadratic recommendation behavior is out of scope'
print(json.dumps(out,indent=2))
