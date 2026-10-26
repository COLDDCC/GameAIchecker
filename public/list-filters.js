(() => {
  const config = JSON.parse(document.getElementById('list-config').textContent);
  const cards = [...document.getElementById(config.gridId).children];
  const controls = Object.fromEntries(Object.entries(config.controls).filter(([, id]) => id).map(([key, id]) => [key, document.getElementById(id)]));
  const count = document.getElementById('count');
  const empty = document.createElement('p');
  empty.textContent = config.locale === 'zh' ? '没有匹配的游戏。试试其他关键词或状态。' : 'No matching games. Try another search or filter.';
  empty.hidden = true;
  document.getElementById(config.gridId).after(empty);
  const normalize = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  function render() {
    let shown = 0;
    for (const card of cards) {
      const matches = Object.entries(controls).every(([key, control]) => {
        if (key === 'query') return normalize(card.dataset.search).includes(normalize(control.value));
        return control.value === 'all' || (key === 'usage' ? (card.dataset.usage || '').split(' ').includes(control.value) : card.dataset[key] === control.value);
      });
      card.hidden = !matches;
      if (matches) shown++;
    }
    count.textContent = `${shown} / ${cards.length} ${config.locale === 'zh' ? '款游戏' : 'games'}`;
    empty.hidden = shown !== 0;
  }
  for (const control of Object.values(controls)) {
    control.disabled = false;
    control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render);
  }
  render();
})();
