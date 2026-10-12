/* Tomazon War Room · monitoring panel
   Meters for the machine, tiles for what customers feel, and two small
   time-series charts (2px lines, 10% area wash, end dot, hover crosshair). */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});
  const $ = (id) => document.getElementById(id);

  const fmtS = (s) => (s >= 9.95 ? '10+ s' : s >= 1 ? s.toFixed(1) + ' s' : Math.round(s * 1000) + ' ms');
  const fmtRate = (r) => (r >= 100 ? Math.round(r).toString() : r >= 10 ? r.toFixed(0) : r.toFixed(1));
  const sev = (f, warn, crit) => (f >= crit ? 'crit' : f >= warn ? 'warn' : 'ok');

  class LineChart {
    constructor(canvas, tip, opts) {
      this.canvas = canvas; this.tip = tip; this.o = opts;
      this.ctx = canvas.getContext('2d');
      this.data = [];
      this.hover = null;
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      this.c = { grid: v('--line-soft'), base: v('--line'), muted: v('--muted'), ink: v('--ink'), ink2: v('--ink-2'), panel: v('--panel'), mono: v('--font-mono') };
      this.series = opts.series.map((s) => Object.assign({}, s, { color: v(s.token) }));
      new ResizeObserver(() => { this.size(); this.draw(); }).observe(canvas);
      canvas.addEventListener('pointermove', (e) => { const r = canvas.getBoundingClientRect(); this.hover = e.clientX - r.left; this.draw(); });
      canvas.addEventListener('pointerleave', () => { this.hover = null; this.tip.hidden = true; this.draw(); });
      this.size();
    }

    size() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    set(data) { this.data = data; this.draw(); }

    niceMax(m) {
      for (const n of this.o.steps) if (m <= n) return n;
      return this.o.steps[this.o.steps.length - 1];
    }

    draw() {
      const ctx = this.ctx, c = this.c, w = this.w, h = this.h, o = this.o;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      const padL = 40, padR = 60, padT = 8, padB = 6;
      const pw = w - padL - padR, ph = h - padT - padB;
      const data = this.data;
      const span = o.window;
      const tEnd = data.length ? data[data.length - 1].t : 0;
      const tStart = tEnd - span;
      let maxV = o.minMax;
      for (const d of data) for (const s of this.series) maxV = Math.max(maxV, s.get(d) * 1.08);
      const yMax = this.niceMax(maxV);
      const X = (t) => padL + ((t - tStart) / span) * pw;
      const Y = (v) => padT + ph - (Math.min(v, yMax) / yMax) * ph;

      // gridlines + ticks
      ctx.font = '500 10.5px ' + c.mono;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 2; i++) {
        const v = (yMax / 2) * i;
        const y = Math.round(Y(v)) + 0.5;
        ctx.strokeStyle = i === 0 ? c.base : c.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
        ctx.fillStyle = c.muted;
        ctx.fillText(o.tick(v), padL - 6, y);
      }
      // reference line (customers give up)
      if (o.ref && yMax >= o.ref.at) {
        const y = Math.round(Y(o.ref.at)) + 0.5;
        ctx.strokeStyle = c.ink2; ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + pw, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.ink2; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillText(o.ref.label, padL + 4, y - 2);
      }
      if (data.length < 2) return;

      const pts = data.filter((d) => d.t >= tStart - 1);
      this.series.forEach((s, si) => {
        // area wash for the first series only
        if (si === 0 && o.area) {
          ctx.beginPath();
          pts.forEach((d, i) => { const x = X(d.t), y = Y(s.get(d)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.lineTo(X(pts[pts.length - 1].t), Y(0)); ctx.lineTo(X(pts[0].t), Y(0)); ctx.closePath();
          ctx.fillStyle = s.color; ctx.globalAlpha = 0.1; ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        pts.forEach((d, i) => { const x = X(d.t), y = Y(s.get(d)); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.stroke();
      });
      // end dots + end labels (text in ink, never in the series color)
      const last = pts[pts.length - 1];
      const ends = this.series.map((s) => ({ s, v: s.get(last), y: Y(s.get(last)) }));
      if (ends.length === 2 && Math.abs(ends[0].y - ends[1].y) < 12) {
        const mid = (ends[0].y + ends[1].y) / 2;
        const up = ends[0].y <= ends[1].y ? 0 : 1;
        ends[up].ly = mid - 7; ends[1 - up].ly = mid + 7;
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '600 11px ' + c.mono;
      for (const e of ends) {
        const x = X(last.t);
        ctx.beginPath(); ctx.arc(x, e.y, 6, 0, Math.PI * 2); ctx.fillStyle = c.panel; ctx.fill();
        ctx.beginPath(); ctx.arc(x, e.y, 4, 0, Math.PI * 2); ctx.fillStyle = e.s.color; ctx.fill();
        ctx.fillStyle = c.ink;
        ctx.fillText(o.label(e.v), x + 9, Math.max(padT + 5, Math.min(padT + ph - 2, e.ly != null ? e.ly : e.y)));
      }

      // hover crosshair + tooltip
      if (this.hover != null && this.hover >= padL && this.hover <= padL + pw) {
        const t = tStart + ((this.hover - padL) / pw) * span;
        let best = pts[0];
        for (const d of pts) if (Math.abs(d.t - t) < Math.abs(best.t - t)) best = d;
        const x = Math.round(X(best.t)) + 0.5;
        ctx.strokeStyle = c.ink2; ctx.globalAlpha = 0.6;
        ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + ph); ctx.stroke();
        ctx.globalAlpha = 1;
        for (const s of this.series) {
          const y = Y(s.get(best));
          ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = c.panel; ctx.fill();
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = s.color; ctx.fill();
        }
        const ago = Math.max(0, Math.round(tEnd - best.t));
        this.tip.innerHTML = '<b>' + (ago ? ago + ' s ago' : 'now') + '</b>' + this.series.map((s) =>
          '<div class="tip-row"><i class="tip-key" style="background:' + s.color + '"></i>' + s.name + ': ' + o.label(s.get(best)) + '</div>').join('');
        this.tip.hidden = false;
        const tw = this.tip.offsetWidth;
        this.tip.style.left = Math.min(w - tw - 2, Math.max(2, x + 10)) + 'px';
      }
    }
  }

  class Metrics {
    constructor() {
      this.meters = {};
      for (const id of ['mCpu', 'mRam', 'mSwap', 'mDisk']) {
        const el = $(id);
        this.meters[id] = { el, fill: el.querySelector('.meter-track i'), val: el.querySelector('.meter-val'), note: el.querySelector('.meter-note') };
      }
      this.kpis = {};
      for (const id of ['kIn', 'kOk', 'kErr', 'kP95', 'kOrders', 'kLoad']) {
        const el = $(id);
        this.kpis[id] = { el, val: el.querySelector('.kpi-val'), unit: el.querySelector('.kpi-unit') };
      }
      this.pill = $('statusPill');
      this.lat = new LineChart($('chartLat'), $('tipLat'), {
        window: 120, minMax: 0.4, steps: [0.5, 1, 2, 4, 6, 12], area: true,
        ref: { at: 10, label: 'customers give up' },
        tick: (v) => (v === 0 ? '0' : Number.isInteger(v) ? String(v) : String(+v.toFixed(2))),
        label: fmtS,
        series: [{ name: 'p95', token: '--s1', get: (d) => d.p95 }]
      });
      this.rps = new LineChart($('chartRps'), $('tipRps'), {
        window: 120, minMax: 4, steps: [5, 10, 20, 40, 60, 100, 160, 250], area: false,
        tick: (v) => (v >= 10 ? Math.round(v) : v.toFixed(1)).toString(),
        label: (v) => fmtRate(v) + '/s',
        series: [
          { name: 'Arriving', token: '--s2', get: (d) => d.inRate },
          { name: 'Served OK', token: '--s3', get: (d) => d.okRate }
        ]
      });
    }

    meter(id, frac, text, note, warn, crit) {
      const m = this.meters[id];
      const f = Math.max(0, Math.min(1, frac));
      m.fill.style.width = (f * 100).toFixed(1) + '%';
      m.val.textContent = text;
      m.note.textContent = note || '';
      m.el.dataset.sev = sev(f, warn, crit);
    }

    kpi(id, val, state, unit) {
      const k = this.kpis[id];
      k.val.textContent = val;
      k.el.dataset.state = state;
      if (unit != null) k.unit.textContent = unit;
    }

    clear() { this.lat.set([]); this.rps.set([]); }

    update(sim, sum, st) {
      const vm = sim.vm, m = sim.memInfo(), down = sim.down > 0;
      const cpu = down ? 0 : sim.cpuUser + sim.cpuSys;
      this.meter('mCpu', cpu, Math.round(cpu * 100) + '%',
        down ? 'Server is off' : sim.kernel > 0.1 ? Math.round(sim.cpuSys * 100) + '% of it is the kernel shuffling memory to disk' : vm.cpu + ' vCPU', 0.7, 0.9);
      const ramF = m.used / m.total;
      this.meter('mRam', ramF, Math.round(ramF * 100) + '%', Math.round(m.used) + ' of ' + m.total + ' MB used', 0.8, 0.92);
      if (m.swapTotal) {
        const sf = m.swap / m.swapTotal;
        this.meter('mSwap', sf, Math.round(sf * 100) + '%', Math.round(m.swap) + ' of 1024 MB on disk', 0.05, 0.3);
      } else {
        this.meter('mSwap', 0, 'off', 'No swap file', 0.5, 0.9);
      }
      this.meter('mDisk', down ? 0 : sim.disk, Math.round((down ? 0 : sim.disk) * 100) + '%', sim.f > 0.05 ? 'Busy reading and writing swap' : '', 0.6, 0.85);

      const ok = sum.okRate, err = sum.errFrac;
      this.kpi('kIn', fmtRate(sim.arrEma), 'none');
      this.kpi('kOk', fmtRate(ok), ok >= sim.arrEma * 0.95 ? 'ok' : ok >= sim.arrEma * 0.6 ? 'warn' : 'crit');
      this.kpi('kErr', (err * 100 < 1 && err > 0 ? '<1' : Math.round(err * 100)) + '%', sev(err, 0.01, 0.1));
      this.kpi('kP95', sum.total > 0 || sum.waiting > 0 ? fmtS(sum.p95) : '–', sev(sum.p95 / 10, 0.1, 0.3));
      this.kpi('kOrders', Math.round(sum.ordersPerMin).toString(), ok >= sim.arrEma * 0.95 ? 'ok' : 'crit',
        sim.lostOrders >= 1 ? Math.round(sim.lostOrders) + ' lost so far' : 'per minute');
      const load = sim.load[0];
      this.kpi('kLoad', load >= 10 ? Math.round(load).toString() : load.toFixed(1), sev(load / vm.cpu, 1, 2),
        'on ' + vm.cpu + (vm.cpu === 1 ? ' core' : ' cores'));

      this.pill.dataset.state = st.id;
      this.pill.textContent = st.label;

      const hist = sim.hist;
      this.lat.set(hist);
      this.rps.set(hist);
    }
  }

  TZ.Metrics = Metrics;
  TZ.fmtS = fmtS;
  TZ.fmtRate = fmtRate;
})();
