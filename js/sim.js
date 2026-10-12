/* Tomazon War Room · server model
   One VM running nginx, the Tomazon app (a pool of workers) and MySQL.
   Requests move through a first-in-first-out queue in small cohorts, so response
   times come from real queueing and Little's Law, not from random numbers. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});

  TZ.VM_SIZES = [
    { id: 'xs',  cpu: 1, ram: 512,   cost: 4,  label: '1 vCPU · 512 MB' },
    { id: 's',   cpu: 1, ram: 1024,  cost: 6,  label: '1 vCPU · 1 GB' },
    { id: 'm',   cpu: 1, ram: 2048,  cost: 12, label: '1 vCPU · 2 GB' },
    { id: 'l',   cpu: 2, ram: 4096,  cost: 24, label: '2 vCPU · 4 GB' },
    { id: 'xl',  cpu: 4, ram: 8192,  cost: 48, label: '4 vCPU · 8 GB' },
    { id: 'xxl', cpu: 8, ram: 16384, cost: 96, label: '8 vCPU · 16 GB' }
  ];
  TZ.vmById = (id) => TZ.VM_SIZES.find((v) => v.id === id) || TZ.VM_SIZES[0];

  const P = (TZ.PARAMS = {
    cpuMs: 45,          // CPU time to build one page (app + database)
    ioMs: 60,           // time spent waiting on network and disk per request
    failCpuMs: 4,       // CPU time to return an error page
    workerMB: 11,       // memory held by each busy app worker
    lineMB: 0.05,       // memory per request waiting in the listen queue
    baseMB: { kernel: 96, sshd: 6, nginx: 14, app: 64, mysqld: 172 },
    minWorkers: 4,
    spawnPerS: 40,      // how fast the app can start workers on a healthy box
    idleExitS: 6,       // idle workers exit after a while
    swapMB: 1024,
    coldMB: 60,         // pages nobody touches; swapping these is harmless
    swapOutMBps: 18,    // how fast the disk can absorb swapped pages
    swapFreeMBps: 60,
    thrash: 24,         // slowdown per fraction of busy memory living on disk
    timeoutS: 10,       // customers give up after this long
    mysqlRestartS: 10,
    mysqlStartS: 5,
    appRestartS: 3,
    conversion: 0.02,   // orders per successful page view
    hungTaskS: 120,
    workerTimeoutS: 30  // the app kills a worker stuck on one request this long
  });

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const blankFx = () => ({ arrived: 0, fast: 0, slow: 0, crawl: 0, timeout: 0, error: 0, busy: 0, down: 0, badgw: 0 });
  const parseClock = (c) => {
    if (typeof c === 'number') return c;
    const [h, m, s] = String(c).split(':').map(Number);
    return h * 3600 + (m || 0) * 60 + (s || 0);
  };

  class Sim {
    constructor(o) { this.reset(o || {}); }

    reset(o) {
      o = o || {};
      this.t = 0;
      this.vm = TZ.vmById(o.vm || 'xs');
      this.rps = o.rps != null ? o.rps : 3;
      this.ramp = null;
      this.swapOn = o.swap != null ? o.swap : true;
      this.maxWorkers = o.workers || 100;
      this.lineMax = o.line || 511;
      this.clock0 = parseClock(o.clock != null ? o.clock : '02:25:00');
      this.date = o.date || 'Sat 10 Oct';
      this.ymd = o.ymd || '2026-10-10';
      this.uptime0 = o.uptimeS != null ? o.uptimeS : (o.uptimeDays || 0) * 86400 + 4 * 3600 + 12 * 60 + 8;
      this.bootT = 0;
      this.queue = [];
      this.inflight = 0;
      this.workers = P.minWorkers;
      this.swapUsed = 0;
      this.mysql = 'running'; this.mysqlT = 0; this.mysqlRestarts = 0;
      this.app = 'running'; this.appT = 0;
      this.down = 0; this.downReason = ''; this.pendingVm = null;
      this.eff = 1; this.kernel = 0; this.f = 0;
      this.cpuUser = 0.02; this.cpuSys = 0.01; this.disk = 0.02; this.saturated = false;
      this.load = [0.05, 0.03, 0.01];
      this.demand = 0;
      this.arrEma = this.rps;
      this.win = [];
      this.hist = [];
      this.histT = 0;
      this.log = [];
      this.thrashSince = null; this.lastHung = -1e9; this.hungCount = 0;
      this.lostOrders = 0; this.wasted = 0;
      this.fx = blankFx();
      this.pids = { mysqld: 1187, app: 912, worker: 2201 };
      this.tag = o.tag || null;
      if (o.ramp) this.setRamp(o.ramp.to, o.ramp.dur, o.ramp.at || 0);
      if (o.prewarm) this.prewarm(o.prewarm);
    }

    /* ---------- knobs ---------- */
    setRps(v) { this.ramp = null; this.rps = Math.max(0, v); }
    setRamp(to, dur, at) { this.ramp = { from: this.rps, to, dur: dur || 20, t0: this.t + (at || 0) }; }
    /* Like reloading the app with a new worker limit: extra workers exit now. */
    setWorkers(n) {
      this.maxWorkers = Math.max(1, Math.round(n));
      if (this.workers > this.maxWorkers) this.workers = this.maxWorkers;
      this.shed();
    }
    setLine(n) { this.lineMax = n; this.shed(); }
    shed() {
      const cap = this.maxWorkers + this.lineMax;
      if (this.inflight > cap) {
        const extra = this.inflight - cap;
        this.trimNewest(extra);
        this.record(this.lineMax <= 50 ? 'busy' : 'timeout', extra, this.lineMax <= 50 ? 0.03 : P.timeoutS);
      }
    }
    setSwap(on) {
      if (on === this.swapOn) return;
      this.swapOn = on;
      if (on) this.kern('Adding 1048572k swap on /swapfile.  Priority:-2 extents:6 across:1048572k FS');
      else this.sys('swapoff /swapfile: pages moved back to RAM.');
    }
    reboot() {
      if (this.down > 0) return;
      this.sys('Received SIGINT, rebooting.');
      this.powerCycle('Rebooting', 7 + (1 - this.eff) * 8, null);
    }
    resize(id) {
      if (this.down > 0 || id === this.vm.id) return;
      this.sys('Powering off for resize to ' + TZ.vmById(id).label + '.');
      this.powerCycle('Resizing', 12, id);
    }
    /* systemctl restart|stop|start for mysql, app and nginx */
    restartService(which, verb) {
      verb = verb || 'restart';
      if (which === 'mysql') {
        if (verb === 'stop') {
          this.mysql = 'stopped';
          this.sys('Stopping mysql.service - MySQL Community Server...');
          this.sys('Stopped mysql.service - MySQL Community Server.');
        } else {
          if (verb === 'restart') this.sys('Stopped mysql.service - MySQL Community Server.');
          this.sys('Starting mysql.service - MySQL Community Server...');
          this.mysql = 'starting'; this.mysqlT = this.t;
        }
      } else if (which === 'app') {
        const live = this.queue.reduce((a, c) => a + (c.gone ? 0 : c.n), 0);
        if (verb !== 'start') {
          this.record('badgw', live, 0.3);
          this.queue = []; this.inflight = 0; this.workers = 0;
          this.sys('Stopping tomazon-app.service - Tomazon web app...');
          this.sys('Stopped tomazon-app.service - Tomazon web app.');
        }
        if (verb === 'stop') this.app = 'stopped';
        else { this.app = 'restarting'; this.appT = this.t; }
      } else if (which === 'nginx') {
        this.sys('Stopping nginx.service - A high performance web server and a reverse proxy server...');
        this.sys('Started nginx.service - A high performance web server and a reverse proxy server.');
      }
    }

    powerCycle(reason, secs, vmId) {
      const live = this.queue.reduce((a, c) => a + (c.gone ? 0 : c.n), 0);
      this.record('down', live, 0.5);
      this.queue = []; this.inflight = 0; this.workers = 0; this.swapUsed = 0; this.demand = 0;
      this.mysql = 'stopped';
      this.down = secs; this.downReason = reason;
      if (vmId) this.pendingVm = TZ.vmById(vmId);
    }

    /* ---------- simulation ---------- */
    prewarm(seconds) {
      const n = Math.round(seconds / 0.1);
      for (let i = 0; i < n; i++) this.step(0.1);
      this.fx = blankFx();
    }

    step(dt) {
      this.t += dt;
      const t = this.t;

      if (this.ramp && t >= this.ramp.t0) {
        const k = clamp((t - this.ramp.t0) / this.ramp.dur, 0, 1);
        this.rps = this.ramp.from + (this.ramp.to - this.ramp.from) * k * k * (3 - 2 * k);
        if (k >= 1) this.ramp = null;
      }
      const lam = Math.max(0, this.rps * (0.82 + 0.36 * Math.random()));
      const arr = lam * dt;
      this.arrEma += (lam - this.arrEma) * (1 - Math.exp(-dt / 2));
      this.fx.arrived += arr;

      if (this.down > 0) {
        this.down -= dt;
        this.record('down', arr, 0.02);
        this.cpuUser = 0; this.cpuSys = 0; this.disk = 0; this.saturated = false;
        this.eff = 1; this.kernel = 0; this.f = 0; this.demand = 0;
        this.ageLoad(dt, 0);
        if (this.down <= 0) this.boot();
        this.sample();
        return;
      }

      // 1. Admission. If the app process is gone, nginx answers 502 straight away.
      if (this.app !== 'running') {
        this.record('badgw', arr, 0.01);
      } else {
        this.queue.push({ n: arr, t0: t, gone: false });
        this.inflight += arr;
        const cap = this.maxWorkers + this.lineMax;
        if (this.inflight > cap) {
          const extra = this.inflight - cap;
          this.trimNewest(extra);
          // A short line means nginx says "busy" (503) at once. A full kernel
          // backlog silently drops the connection and the browser waits, then gives up.
          if (this.lineMax <= 50) this.record('busy', extra, 0.03);
          else this.record('timeout', extra, P.timeoutS);
        }
      }

      // 2. Memory. Every busy request holds a worker, and every worker holds RAM.
      const vm = this.vm;
      const usable = vm.ram * 0.96;
      const busy = Math.min(this.inflight, this.maxWorkers);
      const want = this.app === 'running' ? Math.max(P.minWorkers, busy) : 0;
      if (want > this.workers) this.workers = Math.min(want, this.workers + P.spawnPerS * this.eff * dt);
      else this.workers += (want - this.workers) * Math.min(1, dt / P.idleExitS);

      const b = P.baseMB;
      const dbMB = this.mysql === 'running' ? b.mysqld : this.mysql === 'starting' ? b.mysqld * 0.55 : 0;
      const appMB = this.app === 'running' ? b.app : 0;
      const demand = b.kernel + b.sshd + b.nginx + appMB + dbMB +
        this.workers * P.workerMB + Math.max(0, this.inflight - this.workers) * P.lineMB;
      // When processes exit, their pages in swap are freed with them.
      if (this.demand > 0 && demand < this.demand && this.swapUsed > 0) this.swapUsed -= (this.demand - demand) * (this.swapUsed / this.demand);
      this.demand = demand;

      const swapCap = this.swapOn ? P.swapMB : 0;
      const over = Math.max(0, demand - usable);
      const swapWant = Math.min(over, swapCap);
      if (swapWant > this.swapUsed) this.swapUsed += Math.min(swapWant - this.swapUsed, P.swapOutMBps * dt);
      else this.swapUsed -= Math.min(this.swapUsed - swapWant, P.swapFreeMBps * dt);
      const stalled = Math.max(0, over - this.swapUsed);
      if (over > swapCap + 8) this.oom();

      // 3. Thrashing. Busy memory that lives on disk makes everything wait for the disk.
      // The kernel swaps out idle memory first; only busy pages on disk hurt.
      const idleMB = Math.max(0, this.workers - busy) * P.workerMB;
      const hot = Math.max(0, this.swapUsed - P.coldMB - idleMB) + stalled * 2;
      const f = clamp(hot / Math.max(demand, 1), 0, 1);
      this.f = f;
      this.eff = 1 / (1 + P.thrash * f);
      this.kernel = Math.min(0.6, f * 1.6);

      // 4. Serve requests in arrival order.
      const healthy = this.app === 'running' && this.mysql === 'running';
      const cpuMs = healthy ? P.cpuMs : P.failCpuMs;
      const svc = (cpuMs + (healthy ? P.ioMs : 6)) / 1000;
      const capRps = (vm.cpu * 1000 / cpuMs) * this.eff * (1 - this.kernel);
      const rho = Math.min(0.95, this.arrEma / Math.max(capRps, 0.01));
      const sEff = cpuMs / 1000 / vm.cpu / Math.max(this.eff * (1 - this.kernel), 0.01);
      const wq = sEff * rho / (1 - rho);
      const minAge = svc / this.eff + wq;   // service time + average queueing delay
      const workerRps = Math.max(1, this.workers) / svc;
      let budget = Math.min(capRps, workerRps) * dt;

      const q = this.queue;
      for (let i = 0; i < q.length; i++) {
        const c = q[i];
        if (t - c.t0 <= P.timeoutS) break;
        if (!c.gone) { c.gone = true; this.record('timeout', c.n, P.timeoutS); }
      }
      let killed = 0;
      while (q.length && t - q[0].t0 > P.workerTimeoutS) {
        const c = q.shift();
        killed += c.n; this.inflight -= c.n; this.wasted += c.n;
      }
      if (killed > 0 && t - (this.lastKillLog || -1e9) > 15) {
        this.lastKillLog = t;
        this.app_('[CRITICAL] WORKER TIMEOUT (pid:' + (this.pids.worker + 3 * Math.floor(Math.random() * Math.max(1, this.workers))) + ')');
      }
      let served = 0;
      while (budget > 1e-9 && q.length) {
        const c = q[0];
        const age = t - c.t0;
        if (age < minAge) break;
        const take = Math.min(c.n, budget);
        c.n -= take; budget -= take; served += take; this.inflight -= take;
        if (c.gone) this.wasted += take;   // the customer left long ago; the work is wasted
        else if (!healthy) this.record('error', take, age);
        else this.record('ok', take, clamp(age + wq * (-Math.log(1 - Math.random()) - 1), svc, P.timeoutS - 0.1));
        if (c.n <= 1e-9) q.shift();
      }
      if (this.inflight < 1e-6) this.inflight = 0;
      // Thrashing keeps the CPU busy too: page faults and reclaim are CPU work.
      this.saturated = (budget <= 1e-9 && q.length > 0 && t - q[0].t0 >= minAge) || (f > 0.05 && this.inflight > 1);

      // 5. What the machine looks like from the inside.
      const useful = clamp((served / dt) * cpuMs / 1000 / vm.cpu, 0, 1);
      if (this.saturated) {
        this.cpuSys = clamp(this.kernel + (1 - this.eff) * 0.3 + 0.03, 0.03, 0.88);
        this.cpuUser = 1 - this.cpuSys;
      } else {
        this.cpuSys = clamp(0.01 + this.kernel + useful * 0.06, 0, 0.9);
        this.cpuUser = clamp(useful, 0, 1 - this.cpuSys);
      }
      const swapping = Math.abs(swapWant - this.swapUsed) > 1 ? 0.5 : 0;
      this.disk = clamp(0.02 + f * 3 + swapping, 0, 1);
      const running = (this.saturated || f > 0.05)
        ? Math.min(this.inflight, this.workers) + 1 + this.kernel * 3
        : useful * vm.cpu * 1.2 + Math.min(this.inflight, this.workers) * 0.1;
      this.ageLoad(dt, running);

      // 6. Kernel complaints and service restarts.
      if (this.eff < 0.2) {
        if (this.thrashSince == null) this.thrashSince = t;
        if (t - this.thrashSince > P.hungTaskS && t - this.lastHung > P.hungTaskS && this.hungCount < 10) this.hungTask();
      } else {
        this.thrashSince = null;
      }
      if (this.mysql === 'killed' && t - this.mysqlT >= P.mysqlRestartS) {
        this.mysql = 'starting'; this.mysqlT = t;
        this.sys('mysql.service: Scheduled restart job, restart counter is at ' + this.mysqlRestarts + '.');
        this.sys('Starting mysql.service - MySQL Community Server...');
      } else if (this.mysql === 'starting' && t - this.mysqlT >= P.mysqlStartS / Math.max(this.eff, 0.2)) {
        this.mysql = 'running';
        this.pids.mysqld += 40 + Math.floor(Math.random() * 300);
        this.sys('Started mysql.service - MySQL Community Server.');
      }
      if ((this.app === 'killed' && t - this.appT >= P.appRestartS) || (this.app === 'restarting' && t - this.appT >= 1.5)) {
        this.app = 'running'; this.workers = P.minWorkers;
        this.pids.app += 20 + Math.floor(Math.random() * 200);
        this.pids.worker = this.pids.app + 7;
        this.sys('Started tomazon-app.service - Tomazon web app.');
      }
      this.sample();
    }

    trimNewest(x) {
      const q = this.queue;
      while (x > 1e-9 && q.length) {
        const c = q[q.length - 1];
        const take = Math.min(c.n, x);
        c.n -= take; x -= take; this.inflight -= take;
        if (c.n <= 1e-9) q.pop();
      }
    }

    ageLoad(dt, running) {
      const taus = [8, 40, 120];
      for (let i = 0; i < 3; i++) this.load[i] += (running - this.load[i]) * (1 - Math.exp(-dt / taus[i]));
    }

    oom() {
      const invoker = Math.random() < 0.75 ? 'tomazon-app' : 'nginx';
      this.kern(invoker + ' invoked oom-killer: gfp_mask=0x140cca(GFP_HIGHUSER_MOVABLE|__GFP_COMP), order=0, oom_score_adj=0');
      if (this.mysql === 'running' || this.mysql === 'starting') {
        // The kernel kills the process with the highest "badness" score: usually the biggest one.
        const rss = Math.round(P.baseMB.mysqld * 1024 * (0.88 + Math.random() * 0.1));
        this.kern('Out of memory: Killed process ' + this.pids.mysqld + ' (mysqld) total-vm:1312448kB, anon-rss:' + rss + 'kB, file-rss:0kB, shmem-rss:0kB, UID:113 pgtables:684kB oom_score_adj:0');
        this.mysqlRestarts++;
        this.sys('mysql.service: A process of this unit has been killed by the OOM killer.');
        this.sys('mysql.service: Main process exited, code=killed, status=9/KILL');
        this.sys("mysql.service: Failed with result 'oom-kill'.");
        this.mysql = 'killed'; this.mysqlT = this.t;
      } else {
        this.kern('Out of memory: Killed process ' + this.pids.app + ' (tomazon-app) total-vm:421888kB, anon-rss:' + Math.round(this.workers * P.workerMB * 1024) + 'kB, file-rss:0kB, shmem-rss:0kB, UID:33 pgtables:212kB oom_score_adj:0');
        this.sys('tomazon-app.service: Main process exited, code=killed, status=9/KILL');
        this.sys("tomazon-app.service: Failed with result 'oom-kill'.");
        const live = this.queue.reduce((a, c) => a + (c.gone ? 0 : c.n), 0);
        this.record('badgw', live, 0.4);
        this.queue = []; this.inflight = 0; this.workers = 0;
        this.app = 'killed'; this.appT = this.t;
      }
      this.swapUsed *= 0.6;
    }

    hungTask() {
      const victims = ['mysqld:1203', 'tomazon-app:' + (this.pids.worker + 13), 'systemd-journal:312', 'mysqld:1210', 'tomazon-app:' + (this.pids.worker + 41)];
      const v = victims[this.hungCount % victims.length];
      this.kern('INFO: task ' + v + ' blocked for more than 120 seconds.');
      this.kern('      Not tainted 6.8.0-45-generic #45-Ubuntu');
      this.kern('"echo 0 > /proc/sys/kernel/hung_task_timeout_secs" disables this message.');
      this.lastHung = this.t; this.hungCount++;
    }

    boot() {
      if (this.pendingVm) { this.vm = this.pendingVm; this.pendingVm = null; }
      this.down = 0; this.downReason = '';
      this.queue = []; this.inflight = 0; this.workers = P.minWorkers; this.swapUsed = 0;
      this.mysql = 'starting'; this.mysqlT = this.t; this.app = 'running';
      this.bootT = this.t; this.uptime0 = 0;
      this.thrashSince = null; this.hungCount = 0;
      this.pids = { mysqld: 1187 + Math.floor(Math.random() * 40), app: 912, worker: 2201 };
      this.kern('Linux version 6.8.0-45-generic (buildd@lcy02-amd64-115) #45-Ubuntu SMP PREEMPT_DYNAMIC');
      this.kern('Memory: ' + Math.round(this.vm.ram * 1024 * 0.93) + 'K/' + this.vm.ram * 1024 + 'K available');
      this.kern('smpboot: Allowing ' + this.vm.cpu + ' CPUs, 0 hotplug CPUs');
      if (this.swapOn) this.kern('Adding 1048572k swap on /swapfile.  Priority:-2 extents:6 across:1048572k FS');
      this.sys('Started ssh.service - OpenBSD Secure Shell server.');
      this.sys('Started nginx.service - A high performance web server and a reverse proxy server.');
      this.sys('Starting mysql.service - MySQL Community Server...');
      this.sys('Started tomazon-app.service - Tomazon web app.');
    }

    /* ---------- bookkeeping ---------- */
    record(k, n, lat) {
      if (!(n > 0)) return;
      this.win.push({ t: this.t, k, n, lat });
      const fx = this.fx;
      if (k === 'ok') {
        if (lat < 1) fx.fast += n; else if (lat < 3) fx.slow += n; else fx.crawl += n;
      } else {
        fx[k] += n;
        this.lostOrders += n * P.conversion;
      }
    }

    kern(msg) { this.log.push({ t: this.t, src: 'kern', msg }); this.trimLog(); }
    app_(msg) { this.log.push({ t: this.t, src: 'app', msg }); this.trimLog(); }
    sys(msg) { this.log.push({ t: this.t, src: 'sys', msg }); this.trimLog(); }
    trimLog() { if (this.log.length > 400) this.log.splice(0, this.log.length - 400); }

    sample() {
      if (this.t - this.histT < 1) return;
      this.histT = this.t;
      const cut = this.t - 15;
      let i = 0;
      while (i < this.win.length && this.win[i].t < cut) i++;
      if (i) this.win.splice(0, i);
      const s = this.summary(3);
      const m = this.memInfo();
      this.hist.push({
        t: this.t, inRate: this.arrEma, okRate: s.okRate, p95: s.p95, err: s.errFrac,
        cpu: this.cpuUser + this.cpuSys, ram: m.used / m.total, swap: m.swapTotal ? m.swap / m.swapTotal : 0
      });
      if (this.hist.length > 240) this.hist.shift();
    }

    takeFx() { const fx = this.fx; this.fx = blankFx(); return fx; }

    /* ---------- read-outs ---------- */
    summary(W) {
      W = W || 4;
      const t0 = this.t - W;
      const by = { ok: 0, timeout: 0, error: 0, busy: 0, down: 0, badgw: 0 };
      const rows = [];
      let tot = 0;
      for (let i = this.win.length - 1; i >= 0; i--) {
        const r = this.win[i];
        if (r.t < t0) break;
        by[r.k] += r.n; tot += r.n; rows.push(r);
      }
      rows.sort((a, b) => a.lat - b.lat);
      const pct = (q) => {
        if (!rows.length) return 0;
        const need = q * tot;
        let acc = 0;
        for (const r of rows) { acc += r.n; if (acc >= need) return r.lat; }
        return rows[rows.length - 1].lat;
      };
      const span = Math.max(0.5, Math.min(W, this.t));
      // Nothing finished recently: customers are still staring at a spinner.
      const waiting = this.queue.length ? Math.min(P.timeoutS, this.t - this.queue[0].t0) : 0;
      return {
        total: tot, by, waiting,
        inRate: this.arrEma,
        okRate: by.ok / span,
        errFrac: tot > 0 ? 1 - by.ok / tot : 0,
        p50: tot > 0 ? pct(0.5) : waiting, p95: tot > 0 ? pct(0.95) : waiting,
        ordersPerMin: (by.ok / span) * 60 * P.conversion
      };
    }

    status(sum) {
      if (this.down > 0) return { id: 'down', label: this.downReason || 'Offline' };
      if (this.app !== 'running') return { id: 'crit', label: { killed: 'App crashed', restarting: 'App restarting', stopped: 'App stopped' }[this.app] };
      if (this.mysql !== 'running') return { id: 'crit', label: { killed: 'Database down', starting: 'Database starting', stopped: 'Database stopped' }[this.mysql] || 'Database down' };
      if (this.eff < 0.35) return { id: 'crit', label: 'Thrashing' };
      if (sum.by.busy > sum.total * 0.05 && sum.by.busy >= sum.by.timeout && this.eff > 0.8) return { id: 'warn', label: 'Shedding load' };
      if (sum.errFrac > 0.2) return { id: 'crit', label: 'Failing' };
      if (sum.p95 > 2 || sum.errFrac > 0.02 || this.f > 0.02) return { id: 'warn', label: 'Struggling' };
      return { id: 'ok', label: 'Healthy' };
    }

    /* What a customer's browser shows right now. */
    customerView(sum) {
      if (this.down > 0) return { id: 'refused' };
      if (sum.total < 0.05) return sum.waiting > 1.5 ? { id: 'slow', p50: sum.waiting } : { id: 'ok', p50: 0.1 };
      const by = sum.by, tot = sum.total, okShare = by.ok / tot;
      if (okShare >= 0.97) return { id: sum.p50 > 1.5 ? 'slow' : 'ok', p50: sum.p50 };
      const worst = ['timeout', 'error', 'busy', 'badgw', 'down'].sort((a, b) => by[b] - by[a])[0];
      if (okShare >= 0.4) return { id: 'partial', p50: sum.p50, worst, share: 1 - okShare };
      return { id: worst === 'down' ? 'refused' : worst };
    }

    memInfo() {
      const vm = this.vm;
      const used = this.down > 0 ? 0 : clamp(this.demand - this.swapUsed, 0, vm.ram - 6);
      const left = vm.ram - used;
      const cache = this.down > 0 ? 0 : Math.max(0, Math.min(left - 6, vm.ram * 0.18));
      return { total: vm.ram, used, cache, free: Math.max(0, left - cache), swap: this.swapUsed, swapTotal: this.swapOn ? P.swapMB : 0 };
    }

    wall() { return ((this.clock0 + this.t) % 86400 + 86400) % 86400; }
    uptime() { return this.t - this.bootT + this.uptime0; }

    sshDelay() {
      if (this.down > 0) return -1;
      return Math.min(14, 0.4 / this.eff + (this.saturated ? 1.2 : 0) + (this.eff < 0.5 ? 1 : 0));
    }
    cmdDelay() { return Math.min(4.5, 0.03 + 0.05 / this.eff + (this.saturated ? 0.15 : 0)); }

    /* Process table for htop and ps. CPU% is per core, like htop. */
    procs() {
      const vm = this.vm, thr = this.f > 0.05;
      const share = this.demand > 0 ? this.swapUsed / this.demand : 0;
      const res = (mb) => Math.max(0.2, mb * (1 - share));
      const user = this.cpuUser * vm.cpu * 100;
      const sys = this.cpuSys * vm.cpu * 100;
      const up = this.uptime();
      const nW = Math.round(this.workers);
      const list = [];
      const add = (p) => list.push(Object.assign({ virt: 0, res: 0, shr: 0, s: 'S', cpu: 0, user: 'root', time: 0 }, p));
      add({ pid: 1, virt: 22, res: 9.2, shr: 6.1, cpu: 0, time: up * 0.0004, cmd: '/sbin/init' });
      add({ pid: 47, s: this.kernel > 0.02 ? 'R' : 'S', cpu: this.kernel > 0.02 ? sys * 0.7 : 0, time: up * 0.0002 + (thr ? 1900 : 0), cmd: 'kswapd0' });
      add({ pid: 312, virt: 48, res: res(14), shr: 12, s: thr ? 'D' : 'S', cpu: sys * 0.05, time: up * 0.0003, cmd: '/usr/lib/systemd/systemd-journald' });
      add({ pid: 711, virt: 12, res: res(5.4), shr: 4.2, time: up * 0.00005, cmd: 'sshd: /usr/sbin/sshd -D [listener]' });
      add({ pid: 803, virt: 55, res: res(4.1), shr: 2.3, time: up * 0.0001, cmd: 'nginx: master process /usr/sbin/nginx' });
      add({ pid: 804, user: 'www-data', virt: 58, res: res(9.8), shr: 3.1, s: this.saturated ? 'R' : 'S', cpu: user * 0.04, time: up * 0.0015, cmd: 'nginx: worker process' });
      if (this.mysql === 'running' || this.mysql === 'starting') {
        add({ pid: this.pids.mysqld, user: 'mysql', virt: 1281, res: res(P.baseMB.mysqld * (this.mysql === 'starting' ? 0.55 : 1)), shr: 0, s: thr ? 'D' : 'S', cpu: user * 0.3, time: up * 0.008, cmd: '/usr/sbin/mysqld' });
      }
      if (this.app === 'running') {
        add({ pid: this.pids.app, user: 'www-data', virt: 412, res: res(P.baseMB.app), shr: 9, cpu: user * 0.02, time: up * 0.001, cmd: 'tomazon-app: master' });
        for (let i = 0; i < nW; i++) {
          const busy = i < this.inflight;
          add({
            pid: this.pids.worker + i * 3, user: 'www-data', virt: 298, res: res(P.workerMB), shr: 1.2,
            s: thr ? (i % 6 === 0 ? 'R' : 'D') : busy ? 'R' : 'S',
            cpu: nW ? (user * 0.64) / nW * (busy ? 1 : 0.1) : 0, time: 2 + (i * 7.3) % 40, cmd: 'tomazon-app: worker'
          });
        }
      }
      add({ pid: 1402, virt: 8, res: 2.6, shr: 2.2, time: up * 0.00002, cmd: '/usr/sbin/cron -f' });
      return list;
    }
  }

  TZ.Sim = Sim;
})();
