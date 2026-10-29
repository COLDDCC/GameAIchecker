#!/usr/bin/env python3
"""Client side of the intake fetch relay.

Some agent sandboxes cannot reach Steam, publishers or gameaichecker.com, but can push to GitHub.
With INTAKE_FETCH=actions the collector and publisher send URL lists to the `intake-cache` branch;
.github/workflows/intake-fetch.yml on that branch fetches them on a GitHub runner and commits the raw
responses back. Bodies keep their exact bytes and SHA-256, so the existing evidence checks are unchanged.

CLI:
  remote_fetch.py init                      create the intake-cache branch (once)
  remote_fetch.py get --out DIR URL...      fetch raw bodies into DIR (debugging / ad-hoc)
  remote_fetch.py source --batch ID --app APP --type press|developer|community URL...
                                            fetch full articles into the batch cache and print
                                            evidence source skeletons (fill id/label/quote, then
                                            pass them to import-search.py in the selection file)
  remote_fetch.py cache-push | cache-pull   mirror .cache/search-demand and .cache/gameaichecker-review
                                            to/from intake-cache:cache/ so a fresh sandbox can resume
"""
import argparse, hashlib, json, os, re, subprocess, sys, time
from pathlib import Path
from intake import ROOT, atomic, now, read, sha, work, load_batch

BRANCH = 'intake-cache'
POLL = int(os.environ.get('INTAKE_FETCH_POLL', '15'))
TIMEOUT = int(os.environ.get('INTAKE_FETCH_TIMEOUT', '1200'))
WORKFLOW = Path(__file__).resolve().parents[2] / 'scripts/review/intake-cache-workflow.yml'


def enabled():
    return os.environ.get('INTAKE_FETCH') == 'actions'


def _git(*args, cwd=None, check=True, binary=False):
    cwd = ROOT if cwd is None else cwd  # resolve at call time (tests and INTAKE_ROOT patch ROOT)
    r = subprocess.run(['git', '-c', 'user.name=gameaichecker-intake', '-c', 'user.email=intake@gameaichecker.invalid', *args],
                       cwd=cwd, capture_output=True, text=not binary)
    if check and r.returncode:
        raise ValueError('git ' + ' '.join(args[:2]) + ' failed: ' + (r.stderr if not binary else r.stderr.decode(errors='replace'))[:300])
    return r.stdout if binary else r.stdout.strip()


def _fetch_branch():
    _git('fetch', '-q', '--depth', '1', 'origin', f'+refs/heads/{BRANCH}:refs/remotes/origin/{BRANCH}')


def _worktree():
    WT = ROOT / '.cache/intake-cache'
    if not (WT / '.git').exists():
        _fetch_branch()
        WT.parent.mkdir(parents=True, exist_ok=True)
        _git('worktree', 'add', '-q', '--detach', str(WT), f'origin/{BRANCH}')
    return WT


def init_branch():
    """Create the orphan intake-cache branch holding only the relay workflow."""
    if _git('ls-remote', '--heads', 'origin', BRANCH):
        return {'exists': True}
    tmp = ROOT / '.cache/intake-cache-init'
    if tmp.exists():
        subprocess.run(['rm', '-rf', str(tmp)], check=True)
    tmp.mkdir(parents=True)
    _git('init', '-q', '-b', BRANCH, cwd=tmp)
    (tmp / '.github/workflows').mkdir(parents=True)
    (tmp / '.github/workflows/intake-fetch.yml').write_text(WORKFLOW.read_text())
    (tmp / 'README.md').write_text('# intake-cache\n\nRaw fetch relay for scripts/review (see scripts/review/remote_fetch.py on main).\n'
                                   'Not part of the website. Requests in requests/, raw responses in responses/.\n')
    (tmp / 'requests').mkdir(); (tmp / 'requests/.keep').write_text('')
    _git('add', '.', cwd=tmp); _git('commit', '-qm', 'chore(intake): create fetch relay branch', cwd=tmp)
    remote = _git('remote', 'get-url', 'origin')
    _git('push', '-q', remote, f'HEAD:refs/heads/{BRANCH}', cwd=tmp)
    subprocess.run(['rm', '-rf', str(tmp)], check=True)
    return {'created': True}


