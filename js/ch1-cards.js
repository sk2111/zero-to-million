/* Tomazon War Room · Chapter 1 interactive cards
   Each card fills the scene pane: the dialogue in the hostel room, the MVP,
   the 48-hour scope, and the tech-stack decisions up to creating the server.
   Every renderer gets (root, scene, api) where api.decide(key) records a
   decision in the "Your stack" panel. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});
  const esc = (s) => String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const btn = (cls, html, onClick) => { const b = el('button', cls, html); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; };
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Timers belong to the card on screen; clear them when the card changes.
  let timers = [];
  const later = (ms, fn) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
  const clearTimers = () => { timers.forEach((t) => clearTimeout(t)); timers = []; };

  const say = (who, text) => '<div class="bub bub-' + who + '"><span class="bub-who">' + (who === 'tom' ? 'Tom' : who === 'you' ? 'You' : esc(who)) + '</span><p>' + text + '</p></div>';

  /* ---------- the hostel room ---------- */
  const ROOM = `
<svg class="room-svg" viewBox="0 0 640 320" role="img" aria-label="Tom and you in a hostel room at night. A laptop and a bowl of noodles sit on the desk between you.">
  <rect class="r-wall" x="0" y="0" width="640" height="246"/>
  <rect class="r-floor" x="0" y="246" width="640" height="74"/>
  <rect x="250" y="26" width="140" height="96" rx="4" fill="#16244a" stroke="#5b6b92" stroke-width="4"/>
  <line x1="320" y1="26" x2="320" y2="122" stroke="#5b6b92" stroke-width="3"/>
  <circle cx="354" cy="56" r="12" fill="#f4e7b5"/>
  <circle cx="276" cy="48" r="1.6" fill="#fff"/><circle cx="298" cy="90" r="1.3" fill="#fff"/><circle cx="374" cy="100" r="1.4" fill="#fff"/><circle cx="337" cy="34" r="1.1" fill="#fff"/>
  <g transform="rotate(4 512 66)"><rect x="474" y="40" width="76" height="52" rx="3" fill="#ffd166"/><text x="512" y="64" text-anchor="middle" font-size="11" font-weight="800" fill="#5a3b00" font-family="system-ui, sans-serif">EXAMS</text><text x="512" y="80" text-anchor="middle" font-size="11" font-weight="800" fill="#5a3b00" font-family="system-ui, sans-serif">DONE</text></g>
  <rect x="90" y="44" width="58" height="40" rx="3" fill="#9fd3c7" transform="rotate(-5 119 64)"/>
  <path d="M106 70 l8 -12 l8 9 l6 -6 l9 9" fill="none" stroke="#2e6f60" stroke-width="2.5" transform="rotate(-5 119 64)"/>
  <rect x="210" y="212" width="220" height="12" rx="3" fill="#8a5a3c"/>
  <rect x="224" y="224" width="9" height="70" fill="#744a31"/><rect x="408" y="224" width="9" height="70" fill="#744a31"/>
  <rect x="282" y="160" width="76" height="52" rx="5" fill="#c9ced9"/><rect x="276" y="208" width="88" height="5" rx="2" fill="#9aa3b5"/>
  <circle cx="320" cy="186" r="6" fill="#c9431f"/>
  <path d="M374 212 Q374 194 393 194 Q412 194 412 212 Z" fill="#efe7d8"/>
  <path d="M380 198 q4 -4 8 0 t8 0 t8 0" fill="none" stroke="#e0b44c" stroke-width="2.5"/>
  <path class="steam" d="M386 186 q-5 -8 0 -16 t0 -16" fill="none" stroke="#b9c2d6" stroke-width="2" stroke-linecap="round"/>
  <path class="steam s2" d="M400 186 q-5 -8 0 -16 t0 -16" fill="none" stroke="#b9c2d6" stroke-width="2" stroke-linecap="round"/>
  <g class="ch" id="chTom">
    <rect x="62" y="206" width="100" height="12" rx="3" fill="#4b3a2e"/><rect x="62" y="118" width="12" height="96" rx="3" fill="#4b3a2e"/>
    <rect x="72" y="218" width="8" height="70" fill="#3b2d24"/><rect x="146" y="218" width="8" height="70" fill="#3b2d24"/>
    <rect x="86" y="148" width="78" height="66" rx="26" fill="#e0603f"/>
    <rect x="148" y="176" width="72" height="16" rx="8" fill="#e0603f" transform="rotate(14 150 184)"/>
    <circle cx="214" cy="200" r="8" fill="#b9784f"/>
    <rect x="118" y="132" width="20" height="20" fill="#a86b45"/>
    <g class="head">
      <circle cx="128" cy="114" r="31" fill="#b9784f"/>
      <path d="M97 106 Q98 78 128 78 Q158 78 160 104 Z" fill="#c9431f"/>
      <path d="M152 100 L184 105 L182 111 L152 109 Z" fill="#a8351a"/>
      <circle cx="140" cy="116" r="3.2" fill="#1b1b1b"/><circle cx="154" cy="116" r="3.2" fill="#1b1b1b"/>
      <ellipse class="mouth" cx="148" cy="131" rx="6.5" ry="2.6" fill="#5a2a1a"/>
    </g>
  </g>
  <g class="ch" id="chYou">
    <rect x="478" y="206" width="100" height="12" rx="3" fill="#4b3a2e"/><rect x="566" y="118" width="12" height="96" rx="3" fill="#4b3a2e"/>
    <rect x="486" y="218" width="8" height="70" fill="#3b2d24"/><rect x="560" y="218" width="8" height="70" fill="#3b2d24"/>
    <rect x="476" y="148" width="78" height="66" rx="26" fill="#3b5bdb"/>
    <rect x="420" y="176" width="72" height="16" rx="8" fill="#3b5bdb" transform="rotate(-14 490 184)"/>
    <circle cx="426" cy="200" r="8" fill="#8d5a3b"/>
    <rect x="502" y="132" width="20" height="20" fill="#7a4c31"/>
    <g class="head">
      <circle cx="512" cy="114" r="31" fill="#8d5a3b"/>
      <path d="M481 108 Q480 80 512 80 Q546 80 543 106 Q530 92 512 94 Q494 94 481 108 Z" fill="#1b1b1b"/>
      <circle cx="489" cy="117" r="7.5" fill="none" stroke="#1b1b1b" stroke-width="2.4"/><circle cx="505" cy="117" r="7.5" fill="none" stroke="#1b1b1b" stroke-width="2.4"/>
      <line x1="496.5" y1="117" x2="497.5" y2="117" stroke="#1b1b1b" stroke-width="2.4"/>
      <circle cx="489" cy="117" r="2.6" fill="#1b1b1b"/><circle cx="505" cy="117" r="2.6" fill="#1b1b1b"/>
      <ellipse class="mouth" cx="494" cy="132" rx="6.5" ry="2.6" fill="#4a2414"/>
    </g>
  </g>
  <g class="dots" id="dotsTom" transform="translate(150 50)"><rect width="46" height="24" rx="12" fill="#ffffff" stroke="#c9d1e3"/><circle cx="13" cy="12" r="3" fill="#7f8aa7"/><circle cx="23" cy="12" r="3" fill="#7f8aa7"/><circle cx="33" cy="12" r="3" fill="#7f8aa7"/></g>
  <g class="dots" id="dotsYou" transform="translate(444 50)"><rect width="46" height="24" rx="12" fill="#ffffff" stroke="#c9d1e3"/><circle cx="13" cy="12" r="3" fill="#7f8aa7"/><circle cx="23" cy="12" r="3" fill="#7f8aa7"/><circle cx="33" cy="12" r="3" fill="#7f8aa7"/></g>
</svg>`;

  const Cards = {
    clear: clearTimers,

    world(root) {
      const row = (label, ok, note) => '<li class="' + (ok ? 'yes' : 'no') + '"><span class="mark">' + (ok ? '✓' : '✕') + '</span><span>' + label + (note ? '<em>' + note + '</em>' : '') + '</span></li>';
      root.innerHTML =
        '<div class="world">' +
        '<div class="world-col"><p class="eyebrow">Our world</p><h3>1995: someone starts selling books from a website.</h3><p class="muted">Thirty years later you can buy anything, from anywhere, at any hour.</p>' +
        '<ul class="checks">' + row('Smartphones', true) + row('Instagram', true) + row('Cloud servers you rent by the month', true) + row('Online shopping', true) + '</ul></div>' +
        '<div class="world-col is-alt"><p class="eyebrow">Tomazon\'s world</p><h3>2026, and nobody has thought of it.</h3><p class="muted">Same phones, same apps, same clouds. One small gap.</p>' +
        '<ul class="checks">' + row('Smartphones', true) + row('Instagram', true) + row('Cloud servers you rent by the month', true) + row('Online shopping', false, 'Nobody has built it. Yet.') + '</ul></div>' +
        '</div>';
    },

    dialogue(root, sc) {
      const lines = sc.card.lines;
      root.innerHTML =
        '<div class="dlg"><div class="dlg-stage">' + ROOM + '<p class="dlg-place">' + esc(sc.card.place) + '</p></div>' +
        '<div class="dlg-side"><div class="dlg-log" aria-live="polite"></div><div class="dlg-controls"></div></div></div>';
      const log = root.querySelector('.dlg-log'), ctr = root.querySelector('.dlg-controls');
      const svg = root.querySelector('.room-svg');
      const who = { tom: svg.querySelector('#chTom'), you: svg.querySelector('#chYou') };
      const dots = { tom: svg.querySelector('#dotsTom'), you: svg.querySelector('#dotsYou') };
      let i = 0, playing = true;
      const quiet = () => { who.tom.classList.remove('talking'); who.you.classList.remove('talking'); dots.tom.classList.remove('on'); dots.you.classList.remove('on'); };
      const show = (k) => {
        const [w, text] = lines[k];
        quiet();
        who[w].classList.add('talking');
        log.insertAdjacentHTML('beforeend', say(w, esc(text)));
        log.scrollTop = log.scrollHeight;
        later(Math.min(2600, 500 + text.length * 30), () => who[w].classList.remove('talking'));
      };
      const step = () => {
        if (i >= lines.length) { quiet(); playBtn.textContent = 'Replay'; playing = false; return; }
        const k = i++;
        dots[lines[k][0]].classList.add('on');
        later(650, () => {
          show(k);
          if (playing) later(1300 + lines[k][1].length * 42, step);
        });
      };
      const playBtn = btn('btn btn-small', 'Pause', () => {
        if (i >= lines.length && !playing) { clearTimers(); log.innerHTML = ''; i = 0; playing = true; playBtn.textContent = 'Pause'; step(); return; }
        playing = !playing;
        playBtn.textContent = playing ? 'Pause' : 'Play';
        if (playing) { clearTimers(); step(); }
      });
      const nextBtn = btn('btn btn-small', 'Next line', () => {
        clearTimers();
        if (i < lines.length) { show(i++); if (playing) later(1300 + lines[i - 1][1].length * 42, step); }
        if (i >= lines.length) { playBtn.textContent = 'Replay'; playing = false; }
      });
      ctr.append(playBtn, nextBtn);
      if (reduced()) { playing = false; playBtn.textContent = 'Play'; lines.forEach((_, k) => show(k)); i = lines.length; quiet(); playBtn.textContent = 'Replay'; }
      else later(500, step);
    },

    mvp(root) {
      root.innerHTML =
        '<div class="mvp">' +
        '<div class="hyp"><p class="eyebrow">The hypothesis</p>' +
        '<p class="hyp-main">We believe <mark>shops in our town</mark> will <mark>put their products online</mark>, and <mark>people</mark> will <mark>order from a website</mark>.</p>' +
        '<p class="hyp-metric">We\'ll know we\'re right if <b>10 shops</b> list products and <b>30 orders</b> arrive within <b>2 weeks</b>.</p></div>' +
        '<div class="mvp-vs">' +
        '<div class="vs-col"><p class="eyebrow">Not an MVP</p><h4>A smaller, buggier version of the dream</h4><ul><li>Half a website with every feature started</li><li>Payments that work on Tuesdays</li><li>An app nobody can install yet</li><li>Six months before anyone sees it</li></ul></div>' +
        '<div class="vs-col is-good"><p class="eyebrow">An MVP</p><h4>The cheapest experiment that answers one question</h4><ul><li>Shops add products with a price</li><li>People press Order. Shops get the order</li><li>Cash on delivery. No payments</li><li>Real shops, real customers, in 48 hours</li></ul></div>' +
        '</div>' +
        '<div class="mvp-loop"><span>Build</span><i aria-hidden="true">→</i><span>Measure</span><i aria-hidden="true">→</i><span>Learn</span><i aria-hidden="true">↺</i><p>The goal is not money or users. The goal is to learn.</p></div>' +
        '<div class="mvp-outcome"><p class="eyebrow">Two weeks later…</p><div class="row"></div><p class="outcome-text" aria-live="polite">Pick an outcome.</p></div>' +
        '</div>';
      const out = root.querySelector('.outcome-text'), row = root.querySelector('.mvp-outcome .row');
      const opts = [
        ['We were right', 'Keep going. Add the next thing real users ask for (probably payments). You\'ve earned the right to spend more time.'],
        ['We were wrong', 'You lost one weekend, not six months. Change the idea (only food shops? only students?) and run the next experiment.']
      ];
      for (const [label, text] of opts) {
        const b = btn('btn btn-small', esc(label), () => { row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); out.textContent = text; });
        b.setAttribute('aria-pressed', 'false');
        row.appendChild(b);
      }
    },

    scope(root) {
      const fixed = [['Sleep', 12], ['Chai', 4], ['Tom\'s vision', 6]];
      const BUILD = 48 - fixed.reduce((a, x) => a + x[1], 0);
      const feats = [
        { id: 'catalog', name: 'Shops add products with a price', h: 8, core: true },
        { id: 'orders', name: 'Customers place an order', h: 6, core: true },
        { id: 'login', name: 'Shop owner login', h: 3, core: true },
        { id: 'deploy', name: 'Put it on a real server', h: 4, core: true },
        { id: 'photos', name: 'Product photos', h: 3, quip: ['tom', 'Nobody buys a toaster they can\'t see.'], reply: 'Fair. Photos are cheap.' },
        { id: 'search', name: 'Search', h: 4, quip: ['you', 'With ten shops, people can scroll.'] },
        { id: 'payments', name: 'Online payments', h: 20, quip: ['you', '20 hours, plus a merchant account and paperwork. Cash on delivery tests the same idea.'] },
        { id: 'reviews', name: 'Reviews and ratings', h: 6, quip: ['you', 'Reviews need customers. We have zero.'] },
        { id: 'reco', name: 'AI recommendations', h: 30, quip: ['you', 'Recommendations, from zero data. Bold.'] },
        { id: 'tracking', name: 'Live delivery tracking', h: 18, quip: ['you', 'Uncle Ramesh delivers on his scooter. You can call him.'] },
        { id: 'app', name: 'Mobile app', h: 60, quip: ['tom', 'Everyone has a phone!'], reply: 'And every phone has a browser.' },
        { id: 'chat', name: 'Chat with the shop', h: 12, quip: ['you', 'They can phone the shop. Shops love phone calls.'] },
        { id: 'coupons', name: 'Coupons', h: 6, quip: ['you', 'Discounts, before we know our margins?'] },
        { id: 'dark', name: 'Dark mode', h: 3, quip: ['tom', 'Someone will definitely ask for dark mode.'] }
      ];
      const on = new Set(feats.filter((f) => f.core).map((f) => f.id));
      root.innerHTML =
        '<div class="scope">' +
        '<div class="budget"><p class="budget-legend">48 hours = 12 sleeping + 4 eating and drinking chai + 6 listening to Tom describe his vision + <b>26 building</b>.</p><div class="budget-bar" aria-hidden="true"></div><p class="budget-read" aria-live="polite"></p></div>' +
        '<div class="feat-grid"></div>' +
        '<div class="quip" aria-live="polite"></div>' +
        '</div>';
      const bar = root.querySelector('.budget-bar'), read = root.querySelector('.budget-read'), grid = root.querySelector('.feat-grid'), quip = root.querySelector('.quip');
      const draw = () => {
        const used = feats.filter((f) => on.has(f.id)).reduce((a, f) => a + f.h, 0);
        const total = Math.max(48, 48 - BUILD + used);
        const pc = (v) => ((v / total) * 100).toFixed(2) + '%';
        bar.innerHTML = fixed.map(([n, v]) => '<span class="seg seg-fixed" style="width:' + pc(v) + '" title="' + esc(n) + ': ' + v + ' hours"><span class="seg-l"><b>' + v + 'h</b> ' + esc(n) + '</span></span>').join('') +
          '<span class="seg seg-build" style="width:' + pc(BUILD) + '"><i style="width:' + Math.min(100, (used / BUILD) * 100).toFixed(1) + '%"></i><span class="seg-l"><b>' + BUILD + 'h</b> building</span></span>' +
          (used > BUILD ? '<span class="seg seg-over" style="width:' + pc(used - BUILD) + '"><span class="seg-l"><b>+' + (used - BUILD) + 'h</b></span></span>' : '');
        read.className = 'budget-read' + (used > BUILD ? ' is-over' : '');
        read.innerHTML = used > BUILD
          ? '<b>Over by ' + (used - BUILD) + ' hours.</b> Something has to go, or the experiment doesn\'t ship.'
          : '<b>' + used + ' of ' + BUILD + ' building hours.</b> ' + (BUILD - used) + ' hours of buffer. Keep some: something always breaks at hour 40.';
      };
      for (const f of feats) {
        const b = btn('feat' + (f.core ? ' is-core' : ''), '<span class="feat-name">' + esc(f.name) + '</span><span class="feat-h">' + f.h + 'h</span>' + (f.core ? '<span class="feat-lock">tests the hypothesis</span>' : ''), () => {
          if (f.core) { quip.innerHTML = say('you', 'This one stays. Without it, there\'s no experiment.'); return; }
          if (on.has(f.id)) on.delete(f.id); else on.add(f.id);
          b.setAttribute('aria-pressed', String(on.has(f.id)));
          if (on.has(f.id) && f.quip) quip.innerHTML = say(f.quip[0], esc(f.quip[1])) + (f.reply ? say(f.quip[0] === 'tom' ? 'you' : 'tom', esc(f.reply)) : '');
          else quip.innerHTML = '';
          draw();
        });
        b.setAttribute('aria-pressed', String(on.has(f.id)));
        grid.appendChild(b);
      }
      draw();
    },

    stack(root) {
      const layers = [
        ['Browser', 'What does the customer use?', 'Chrome or Safari on a phone. Not your choice, but every layer below exists to serve it.', 'Chrome, Safari, Firefox'],
        ['Web framework', 'How do we answer web requests?', 'Turns a URL like /products?store_id=7 into a call to your function, checks the inputs, and sends back a page or JSON.', 'FastAPI, Django, Express, Spring'],
        ['Language', 'What do we write the logic in?', 'Where Tomazon\'s rules live: who can add products, what an order is, how stock goes down.', 'Python, JavaScript, Java, Go'],
        ['ORM', 'How does the code talk to the database?', 'Translates between your Python objects and SQL, safely.', 'SQLAlchemy, Django ORM, Prisma, Hibernate'],
        ['Database', 'Where does the data live?', 'Remembers every shop, product and order, even after a crash or a reboot.', 'PostgreSQL, MySQL, MongoDB'],
        ['Server', 'Which computer runs all of this?', 'A machine that\'s always on, with a public address, rented by the month.', 'DigitalOcean, AWS, Google Cloud']
      ];
      root.innerHTML = '<div class="stackmap"><div class="stack-col"><div class="stack-layers"></div><div class="stack-track" aria-hidden="true"><i class="pkt down"></i><i class="pkt up"></i><span class="t-down">request</span><span class="t-up">answer</span></div></div><div class="stack-detail" aria-live="polite"></div></div>';
      const list = root.querySelector('.stack-layers'), detail = root.querySelector('.stack-detail');
      const pick = (k) => {
        const [name, q, what, ex] = layers[k];
        list.querySelectorAll('button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
        detail.innerHTML = '<p class="eyebrow">' + esc(name) + '</p><h3>' + esc(q) + '</h3><p>' + esc(what) + '</p><p class="muted">Examples: ' + esc(ex) + '</p>';
      };
      layers.forEach(([name, q], k) => list.appendChild(btn('layer', '<b>' + esc(name) + '</b><span>' + esc(q) + '</span>', () => pick(k))));
      pick(0);
    },

    language(root, sc, api) {
      const langs = [
        { name: 'Python', sub: 'with a web framework', s: [5, 5, 5, 2], talk: [['you', 'I\'ve written Python since first year. I can read it half asleep.'], ['tom', 'You\'ll be fully asleep by Saturday. Good.']], v: 'Readable, huge ecosystem, fast to write. Not the fastest code, but for an MVP your typing speed matters more than the CPU\'s.' },
        { name: 'JavaScript', sub: 'Node.js', s: [3, 4, 5, 3], talk: [['tom', 'One language for the website and the server!'], ['you', 'And a new way to trip over async code at 3 AM.']], v: 'A great choice for many teams. You\'d be learning while building, and this weekend is for building.' },
        { name: 'Java', sub: 'Spring Boot', s: [2, 2, 4, 4], talk: [['tom', 'Banks use Java.'], ['you', 'Banks have six months and a hundred engineers.']], v: 'Fast, mature and everywhere in big companies. Also a lot of code before your first page loads.' },
        { name: 'Go', sub: '', s: [1, 3, 4, 4], talk: [['tom', 'Go is simple and fast.'], ['you', 'I\'ve read half a tutorial.']], v: 'Simple, fast, and it deploys as one file. A strong pick for a team that knows it. Next project.' },
        { name: 'Ruby', sub: 'Ruby on Rails', s: [0, 5, 4, 2], talk: [['tom', 'Rails built a generation of startups in a weekend!'], ['you', 'Neither of us has written a line of Ruby.']], v: 'Wonderfully productive, if you already know it.' },
        { name: 'Rust', sub: '', s: [0, 1, 3, 5], talk: [['tom', 'How long would it take to learn Rust?'], ['you', 'About 48 hours.'], ['tom', '…']], v: 'Blazing fast and very safe. Learning it during a 48-hour experiment makes the experiment about Rust, not about shops.' }
      ];
      const crit = ['You already know it', 'Quick to write', 'Web libraries', 'Raw speed'];
      root.innerHTML = '<div class="pick"><div class="pick-grid"></div><div class="pick-talk" aria-live="polite"><p class="muted">Click a language to hear the debate.</p></div>' +
        '<div class="decision" hidden></div></div>';
      const grid = root.querySelector('.pick-grid'), talk = root.querySelector('.pick-talk'), dec = root.querySelector('.decision');
      const meter = (n) => '<span class="dots5" aria-label="' + n + ' of 5">' + [0, 1, 2, 3, 4].map((i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>';
      langs.forEach((l) => {
        const b = btn('opt', '<span class="opt-name">' + esc(l.name) + '</span>' + (l.sub ? '<span class="opt-sub">' + esc(l.sub) + '</span>' : '') +
          '<span class="opt-meters">' + crit.map((c, i) => '<span class="om"><span>' + c + '</span>' + meter(l.s[i]) + '</span>').join('') + '</span>', () => {
          grid.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          talk.innerHTML = l.talk.map(([w, t]) => say(w, esc(t))).join('') + '<p class="verdict-line">' + esc(l.v) + '</p>';
        });
        b.setAttribute('aria-pressed', 'false');
        if (l.name === 'Python') b.dataset.pick = '1';
        grid.appendChild(b);
      });
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false;
        dec.innerHTML = '<b>Python.</b> For an MVP, pick the language you already know. The speed that matters this weekend is how fast you can learn whether the idea works.';
        grid.querySelector('[data-pick]').classList.add('is-chosen');
        decide.hidden = true;
        api.decide('language');
      });
      root.querySelector('.pick').appendChild(decide);
    },

    framework(root, sc, api) {
      const plain =
        '<span class="k">from</span> http.server <span class="k">import</span> BaseHTTPRequestHandler, HTTPServer\n' +
        '<span class="k">from</span> urllib.parse <span class="k">import</span> urlparse, parse_qs\n<span class="k">import</span> json\n\n' +
        '<span class="k">class</span> <span class="f">Handler</span>(BaseHTTPRequestHandler):\n' +
        '    <span class="k">def</span> <span class="f">do_GET</span>(self):\n' +
        '        url = urlparse(self.path)\n' +
        '        <span class="k">if</span> url.path == <span class="s">"/products"</span>:\n' +
        '            store_id = parse_qs(url.query)[<span class="s">"store_id"</span>][<span class="n">0</span>]\n' +
        '            products = load_products(<span class="f">int</span>(store_id))\n' +
        '            body = json.dumps(products).encode()\n' +
        '            self.send_response(<span class="n">200</span>)\n' +
        '            self.send_header(<span class="s">"Content-Type"</span>, <span class="s">"application/json"</span>)\n' +
        '            self.end_headers()\n' +
        '            self.wfile.write(body)\n' +
        '        <span class="k">else</span>:\n' +
        '            self.send_response(<span class="n">404</span>)\n' +
        '            self.end_headers()\n\n' +
        '    <span class="k">def</span> <span class="f">do_POST</span>(self):\n' +
        '        <span class="c"># read the body, parse JSON, check every field by hand...</span>\n' +
        '        order = json.loads(self.rfile.read(<span class="f">int</span>(self.headers[<span class="s">"Content-Length"</span>])))\n' +
        '        create_order(<span class="f">int</span>(order[<span class="s">"product_id"</span>]))   <span class="c"># crashes on "abc"</span>\n' +
        '        ...\n\n' +
        'HTTPServer((<span class="s">""</span>, <span class="n">8000</span>), Handler).serve_forever()';
      const fast =
        '<span class="k">from</span> fastapi <span class="k">import</span> FastAPI\n' +
        '<span class="k">from</span> pydantic <span class="k">import</span> BaseModel\n\n' +
        'app = FastAPI()\n\n' +
        '<span class="k">class</span> <span class="f">OrderIn</span>(BaseModel):\n' +
        '    product_id: <span class="t">int</span>\n' +
        '    quantity: <span class="t">int</span> = <span class="n">1</span>\n\n' +
        '<span class="f">@app.get</span>(<span class="s">"/products"</span>)\n' +
        '<span class="k">def</span> <span class="f">list_products</span>(store_id: <span class="t">int</span>):\n' +
        '    <span class="k">return</span> load_products(store_id)\n\n' +
        '<span class="f">@app.post</span>(<span class="s">"/orders"</span>)\n' +
        '<span class="k">def</span> <span class="f">place_order</span>(order: <span class="t">OrderIn</span>):\n' +
        '    <span class="k">return</span> create_order(order)';
      const reqs = [
        ['GET /products?store_id=7', { plain: ['200 OK', '[{"id": 101, "name": "Protein Shaker", "price": 99}, …]', 'ok'], fast: ['200 OK', '[{"id": 101, "name": "Protein Shaker", "price": 99}, …]', 'ok'] }],
        ['POST /orders  {"product_id": "abc"}', {
          plain: ['500 Internal Server Error', 'Traceback (most recent call last):\n  File "server.py", line 24, in do_POST\nValueError: invalid literal for int() with base 10: \'abc\'', 'bad'],
          fast: ['422 Unprocessable Entity', '{"detail": [{"type": "int_parsing", "loc": ["body", "product_id"],\n  "msg": "Input should be a valid integer, unable to parse string as an integer", "input": "abc"}]}', 'ok']
        }],
        ['GET /docs', { plain: ['404 Not Found', '(nothing here: you\'d have to write docs yourself)', 'bad'], fast: ['200 OK', 'Interactive API docs, generated from your code:\n  GET  /products   List products\n  POST /orders     Place order', 'ok'] }]
      ];
      root.innerHTML =
        '<div class="fw"><div class="fw-code"><div class="tabs" role="tablist"></div><pre class="code"></pre><p class="fw-count muted"></p></div>' +
        '<div class="fw-try"><p class="eyebrow">Try a request</p><div class="req-list"></div><div class="resp" aria-live="polite"><p class="muted">Pick a request.</p></div>' +
        '<div class="fw-others"><p class="eyebrow">Other Python frameworks</p><p><b>Django</b>: batteries included: admin panel, ORM, logins.</p><p><b>Flask</b>: tiny. Add what you need.</p><p><b>FastAPI</b>: small and modern. Type hints become input checking and API docs.</p></div></div></div>' +
        '<div class="decision" hidden></div>';
      let mode = 'plain', last = null;
      const tabs = root.querySelector('.tabs'), code = root.querySelector('.code'), count = root.querySelector('.fw-count'), resp = root.querySelector('.resp');
      const show = () => {
        code.innerHTML = mode === 'plain' ? plain : fast;
        count.textContent = mode === 'plain' ? '27 lines, and it still doesn\'t check inputs or write docs.' : '14 lines, with input checking and docs built in.';
        tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));
        if (last != null) run(last);
      };
      const run = (k) => {
        last = k;
        const [status, body, kind] = reqs[k][1][mode];
        resp.innerHTML = '<p class="resp-status is-' + kind + '">' + esc(status) + '</p><pre>' + esc(body) + '</pre>';
        root.querySelectorAll('.req-list button').forEach((b, j) => b.setAttribute('aria-pressed', String(j === k)));
      };
      [['plain', 'Plain Python'], ['fast', 'FastAPI']].forEach(([m, label]) => {
        const b = btn('tab', label, () => { mode = m; show(); });
        b.dataset.m = m; b.setAttribute('role', 'tab');
        tabs.appendChild(b);
      });
      reqs.forEach(([label], k) => root.querySelector('.req-list').appendChild(btn('chip chip-req', esc(label), () => run(k))));
      show();
      const dec = root.querySelector('.decision');
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false; decide.hidden = true;
        dec.innerHTML = '<b>FastAPI.</b> The type hints you\'d write anyway become input checking and API docs, for free. Less plumbing, more Tomazon.';
        api.decide('framework');
      });
      root.appendChild(decide);
    },

    orm(root, sc, api) {
      root.innerHTML =
        '<div class="orm"><div class="orm-input"><label for="ormStore">Store ID from the URL: <code>/products?store_id=</code></label>' +
        '<input id="ormStore" type="text" value="7" autocomplete="off" spellcheck="false"><div class="orm-presets"></div></div>' +
        '<div class="orm-cols">' +
        '<div class="orm-col"><p class="eyebrow">Building the SQL string yourself</p><pre class="code">query = <span class="f">f</span><span class="s">"SELECT * FROM products WHERE store_id = {store_id}"</span>\ndb.execute(query)</pre>' +
        '<p class="orm-k">What the database receives</p><pre class="sql" id="ormRawSql"></pre><p class="orm-k">Result</p><div class="orm-res" id="ormRawRes"></div></div>' +
        '<div class="orm-col"><p class="eyebrow">With an ORM (SQLAlchemy)</p><pre class="code">stmt = select(Product).where(Product.store_id == store_id)\nsession.scalars(stmt).all()</pre>' +
        '<p class="orm-k">What the database receives</p><pre class="sql" id="ormOrmSql"></pre><p class="orm-k">Result</p><div class="orm-res" id="ormOrmRes"></div></div>' +
        '</div><p class="muted orm-foot">Django\'s ORM says the same thing as <code>Product.objects.filter(store_id=7)</code>. And because FastAPI declares <code>store_id: int</code>, a sneaky value would be rejected with a 422 before it ever reached the database.</p></div>' +
        '<div class="decision" hidden></div>';
      const input = root.querySelector('#ormStore');
      const rows = '<table class="mini-table"><tr><th>id</th><th>name</th><th>price</th></tr><tr><td>101</td><td>Protein Shaker</td><td>₹99</td></tr><tr><td>102</td><td>Rubber Duck</td><td>₹249</td></tr><tr><td>104</td><td>Mug: It Works On My Machine</td><td>₹349</td></tr></table>';
      const update = () => {
        const v = input.value;
        const num = /^\s*\d+\s*$/.test(v);
        const evil = /(\bor\b|;|--|drop|union)/i.test(v);
        root.querySelector('#ormRawSql').innerHTML = esc('SELECT * FROM products WHERE store_id = ') + (num ? esc(v) : '<mark class="inj">' + esc(v) + '</mark>');
        let raw;
        if (num) raw = v.trim() === '7' ? rows : '<p>0 rows. No shop with that ID.</p>';
        else if (/drop\s+table/i.test(v)) raw = '<p class="res-bad"><b>Table "products" deleted.</b> Every shop\'s catalog is gone. The ";" ended your query and started theirs.</p>';
        else if (/\bor\b\s+\S+\s*=\s*\S+/i.test(v)) raw = '<p class="res-bad"><b>4,812 rows.</b> Every product from every shop, including the ones they hid. "OR 1=1" is always true.</p>';
        else raw = '<p class="res-bad">ERROR: syntax error at or near "' + esc(v.trim().split(/\s+/)[0] || v) + '"</p>';
        root.querySelector('#ormRawRes').innerHTML = raw;
        root.querySelector('#ormOrmSql').innerHTML = esc('SELECT products.id, products.name, products.price\nFROM products WHERE products.store_id = %(store_id_1)s') + '\n<span class="c">' + esc("params: {'store_id_1': " + JSON.stringify(v) + '}') + '</span>';
        root.querySelector('#ormOrmRes').innerHTML = num ? (v.trim() === '7' ? rows : '<p>0 rows. No shop with that ID.</p>')
          : '<p class="res-ok">ERROR: invalid input syntax for type integer: "' + esc(v) + '". ' + (evil ? '<b>Nothing leaked. Nothing deleted.</b> The value was never treated as SQL.' : '') + '</p>';
      };
      const presets = root.querySelector('.orm-presets');
      [['7', 'A normal ID'], ['7 OR 1=1', 'Show me everything'], ['7; DROP TABLE products; --', 'The classic']].forEach(([v, label]) =>
        presets.appendChild(btn('chip chip-req', esc(label) + ': <code>' + esc(v) + '</code>', () => { input.value = v; update(); })));
      input.addEventListener('input', update);
      update();
      const dec = root.querySelector('.decision');
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false; decide.hidden = true;
        dec.innerHTML = '<b>SQLAlchemy, the ORM most FastAPI projects use.</b> You write Python, it writes the SQL, and values always travel separately from the query. It also comes with Alembic for changing tables safely later.';
        api.decide('orm');
      });
      root.appendChild(decide);
    },

    datamodel(root, sc, api) {
      root.innerHTML =
        '<div class="dm"><div class="tabs" role="tablist"></div><div class="dm-view"></div><div class="dm-exp"><p class="eyebrow">Try it</p><div class="row"></div><div class="dm-result" aria-live="polite"><p class="muted">Pick an experiment.</p></div></div>' +
        '<div class="dm-families"><p><b>Relational</b>: PostgreSQL, MySQL, SQL Server, Oracle</p><p><b>Non-relational</b>: MongoDB (documents), Redis (key-value), Cassandra (wide-column), DynamoDB</p></div></div>' +
        '<div class="decision" hidden></div>';
      const T = (cap, head, rows, hl) => '<div class="tbl"><p class="tbl-cap">' + cap + '</p><table class="mini-table"><tr>' + head.map((h) => '<th>' + h + '</th>').join('') + '</tr>' +
        rows.map((r, i) => '<tr' + (hl === i ? ' class="hl"' : '') + '>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</table></div>';
      let mode = 'tables', renamed = false;
      const view = root.querySelector('.dm-view');
      const draw = () => {
        const shop = renamed ? 'Ravi Electronics &amp; Sons' : 'Ravi Electronics';
        if (mode === 'tables') {
          view.innerHTML = '<div class="tables">' +
            T('stores', ['id', 'name', 'area'], [['7', 'Sharma General Store', 'Gandhipuram'], ['8', 'Lakshmi Bakery', 'RS Puram'], ['9', shop, 'Peelamedu']], renamed ? 2 : -1) +
            T('products', ['id', 'store_id', 'name', 'price', 'stock'], [['101', '<span class="fk">7</span>', 'Protein Shaker', '99', '1'], ['102', '<span class="fk">7</span>', 'Rubber Duck', '249', '12'], ['103', '<span class="fk">9</span>', '2-slice Toaster', '1,299', '3']]) +
            T('orders', ['id', 'product_id', 'customer', 'qty'], [['5001', '<span class="fk">103</span>', 'Ramesh', '1'], ['5002', '<span class="fk">101</span>', 'Priya', '1']]) +
            '</div><p class="muted">Highlighted numbers point at a row in another table: <code>products.store_id → stores.id</code>, <code>orders.product_id → products.id</code>.</p>';
        } else {
          view.innerHTML = '<pre class="code json">' + esc(JSON.stringify({ _id: 'store_9', name: renamed ? 'Ravi Electronics & Sons' : 'Ravi Electronics', area: 'Peelamedu', products: [{ name: '2-slice Toaster', price: 1299, stock: 3 }] }, null, 2)) +
            '</pre><pre class="code json">' + esc(JSON.stringify({ _id: 'order_5001', customer: 'Ramesh', product: { name: '2-slice Toaster', price: 1299, shop: 'Ravi Electronics' } }, null, 2)) + '</pre>' +
            '<p class="muted">Each document carries its own copy of what it needs. Easy to read, easy to change shape.</p>';
        }
        root.querySelectorAll('.dm .tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.m === mode)));
      };
      [['tables', 'Tables (relational)'], ['docs', 'Documents (non-relational)']].forEach(([m, label]) => {
        const b = btn('tab', label, () => { mode = m; draw(); });
        b.dataset.m = m; b.setAttribute('role', 'tab');
        root.querySelector('.dm .tabs').appendChild(b);
      });
      const res = root.querySelector('.dm-result');
      const exps = [
        ['Rename a shop', () => { renamed = true; draw(); return '<p><b>Tables:</b> 1 row updated. Every product and order still points at store 9, so they all show the new name.</p><p><b>Documents:</b> 1 store document, plus 312 order documents that each kept a copy of "Ravi Electronics". Miss one and an old order shows the old name.</p>'; }],
        ['A product with odd fields', () => '<p><b>Documents:</b> just add <code>"sizes": [6, 7, 8]</code> to the shoe. Nothing else changes.</p><p><b>Tables:</b> add a column for every odd field, or a separate attributes table. Or use a flexible JSON column inside a relational table, which PostgreSQL is very good at.</p>'],
        ['Count orders per shop today', () => '<p><b>Tables:</b> one query: <code>JOIN</code> orders to products to stores, then <code>GROUP BY</code> shop.</p><p><b>Documents:</b> possible, but you read many documents or write an aggregation pipeline, and copied names may disagree.</p>']
      ];
      exps.forEach(([label, fn]) => root.querySelector('.dm-exp .row').appendChild(btn('btn btn-small', esc(label), () => { res.innerHTML = fn(); })));
      draw();
      const dec = root.querySelector('.decision');
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false; decide.hidden = true;
        dec.innerHTML = '<b>Relational.</b> Tomazon\'s data is connected (orders → products → shops) and must be correct (stock, money). Non-relational shines for huge, loosely connected data: feeds, logs, sessions.';
        api.decide('dbkind');
      });
      root.appendChild(decide);
    },

    acid(root, sc, api) {
      root.innerHTML =
        '<div class="acid">' +
        '<div class="acid-top"><div class="acid-product"><span class="ap-name">Protein Shaker</span><span class="ap-stock">Stock: <b id="acidStock">1</b></span></div>' +
        '<div class="acid-toggle"><span>Transactions</span><div class="seg2" role="group" aria-label="Transactions"><button type="button" data-tx="off" aria-pressed="true">Off</button><button type="button" data-tx="on" aria-pressed="false">On</button></div></div>' +
        '<div class="acid-runs"><button type="button" class="btn btn-small" data-run="race">Two buyers, same moment</button><button type="button" class="btn btn-small" data-run="crash">Server crashes mid-order</button></div></div>' +
        '<div class="lanes"><div class="lane-head"><span>Riya</span><span>Database</span><span>Kabir</span></div><div class="lane-rows" aria-live="polite"></div></div>' +
        '<p class="acid-result" aria-live="polite"></p>' +
        '<div class="letters">' +
        '<div class="letter" data-l="A"><b>A</b><span>Atomicity</span><p>All or nothing. An order and its stock change happen together, or not at all.</p></div>' +
        '<div class="letter" data-l="C"><b>C</b><span>Consistency</span><p>The rules always hold. Stock never goes below zero; every order points at a real product.</p></div>' +
        '<div class="letter" data-l="I"><b>I</b><span>Isolation</span><p>Two buyers at the same moment don\'t trip over each other. One waits for the other.</p></div>' +
        '<div class="letter" data-l="D"><b>D</b><span>Durability</span><p>Once it says "Order placed", it survives a crash or a power cut. It\'s on disk before you see the message.</p></div>' +
        '</div></div>';
      let tx = 'off';
      const rows = root.querySelector('.lane-rows'), result = root.querySelector('.acid-result'), stock = root.querySelector('#acidStock');
      root.querySelectorAll('[data-tx]').forEach((b) => b.addEventListener('click', () => {
        tx = b.dataset.tx;
        root.querySelectorAll('[data-tx]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      }));
      const S = {
        race: {
          off: [[0, 'Reads stock: 1'], [2, 'Reads stock: 1'], [0, 'Sets stock to 0. Order #1 placed'], [2, 'Sets stock to 0. Order #2 placed']],
          on: [[0, 'BEGIN. Reads stock: 1, and locks the row'], [2, 'BEGIN. Wants the row… waiting'], [0, 'Stock 0. Order #1. COMMIT'], [1, 'Lock released'], [2, 'Reads stock: 0. "Sold out". ROLLBACK']],
          res: { off: ['bad', '2 orders for 1 shaker. Oversold. Somebody gets an apology call.', '-1'], on: ['ok', '1 order, stock 0. Kabir sees "Sold out" instead of a broken promise.', '0'] },
          letter: 'I'
        },
        crash: {
          off: [[0, 'Order #3 saved'], [1, 'Power cut!'], [1, 'Restart'], [0, 'Order #3 exists, but stock still says 1']],
          on: [[0, 'BEGIN. Order #3 written, not yet committed'], [1, 'Power cut!'], [1, 'Restart: the unfinished transaction is rolled back'], [0, 'No order #3, stock still 1. Riya sees an error and taps Buy again']],
          res: { off: ['bad', 'An order with no stock taken. The data now disagrees with itself.', '1'], on: ['ok', 'All or nothing. Half an order never exists.', '1'] },
          letter: 'A'
        }
      };
      root.querySelectorAll('[data-run]').forEach((b) => b.addEventListener('click', () => {
        clearTimers();
        const s = S[b.dataset.run];
        rows.innerHTML = ''; result.textContent = ''; result.className = 'acid-result'; stock.textContent = '1';
        root.querySelectorAll('.letter').forEach((l) => l.classList.toggle('is-on', l.dataset.l === s.letter));
        s[tx].forEach(([lane, text], k) => later(450 + k * 750, () => {
          const r = el('div', 'lane-row');
          for (let j = 0; j < 3; j++) r.appendChild(el('span', j === lane ? 'step' + (/Power cut/.test(text) ? ' is-crash' : '') : '', j === lane ? esc(text) : ''));
          rows.appendChild(r);
        }));
        later(450 + s[tx].length * 750, () => {
          const [kind, text, st] = s.res[tx];
          result.className = 'acid-result is-' + kind;
          result.textContent = text;
          stock.textContent = st;
          if (tx === 'on') api.decide('dbkind');
        });
      }));
    },

    dbpick(root, sc, api) {
      const cols = ['PostgreSQL', 'MySQL', 'Excel (Tom\'s idea)'];
      const rows = [
        ['Free and open source', ['y', 'Yes'], ['y', 'Yes'], ['n', 'Paid, one copy per laptop']],
        ['Many people writing at once', ['y', 'Yes'], ['y', 'Yes'], ['n', '"File is locked for editing"']],
        ['Transactions (ACID)', ['y', 'Yes'], ['y', 'Yes, with InnoDB'], ['n', 'No']],
        ['Flexible fields per product', ['s', 'JSONB, and you can index it'], ['y', 'JSON columns'], ['n', 'Another column']],
        ['Refuses bad data', ['y', 'Strict by default'], ['y', 'Strict in modern versions. Older ones quietly "fixed" bad values'], ['n', '"12 rupees" in a price column? Sure.']],
        ['Extras for later', ['s', 'PostGIS for "shops near me", full-text search, pgvector'], ['m', 'Fewer built in'], ['n', 'Macros']],
        ['Biggest it can get', ['y', 'Runs huge websites'], ['y', 'Runs huge websites'], ['n', '1,048,576 rows, then it stops']]
      ];
      const g = { y: '✓', s: '★', m: '–', n: '✕' };
      root.innerHTML = '<div class="dbpick"><div class="tbl-scroll"><table class="cmp"><thead><tr><th></th>' + cols.map((c, i) => '<th data-c="' + i + '">' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rows.map(([crit, ...cells]) => '<tr><th>' + esc(crit) + '</th>' + cells.map(([k, t], i) => '<td data-c="' + i + '" class="v-' + k + '"><span class="g">' + g[k] + '</span>' + esc(t) + '</td>').join('') + '</tr>').join('') +
        '</tbody></table></div><p class="muted">★ means "especially good at this". Both real databases would have worked.</p></div><div class="decision" hidden></div>';
      const dec = root.querySelector('.decision');
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false; decide.hidden = true;
        root.querySelectorAll('[data-c="0"]').forEach((c) => c.classList.add('is-chosen'));
        dec.innerHTML = '<b>PostgreSQL.</b> Strict about data, JSONB for odd product fields, and extensions like PostGIS for "shops near me" later. MySQL would also have been a good choice. Excel would not.';
        api.decide('db');
      });
      root.appendChild(decide);
    },

    cloud(root, sc, api) {
      const opts = [
        { id: 'aws', name: 'AWS', stats: [['Products to learn', '200+'], ['Screens to a first server', 'about 9'], ['Price on the button', 'Use the calculator'], ['For students', 'Free tier, 12 months']],
          jargon: ['VPC', 'Subnets', 'Route tables', 'Internet gateway', 'Security groups', 'IAM roles', 'Key pairs', 'AMI', 'EBS volume', 'Elastic IP', 'Instance types', 'CloudWatch', 'Billing alarms'],
          after: 'Tom has left the room.', v: 'The most powerful cloud, and worth learning. For one server this weekend, it\'s a lot. (AWS Lightsail is AWS\'s own simpler option.)' },
        { id: 'gcp', name: 'Google Cloud', stats: [['Products to learn', '100+'], ['Screens to a first server', 'about 6'], ['Price on the button', 'Estimate shown'], ['For students', 'Free credits']],
          jargon: ['Project', 'Billing account', 'VPC network', 'Firewall rules', 'Service account', 'Machine type', 'Boot disk', 'External IP'],
          after: 'Tom is reading about billing accounts. He looks worried.', v: 'Excellent tools, especially for data. About the same learning curve for a first server.' },
        { id: 'do', name: 'DigitalOcean', stats: [['Products to learn', 'about 20'], ['Screens to a first server', '1'], ['Price on the button', 'Yes: $4/month'], ['For students', 'Student credits']],
          jargon: ['Region', 'Image', 'Size', 'SSH key', 'Create'],
          after: 'Tom: "That\'s it?"', v: 'One page, one price, a server in about a minute. Exactly what a 48-hour experiment needs.' },
        { id: 'laptop', name: 'Laptop under the bed', stats: [['Products to learn', '0'], ['Screens to a first server', 'Just leave it on'], ['Price on the button', 'Free*'], ['For students', '*until your roommate unplugs it']],
          jargon: [], after: '', v: 'Free, until your roommate unplugs it to charge his phone. Also, hostel Wi-Fi won\'t let the world reach it, and it sleeps when you close the lid.' }
      ];
      root.innerHTML = '<div class="cloud"><div class="cloud-grid"></div><div class="cloud-detail" aria-live="polite"><p class="muted">Click a cloud to see what creating one server looks like there. (Rough numbers, as day one feels.)</p></div></div><div class="decision" hidden></div>';
      const grid = root.querySelector('.cloud-grid'), detail = root.querySelector('.cloud-detail');
      opts.forEach((o) => {
        const b = btn('opt opt-cloud', '<span class="opt-name">' + esc(o.name) + '</span><dl>' + o.stats.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>', () => {
          clearTimers();
          grid.querySelectorAll('.opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
          detail.innerHTML = (o.jargon.length ? '<p class="eyebrow">' + (o.id === 'do' ? 'The whole process' : 'Before your first server, you meet') + '</p><div class="jargon"></div>' : '') + '<p class="cloud-after"></p><p class="verdict-line">' + esc(o.v) + '</p>';
          const j = detail.querySelector('.jargon');
          o.jargon.forEach((w, k) => later(reduced() ? 0 : 90 * k, () => j.appendChild(el('span', 'jw', (o.id === 'do' ? (k + 1) + '. ' : '') + esc(w)))));
          later(reduced() ? 0 : 90 * o.jargon.length + 300, () => { const a = detail.querySelector('.cloud-after'); if (a) a.textContent = o.after; });
        });
        b.setAttribute('aria-pressed', 'false');
        if (o.id === 'do') b.dataset.pick = '1';
        grid.appendChild(b);
      });
      const dec = root.querySelector('.decision');
      const decide = btn('btn btn-primary', 'Decide', () => {
        dec.hidden = false; decide.hidden = true;
        grid.querySelector('[data-pick]').classList.add('is-chosen');
        dec.innerHTML = '<b>DigitalOcean.</b> Not the most powerful cloud. The simplest one, with the price written on the button. You can always move later.';
        api.decide('cloud');
      });
      root.appendChild(decide);
    },

    droplet(root, sc, api) {
      const groups = [
        { key: 'region', label: 'Where should it live?', opts: [
          ['blr', 'Bangalore', 'about 15 ms from your customers', 'Close to your shops and customers. Every page feels quick.'],
          ['sgp', 'Singapore', 'about 55 ms', 'Not bad, but why make every request cross the sea?'],
          ['fra', 'Frankfurt', 'about 150 ms', 'Your customers are in Coimbatore, not Germany.'],
          ['nyc', 'New York', 'about 240 ms', 'Every page would feel sluggish. Your shops are here.']] },
        { key: 'image', label: 'Which operating system?', opts: [
          ['ubuntu', 'Ubuntu 24.04 LTS', 'security updates until 2029', 'LTS means long-term support. Also: the most tutorials for 4 AM debugging.'],
          ['debian', 'Debian 12', 'rock solid', 'Excellent too. Ubuntu just has more answers online when you\'re stuck.'],
          ['fedora', 'Fedora 40', 'the newest everything', 'Fedora moves fast. A server wants slow and stable.']] },
        { key: 'size', label: 'How big?', opts: [
          ['xs', '$4 / month', '1 vCPU · 512 MB RAM · 10 GB SSD', 'Zero users, zero revenue. The cheapest server is the responsible choice. (Remember this number: 512 MB.)'],
          ['s', '$6 / month', '1 vCPU · 1 GB RAM · 25 GB SSD', 'Tom: "$6? We have zero users. Zero."'],
          ['m', '$12 / month', '1 vCPU · 2 GB RAM · 50 GB SSD', 'Tom: "$12 a month? That\'s our chai budget for two weeks."'],
          ['l', '$24 / month', '2 vCPU · 4 GB RAM · 80 GB SSD', 'Tom has stopped speaking to you.']] },
        { key: 'auth', label: 'How will you log in?', opts: [
          ['key', 'SSH key', 'recommended', 'A lock only your laptop has the key to. It can\'t be guessed.'],
          ['pass', 'Password', '', 'Bots will start guessing passwords on your new server within hours.']] }
      ];
      const sel = { region: 'blr', image: 'ubuntu', size: 'xs', auth: 'key' };
      const canon = Object.assign({}, sel);
      root.innerHTML = '<div class="droplet"><div class="dr-form"></div><aside class="dr-summary"><p class="eyebrow">Summary</p><dl class="dr-sum"></dl>' +
        '<label class="dr-name" for="drName">Hostname</label><input id="drName" type="text" value="tomazon-prod-1" spellcheck="false">' +
        '<p class="dr-note" aria-live="polite"></p><button type="button" class="btn btn-primary dr-create">Create server</button><div class="dr-progress" aria-live="polite"></div></aside></div>';
      const form = root.querySelector('.dr-form'), sum = root.querySelector('.dr-sum'), note = root.querySelector('.dr-note');
      const label = (g, id) => groups.find((x) => x.key === g).opts.find((o) => o[0] === id);
      const drawSum = () => {
        sum.innerHTML = groups.map((g) => { const o = label(g.key, sel[g.key]); return '<dt>' + esc(g.label.replace('?', '')) + '</dt><dd>' + esc(o[1]) + (o[2] ? ' <span>' + esc(o[2]) + '</span>' : '') + '</dd>'; }).join('');
      };
      groups.forEach((g) => {
        const fs = el('fieldset', 'dr-group', '<legend>' + esc(g.label) + '</legend>');
        const row = el('div', 'dr-opts');
        g.opts.forEach(([id, name, sub, why]) => {
          const b = btn('dr-opt', '<b>' + esc(name) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : ''), () => {
            sel[g.key] = id;
            row.querySelectorAll('.dr-opt').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
            note.textContent = why;
            drawSum();
          });
          b.setAttribute('aria-pressed', String(sel[g.key] === id));
          row.appendChild(b);
        });
        fs.appendChild(row);
        form.appendChild(fs);
      });
      drawSum();
      const create = root.querySelector('.dr-create'), prog = root.querySelector('.dr-progress');
      create.addEventListener('click', () => {
        create.disabled = true;
        const size = label('size', sel.size), region = label('region', sel.region);
        const steps = ['Reserving ' + size[2].split(' · ')[1] + ' in ' + region[1] + '…', 'Copying the ' + label('image', sel.image)[1] + ' image…', 'Booting…', 'Assigning a public IP address…'];
        prog.innerHTML = '';
        steps.forEach((s, k) => later(k * 850, () => { prog.insertAdjacentHTML('beforeend', '<p class="dr-step">' + esc(s) + '</p>'); }));
        later(steps.length * 850 + 400, () => {
          const off = Object.keys(canon).some((k) => canon[k] !== sel[k]);
          prog.insertAdjacentHTML('beforeend', '<div class="dr-done"><p><b>' + esc(root.querySelector('#drName').value || 'tomazon-prod-1') + '</b> is ready</p><p class="dr-ip">203.0.113.42</p>' +
            (off ? '<p class="muted">(In the story, you went with Bangalore, Ubuntu, the $4 server and an SSH key. Tom insisted.)</p>' : '') + '</div>');
          api.decide('server');
        });
      });
    }
  };

  TZ.Cards = Cards;
})();
