import copy, importlib.util, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import intake as i
import collect as c
import publish as p
from fixture_helpers import raw_source, store_html
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
  i.import_candidates(rows);b=i.load_batch(i.start(n)['batchId'])
  for g in b['games']:
   app=g['appId'];path=i.work(b)/app;path.mkdir(parents=True)
   src=raw_source(i,self.root,path/'store.html',app,'store','AI created the background artwork.',name=g['name'])
   ds=raw_source(i,self.root,path/'discussion.html',app,'discussion',name=g['name'])
   identity_source=raw_source(i,self.root,path/'appdetails.json',app,'identity',name=g['name'])
   search=path/'search.json';i.atomic(search,{'query':g['name'],'results':[]})
   e=dict(identity=dict(appId=app,name=g['name'],developer='Fixture dev',type='game',verified=True,identityEvidence=identity_source),sources=[src,ds],discussion=dict(pagesScanned=1,visibleTopics=0,totalTopics=0,topics=[],coverageLimits=['homepage only'],related=[]),press=dict(query=g['name']+' AI',searchedAt=i.now(),status='complete',results=[],readUrls=[],coverageLimits=['fixture search only'],cachePath=str(search.relative_to(self.root)),contentHash=i.sha(search)))
   d=dict(identityName=g['name'],identityDeveloper='Fixture dev',category='official_ai_disclosure',areas={k:{'state':'not_stated'} for k in i.AREAS},disclosureQuote=src['quote'],summary='测试游戏；开发者披露背景美术使用 AI。',description='测试游戏。',reviewNote='开发者自述，未经独立审计。讨论与搜索仅覆盖标明范围。')
   d['areas']['art']=dict(state='used',note='明确背景图。',evidenceId='store',quote=src['quote'])
   i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d)
   for k in ('identity','store','discussion','press'):g[k]='complete'
  i.save_batch(b);return b
 def test_dedup_exclude_and_resume_reservation(self):
  (self.root/'data/games/9.json').write_text('{}')
  self.assertEqual(i.import_candidates([{'appId':'9','name':'old','sourceUrl':'https://x'},{'appId':'10','name':'new','sourceUrl':'https://x'},{'appId':'10','name':'new','sourceUrl':'https://x'}])['added'],1)
  b=i.start(1);self.assertEqual(i.start(1)['resume'],b['batchId'])
 def test_valid_prepare_and_no_overwrite(self):
  b=self.fixture();self.assertEqual(i.validate(b)['valid'],1);i.prepare(b)
  self.assertEqual(i.validate(b,'prepublish')['valid'],1)
  (self.root/'data/games/100.json').write_text('{}')
  with self.assertRaisesRegex(ValueError,'existing canonical'):i.prepare(b)
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
  e['sources'][0]=raw_source(i,self.root,path/'store.html','100','store',quote,name=b['games'][0]['name']);d['disclosureQuote']=quote;d['areas']={k:{'state':'not_stated'} for k in i.AREAS};d['aiScopeUnspecified']=True;i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d)
  self.assertEqual(i.validate(b)['valid'],1);i.prepare(b);self.assertEqual(i.read(i.work(b)/'staging/100.json')['disclosureQuote'],quote)
 def test_human_claim_and_community_cannot_support_official(self):
  b=self.fixture();path=i.work(b)/'100';e=i.read(path/'evidence.json');d=i.read(path/'decision.json')
  claim='All art was drawn by hand.'
  developer=raw_source(i,self.root,path/'developer.html','100','developer',claim,name=b['games'][0]['name']);developer['id']='statement'
  store=raw_source(i,self.root,path/'store.html','100','store','',name=b['games'][0]['name'],disclosure=False)
  e['sources']=[store,e['sources'][1],developer]
  d.update(category='developer_no_genai_statement');d.pop('disclosureQuote',None);d['areas']['art']=dict(state='claimed_none',note='素材声明。',quote=claim,evidenceId='statement');i.atomic(path/'evidence.json',e);i.atomic(path/'decision.json',d);self.assertEqual(i.validate(b)['valid'],1)
  community=raw_source(i,self.root,path/'community.html','100','community',claim,name=b['games'][0]['name']);community['id']='statement';e['sources'][-1]=community;i.atomic(path/'evidence.json',e)
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
  b['phase']='deployed';self.assertTrue(p.execute(b)['alreadyComplete'])
if __name__=='__main__':unittest.main()