def submit(items):
    if not items:
        return None
    for it in items:
        if not str(it.get('url', '')).startswith('https://'):
            raise ValueError('relay accepts https URLs only: ' + str(it.get('url')))
    wt = _worktree()
    rid = time.strftime('%Y%m%dT%H%M%S') + '-' + os.urandom(3).hex()
    for attempt in range(5):
        _fetch_branch()
        _git('checkout', '-q', '--detach', f'origin/{BRANCH}', cwd=wt)
        req = wt / 'requests' / f'{rid}.json'
        req.parent.mkdir(exist_ok=True)
        req.write_text(json.dumps(dict(requestId=rid, createdAt=now(), items=items), ensure_ascii=False, indent=1) + '\n')
        _git('add', str(req.relative_to(wt)), cwd=wt)
        _git('commit', '-qm', f'chore(intake): fetch request {rid} ({len(items)} urls)', cwd=wt)
        if subprocess.run(['git', 'push', '-q', 'origin', f'HEAD:refs/heads/{BRANCH}'], cwd=wt, capture_output=True).returncode == 0:
            return rid
        time.sleep(3 + attempt * 2)  # runner committed meanwhile; rebuild on the new tip
    raise ValueError('could not push fetch request to ' + BRANCH)


def wait(rid, count):
    deadline = time.monotonic() + TIMEOUT
    ref = f'origin/{BRANCH}'
    while True:
        _fetch_branch()
        if subprocess.run(['git', 'cat-file', '-e', f'{ref}:responses/{rid}/done.json'], cwd=ROOT, capture_output=True).returncode == 0:
            break
        if time.monotonic() > deadline:
            raise TimeoutError(f'fetch relay timeout for request {rid}; check Actions on branch {BRANCH} and rerun (cached results are reused)')
        print(f'Waiting for fetch relay {rid}...', file=sys.stderr, flush=True)
        time.sleep(POLL)
    out = []
    for n in range(count):
        meta = json.loads(_git('show', f'{ref}:responses/{rid}/{n}.json'))
        if meta.get('mode') == 'body' and meta.get('contentHash'):
            body = _git('show', f'{ref}:responses/{rid}/{n}.body', binary=True)
            if hashlib.sha256(body).hexdigest() != meta['contentHash']:
                raise ValueError('relay body hash mismatch ' + meta['url'])
            meta['body'] = body
        out.append(meta)
    return out


def fetch_many(items):
    """items: [{url, mode}] -> metas in the same order; meta['body'] holds raw bytes for mode=body."""
    items = [dict(url=i['url'], mode=i.get('mode', 'body')) for i in items]
    out = []
    for start in range(0, len(items), 400):
        chunk = items[start:start + 400]
        rid = submit(chunk)
        out += wait(rid, len(chunk))
    return out


def store_into(meta, path, headers_path=None):
    """Write a relay body to `path` exactly as the local curl transport would. Returns HTTP status."""
    status = int(meta.get('httpStatus') or 0)
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    if headers_path is not None:
        Path(headers_path).write_text(meta.get('headers', ''))
    if status == 200 and 'body' in meta:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        Path(path).write_bytes(meta['body'])
    return status


def save_sources(batch, app, kind, urls):
    b = load_batch(batch)
    if not any(g['appId'] == app for g in b['games']):
        raise ValueError('app not in batch')
    folder = work(b) / app
    existing = sorted(folder.glob(f'{kind}-*.html'))
    metas = fetch_many([{'url': u} for u in urls]) if enabled() else _local(urls)
    out = []
    for i, (u, m) in enumerate(zip(urls, metas), start=len(existing)):
        p = folder / f'{kind}-{i}.html'
        status = store_into(m, p)
        rec = dict(id=f'{kind}-{i}', appId=app, sourceType=kind, url=u, fetchedAt=m.get('fetchedAt', now()), httpStatus=status,
                   language='english', readStatus='complete' if status == 200 else 'blocked', quote='', locator='full article text',
                   label='', cachePath=str(p.relative_to(ROOT)) if status == 200 else '', contentHash=sha(p) if status == 200 else '')
        out.append(rec)
    return out


