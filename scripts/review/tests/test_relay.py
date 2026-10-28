"""Offline tests for the GitHub Actions fetch relay (INTAKE_FETCH=actions)."""
import hashlib, json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import intake as i
import collect as c
import publish as p
import remote_fetch as rf
import actions_fetch as af
from fixture_helpers import store_html, demand_fixture


def body_meta(url, body, status=200):
    b = body.encode()
    return dict(url=url, mode='body', httpStatus=status, fetchedAt='2026-10-28T00:00:00+00:00',
                contentHash=hashlib.sha256(b).hexdigest(), body=b)


class RelayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.root = Path(self.temp.name)
        self.patches = [patch.object(m, 'ROOT', self.root) for m in (i, c, p, rf)] + [
            patch.object(i, 'STATE', self.root / 'scripts/review/state'), patch.object(p, 'STATE', self.root / 'scripts/review/state'),
            patch.object(i, 'CACHE', self.root / '.cache/gameaichecker-review'), patch.dict(os.environ, {'INTAKE_FETCH': 'actions'})]
        for x in self.patches: x.start()
        (self.root / 'data/games').mkdir(parents=True)
        subprocess.run(['git', 'init', '-q', str(self.root)], check=True)
        g = ['git', '-C', str(self.root), '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid']
        (self.root / 'seed').write_text('seed')
        subprocess.run(g + ['add', 'seed'], check=True); subprocess.run(g + ['commit', '-qm', 'seed'], check=True)

    def tearDown(self):
        for x in reversed(self.patches): x.stop()
        self.temp.cleanup()

    def batch(self):
        row = demand_fixture(i, dict(appId='100', name='Fixture 0', sourceUrl='https://example.org/0'))
        i.import_candidates([row]); return i.load_batch(i.start(1)['batchId'])

    def test_collect_uses_two_relay_round_trips_and_keeps_exact_bytes(self):
        b = self.batch(); app = '100'
        store = store_html(app, 'Fixture 0', 'AI made the menu icons.')
        ident = json.dumps({app: {'success': True, 'data': {'steam_appid': 100, 'name': 'Fixture 0', 'developers': ['Fixture dev'], 'type': 'game'}}})
        disc = ('<html><div class="apphub_AppName">Fixture 0</div><span id="forum_General_1_pagetotal">1</span>'
                '<div class="forum_topic"><a class="forum_topic_overlay" href="https://steamcommunity.com/app/100/discussions/0/1/"></a>'
                '<div class="forum_topic_name">Is the art AI?</div></div></html>')
        thread = ('<html><div class="forum_op"><div class="topic">Is the art AI?</div><div class="content">Question</div></div>'
                  '<div class="commentthread_comment">Dev: icons only</div></html>')
        pages = {f'https://store.steampowered.com/app/{app}/?l=english': store,
                 f'https://store.steampowered.com/api/appdetails?appids={app}&l=english': ident,
                 f'https://steamcommunity.com/app/{app}/discussions/?l=english': disc,
                 'https://steamcommunity.com/app/100/discussions/0/1/': thread}
        calls = []
        def fake(items):
            calls.append([x['url'] for x in items]); return [body_meta(x['url'], pages[x['url']]) for x in items]
        with patch.object(rf, 'fetch_many', side_effect=fake), patch.object(sys, 'argv', ['collect.py', '--batch', b['batchId']]):
            c.main()
        self.assertEqual(len(calls), 2)
        b = i.load_batch(b['batchId']); g = b['games'][0]
        self.assertEqual((g['store'], g['discussion'], g['identity']), ('complete',) * 3)
        e = i.read(i.work(b) / app / 'evidence.json')
        self.assertEqual(next(s for s in e['sources'] if s['id'] == 'store')['quote'], 'AI made the menu icons.')
        self.assertEqual((i.work(b) / app / 'store.html').read_text(), store)
        self.assertIn('icons only', next(s for s in e['sources'] if s['id'] == 'thread-0')['quote'])

    def test_relay_failure_is_blocked_not_success(self):
        b = self.batch()
        def fake(items): return [dict(url=x['url'], mode='body', httpStatus=429, error='rate limited') for x in items]
        with patch.object(rf, 'fetch_many', side_effect=fake), patch.object(sys, 'argv', ['collect.py', '--batch', b['batchId']]):
            c.main()
        g = i.load_batch(b['batchId'])['games'][0]
        self.assertEqual(g['store'], 'pending'); self.assertIn('429', g['reason'])

    def test_online_images_via_relay_reject_html(self):
        b = self.batch(); b['publishShas']['site'] = 'fixture-sha'
        u = 'https://gameaichecker.com/images/steam/apps/100/a.webp'; v = 'https://gameaichecker.com/images/steam/apps/100/b.webp'
        metas = [dict(url=u, httpStatus=200, contentType='image/webp'), dict(url=v, httpStatus=200, contentType='text/html')]
        with patch.object(rf, 'fetch_many', return_value=metas):
            with self.assertRaisesRegex(ValueError, 'incomplete'): p.check_images(b, [u, v])
        with patch.object(rf, 'fetch_many', return_value=[dict(url=v, httpStatus=200, contentType='image/webp')]) as req:
            self.assertEqual(p.check_images(b, [u, v])['responses'], 2)
            self.assertEqual(req.call_args[0][0], [{'url': v, 'mode': 'status'}])

    def test_wait_rejects_tampered_body(self):
        meta = dict(url='https://x.example/', mode='body', httpStatus=200, contentHash='0' * 64)
        def fake_git(*args, **kw):
            if args[0] == 'show' and args[1].endswith('.json'): return json.dumps(meta)
            return b'not matching'
        with patch.object(rf, '_fetch_branch'), patch.object(rf.subprocess, 'run', return_value=SimpleNamespace(returncode=0)), patch.object(rf, '_git', side_effect=fake_git):
            with self.assertRaisesRegex(ValueError, 'hash mismatch'): rf.wait('rid', 1)

    def test_runner_rejects_unsafe_urls_and_marks_done(self):
        root = self.root / 'cache'; (root / 'requests').mkdir(parents=True)
        (root / 'requests/r1.json').write_text(json.dumps(dict(requestId='r1', items=[{'url': 'http://insecure.example/'}, {'url': 'file:///etc/passwd'}])))
        with patch.object(af.subprocess, 'run', side_effect=AssertionError('must not fetch')):
            af.handle(root / 'requests/r1.json', root)
        self.assertEqual(json.loads((root / 'responses/r1/done.json').read_text())['statuses'], [0, 0])

    def test_runner_retries_429_then_records_hash(self):
        root = self.root / 'cache'; (root / 'requests').mkdir(parents=True)
        (root / 'requests/r2.json').write_text(json.dumps(dict(requestId='r2', items=[{'url': 'https://store.steampowered.com/app/1/'}])))
        seq = iter(['429\ttext/html\thttps://store.steampowered.com/app/1/', '200\ttext/html\thttps://store.steampowered.com/app/1/'])
        def fake_run(cmd, **kw):
            out = cmd[cmd.index('-o') + 1]; Path(out).write_text('<html>ok</html>')
            assert any('birthtime=0' in x for x in cmd)
            return SimpleNamespace(stdout=next(seq), stderr='', returncode=0)
        with patch.object(af.subprocess, 'run', side_effect=fake_run), patch.object(af.time, 'sleep'):
            af.handle(root / 'requests/r2.json', root)
        meta = json.loads((root / 'responses/r2/0.json').read_text())
        self.assertEqual(meta['httpStatus'], 200)
        self.assertEqual(meta['contentHash'], hashlib.sha256(b'<html>ok</html>').hexdigest())


