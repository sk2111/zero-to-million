/* Tomazon War Room · request flow diagram
   HTML cards for the customer's browser and the server; a canvas behind them
   draws requests travelling in, the line of requests waiting at the server's
   door, and responses travelling back, coloured by how long they took. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});

  class Flow {
    constructor(body, canvas, browser, vm, scaleLabel) {
      this.body = body; this.canvas = canvas; this.browser = browser; this.vm = vm; this.scaleLabel = scaleLabel;
      this.ctx = canvas.getContext('2d');
      this.parts = [];
      this.acc = {};
      this.k = 1;
      this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.readColors();
      const ro = new ResizeObserver(() => this.resize());
      [body, browser, vm].forEach((el) => ro.observe(el));
      this.resize();
    }

    readColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = (n) => cs.getPropertyValue(n).trim();
      this.c = {
        ink: v('--ink'), ink2: v('--ink-2'), muted: v('--muted'), line: v('--line'), panel: v('--panel'),
        good: v('--good'), warn: v('--warn'), serious: v('--serious'), crit: v('--crit'),
        mono: v('--font-mono') || 'monospace'
      };
    }

    resize() {
      const r = this.body.getBoundingClientRect();
      if (!r.width) return;
      const dpr = window.devicePixelRatio || 1;
      this.w = r.width; this.h = r.height;
      this.canvas.width = Math.round(r.width * dpr);
      this.canvas.height = Math.round(r.height * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const br = this.browser.getBoundingClientRect();
      const vr = this.vm.getBoundingClientRect();
      const rel = (x, y) => ({ x: x - r.left, y: y - r.top });
      // Measure the browser window itself, not its caption.
      const view = this.browser.querySelector('.browser-view') || this.browser;
      const bv = view.getBoundingClientRect();
      this.vertical = vr.top > br.bottom - 4;
      if (this.vertical) {
        this.a = rel(br.left + br.width / 2, br.bottom + 2);
        this.b = rel(vr.left + vr.width / 2, vr.top - 2);
      } else {
        this.a = rel(br.right + 2, bv.top + bv.height / 2 - 8);
        this.b = rel(vr.left - 2, vr.top + vr.height / 2);
      }
      const dx = this.b.x - this.a.x, dy = this.b.y - this.a.y;
      this.len = Math.hypot(dx, dy) || 1;
      this.dir = { x: dx / this.len, y: dy / this.len };
      this.perp = { x: -this.dir.y, y: this.dir.x };
    }

    clear() { this.parts = []; this.acc = {}; }

    lanePoint(lane, t) {
      // lane -1 = requests going in, +1 = responses coming back
      const off = lane * 10;
      const x = this.a.x + (this.b.x - this.a.x) * t + this.perp.x * off;
      const y = this.a.y + (this.b.y - this.a.y) * t + this.perp.y * off;
      return { x, y };
    }

    spawn(key, n, make) {
      this.acc[key] = (this.acc[key] || 0) + n / this.k;
      let guard = 0;
      while (this.acc[key] >= 1 && guard++ < 40) {
        this.acc[key] -= 1;
        if (this.parts.length < 520) make();
      }
      if (this.acc[key] > 3) this.acc[key] = 3;
    }

    frame(dt, sim, fx, blind) {
      const ctx = this.ctx, c = this.c;
      if (!this.a || !this.w) return;
      ctx.clearRect(0, 0, this.w, this.h);

      const k = Math.max(1, Math.ceil(sim.rps / 16));
      if (k !== this.k) {
        this.k = k;
        if (this.scaleLabel) this.scaleLabel.textContent = k === 1 ? '1 dot = 1 request' : '1 dot = ' + k + ' requests';
      }

      this.drawLanes(blind);
      if (blind) { this.parts.length = 0; this.acc = {}; return; }

      if (!this.reduced) {
        const req = () => this.parts.push({ kind: 'req', t: 0, dur: 0.85 + Math.random() * 0.3, j: (Math.random() - 0.5) * 5 });
        const resp = (color, cross) => () => this.parts.push({ kind: 'resp', t: 0, dur: 0.85 + Math.random() * 0.3, j: (Math.random() - 0.5) * 5, color, cross });
        const bounce = (color) => () => this.parts.push({ kind: 'bounce', t: 0, dur: 0.6, j: (Math.random() - 0.5) * 8, color });
        const giveUp = () => this.parts.push({ kind: 'gone', t: 0, dur: 1.2, j: (Math.random() - 0.5) * 30, color: c.crit });
        this.spawn('arrived', fx.arrived, req);
        this.spawn('fast', fx.fast, resp(c.good, false));
        this.spawn('slow', fx.slow, resp(c.warn, false));
        this.spawn('crawl', fx.crawl, resp(c.serious, false));
        this.spawn('error', fx.error, resp(c.crit, true));
        this.spawn('badgw', fx.badgw, resp(c.crit, true));
        this.spawn('busy', fx.busy, resp(c.warn, true));
        this.spawn('down', fx.down, bounce(c.muted));
        this.spawn('timeout', fx.timeout, giveUp);
      }

      this.drawPile(sim);

      const keep = [];
      for (const p of this.parts) {
        p.t += dt;
        const u = p.t / p.dur;
        if (u >= 1) continue;
        keep.push(p);
        if (p.kind === 'req') {
          const q = this.lanePoint(-1, u);
          this.dot(q.x + this.perp.x * p.j, q.y + this.perp.y * p.j, 3.4, c.ink, 0.92);
        } else if (p.kind === 'resp') {
          const q = this.lanePoint(1, 1 - u);
          if (p.cross) this.cross(q.x + this.perp.x * p.j, q.y + this.perp.y * p.j, 4.2, p.color, 1);
          else this.dot(q.x + this.perp.x * p.j, q.y + this.perp.y * p.j, 3.8, p.color, 1);
        } else if (p.kind === 'bounce') {
          // Connection refused right at the door.
          const back = u < 0.5 ? u * 2 : 2 - u * 2;
          const q = this.lanePoint(-1, 0.86 - back * 0.08);
          this.cross(q.x + this.perp.x * p.j, q.y + this.perp.y * p.j, 4, p.color, 1 - u);
        } else if (p.kind === 'gone') {
          // The customer gave up waiting: an X fades out by the browser.
          const q = this.lanePoint(1, 0.04);
          this.cross(q.x + this.perp.x * p.j * 0.4, q.y + this.perp.y * p.j * 0.4 + u * 14, 4.2, p.color, 1 - u);
        }
      }
      this.parts = keep;
    }

    drawLanes(blind) {
      const ctx = this.ctx, c = this.c;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = c.line;
      ctx.globalAlpha = blind ? 0.5 : 1;
      for (const lane of [-1, 1]) {
        const s = this.lanePoint(lane, 0), e = this.lanePoint(lane, 1);
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(e.x, e.y); ctx.stroke();
        // arrowhead
        const tip = lane < 0 ? e : s;
        const d = lane < 0 ? this.dir : { x: -this.dir.x, y: -this.dir.y };
        ctx.beginPath();
        ctx.moveTo(tip.x - d.x * 7 + this.perp.x * 4, tip.y - d.y * 7 + this.perp.y * 4);
        ctx.lineTo(tip.x, tip.y);
        ctx.lineTo(tip.x - d.x * 7 - this.perp.x * 4, tip.y - d.y * 7 - this.perp.y * 4);
        ctx.stroke();
      }
      if (blind) {
        const m = this.lanePoint(0, 0.5);
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.muted;
        ctx.font = '600 13px ' + c.mono;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', m.x + this.perp.x * 26, m.y + this.perp.y * 26);
      }
      ctx.restore();
    }

    drawPile(sim) {
      const ctx = this.ctx, c = this.c;
      const total = sim.inflight / this.k;
      if (total < 0.5) return;
      let gone = 0;
      for (const q of sim.queue) { if (!q.gone) break; gone += q.n; }
      gone /= this.k;
      const gap = 9, rows = 7;
      const maxCols = Math.max(2, Math.floor((this.len * 0.62) / gap));
      const cap = maxCols * rows;
      const n = Math.min(Math.round(total), cap);
      const start = { x: this.b.x - this.dir.x * 16, y: this.b.y - this.dir.y * 16 };
      for (let i = 0; i < n; i++) {
        const col = Math.floor(i / rows), row = (i % rows) - (rows - 1) / 2;
        const x = start.x - this.dir.x * col * gap + this.perp.x * row * gap;
        const y = start.y - this.dir.y * col * gap + this.perp.y * row * gap;
        // The oldest requests sit closest to the door. Red ones: the customer already left.
        this.dot(x, y, 2.9, i < gone ? c.crit : c.ink2, i < gone ? 0.85 : 0.75);
      }
      const lastCol = Math.floor((n - 1) / rows);
      const lx = this.vertical ? start.x + (rows / 2 + 1) * gap : start.x + 4;
      const ly = this.vertical ? start.y - this.dir.y * (lastCol * gap) * 0.5 : start.y + (rows / 2 + 1.6) * gap;
      const count = Math.round(sim.inflight);
      if (count >= 3) {
        ctx.save();
        ctx.font = '600 12px ' + c.mono;
        ctx.textAlign = this.vertical ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = c.ink2;
        const goneN = Math.round(gone * this.k);
        ctx.fillText(count + ' waiting', lx, ly);
        if (goneN >= 3) { ctx.fillStyle = c.crit; ctx.fillText(goneN + ' gave up', lx, ly + 16); }
        ctx.restore();
      }
    }

    dot(x, y, r, color, alpha) {
      const ctx = this.ctx;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = this.c.panel;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    cross(x, y, r, color, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke();
      ctx.restore();
    }
  }

  TZ.Flow = Flow;
})();
