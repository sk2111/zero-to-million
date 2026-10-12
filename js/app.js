/* Tomazon War Room · wiring
   One simulation, stepped at a fixed 0.1 s; the diagram animates every frame
   and the panels refresh five times a second. Story mode walks the scenes;
   free play unlocks everything. */
(function () {
  'use strict';
  const TZ = window.TZ;
  const $ = (id) => document.getElementById(id);
  const story = TZ.STORY;
  const scenes = story.scenes;
  const CTRLS = ['traffic', 'vm', 'swap', 'workers', 'line', 'reboot', 'speed'];
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const sim = new TZ.Sim();
  const flow = new TZ.Flow($('stageBody'), $('flow'), $('nodeBrowser'), $('nodeVm'), $('legendScale'));
  const metrics = new TZ.Metrics();
  const term = new TZ.Terminal(sim);
  const overlays = new TZ.Overlays($('overlay'), $('overlayInner'), {
    onClose: () => { $('overlayBtn').hidden = !scenes[state.scene].overlay || state.mode !== 'story'; },
    run: (cmd) => runChip(cmd)
  });

  const state = { mode: 'story', scene: 0, speed: 1, blind: false, unlocked: new Set(), dragging: false, lastUi: 0, view: null, viewKey: '' };
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked: fine */ } }
  };

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
  $('workers').addEventListener('input', (e) => { sim.setWorkers(+e.target.value); syncControls(); });
  $('lineMode').addEventListener('change', (e) => sim.setLine(+e.target.value));
  $('rebootBtn').addEventListener('click', () => sim.reboot());
  document.querySelectorAll('.speed button').forEach((b) => b.addEventListener('click', () => {
    state.speed = +b.dataset.speed;
    document.querySelectorAll('.speed button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  }));

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
    if (document.activeElement !== $('workers')) $('workers').value = sim.maxWorkers;
    $('workersOut').textContent = sim.maxWorkers;
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

  /* ---------- story ---------- */
  const dots = $('sceneDots');
  scenes.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', 'Scene ' + (i + 1) + ': ' + s.title);
    b.title = s.title;
    b.addEventListener('click', () => goScene(i));
    dots.appendChild(b);
  });

  function applySim(tag) {
    if (!tag || sim.tag === tag) return;
    const spec = story.sims[tag];
    sim.reset(Object.assign({ tag }, spec));
    flow.clear(); metrics.clear();
    state.viewKey = '';
    if (spec.term) term.reset(spec.term);
    setSpeed(1);
  }

  function setBlind(on) {
    state.blind = on;
    $('stage').classList.toggle('is-blind', on);
    $('board').classList.toggle('is-blind-board', on);
    $('metricsFog').hidden = !on;
  }

  function goScene(i) {
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
    [...dots.children].forEach((d, j) => {
      d.classList.toggle('is-past', j < i);
      if (j === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current');
    });
    $('prevBtn').disabled = i === 0;
    $('nextBtn').textContent = i === scenes.length - 1 ? 'Free play' : 'Next';

    applySim(sc.sim);
    setBlind(!!sc.blind);
    state.unlocked = new Set(sc.unlock || []);
    applyLocks();
    syncControls();
    if (sc.overlay) overlays.show(sc.overlay); else overlays.hide();
    $('overlayBtn').hidden = true;
    try { history.replaceState(null, '', '#s' + (i + 1)); } catch (e) { /* not allowed here: fine */ }
  }

  function setMode(mode) {
    state.mode = mode;
    $('modeStory').setAttribute('aria-pressed', String(mode === 'story'));
    $('modeFree').setAttribute('aria-pressed', String(mode === 'free'));
    $('story').hidden = mode !== 'story';
    $('freebar').hidden = mode !== 'free';
    if (mode === 'free') {
      overlays.hide();
      setBlind(false);
      sim.tag = 'free';
      applyLocks();
      syncControls();
      try { history.replaceState(null, '', '#free'); } catch (e) { /* fine */ }
    } else {
      goScene(state.scene);
    }
  }

  function next() { if (state.scene === scenes.length - 1) setMode('free'); else goScene(state.scene + 1); }
  function prev() { goScene(state.scene - 1); }

  function runChip(cmd) {
    if (overlays.open) overlays.hide();
    const ok = term.type(cmd);
    const r = $('terminal').getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) $('terminal').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!ok) { $('termWait').hidden = false; }
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
  $('overlayBtn').addEventListener('click', () => { const o = scenes[state.scene].overlay; if (o) { overlays.show(o); $('overlayBtn').hidden = true; } });
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
    else if (e.key === 'Escape' && overlays.open) { overlays.hide(); $('overlayBtn').hidden = !scenes[state.scene].overlay; }
  });

  /* ---------- live panels ---------- */
  function updateClock() {
    const w = sim.wall(), h = Math.floor(w / 3600), m = Math.floor((w % 3600) / 60), s = Math.floor(w % 60);
    const p2 = (n) => String(n).padStart(2, '0');
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
    const vm = sim.vm, m = sim.memInfo(), down = sim.down > 0;
    const node = $('nodeVm');
    $('vmSpec').textContent = vm.cpu + ' vCPU · ' + ramLabel(vm.ram) + ' RAM · $' + vm.cost + '/month';
    const pill = $('vmPill');
    if (state.blind) { pill.dataset.state = 'unknown'; pill.textContent = 'Unknown'; node.dataset.state = ''; node.classList.remove('is-shaking'); }
    else {
      pill.dataset.state = st.id; pill.textContent = st.label;
      node.dataset.state = st.id;
      node.classList.toggle('is-shaking', !reduced && st.id === 'crit' && sim.eff < 0.3);
    }
    const busy = sim.f > 0.05 ? 'warn' : 'ok';
    $('dotNginx').dataset.state = down ? 'off' : 'ok';
    const app = sim.app;
    $('dotApp').dataset.state = down ? 'off' : app === 'running' ? busy : app === 'stopped' ? 'off' : 'crit';
    $('metaApp').textContent = down ? 'off' : app === 'running' ? Math.round(sim.workers) + ' of ' + sim.maxWorkers + ' workers' : { killed: 'killed', restarting: 'restarting', stopped: 'stopped' }[app];
    const db = sim.mysql;
    $('dotDb').dataset.state = down ? 'off' : db === 'running' ? busy : db === 'starting' ? 'warn' : db === 'stopped' ? 'off' : 'crit';
    $('metaDb').textContent = down ? 'off' : { running: 'running', starting: 'starting…', killed: 'killed by OOM', stopped: 'stopped' }[db];
    setBar($('vmRamBar'), $('vmRamText'), m.used / m.total, Math.round((m.used / m.total) * 100) + '%', 0.8, 0.92);
    if (m.swapTotal) setBar($('vmSwapBar'), $('vmSwapText'), m.swap / m.swapTotal, Math.round((m.swap / m.swapTotal) * 100) + '%', 0.05, 0.3);
    else setBar($('vmSwapBar'), $('vmSwapText'), 0, 'off', 1, 1);
  }

  function miniShop(viral) {
    const p = story.content.products;
    return '<div class="mini-shop"><div class="mini-top"><span class="mini-logo">tomazon</span><span class="mini-search"></span></div>' +
      (viral ? '<div class="mini-banner">Trending: Protein Shaker ₹99</div>' : '') +
      '<div class="mini-grid">' + p.map((x) => '<div class="mini-card"><div class="mini-img" style="background:' + x.bg + ';display:grid;place-items:center">' +
        TZ.ICONS[x.icon].replace('<svg ', '<svg style="width:60%;height:70%" ') + '</div><div class="mini-line"></div><div class="mini-price"></div></div>').join('') +
      '</div></div>';
  }

  function updateBrowser(view) {
    const box = $('browserView');
    const viral = sim.rps > 8;
    const key = view.id + (viral ? 'v' : '') + (view.id === 'slow' || view.id === 'partial' ? Math.round(view.p50) : '') +
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
        const what = { timeout: 'give up waiting', error: 'see a database error', busy: 'get a fast “503, try again”', badgw: 'get a 502 error', down: 'can’t connect' }[view.worst];
        box.innerHTML = miniShop(viral) + (view.p50 > 1.5 ? '<div class="view-spinner">Loading… ' + Math.round(view.p50) + ' s</div>' : '') + '<div class="view-toast">' + pct + what + '</div>';
        break;
      }
      case 'timeout': box.innerHTML = err('This site can’t be reached', 'tomazon.app took too long to respond.', 'ERR_CONNECTION_TIMED_OUT'); break;
      case 'refused': box.innerHTML = err('This site can’t be reached', 'tomazon.app refused to connect.', 'ERR_CONNECTION_REFUSED'); break;
      case 'error': box.innerHTML = '<div class="view-db"><h4>Error establishing a database connection</h4><p>Please try again in a few minutes.</p></div>'; break;
      case 'busy': box.innerHTML = nginx('503 Service Temporarily Unavailable'); break;
      case 'badgw': box.innerHTML = nginx('502 Bad Gateway'); break;
      default: box.innerHTML = miniShop(viral);
    }
  }

  function updateUi() {
    const sum = sim.summary(4), st = sim.status(sum);
    metrics.update(sim, sum, st);
    updateVm(st);
    updateBrowser(sim.customerView(sum));
    updateClock();
    syncControls();
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
    flow.frame(dt, sim, sim.takeFx(), state.blind);
    if (now - state.lastUi > 200) { state.lastUi = now; updateUi(); }
    requestAnimationFrame(loop);
  }

  /* ---------- start ---------- */
  const m = /^#s(\d+)$/.exec(location.hash || '');
  const startScene = m ? Math.max(0, Math.min(scenes.length - 1, +m[1] - 1)) : 0;
  if (store.get('tz-notes') === '1') toggleNotes(true);
  if (location.hash === '#free') { state.scene = 0; applySim('launch'); setMode('free'); }
  else goScene(startScene);
  updateUi();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { flow.readColors(); flow.resize(); });
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(loop); });
})();
