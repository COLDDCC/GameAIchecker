#!/usr/bin/env python3
"""Runner side of the intake fetch relay (runs inside GitHub Actions on the intake-cache branch).

Reads every requests/<rid>.json that has no responses/<rid>/done.json yet, fetches each URL with curl
and writes responses/<rid>/<n>.json (+ <n>.body for mode "body"). Stdlib only; no secrets are used.
Request file: {"requestId": rid, "createdAt": iso, "items": [{"url": "https://...", "mode": "body"|"status"}]}
"""
import hashlib, json, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

MAX_ITEMS = 400
MAX_BODY = 12 * 1024 * 1024
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36 GameAIcheckerIntake/1.0'
# Steam age gate: declare an adult birth date so the public store page renders; the parser still blocks
# if any wall remains. Only sent to Steam hosts.
STEAM_COOKIE = 'birthtime=0; lastagecheckage=1-January-1970; wants_mature_content=1; Steam_Language=english'


def now():
    return datetime.now(timezone.utc).isoformat()


def safe_url(url):
    return isinstance(url, str) and url.startswith('https://') and len(url) < 2048 and not re.search(r'[\s"\\]', url)


def fetch(url, mode, body_path, headers_path):
    cmd = ['curl', '-sS', '-L', '--max-time', '30', '--max-filesize', str(MAX_BODY), '-A', UA, '-D', str(headers_path),
           '-w', '%{http_code}\t%{content_type}\t%{url_effective}', '-o', str(body_path) if mode == 'body' else '/dev/null']
    host = re.sub(r'^https://([^/]+).*', r'\1', url)
    if host.endswith('steampowered.com') or host.endswith('steamcommunity.com'):
        cmd += ['-H', 'Cookie: ' + STEAM_COOKIE, '-H', 'Accept-Language: en-US,en;q=0.9']
    if mode == 'status':
        cmd += ['-r', '0-0']  # one byte is enough to read status and content type
    res = subprocess.run(cmd + [url], text=True, capture_output=True)
    parts = res.stdout.split('\t')
    status = int(parts[0]) if parts and parts[0].isdigit() else 0
    if mode == 'status' and status == 206:
        status = 200
    return status, (parts[1] if len(parts) > 1 else ''), (parts[2] if len(parts) > 2 else url), res.stderr[:200], res.returncode


def handle(req_path, root):
    req = json.loads(req_path.read_text())
    rid = req['requestId']
    if not re.fullmatch(r'[A-Za-z0-9_-]+', rid) or rid != req_path.stem:
        raise ValueError('bad request id')
    out = root / 'responses' / rid
    out.mkdir(parents=True, exist_ok=True)
    items = req.get('items', [])[:MAX_ITEMS]
    summary = []
    for n, item in enumerate(items):
        url, mode = item.get('url'), item.get('mode', 'body')
        meta_path = out / f'{n}.json'
        if meta_path.exists():
            summary.append(json.loads(meta_path.read_text()).get('httpStatus'))
            continue
        if not safe_url(url) or mode not in ('body', 'status'):
            meta = dict(url=url, mode=mode, httpStatus=0, error='rejected url', fetchedAt=now())
        else:
            body, headers = out / f'{n}.body', out / f'{n}.headers'
            for attempt in range(3):
                status, ctype, effective, err, code = fetch(url, mode, body, headers)
                if status not in (429, 500, 502, 503, 504) or attempt == 2:
                    break
                text = headers.read_text(errors='replace') if headers.exists() else ''
                retry = re.findall(r'(?im)^retry-after:\s*(\d+)', text)
                delay = int(retry[-1]) if retry else 2 ** (attempt + 1)
                if delay > 30:
                    break
                time.sleep(delay)
            meta = dict(url=url, mode=mode, httpStatus=status, contentType=ctype, effectiveUrl=effective,
                        curlExit=code, error=err, fetchedAt=now())
            if mode == 'body' and body.exists():
                meta['contentHash'] = hashlib.sha256(body.read_bytes()).hexdigest()
                meta['bytes'] = body.stat().st_size
            if headers.exists():
                meta['headers'] = headers.read_text(errors='replace')[-4000:]
                headers.unlink()
        meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
        summary.append(meta['httpStatus'])
        time.sleep(0.4)  # stay polite to Steam
    (out / 'done.json').write_text(json.dumps(dict(requestId=rid, count=len(items), statuses=summary, finishedAt=now())) + '\n')
    return rid, len(items)


def main():
    root = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
    for req in sorted((root / 'requests').glob('*.json')):
        if not (root / 'responses' / req.stem / 'done.json').exists():
            print(*handle(req, root), flush=True)


if __name__ == '__main__':
    main()
