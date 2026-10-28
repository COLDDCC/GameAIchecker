(() => {
  const $ = id => document.getElementById(id);
  const q = $('q'), area = $('area'), sort = $('sort'), reset = $('reset'), count = $('count'), empty = $('empty'), dist = $('dist');
  const keys = [...dist.querySelectorAll('.key')];
  const segments = [...dist.querySelectorAll('.dist-bar span')];
  const groups = [...document.querySelectorAll('#grid .group')];
  const items = groups.flatMap(g => [...g.querySelectorAll('.cards > li')]);
  const total = items.length;
  let status = 'all';

  const normalize = v => String(v || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

  // Restore state from the URL (/browse/?q=…&status=…&area=…&sort=…).
  const params = new URLSearchParams(location.search);
  q.value = params.get('q') || '';
  if ([...area.options].some(o => o.value === params.get('area'))) area.value = params.get('area');
  if ([...sort.options].some(o => o.value === params.get('sort'))) sort.value = params.get('sort');
  if (keys.some(k => k.dataset.status === params.get('status'))) status = params.get('status');

  function sortLists() {
    for (const list of document.querySelectorAll('#grid .cards')) {
      const rows = [...list.children];
      rows.sort(sort.value === 'new'
        ? (a, b) => (Number(b.dataset.year) || 0) - (Number(a.dataset.year) || 0) || a.dataset.name.localeCompare(b.dataset.name)
        : (a, b) => a.dataset.name.localeCompare(b.dataset.name));
      list.append(...rows);
    }
  }

  function render() {
    const term = normalize(q.value);
    let shown = 0;
    for (const item of items) {
      const match = (!term || normalize(item.dataset.search).includes(term))
        && (area.value === 'all' || (item.dataset.areas || '').split(' ').includes(area.value))
        && (status === 'all' || item.dataset.status === status);
      item.hidden = !match;
      if (match) shown++;
    }
    for (const group of groups) {
      const visible = group.querySelectorAll('.cards > li:not([hidden])').length;
      group.hidden = visible === 0;
      group.querySelector('[data-group-count]').textContent = visible;
    }
    for (const key of keys) key.setAttribute('aria-pressed', String(key.dataset.status === status));
    for (const seg of segments) seg.classList.toggle('on', seg.dataset.status === status);
    if (status === 'all') dist.removeAttribute('data-active'); else dist.setAttribute('data-active', '');

    const filtered = term || area.value !== 'all' || status !== 'all';
    count.textContent = filtered ? `${shown} of ${total} games` : `${total} games`;
    reset.hidden = !filtered && sort.value === 'name';
    empty.hidden = shown !== 0;

    const next = new URLSearchParams();
    if (q.value.trim()) next.set('q', q.value.trim());
    if (status !== 'all') next.set('status', status);
    if (area.value !== 'all') next.set('area', area.value);
    if (sort.value !== 'name') next.set('sort', sort.value);
    const qs = next.toString();
    history.replaceState(null, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
  }

  for (const key of keys) {
    key.disabled = false;
    key.addEventListener('click', () => { status = status === key.dataset.status ? 'all' : key.dataset.status; render(); });
  }
  for (const el of [q, area, sort]) el.disabled = false;
  q.addEventListener('input', render);
  area.addEventListener('change', render);
  sort.addEventListener('change', () => { sortLists(); render(); });
  reset.addEventListener('click', () => { q.value = ''; area.value = 'all'; sort.value = 'name'; status = 'all'; sortLists(); render(); q.focus(); });
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); }
  });

  sortLists();
  render();
})();
