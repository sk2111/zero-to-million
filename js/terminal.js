/* Tomazon War Room · terminal
   Your laptop's shell, and an SSH session into tomazon-prod-1. Every server
   command answers with a delay that comes from the simulation: when the box
   is thrashing, even typing `free -m` takes seconds. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});
  const $ = (id) => document.getElementById(id);

  const HOST = 'tomazon.app', IP = '203.0.113.42', NODE = 'tomazon-prod-1', ME_IP = '198.51.100.77';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const p2 = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const span = (cls, text) => '<span class="' + cls + '">' + esc(text) + '</span>';

  const fmtMem = (mb) => (mb >= 1000 ? (mb / 1024).toFixed(2) + 'G' : mb >= 1 ? Math.round(mb) + 'M' : Math.round(mb * 1024) + 'K');
  const fmtTime = (secs) => {
    if (secs >= 3600) return Math.floor(secs / 3600) + 'h' + p2(Math.floor((secs % 3600) / 60)) + ':' + p2(Math.floor(secs % 60));
    return Math.floor(secs / 60) + ':' + p2(Math.floor(secs % 60)) + '.' + p2(Math.floor((secs * 100) % 100));
  };

  const LOCAL_CMDS = ['ssh', 'ping', 'dig', 'nslookup', 'curl', 'help', 'clear'];
  const REMOTE_CMDS = ['htop', 'top', 'free', 'uptime', 'dmesg', 'df', 'ps', 'systemctl', 'journalctl', 'tail', 'last', 'nproc', 'whoami', 'hostname', 'reboot', 'exit', 'logout', 'help', 'clear'];

  const UA_VIRAL = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 345.0.0.34.98',
    'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 345.0.0.48.95 Android',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 346.1.0.27.102'
  ];
  const UA_CALM = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15'
  ];
  const randIp = () => pick(['198.51.100.', '203.0.113.', '192.0.2.']) + (2 + Math.floor(Math.random() * 250));

  class Terminal {
    constructor(sim) {
      this.sim = sim;
      this.out = $('termOut'); this.screen = $('termScreen'); this.input = $('termInput');
      this.promptEl = $('termPrompt'); this.line = $('termLine'); this.htopEl = $('termHtop');
      this.hostEl = $('termHost'); this.waitEl = $('termWait'); this.waitText = $('termWaitText');
      this.remote = false; this.busy = false; this.typing = false;
      this.history = []; this.hIdx = 0;
      this.timers = [];
      this.htop = null;
      this.loginAt = null;
      this.onRun = null;

      this.input.addEventListener('keydown', (e) => this.onKey(e));
      this.screen.addEventListener('keydown', (e) => {
        if (this.htop && (e.key === 'q' || e.key === 'Q' || e.key === 'Escape' || e.key === 'F10')) { e.preventDefault(); this.quitHtop(); }
        else if (this.busy && e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); this.cancel(); }
      });
      this.screen.addEventListener('click', () => {
        if (this.htop) { this.screen.focus(); return; }
        const sel = window.getSelection && window.getSelection();
        if (!sel || sel.isCollapsed) this.input.focus({ preventScroll: true });
      });
      $('termStop').addEventListener('click', () => this.cancel());
      this.setRemote(false);
    }

    /* ---------- plumbing ---------- */
    prompt() { return this.remote ? 'root@' + NODE + ':~#' : 'you@laptop:~$'; }

    setRemote(on) {
      this.remote = on;
      this.promptEl.textContent = this.prompt();
      this.promptEl.classList.toggle('remote', on);
      this.hostEl.textContent = on ? 'ssh root@' + HOST : 'you@laptop';
      if (on) this.loginAt = this.date(); else this.loginAt = null;
    }

    print(html) {
      const div = document.createElement('div');
      div.innerHTML = html === '' ? '&nbsp;' : html;
      this.out.appendChild(div);
      while (this.out.childElementCount > 700) this.out.removeChild(this.out.firstChild);
      this.scroll();
    }
    say(text, cls) { this.print(cls ? span(cls, text) : esc(text)); }
    lines(arr) { for (const l of arr) this.print(typeof l === 'string' ? esc(l) : l.h != null ? l.h : l.cls ? span(l.cls, l.t) : esc(l.t)); }
    scroll() { this.screen.scrollTop = this.screen.scrollHeight; }
    echo(cmd) { this.print(span('term-prompt' + (this.remote ? ' remote' : ''), this.prompt()) + ' ' + esc(cmd)); }

    reset(intro) {
      this.cancel(true);
      this.timers.forEach((id) => clearTimeout(id)); this.timers = []; this.typing = false;
      if (this.htop) this.quitHtop();
      this.out.innerHTML = '';
      this.setRemote(false);
      if (intro) for (const l of intro) this.say(l, 't-dim');
    }

    setBusy(on, label) {
      this.busy = on;
      this.line.classList.toggle('is-busy', on);
      if (!on) { this.waitEl.hidden = true; this.timers.forEach((id) => clearTimeout(id)); this.timers = []; }
      else this.waitLabel = label || 'waiting';
    }

    wait(sec, fn, label) {
      this.setBusy(true, label);
      const t0 = performance.now();
      const tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        if (el > 1.2) { this.waitEl.hidden = false; this.waitText.textContent = this.waitLabel + ' · ' + Math.floor(el) + ' s'; }
      }, 200);
      const done = setTimeout(() => { this.setBusy(false); fn(); if (!this.htop) this.scroll(); }, Math.max(0, sec * 1000));
      this.timers.push(tick, done);
    }

    cancel(silent) {
      if (!this.busy) return;
      this.setBusy(false);
      if (!silent) this.print('^C');
    }

    /* Remote commands pay the server's current sluggishness. */
    remoteRun(fn, factor) {
      this.wait(this.sim.cmdDelay() * (factor || 1), () => {
        if (!this.remote) return;
        fn();
      }, 'server is slow to answer');
    }

    onKey(e) {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) { e.preventDefault(); if (this.busy) this.cancel(); else { this.echo(this.input.value + '^C'); this.input.value = ''; } return; }
      if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) { e.preventDefault(); this.out.innerHTML = ''; return; }
      if (this.busy || this.typing) { if (e.key.length === 1 || e.key === 'Enter') e.preventDefault(); return; }
      if (e.key === 'Enter') { e.preventDefault(); this.run(this.input.value); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.hIdx > 0) { this.hIdx--; this.input.value = this.history[this.hIdx] || ''; } }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (this.hIdx < this.history.length) { this.hIdx++; this.input.value = this.history[this.hIdx] || ''; } }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const v = this.input.value;
        if (!v.includes(' ')) {
          const hits = (this.remote ? REMOTE_CMDS : LOCAL_CMDS).filter((c) => c.startsWith(v));
          if (hits.length === 1) this.input.value = hits[0] + ' ';
        }
      }
    }

    /* Type a command with a little animation, then run it (used by the story chips). */
    type(cmd) {
      if (this.htop) this.quitHtop();
      if (this.busy || this.typing) return false;
      this.typing = true;
      this.input.value = '';
      this.input.focus({ preventScroll: true });
      let i = 0;
      const step = () => {
        this.input.value = cmd.slice(0, ++i);
        if (i < cmd.length) this.timers.push(setTimeout(step, 18 + Math.random() * 22));
        else this.timers.push(setTimeout(() => { this.typing = false; this.run(cmd); }, 160));
      };
      step();
      return true;
    }

    run(raw) {
      const cmd = (raw || '').trim();
      if (this.htop) this.quitHtop();
      if (this.busy) return false;
      this.input.value = '';
      this.echo(cmd);
      if (!cmd) return true;
      this.history.push(cmd); this.hIdx = this.history.length;
      this.dispatch(cmd);
      if (this.onRun) this.onRun(cmd);
      return true;
    }

    dispatch(cmd) {
      let c = cmd.replace(/\s+/g, ' ').trim();
      if (c.startsWith('sudo ')) c = c.slice(5);
      const parts = c.split('|').map((s) => s.trim());
      const words = parts[0].split(' ');
      const name = words[0], args = words.slice(1);
      const pipes = parts.slice(1);
      if (name === 'clear') { this.out.innerHTML = ''; return; }
      if (name === 'help') { this.help(); return; }
      const table = this.remote ? REMOTE : LOCAL;
      if (table[name]) { table[name].call(this, args, pipes, c); return; }
      if (!this.remote && REMOTE[name]) { this.say("That's a command for the server. Connect first:  ssh root@" + HOST, 't-note'); return; }
      if (this.remote && LOCAL[name] && name !== 'ssh') { this.say('Run that from your laptop. Type exit to leave the server.', 't-note'); return; }
      if (this.remote && name === 'ssh') { this.say("You're already on " + NODE + '.', 't-note'); return; }
      this.say(name + ': command not found', 't-err');
      this.say('Type help to see the commands this terminal knows.', 't-note');
    }

    /* Pipes: | tail, | head, | grep [-i] word, | less (ignored) */
    pipe(lines, pipes) {
      let out = lines.slice();
      for (const p of pipes) {
        const w = p.split(' ');
        const num = (def) => {
          const n = w.find((x) => /^-?\d+$/.test(x.replace(/^-n/, ''))) || '';
          const v = parseInt(n.replace(/^-n/, '').replace('-', ''), 10);
          return Number.isFinite(v) ? v : def;
        };
        if (w[0] === 'tail') out = out.slice(-num(10));
        else if (w[0] === 'head') out = out.slice(0, num(10));
        else if (w[0] === 'grep') {
          const ci = w.includes('-i');
          const term = w.filter((x) => x !== 'grep' && !x.startsWith('-')).join(' ').replace(/^["']|["']$/g, '');
          const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ci ? 'i' : '');
          out = out.filter((l) => re.test(typeof l === 'string' ? l : l.t));
        }
      }
      return out;
    }

    help() {
      if (!this.remote) {
        this.lines([
          { t: 'On your laptop:', cls: 't-bold' },
          '  ssh root@tomazon.app     log in to the server',
          '  ping tomazon.app         is the machine reachable at all?',
          '  dig tomazon.app          does the domain still point at our server?',
          '  curl -I https://tomazon.app   ask the website for a page',
          '  clear                    clear the screen'
        ]);
      } else {
        this.lines([
          { t: 'On the server:', cls: 't-bold' },
          '  htop                     live view of CPU, memory and processes (q to quit)',
          '  free -m                  memory and swap in megabytes',
          '  uptime                   load average',
          '  dmesg | tail             what the kernel has been complaining about',
          '  ps aux --sort=-%mem | head     who is using the memory',
          '  systemctl status mysql   is the database running?',
          '  journalctl -u tomazon-app      the app\'s own log',
          '  tail /var/log/nginx/access.log who is visiting (add -f to follow)',
          '  tail /var/log/nginx/error.log  what nginx is unhappy about',
          '  df -h                    disk space',
          '  last                     who has logged in recently',
          '  systemctl restart mysql  restart a service (also: tomazon-app, nginx)',
          '  reboot                   turn it off and on again',
          '  exit                     back to your laptop'
        ]);
      }
    }

    /* ---------- time helpers (server clock is IST) ---------- */
    date(offset) {
      const s = this.sim;
      return new Date(Date.parse((s.ymd || '2026-10-10') + 'T00:00:00Z') + (s.clock0 + s.t + (offset || 0)) * 1000);
    }
    dAt(t) { return this.date(t - this.sim.t); }
    hms(d) { return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()); }
    ampm(d) { const h = d.getUTCHours(); return p2(h % 12 || 12) + ':' + p2(d.getUTCMinutes()) + ':' + p2(d.getUTCSeconds()) + ' ' + (h < 12 ? 'AM' : 'PM'); }
    syslogTs(d) { return MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2, ' ') + ' ' + this.hms(d); }
    ctime(d) { return DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2, ' ') + ' ' + this.hms(d) + ' ' + d.getUTCFullYear(); }
    longTs(d) { return DOW[d.getUTCDay()] + ' ' + d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + this.hms(d) + ' IST'; }
    nginxTs(d) { return p2(d.getUTCDate()) + '/' + MON[d.getUTCMonth()] + '/' + d.getUTCFullYear() + ':' + this.hms(d) + ' +0530'; }
    ago(secs) {
      if (secs < 60) return Math.max(1, Math.round(secs)) + 's ago';
      if (secs < 3600) return Math.floor(secs / 60) + 'min ' + Math.floor(secs % 60) + 's ago';
      if (secs < 86400) return Math.floor(secs / 3600) + 'h ' + Math.floor((secs % 3600) / 60) + 'min ago';
      const days = Math.floor(secs / 86400), months = Math.floor(days / 30.44), rest = Math.round(days - months * 30.44);
      return months ? months + ' months ' + rest + ' days ago' : days + ' days ago';
    }
    uptimeStr() {
      const u = this.sim.uptime(), d = Math.floor(u / 86400), h = Math.floor((u % 86400) / 3600), m = Math.floor((u % 3600) / 60), s = Math.floor(u % 60);
      return (d ? d + (d === 1 ? ' day, ' : ' days, ') : '') + p2(h) + ':' + p2(m) + ':' + p2(s);
    }

    /* ---------- htop ---------- */
    openHtop() {
      this.htop = { last: 0 };
      this.out.hidden = true; this.line.hidden = true; this.htopEl.hidden = false;
      this.renderHtop();
      this.screen.focus({ preventScroll: true });
      this.screen.scrollTop = 0;
    }
    quitHtop() {
      this.htop = null;
      this.htopEl.hidden = true; this.out.hidden = false; this.line.hidden = false;
      this.input.focus({ preventScroll: true });
      this.scroll();
    }
    tick() {
      const s = this.sim;
      if (this.remote && s.down > 0) {
        if (this.htop) this.quitHtop();
        this.cancel(true);
        this.lines([{ t: 'Connection to ' + HOST + ' closed by remote host.', cls: 't-err' }, 'Connection to ' + HOST + ' closed.']);
        this.setRemote(false);
        return;
      }
      if (this.htop) {
        const every = clamp(900 / Math.max(s.eff, 0.05), 900, 3500);
        if (performance.now() - this.htop.last > every) this.renderHtop();
      }
    }

    renderHtop() {
      const s = this.sim, vm = s.vm, m = s.memInfo();
      this.htop.last = performance.now();
      const BW = 36;
      const bar = (segs, text) => {
        const cells = [];
        for (const g of segs) {
          const n = Math.round(clamp(g.frac, 0, 1) * BW);
          for (let i = 0; i < n && cells.length < BW; i++) cells.push({ ch: '|', cls: g.cls });
        }
        while (cells.length < BW) cells.push({ ch: ' ', cls: '' });
        const t = text.slice(-BW);
        for (let i = 0; i < t.length; i++) {
          const cell = cells[BW - t.length + i];
          cells[BW - t.length + i] = { ch: t[i], cls: cell.ch === '|' ? cell.cls : 'h-d' };
        }
        let html = '', run = '', cls = null;
        for (const c of cells) {
          if (c.cls !== cls) { if (run) html += cls ? span(cls, run) : esc(run); run = ''; cls = c.cls; }
          run += c.ch;
        }
        if (run) html += cls ? span(cls, run) : esc(run);
        return html;
      };
      const left = [];
      const nCpu = Math.min(vm.cpu, 8);
      for (let i = 0; i < nCpu; i++) {
        const j = vm.cpu > 1 && !s.saturated ? (Math.random() - 0.5) * 0.12 : 0;
        const u = clamp(s.cpuUser + j, 0, 1), sy = clamp(s.cpuSys, 0, 1 - u);
        const label = vm.cpu > 1 ? String(i + 1).padStart(3, ' ') : 'CPU';
        left.push(span('h-c', label) + '[' + bar([{ frac: u, cls: 'h-g' }, { frac: sy, cls: 'h-r' }], (s.down > 0 ? 0 : (u + sy) * 100).toFixed(1) + '%') + ']');
      }
      left.push(span('h-c', 'Mem') + '[' + bar([{ frac: m.used / m.total, cls: 'h-g' }, { frac: Math.min(6, m.cache) / m.total, cls: 'h-b' }, { frac: Math.max(0, m.cache - 6) / m.total, cls: 'h-y' }], fmtMem(m.used) + '/' + fmtMem(m.total)) + ']');
      left.push(span('h-c', 'Swp') + '[' + bar([{ frac: m.swapTotal ? m.swap / m.swapTotal : 0, cls: 'h-r' }], fmtMem(m.swap) + '/' + (m.swapTotal ? '1.00G' : '0K')) + ']');

      const procs = s.procs();
      const running = procs.filter((p) => p.s === 'R').length;
      const right = [
        span('h-c', 'Tasks: ') + span('h-w', String(procs.length + 31)) + ', ' + span('h-w', String(44 + Math.round(s.workers) * 2)) + ' thr; ' + span('h-g', String(running)) + ' running',
        span('h-c', 'Load average: ') + span('h-w', s.load[0].toFixed(2)) + ' ' + span('h-w', s.load[1].toFixed(2)) + ' ' + s.load[2].toFixed(2),
        span('h-c', 'Uptime: ') + span('h-w', this.uptimeStr())
      ];
      const rows = [];
      const n = Math.max(left.length, right.length);
      const blank = ' '.repeat(BW + 5);
      for (let i = 0; i < n; i++) rows.push('  ' + (left[i] || blank) + '   ' + (right[i] || ''));
      rows.push('');
      const W = 96;
      const header = '    PID USER       PRI  NI  VIRT   RES   SHR S  CPU%▽MEM%    TIME+  Command';
      rows.push(span('h-head', header.padEnd(W)));
      procs.sort((a, b) => b.cpu - a.cpu || b.res - a.res || a.pid - b.pid);
      // Show as many processes as fit, like the real thing.
      const lineH = 12.5 * 1.38;
      const fit = Math.floor((this.screen.clientHeight - 26) / lineH) - rows.length - 3;
      const show = procs.slice(0, Math.max(5, Math.min(18, fit)));
      show.forEach((p, i) => {
        const pc = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
        const st = p.s === 'R' ? span('h-g', 'R') : p.s === 'D' ? span('h-r', 'D') : 'S';
        const cols = String(p.pid).padStart(7) + ' ' + p.user.padEnd(9).slice(0, 9) + '  20   0 ' +
          fmtMem(p.virt).padStart(5) + ' ' + fmtMem(p.res).padStart(5) + ' ' + fmtMem(p.shr).padStart(5) + ' ';
        const tail = ' ' + pc(p.cpu).padStart(5) + ' ' + pc((p.res / m.total) * 100).padStart(4) + ' ' + fmtTime(p.time).padStart(9) + '  ';
        const cmd = p.cmd;
        const line = esc(cols) + st + esc(tail) + (p.cmd === 'kswapd0' || p.cmd.startsWith('nginx') || p.cmd.startsWith('sshd') ? esc(cmd) : span('h-w', cmd));
        rows.push(i === 0 ? '<span class="h-sel">' + line + '</span>' : line);
      });
      rows.push('');
      const keys = [['F1', 'Help'], ['F2', 'Setup'], ['F3', 'Search'], ['F4', 'Filter'], ['F5', 'Tree'], ['F6', 'SortBy'], ['F7', 'Nice -'], ['F8', 'Nice +'], ['F9', 'Kill'], ['F10', 'Quit']];
      rows.push(keys.map(([k, v]) => span('h-key', k) + esc(v.padEnd(6))).join('') + '  ' + span('h-d', 'press q to quit'));
      this.htopEl.innerHTML = rows.join('\n');
      this.screen.scrollTop = 0;
    }

    /* ---------- log generators ---------- */
    mix() {
      const sum = this.sim.summary(4);
      const by = sum.by;
      const items = [['ok', by.ok], ['timeout', by.timeout], ['error', by.error], ['busy', by.busy], ['badgw', by.badgw]];
      const tot = items.reduce((a, x) => a + x[1], 0);
      return { sum, items, tot };
    }
    drawKind(mx) {
      if (mx.tot <= 0) return mx.sum.waiting > 1.5 ? 'timeout' : 'ok';
      let r = Math.random() * mx.tot;
      for (const [k, v] of mx.items) { r -= v; if (r <= 0) return k; }
      return 'ok';
    }
    accessLine(when, mx) {
      const s = this.sim, viral = s.rps > 8;
      const kind = this.drawKind(mx);
      const status = { ok: 200, timeout: 499, error: 500, busy: 503, badgw: 502 }[kind];
      const path = viral
        ? (Math.random() < 0.72 ? '/p/protein-shaker-leakproof' : pick(['/', '/cart', '/p/protein-shaker-leakproof/reviews', '/search?q=protein+shaker', '/static/app.css']))
        : pick(['/', '/p/rubber-duck-senior-edition', '/cart', '/p/works-on-my-machine-mug', '/static/app.css', '/checkout', '/p/usb-c-cable-first-try']);
      const ref = viral ? (Math.random() < 0.8 ? 'https://l.instagram.com/' : '-') : (Math.random() < 0.5 ? 'https://tomazon.app/' : 'https://www.google.com/');
      const ua = pick(viral ? UA_VIRAL : UA_CALM);
      const rt = kind === 'ok' ? clamp(mx.sum.p50 * (0.6 + Math.random() * 0.9), 0.05, 9.9)
        : kind === 'timeout' ? 10 : kind === 'error' ? 0.02 + Math.random() * 0.05 : 0.001;
      const bytes = kind === 'ok' ? 4100 + Math.floor(Math.random() * 5000) : kind === 'timeout' ? 0 : 157 + Math.floor(Math.random() * 40);
      const pre = randIp() + ' - - [' + this.nginxTs(when) + '] "GET ' + path + ' HTTP/2.0" ';
      const post = ' ' + bytes + ' "' + ref + '" "' + ua + '" rt=' + rt.toFixed(3);
      return { t: pre + status + post, h: esc(pre) + span(status === 200 ? 't-ok' : 't-err', String(status)) + esc(post) };
    }
    errorLine(when, kind) {
      const ts = when.getUTCFullYear() + '/' + p2(when.getUTCMonth() + 1) + '/' + p2(when.getUTCDate()) + ' ' + this.hms(when);
      const path = this.sim.rps > 8 ? '/p/protein-shaker-leakproof' : '/';
      const tail = ', client: ' + randIp() + ', server: tomazon.app, request: "GET ' + path + ' HTTP/2.0", upstream: "http://unix:/run/tomazon-app.sock:' + path + '", host: "tomazon.app"';
      const msg = {
        timeout: '[error] 804#804: *' + (40000 + Math.floor(Math.random() * 9000)) + ' upstream timed out (110: Connection timed out) while reading response header from upstream' + tail,
        badgw: '[error] 804#804: *' + (40000 + Math.floor(Math.random() * 9000)) + ' connect() to unix:/run/tomazon-app.sock failed (111: Connection refused) while connecting to upstream' + tail,
        busy: '[error] 804#804: *' + (40000 + Math.floor(Math.random() * 9000)) + ' limiting connections by zone "app"' + tail,
        error: '[warn] 804#804: *' + (40000 + Math.floor(Math.random() * 9000)) + ' upstream sent 500 while reading response header from upstream' + tail
      }[kind];
      return { t: ts + ' ' + msg, cls: kind === 'error' ? 't-warn' : 't-err' };
    }
    accessLog(n) {
      const mx = this.mix(), out = [];
      for (let i = n - 1; i >= 0; i--) out.push(this.accessLine(this.date(-i * 0.35 - Math.random() * 0.3), mx));
      return out;
    }
    errorLog(n) {
      const mx = this.mix();
      const bad = mx.items.filter(([k, v]) => k !== 'ok' && v > 0);
      if (!bad.length) {
        return [{ t: '2026/10/09 18:22:41 [crit] 804#804: *31882 SSL_do_handshake() failed (SSL: error:0A00006C:SSL routines::bad key share) while SSL handshaking, client: 192.0.2.61, server: 0.0.0.0:443', cls: 't-dim' }];
      }
      const out = [];
      for (let i = n - 1; i >= 0; i--) {
        let kind = this.drawKind(mx);
        if (kind === 'ok') kind = bad[0][0];
        out.push(this.errorLine(this.date(-i * 0.5 - Math.random() * 0.4), kind));
      }
      return out;
    }
    journal(filter) {
      const s = this.sim, out = [];
      for (const e of s.log) {
        if (e.src === 'kern') continue;
        if (filter && !filter(e)) continue;
        const who = e.src === 'app' ? 'tomazon-app[' + s.pids.app + ']' : 'systemd[1]';
        out.push({ t: this.syslogTs(this.dAt(e.t)) + ' ' + NODE + ' ' + who + ': ' + e.msg, cls: /kill|Failed|CRITICAL/.test(e.msg) ? 't-err' : '' });
      }
      return out;
    }
    kernelLog(human) {
      const s = this.sim, out = [];
      if (s.bootT === 0 && s.uptime0 > 600) {
        const boot = [
          [0.0, 'Linux version 6.8.0-45-generic (buildd@lcy02-amd64-115) #45-Ubuntu SMP PREEMPT_DYNAMIC'],
          [0.004321, 'Memory: ' + Math.round(s.vm.ram * 1024 * 0.9) + 'K/' + s.vm.ram * 1024 + 'K available'],
          [1.882210, 'EXT4-fs (vda1): mounted filesystem with ordered data mode. Quota mode: none.'],
          [2.401177, 'Adding 1048572k swap on /swapfile.  Priority:-2 extents:6 across:1048572k FS'],
          [3.120934, 'virtio_net virtio1 eth0: renamed from ens3']
        ];
        for (const [ts, msg] of boot) {
          out.push({ t: human ? '[' + this.ctime(this.date(-s.uptime() + ts)) + '] ' + msg : '[' + ts.toFixed(6).padStart(12) + '] ' + msg, cls: '' });
        }
      }
      let k = 0;
      for (const e of s.log) {
        if (e.src !== 'kern' || e.t < s.bootT) continue;
        const up = e.t - s.bootT + (s.bootT === 0 ? s.uptime0 : 0) + (k++ % 7) * 0.000137;
        const stamp = human ? '[' + this.ctime(this.dAt(e.t)) + ']' : '[' + up.toFixed(6).padStart(12) + ']';
        out.push({ t: stamp + ' ' + e.msg, cls: /Killed process|oom-killer|blocked for more/.test(e.msg) ? 't-err' : '' });
      }
      return out;
    }
  }

  /* ---------- commands on your laptop ---------- */
  const LOCAL = {
    ssh(args) {
      const target = args.filter((a) => !a.startsWith('-')).pop() || '';
      if (!target) { this.say('usage: ssh [-p port] [user@]hostname', 't-err'); return; }
      const host = target.includes('@') ? target.split('@')[1] : target;
      if (![HOST, IP, NODE].includes(host)) { this.say('ssh: Could not resolve hostname ' + host + ': Name or service not known', 't-err'); return; }
      const d = this.sim.sshDelay();
      if (d < 0) { this.wait(0.3, () => this.say('ssh: connect to host ' + HOST + ' port 22: Connection refused', 't-err')); return; }
      this.wait(d, () => {
        if (this.sim.down > 0) { this.say('ssh: connect to host ' + HOST + ' port 22: Connection refused', 't-err'); return; }
        this.setRemote(true);
        const s = this.sim, m = s.memInfo(), now = this.date();
        const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '0%');
        this.lines([
          'Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)',
          '',
          '  System information as of ' + DOW[now.getUTCDay()] + ' ' + MON[now.getUTCMonth()] + ' ' + now.getUTCDate() + ' ' + this.ampm(now) + ' IST ' + now.getUTCFullYear(),
          '',
          { h: '  System load:  ' + span(s.load[0] > s.vm.cpu * 2 ? 't-err' : '', s.load[0].toFixed(2).padEnd(17)) + 'Processes:             ' + (s.procs().length + 118) },
          '  Usage of /:   38.2% of 24.05GB   Users logged in:       0',
          { h: '  Memory usage: ' + span(m.used / m.total > 0.9 ? 't-err' : '', pct(m.used, m.total).padEnd(17)) + 'IPv4 address for eth0: ' + IP },
          { h: '  Swap usage:   ' + span(m.swap > 50 ? 't-err' : '', pct(m.swap, m.swapTotal)) },
          '',
          'Last login: Tue Oct  6 23:12:40 2026 from ' + ME_IP
        ]);
      }, 'connecting');
    },
    ping(args, pipes) {
      const host = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop();
      if (!host) { this.say('usage: ping host', 't-err'); return; }
      if (![HOST, IP].includes(host)) { this.say('ping: ' + host + ': Name or service not known', 't-err'); return; }
      this.say('PING ' + HOST + ' (' + IP + ') 56(84) bytes of data.');
      let i = 0; const times = [];
      this.setBusy(true, 'pinging');
      const one = () => {
        i++;
        if (this.sim.down > 0) this.say('From 203.0.113.1 icmp_seq=' + i + ' Destination Host Unreachable', 't-err');
        else {
          // The kernel answers ping itself, so ping works even when the app is dead.
          const ms = 36 + Math.random() * 7 + (this.sim.saturated ? Math.random() * 40 : 0);
          times.push(ms);
          this.say('64 bytes from ' + IP + ': icmp_seq=' + i + ' ttl=52 time=' + ms.toFixed(1) + ' ms');
        }
        if (i < 4) this.timers.push(setTimeout(one, 600));
        else {
          this.setBusy(false);
          this.say('');
          this.say('--- ' + HOST + ' ping statistics ---');
          const loss = Math.round((1 - times.length / 4) * 100);
          this.say('4 packets transmitted, ' + times.length + ' received, ' + loss + '% packet loss, time 3004ms', loss ? 't-err' : '');
          if (times.length) this.say('rtt min/avg/max/mdev = ' + Math.min(...times).toFixed(3) + '/' + (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3) + '/' + Math.max(...times).toFixed(3) + '/2.114 ms');
        }
      };
      this.timers.push(setTimeout(one, 300));
    },
    dig(args) {
      const host = args.filter((a) => !a.startsWith('-') && !a.startsWith('+')).pop() || HOST;
      const ok = host === HOST;
      this.wait(0.25, () => this.lines([
        '; <<>> DiG 9.18.28 <<>> ' + host,
        ';; global options: +cmd',
        ';; Got answer:',
        ';; ->>HEADER<<- opcode: QUERY, status: ' + (ok ? 'NOERROR' : 'NXDOMAIN') + ', id: 41822',
        '',
        ';; ANSWER SECTION:',
        ok ? { h: esc('tomazon.app.\t\t300\tIN\tA\t') + span('t-ok', IP) } : ';; (no answer)',
        '',
        ';; Query time: 23 msec',
        ';; SERVER: 1.1.1.1#53(1.1.1.1) (UDP)'
      ]));
    },
    nslookup(args) { LOCAL.dig.call(this, args); },
    curl(args) {
      const url = args.filter((a) => !a.startsWith('-')).pop() || '';
      if (!/tomazon\.app|203\.0\.113\.42/.test(url)) { this.say('curl: (6) Could not resolve host: ' + (url || '(none)'), 't-err'); return; }
      const s = this.sim, sum = s.summary(4), view = s.customerView(sum);
      const head = (code, extra) => {
        const lines = [{ t: 'HTTP/2 ' + code, cls: code === 200 ? 't-ok' : 't-err' }, 'server: nginx/1.24.0 (Ubuntu)', 'date: ' + this.date().toUTCString(), 'content-type: text/html; charset=utf-8'];
        return lines.concat(extra || []);
      };
      if (view.id === 'refused') { this.wait(0.05, () => this.say('curl: (7) Failed to connect to tomazon.app port 443 after 41 ms: Couldn\'t connect to server', 't-err')); return; }
      if (view.id === 'timeout') { this.wait(10, () => this.say('curl: (28) Operation timed out after 10001 milliseconds with 0 bytes received', 't-err'), 'waiting for tomazon.app'); return; }
      if (view.id === 'error') { this.wait(0.15, () => this.lines(head(500))); return; }
      if (view.id === 'busy') { this.wait(0.05, () => this.lines(head(503))); return; }
      if (view.id === 'badgw') { this.wait(0.05, () => this.lines(head(502))); return; }
      const t = clamp(view.p50 || 0.15, 0.08, 9.5);
      this.wait(t, () => this.lines(head(200, ['content-length: 48211', 'cache-control: no-cache'])), 'waiting for tomazon.app');
    }
  };

  /* ---------- commands on the server ---------- */
  const REMOTE = {
    htop() { this.remoteRun(() => this.openHtop(), 2); },
    top() { REMOTE.htop.call(this); },
    free(args, pipes) {
      this.remoteRun(() => {
        const m = this.sim.memInfo();
        const h = args.includes('-h'), mb = args.includes('-m');
        const f = (v) => (h ? (v >= 1000 ? (v / 1024).toFixed(1) + 'Gi' : Math.round(v) + 'Mi') : mb ? String(Math.round(v)) : String(Math.round(v * 1024)));
        const row = (label, cols) => label.padEnd(7) + cols.map((c) => f(c).padStart(12)).join('');
        const avail = m.free + m.cache * 0.6;
        const lines = [
          '               total        used        free      shared  buff/cache   available',
          { h: esc(row('Mem:', [m.total, m.used, m.free, 1, m.cache, avail])).replace(/(\s)(\S+)$/, '$1' + (avail < m.total * 0.1 ? '<span class="t-err">$2</span>' : '$2')) },
          { t: row('Swap:', [m.swapTotal ? 1023 : 0, m.swap, Math.max(0, (m.swapTotal ? 1023 : 0) - m.swap)]), cls: m.swap > 50 ? 't-err' : '' }
        ];
        this.lines(this.pipe(lines, pipes));
      });
    },
    uptime() {
      this.remoteRun(() => {
        const u = this.sim.uptime(), d = Math.floor(u / 86400), h = Math.floor((u % 86400) / 3600), mi = Math.floor((u % 3600) / 60);
        const l = this.sim.load;
        this.say(' ' + this.hms(this.date()) + ' up ' + (d ? d + ' days, ' : '') + String(h).padStart(2) + ':' + p2(mi) + ',  1 user,  load average: ' + l.map((x) => x.toFixed(2)).join(', '));
      });
    },
    dmesg(args, pipes) {
      this.remoteRun(() => {
        const out = this.pipe(this.kernelLog(args.includes('-T') || args.includes('-H')), pipes);
        if (!out.length) this.say('(no matching lines)', 't-dim'); else this.lines(out);
      }, 1.5);
    },
    df() {
      this.remoteRun(() => this.lines([
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs            52M  1.1M   51M   3% /run',
        '/dev/vda1        25G  9.2G   16G  38% /',
        'tmpfs           256M     0  256M   0% /dev/shm',
        '/dev/vda15      105M  6.1M   99M   6% /boot/efi'
      ]));
    },
    ps(args, pipes) {
      this.remoteRun(() => {
        const s = this.sim, m = s.memInfo();
        const procs = s.procs().sort((a, b) => b.res - a.res);
        const lines = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
        for (const p of procs) {
          const start = p.cmd === 'tomazon-app: worker' ? this.hms(this.date(-30 - (p.pid % 97))).slice(0, 5) : 'Mar14';
          const stat = p.s + (p.cmd.includes('mysqld') ? 'sl' : p.cmd.includes('master') ? 's' : '');
          lines.push({
            t: p.user.padEnd(8).slice(0, 8) + String(p.pid).padStart(8) + ' ' + Math.min(99.9, p.cpu).toFixed(1).padStart(4) + ' ' + ((p.res / m.total) * 100).toFixed(1).padStart(4) + ' ' +
              String(Math.round(p.virt * 1024)).padStart(7) + ' ' + String(Math.round(p.res * 1024)).padStart(6) + ' ?        ' + stat.padEnd(4) + ' ' + start.padEnd(6) + fmtTime(p.time).split('.')[0].padStart(6) + ' ' + p.cmd,
            cls: p.s === 'D' ? 't-warn' : ''
          });
        }
        const piped = pipes.length ? this.pipe(lines, pipes) : lines.slice(0, 12);
        this.lines(piped);
      }, 1.5);
    },
    systemctl(args) {
      const verb = args[0] || 'status';
      const unit = (args[1] || '').replace('.service', '');
      const map = { mysql: 'mysql', mysqld: 'mysql', nginx: 'nginx', 'tomazon-app': 'app', tomazon: 'app', app: 'app', ssh: 'ssh', sshd: 'ssh' };
      const which = map[unit];
      if (!which) { this.say('Unit ' + (args[1] || '(none)') + '.service could not be found.', 't-err'); return; }
      if (verb === 'restart' || verb === 'stop' || verb === 'start') {
        this.remoteRun(() => {
          if (which === 'ssh') { this.say('Restarting ssh while logged in through it. Bold. It comes back.', 't-note'); return; }
          this.sim.restartService(which, verb);
          if (verb !== 'start') this.say('(the service ' + (verb === 'stop' ? 'stopped' : 'restarted') + '. Watch what happens next.)', 't-note');
        }, 3);
        return;
      }
      this.remoteRun(() => this.lines(this.status(which)));
    },
    journalctl(args, pipes) {
      const i = args.indexOf('-u');
      const unit = i >= 0 ? (args[i + 1] || '').replace('.service', '') : '';
      this.remoteRun(() => {
        let out;
        if (unit === 'tomazon-app' || unit === 'tomazon') out = this.journal((e) => e.src === 'app' || /tomazon-app/.test(e.msg));
        else if (unit) out = this.journal((e) => e.msg.includes(unit));
        else out = this.journal();
        out = pipes.length ? this.pipe(out, pipes) : out.slice(-15);
        if (!out.length) this.say('-- No entries --', 't-dim'); else this.lines(out);
      }, 1.5);
    },
    tail(args, pipes) {
      const file = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop() || '';
      const nArg = args.find((a) => /^-n?\d+$/.test(a)) || '';
      const nIdx = args.indexOf('-n');
      const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 10 : parseInt(nArg.replace(/\D/g, ''), 10) || 10;
      const follow = args.includes('-f') || args.includes('-F');
      let gen;
      if (/access\.log$/.test(file)) gen = (k) => this.accessLog(k);
      else if (/nginx\/error\.log$/.test(file)) gen = (k) => this.errorLog(k);
      else if (/syslog$/.test(file)) gen = (k) => this.journal().concat(this.kernelLog(false)).slice(-k);
      else { this.say('tail: cannot open \'' + file + '\' for reading: No such file or directory', 't-err'); this.say('Try /var/log/nginx/access.log or /var/log/nginx/error.log', 't-note'); return; }
      this.remoteRun(() => {
        this.lines(this.pipe(gen(Math.min(n, 60)), pipes));
        if (!follow) return;
        this.say('(following. Press Ctrl+C to stop)', 't-note');
        this.setBusy(true, 'following');
        const more = () => {
          if (!this.busy || !this.remote) return;
          if (/access/.test(file)) {
            const mx = this.mix();
            const k = Math.max(1, Math.min(4, Math.round(this.sim.rps / 8)));
            for (let i = 0; i < k; i++) { const l = this.accessLine(this.date(), mx); if (this.pipe([l], pipes).length) this.print(l.h); }
          } else if (/error/.test(file)) {
            const l = this.errorLog(1)[0];
            if (l.cls !== 't-dim') this.lines([l]);
          }
          this.timers.push(setTimeout(more, 650));
        };
        this.timers.push(setTimeout(more, 650));
      });
    },
    last() {
      this.remoteRun(() => {
        const login = this.loginAt || this.date();
        const ts = (d) => DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2) + ' ' + this.hms(d).slice(0, 5);
        this.lines([
          'root     pts/0        ' + ME_IP.padEnd(17) + ts(login) + '   still logged in',
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Tue Oct  6 23:12 - 23:40  (00:28)',
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Fri Oct  2 21:03 - 21:15  (00:12)',
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Sun Sep 27 11:48 - 12:02  (00:14)',
          'reboot   system boot  6.8.0-45-generic Sat Mar 14 19:01   still running',
          '',
          'wtmp begins Sat Mar 14 19:01:55 2026'
        ]);
      });
    },
    nproc() { this.remoteRun(() => this.say(String(this.sim.vm.cpu))); },
    whoami() { this.remoteRun(() => this.say('root')); },
    hostname() { this.remoteRun(() => this.say(NODE)); },
    reboot() {
      this.remoteRun(() => {
        this.lines(['', 'Broadcast message from root@' + NODE + ' on pts/0 (' + DOW[this.date().getUTCDay()] + ' ' + this.ampm(this.date()) + '):', '', 'The system will reboot now!', '']);
        this.sim.reboot();
      });
    },
    exit() { this.lines(['logout', 'Connection to ' + HOST + ' closed.']); this.setRemote(false); },
    logout() { REMOTE.exit.call(this); }
  };

  Terminal.prototype.status = function (which) {
    const s = this.sim, now = s.t;
    const dot = (state) => span(state === 'ok' ? 't-ok' : state === 'warn' ? 't-warn' : 't-err', '●');
    const sinceStart = s.uptime();
    const since = (t) => { const d = this.dAt(t); return this.longTs(d) + '; ' + this.ago(now - t); };
    const bootSince = () => this.longTs(this.date(-sinceStart + 40)) + '; ' + this.ago(sinceStart - 40);
    const tailOf = (re) => this.journal((e) => re.test(e.msg)).slice(-5);
    if (which === 'mysql') {
      const st = s.mysql;
      const restarted = s.mysqlRestarts > 0 || s.bootT > 0;
      const active = st === 'running'
        ? { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(restarted ? since(s.mysqlT) : bootSince()) }
        : st === 'starting'
          ? { h: '     Active: ' + span('t-warn', 'activating (start)') + ' since ' + esc(since(s.mysqlT)) }
          : st === 'stopped'
            ? { h: '     Active: inactive (dead)' }
            : { h: '     Active: ' + span('t-err', 'activating (auto-restart) (Result: oom-kill)') + ' since ' + esc(since(s.mysqlT)) };
      const swapMB = s.demand > 0 ? (s.swapUsed / s.demand) * 172 : 0;
      return [
        { h: dot(st === 'running' ? 'ok' : st === 'starting' ? 'warn' : 'crit') + ' mysql.service - MySQL Community Server' },
        '     Loaded: loaded (/usr/lib/systemd/system/mysql.service; enabled; preset: enabled)',
        active,
        st === 'running' || st === 'starting' ? '   Main PID: ' + s.pids.mysqld + ' (mysqld)' : '    Process: ' + s.pids.mysqld + ' ExecStart=/usr/sbin/mysqld (code=killed, signal=KILL)',
        st === 'running' ? '     Status: "Server is operational"' : st === 'starting' ? '     Status: "Server startup in progress"' : '',
        st === 'running' ? '     Memory: ' + (172 - swapMB).toFixed(1) + 'M (peak: 181.3M swap: ' + swapMB.toFixed(1) + 'M)' : '',
        '     CGroup: /system.slice/mysql.service',
        ''
      ].filter((l) => l !== '').concat([''], tailOf(/mysql/));
    }
    if (which === 'app') {
      const st = s.app;
      return [
        { h: dot(st === 'running' ? (s.f > 0.05 ? 'warn' : 'ok') : 'crit') + ' tomazon-app.service - Tomazon web app' },
        '     Loaded: loaded (/etc/systemd/system/tomazon-app.service; enabled; preset: enabled)',
        st === 'running'
          ? { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(s.app === 'running' && s.appT > 0 ? since(s.appT) : bootSince()) }
          : st === 'stopped'
            ? { h: '     Active: inactive (dead)' }
            : { h: '     Active: ' + span('t-err', st === 'restarting' ? 'activating (start)' : 'activating (auto-restart) (Result: oom-kill)') + ' since ' + esc(since(s.appT)) },
        '   Main PID: ' + s.pids.app + ' (tomazon-app)',
        '      Tasks: ' + (Math.round(s.workers) + 3) + ' (limit: 1013)',
        '     Memory: ' + Math.round(64 + s.workers * 11) + 'M',
        '     CGroup: /system.slice/tomazon-app.service',
        '             ├─' + s.pids.app + ' "tomazon-app: master"',
        '             └─' + Math.round(s.workers) + ' x "tomazon-app: worker"  (max ' + s.maxWorkers + ')',
        ''
      ].concat(this.journal((e) => e.src === 'app' || /tomazon-app/.test(e.msg)).slice(-5));
    }
    if (which === 'nginx') {
      return [
        { h: dot('ok') + ' nginx.service - A high performance web server and a reverse proxy server' },
        '     Loaded: loaded (/usr/lib/systemd/system/nginx.service; enabled; preset: enabled)',
        { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(bootSince()) },
        '   Main PID: 803 (nginx)',
        '     CGroup: /system.slice/nginx.service',
        '             ├─803 "nginx: master process /usr/sbin/nginx -g daemon on; master_process on;"',
        '             └─804 "nginx: worker process"'
      ];
    }
    return [
      { h: dot('ok') + ' ssh.service - OpenBSD Secure Shell server' },
      { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(bootSince()) },
      '   Main PID: 711 (sshd)'
    ];
  };

  TZ.Terminal = Terminal;
})();
