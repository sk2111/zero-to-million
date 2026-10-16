/* Tomazon War Room · wiring
   One simulation, stepped at a fixed 0.1 s; the diagram animates every frame
   and the panels refresh five times a second. Story mode walks the chapters
   and their scenes; a scene either shows an interactive card (Chapter 1's
   decisions) or the live board. Free play unlocks everything. */
(function () {
  'use strict';
  const TZ = window.TZ;
  const $ = (id) => document.getElementById(id);
  const chapters = TZ.CHAPTERS;
  const CTRLS = ['traffic', 'vm', 'swap', 'conns', 'line', 'reboot', 'speed'];
  const IP = '203.0.113.42';
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const p2 = (n) => String(n).padStart(2, '0');
  const parseClock = (c) => { const [h, m, s] = String(c).split(':').map(Number); return h * 3600 + (m || 0) * 60 + (s || 0); };

  const sim = new TZ.Sim();
  const flow = new TZ.Flow($('stageBody'), $('flow'), $('nodeBrowser'), $('nodeVm'), $('legendScale'));
  const metrics = new TZ.Metrics();
  const term = new TZ.Terminal(sim);
  const overlays = new TZ.Overlays($('overlay'), $('overlayInner'), {
    onClose: () => { $('overlayBtn').hidden = state.mode !== 'story' || !scene().overlay; },
    run: (cmd) => runChip(cmd)
  });

  const state = { mode: 'story', ch: 0, scene: 0, speed: 1, blind: false, unlocked: new Set(), decided: new Set(), dragging: false, lastUi: 0, viewKey: '' };
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  };
  const chap = () => chapters[state.ch];
  const scenesOf = () => chap().scenes;
  const scene = () => scenesOf()[state.scene];

  /* ---------- controls ---------- */
  const toSlider = (r) => Math.round((1000 * Math.log(Math.max(r, 0.5) / 0.5)) / Math.log(400));
  const fromSlider = (v) => 0.5 * Math.pow(400, v / 1000);
  const ramLabel = (mb) => (mb >= 1024 ? mb / 1024 + ' GB' : mb + ' MB');

  const vmSel = $('vmSize');
  vmSel.innerHTML = TZ.VM_SIZES.map((v) => '<option value="' + v.id + '">' + v.label + ' · $' + v.cost + '/month</option>').join('');

  const traffic = $('traffic');
  traffic.addEventListener('pointerdown', () => { state.dragging = true; });
  window.addEventListener('pointerup', () => { state.dragging = false; });
  traffic.addEventListener('input', () => { sim.setRps(fromSlider(+traffic.value)); syncControls(); });
  $('viralBtn').addEventListener('click', () => sim.setRamp(34, 25));
  $('calmBtn').addEventListener('click', () => sim.setRamp(3, 8));
  vmSel.addEventListener('change', () => sim.resize(vmSel.value));
  $('swapToggle').addEventListener('change', (e) => sim.setSwap(e.target.checked));
  $('conns').addEventListener('input', (e) => { sim.setConns(+e.target.value); syncControls(); });
  $('lineMode').addEventListener('change', (e) => sim.setLine(+e.target.value));
  $('rebootBtn').addEventListener('click', () => sim.reboot());
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));

  function setSpeed(n) {
    state.speed = n;
    document.querySelectorAll('.speed button').forEach((x) => x.setAttribute('aria-pressed', String(+x.dataset.speed === n)));
  }

  function syncControls() {
    if (!state.dragging && document.activeElement !== traffic) traffic.value = toSlider(sim.rps);
    const rising = sim.ramp ? (sim.ramp.to > sim.rps ? ' rising' : ' falling') : '';
    $('trafficOut').textContent = TZ.fmtRate(sim.rps) + ' req/s' + rising;
    const target = sim.pendingVm || sim.vm;
    if (document.activeElement !== vmSel) vmSel.value = target.id;
    $('vmNote').textContent = sim.pendingVm ? 'resizing…' : '';
    $('swapToggle').checked = sim.swapOn;
    if (document.activeElement !== $('conns')) $('conns').value = sim.maxConns;
    $('connsOut').textContent = sim.maxConns;
    $('lineMode').value = sim.lineMax <= 50 ? '20' : '511';
    $('costLabel').textContent = '$' + target.cost + ' / month';
    $('rebootBtn').disabled = sim.down > 0 || isLocked('reboot');
  }

  const isLocked = (id) => state.mode === 'story' && !state.unlocked.has(id);
  function applyLocks() {
    let n = 0;
    for (const id of CTRLS) {
      const box = document.querySelector('[data-ctrl="' + id + '"]');
      const locked = isLocked(id);
      if (locked) n++;
      box.classList.toggle('is-locked', locked);
      box.querySelectorAll('input, select, button').forEach((i) => { i.disabled = locked; });
    }
    const note = $('lockNote');
    note.hidden = n === 0;
    note.textContent = n === CTRLS.length ? 'The controls unlock later in the story.' : 'Dimmed controls unlock later in the story.';
  }

  /* ---------- chapters ---------- */
  function renderChapterNav() {
    const nav = $('chapterNav');
    nav.innerHTML = '';
    chapters.forEach((c, k) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chap-btn';
      b.innerHTML = '<span class="chapter-num">Chapter ' + c.number + '</span><span class="chapter-title">' + c.title + '</span>';
      if (k === state.ch && state.mode === 'story') b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => { if (state.mode !== 'story') { state.mode = 'story'; showMode(); } goScene(k, 0); });
      nav.appendChild(b);
    });
  }

  function renderDots() {
    const dots = $('sceneDots');
    dots.innerHTML = '';
    scenesOf().forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', 'Scene ' + (i + 1) + ': ' + s.title);
      b.title = s.title;
      b.addEventListener('click', () => goScene(state.ch, i));
      dots.appendChild(b);
    });
  }

  /* ---------- the simulation behind a scene ---------- */
  function applySim(tag) {
    const key = chap().id + ':' + tag;
    if (!tag || sim.tag === key) return;
    loadSpec(chap().sims[tag], key);
  }
  function loadSpec(spec, key) {
    sim.reset(Object.assign({}, spec, { tag: key }));
    flow.clear(); metrics.clear();
    state.viewKey = '';
    if (spec.term) term.reset(spec.term);
    setSpeed(1);
  }
  function makeLive() {
    if (sim.live) return;
    ['nginx', 'db', 'app'].forEach((w) => sim.install(w));
    sim.repo = true; sim.pyVenv = true; sim.dns = true;
    sim.setRps(0.6);
    term.say('# (Skipped ahead: Tomazon was deployed for you.)', 't-dim');
  }

  function setBlind(on) {
    state.blind = on;
    $('stage').classList.toggle('is-blind', on);
    $('board').classList.toggle('is-blind-board', on);
    $('metricsFog').hidden = !on;
  }

  /* ---------- Chapter 1 cards and the "Your stack" panel ---------- */
  const cardApi = {
    decide: (key) => { state.decided.add(key); renderSide(scene()); },
    run: (cmd) => runChip(cmd)
  };
  function renderCard(sc) {
    TZ.Cards.clear();
    const main = $('paneMain');
    main.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'card card-' + sc.card.kind;
    main.appendChild(wrap);
    TZ.Cards[sc.card.kind](wrap, sc, cardApi);
    renderSide(sc);
  }
  function renderSide(sc) {
    const side = $('paneSide'), stack = chap().stack;
    const show = !!(stack && sc.hour != null);
    side.hidden = !show;
    $('scenePane').classList.toggle('no-side', !show);
    if (!show) return;
    const lastIdx = (key) => scenesOf().reduce((k, s, j) => (s.decides === key ? j : k), -1);
    const rows = stack.map((r) => {
      const li = lastIdx(r.key);
      const done = state.decided.has(r.key) || (li >= 0 && li < state.scene);
      const st = done ? 'done' : sc.decides === r.key ? 'current' : 'todo';
      return '<li data-state="' + st + '"><span class="sl-k">' + r.label + '</span><span class="sl-v">' + (st === 'done' ? r.value : st === 'current' ? 'deciding…' : '–') + '</span></li>';
    }).join('');
    const h = Math.min(48, sc.hour);
    side.innerHTML =
      '<div class="clock48"><p class="eyebrow">The 48-hour window</p><div class="c48-bar"><i style="width:' + ((h / 48) * 100).toFixed(1) + '%"></i></div>' +
      '<p class="c48-read"><b>Hour ' + Math.floor(h) + '</b> of 48' + (h >= 48 ? ' · shipped' : ' · ' + Math.ceil(48 - h) + ' left') + '</p></div>' +
      '<div class="stack-list"><p class="eyebrow">Your stack</p><ol>' + rows + '</ol></div>';
  }

  /* ---------- story ---------- */
  function goScene(ch, i) {
    if (ch !== state.ch || !$('sceneDots').childElementCount) { state.ch = ch; renderDots(); }
    renderChapterNav();
    const scenes = scenesOf();
    i = Math.max(0, Math.min(scenes.length - 1, i));
    state.scene = i;
    const sc = scenes[i];
    $('storyKicker').textContent = sc.kicker;
    $('storyTitle').textContent = sc.title;
    $('storyBody').innerHTML = sc.body;
    $('notesBody').innerHTML = sc.notes || '<p>No notes for this scene.</p>';
    const chips = $('storyChips');
    chips.innerHTML = '';
    (sc.chips || []).forEach((cmd) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.textContent = cmd; b.dataset.cmd = cmd;
      b.title = 'Type this into the terminal';
      b.addEventListener('click', () => runChip(cmd));
      chips.appendChild(b);
    });
    $('sceneCount').textContent = (i + 1) + ' / ' + scenes.length;
    [...$('sceneDots').children].forEach((d, j) => {
      d.classList.toggle('is-past', j < i);
      if (j === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    const lastScene = i === scenes.length - 1, lastChapter = state.ch === chapters.length - 1;
    $('prevBtn').disabled = i === 0 && state.ch === 0;
    $('nextBtn').textContent = !lastScene ? 'Next' : lastChapter ? 'Free play' : 'Chapter ' + chapters[state.ch + 1].number;

    const isCard = !!sc.card;
    $('board').hidden = isCard;
    $('scenePane').hidden = !isCard;
    if (isCard) {
      overlays.hide();
      setBlind(false);
      renderCard(sc);
    } else {
      TZ.Cards.clear();
      applySim(sc.sim);
      if (sc.ensureLive) makeLive();
      if (sc.clockJump) sim.clock0 = parseClock(sc.clockJump) - sim.t;
      setBlind(!!sc.blind);
      if (sc.overlay) overlays.show(sc.overlay, chap().content); else overlays.hide();
    }
    state.unlocked = new Set(sc.unlock || []);
    applyLocks();
    syncControls();
    $('overlayBtn').hidden = true;
    try { history.replaceState(null, '', '#c' + chap().number + 's' + (i + 1)); } catch (e) { /* not allowed here: fine */ }
    updateUi();
  }

  function showMode() {
    const free = state.mode === 'free';
    $('modeStory').setAttribute('aria-pressed', String(!free));
    $('modeFree').setAttribute('aria-pressed', String(free));
    $('story').hidden = free;
    $('freebar').hidden = !free;
  }

  function setMode(mode) {
    state.mode = mode;
    showMode();
    if (mode === 'free') {
      overlays.hide();
      TZ.Cards.clear();
      $('board').hidden = false;
      $('scenePane').hidden = true;
      setBlind(false);
      if (!sim.live) loadSpec(chapters[1].sims.quiet, 'free');
      sim.tag = 'free';
      renderChapterNav();
      applyLocks();
      syncControls();
      try { history.replaceState(null, '', '#free'); } catch (e) { /* fine */ }
    } else {
      goScene(state.ch, state.scene);
    }
  }

  function next() {
    const n = scenesOf().length;
    if (state.scene < n - 1) goScene(state.ch, state.scene + 1);
    else if (state.ch < chapters.length - 1) goScene(state.ch + 1, 0);
    else setMode('free');
  }
  function prev() {
    if (state.scene > 0) goScene(state.ch, state.scene - 1);
    else if (state.ch > 0) goScene(state.ch - 1, chapters[state.ch - 1].scenes.length - 1);
  }

  function runChip(cmd) {
    if (overlays.open) overlays.hide();
    const ok = term.type(cmd);
    const r = $('terminal').getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) $('terminal').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!ok) $('termWait').hidden = false;
  }
  term.onRun = (cmd) => {
    document.querySelectorAll('.story-chips .chip').forEach((c) => { if (c.dataset.cmd === cmd) c.classList.add('is-done'); });
  };

  function toggleNotes(force) {
    const on = force != null ? force : $('notes').hidden;
    $('notes').hidden = !on;
    $('notesBtn').setAttribute('aria-expanded', String(on));
    store.set('tz-notes', on ? '1' : '0');
  }

  $('nextBtn').addEventListener('click', next);
  $('prevBtn').addEventListener('click', prev);
  $('notesBtn').addEventListener('click', () => toggleNotes());
  $('overlayBtn').addEventListener('click', () => { const o = scene().overlay; if (o) { overlays.show(o, chap().content); $('overlayBtn').hidden = true; } });
  $('modeStory').addEventListener('click', () => setMode('story'));
  $('modeFree').addEventListener('click', () => setMode('free'));
  $('backToStory').addEventListener('click', () => setMode('story'));

  document.addEventListener('keydown', (e) => {
    const a = document.activeElement;
    const tag = (a && a.tagName) || '';
    const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
    if (term.htop && a === $('termScreen')) return;
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (state.mode === 'story' && (e.key === 'PageDown' || (!typing && e.key === 'ArrowRight'))) { e.preventDefault(); next(); }
    else if (state.mode === 'story' && (e.key === 'PageUp' || (!typing && e.key === 'ArrowLeft'))) { e.preventDefault(); prev(); }
    else if (!typing && (e.key === 'n' || e.key === 'N') && state.mode === 'story') toggleNotes();
    else if (e.key === 'Escape' && overlays.open) { overlays.hide(); $('overlayBtn').hidden = !scene().overlay; }
  });

  /* ---------- theme ---------- */
  const root = document.documentElement;
  function themeChanged() {
    const t = root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    $('themeLight').setAttribute('aria-pressed', String(t === 'light'));
    $('themeDark').setAttribute('aria-pressed', String(t === 'dark'));
    flow.readColors();
    metrics.recolor();
  }
  function setTheme(t) {
    store.set('tz-theme', t);
    if (root.getAttribute('data-theme') !== t) root.setAttribute('data-theme', t);
    themeChanged();
  }
  $('themeLight').addEventListener('click', () => setTheme('light'));
  $('themeDark').addEventListener('click', () => setTheme('dark'));
  // The host page may also switch themes; keep the canvases in step.
  new MutationObserver(themeChanged).observe(root, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- live panels ---------- */
  function updateClock() {
    const sc = state.mode === 'story' ? scene() : null;
    if (sc && sc.card && sc.clock) {
      const [date, hm] = sc.clock;
      const [h, m] = hm.split(':').map(Number);
      $('clockDate').textContent = date;
      $('clockTime').textContent = p2(h % 12 || 12) + ':' + p2(m);
      $('clockAmpm').textContent = h < 12 ? 'AM' : 'PM';
      return;
    }
    const w = sim.wall(), h = Math.floor(w / 3600), m = Math.floor((w % 3600) / 60), s = Math.floor(w % 60);
    $('clockTime').textContent = p2(h % 12 || 12) + ':' + p2(m) + ':' + p2(s);
    $('clockAmpm').textContent = h < 12 ? 'AM' : 'PM';
    $('clockDate').textContent = sim.date;
  }

  function setBar(bar, text, frac, label, warn, crit) {
    const f = Math.max(0, Math.min(1, frac));
    bar.style.width = (f * 100).toFixed(1) + '%';
    bar.dataset.sev = f >= crit ? 'crit' : f >= warn ? 'warn' : 'ok';
    text.textContent = label;
  }

  function updateVm(st) {
    const vm = sim.vm, m = sim.memInfo(), down = sim.down > 0, inst = sim.inst;
    const node = $('nodeVm');
    $('vmSpec').textContent = vm.cpu + ' vCPU · ' + ramLabel(vm.ram) + ' RAM · $' + vm.cost + '/month' + (sim.live ? '' : ' · Ubuntu 24.04');
    const pill = $('vmPill');
    if (state.blind) { pill.dataset.state = 'unknown'; pill.textContent = 'Unknown'; node.dataset.state = ''; node.classList.remove('is-shaking'); }
    else {
      pill.dataset.state = st.id; pill.textContent = st.label;
      node.dataset.state = st.id;
      node.classList.toggle('is-shaking', !reduced && st.id === 'crit' && sim.eff < 0.3);
    }
    const busy = sim.f > 0.05 ? 'warn' : 'ok';
    $('dotNginx').dataset.state = down || !inst.nginx ? 'off' : 'ok';
    $('metaNginx').textContent = inst.nginx ? '' : 'not installed';
    const app = sim.app;
    $('dotApp').dataset.state = down || app === 'none' || app === 'stopped' ? 'off' : app === 'running' ? busy : 'crit';
    $('metaApp').textContent = down ? 'off' : { none: 'not deployed', running: 'FastAPI', killed: 'killed', restarting: 'restarting', stopped: 'stopped' }[app];
    const db = sim.db;
    $('dotDb').dataset.state = down || db === 'none' || db === 'stopped' ? 'off' : db === 'running' ? busy : db === 'starting' ? 'warn' : 'crit';
    $('metaDb').textContent = down ? 'off'
      : db === 'running' ? (inst.app ? Math.round(sim.conns) + ' of ' + sim.maxConns + ' connections' : 'running')
        : { none: 'not installed', starting: sim.dbClean ? 'starting…' : 'recovering…', killed: 'killed by OOM', stopped: 'stopped' }[db];
    setBar($('vmRamBar'), $('vmRamText'), m.used / m.total, Math.round((m.used / m.total) * 100) + '%', 0.8, 0.92);
    if (m.swapTotal) setBar($('vmSwapBar'), $('vmSwapText'), m.swap / m.swapTotal, Math.round((m.swap / m.swapTotal) * 100) + '%', 0.05, 0.3);
    else setBar($('vmSwapBar'), $('vmSwapText'), 0, 'off', 1, 1);
  }

  function miniShop(viral) {
    const p = chapters[0].content.products;
    return '<div class="mini-shop"><div class="mini-top"><span class="mini-logo">tomazon</span><span class="mini-search"></span></div>' +
      (viral ? '<div class="mini-banner">Trending: Protein Shaker ₹99</div>' : '') +
      '<div class="mini-grid">' + p.map((x) => '<div class="mini-card"><div class="mini-img" style="background:' + x.bg + ';display:grid;place-items:center">' +
        TZ.ICONS[x.icon].replace('<svg ', '<svg style="width:60%;height:70%" ') + '</div><div class="mini-line"></div><div class="mini-price"></div></div>').join('') +
      '</div></div>';
  }

  function updateBrowser(view) {
    const box = $('browserView');
    const viral = sim.rps > 8;
    const host = sim.dns ? 'tomazon.app' : IP;
    $('browserUrl').textContent = host;
    const key = host + view.id + (viral ? 'v' : '') + (view.id === 'slow' || view.id === 'partial' ? Math.round(view.p50) : '') +
      (view.id === 'partial' ? view.worst + Math.round(view.share * 20) : '');
    if (key === state.viewKey) return;
    state.viewKey = key;
    box.classList.toggle('view-slow', view.id === 'slow' || (view.id === 'partial' && view.p50 > 1.5));
    const err = (title, line, code) => '<div class="view-error"><div class="sad"></div><h4>' + title + '</h4><p>' + line + '</p><p class="err-code">' + code + '</p></div>';
    const nginx = (title) => '<div class="view-nginx"><h4>' + title + '</h4><hr><p>nginx/1.24.0 (Ubuntu)</p></div>';
    switch (view.id) {
      case 'ok': box.innerHTML = miniShop(viral); break;
      case 'slow': box.innerHTML = miniShop(viral) + '<div class="view-spinner">Still loading… ' + Math.max(2, Math.round(view.p50)) + ' s</div>'; break;
      case 'partial': {
        const pct = Math.max(1, Math.round(view.share * 100)) + '% of visitors ';
        const what = { timeout: 'give up waiting', error: 'see "Internal Server Error"', busy: 'get a fast “503, try again”', badgw: 'get a 502 error', down: 'can’t connect' }[view.worst];
        box.innerHTML = miniShop(viral) + (view.p50 > 1.5 ? '<div class="view-spinner">Loading… ' + Math.round(view.p50) + ' s</div>' : '') + '<div class="view-toast">' + pct + what + '</div>';
        break;
      }
      case 'timeout': box.innerHTML = err('This site can’t be reached', host + ' took too long to respond.', 'ERR_CONNECTION_TIMED_OUT'); break;
      case 'refused': box.innerHTML = err('This site can’t be reached', host + ' refused to connect.', 'ERR_CONNECTION_REFUSED'); break;
      case 'welcome': box.innerHTML = '<div class="view-welcome"><h4>Welcome to nginx!</h4><p>If you see this page, the nginx web server is successfully installed and working. Further configuration is required.</p><p><em>Thank you for using nginx.</em></p></div>'; break;
      case 'error': box.innerHTML = '<div class="view-plain">Internal Server Error</div>'; break;
      case 'busy': box.innerHTML = nginx('503 Service Temporarily Unavailable'); break;
      case 'badgw': box.innerHTML = nginx('502 Bad Gateway'); break;
      default: box.innerHTML = miniShop(viral);
    }
  }

  function updateUi() {
    const sum = sim.summary(4), st = sim.status(sum);
    updateClock();
    if (!$('board').hidden) {
      metrics.update(sim, sum, st);
      updateVm(st);
      updateBrowser(sim.customerView(sum));
      syncControls();
    }
    term.tick();
  }

  /* ---------- main loop ---------- */
  let last = performance.now(), acc = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += dt * state.speed;
    let steps = 0;
    while (acc >= 0.1 && steps < 40) { sim.step(0.1); acc -= 0.1; steps++; }
    if (steps >= 40) acc = 0;
    if (!$('board').hidden) flow.frame(dt, sim, sim.takeFx(), state.blind); else sim.takeFx();
    if (now - state.lastUi > 200) { state.lastUi = now; updateUi(); }
    requestAnimationFrame(loop);
  }

  /* ---------- start ---------- */
  if (store.get('tz-notes') === '1') toggleNotes(true);
  themeChanged();
  const m = /^#c(\d+)s(\d+)$/.exec(location.hash || '');
  if (location.hash === '#free') { state.ch = 1; renderDots(); setMode('free'); }
  else if (m) goScene(Math.max(0, Math.min(chapters.length - 1, +m[1] - 1)), +m[2] - 1);
  else goScene(0, 0);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { flow.readColors(); flow.resize(); });
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
})();
