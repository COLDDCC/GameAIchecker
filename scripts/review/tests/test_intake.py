import copy, importlib.util, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import intake as i
import collect as c
import publish as p
from fixture_helpers import raw_source, store_html, demand_fixture, english_fixture
class IntakeTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory(); self.root=Path(self.temp.name)
  self.patches=[patch.object(m,'ROOT',self.root) for m in (i,c,p)]+[patch.object(i,'STATE',self.root/'scripts/review/state'),patch.object(p,'STATE',self.root/'scripts/review/state'),patch.object(i,'CACHE',self.root/'.cache/gameaichecker-review')]
  for x in self.patches:x.start()
  (self.root/'data/games').mkdir(parents=True)
  subprocess.run(['git','init','-q',str(self.root)],check=True)
  subprocess.run(['git','-C',str(self.root),'config','user.name','Fixture'],check=True)
  subprocess.run(['git','-C',str(self.root),'config','user.email','fixture@example.invalid'],check=True)
  (self.root/'seed').write_text('seed');subprocess.run(['git','-C',str(self.root),'add','seed'],check=True);subprocess.run(['git','-C',str(self.root),'commit','-qm','seed'],check=True)
 def tearDown(self):
  for x in reversed(self.patches):x.stop()
  self.temp.cleanup()
 def fixture(self,n=1):
  rows=[dict(appId=str(100+j),name=f'Fixture {j}',sourceUrl=f'https://example.org/{j}') for j in range(n)]
  i.import_candidates([demand_fixture(i,r) for r in rows]);b=i.load_batch(i.start(n)['batchId'])
  for g in b['games']:
   app=g['appId'];path=i.work(b)/app;path.mkdir(parents=True)
   src=raw_source(i,self.root,path/'store.html',app,'store','AI created the background artwork.',name=g['name'])
   ds=raw_source(i,self.root,path/'discussion.html',app,'discussion',name=g['name'])
   identity_source=raw_source(i,self.root,path/'appdetails.json',app,'identity',name=g['name'])
   search=path/'search.json';i.atomic(search,{'query':g['name'],'results':[]})
   e=dict(identity=dict(appId=app,name=g['name'],developer='Fixture dev',type='game',verified=True,identityEvidence=identity_source),sources=[src,ds],discussion=dict(pagesScanned=1,visibleTopics=0,totalTopics=0,topics=[],coverageLimits=['homepage only'],related=[]),press=dict(query=g['name']+' AI',searchedAt=i.now(),status='complete',results=[],readUrls=[],coverageLimits=['fixture search only'],cachePath=str(search.relative_to(self.root)),contentHash=i.sha(search)))
   d=dict(identityName=g['name'],identityDeveloper='Fixture dev',category='official_ai_disclosure',areas={k:{'state':'not_stated'} for k in i.AREAS},disclosureQuote=src['quote'],summary='测试游戏；开发者披露背景美术使用 AI。',description='测试游戏。',reviewNote='开发者自述，未经独立审计。讨论与搜索仅覆盖标明范围。')
   d['areas']['art']=dict(state='used',note='明确背景图。',evidenceId='store',quote=src['quote'])
   d['english']=english_fixture(i);i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d)
   for k in ('identity','store','discussion','press'):g[k]='complete'
  i.save_batch(b);return b
 def test_dedup_exclude_and_resume_reservation(self):
  (self.root/'data/games/9.json').write_text('{}')
  self.assertEqual(i.import_candidates([{'appId':'9','name':'old','sourceUrl':'https://x'},{'appId':'10','name':'new','sourceUrl':'https://x'},{'appId':'10','name':'new','sourceUrl':'https://x'}])['added'],1)
  i.import_candidates([demand_fixture(i,dict(appId='10',name='new',sourceUrl='https://x'))])
  b=i.start(1);self.assertEqual(i.start(1)['resume'],b['batchId'])
 def test_start_without_measured_demand_requires_an_explicit_owner_waiver(self):
  i.import_candidates([dict(appId='200',name='No demand',sourceUrl='https://example.org/200')])
  with self.assertRaisesRegex(ValueError,'verified search demand'):i.start(1)
  with self.assertRaisesRegex(ValueError,'owner instruction'):i.start(1,waive='ok')
  b=i.load_batch(i.start(1,waive='site owner waived search demand for this batch')['batchId'])
  self.assertEqual(b['selectionOverride']['instruction'],'site owner waived search demand for this batch')
  self.assertIn('This batch only',b['selectionOverride']['scope'])
  self.assertEqual([r['appId'] for r in i.queue() if r['status']=='reserved'],['200'])
 def test_valid_prepare_and_no_overwrite(self):
  b=self.fixture();self.assertEqual(i.validate(b)['valid'],1);i.prepare(b)
  self.assertEqual(i.validate(b,'prepublish')['valid'],1)
  (self.root/'data/games/100.json').write_text('{}')
  with self.assertRaisesRegex(ValueError,'existing canonical'):i.prepare(b)
 def test_repeated_studio_credit_is_recorded_once(self):
  b=self.fixture(); e,d=i.validate_game(b,b['games'][0])
  e['identity']['developer']=e['identity']['publisher']='Small Mill, Small Mill'
  r=i.record(b,b['games'][0],e,d)
  self.assertEqual(r['developer'],'Small Mill'); self.assertEqual(r['publisher'],'Small Mill')
  self.assertEqual(i.dedupe_credit('Valve, Blizzard'), 'Valve, Blizzard')
 def test_identity_name_surrounding_space_is_tolerated(self):
  b=self.fixture();g=b['games'][0];app=g['appId'];path=i.work(b)/app
  raw=i.read(path/'appdetails.json');raw[app]['data']['name']=g['name']+' '
  i.atomic(path/'appdetails.json',raw)
  e=i.read(path/'evidence.json');e['identity']['name']=g['name']+' '
  e['identity']['identityEvidence']['contentHash']=i.sha(path/'appdetails.json')
  i.atomic(path/'evidence.json',e)
  self.assertEqual(i.validate_game(b,g)[0]['identity']['name'],g['name']+' ')
 def test_duplicate_and_existing_ids(self):
  b=self.fixture();b['games']*=2;b['requestedCount']=2
  with self.assertRaises(ValueError):i.validate(b)
  b=self.fixture_or_load();b['oldHashes']['100']='abc'
  with self.assertRaises(ValueError):i.validate(b)
 def fixture_or_load(self):return i.load_batch(next((i.STATE/'batches').glob('*.json')).stem)
 def test_missing_facts_and_single_source_failure(self):
  b=self.fixture();b['games'][0]['press']='blocked'
  with self.assertRaisesRegex(ValueError,'coverage'):i.validate(b)
  b['games'][0]['press']='complete';path=i.work(b)/'100/evidence.json';e=i.read(path);e['identity']['developer']='';i.atomic(path,e)
  with self.assertRaises(ValueError):i.validate(b)
 def test_long_quote_and_unspecified(self):
  b=self.fixture();path=i.work(b)/'100';e=i.read(path/'evidence.json');d=i.read(path/'decision.json');quote=('Some assets were AI assisted. '*2000).strip()
  e['sources'][0]=raw_source(i,self.root,path/'store.html','100','store',quote,name=b['games'][0]['name']);d['disclosureQuote']=quote;d['areas']={k:{'state':'not_stated'} for k in i.AREAS};d['aiScopeUnspecified']=True;d['english']=english_fixture(i);i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d)
  self.assertEqual(i.validate(b)['valid'],1);i.prepare(b);self.assertEqual(i.read(i.work(b)/'staging/100.json')['disclosureQuote'],quote)
 def test_human_claim_and_community_cannot_support_official(self):
  b=self.fixture();path=i.work(b)/'100';e=i.read(path/'evidence.json');d=i.read(path/'decision.json')
  claim='All art was drawn by hand.'
  developer=raw_source(i,self.root,path/'developer.html','100','developer',claim,name=b['games'][0]['name']);developer['id']='statement'
  store=raw_source(i,self.root,path/'store.html','100','store','',name=b['games'][0]['name'],disclosure=False)
  e['sources']=[store,e['sources'][1],developer]
  d.update(category='developer_no_genai_statement');d.pop('disclosureQuote',None);d['areas']['art']=dict(state='claimed_none',note='素材声明。',quote=claim,evidenceId='statement');d['english']=english_fixture(i);i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d);self.assertEqual(i.validate(b)['valid'],1)
  community=raw_source(i,self.root,path/'community.html','100','community',claim,name=b['games'][0]['name']);community['id']='statement';e['sources'][-1]=community;i.atomic(path/'evidence.json',e)
  with self.assertRaisesRegex(ValueError,'unbound'):i.validate(b)
 def test_developer_use_requires_developer_evidence(self):
  b=self.fixture();g=b['games'][0];path=i.work(b)/'100';e=i.read(path/'evidence.json');d=i.read(path/'decision.json')
  claim='We use AI tools for coding.'
  e['sources'][0]=raw_source(i,self.root,path/'store.html','100','store','',name=g['name'],disclosure=False)
  source=raw_source(i,self.root,path/'developer.html','100','developer',claim,name=g['name']);source['id']='statement';e['sources'].append(source)
  d.update(category='developer_ai_disclosure',areas={k:{'state':'not_stated'} for k in i.AREAS});d.pop('disclosureQuote',None)
  d['areas']['code']=dict(state='used',note='Developer statement.',quote=claim,evidenceId='statement')
  i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d)
  self.assertEqual(i.validate(b)['valid'],1)
  record=i.record(b,g,e,d);self.assertEqual(record['verification'],'developer_self_statement');self.assertNotIn('disclosureQuote',record)
  e['sources'][-1]['sourceType']='community';i.atomic(path/'evidence.json',e)
  with self.assertRaisesRegex(ValueError,'unbound'):i.validate(b)
 def test_unsafe_fields_and_changed_cache(self):
  b=self.fixture();path=i.work(b)/'100';d=i.read(path/'decision.json');d['verification']='site_owner_review_passed';i.atomic(path/'decision.json',d)
  with self.assertRaisesRegex(ValueError,'unsafe'):i.validate(b)
  (path/'store.html').write_text('changed')
  with self.assertRaisesRegex(ValueError,'cache'):i.validate(b)
 def test_complete_no_disclosure_age_region_truncated(self):
  html='<html><a href="/app/100/"></a><div id="appHubAppName">Test</div><div id="game_area_description">Full description</div><div class="sysreq_contents">requirements</div></html>'
  self.assertFalse(c.parse_store(html,'100')['disclosurePresent'])
  for broken in [html.replace('</html>',''),html+'agecheck_form',html+'not available in your region']:
   with self.assertRaises(ValueError):c.parse_store(broken,'100')
  long='x '*10000; page=html.replace('</html>',f'<div><h2>AI Generated Content Disclosure</h2><p><i>{long}</i></p></div></html>');self.assertEqual(c.parse_store(page,'100')['quote'],long.strip())
 def test_thread_identity_mismatch(self):
  with self.assertRaises(ValueError):c.parse_thread('<html><div class="forum_op"><div class="topic">Other game</div><div class="content">AI</div></div></html>','Expected')
 def test_429_not_cached_as_success(self):
  class R:stdout='429';stderr='rate limited';returncode=0
  with patch.object(c.subprocess,'run',return_value=R()),patch.object(c.time,'sleep'):
   with self.assertRaisesRegex(ValueError,'429'):c.fetch('https://example.org',self.root/'raw.html','store','100')
  self.assertEqual(i.read(self.root/'raw.response.json')['readStatus'],'blocked')
 def test_interruption_and_atomic_failure(self):
  b=self.fixture();i.prepare(b);old=i.read(i.work(b)/'manifest.json')
  with patch.object(i.os,'replace',side_effect=OSError('disk full')):
   with self.assertRaises(OSError):i.atomic(i.work(b)/'manifest.json',{'bad':True})
  self.assertEqual(i.read(i.work(b)/'manifest.json'),old);self.assertEqual(i.validate(i.load_batch(b['batchId']),'prepublish')['valid'],1)
 def test_concurrent_lock(self):
  with i.lock():
   with self.assertRaises(BlockingIOError):
    with i.lock():pass
 def test_partial_media_and_full_gallery(self):
  root=self.root/'public/images/steam/apps/100';root.mkdir(parents=True);url='/images/steam/apps/100/x.webp';i.atomic(root/'gallery.json',{'images':[dict(src=url,thumbnail=url,full=url,source='https://example.org/image')]})
  with self.assertRaisesRegex(ValueError,'missing media'):i.media_check('100')
  (root/'x.webp').write_bytes(b'fixture');meta=self.root/'data/steam/100.json';i.atomic(meta,dict(name='Fixture',header='https://example.org/image',screenshots=[dict(full='https://example.org/missing')]))
  with self.assertRaisesRegex(ValueError,'incomplete'):i.media_check('100')
  i.atomic(meta,dict(name='Fixture',header='https://example.org/image'));self.assertGreater(i.media_check('100'),0)
 def test_online_images_reject_html_and_resume_only_missing(self):
  from types import SimpleNamespace
  b=self.fixture();b['publishShas']['site']='fixture-sha'
  u='https://gameaichecker.com/images/steam/apps/100/a.webp';v='https://gameaichecker.com/images/steam/apps/100/b.webp'
  with patch.object(p.subprocess,'run',return_value=SimpleNamespace(stdout=u+'\t200\timage/webp\n'+v+'\t200\ttext/html\n',returncode=0)):
   with self.assertRaisesRegex(ValueError,'incomplete'):p.check_images(b,[u,v])
  with patch.object(p.subprocess,'run',return_value=SimpleNamespace(stdout=v+'\t200\timage/webp\n',returncode=0)) as request:
   self.assertEqual(p.check_images(b,[u,v])['responses'],2);self.assertEqual(request.call_count,1)
  with patch.object(p.subprocess,'run',side_effect=AssertionError('completed images must not refetch')):
   self.assertEqual(p.check_images(b,[u,v])['responses'],2)
 def test_push_nonzero_does_not_advance(self):
  b=self.fixture();b.update(phase='media_committed');b['publishShas']['media']='abc'
  with patch.object(p,'git',return_value=''),patch.object(p.subprocess,'run') as r,patch.object(p,'run',side_effect=subprocess.CalledProcessError(1,['git','push'])):
   r.return_value.returncode=1
   with self.assertRaises(subprocess.CalledProcessError):p.push_confirm(b,'media','media_pushed')
  self.assertEqual(b['phase'],'media_committed')
 def test_workflow_timeout_failure_and_missing(self):
  with patch.object(p,'api',return_value={'workflow_runs':[]}): self.assertIsNone(p.workflow_gate('sha',['Astro build']))
  with self.assertRaises(TimeoutError):p.wait_for(lambda:None,0)
  with patch.object(p,'api',return_value={'workflow_runs':[dict(head_sha='sha',name='Astro build',status='completed',conclusion='failure',html_url='https://example.org/run')]}):
   with self.assertRaises(ValueError):p.workflow_gate('sha',['Astro build'])
 def test_remote_advance_and_deployed_rerun(self):
  b=self.fixture()
  with patch.object(p,'git',side_effect=['','remote','local']):
   with self.assertRaisesRegex(ValueError,'advanced'):p.verify_remote(b)
  b['phase']='deployed'
  with patch.object(p,'state_on_remote',return_value=True):self.assertTrue(p.execute(b)['alreadyComplete'])

 def test_missing_demand_is_not_selected(self):
  i.import_candidates([dict(appId='88',name='Unknown demand',sourceUrl='https://example.org')])
  with self.assertRaisesRegex(ValueError,'verified search demand'): i.start(1)
 def test_altered_or_stale_metric_is_not_accepted(self):
  row=demand_fixture(i,dict(appId='88',name='Fixture',sourceUrl='https://example.org'))
  self.assertTrue(i.demand_valid(row))
  proof=self.root/row['demand']['evidencePath'];raw=i.read(proof);raw['value']=0;i.atomic(proof,raw)
  self.assertFalse(i.demand_valid(row));row['demand']['contentHash']=i.sha(proof);self.assertFalse(i.demand_valid(row))
  raw['value']=1;raw['observedAt']='2000-01-01T00:00:00+00:00';i.atomic(proof,raw);row['demand']['contentHash']=i.sha(proof);self.assertFalse(i.demand_valid(row))
 def test_new_batch_requires_english(self):
  b=self.fixture();path=i.work(b)/b['games'][0]['appId']/'decision.json';d=i.read(path);d.pop('english');i.atomic(path,d)
  with self.assertRaisesRegex(ValueError,'English editorial'):i.validate(b)

if __name__=='__main__':unittest.main()
