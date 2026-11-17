(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const root = document.documentElement;
  const reader = $('#reader');
  const stage = $('#stage');
  const title = $('#post-title');
  const titleText = $('#title-text');
  const curtain = $('#curtain');
  const panel = $('#notes-panel');
  const backdrop = $('#panel-backdrop');
  const hud = $('#search-hud');
  const input = $('#search-input');
  const blocks = $$('[data-reveal]');
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const narrowQuery = matchMedia('(max-width: 860px)');
  const rapidEase = 'cubic-bezier(.16,1,.3,1)';
  const calmEase = 'cubic-bezier(.25,.1,.25,1)';
  const spatialEase = 'cubic-bezier(.4,0,.2,1)';
  const animations = new Map();
  let mode = 'proposed';
  let speed = 1;
  let introId = 0;
  let introActive = false;
  let notesOpen = false;
  let searchOpen = false;
  let tocOpen = true;
  let codeOpen = false;
  let drawerId = 0;
  let searchId = 0;
  let scrollId = 0;
  let revealObserver;
  let resetObserver;
  let headerObserver;
  let headerWasAway = false;
  let previousScroll = 0;
  let previousTime = performance.now();
  let lastVelocity = 0;
  let sceneFrame = 0;
  let searchTarget = null;
  let focusBeforeSearch = null;
  let focusBeforeNotes = null;
  const duration = ms => reducedQuery.matches ? 0 : ms * speed;
  const wait = ms => new Promise(resolve => setTimeout(resolve, duration(ms)));

  function stop(key) {
    const entry = animations.get(key);
    if (entry) { entry.cancel(); animations.delete(key); }
  }
  function play(key, el, frames, ms, easing = calmEase, extra = {}) {
    stop(key);
    const anim = el.animate(frames, { duration: duration(ms), easing, fill: 'both', ...extra });
    animations.set(key, anim);
    return anim.finished.catch(() => {}).then(() => {
      if (animations.get(key) !== anim) return false;
      anim.cancel();
      animations.delete(key);
      return true;
    });
  }
  function setStatus(message) {
    $('#status-label').textContent = mode === 'proposed' ? '建议方案' : '当前节奏';
    $('#status-text').textContent = message;
  }
  function selectScene(name) {
    $$('.scenario-nav button').forEach(button => button.classList.toggle('active', button.dataset.scene === name));
  }
  function reveal(el, instant = false) {
    if (instant) el.classList.add('instant');
    el.classList.add('is-in');
    if (instant) requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('instant')));
  }
  function revealVisible(instant = false) {
    const viewport = reader.getBoundingClientRect();
    for (const el of blocks) {
      const rect = el.getBoundingClientRect();
      if (rect.top < viewport.bottom + 60 && rect.bottom > viewport.top) reveal(el, instant);
    }
  }
  blocks.forEach(el => {
    const children = el.dataset.reveal === 'table' ? el.querySelectorAll('tr') : el.children;
    [...children].forEach((child, index) => child.style.setProperty('--i', String(Math.min(index, 8))));
  });
  // The same article is used for both modes; only its choreography changes.
  function observeReading() {
    revealObserver?.disconnect();
    resetObserver?.disconnect();
    headerObserver?.disconnect();
    headerWasAway = false;
    if (reducedQuery.matches) { blocks.forEach(el => reveal(el, true)); return; }
    revealObserver = new IntersectionObserver(entries => {
      if (introActive && mode === 'current') return;
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.target.classList.contains('is-in')) continue;
        const above = entry.boundingClientRect.top < reader.getBoundingClientRect().top;
        reveal(entry.target, above || (mode === 'proposed' && lastVelocity > 1.5));
      }
    }, { root: reader, rootMargin: mode === 'proposed' ? '0px 0px 64px 0px' : '0px 0px -4% 0px', threshold: 0 });
    blocks.forEach(el => revealObserver.observe(el));
    if (mode === 'current') {
      resetObserver = new IntersectionObserver(entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting && entry.boundingClientRect.top > reader.getBoundingClientRect().bottom + 120) {
            entry.target.classList.remove('is-in');
          }
        }
      }, { root: reader, rootMargin: '120px 0px 120px 0px', threshold: 0 });
      blocks.forEach(el => resetObserver.observe(el));
      headerObserver = new IntersectionObserver(entries => {
        if (introActive) return;
        const entry = entries[0];
        if (!entry.isIntersecting && entry.boundingClientRect.bottom < reader.getBoundingClientRect().top) headerWasAway = true;
        else if (entry.isIntersecting && headerWasAway) {
          headerWasAway = false;
          play('header-replay', titleText, [{ opacity: .2, transform: 'translateY(10px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'none' }], 700, rapidEase);
        }
      }, { root: reader });
      headerObserver.observe($('.article-header'));
    }
    revealVisible();
  }

  const fullTitle = titleText.textContent;
  const rawTokens = fullTitle.match(/（[^）]+）|[\p{Script=Han}]|[，。；：！？、）]+|[^\s\p{Script=Han}（），。；：！？、]+|\s+/gu) || [fullTitle];
  const tokens = [];
  for (const token of rawTokens) {
    // Keep closing punctuation with its preceding text instead of starting a line with it.
    if (/^[，。；：！？、）]+$/.test(token) && tokens.length) tokens[tokens.length - 1] += token;
    else tokens.push(token);
  }
  titleText.replaceChildren(...tokens.map(text => {
    if (/^\s+$/.test(text)) return document.createTextNode(text);
    const span = document.createElement('span');
    span.className = 'title-token';
    span.textContent = text;
    return span;
  }));
  const titleTokens = $$('.title-token');
  function cancelIntro() {
    introId++;
    introActive = false;
    stage.classList.remove('intro-hold');
    for (const key of [...animations.keys()]) if (key.startsWith('intro')) stop(key);
    curtain.style.display = 'none';
    title.style.removeProperty('transform');
    title.style.removeProperty('z-index');
    revealVisible(true);
  }
  async function replayIntro() {
    scrollId++;
    cancelIntro();
    setSearch(false, false);
    setNotes(false, false);
    reader.scrollTo({ top: 0, behavior: 'instant' });
    blocks.forEach(el => el.classList.remove('is-in', 'instant'));
    observeReading();
    selectScene('intro');
    const id = ++introId;
    introActive = true;
    setStatus(mode === 'proposed' ? '标题原位显现，阅读和操作立即可用。' : '墨晕 → 居中标题 → 归位 → 正文；滚动或点击可跳过。');
    if (reducedQuery.matches) { cancelIntro(); blocks.forEach(el => reveal(el, true)); return; }
    if (mode === 'current') {
      stage.classList.add('intro-hold');
      const titleRect = title.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const scale = narrowQuery.matches ? 1.03 : 1.25;
      const x = stageRect.left + stageRect.width / 2 - titleRect.left - titleRect.width / 2;
      const y = Math.max(0, stageRect.top + stageRect.height * .4 - titleRect.top - titleRect.height / 2);
      const transform = `translate(${x}px,${y}px) scale(${scale})`;
      title.style.transform = transform;
      title.style.zIndex = '19';
      curtain.style.display = 'block';
      const bloom = $('.ink-bloom');
      play('intro-bloom', bloom, [{ transform: 'scale(.06)', opacity: .6 }, { transform: 'scale(2)', opacity: .18 }], 220, 'cubic-bezier(.55,.05,.68,.53)');
      await play('intro-curtain-in', curtain, [{ opacity: 0 }, { opacity: 1 }], 220, 'ease-in');
      if (id !== introId) return;
      play('intro-curtain-out', curtain, [{ opacity: 1 }, { opacity: 0 }], 280, rapidEase).then(() => { if (id === introId) curtain.style.display = 'none'; });
      const stagger = Math.min(340, 20 * titleTokens.length) / Math.max(1, titleTokens.length);
      await Promise.all(titleTokens.map((token, i) => play(`intro-char-${i}`, token,
        [{ opacity: 0, transform: 'translateY(14px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'none' }],
        500, 'cubic-bezier(.215,.61,.355,1)', { delay: duration(40 + i * stagger) })));
      if (id !== introId) return;
      await wait(180);
      if (id !== introId) return;
      title.style.transform = 'none';
      await play('intro-dock', title, [{ transform }, { transform: 'none' }], 620, 'cubic-bezier(.65,0,.35,1)');
      if (id !== introId) return;
      stage.classList.remove('intro-hold');
      title.style.removeProperty('transform');
      title.style.removeProperty('z-index');
      $$('.intro-secondary').forEach((el, i) => play(`intro-secondary-${i}`, el, [{ opacity: 0, transform: 'translateX(-46px)' }, { opacity: 1, transform: 'none' }], 820, rapidEase, { delay: duration(i * 80) }));
      play('intro-body', $('.article-below'), [{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], 780, rapidEase);
    } else {
      curtain.style.display = 'block';
      play('intro-curtain', curtain, [{ opacity: .65 }, { opacity: 0 }], 360, calmEase).then(() => { if (id === introId) curtain.style.display = 'none'; });
      const total = titleTokens.length - 1 || 1;
      const promises = titleTokens.map((token, i) => play(`intro-char-${i}`, token, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], 650, calmEase, { delay: duration(i / total * 120) }));
      $$('.intro-secondary').forEach((el, i) => play(`intro-secondary-${i}`, el, [{ opacity: 0 }, { opacity: 1 }], 560, calmEase, { delay: duration(40 + i * 40) }));
      play('intro-body', $('.article-below'), [{ opacity: 0 }, { opacity: 1 }], 600, calmEase, { delay: duration(80) });
      await Promise.all(promises);
    }
    if (id !== introId) return;
    introActive = false;
    revealVisible();
    setStatus('向下阅读，再向上回看；也可以打开右下角的笔记。');
  }

  function animateHeight(key, el, finalHeight, ms, content = false) {
    const fromHeight = el.getBoundingClientRect().height;
    const opacity = getComputedStyle(el).opacity;
    stop(key);
    el.style.height = `${finalHeight}px`;
    const oldStyle = mode === 'current';
    const frames = [
      { height: `${fromHeight}px`, opacity: content && oldStyle ? opacity : 1, transform: content && oldStyle ? 'translateY(-6px)' : 'none' },
      { height: `${finalHeight}px`, opacity: content && oldStyle && finalHeight === 0 ? 0 : 1, transform: 'none' },
    ];
    return play(key, el, frames, ms, oldStyle ? rapidEase : spatialEase);
  }
  async function toggleToc() {
    cancelIntro();
    const el = $('#toc-content');
    tocOpen = !tocOpen;
    $('#toc-toggle').setAttribute('aria-expanded', String(tocOpen));
    const targetHeight = tocOpen ? el.firstElementChild.getBoundingClientRect().height + 14 : 0;
    const delta = Math.abs(targetHeight - el.getBoundingClientRect().height);
    const ms = mode === 'current' ? (tocOpen ? 450 : 420) : Math.min(520, Math.max(360, delta * 1.25));
    const completed = await animateHeight('toc', el, targetHeight, ms, true);
    if (completed && tocOpen) el.style.height = 'auto';
    revealVisible();
    setStatus(mode === 'proposed' ? '目录按高度变化平稳开合，点击可随时反向。' : '目录使用 450 / 420ms 的快速起步曲线。');
  }
  async function toggleCode() {
    cancelIntro();
    const content = $('#code-content');
    codeOpen = !codeOpen;
    $('#code-toggle').setAttribute('aria-expanded', String(codeOpen));
    $('#code-toggle').innerHTML = codeOpen ? '收起代码 <span>↕</span>' : '展开代码 <span>↕</span>';
    $('#code-veil').hidden = codeOpen;
    const targetHeight = codeOpen ? content.querySelector('pre').getBoundingClientRect().height : 230;
    const delta = Math.abs(targetHeight - content.getBoundingClientRect().height);
    const ms = mode === 'current' ? (codeOpen ? 380 : 340) : Math.min(600, Math.max(380, delta * .8));
    const completed = await animateHeight('code', content, targetHeight, ms);
    if (completed) {
      content.classList.toggle('collapsed', !codeOpen);
      content.style.height = codeOpen ? 'auto' : '230px';
    }
    revealVisible();
    setStatus(mode === 'proposed' ? '长代码随展开距离调整时长，连续点击从当前高度反向。' : '长代码按固定 380 / 340ms 开合。');
  }

  async function setNotes(open, animate = true) {
    const id = ++drawerId;
    const wasHidden = panel.hidden;
    const style = getComputedStyle(panel);
    const fromTransform = wasHidden ? (narrowQuery.matches ? 'translateY(110%)' : 'translateX(110%) scale(.985)') : style.transform;
    const fromOpacity = wasHidden ? 0 : Number(style.opacity);
    stop('notes');
    notesOpen = open;
    $('#notes-open').setAttribute('aria-expanded', String(open));
    if (open && wasHidden) focusBeforeNotes = document.activeElement;
    stage.classList.toggle('notes-open', open);
    backdrop.hidden = !(open && narrowQuery.matches);
    panel.inert = !open;
    panel.setAttribute('aria-hidden', String(!open));
    if (open) panel.hidden = false;
    const targetTransform = open ? 'none' : narrowQuery.matches ? 'translateY(110%)' : 'translateX(110%) scale(.985)';
    if (!animate || reducedQuery.matches) {
      panel.hidden = !open;
      return;
    }
    if (open) $('#notes-close').focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) (focusBeforeNotes?.isConnected ? focusBeforeNotes : $('#notes-open')).focus({ preventScroll: true });
    const ms = mode === 'current' ? 380 : narrowQuery.matches ? 540 : 520;
    await play('notes', panel, [{ transform: fromTransform, opacity: fromOpacity }, { transform: targetTransform, opacity: open ? 1 : 0 }], ms, mode === 'current' ? rapidEase : spatialEase);
    if (id === drawerId) panel.hidden = !open;
    setStatus(mode === 'proposed' ? '笔记与正文同步舒展；页签仅轻淡入，外框保持稳定。' : '抽屉 380ms，正文避让 420ms，前段位移集中。');
  }
  async function setNoteTab(kind) {
    $$('[data-note-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.noteTab === kind)));
    $('#excerpt-notes').hidden = kind !== 'excerpt';
    $('#thought-notes').hidden = kind !== 'thought';
    const target = kind === 'excerpt' ? $('#excerpt-notes') : $('#thought-notes');
    for (const key of ['note-tab-excerpt', 'note-tab-thought']) stop(key);
    const current = mode === 'current';
    await play(`note-tab-${kind}`, target,
      [{ opacity: 0, transform: `translateX(${current ? (kind === 'excerpt' ? 28 : -28) : 0}px)`, filter: current ? 'blur(4px)' : 'none', clipPath: current ? 'inset(0 24% 0 0)' : 'inset(0)' },
        { opacity: 1, transform: 'none', filter: 'none', clipPath: 'inset(0)' }], current ? 340 : 260, current ? rapidEase : calmEase);
  }
  function updateSearch() {
    const query = input.value.trim().toLocaleLowerCase();
    const results = $('#search-results');
    results.replaceChildren();
    if (!query) { const p = document.createElement('p'); p.textContent = '试试搜索「反射」「UHT」或「generated」'; results.append(p); return; }
    const found = blocks.filter(el => el.textContent.toLocaleLowerCase().includes(query)).slice(0, 6);
    if (!found.length) { const p = document.createElement('p'); p.textContent = '没有找到匹配内容。'; results.append(p); }
    found.forEach(el => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 100);
      button.addEventListener('click', async () => {
        setSearch(false);
        searchTarget?.classList.remove('search-hit');
        searchTarget = el;
        await goTo(el);
        el.classList.add('search-hit');
      });
      results.append(button);
    });
  }
  async function setSearch(open, animate = true) {
    const id = ++searchId;
    const wasHidden = hud.hidden;
    const style = getComputedStyle(hud);
    const fromOpacity = wasHidden ? 0 : Number(style.opacity);
    const fromTransform = wasHidden ? (mode === 'current' ? 'translateY(-26px) scale(.96)' : 'translateY(-8px)') : style.transform;
    const fromFilter = wasHidden ? (mode === 'current' ? 'blur(4px)' : 'none') : style.filter;
    stop('search');
    searchOpen = open;
    $('#search-open').setAttribute('aria-expanded', String(open));
    hud.inert = !open;
    if (open && wasHidden) focusBeforeSearch = document.activeElement;
    if (open) { hud.hidden = false; updateSearch(); input.focus({ preventScroll: true }); }
    else if (hud.contains(document.activeElement)) (focusBeforeSearch?.isConnected ? focusBeforeSearch : $('#search-open')).focus({ preventScroll: true });
    if (!animate || reducedQuery.matches) { hud.hidden = !open; return; }
    const current = mode === 'current';
    const targetTransform = open ? 'none' : current ? 'translateY(-20px) scale(.96)' : 'translateY(-6px)';
    await play('search', hud, [{ opacity: fromOpacity, transform: fromTransform, filter: fromFilter }, { opacity: open ? 1 : 0, transform: targetTransform, filter: !open && current ? 'blur(3px)' : 'none' }], current ? (open ? 680 : 560) : (open ? 300 : 220), current ? rapidEase : calmEase);
    if (id === searchId) hud.hidden = !open;
  }

  // A bounded, cancellable scroll keeps keyboard and pointer input in control.
  function goTo(el) {
    cancelIntro();
    const id = ++scrollId;
    reveal(el, true);
    const start = reader.scrollTop;
    const end = Math.max(0, Math.min(reader.scrollHeight - reader.clientHeight, el.getBoundingClientRect().top - reader.getBoundingClientRect().top + start - 28));
    const ms = duration(480);
    if (!ms) { reader.scrollTop = end; revealVisible(true); return Promise.resolve(); }
    return new Promise(resolve => {
      const begin = performance.now();
      function tick(now) {
        if (id !== scrollId) { resolve(); return; }
        const t = Math.min(1, (now - begin) / ms);
        const eased = t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2;
        reader.scrollTop = start + (end - start) * eased;
        revealVisible(true);
        if (t < 1) requestAnimationFrame(tick); else resolve();
      }
      requestAnimationFrame(tick);
    });
  }
  async function scene(name) {
    cancelIntro();
    selectScene(name);
    if (name === 'intro') { replayIntro(); return; }
    if (name === 'reading') {
      await goTo($('#section-intro'));
      replayVisible();
    } else if (name === 'toc') {
      await goTo($('#toc'));
      toggleToc();
    } else if (name === 'code') {
      await goTo($('#section-code'));
      toggleCode();
    } else if (name === 'notes') setNotes(!notesOpen);
    else if (name === 'search') setSearch(!searchOpen);
  }
  function replayVisible() {
    cancelIntro();
    const viewport = reader.getBoundingClientRect();
    const visible = blocks.filter(el => { const r = el.getBoundingClientRect(); return r.bottom > viewport.top && r.top < viewport.bottom; });
    if (!visible.length) {
      goTo($('#section-intro')).then(replayVisible);
      return;
    }
    visible.forEach(el => el.classList.remove('is-in', 'instant'));
    void reader.offsetHeight;
    requestAnimationFrame(() => visible.forEach(el => reveal(el, reducedQuery.matches)));
    setStatus(mode === 'proposed' ? '这里只为比较手动重播；正常阅读中，已读内容不会再次淡入。' : '观察段落上浮、标题横移，以及列表逐项出现的节奏。');
  }
  function updateMode(next) {
    if (mode === next) return;
    cancelIntro();
    stop('header-replay');
    mode = next;
    root.dataset.mode = mode;
    $$('[data-mode-button]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.modeButton === mode)));
    $('#mode-description').textContent = mode === 'proposed' ? '原位显现 · 回看稳定 · 面板同步舒展' : '居中归位 · 回看重播 · 快起步、长拖尾';
    observeReading();
    setStatus('已在同一阅读位置切换，可以重播当前正文比较。');
    if (reader.scrollTop < 100) replayIntro();
    else replayVisible();
  }

  $$('[data-mode-button]').forEach(button => button.addEventListener('click', () => updateMode(button.dataset.modeButton)));
  $$('[data-scene]').forEach(button => button.addEventListener('click', () => scene(button.dataset.scene)));
  $('#replay').addEventListener('click', replayIntro);
  $('#replay-visible').addEventListener('click', replayVisible);
  $('#toc-toggle').addEventListener('click', toggleToc);
  $('#code-toggle').addEventListener('click', toggleCode);
  $('#code-veil').addEventListener('click', toggleCode);
  $('#notes-open').addEventListener('click', () => { cancelIntro(); selectScene('notes'); setNotes(!notesOpen); });
  $('#notes-close').addEventListener('click', () => setNotes(false));
  backdrop.addEventListener('click', () => setNotes(false));
  $$('[data-note-tab]').forEach(button => button.addEventListener('click', () => setNoteTab(button.dataset.noteTab)));
  $('#search-open').addEventListener('click', () => { cancelIntro(); selectScene('search'); setSearch(!searchOpen); });
  $('#search-close').addEventListener('click', () => setSearch(false));
  input.addEventListener('input', updateSearch);
  $$('.toc-links a').forEach(link => link.addEventListener('click', event => {
    event.preventDefault();
    const target = $(link.getAttribute('href'));
    if (target) goTo(target);
  }));
  $('#speed').addEventListener('click', () => {
    speed = speed === 1 ? 2 : 1;
    root.style.setProperty('--time-scale', String(speed));
    $('#speed').innerHTML = `${speed === 1 ? '1×' : '0.5×'} <span>速度</span>`;
    $('#speed').setAttribute('aria-pressed', String(speed === 2));
    setStatus(speed === 2 ? '半速观察已开启；时长放大两倍，便于看清运动轨迹。' : '恢复正常播放速度。');
  });
  $('#theme').addEventListener('change', event => { root.dataset.theme = event.target.value; });
  $('#font').addEventListener('click', () => {
    cancelIntro();
    root.dataset.font = root.dataset.font === 'pixel' ? 'kai' : 'pixel';
    $('#font').setAttribute('aria-pressed', String(root.dataset.font === 'kai'));
  });
  function userScroll() {
    scrollId++;
    if (introActive && mode === 'current') cancelIntro();
  }
  reader.addEventListener('wheel', userScroll, { passive: true });
  reader.addEventListener('touchstart', userScroll, { passive: true });
  reader.addEventListener('pointerdown', () => { if (introActive && mode === 'current') cancelIntro(); });
  reader.addEventListener('scroll', () => {
    const now = performance.now();
    lastVelocity = Math.abs(reader.scrollTop - previousScroll) / Math.max(1, now - previousTime);
    previousScroll = reader.scrollTop;
    previousTime = now;
    $('#progress').style.transform = `scaleX(${reader.scrollTop / Math.max(1, reader.scrollHeight - reader.clientHeight)})`;
    if (!sceneFrame) sceneFrame = requestAnimationFrame(() => { sceneFrame = 0; if (mode === 'proposed' && lastVelocity > 1.5) revealVisible(true); });
  }, { passive: true });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (searchOpen) setSearch(false);
      else if (notesOpen) setNotes(false);
      else cancelIntro();
      return;
    }
    const editing = event.target instanceof Element && event.target.matches('input,textarea,[contenteditable=true],select');
    if (event.key === '/' && !editing) { event.preventDefault(); cancelIntro(); setSearch(true); }
    if (!editing && ['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key)) userScroll();
    if (event.key === 'Tab' && notesOpen && narrowQuery.matches && !searchOpen) {
      const focusable = [...panel.querySelectorAll('button')].filter(el => !el.hidden && !el.closest('[hidden]'));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  });
  narrowQuery.addEventListener('change', () => {
    cancelIntro();
    stop('notes');
    panel.hidden = !notesOpen;
    backdrop.hidden = !(notesOpen && narrowQuery.matches);
  });
  reducedQuery.addEventListener('change', () => {
    cancelIntro();
    for (const anim of animations.values()) anim.finish();
    observeReading();
    $('#reduced-notice').hidden = !reducedQuery.matches;
  });
  $('#reduced-notice').hidden = !reducedQuery.matches;
  panel.inert = true;
  hud.inert = true;
  root.classList.add('motion-ready');
  observeReading();
  // Wait for the local font before measuring the title's starting rectangle.
  Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1200))]).then(replayIntro);
})();