class CacheSyncTests(unittest.TestCase):
    def test_push_then_pull_restores_exact_bytes_in_fresh_clone(self):
        with tempfile.TemporaryDirectory() as t:
            t = Path(t); bare = t / 'origin.git'
            subprocess.run(['git', 'init', '-q', '--bare', str(bare)], check=True)
            g = ['-c', 'user.name=F', '-c', 'user.email=f@example.invalid']
            def clone(name):
                d = t / name; subprocess.run(['git', 'clone', '-q', str(bare), str(d)], check=True, capture_output=True); return d
            seed = clone('seed'); (seed / 'x').write_text('x')
            subprocess.run(['git', '-C', str(seed), *g, 'add', 'x'], check=True); subprocess.run(['git', '-C', str(seed), *g, 'commit', '-qm', 's'], check=True)
            subprocess.run(['git', '-C', str(seed), 'push', '-q', 'origin', 'HEAD:refs/heads/main'], check=True)
            subprocess.run(['git', '-C', str(seed), 'push', '-q', 'origin', 'HEAD:refs/heads/intake-cache'], check=True)
            a = clone('a'); snap = a / '.cache/search-demand/1-abc.json'; snap.parent.mkdir(parents=True); snap.write_bytes(b'{"value": 7}\n')
            with patch.object(rf, 'ROOT', a), patch.object(rf, 'WT', a / '.cache/intake-cache'):
                self.assertTrue(rf.cache_push()['pushed'])
            b = clone('b')
            with patch.object(rf, 'ROOT', b), patch.object(rf, 'WT', b / '.cache/intake-cache'):
                self.assertEqual(rf.cache_pull()['restored'], 1)
            self.assertEqual((b / '.cache/search-demand/1-abc.json').read_bytes(), b'{"value": 7}\n')


if __name__ == '__main__':
    unittest.main()
