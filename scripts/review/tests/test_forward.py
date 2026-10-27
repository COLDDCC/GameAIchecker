"""Independent offline invocation of the intake skill's business invariants."""
import copy
import contextlib
import io
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

REVIEW = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REVIEW))
import intake
import publish
import collect
from fixture_helpers import raw_source, demand_fixture, english_fixture

class ForwardSkillTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.patches=[patch.object(publish,'ROOT',self.root),patch.object(publish,'STATE',self.root/'scripts/review/state'),patch.object(collect,'ROOT',self.root),patch.object(intake,'ROOT',self.root),patch.object(intake,'STATE',self.root/'scripts/review/state'),patch.object(intake,'CACHE',self.root/'.cache/gameaichecker-review')]
        for p in self.patches: p.start()
        (self.root/'data/games').mkdir(parents=True)
        subprocess.run(['git','init','-q',str(self.root)],check=True)
        subprocess.run(['git','-C',str(self.root),'config','user.name','Fixture'],check=True)
        subprocess.run(['git','-C',str(self.root),'config','user.email','fixture@example.invalid'],check=True)
        (self.root/'fixture').write_text('fixture')
        subprocess.run(['git','-C',str(self.root),'add','fixture'],check=True)
        subprocess.run(['git','-C',str(self.root),'commit','-qm','fixture'],check=True)
    def tearDown(self):
        for p in reversed(self.patches): p.stop()
        self.temp.cleanup()
    def candidates(self,n=10):
        return [demand_fixture(intake,{'appId':str(9000000+i),'name':f'Fixture {i}','sourceUrl':f'https://store.steampowered.com/app/{9000000+i}/'}) for i in range(n)]
    def ready(self,n=10):
        intake.import_candidates(self.candidates(n)); out=intake.start(n); b=intake.load_batch(out['batchId'])
        for g in b['games']:
            app=g['appId']; folder=intake.work(b)/app; folder.mkdir(parents=True)
            q='Some in-game assets were created with AI. '+('Long disclosure. '*1000).strip()
            developer='Fixture Developer'
            sources=[raw_source(intake,self.root,folder/'store.html',app,'store',q,name=g['name'],developer=developer),raw_source(intake,self.root,folder/'discussion.html',app,'discussion',name=g['name'],developer=developer)]
            identity_source=raw_source(intake,self.root,folder/'appdetails.json',app,'identity',name=g['name'],developer=developer)
            search=folder/'search.json';intake.atomic(search,{'query':g['name'],'results':[]})
            evidence=dict(identity=dict(appId=app,name=g['name'],developer=developer,type='game',verified=True,identityEvidence=identity_source),sources=sources,discussion=dict(pagesScanned=1,visibleTopics=0,totalTopics=0,topics=[],related=[],coverageLimits=['homepage only']),press=dict(query=g['name']+' AI',searchedAt=intake.now(),status='complete',results=[],readUrls=[],coverageLimits=['fixture search'],cachePath=str(search.relative_to(self.root)),contentHash=intake.sha(search)))
            decision=dict(identityName=g['name'],identityDeveloper='Fixture Developer',category='official_ai_disclosure',areas={k:{'state':'not_stated'} for k in intake.AREAS},disclosureQuote=q,aiScopeUnspecified=True,summary='测试游戏披露部分素材由 AI 制作，未明确类型。',reviewNote='开发者自述，未经独立审计。',description='测试游戏。')
            decision['english']=english_fixture(intake)
            intake.atomic(folder/'evidence.json',evidence);intake.atomic(folder/'decision.json',decision)
            for k in ('identity','store','discussion','press'):g[k]='complete'
        intake.save_batch(b);return b
    def test_ten_unique_full_disclosures_staged_without_canonical_mutation(self):
        b=self.ready();self.assertEqual(intake.validate(b)['valid'],10);intake.prepare(b)
        self.assertEqual(len(list((intake.work(b)/'staging').glob('*.json'))),10)
        self.assertEqual(list((self.root/'data/games').glob('*.json')),[])
        r=intake.read(next((intake.work(b)/'staging').glob('*.json')))
        self.assertGreater(len(r['disclosureQuote']),10000)
        self.assertTrue(r['aiScopeUnspecified'])
        self.assertEqual(set(r['aiAreas'].values()),{'not_stated'})
    def test_import_excludes_duplicate_existing_and_removed(self):
        intake.atomic(self.root/'data/games/9000000.json',{'appId':'9000000'})
        intake.atomic(self.root/'data/next-fest-100.json',{'removedEntries':[{'steamAppId':9000001}]})
        rows=self.candidates(3);self.assertEqual(intake.import_candidates(rows+rows)['added'],1)
        self.assertEqual(intake.import_candidates(rows)['added'],0)
    def test_start_reuses_batch_without_double_reservation(self):
        intake.import_candidates(self.candidates());one=intake.start(10);two=intake.start(10)
        self.assertEqual(one['batchId'],two['resume']);self.assertEqual(len(intake.queue()),10)
    def test_incomplete_source_refuses_prepare(self):
        b=self.ready();b['games'][4]['press']='blocked'
        with self.assertRaisesRegex(ValueError,'coverage incomplete'):intake.prepare(b)
        self.assertFalse((intake.work(b)/'staging').exists())
    def test_changed_old_record_refused(self):
        intake.atomic(self.root/'data/games/42.json',{'appId':'42','verification':'site_owner_review_passed'})
        b=self.ready();intake.atomic(self.root/'data/games/42.json',{'appId':'42','verification':'changed'})
        with self.assertRaisesRegex(ValueError,'existing record changed'):intake.validate(b)
    def test_empty_media_cannot_pass(self):
        intake.atomic(self.root/'public/images/steam/apps/9000000/gallery.json',{'images':[]})
        with self.assertRaisesRegex(ValueError,'empty media'):intake.media_check('9000000')
    def test_partial_media_cannot_pass(self):
        intake.atomic(self.root/'public/images/steam/apps/9000000/gallery.json',{'images':[{'src':'/images/steam/apps/9000000/a.webp','thumbnail':'/images/steam/apps/9000000/a-thumb.webp','full':'/images/steam/apps/9000000/a-full.webp'}]})
        with self.assertRaisesRegex(ValueError,'missing media'):intake.media_check('9000000')
    def test_duplicate_batch_id_cannot_count_toward_ten(self):
        b=self.ready();b['games'][-1]=copy.deepcopy(b['games'][0])
        with self.assertRaisesRegex(ValueError,'wrong unique batch count'):intake.validate(b)

    def pack(self,b):
        output=io.StringIO()
        with patch.object(sys,'argv',['intake.py','pack','--batch',b['batchId'],'--pending-only']),contextlib.redirect_stdout(output):
            intake.main()
        return json.loads(output.getvalue())
    def test_pack_invalid_decision_and_changed_evidence_stay_visible(self):
        b=self.ready(1);self.assertIn('decisionHash',self.pack(b)[0])
        folder=intake.work(b)/b['games'][0]['appId']
        decision=intake.read(folder/'decision.json');decision.pop('identityName');intake.atomic(folder/'decision.json',decision)
        self.assertTrue(self.pack(b)[0].get('sources'))
        decision['identityName']=b['games'][0]['name'];intake.atomic(folder/'decision.json',decision)
        self.assertIn('decisionHash',self.pack(b)[0])
        (folder/'store.html').write_text('raw source changed')
        self.assertTrue(self.pack(b)[0].get('sources'))
    def test_raw_hash_valid_but_fabricated_quote_refused(self):
        b=self.ready(1);folder=intake.work(b)/b['games'][0]['appId'];e=intake.read(folder/'evidence.json');d=intake.read(folder/'decision.json')
        e['sources'][0]['quote']='Fabricated disclosure not in original response.';d['disclosureQuote']=e['sources'][0]['quote']
        intake.atomic(folder/'evidence.json',e);intake.atomic(folder/'decision.json',d)
        with self.assertRaisesRegex(ValueError,'quote/raw mismatch'):intake.validate(b)
    def test_replace_blocked_preserves_count_reason_and_attempt_limit(self):
        intake.import_candidates(self.candidates(4));b=intake.load_batch(intake.start(1)['batchId']);old=b['games'][0]['appId']
        with self.assertRaisesRegex(ValueError,'blocking reason'):intake.replace_blocked(b,old)
        b['games'][0]['reason']='age wall';first=intake.replace_blocked(b,old)
        self.assertNotEqual(first['selected'],old);self.assertEqual(len(b['games']),1);self.assertEqual(b['attempts'],2)
        self.assertEqual(b['blockedGames'][0]['reason'],'age wall')
        self.assertEqual(next(r for r in intake.queue() if r['appId']==old)['status'],'blocked')
        b['games'][0]['reason']='region wall';intake.replace_blocked(b,b['games'][0]['appId']);self.assertEqual(b['attempts'],3)
        b['games'][0]['reason']='network blocked'
        with self.assertRaisesRegex(ValueError,'attempt limit'):intake.replace_blocked(b,b['games'][0]['appId'])
    def prepare_publish_fixture(self,n=2):
        b=self.ready(n);intake.prepare(b)
        intake.atomic(intake.STATE/'registered-games.json',{'active':[],'pendingMedia':[]})
        (self.root/'scripts/persist-media-ids.txt').write_text('')
        (self.root/'.gitignore').write_text('.cache/\n.*.lock\n')
        subprocess.run(['git','-C',str(self.root),'add','.'],check=True)
        subprocess.run(['git','-C',str(self.root),'commit','-qm','prepared fixture'],check=True)
        return b
    def test_apply_crash_after_first_file_resumes_exact_staging(self):
        b=self.prepare_publish_fixture();second=self.root/'data/games'/f"{b['games'][1]['appId']}.json"
        original_open=Path.open
        def fail_second(path,*args,**kwargs):
            if path==second and args and args[0]=='x':raise OSError('simulated interruption')
            return original_open(path,*args,**kwargs)
        with patch.object(publish,'verify_remote',side_effect=intake.verify_old),patch.object(Path,'open',fail_second):
            with self.assertRaisesRegex(OSError,'interruption'):publish.execute(b)
        saved=intake.load_batch(b['batchId']);self.assertEqual(saved['phase'],'applying')
        first=self.root/'data/games'/f"{b['games'][0]['appId']}.json";self.assertTrue(first.is_file());self.assertFalse(second.exists())
        before=intake.sha(first)
        with patch.object(publish,'verify_remote',side_effect=intake.verify_old),patch.object(publish,'push_confirm',side_effect=RuntimeError('offline stop before push')):
            with self.assertRaisesRegex(RuntimeError,'offline stop'):publish.execute(saved)
        self.assertEqual(intake.sha(first),before);self.assertTrue(second.is_file());self.assertEqual(saved['phase'],'media_committed')
        self.assertEqual(second.read_bytes(),(intake.work(saved)/'staging'/second.name).read_bytes())
    def test_commit_success_before_checkpoint_does_not_recommit(self):
        b=self.prepare_publish_fixture(1);original_save=publish.save_batch
        def fail_checkpoint(value):
            if value['phase']=='media_committed':raise OSError('checkpoint interruption')
            original_save(value)
        with patch.object(publish,'verify_remote',side_effect=intake.verify_old),patch.object(publish,'save_batch',side_effect=fail_checkpoint):
            with self.assertRaisesRegex(OSError,'checkpoint interruption'):publish.execute(b)
        commit=intake.git('rev-parse','HEAD');saved=intake.load_batch(b['batchId']);self.assertEqual(saved['phase'],'applying');self.assertTrue(saved['pendingTree'])
        with patch.object(publish,'verify_remote',side_effect=intake.verify_old),patch.object(publish,'push_confirm',side_effect=RuntimeError('offline stop before push')):
            with self.assertRaisesRegex(RuntimeError,'offline stop'):publish.execute(saved)
        self.assertEqual(intake.git('rev-parse','HEAD'),commit);self.assertEqual(saved['publishShas']['media'],commit)

if __name__=='__main__':unittest.main()