CACHE_DIRS = ('.cache/search-demand', '.cache/gameaichecker-review')
# Evidence snapshots are verified by contentHash, so the mirror must store and check out raw bytes.
# A worktree on Windows with core.autocrlf=true would otherwise turn every stored LF into CRLF on restore.
CACHE_ATTRS = '* -text\n'


def cache_push(message='chore(intake): sync private evidence cache'):
    """Mirror demand snapshots and raw batch evidence to intake-cache/cache/ (exact bytes)."""
    wt = _worktree()
    for attempt in range(5):
        _fetch_branch(); _git('checkout', '-q', '--detach', f'origin/{BRANCH}', cwd=wt)
        attrs = wt / '.gitattributes'
        if not attrs.exists() or attrs.read_text(encoding='utf-8') != CACHE_ATTRS:
            attrs.write_text(CACHE_ATTRS, encoding='utf-8')
        for d in CACHE_DIRS:
            src = ROOT / d
            if not src.is_dir():
                continue
            for f in src.rglob('*'):
                if f.is_file() and not f.name.startswith('.tmp-') and f.suffix not in ('.download', '.lock'):
                    dst = wt / 'cache' / d.split('/', 1)[1] / f.relative_to(src)
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    dst.write_bytes(f.read_bytes())
        _git('add', '-A', 'cache', '.gitattributes', cwd=wt, check=False)
        if subprocess.run(['git', 'diff', '--cached', '--quiet'], cwd=wt).returncode == 0:
            return {'pushed': False, 'reason': 'no changes'}
        _git('commit', '-qm', message, cwd=wt)
        if subprocess.run(['git', 'push', '-q', 'origin', f'HEAD:refs/heads/{BRANCH}'], cwd=wt, capture_output=True).returncode == 0:
            return {'pushed': True, 'commit': _git('rev-parse', 'HEAD', cwd=wt)}
        time.sleep(3 + attempt * 2)
    raise ValueError('cache push failed')


def cache_pull():
    """Restore cache/ from intake-cache into .cache/ without overwriting newer local files."""
    wt = _worktree(); _fetch_branch(); _git('checkout', '-q', '--detach', f'origin/{BRANCH}', cwd=wt)
    restored = 0
    for d in CACHE_DIRS:
        src = wt / 'cache' / d.split('/', 1)[1]
        if not src.is_dir():
            continue
        for f in src.rglob('*'):
            if f.is_file():
                dst = ROOT / d / f.relative_to(src)
                if not dst.exists():
                    dst.parent.mkdir(parents=True, exist_ok=True); dst.write_bytes(f.read_bytes()); restored += 1
    return {'restored': restored}


def _local(urls):
    metas = []
    for u in urls:
        r = subprocess.run(['curl', '-LsS', '--max-time', '30', '-o', '-', '-w', '\n%{http_code}', u], capture_output=True)
        body, _, code = r.stdout.rpartition(b'\n')
        metas.append(dict(url=u, httpStatus=int(code or 0), body=body, fetchedAt=now()))
    return metas


def main():
    p = argparse.ArgumentParser()
    p.add_argument('command', choices=['init', 'get', 'source', 'cache-push', 'cache-pull'])
    p.add_argument('urls', nargs='*')
    p.add_argument('--out'); p.add_argument('--batch'); p.add_argument('--app'); p.add_argument('--type', default='press', choices=['press', 'developer', 'community'])
    a = p.parse_args()
    if a.command == 'init':
        print(json.dumps(init_branch()))
    elif a.command == 'cache-push':
        print(json.dumps(cache_push()))
    elif a.command == 'cache-pull':
        print(json.dumps(cache_pull()))
    elif a.command == 'get':
        out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
        res = []
        for n, m in enumerate(fetch_many([{'url': u} for u in a.urls])):
            store_into(m, out / f'{n}.body')
            res.append({k: v for k, v in m.items() if k not in ('body', 'headers')})
        print(json.dumps(res, ensure_ascii=False, indent=1))
    else:
        print(json.dumps(save_sources(a.batch, a.app, a.type, a.urls), ensure_ascii=False, indent=1))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, TimeoutError) as ex:
        print(str(ex), file=sys.stderr); sys.exit(1)
