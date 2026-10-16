/* Tomazon War Room · scene cards
   Full-board cards that a scene can open: the storefront, Tom's phone call,
   the suspect list, the memory comparison, the death spiral, the lessons and
   Tom's morning message. Content comes from the chapter file. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

  let keys = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) keys += '<rect x="' + (8 + c * 8.4) + '" y="' + (12 + r * 9) + '" width="6.4" height="6.4" rx="1.2" fill="' + (r === 1 && c === 4 ? '#ff6a45' : '#cbd5e1') + '"/>';
  TZ.ICONS = {
    shaker: '<svg viewBox="0 0 60 80" aria-hidden="true"><rect x="16" y="20" width="28" height="54" rx="6" fill="#1f2937"/><rect x="14" y="12" width="32" height="10" rx="3" fill="#ff6a45"/><rect x="24" y="4" width="12" height="9" rx="2" fill="#ff6a45"/><rect x="21" y="34" width="18" height="3" rx="1.5" fill="#94a3b8"/><rect x="21" y="42" width="12" height="3" rx="1.5" fill="#94a3b8"/></svg>',
    duck: '<svg viewBox="0 0 80 70" aria-hidden="true"><ellipse cx="38" cy="48" rx="30" ry="18" fill="#facc15"/><circle cx="54" cy="24" r="14" fill="#facc15"/><path d="M66 24 L78 27 L66 31 Z" fill="#f97316"/><circle cx="57" cy="20" r="2.4" fill="#111827"/><path d="M14 44 Q4 36 10 30 Q18 38 22 40 Z" fill="#eab308"/></svg>',
    keyboard: '<svg viewBox="0 0 90 50" aria-hidden="true"><rect x="2" y="6" width="86" height="38" rx="5" fill="#334155"/>' + keys + '<rect x="24" y="38" width="42" height="4" rx="1.2" fill="#cbd5e1"/></svg>',
    mug: '<svg viewBox="0 0 70 70" aria-hidden="true"><path d="M50 24 h7 a8 8 0 0 1 0 16 h-7" fill="none" stroke="#94a3b8" stroke-width="5"/><rect x="10" y="12" width="40" height="50" rx="5" fill="#ffffff" stroke="#94a3b8" stroke-width="2"/><rect x="16" y="30" width="28" height="3" rx="1.5" fill="#475569"/><rect x="16" y="37" width="20" height="3" rx="1.5" fill="#475569"/></svg>',
    cable: '<svg viewBox="0 0 80 60" aria-hidden="true"><path d="M14 14 C 44 0, 30 52, 64 44" fill="none" stroke="#111827" stroke-width="4" stroke-linecap="round"/><rect x="4" y="9" width="12" height="9" rx="2" fill="#6b7280"/><rect x="64" y="40" width="12" height="9" rx="2" fill="#6b7280"/></svg>',
    headphones: '<svg viewBox="0 0 70 64" aria-hidden="true"><path d="M12 38 V30 a23 23 0 0 1 46 0 V38" fill="none" stroke="#1e293b" stroke-width="5"/><rect x="6" y="34" width="14" height="22" rx="5" fill="#1e293b"/><rect x="50" y="34" width="14" height="22" rx="5" fill="#1e293b"/></svg>'
  };
  const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1-9.4 0-17-7.6-17-17 0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1L6.6 10.8z"/></svg>';
  const WORDMARK = '<span>tomazon</span><svg class="smile" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden="true"><path d="M62 3 Q36 17 7 6"/><path d="M7 6 L15 3.5 M7 6 L13 12"/></svg>';

  class Overlays {
    constructor(root, inner, hooks) {
      this.root = root; this.inner = inner; this.hooks = hooks; this.timers = [];
      this.content = {};
    }

    get open() { return !this.root.hidden; }

    show(spec, content) {
      if (content) this.content = content;
      this.clear();
      this.root.hidden = false;
      const fn = this[spec.kind];
      if (fn) fn.call(this, spec);
      this.root.scrollTop = 0;
      const r = this.root.getBoundingClientRect();
      if (r.top < 0 || r.top > window.innerHeight * 0.6) this.root.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }

    hide() { this.clear(); this.root.hidden = true; }
    clear() { this.timers.forEach((t) => clearTimeout(t)); this.timers = []; this.inner.innerHTML = ''; }
    later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

    done(label) {
      const b = el('button', 'btn btn-primary', esc(label || 'Continue'));
      b.type = 'button';
      b.addEventListener('click', () => { this.hide(); if (this.hooks.onClose) this.hooks.onClose(); });
      return b;
    }
    actions(...buttons) { const d = el('div', 'ov-actions'); buttons.forEach((b) => d.appendChild(b)); return d; }

    storefront(spec, cta) {
      const c = this.content;
      const shop = el('div', 'shop');
      shop.innerHTML =
        '<div class="browser-bar"><i></i><i></i><i></i><span class="url">https://tomazon.app</span></div>' +
        '<div class="shop-page">' +
        '<div class="shop-head"><div class="wordmark shop-logo">' + WORDMARK + '</div>' +
        '<div class="shop-search"><span>Search Tomazon</span><b>Search</b></div><span class="shop-cart">Hello, sign in · Cart (0)</span></div>' +
        '<div class="shop-hero"><h3>Everything from A to T</h3><p>Free delivery on your first order. Tonight only: launch prices.</p></div>' +
        '<div class="shop-grid">' + c.products.map((p) =>
          '<div class="product"><div class="product-img" style="background:' + p.bg + '">' + TZ.ICONS[p.icon] + '</div>' +
          (p.badge ? '<span class="badge">' + esc(p.badge) + '</span>' : '') +
          '<h4>' + esc(p.name) + '</h4>' + (p.shop ? '<div class="sold-by">Sold by ' + esc(p.shop) + '</div>' : '') + '<div class="stars">' + p.rating + ' <span>(' + p.reviews + ')</span></div><div class="price">' + p.price + '</div></div>').join('') +
        '</div></div>';
      this.inner.appendChild(shop);
      if (cta !== false) this.inner.appendChild(this.actions(this.done(cta || 'Go live')));
      return shop;
    }

    /* Launch night: the live storefront, the first order, and the experiment's scoreboard. */
    launch() {
      const L = this.content.launch;
      this.inner.appendChild(el('h2', 'ov-title', 'tomazon.app is live'));
      const shop = this.storefront(null, false);
      shop.style.position = 'relative';
      const toast = el('div', 'order-toast', '<b>' + esc(L.order.title) + '</b><span>' + esc(L.order.item) + '</span><span class="muted-on-dark">' + esc(L.order.from) + '</span>');
      toast.hidden = true;
      shop.appendChild(toast);
      this.later(1400, () => { toast.hidden = false; });
      const track = el('div', 'tracker', '<p class="terms-label">The experiment so far</p>' + L.tracker.map(([k, v]) => '<div class="trk"><span>' + esc(k) + '</span><b>' + esc(v) + '</b></div>').join(''));
      this.inner.appendChild(track);
      this.inner.appendChild(this.actions(this.done('Continue')));
    }

    phone() {
      const c = this.content.call;
      const ph = el('div', 'phone is-ringing');
      ph.innerHTML =
        '<div class="phone-screen">' +
        '<p class="phone-time">' + esc(c.time) + '</p><p class="phone-date">' + esc(c.date) + '</p>' +
        '<div class="caller"><div class="avatar">' + esc(c.caller[0]) + '</div><p class="caller-name">' + esc(c.caller) + '</p><p class="caller-sub">' + esc(c.sub) + '</p><p class="missed"></p></div>' +
        '<div class="call-actions">' +
        '<button type="button" class="call-btn decline"><i>' + PHONE + '</i>Decline</button>' +
        '<button type="button" class="call-btn accept"><i>' + PHONE + '</i>Accept</button></div>' +
        '<div class="call-live" hidden><div class="call-live-head"><p class="who">' + esc(c.caller) + '</p><p class="timer">00:00</p></div>' +
        '<div class="call-lines"></div>' +
        '<button type="button" class="call-btn decline end"><i>' + PHONE + '</i>End call</button></div>' +
        '</div>';
      this.inner.appendChild(ph);
      const skip = el('button', 'btn-link', 'Skip the call');
      skip.type = 'button';
      skip.addEventListener('click', () => { this.hide(); if (this.hooks.onClose) this.hooks.onClose(); });
      this.inner.appendChild(skip);

      let declined = 0;
      const missed = ph.querySelector('.missed');
      ph.querySelector('.call-actions .decline').addEventListener('click', () => {
        declined++;
        ph.classList.remove('is-ringing');
        missed.textContent = declined === 1 ? 'Missed call. He\'s calling again…' : 'Missed calls: ' + declined + '. He will not stop.';
        this.later(1100, () => ph.classList.add('is-ringing'));
      });
      ph.querySelector('.call-actions .accept').addEventListener('click', () => {
        ph.classList.remove('is-ringing');
        const live = ph.querySelector('.call-live');
        live.hidden = false;
        const box = live.querySelector('.call-lines'), timer = live.querySelector('.timer');
        let secs = 0;
        const tick = () => { secs++; timer.textContent = '00:' + String(secs).padStart(2, '0'); this.later(1000, tick); };
        this.later(1000, tick);
        c.lines.forEach(([who, text], i) => this.later(500 + i * 1900, () => {
          const p = el('p', 'call-line' + (who === 'You' ? ' me' : ''), '<b>' + esc(who) + ':</b> ' + esc(text));
          box.appendChild(p);
          box.scrollTop = box.scrollHeight;
        }));
        live.querySelector('.end').addEventListener('click', () => { this.hide(); if (this.hooks.onClose) this.hooks.onClose(); });
      });
    }

    suspects() {
      this.inner.appendChild(el('h2', 'ov-title', '2:48 AM. Every disaster at once.'));
      this.inner.appendChild(el('p', 'ov-sub', 'Click a suspect to see how you\'d check it. Which check is cheapest? Which would you run first?'));
      const grid = el('div', 'suspects');
      for (const s of this.content.suspects) {
        const card = el('div', 'suspect');
        card.setAttribute('role', 'button');
        card.tabIndex = 0;
        card.innerHTML = '<h3>' + esc(s.title) + '</h3><p class="q">' + esc(s.q) + '</p>' +
          '<div class="reveal"><p class="how">' + esc(s.how) + '</p>' +
          (s.cmd ? '<div><button type="button" class="chip">' + esc(s.cmd) + '</button></div><span class="hint">Run it ' + esc(s.where) + '</span>' : '') + '</div>';
        const toggle = (e) => { if (e.target.closest('.chip')) return; card.classList.toggle('is-open'); };
        card.addEventListener('click', toggle);
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(e); } });
        const chip = card.querySelector('.chip');
        if (chip) chip.addEventListener('click', () => { this.hide(); this.hooks.run(s.cmd); });
        grid.appendChild(card);
      }
      this.inner.appendChild(grid);
      this.inner.appendChild(this.actions(this.done('Back to the terminal')));
    }

    bars() {
      this.inner.appendChild(el('h2', 'ov-title', 'How big is 512 MB?'));
      this.inner.appendChild(el('p', 'ov-sub', 'Drawn to scale.'));
      const max = Math.max(...this.content.memory.map((m) => m.mb));
      const list = el('div', 'membars');
      this.content.memory.forEach((m, i) => {
        const row = el('div', 'membar' + (m.hero ? ' is-hero' : ''));
        row.innerHTML = '<span class="membar-label"><b>' + esc(m.label) + '</b></span>' +
          '<div class="membar-track"><div class="membar-fill" style="width:' + ((m.mb / max) * 100).toFixed(2) + '%;animation-delay:' + i * 0.12 + 's"></div><span class="membar-val">' + esc(m.value) + '</span></div>';
        list.appendChild(row);
      });
      this.inner.appendChild(list);
      this.inner.appendChild(this.actions(this.done()));
    }

    loop() {
      const L = this.content.loop;
      this.inner.appendChild(el('h2', 'ov-title', 'Slow makes more slow'));
      this.inner.appendChild(el('p', 'ov-sub', L.trigger));
      const W = 720, H = 430, cx = 360, cy = 215, rx = 240, ry = 155;
      const circ = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const period = 7;
      let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="The death spiral: ' + esc(L.stations.map((s) => s[0]).join(', then ')) + ', and around again.">';
      svg += '<ellipse class="ring" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '"/>';
      svg += '<ellipse class="arc" cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" style="stroke-dasharray:' + (circ * 0.09).toFixed(0) + ' ' + circ.toFixed(0) + ';animation-duration:' + period + 's;--circ:' + circ.toFixed(0) + '"/>';
      L.stations.forEach(([title, sub], i) => {
        const deg = -90 + i * 60;
        const a = (deg * Math.PI) / 180;
        const x = cx + rx * Math.cos(a), y = cy + ry * Math.sin(a);
        const frac = ((deg + 360) % 360) / 360;
        const delay = (frac * period - period).toFixed(2);
        svg += '<rect class="backing" x="' + (x - 112) + '" y="' + (y - 29) + '" width="224" height="58" rx="10"/>';
        svg += '<g class="station" style="animation-duration:' + period + 's;animation-delay:' + delay + 's">' +
          '<rect x="' + (x - 112) + '" y="' + (y - 29) + '" width="224" height="58" rx="10"/>' +
          '<text x="' + x + '" y="' + (y - 5) + '" text-anchor="middle">' + esc(title) + '</text>' +
          '<text class="sub" x="' + x + '" y="' + (y + 15) + '" text-anchor="middle">' + esc(sub) + '</text></g>';
      });
      svg += '<text class="center-k" x="' + cx + '" y="' + (cy - 14) + '" text-anchor="middle">Around and around</text>';
      svg += '<text class="center-f" x="' + cx + '" y="' + (cy + 14) + '" text-anchor="middle">until it falls over</text>';
      svg += '</svg>';
      const wrap = el('div', 'spiral', svg);
      wrap.querySelector('.arc').style.animationName = 'none';
      this.inner.appendChild(wrap);
      // Drive the travelling arc with the ellipse's real circumference.
      const arc = wrap.querySelector('.arc');
      const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!still) arc.animate([{ strokeDashoffset: 0 }, { strokeDashoffset: -circ }], { duration: period * 1000, iterations: Infinity });
      const worked = el('div', 'worked');
      for (const w of L.worked) worked.appendChild(el('div', null, '<p class="w-k">' + esc(w.k) + '</p><p class="w-v">' + esc(w.v) + '</p><p class="w-n">' + esc(w.n) + '</p>'));
      this.inner.appendChild(worked);
      this.inner.appendChild(this.actions(this.done()));
    }

    lessons() {
      const c = this.content;
      this.inner.appendChild(el('h2', 'ov-title', 'What the 3 AM call taught you'));
      const grid = el('div', 'lessons');
      for (const [h, p] of c.lessons) grid.appendChild(el('div', 'lesson', '<h3>' + esc(h) + '</h3><p>' + esc(p) + '</p>'));
      this.inner.appendChild(grid);
      const terms = el('div', 'terms', '<p class="terms-label">The names for what you just learned</p>' + c.terms.map((t) => '<span class="term-tag">' + esc(t) + '</span>').join(''));
      this.inner.appendChild(terms);
      this.inner.appendChild(this.actions(this.done()));
    }

    chat() {
      const c = this.content.chat;
      const box = el('div', 'chat');
      box.innerHTML = '<div class="chat-head"><div class="avatar">' + esc(c.who[0]) + '</div><div><p class="who">' + esc(c.who) + '</p><p class="seen">' + esc(c.seen) + '</p></div></div><div class="chat-body"></div>';
      this.inner.appendChild(box);
      const body = box.querySelector('.chat-body');
      c.messages.forEach(([, text, time], i) => this.later(400 + i * 1500, () => {
        body.appendChild(el('div', 'bubble', esc(text) + '<time>' + esc(time) + '</time>'));
      }));
      const after = el('div', 'ov-actions');
      after.style.flexDirection = 'column';
      after.style.alignItems = 'center';
      after.style.visibility = 'hidden';
      after.innerHTML = '<p class="ov-sub">' + esc(c.after) + '</p><p class="next-up">' + esc(c.next) + '</p>';
      this.later(400 + c.messages.length * 1500, () => {
        const t = el('div', 'typing', '<i></i><i></i><i></i>');
        t.setAttribute('aria-label', 'You are typing');
        body.appendChild(t);
        after.style.visibility = 'visible';
      });
      this.inner.appendChild(after);
      this.inner.appendChild(this.actions(this.done('Close')));
    }
  }

  TZ.Overlays = Overlays;
})();
