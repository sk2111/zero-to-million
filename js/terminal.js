/* Tomazon War Room · terminal
   Your laptop's shell, and an SSH session into tomazon-prod-1. Every server
   command answers with a delay that comes from the simulation: when the box
   is thrashing, even typing `free -m` takes seconds. On a fresh server you can
   install the stack and deploy Tomazon for real (well, for simulated real). */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});
  const $ = (id) => document.getElementById(id);

  const HOST = 'tomazon.app', IP = '203.0.113.42', NODE = 'tomazon-prod-1', ME_IP = '198.51.100.77';
  const REPO = 'https://github.com/tom-and-you/tomazon.git';
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
  const REMOTE_CMDS = ['htop', 'top', 'free', 'uptime', 'dmesg', 'df', 'ps', 'systemctl', 'journalctl', 'tail', 'last', 'nproc', 'whoami', 'hostname',
    'reboot', 'exit', 'logout', 'help', 'clear', 'apt', 'git', 'cd', 'ls', 'pwd', 'cat', './deploy.sh'];

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

  const FILES = {
    'README.md': ['# Tomazon', '', 'Everything from A to T.', '', 'Built in 48 hours by you and Tom.', 'Shops list products. People order them. That\'s it (for now).'],
    'requirements.txt': ['fastapi==0.115.0', 'uvicorn[standard]==0.30.6', 'sqlalchemy==2.0.35', 'psycopg[binary]==3.2.3', 'alembic==1.13.3', 'jinja2==3.1.4', 'python-multipart==0.0.12'],
    'deploy.sh': [
      '#!/usr/bin/env bash',
      '# deploy.sh: written at 4 AM. It works. Don\'t touch it.',
      'set -euo pipefail',
      'python3 -m venv .venv',
      '.venv/bin/pip install -r requirements.txt',
      'sudo -u postgres createuser tomazon || true',
      'sudo -u postgres createdb -O tomazon tomazon || true',
      '.venv/bin/alembic upgrade head',
      'cp deploy/nginx.conf /etc/nginx/sites-enabled/tomazon',
      'certbot --nginx -d tomazon.app --non-interactive --agree-tos -m you@tomazon.app',
      'cp deploy/tomazon-app.service /etc/systemd/system/',
      'systemctl daemon-reload && systemctl enable --now tomazon-app',
      'systemctl reload nginx'
    ]
  };
  const REPO_LS = ['README.md', 'alembic', 'alembic.ini', 'deploy', 'deploy.sh', 'requirements.txt', 'tomazon'];

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
      this.cwd = '~';
      this.target = HOST;
      this.known = false; this.loggedInBefore = false;
      this.chain = [];
      this.ask = null;
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
    prompt() { return this.remote ? 'root@' + NODE + ':' + this.cwd + '#' : 'you@laptop:~$'; }
    showPrompt() {
      this.promptEl.textContent = this.prompt();
      this.promptEl.classList.toggle('remote', this.remote);
    }

    setRemote(on) {
      this.remote = on;
      this.cwd = '~';
      this.showPrompt();
      this.hostEl.textContent = on ? 'ssh root@' + this.target : 'you@laptop';
      this.loginAt = on ? this.date() : null;
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
      this.chain = []; this.ask = null;
      if (this.htop) this.quitHtop();
      this.out.innerHTML = '';
      this.known = false; this.loggedInBefore = false;
      this.target = HOST;
      this.setRemote(false);
      if (intro) for (const l of intro) this.say(l, 't-dim');
    }

    setBusy(on, label) {
      this.busy = on;
      this.line.classList.toggle('is-busy', on);
      if (!on) {
        this.waitEl.hidden = true; this.timers.forEach((id) => clearTimeout(id)); this.timers = [];
        if (this.chain.length) setTimeout(() => this.continueChain(), 60);
      } else this.waitLabel = label || 'waiting';
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

    /* Print a scripted sequence of lines (apt, git, deploy) with realistic pacing. */
    play(items, label, done) {
      this.setBusy(true, label || 'running');
      const slow = clamp(this.sim.cmdDelay() / 0.08, 1, 4);
      const t0 = performance.now();
      const tick = setInterval(() => {
        const el = (performance.now() - t0) / 1000;
        if (el > 1.2) { this.waitEl.hidden = false; this.waitText.textContent = this.waitLabel + ' · ' + Math.floor(el) + ' s'; }
      }, 200);
      this.timers.push(tick);
      let i = 0;
      const next = () => {
        if (!this.busy) return;
        if (i >= items.length) { this.setBusy(false); if (done) done(); this.scroll(); return; }
        const it = typeof items[i] === 'string' ? { l: items[i] } : items[i];
        i++;
        this.timers.push(setTimeout(() => {
          if (!this.busy) return;
          if (it.fn) it.fn();
          if (it.l != null) this.lines([it.l]);
          next();
        }, (it.d != null ? it.d : 0.08) * slow * 1000));
      };
      next();
    }

    cancel(silent) {
      this.chain = [];
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

    askUser(question, cb) {
      this.ask = { question, cb };
      this.promptEl.textContent = question;
      this.promptEl.classList.remove('remote');
      this.input.focus({ preventScroll: true });
    }

    onKey(e) {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (this.busy) this.cancel();
        else { this.echo(this.input.value + '^C'); this.input.value = ''; if (this.ask) { this.ask = null; this.showPrompt(); } }
        return;
      }
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
      if (this.ask) {
        const a = this.ask;
        this.ask = null;
        this.print(esc(a.question) + esc(cmd));
        this.showPrompt();
        a.cb(cmd);
        if (this.onRun) this.onRun(cmd);
        return true;
      }
      this.echo(cmd);
      if (!cmd) return true;
      this.history.push(cmd); this.hIdx = this.history.length;
      this.dispatch(cmd);
      if (this.onRun) this.onRun(cmd);
      return true;
    }

    /* `a && b && c`: run each part once the previous one has finished. */
    dispatch(cmd) {
      const parts = cmd.split(/\s*&&\s*/).filter(Boolean);
      this.chain = parts.slice(1);
      const ok = this.dispatchOne(parts[0]);
      if (ok === false) this.chain = [];
      else if (!this.busy) this.continueChain();
    }
    continueChain() {
      if (this.busy || this.typing || this.ask || !this.chain.length) return;
      const next = this.chain.shift();
      const ok = this.dispatchOne(next);
      if (ok === false) this.chain = [];
      else if (!this.busy) this.continueChain();
    }

    dispatchOne(cmd) {
      let c = cmd.replace(/\s+/g, ' ').trim();
      if (c.startsWith('sudo ')) c = c.slice(5);
      const parts = c.split('|').map((s) => s.trim());
      const words = parts[0].split(' ');
      let name = words[0], args = words.slice(1);
      const pipes = parts.slice(1);
      if ((name === 'bash' || name === 'sh') && args[0]) { name = args[0]; args = args.slice(1); }
      if (name === 'apt-get') name = 'apt';
      if (name === 'clear') { this.out.innerHTML = ''; return true; }
      if (name === 'help') { this.help(); return true; }
      if (/(^|\/)deploy\.sh$/.test(name)) {
        if (this.remote) return REMOTE.deploy.call(this, name);
        this.say('bash: ' + name + ': No such file or directory', 't-err');
        this.say('The deploy script runs on the server. Connect first.', 't-note');
        return false;
      }
      const table = this.remote ? REMOTE : LOCAL;
      if (table[name] && name !== 'deploy') return table[name].call(this, args, pipes, c);
      if (!this.remote && REMOTE[name]) { this.say("That's a command for the server. Connect first:  ssh root@" + (this.sim.dns ? HOST : IP), 't-note'); return false; }
      if (this.remote && LOCAL[name] && name !== 'ssh') { this.say('Run that from your laptop. Type exit to leave the server.', 't-note'); return false; }
      if (this.remote && name === 'ssh') { this.say("You're already on " + NODE + '.', 't-note'); return false; }
      this.say(name + ': command not found', 't-err');
      this.say('Type help to see the commands this terminal knows.', 't-note');
      return false;
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
          '  ssh root@' + (this.sim.dns ? 'tomazon.app' : IP).padEnd(15) + ' log in to the server',
          '  ping tomazon.app         is the machine reachable at all?',
          '  dig tomazon.app          does the domain point at our server?',
          '  curl -I https://tomazon.app   ask the website for a page',
          '  clear                    clear the screen'
        ]);
        return;
      }
      const setup = this.sim.live ? [] : [
        { t: 'Setting up a fresh server:', cls: 't-bold' },
        '  apt install -y nginx postgresql python3-venv   install the software',
        '  git clone ' + REPO,
        '  cd tomazon               go into the project folder',
        '  ls / cat deploy.sh       look around',
        '  ./deploy.sh              run the deploy script',
        ''
      ];
      this.lines(setup.concat([
        { t: 'On the server:', cls: 't-bold' },
        '  htop                     live view of CPU, memory and processes (q to quit)',
        '  free -m                  memory and swap in megabytes',
        '  uptime                   load average',
        '  dmesg | tail             what the kernel has been complaining about',
        '  ps aux --sort=-%mem | head     who is using the memory',
        '  systemctl status postgresql    is the database running?',
        '  journalctl -u tomazon-app      the app\'s own log',
        '  tail /var/log/nginx/access.log who is visiting (add -f to follow)',
        '  tail /var/log/nginx/error.log  what nginx is unhappy about',
        '  tail /var/log/postgresql/postgresql-16-main.log   the database log',
        '  df -h                    disk space',
        '  last                     who has logged in recently',
        '  systemctl restart postgresql   restart a service (also: tomazon-app, nginx)',
        '  reboot                   turn it off and on again',
        '  exit                     back to your laptop'
      ]));
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
    pgTs(d) { return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + ' ' + this.hms(d) + '.' + String(Math.floor(Math.random() * 1000)).padStart(3, '0') + ' IST'; }
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
    disk() {
      const s = this.sim;
      const used = !s.inst.nginx ? 2.0 : !s.live ? 2.4 : s.uptime() < 2 * 86400 ? 2.7 : 3.3;
      return { size: 9.6, used, pct: Math.round((used / 9.6) * 100) };
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
        this.lines([{ t: 'Connection to ' + this.target + ' closed by remote host.', cls: 't-err' }, 'Connection to ' + this.target + ' closed.']);
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
        span('h-c', 'Tasks: ') + span('h-w', String(procs.length + 31)) + ', ' + span('h-w', String(44 + Math.round(s.conns))) + ' thr; ' + span('h-g', String(running)) + ' running',
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
        const plain = p.cmd === 'kswapd0' || p.cmd.startsWith('nginx') || p.cmd.startsWith('sshd') || p.cmd.startsWith('/sbin') || p.cmd.startsWith('/usr/sbin');
        const line = esc(cols) + st + esc(tail) + (plain ? esc(p.cmd) : span('h-w', p.cmd));
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
        : pick(['/', '/p/rubber-duck-senior-edition', '/shops/sharma-general-store', '/p/works-on-my-machine-mug', '/static/app.css', '/orders/new', '/p/usb-c-cable-first-try']);
      const ref = viral ? (Math.random() < 0.8 ? 'https://l.instagram.com/' : '-') : (Math.random() < 0.5 ? 'https://tomazon.app/' : '-');
      const ua = pick(viral ? UA_VIRAL : UA_CALM);
      const rt = kind === 'ok' ? clamp(mx.sum.p50 * (0.6 + Math.random() * 0.9), 0.05, 9.9)
        : kind === 'timeout' ? 10 : kind === 'error' ? 0.02 + Math.random() * 0.05 : 0.001;
      const bytes = kind === 'ok' ? 4100 + Math.floor(Math.random() * 5000) : kind === 'timeout' ? 0 : kind === 'error' ? 21 : 157 + Math.floor(Math.random() * 40);
      const pre = randIp() + ' - - [' + this.nginxTs(when) + '] "GET ' + path + ' HTTP/2.0" ';
      const post = ' ' + bytes + ' "' + ref + '" "' + ua + '" rt=' + rt.toFixed(3);
      return { t: pre + status + post, h: esc(pre) + span(status === 200 ? 't-ok' : 't-err', String(status)) + esc(post) };
    }
    errorLine(when, kind) {
      const ts = when.getUTCFullYear() + '/' + p2(when.getUTCMonth() + 1) + '/' + p2(when.getUTCDate()) + ' ' + this.hms(when);
      const path = this.sim.rps > 8 ? '/p/protein-shaker-leakproof' : '/';
      const tail = ', client: ' + randIp() + ', server: tomazon.app, request: "GET ' + path + ' HTTP/2.0", upstream: "http://127.0.0.1:8000' + path + '", host: "tomazon.app"';
      const id = () => (40000 + Math.floor(Math.random() * 9000));
      const msg = {
        timeout: '[error] 804#804: *' + id() + ' upstream timed out (110: Connection timed out) while reading response header from upstream' + tail,
        badgw: '[error] 804#804: *' + id() + ' connect() failed (111: Connection refused) while connecting to upstream' + tail,
        busy: '[error] 804#804: *' + id() + ' limiting connections by zone "app"' + tail,
        error: '[warn] 804#804: *' + id() + ' upstream sent 500 Internal Server Error while reading response header from upstream' + tail
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
        return [{ t: this.sim.uptime() > 86400 ? '2026/10/09 18:22:41 [crit] 804#804: *31882 SSL_do_handshake() failed (SSL: error:0A00006C:SSL routines::bad key share) while SSL handshaking, client: 192.0.2.61, server: 0.0.0.0:443' : '(empty: nothing has gone wrong yet)', cls: 't-dim' }];
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
        const who = e.src === 'app' ? 'tomazon-app[' + s.pids.app + ']' : e.src === 'db' ? 'postgres[' + s.pids.db + ']' : 'systemd[1]';
        out.push({ t: this.syslogTs(this.dAt(e.t)) + ' ' + NODE + ' ' + who + ': ' + e.msg, cls: /kill|Killed|Failed|ERROR|Error|terminat|FATAL|TimeoutError/.test(e.msg) ? 't-err' : '' });
      }
      return out;
    }
    pgLog() {
      const s = this.sim, out = [];
      for (const e of s.log) {
        if (e.src !== 'db') continue;
        out.push({ t: this.pgTs(this.dAt(e.t)) + ' [' + s.pids.db + '] ' + e.msg, cls: /terminat|Killed|not properly/.test(e.msg) ? 't-err' : '' });
      }
      return out;
    }
    kernelLog(human) {
      const s = this.sim, out = [];
      if (s.bootT === 0) {
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
  const resolves = (term, host) => host === IP || ((host === HOST || host === NODE) && term.sim.dns);

  const LOCAL = {
    ssh(args) {
      const target = args.filter((a) => !a.startsWith('-')).pop() || '';
      if (!target) { this.say('usage: ssh [-p port] [user@]hostname', 't-err'); return false; }
      const host = target.includes('@') ? target.split('@')[1] : target;
      if (!resolves(this, host)) {
        this.say('ssh: Could not resolve hostname ' + host + ': Name or service not known', 't-err');
        if (host === HOST) this.say('(The domain doesn\'t point at the server yet. Use its IP address: ' + IP + ')', 't-note');
        return false;
      }
      this.target = host === IP ? IP : HOST;
      const d = this.sim.sshDelay();
      if (d < 0) { this.wait(0.3, () => this.say('ssh: connect to host ' + this.target + ' port 22: Connection refused', 't-err')); return true; }
      const connect = () => this.wait(d, () => {
        if (this.sim.down > 0) { this.say('ssh: connect to host ' + this.target + ' port 22: Connection refused', 't-err'); return; }
        const first = this.sim.freshHost && !this.loggedInBefore;
        this.loggedInBefore = true;
        this.setRemote(true);
        const s = this.sim, m = s.memInfo(), now = this.date(), disk = this.disk();
        const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '0%');
        this.lines([
          'Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-45-generic x86_64)',
          '',
          ' * Documentation:  https://help.ubuntu.com',
          ' * Management:     https://landscape.canonical.com',
          ' * Support:        https://ubuntu.com/pro',
          '',
          '  System information as of ' + DOW[now.getUTCDay()] + ' ' + MON[now.getUTCMonth()] + ' ' + now.getUTCDate() + ' ' + this.ampm(now) + ' IST ' + now.getUTCFullYear(),
          '',
          { h: '  System load:  ' + span(s.load[0] > s.vm.cpu * 2 ? 't-err' : '', s.load[0].toFixed(2).padEnd(17)) + 'Processes:             ' + (s.procs().length + 92) },
          '  Usage of /:   ' + ((disk.used / disk.size) * 100).toFixed(1) + '% of 9.52GB    Users logged in:       0',
          { h: '  Memory usage: ' + span(m.used / m.total > 0.9 ? 't-err' : '', pct(m.used, m.total).padEnd(17)) + 'IPv4 address for eth0: ' + IP },
          { h: '  Swap usage:   ' + span(m.swap > 50 ? 't-err' : '', pct(m.swap, m.swapTotal)) },
          '',
          first ? '' : 'Last login: Tue Oct  6 23:12:40 2026 from ' + ME_IP
        ].filter((l, i, a) => !(l === '' && i === a.length - 1)));
      }, 'connecting');
      if (this.sim.freshHost && !this.known) {
        const label = host === IP ? IP + ' (' + IP + ')' : HOST + ' (' + IP + ')';
        this.wait(0.35, () => {
          this.lines([
            "The authenticity of host '" + label + "' can't be established.",
            'ED25519 key fingerprint is SHA256:x8Qe2dP4vF0tq1mK7cJ9nWbR3sLhY6uTzA5oGiNe0Vw.',
            'This key is not known by any other names.'
          ]);
          const ask = (q) => this.askUser(q, (ans) => {
            const a = ans.trim().toLowerCase();
            if (a === 'yes') {
              this.known = true;
              this.say("Warning: Permanently added '" + IP + "' (ED25519) to the list of known hosts.");
              connect();
            } else if (a === 'no') {
              this.say('Host key verification failed.', 't-err');
            } else ask("Please type 'yes', 'no' or the fingerprint: ");
          });
          ask('Are you sure you want to continue connecting (yes/no/[fingerprint])? ');
        }, 'connecting');
        return true;
      }
      connect();
      return true;
    },
    ping(args) {
      const host = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop();
      if (!host) { this.say('usage: ping host', 't-err'); return false; }
      if (!resolves(this, host)) { this.say('ping: ' + host + ': Name or service not known', 't-err'); return false; }
      this.say('PING ' + host + ' (' + IP + ') 56(84) bytes of data.');
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
          this.say('');
          this.say('--- ' + host + ' ping statistics ---');
          const loss = Math.round((1 - times.length / 4) * 100);
          this.say('4 packets transmitted, ' + times.length + ' received, ' + loss + '% packet loss, time 3004ms', loss ? 't-err' : '');
          if (times.length) this.say('rtt min/avg/max/mdev = ' + Math.min(...times).toFixed(3) + '/' + (times.reduce((a, b) => a + b, 0) / times.length).toFixed(3) + '/' + Math.max(...times).toFixed(3) + '/2.114 ms');
          this.setBusy(false);
        }
      };
      this.timers.push(setTimeout(one, 300));
      return true;
    },
    dig(args) {
      const host = args.filter((a) => !a.startsWith('-') && !a.startsWith('+')).pop() || HOST;
      const ok = host === HOST && this.sim.dns;
      this.wait(0.25, () => this.lines([
        '; <<>> DiG 9.18.28 <<>> ' + host,
        ';; global options: +cmd',
        ';; Got answer:',
        ';; ->>HEADER<<- opcode: QUERY, status: ' + (ok ? 'NOERROR' : 'NXDOMAIN') + ', id: 41822',
        '',
        ok ? ';; ANSWER SECTION:' : ';; AUTHORITY SECTION:',
        ok ? { h: esc('tomazon.app.\t\t300\tIN\tA\t') + span('t-ok', IP) } : 'app.\t\t\t300\tIN\tSOA\tns-tld1.charlestonroadregistry.com. cloud-dns-hostmaster.google.com. 1 21600 3600 259200 300',
        '',
        ';; Query time: 23 msec',
        ';; SERVER: 1.1.1.1#53(1.1.1.1) (UDP)'
      ]));
      return true;
    },
    nslookup(args) { return LOCAL.dig.call(this, args); },
    curl(args) {
      const url = args.filter((a) => !a.startsWith('-')).pop() || '';
      const m = /^(?:(https?):\/\/)?([^/:]+)/.exec(url);
      const host = m ? m[2] : '';
      if (!host || !resolves(this, host)) { this.say('curl: (6) Could not resolve host: ' + (host || '(none)'), 't-err'); return false; }
      const s = this.sim;
      const port = (m[1] || 'http') === 'https' ? 443 : 80;
      const head = (code, extra, proto) => [{ t: (proto || 'HTTP/2') + ' ' + code, cls: code === 200 ? 't-ok' : 't-err' }, 'server: nginx/1.24.0 (Ubuntu)', 'date: ' + this.date().toUTCString(), 'content-type: text/html; charset=utf-8'].concat(extra || []);
      if (s.down > 0 || !s.inst.nginx) { this.wait(0.05, () => this.say('curl: (7) Failed to connect to ' + host + ' port ' + port + ' after 41 ms: Couldn\'t connect to server', 't-err')); return true; }
      if (s.app === 'none') { this.wait(0.1, () => this.lines(head(200, ['content-length: 615', '', '(the default "Welcome to nginx!" page)'], 'HTTP/1.1'))); return true; }
      const view = s.customerView(s.summary(4));
      if (view.id === 'timeout') { this.wait(10, () => this.say('curl: (28) Operation timed out after 10001 milliseconds with 0 bytes received', 't-err'), 'waiting for tomazon.app'); return true; }
      if (view.id === 'error') { this.wait(0.15, () => this.lines(head(500, ['content-length: 21', '', 'Internal Server Error']))); return true; }
      if (view.id === 'busy') { this.wait(0.05, () => this.lines(head(503))); return true; }
      if (view.id === 'badgw') { this.wait(0.05, () => this.lines(head(502))); return true; }
      const t = clamp(view.p50 || 0.15, 0.08, 9.5);
      this.wait(t, () => this.lines(head(200, ['content-length: 48211', 'cache-control: no-cache'])), 'waiting for tomazon.app');
      return true;
    }
  };

  /* ---------- commands on the server ---------- */
  const REMOTE = {
    htop() { this.remoteRun(() => this.openHtop(), 2); return true; },
    top() { return REMOTE.htop.call(this); },
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
      return true;
    },
    uptime() {
      this.remoteRun(() => {
        const u = this.sim.uptime(), d = Math.floor(u / 86400), h = Math.floor((u % 86400) / 3600), mi = Math.floor((u % 3600) / 60);
        const l = this.sim.load;
        this.say(' ' + this.hms(this.date()) + ' up ' + (d ? d + ' days, ' : '') + String(h).padStart(2) + ':' + p2(mi) + ',  1 user,  load average: ' + l.map((x) => x.toFixed(2)).join(', '));
      });
      return true;
    },
    dmesg(args, pipes) {
      this.remoteRun(() => {
        const out = this.pipe(this.kernelLog(args.includes('-T') || args.includes('-H')), pipes);
        if (!out.length) this.say('(no matching lines)', 't-dim'); else this.lines(out);
      }, 1.5);
      return true;
    },
    df() {
      const d = this.disk();
      this.remoteRun(() => this.lines([
        'Filesystem      Size  Used Avail Use% Mounted on',
        'tmpfs            52M  1.1M   51M   3% /run',
        '/dev/vda1       9.6G  ' + d.used.toFixed(1) + 'G  ' + (d.size - d.used).toFixed(1) + 'G  ' + String(d.pct).padStart(2) + '% /',
        'tmpfs           256M     0  256M   0% /dev/shm',
        '/dev/vda15      105M  6.1M   99M   6% /boot/efi'
      ]));
      return true;
    },
    ps(args, pipes) {
      this.remoteRun(() => {
        const s = this.sim, m = s.memInfo();
        const procs = s.procs().sort((a, b) => b.res - a.res);
        const lines = ['USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'];
        for (const p of procs) {
          const recent = p.cmd.includes('127.0.0.1(') || p.cmd.startsWith('uvicorn worker');
          const start = recent ? this.hms(this.date(-30 - (p.pid % 97))).slice(0, 5) : 'Mar14';
          const stat = p.s + (p.cmd.startsWith('/usr/lib/postgresql') ? 's' : p.cmd.includes('master') || p.cmd.startsWith('uvicorn tomazon') ? 's' : '');
          lines.push({
            t: p.user.padEnd(8).slice(0, 8) + String(p.pid).padStart(8) + ' ' + Math.min(99.9, p.cpu).toFixed(1).padStart(4) + ' ' + ((p.res / m.total) * 100).toFixed(1).padStart(4) + ' ' +
              String(Math.round(p.virt * 1024)).padStart(7) + ' ' + String(Math.round(p.res * 1024)).padStart(6) + ' ?        ' + stat.padEnd(4) + ' ' + start.padEnd(6) + fmtTime(p.time).split('.')[0].padStart(6) + ' ' + p.cmd,
            cls: p.s === 'D' ? 't-warn' : ''
          });
        }
        this.lines(pipes.length ? this.pipe(lines, pipes) : lines.slice(0, 12));
      }, 1.5);
      return true;
    },
    systemctl(args) {
      const verb = args[0] || 'status';
      const unit = (args[1] || '').replace('.service', '');
      const map = { postgresql: 'db', postgres: 'db', 'postgresql@16-main': 'db', nginx: 'nginx', 'tomazon-app': 'app', tomazon: 'app', app: 'app', ssh: 'ssh', sshd: 'ssh' };
      const which = map[unit];
      const installed = which === 'ssh' || (which === 'db' ? this.sim.inst.db : which === 'nginx' ? this.sim.inst.nginx : which === 'app' ? this.sim.inst.app : false);
      if (!which || !installed) { this.say('Unit ' + (args[1] || '(none)').replace('.service', '') + '.service could not be found.', 't-err'); return false; }
      if (verb === 'restart' || verb === 'stop' || verb === 'start') {
        this.remoteRun(() => {
          if (which === 'ssh') { this.say('Restarting ssh while logged in through it. Bold. It comes back.', 't-note'); return; }
          this.sim.restartService(which, verb);
          if (verb !== 'start') this.say('(the service ' + (verb === 'stop' ? 'stopped' : 'restarted') + '. Watch what happens next.)', 't-note');
        }, 3);
        return true;
      }
      this.remoteRun(() => this.lines(this.status(which)));
      return true;
    },
    journalctl(args, pipes) {
      const i = args.indexOf('-u');
      const unit = i >= 0 ? (args[i + 1] || '').replace('.service', '') : '';
      this.remoteRun(() => {
        let out;
        if (unit === 'tomazon-app' || unit === 'tomazon') out = this.journal((e) => e.src === 'app' || /tomazon-app/.test(e.msg));
        else if (/^postgres/.test(unit)) out = this.journal((e) => e.src === 'db' || /postgres/i.test(e.msg));
        else if (unit) out = this.journal((e) => e.msg.includes(unit));
        else out = this.journal();
        out = pipes.length ? this.pipe(out, pipes) : out.slice(-15);
        if (!out.length) this.say('-- No entries --', 't-dim'); else this.lines(out);
      }, 1.5);
      return true;
    },
    tail(args, pipes) {
      const file = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop() || '';
      const nArg = args.find((a) => /^-n?\d+$/.test(a)) || '';
      const nIdx = args.indexOf('-n');
      const n = nIdx >= 0 ? parseInt(args[nIdx + 1], 10) || 10 : parseInt(nArg.replace(/\D/g, ''), 10) || 10;
      const follow = args.includes('-f') || args.includes('-F');
      const s = this.sim;
      let gen;
      if (/nginx\/access\.log$/.test(file) && s.inst.nginx) gen = (k) => this.accessLog(k);
      else if (/nginx\/error\.log$/.test(file) && s.inst.nginx) gen = (k) => this.errorLog(k);
      else if (/postgresql-16-main\.log$/.test(file) && s.inst.db) gen = (k) => this.pgLog().slice(-k);
      else if (/syslog$/.test(file)) gen = (k) => this.journal().concat(this.kernelLog(false)).slice(-k);
      else { this.say('tail: cannot open \'' + file + '\' for reading: No such file or directory', 't-err'); if (s.inst.nginx) this.say('Try /var/log/nginx/access.log or /var/log/nginx/error.log', 't-note'); return false; }
      this.remoteRun(() => {
        const first = this.pipe(gen(Math.min(n, 60)), pipes);
        if (!first.length) this.say('(empty)', 't-dim'); else this.lines(first);
        if (!follow) return;
        this.say('(following. Press Ctrl+C to stop)', 't-note');
        this.setBusy(true, 'following');
        const more = () => {
          if (!this.busy || !this.remote) return;
          if (/access/.test(file)) {
            const mx = this.mix();
            const k = Math.max(1, Math.min(4, Math.round(this.sim.rps / 8)));
            if (Math.random() < Math.min(1, this.sim.rps)) {
              for (let i = 0; i < k; i++) { const l = this.accessLine(this.date(), mx); if (this.pipe([l], pipes).length) this.print(l.h); }
            }
          } else if (/error/.test(file)) {
            const l = this.errorLog(1)[0];
            if (l.cls !== 't-dim') this.lines([l]);
          }
          this.timers.push(setTimeout(more, 650));
        };
        this.timers.push(setTimeout(more, 650));
      });
      return true;
    },
    last() {
      this.remoteRun(() => {
        const login = this.loginAt || this.date();
        const ts = (d) => DOW[d.getUTCDay()] + ' ' + MON[d.getUTCMonth()] + ' ' + String(d.getUTCDate()).padStart(2) + ' ' + this.hms(d).slice(0, 5);
        const fresh = this.sim.freshHost;
        this.lines([
          'root     pts/0        ' + ME_IP.padEnd(17) + ts(login) + '   still logged in'
        ].concat(fresh ? [] : [
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Tue Oct  6 23:12 - 23:40  (00:28)',
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Fri Oct  2 21:03 - 21:15  (00:12)',
          'root     pts/0        ' + ME_IP.padEnd(17) + 'Sun Sep 27 11:48 - 12:02  (00:14)'
        ], [
          'reboot   system boot  6.8.0-45-generic Sat Mar 14 18:19   still running',
          '',
          'wtmp begins Sat Mar 14 18:19:02 2026'
        ]));
      });
      return true;
    },
    nproc() { this.remoteRun(() => this.say(String(this.sim.vm.cpu))); return true; },
    whoami() { this.remoteRun(() => this.say('root')); return true; },
    hostname() { this.remoteRun(() => this.say(NODE)); return true; },
    pwd() { this.say(this.cwd === '~' ? '/root' : '/root/tomazon'); return true; },
    cd(args) {
      const to = (args[0] || '~').replace(/\/$/, '');
      if (['~', '/root', '..'].includes(to) && !(to === '..' && this.cwd === '~')) { this.cwd = '~'; this.showPrompt(); return true; }
      if (['tomazon', '~/tomazon', '/root/tomazon', './tomazon'].includes(to) && this.sim.repo) { this.cwd = '~/tomazon'; this.showPrompt(); return true; }
      this.say('bash: cd: ' + to + ': No such file or directory', 't-err');
      return false;
    },
    ls() {
      const s = this.sim;
      const items = this.cwd === '~/tomazon' ? REPO_LS : s.repo ? ['tomazon'] : [];
      if (items.length) this.print(items.map((f) => (/\.|deploy\.sh/.test(f) && f !== 'deploy' ? (f === 'deploy.sh' ? span('t-ok', f) : esc(f)) : span('t-cyan', f))).join('  '));
      return true;
    },
    cat(args) {
      const f = (args[0] || '').replace(/^\.\//, '');
      const inRepo = this.cwd === '~/tomazon' ? f : f.replace(/^tomazon\//, '');
      const ok = this.sim.repo && (this.cwd === '~/tomazon' || f.startsWith('tomazon/'));
      if (ok && FILES[inRepo]) { this.lines(FILES[inRepo]); return true; }
      if (f === '/etc/os-release') { this.lines(['PRETTY_NAME="Ubuntu 24.04.1 LTS"', 'NAME="Ubuntu"', 'VERSION_ID="24.04"', 'VERSION="24.04.1 LTS (Noble Numbat)"']); return true; }
      this.say('cat: ' + (args[0] || '') + ': No such file or directory', 't-err');
      return false;
    },
    git(args) {
      const s = this.sim, sub = args[0];
      if (sub === 'clone') {
        if (s.repo) { this.say("fatal: destination path 'tomazon' already exists and is not an empty directory.", 't-err'); return false; }
        if (this.cwd !== '~') { this.say('(Clone it from your home folder: cd ~ first.)', 't-note'); return false; }
        this.play([
          { l: "Cloning into 'tomazon'...", d: 0.2 },
          { l: 'remote: Enumerating objects: 214, done.', d: 0.5 },
          'remote: Counting objects: 100% (214/214), done.',
          'remote: Compressing objects: 100% (131/131), done.',
          { l: 'remote: Total 214 (delta 88), reused 190 (delta 70), pack-reused 0', d: 0.3 },
          { l: 'Receiving objects: 100% (214/214), 61.20 KiB | 1.18 MiB/s, done.', d: 0.5 },
          { l: 'Resolving deltas: 100% (88/88), done.', d: 0.2, fn: () => { s.repo = true; } }
        ], 'cloning');
        return true;
      }
      if (!(this.cwd === '~/tomazon' && s.repo)) { this.say('fatal: not a git repository (or any of the parent directories): .git', 't-err'); return false; }
      if (sub === 'log') {
        this.lines([
          { h: span('t-warn', 'a91f3c2') + ' ' + span('t-cyan', '(HEAD -> main, origin/main)') + esc(' deploy script, written at 4 AM') },
          { h: span('t-warn', '77d0e1b') + esc(' orders: shops see new orders on /dashboard') },
          { h: span('t-warn', '5be2a40') + esc(' fix: price was a string. Tom found it.') },
          { h: span('t-warn', '3c5b9aa') + esc(' catalog: shops can add products with a price') },
          { h: span('t-warn', 'e1f04d2') + esc(' models: stores, products, orders') },
          { h: span('t-warn', '0b6a1f9') + esc(' initial commit: hello tomazon') }
        ]);
        return true;
      }
      if (sub === 'status') { this.lines(['On branch main', "Your branch is up to date with 'origin/main'.", '', 'nothing to commit, working tree clean']); return true; }
      if (sub === 'pull') { this.wait(0.6, () => this.say('Already up to date.')); return true; }
      this.say('(this terminal knows git clone, log, status and pull)', 't-note');
      return false;
    },
    apt(args) {
      const s = this.sim;
      const sub = args.find((a) => !a.startsWith('-'));
      if (sub === 'update') {
        this.play([
          { l: 'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease', d: 0.4 },
          'Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]',
          'Get:3 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]',
          { l: 'Fetched 4,812 kB in 2s (2,406 kB/s)', d: 0.8 },
          'Reading package lists... Done',
          'Building dependency tree... Done',
          'Reading state information... Done',
          '23 packages can be upgraded. Run \'apt list --upgradable\' to see them.'
        ], 'updating');
        return true;
      }
      if (sub !== 'install') { this.say('usage: apt update | apt install [-y] <package>...', 't-err'); return false; }
      const pkgs = args.filter((a) => !a.startsWith('-') && a !== 'install');
      const KNOWN = { nginx: 'nginx', postgresql: 'db', 'postgresql-16': 'db', 'python3-venv': 'py', 'python3-pip': 'pip', git: 'git', htop: 'htop', curl: 'curl' };
      const unknown = pkgs.filter((p) => !KNOWN[p]);
      if (!pkgs.length) { this.say('0 upgraded, 0 newly installed, 0 to remove and 23 not upgraded.'); return true; }
      if (unknown.length) { this.lines(['Reading package lists... Done', 'Building dependency tree... Done', { t: 'E: Unable to locate package ' + unknown[0], cls: 't-err' }]); return false; }
      const need = pkgs.filter((p) => (KNOWN[p] === 'nginx' && !s.inst.nginx) || (KNOWN[p] === 'db' && !s.inst.db) || (KNOWN[p] === 'py' && !s.pyVenv));
      const head = ['Reading package lists... Done', 'Building dependency tree... Done', 'Reading state information... Done'];
      if (!need.length) {
        this.play(head.concat(pkgs.map((p) => p + ' is already the newest version.'), ['0 upgraded, 0 newly installed, 0 to remove and 23 not upgraded.']), 'apt');
        return true;
      }
      const names = [];
      if (need.includes('nginx')) names.push('nginx', 'nginx-common');
      if (need.some((p) => KNOWN[p] === 'db')) names.push('postgresql', 'postgresql-16', 'postgresql-client-16', 'postgresql-common', 'libpq5', 'ssl-cert');
      if (need.includes('python3-venv')) names.push('python3-venv', 'python3.12-venv', 'python3-pip-whl', 'python3-setuptools-whl');
      const steps = head.concat([
        'The following NEW packages will be installed:',
        '  ' + names.join(' '),
        '0 upgraded, ' + (names.length + 9) + ' newly installed, 0 to remove and 23 not upgraded.',
        'Need to get ' + (names.length * 4.6).toFixed(1) + ' MB of archives.',
        'After this operation, ' + Math.round(names.length * 17) + ' MB of additional disk space will be used.'
      ]);
      names.slice(0, 5).forEach((n, i) => steps.push({ l: 'Get:' + (i + 1) + ' http://archive.ubuntu.com/ubuntu noble-updates/main amd64 ' + n + ' amd64 [' + (200 + i * 913) + ' kB]', d: 0.25 }));
      steps.push({ l: 'Fetched ' + (names.length * 4.6).toFixed(1) + ' MB in 4s (11.8 MB/s)', d: 0.9 });
      if (need.includes('nginx')) steps.push({ l: 'Setting up nginx (1.24.0-2ubuntu7.1) ...', d: 0.6, fn: () => s.install('nginx') });
      if (need.some((p) => KNOWN[p] === 'db')) {
        steps.push({ l: 'Setting up postgresql-16 (16.4-0ubuntu0.24.04.2) ...', d: 0.6 });
        steps.push({ l: 'Creating new PostgreSQL cluster 16/main ...', d: 1.2 });
        steps.push({ l: '/usr/lib/postgresql/16/bin/initdb -D /var/lib/postgresql/16/main --auth-local peer --auth-host scram-sha-256', d: 0.3 });
        steps.push({ l: 'Success. You can now start the database server using pg_ctlcluster 16 main start', d: 0.8, fn: () => s.install('db') });
      }
      if (need.includes('python3-venv')) steps.push({ l: 'Setting up python3.12-venv (3.12.3-1ubuntu0.1) ...', d: 0.4, fn: () => { s.pyVenv = true; } });
      steps.push({ l: 'Processing triggers for man-db (2.12.0-4build2) ...', d: 0.5 });
      this.play(steps, 'installing');
      return true;
    },
    deploy(name) {
      const s = this.sim;
      const path = name.replace(/^\.\//, '');
      const here = this.cwd === '~/tomazon' ? path === 'deploy.sh' : path === 'tomazon/deploy.sh';
      if (!s.repo || !here) {
        this.say('bash: ' + name + ': No such file or directory', 't-err');
        this.say(!s.repo ? 'Get the code first: git clone ' + REPO : 'The script is in the project folder: cd tomazon', 't-note');
        return false;
      }
      const missing = [!s.inst.nginx && 'nginx', !s.inst.db && 'postgresql', !s.pyVenv && 'python3-venv'].filter(Boolean);
      if (missing.length) {
        this.lines([{ t: '==> Checking the server', cls: 't-bold' }, { t: 'deploy.sh: missing: ' + missing.join(', '), cls: 't-err' }, 'Install them first: apt install -y nginx postgresql python3-venv']);
        return false;
      }
      if (s.inst.app) {
        this.play([{ t: '==> Already deployed. Restarting the app', cls: 't-bold' }, { l: 'Restarted tomazon-app.service', d: 0.8, fn: () => s.restartService('app') }].map((x) => (x.t ? { l: x } : x)), 'deploying');
        return true;
      }
      const B = (t) => ({ l: { t, cls: 't-bold' }, d: 0.4 });
      this.play([
        B('==> Creating a Python virtual environment in .venv'),
        B('==> Installing Python packages'),
        { l: 'Collecting fastapi==0.115.0 (from -r requirements.txt (line 1))', d: 0.5 },
        'Collecting uvicorn==0.30.6 (from uvicorn[standard]==0.30.6->-r requirements.txt (line 2))',
        'Collecting sqlalchemy==2.0.35 (from -r requirements.txt (line 3))',
        'Collecting psycopg==3.2.3 (from psycopg[binary]==3.2.3->-r requirements.txt (line 4))',
        { l: 'Successfully installed alembic-1.13.3 fastapi-0.115.0 jinja2-3.1.4 psycopg-3.2.3 sqlalchemy-2.0.35 uvicorn-0.30.6 (+19 dependencies)', d: 1.6 },
        B('==> Creating the database and its user'),
        { l: 'CREATE ROLE', d: 0.3 },
        B('==> Running migrations'),
        'INFO  [alembic.runtime.migration] Context impl PostgresqlImpl.',
        { l: 'INFO  [alembic.runtime.migration] Running upgrade  -> e1f04d2, models: stores, products, orders', d: 0.5 },
        B('==> Configuring nginx for tomazon.app'),
        B('==> Getting an HTTPS certificate'),
        { l: 'Successfully received certificate.', d: 1.2, fn: () => { s.dns = true; } },
        'Certificate is saved at: /etc/letsencrypt/live/tomazon.app/fullchain.pem',
        B('==> Starting tomazon-app.service'),
        { l: 'Created symlink /etc/systemd/system/multi-user.target.wants/tomazon-app.service → /etc/systemd/system/tomazon-app.service.', d: 0.5, fn: () => { s.install('app'); s.setRamp(0.6, 8); } },
        { l: '', d: 0.3 },
        { l: { t: '✓ Tomazon is live at https://tomazon.app', cls: 't-ok' }, d: 0.2 }
      ], 'deploying');
      return true;
    },
    reboot() {
      this.remoteRun(() => {
        this.lines(['', 'Broadcast message from root@' + NODE + ' on pts/0 (' + DOW[this.date().getUTCDay()] + ' ' + this.ampm(this.date()) + '):', '', 'The system will reboot now!', '']);
        this.sim.reboot();
      });
      return true;
    },
    exit() { this.lines(['logout', 'Connection to ' + this.target + ' closed.']); this.setRemote(false); return true; },
    logout() { return REMOTE.exit.call(this); }
  };

  Terminal.prototype.status = function (which) {
    const s = this.sim, now = s.t;
    const dot = (state) => span(state === 'ok' ? 't-ok' : state === 'warn' ? 't-warn' : 't-err', '●');
    const sinceStart = s.uptime();
    const since = (t) => { const d = this.dAt(t); return this.longTs(d) + '; ' + this.ago(now - t); };
    const bootSince = () => this.longTs(this.date(-sinceStart + 40)) + '; ' + this.ago(sinceStart - 40);
    if (which === 'db') {
      const st = s.db;
      const up = st !== 'stopped';
      const startedAt = s.dbRestarts > 0 || s.bootT > 0 || s.dbT > 0 ? since(s.dbT) : bootSince();
      return [
        { h: dot(st === 'running' ? (s.f > 0.05 ? 'warn' : 'ok') : st === 'stopped' ? 'crit' : 'warn') + ' postgresql@16-main.service - PostgreSQL Cluster 16-main' },
        '     Loaded: loaded (/usr/lib/systemd/system/postgresql@.service; enabled-runtime; preset: enabled)',
        up ? { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(startedAt) } : { h: '     Active: inactive (dead)' },
        up ? '   Main PID: ' + s.pids.db + ' (postgres)' : '',
        up ? '      Tasks: ' + (Math.round(s.conns) + 6) + ' (limit: 1013)' : '',
        up ? '     Memory: ' + Math.round(172 + s.conns * 8) + 'M (peak: ' + Math.round(180 + s.maxConns * 8) + 'M)' : '',
        up ? '     CGroup: /system.slice/system-postgresql.slice/postgresql@16-main.service' : '',
        up ? '             ├─' + s.pids.db + ' /usr/lib/postgresql/16/bin/postgres -D /var/lib/postgresql/16/main' : '',
        up ? '             └─' + Math.round(s.conns) + ' connection processes ("postgres: 16/main: tomazon tomazon ...")' : ''
      ].filter((l) => l !== '').concat([''], this.journal((e) => e.src === 'db' || /postgresql/.test(e.msg)).slice(-5));
    }
    if (which === 'app') {
      const st = s.app;
      return [
        { h: dot(st === 'running' ? (s.f > 0.05 ? 'warn' : 'ok') : 'crit') + ' tomazon-app.service - Tomazon web app' },
        '     Loaded: loaded (/etc/systemd/system/tomazon-app.service; enabled; preset: enabled)',
        st === 'running'
          ? { h: '     Active: ' + span('t-ok', 'active (running)') + ' since ' + esc(s.appT > 0 ? since(s.appT) : bootSince()) }
          : st === 'stopped'
            ? { h: '     Active: inactive (dead)' }
            : { h: '     Active: ' + span('t-err', st === 'restarting' ? 'activating (start)' : 'activating (auto-restart) (Result: oom-kill)') + ' since ' + esc(since(s.appT)) },
        '   Main PID: ' + s.pids.app + ' (uvicorn)',
        '      Tasks: ' + (Math.round(s.conns) + 9) + ' (limit: 1013)',
        '     Memory: ' + Math.round(64 + s.conns * 2.75) + 'M',
        '     CGroup: /system.slice/tomazon-app.service',
        '             ├─' + s.pids.app + ' uvicorn tomazon.main:app --workers 2',
        '             ├─' + (s.pids.app + 1) + ' uvicorn worker 1 (tomazon.main:app)',
        '             └─' + (s.pids.app + 2) + ' uvicorn worker 2 (tomazon.main:app)   pool: ' + Math.round(s.conns) + ' of ' + s.maxConns + ' DB connections in use',
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
