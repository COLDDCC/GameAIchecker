// Filtering for the shared list pages (/browse/, /games/, /indie-ai/, Next Fest).
// Works on the static cards rendered by src/lib/list-pages.js:
//   <li data-search data-status data-areas data-name data-year data-reviewed ...>
// Controls: #q (text), [data-filter-status] buttons, select[data-filter=<attr>],
// #sort. State is mirrored to the URL (?q=&status=&area=&sort=…).
(() => {
  const zh = document.documentElement.lang.toLowerCase().startsWith('zh');
  const q = document.getElementById('q');
  const sort = document.getElementById('sort');
  const reset = document.getElementById('reset');
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const dist = document.getElementById('dist');
  const keys = [...document.querySelectorAll('[data-filter-status]')];
  const segments = dist ? [...dist.querySelectorAll('.dist-bar span')] : [];
  const selects = [...document.querySelectorAll('select[data-filter]')];
  const groups = [...document.querySelectorAll('.group')];
  const lists = [...document.querySelectorAll('.group .cards')];
  const items = lists.flatMap(list => [...list.children]);
  const total = items.length;
  if (!q || !total) return;
  let status = 'all';

  const games = n => zh ? `${n} 款游戏` : `${n} game${n === 1 ? '' : 's'}`;
  const normalize = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Restore state from the URL.
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') || '';
  for (const select of [...selects, sort].filter(Boolean)) {
    const value = params.get(select.dataset.param);
    if ([...select.options].some(o => o.value === value)) select.value = value;
  }
  if (keys.some(k => k.dataset.filterStatus === params.get('status'))) status = params.get('status');

  const byName = (a, b) => a.dataset.name.localeCompare(b.dataset.name);
  const sorters = {
    name: byName,
    new: (a, b) => (Number(b.dataset.year) || 0) - (Number(a.dataset.year) || 0) || byName(a, b),
    reviewed: (a, b) => (b.dataset.reviewed || '').localeCompare(a.dataset.reviewed || '') || byName(a, b),
  };
  function applySort() {
    const fn = sorters[sort?.value] || byName;
    for (const list of lists) list.append(...[...list.children].sort(fn));
  }

  function render() {
    const term = normalize(q.value);
    let shown = 0;
    for (const item of items) {
      const match = (!term || normalize(item.dataset.search).includes(term))
        && (status === 'all' || item.dataset.status === status)
        && selects.every(s => s.value === 'all' || (item.dataset[s.dataset.filter] || '').split(' ').includes(s.value));
      item.hidden = !match;
      if (match) shown++;
    }
    for (const group of groups) {
      const visible = group.querySelectorAll('.cards > li:not([hidden])').length;
      group.hidden = visible === 0;
      const n = group.querySelector('[data-group-count]');
      if (n) n.textContent = visible;
    }
    for (const key of keys) key.setAttribute('aria-pressed', String(key.dataset.filterStatus === status));
    for (const seg of segments) seg.classList.toggle('on', seg.dataset.status === status);
    if (dist) dist.toggleAttribute('data-active', status !== 'all');

    const filtered = Boolean(term) || status !== 'all' || selects.some(s => s.value !== 'all');
    count.textContent = filtered ? (zh ? `${shown} / ${total} 款游戏` : `${shown} of ${games(total)}`) : games(total);
    if (reset) reset.hidden = !filtered && (!sort || sort.value === 'name');
    if (empty) empty.hidden = shown !== 0;

    const next = new URLSearchParams();
    if (q.value.trim()) next.set('q', q.value.trim());
    if (status !== 'all') next.set('status', status);
    for (const s of selects) if (s.value !== 'all') next.set(s.dataset.param, s.value);
    if (sort && sort.value !== 'name') next.set('sort', sort.value);
    const qs = next.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  for (const key of keys) {
    key.disabled = false;
    key.addEventListener('click', () => { status = status === key.dataset.filterStatus ? 'all' : key.dataset.filterStatus; render(); });
  }
  for (const el of [q, sort, ...selects].filter(Boolean)) el.disabled = false;
  q.addEventListener('input', render);
  for (const s of selects) s.addEventListener('change', render);
  sort?.addEventListener('change', () => { applySort(); render(); });
  reset?.addEventListener('click', () => {
    q.value = ''; status = 'all';
    for (const s of selects) s.value = 'all';
    if (sort) sort.value = 'name';
    applySort(); render(); q.focus();
  });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  applySort();
  render();
})();
