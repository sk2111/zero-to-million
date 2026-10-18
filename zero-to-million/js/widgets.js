/* The interactive pieces. A page asks for one with data-widget="name";
   app.js calls ZTM.widgets[name](element) after the page is rendered.
   Colours follow one meaning everywhere: orange = CPU / compute,
   aqua = network and waiting on other machines, blue = disk. */
window.ZTM = window.ZTM || {};

(function () {
  var W = ZTM.widgets = {};
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- helpers ---------- */

  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

  /* 1.5 -> "1.5", 12.34 -> "12", 0.25 -> "0.25" */
  function fmtNum(n) {
    if (n >= 100) return fmtInt(n);
    if (n >= 10) return String(Math.round(n));
    if (n >= 1) return String(Math.round(n * 10) / 10);
    return String(Math.round(n * 100) / 100);
  }

  function fmtNs(ns) {
    if (ns < 1e3) return fmtNum(ns) + ' ns';
    if (ns < 1e6) return fmtNum(ns / 1e3) + ' µs';
    if (ns < 1e9) return fmtNum(ns / 1e6) + ' ms';
    return fmtNum(ns / 1e9) + ' s';
  }

  function fmtMs(ms) { return fmtNum(ms) + ' ms'; }

  /* Seconds as a person would say them: "1.7 minutes", "6.3 years". */
  function fmtHuman(s) {
    var units = [[365 * 86400, 'year'], [30 * 86400, 'month'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']];
    for (var i = 0; i < units.length; i++) {
      if (s >= units[i][0] * 0.95 || i === units.length - 1) {
        var v = s / units[i][0];
        var shown = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
        return shown + ' ' + units[i][1] + (shown === 1 ? '' : 's');
      }
    }
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* One shared tooltip. Marks with data-tip show it on hover and on focus. */
  var tipEl = null;
  function tipShow(html, x, y) {
    tipEl = tipEl || document.getElementById('tip');
    tipEl.innerHTML = html;
    tipEl.hidden = false;
    var r = tipEl.getBoundingClientRect();
    var left = Math.min(window.innerWidth - r.width - 12, Math.max(12, x + 14));
    var top = y - r.height - 14;
    if (top < 12) top = y + 18;
    tipEl.style.left = left + 'px';
    tipEl.style.top = top + 'px';
  }
  function tipHide() { if (tipEl) tipEl.hidden = true; }
  function bindTips(root) {
    root.addEventListener('pointermove', function (e) {
      var m = e.target.closest('[data-tip]');
      if (m && root.contains(m)) tipShow(m.getAttribute('data-tip'), e.clientX, e.clientY);
      else tipHide();
    });
    root.addEventListener('pointerleave', tipHide);
    root.addEventListener('focusin', function (e) {
      var m = e.target.closest('[data-tip]');
      if (!m) return;
      var r = m.getBoundingClientRect();
      tipShow(m.getAttribute('data-tip'), r.left + r.width / 2, r.top);
    });
    root.addEventListener('focusout', tipHide);
  }
  ZTM.hideTip = tipHide;

  /* A row of radio-style buttons. Arrow keys move the choice inside it. */
  function segmented(label, options, current, onChange) {
    var wrap = document.createElement('div');
    wrap.className = 'seg';
    wrap.setAttribute('role', 'radiogroup');
    wrap.setAttribute('aria-label', label);
    options.forEach(function (o) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.value = o.value;
      b.textContent = o.label;
      wrap.appendChild(b);
    });
    function set(v, focus) {
      current = v;
      Array.prototype.forEach.call(wrap.children, function (b) {
        var on = b.dataset.value === String(v);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
    }
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      set(b.dataset.value);
      onChange(b.dataset.value);
    });
    wrap.addEventListener('keydown', function (e) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].indexOf(e.key) < 0) return;
      e.preventDefault();
      var vals = options.map(function (o) { return String(o.value); });
      var i = vals.indexOf(String(current));
      i = (i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1) + vals.length) % vals.length;
      set(vals[i], true);
      onChange(vals[i]);
    });
    set(current);
    return wrap;
  }

  function legend(items) {
    return '<div class="legend">' + items.map(function (it) {
      return '<span><i class="sw ' + it[0] + '"></i>' + esc(it[1]) + '</span>';
    }).join('') + '</div>';
  }

  /* Hide a label that doesn't fit inside its bar instead of clipping it. */
  function fitLabels(root) {
    root.querySelectorAll('.seg-label').forEach(function (l) {
      l.classList.remove('nofit');
      if (l.scrollWidth + 12 > l.parentNode.clientWidth) l.classList.add('nofit');
    });
  }
  function watchFit(root) {
    fitLabels(root);
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(root); }).observe(root);
  }

  /* ---------- 1.2  Where a 50 ms request spends its time ---------- */

  W['request-timeline'] = function (el) {
    var segs = [
      { label: 'Parse the request, check the login', short: 'parse', ms: 1, kind: 'cpu' },
      { label: 'Wait for the database', short: 'database', ms: 18, kind: 'net' },
      { label: 'Run the business logic', short: 'logic', ms: 2, kind: 'cpu' },
      { label: 'Wait for the payment service', short: 'payment service', ms: 26, kind: 'net' },
      { label: 'Build the JSON response', short: 'JSON', ms: 1, kind: 'cpu' },
      { label: 'Send it back', short: 'send', ms: 2, kind: 'net' }
    ];
    var total = segs.reduce(function (a, s) { return a + s.ms; }, 0);
    var cpu = segs.reduce(function (a, s) { return a + (s.kind === 'cpu' ? s.ms : 0); }, 0);
    var html = legend([['cpu', 'CPU working'], ['net', 'Waiting on another machine']]);
    html += '<div class="tl-bar">' + segs.map(function (s) {
      return '<span class="tl-seg ' + s.kind + '" style="flex:' + s.ms + ' 1 0px" tabindex="0" data-tip="<b>' + esc(s.label) +
        '</b><br>' + s.ms + ' ms, ' + (s.kind === 'cpu' ? 'CPU busy' : 'CPU idle') + '" aria-label="' + esc(s.label) + ', ' + s.ms + ' ms">' +
        '<span class="seg-label">' + esc(s.short) + ' ' + s.ms + ' ms</span></span>';
    }).join('') + '</div>';
    html += '<div class="tl-axis">' + [0, 10, 20, 30, 40, 50].map(function (t) {
      return '<span style="left:' + (t / total * 100) + '%">' + t + ' ms</span>';
    }).join('') + '</div>';
    html += '<p class="readout">CPU busy for <strong>' + cpu + ' ms of ' + total + ' ms</strong> (' + Math.round(cpu / total * 100) +
      '%). The other ' + (total - cpu) + ' ms, this core could be serving someone else.</p>';
    el.innerHTML = html;
    bindTips(el);
    watchFit(el);
  };

  /* ---------- 1.5  New vs reused connection ---------- */

  /* Typical round-trip times, shared by the network widgets. */
  var PLACES = [
    { value: 'dc', label: 'Same datacenter', rtt: 0.5 },
    { value: 'mum', label: 'Bangalore to Mumbai', rtt: 20 },
    { value: 'sg', label: 'Bangalore to Singapore', rtt: 50 },
    { value: 'us', label: 'Bangalore to US east', rtt: 220 }
  ];
  function placeBy(v) { return PLACES.filter(function (x) { return x.value === v; })[0]; }

  /* Nice upper bound and step for a 0-based axis with about 4–5 ticks. */
  function niceAxis(top) {
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
    for (var i = 0; i < steps.length; i++) if (top / steps[i] <= 5) return { max: Math.ceil(top / steps[i]) * steps[i], step: steps[i] };
    return { max: Math.ceil(top / 1000) * 1000, step: 1000 };
  }

  W['connection-waterfall'] = function (el) {
    var places = PLACES;
    var SERVER = 20;
    var place = 'mum';

    el.innerHTML = '<div class="w-controls"></div>' +
      legend([['net', 'Network round trip'], ['cpu', 'Server doing the work (20 ms)']]) +
      '<div class="wf"></div><p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">Not shown: the DNS lookup, which adds one more round trip to a resolver when the name isn’t cached.</p>';
    var wf = el.querySelector('.wf');
    var out = el.querySelector('.readout');
    el.querySelector('.w-controls').appendChild(segmented('Where the server is', places, place, function (v) { place = v; draw(); }));

    function draw() {
      var r = placeBy(place).rtt;
      var rows = [
        { name: 'New connection', segs: [
          ['net', 'TCP handshake', r], ['net', 'TLS handshake', r], ['net', 'request', r / 2], ['cpu', 'server', SERVER], ['net', 'response', r / 2]] },
        { name: 'Reused connection', segs: [
          ['net', 'request', r / 2], ['cpu', 'server', SERVER], ['net', 'response', r / 2]] }
      ];
      var max = rows[0].segs.reduce(function (a, s) { return a + s[2]; }, 0);
      var html = '';
      rows.forEach(function (row) {
        var t = 0, cells = '';
        row.segs.forEach(function (s) {
          cells += '<span class="wf-seg ' + s[0] + '" style="left:' + (t / max * 100) + '%;width:' + (s[2] / max * 100) + '%" tabindex="0" data-tip="<b>' +
            esc(s[1]) + '</b><br>' + fmtMs(s[2]) + '" aria-label="' + esc(s[1]) + ', ' + fmtMs(s[2]) + '"><span class="seg-label">' + esc(s[1]) + '</span></span>';
          t += s[2];
        });
        html += '<div class="wf-row"><span class="wf-name">' + row.name + '</span><span class="wf-track">' + cells + '</span><span class="wf-total">' + fmtMs(t) + '</span></div>';
      });
      wf.innerHTML = html;
      fitLabels(wf);
      var fresh = 3 * r + SERVER, reused = r + SERVER;
      if (r < 5) {
        out.innerHTML = 'Inside one datacenter a round trip costs almost nothing: the server’s <strong>20 ms</strong> of work is ' +
          Math.round(SERVER / fresh * 100) + '% of even a fresh connection. Here, your code is the slow part.';
      } else {
        out.innerHTML = 'A fresh connection takes <strong>' + fmtMs(fresh) + '</strong>, a reused one <strong>' + fmtMs(reused) +
          '</strong>. Reusing the connection saves ' + fmtMs(fresh - reused) + ' on every request, and no code change on the server could.';
      }
    }
    bindTips(el);
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(wf); }).observe(wf);
  };

  /* ---------- 1.7  Latency ladder ---------- */

  W['latency-ladder'] = function (el) {
    var rows = [
      ['cpu', 'Read from the L1 cache', 1, 'The CPU’s own tiny cache, right beside the core.'],
      ['cpu', 'Read from the L2 cache', 4, 'A bigger cache, still on the CPU.'],
      ['cpu', 'Read from RAM', 100, 'Main memory. Where your app’s data lives while it runs.'],
      ['cpu', 'Switch threads on a core', 2000, 'The OS saving one thread and loading another (a context switch).'],
      ['net', 'Send 1 KB on a 1 Gbps link', 1e4, 'Just putting the bits on the wire.'],
      ['disk', 'Read 4 KB at random from an SSD', 1e5, 'One small read, like fetching a database page.'],
      ['net', 'Round trip inside a datacenter', 5e5, 'Your app server asking the database server something.'],
      ['disk', 'Read 1 MB in sequence from an SSD', 1e6, 'A big, contiguous read: SSDs are good at these.'],
      ['disk', 'Read 1 MB in sequence from a hard disk', 5e6, 'A spinning disk at full speed.'],
      ['disk', 'Hard disk seek', 1e7, 'Moving the disk’s head to a new spot. Random reads pay this every time.'],
      ['net', 'Round trip Bangalore to Mumbai', 2e7, 'About 1,000 km of fibre each way, plus routing.'],
      ['net', 'Round trip India to US east', 2e8, 'Half the planet. The speed of light sets this, not your code.']
    ];
    var LO = Math.log10(0.3), HI = Math.log10(3e8);
    function pos(ns) { return (Math.log10(ns) - LO) / (HI - LO) * 100; }
    var ticks = [1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8];
    var grid = ticks.map(function (t) { return '<i class="gl" style="left:' + pos(t) + '%"></i>'; }).join('');
    el.innerHTML = legend([['cpu', 'CPU and memory'], ['disk', 'Disk'], ['net', 'Network']]) +
      '<div class="ladder">' +
        '<div class="ld-row ld-axis" aria-hidden="true"><span></span><span class="ld-track">' +
          ticks.map(function (t) { return '<span class="tick" style="left:' + pos(t) + '%">' + fmtNs(t) + '</span>'; }).join('') +
        '</span><span></span></div>' +
        rows.map(function (r) {
          return '<div class="ld-row" tabindex="0" aria-label="' + esc(r[1]) + ': about ' + fmtNs(r[2]) + '" data-tip="<b>' + esc(r[1]) +
            '</b><br>~' + fmtNs(r[2]) + '<br><span class=&quot;tip-note&quot;>' + esc(r[3]) + '</span>">' +
            '<span class="ld-label">' + esc(r[1]) + '</span>' +
            '<span class="ld-track">' + grid + '<span class="ld-bar ' + r[0] + '" style="width:' + pos(r[2]) + '%"></span></span>' +
            '<span class="ld-value">~' + fmtNs(r[2]) + '</span></div>';
        }).join('') +
      '</div>';
    bindTips(el);
  };

  /* ---------- Chapter 2: the pilot on one AWS server, and one request through it ---------- */

  /* Icons are drawn here in the style of AWS architecture diagrams (a coloured
     square per service category with a white glyph); they are not AWS's own artwork. */
  var G = {
    user: '<circle cx="16" cy="11" r="5"/><path d="M6 27c0-6 4.5-9 10-9s10 3 10 9"/>',
    dns: '<circle cx="16" cy="16" r="9"/><path d="M7 16h18M16 7c3 3 3 15 0 18M16 7c-3 3-3 15 0 18"/>',
    ip: '<path d="M16 26s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z"/><circle cx="16" cy="14" r="2.5"/>',
    shield: '<path d="M16 6l9 3v6c0 6-4 10-9 12-5-2-9-6-9-12V9z"/><path d="M12 16l3 3 5-6"/>',
    chip: '<rect x="10" y="10" width="12" height="12" rx="1.5"/><path d="M13 6v4M16 6v4M19 6v4M13 22v4M16 22v4M19 22v4M6 13h4M6 16h4M6 19h4M22 13h4M22 16h4M22 19h4"/>',
    proxy: '<path d="M7 12h14M17 8l4 4-4 4M25 20H11M15 16l-4 4 4 4"/>',
    bolt: '<path d="M18 5l-9 13h7l-2 9 9-13h-7z"/>',
    db: '<ellipse cx="16" cy="9" rx="8" ry="3"/><path d="M8 9v14c0 1.7 3.6 3 8 3s8-1.3 8-3V9M8 16c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
    disk: '<rect x="7" y="9" width="18" height="14" rx="2"/><path d="M11 13h10M11 17h6"/><circle cx="21" cy="19" r="1"/>',
    snap: '<path d="M8 12h4l2-3h4l2 3h4v11H8z"/><circle cx="16" cy="17" r="3.5"/>',
    cache: '<rect x="7" y="8" width="18" height="6" rx="1.5"/><rect x="7" y="18" width="18" height="6" rx="1.5"/><path d="M11 11h.01M11 21h.01M15 11h6M15 21h6"/>',
    log: '<rect x="5" y="11" width="22" height="10" rx="1.5"/><path d="M10.5 11v10M16 11v10M21.5 11v10"/>',
    edge: '<circle cx="16" cy="16" r="2.5"/><path d="M11 11a7 7 0 0 0 0 10M21 11a7 7 0 0 1 0 10M7.5 7.5a12 12 0 0 0 0 17M24.5 7.5a12 12 0 0 1 0 17"/>',
    bucket: '<ellipse cx="16" cy="9" rx="9" ry="2.5"/><path d="M7 9l2.5 15c.3 1.4 3 2 6.5 2s6.2-.6 6.5-2L25 9"/>',
    search: '<circle cx="14" cy="14" r="6.5"/><path d="M19 19l6 6"/>'
  };
  function icon(g, cat) {
    return '<span class="ic ' + cat + '" aria-hidden="true"><svg viewBox="0 0 32 32">' + G[g] + '</svg></span>';
  }

  /* A live architecture diagram: parts laid out in HTML, wires drawn between them
     in SVG from where the parts really sit, a request dot that flows along the
     wires, and a step-through. spec: { html, wires, request, steps }. */
  var archSeq = 0;
  function archNode(id, g, cat, title, sub) {
    return '<div class="nd" data-p="' + id + '">' + icon(g, cat) + '<b>' + title + '</b><span>' + sub + '</span></div>';
  }
  function liveArch(el, spec) {
    var WIRES = spec.wires, REQUEST = spec.request, STEPS = spec.steps, head = 'arHead' + (++archSeq);
    el.innerHTML =
      '<div class="ar2">' +
        '<svg class="ar2-wires" aria-hidden="true"><defs><marker id="' + head + '" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z"/></marker></defs><g class="wires"></g><g class="joints"></g><g class="labels"></g><circle class="pkt" r="5" cx="-20" cy="-20"/></svg>' +
        spec.html +
      '</div>' +
      '<div class="pt-dock">' +
        '<div class="pt-controls"><button type="button" class="btn-sm" data-next>' + (spec.start || 'Follow a request') + '</button><span class="pt-count"></span></div>' +
        '<p class="readout" aria-live="polite"></p>' +
      '</div>';

    /* On a tall diagram, the controls and the explanation move into the left column, and stay
       mid-screen while the reader scrolls through it. Below the diagram otherwise, and on phones. */
    var dock = el.querySelector('.pt-dock'), left = el.querySelector('.ar2 > .ar2-left');
    var wide = window.matchMedia ? window.matchMedia('(min-width: 721px)') : null;
    function placeDock() {
      var region = left && left.nextElementSibling;
      var side = !!region && region.getBoundingClientRect().height > 700 && (!wide || wide.matches);
      if (side && dock.parentNode !== left) left.appendChild(dock);
      if (!side && dock.parentNode !== el) el.appendChild(dock);
      dock.classList.toggle('docked', side);
      if (left) left.classList.toggle('has-dock', side);
    }

    var box = el.querySelector('.ar2'), svg = el.querySelector('.ar2-wires'), wiresG = svg.querySelector('.wires'),
        jointsG = svg.querySelector('.joints'), labelsG = svg.querySelector('.labels'), pkt = svg.querySelector('.pkt');
    var out = el.querySelector('.readout'), count = el.querySelector('.pt-count'), btn = el.querySelector('[data-next]');
    var paths = {}, k = -1, run = 0;

    /* Draw each wire from the edge of one part to the edge of the next. */
    function layout() {
      var b = box.getBoundingClientRect();
      svg.setAttribute('width', b.width); svg.setAttribute('height', b.height);
      svg.setAttribute('viewBox', '0 0 ' + b.width + ' ' + b.height);
      function r(id) {
        var q = box.querySelector('[data-p="' + id + '"]').getBoundingClientRect();
        return { l: q.left - b.left, r: q.right - b.left, t: q.top - b.top, b: q.bottom - b.top, cx: (q.left + q.right) / 2 - b.left, cy: (q.top + q.bottom) / 2 - b.top };
      }
      var w = '', lab = '', segs = [], bends = [];
      WIRES.forEach(function (x) {
        var A = r(x[1]), B = r(x[2]), pts, lx, ly;
        if (x[3] === 'h' || x[3] === 'hl') {   /* 'hl' turns just after leaving the source, to keep a lane of its own */
          var x1 = A.r + 3, x2 = B.l - 3, mx = x[3] === 'hl' ? x1 + 12 : (x1 + x2) / 2;
          pts = Math.abs(A.cy - B.cy) < 2 ? [[x1, A.cy], [x2, A.cy]] : [[x1, A.cy], [mx, A.cy], [mx, B.cy], [x2, B.cy]];
          lx = x1 + 6; ly = A.cy - 8;
        } else if (x[3] === 'vu') {   /* up: from the source's top to the target's bottom */
          var u1 = A.t - 3, u2 = B.b + 3, um = (u1 + u2) / 2;
          pts = Math.abs(A.cx - B.cx) < 2 ? [[A.cx, u1], [A.cx, u2]] : [[A.cx, u1], [A.cx, um], [B.cx, um], [B.cx, u2]];
          lx = Math.max(A.cx, B.cx) + 8; ly = um + 4;
        } else if (x[3] === 'r') {   /* round the right-hand side: out of the source's right, into the target's right */
          var xr = Math.max(A.r, B.r) + 16;
          pts = [[A.r + 3, A.cy], [xr, A.cy], [xr, B.cy], [B.r + 3, B.cy]];
          lx = xr + 6; ly = (A.cy + B.cy) / 2;
        } else if (x[3] === 'ld') {   /* out of the source's left, across, then down into the target's top */
          pts = [[A.l - 3, A.cy], [B.cx, A.cy], [B.cx, B.t - 3]];
          lx = B.cx + 6; ly = A.cy + 16;
        } else if (x[3] === 'u') {   /* under a row: down, across, back up */
          var yb = Math.max(A.b, B.b) + 18;
          pts = [[A.cx, A.b + 3], [A.cx, yb], [B.cx, yb], [B.cx, B.b + 3]];
          lx = (A.cx + B.cx) / 2 - 24; ly = yb + 14;
        } else {   /* 'v' turns halfway down; 'vt' turns just above the target, below a label at the top of its box */
          /* 'vb' turns just below the source, so several wires from one box share one bus */
          var y1 = A.b + 3, y2 = B.t - 3, my = x[3] === 'vt' ? y2 - 14 : x[3] === 'vb' ? y1 + 16 : (y1 + y2) / 2;
          pts = Math.abs(A.cx - B.cx) < 2 ? [[A.cx, y1], [A.cx, y2]] : [[A.cx, y1], [A.cx, my], [B.cx, my], [B.cx, y2]];
          lx = Math.max(A.cx, B.cx) + 8; ly = my + 4;
        }
        for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
        bends = bends.concat(pts.slice(1, -1));
        var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L');
        /* requests go both ways; a backup (one-way) is marked with a fifth flag */
        /* a one-way flag of 'rev' points the arrow at the wire's start instead of its end */
        var oneWay = !!x[5], rev = x[5] === 'rev';
        w += '<path data-w="' + x[0] + '" class="wire' + (oneWay ? ' slow' : '') + '" d="' + d + '"' +
          (!oneWay || rev ? ' marker-start="url(#' + head + ')"' : '') + (rev ? '' : ' marker-end="url(#' + head + ')"') + '/>';
        if (x[4]) lab += '<text x="' + lx + '" y="' + ly + '">' + x[4] + '</text>';
      });
      wiresG.innerHTML = w; labelsG.innerHTML = lab;
      jointsG.innerHTML = spec.joints ? joints(segs, bends) : '';
      paths = {};
      wiresG.querySelectorAll('path').forEach(function (p) { paths[p.getAttribute('data-w')] = p; });
      highlight();
    }

    /* Where three or more lines meet at a turn, a dot shows that they join rather than cross. */
    function joints(segs, bends) {
      var out = '', seen = {};
      bends.forEach(function (p) {
        var key = Math.round(p[0]) + ',' + Math.round(p[1]);
        if (seen[key]) return;
        seen[key] = 1;
        var dirs = {};
        segs.forEach(function (s) {
          var a = s[0], c = s[1], lo, hi;
          if (Math.abs(a[0] - c[0]) < 1 && Math.abs(a[0] - p[0]) < 1) {
            lo = Math.min(a[1], c[1]); hi = Math.max(a[1], c[1]);
            if (lo < p[1] - 1 && hi > p[1] - 1) dirs.up = 1;
            if (hi > p[1] + 1 && lo < p[1] + 1) dirs.down = 1;
          } else if (Math.abs(a[1] - c[1]) < 1 && Math.abs(a[1] - p[1]) < 1) {
            lo = Math.min(a[0], c[0]); hi = Math.max(a[0], c[0]);
            if (lo < p[0] - 1 && hi > p[0] - 1) dirs.left = 1;
            if (hi > p[0] + 1 && lo < p[0] + 1) dirs.right = 1;
          }
        });
        if (Object.keys(dirs).length >= 3) out += '<circle class="joint" r="3" cx="' + p[0] + '" cy="' + p[1] + '"/>';
      });
      return out;
    }

    /* Move the request dot along a list of wires, forwards (0) or backwards (1). */
    function animate(seq, then) {
      var my = ++run;
      if (reduceMotion || !seq.length) { pkt.setAttribute('cx', -20); if (then) then(); return; }
      var i = 0, t0 = null;
      function frame(ts) {
        if (my !== run || !el.isConnected) return;
        var p = paths[seq[i][0]]; if (!p) return;
        var len = p.getTotalLength(), dur = Math.max(260, len * 2.2);
        if (t0 === null) t0 = ts;
        var f = Math.min(1, (ts - t0) / dur), at = seq[i][1] ? len * (1 - f) : len * f;
        var pt = p.getPointAtLength(at);
        pkt.setAttribute('cx', pt.x); pkt.setAttribute('cy', pt.y);
        pkt.classList.toggle('back', !!seq[i][1]);
        if (f >= 1) { i++; t0 = null; if (i >= seq.length) { if (then) then(); return; } }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    function live() {   /* idle: a request every couple of seconds */
      var my = run + 1;
      animate(REQUEST, function () { setTimeout(function () { if (my === run && k === -1 && el.isConnected) live(); }, 900); });
    }

    function highlight() {
      var s = STEPS[k], wires = s ? s.run.map(function (x) { return x[0]; }) : [];
      box.classList.toggle('stepping', !!s);
      box.querySelectorAll('[data-p]').forEach(function (n) { n.classList.toggle('on', !!s && s.on.indexOf(n.getAttribute('data-p')) >= 0); });
      wiresG.querySelectorAll('path').forEach(function (p) { p.classList.toggle('on', wires.indexOf(p.getAttribute('data-w')) >= 0); });
      wiresG.querySelectorAll('path.on').forEach(function (p) { wiresG.appendChild(p); });
    }
    function draw() {
      var s = STEPS[k];
      highlight();
      if (!s) {
        count.textContent = '';
        out.innerHTML = spec.idle || 'Live traffic: each dot is one request, orange on its way in and teal on its way back. Press <strong>Follow a request</strong> to go through it step by step.';
        btn.textContent = spec.start || 'Follow a request';
        live();
        return;
      }
      count.textContent = 'Step ' + (k + 1) + ' of ' + STEPS.length + ': ' + s.t;
      out.innerHTML = s.say;
      btn.textContent = k === STEPS.length - 1 ? (spec.back || 'Back to live traffic') : 'Next step';
      animate(s.run);
    }
    btn.addEventListener('click', function () { k = k === STEPS.length - 1 ? -1 : k + 1; draw(); });

    placeDock();
    layout();
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { placeDock(); layout(); }).observe(box);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  /* Chapter 2: the pilot, everything on one server. */
  W['pilot-arch'] = function (el) {
    var node = archNode;
    liveArch(el, {
      joints: true,
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sg', 'v', ''],
        ['ng', 'sg', 'nginx', 'h', ''],
        ['app', 'nginx', 'app', 'h', ''],
        ['sql', 'app', 'db', 'h', ''],
        ['io', 'db', 'disk', 'v', ''],
        ['photo', 'nginx', 'disk', 'v', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true]
      ],
      request: [['in', 0], ['fw', 0], ['ng', 0], ['app', 0], ['sql', 0], ['sql', 1], ['app', 1], ['ng', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'dns'], run: [['dns', 0], ['dns', 1]], t: '~20 ms, then cached',
          say: '<strong>Find the server.</strong> The browser asks DNS for <code>tomazon.com</code>. Route 53 answers with the server’s Elastic IP. The answer is cached, so this happens rarely.' },
        { on: ['users', 'eip', 'sg', 'nginx'], run: [['in', 0], ['fw', 0], ['ng', 0]], t: '~40 ms: 2 round trips to Mumbai',
          say: '<strong>Connect.</strong> The browser opens a connection to the Elastic IP. The security group lets port 443 through, and Nginx completes the TCP and TLS handshakes.' },
        { on: ['nginx', 'app'], run: [['app', 0]], t: 'microseconds',
          say: '<strong>Hand over.</strong> Nginx forwards the request to a FastAPI worker over <code>localhost</code>. It never leaves the machine.' },
        { on: ['app', 'db', 'disk'], run: [['sql', 0], ['sql', 1]], t: '~5 ms of work, ~1 ms per query',
          say: '<strong>Do the work.</strong> FastAPI runs the endpoint and queries PostgreSQL, also over <code>localhost</code>: no network round trip. If the data isn’t in RAM, PostgreSQL reads it from the disk.' },
        { on: ['nginx', 'app', 'users'], run: [['app', 1], ['ng', 1], ['fw', 1], ['in', 1]], t: '~20 ms: 1 round trip',
          say: '<strong>Answer.</strong> The response goes back through Nginx to the browser. First request: about 85 ms in all. Later requests on the same connection skip DNS and the handshakes: about 25 ms.' },
        { on: ['users', 'eip', 'sg', 'nginx', 'disk'], run: [['in', 0], ['fw', 0], ['ng', 0], ['photo', 0], ['photo', 1], ['ng', 1], ['fw', 1], ['in', 1]], t: 'about 1 MB per product page',
          say: '<strong>Fetch the photos.</strong> The page then asks for its product photos. Nginx reads each one straight from the disk and sends it back: FastAPI and PostgreSQL never see it. Photos are most of the bytes this server sends (page 2.2).' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', 'in Bangalore') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC, public subnet</p>' +
            '<div class="ar2-row">' +
              '<div class="ar2-edge">' +
                node('eip', 'ip', 'c-net', 'Elastic IP', 'fixed public address') +
                node('sg', 'shield', 'c-sec', 'Security group', '443 open, 22 from the office') +
              '</div>' +
              '<div class="ar2-ec2"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'EC2 t4g.nano: 2 vCPUs, 512 MB of RAM, 32 Mbps of network (bursts to 5 Gbps). Inside, everything talks over localhost.</p>' +
                '<div class="ar2-sw">' +
                  node('nginx', 'proxy', 'c-sw', 'Nginx', 'HTTPS, port 443, and the photos') +
                  node('app', 'bolt', 'c-sw', 'FastAPI', '2 workers') +
                  node('db', 'db', 'c-sw', 'PostgreSQL', 'on localhost') +
                '</div>' +
                '<div class="ar2-disk">' + node('disk', 'disk', 'c-sto', 'EBS gp3 disk, 20 GB', 'Ubuntu, database, photos<br>250 IOPS, 5.4 MB/s steady') + '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar2-bak">' + node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>'
    });
  };

  /* Chapter 3: the app and the database on servers of their own. */
  W['split-live'] = function (el) {
    var node = archNode;
    liveArch(el, {
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sga', 'v', ''],
        ['ng', 'sga', 'nginx', 'h', ''],
        ['app', 'nginx', 'app', 'h', ''],
        ['net', 'app', 'sgd', 'v', 'private network, port 5432'],
        ['sql', 'sgd', 'db', 'h', ''],
        ['io', 'db', 'disk', 'h', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true]
      ],
      request: [['in', 0], ['fw', 0], ['ng', 0], ['app', 0], ['net', 0], ['sql', 0], ['sql', 1], ['net', 1], ['app', 1], ['ng', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'dns'], run: [['dns', 0], ['dns', 1]], t: '~20 ms, then cached',
          say: '<strong>Find the server.</strong> DNS still points <code>tomazon.com</code> at the Elastic IP, now attached to the app server.' },
        { on: ['users', 'eip', 'sga', 'nginx'], run: [['in', 0], ['fw', 0], ['ng', 0]], t: '~40 ms: 2 round trips to Mumbai',
          say: '<strong>Connect.</strong> The browser connects to the Elastic IP. The app server’s security group lets port 443 through, and Nginx completes the TCP and TLS handshakes.' },
        { on: ['nginx', 'app'], run: [['app', 0]], t: 'microseconds',
          say: '<strong>Hand over.</strong> Nginx forwards the request to a FastAPI worker over <code>localhost</code>, as before.' },
        { on: ['app', 'sgd', 'db'], run: [['net', 0], ['sql', 0]], t: '~0.2–0.5 ms per round trip',
          say: '<strong>Cross the network.</strong> FastAPI sends the query to the database server over the private network, reusing a pooled connection. The database’s security group accepts port 5432 only from the app server, so nothing else can reach it.' },
        { on: ['db', 'disk'], run: [['io', 0], ['io', 1], ['sql', 1], ['net', 1]], t: 'usually straight from RAM',
          say: '<strong>Answer from RAM.</strong> With 16 GB, PostgreSQL’s working set now fits in its cache, so most queries never touch the disk. The rows travel back to FastAPI.' },
        { on: ['app', 'nginx', 'users'], run: [['app', 1], ['ng', 1], ['fw', 1], ['in', 1]], t: '~20 ms: 1 round trip',
          say: '<strong>Answer.</strong> The response goes back through Nginx to the browser. The new network hop costs well under a millisecond per query, and both servers now have room to spare.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', 'in Bangalore and beyond') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1, one zone</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC</p>' +
            '<div class="ar3-subnet"><p class="ar2-k">Public subnet</p>' +
              '<div class="ar2-row">' +
                '<div class="ar2-edge ar3-edge">' +
                  node('eip', 'ip', 'c-net', 'Elastic IP', 'fixed public address') +
                  node('sga', 'shield', 'c-sec', 'Security group', '443 open, 22 from the office') +
                '</div>' +
                '<div class="ar2-ec2"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'App server: EC2 c7g.large, 2 vCPUs, 4 GB</p>' +
                  '<div class="ar3-two">' +
                    node('nginx', 'proxy', 'c-sw', 'Nginx', 'HTTPS, port 443, and the photos') +
                    node('app', 'bolt', 'c-sw', 'FastAPI', '2 workers, pooled connections') +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private"><p class="ar2-k">Private subnet: no public address</p>' +
              '<div class="ar2-row">' +
                '<div class="ar2-edge ar3-edge">' + node('sgd', 'shield', 'c-sec', 'Security group', '5432 from the app server only') + '</div>' +
                '<div class="ar2-ec2 ar3-db"><p class="ar2-k">' + icon('db', 'c-db') + 'Database server: EC2 r7g.large, 2 vCPUs, 16 GB</p>' +
                  '<div class="ar3-two">' +
                    node('db', 'db', 'c-sw', 'PostgreSQL', 'most data cached in RAM') +
                    node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '100 GB') +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar2-bak">' + node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>'
    });
  };

  /* ---------- 3.2: the two servers again, with PgBouncer on the app server ---------- */

  W['pool-arch'] = function (el) {
    var node = archNode;
    liveArch(el, {
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sga', 'v', ''],
        ['ng', 'sga', 'nginx', 'h', ''],
        ['app', 'nginx', 'app', 'h', ''],
        ['pool', 'app', 'pgb', 'h', ''],
        ['net', 'pgb', 'sgd', 'v', '20 connections'],
        ['sql', 'sgd', 'db', 'h', ''],
        ['io', 'db', 'disk', 'h', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true]
      ],
      request: [['in', 0], ['fw', 0], ['ng', 0], ['app', 0], ['pool', 0], ['net', 0], ['sql', 0],
                ['sql', 1], ['net', 1], ['pool', 1], ['app', 1], ['ng', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'eip', 'sga', 'nginx', 'app'], run: [['in', 0], ['fw', 0], ['ng', 0], ['app', 0]], t: 'as on page 3.2',
          say: '<strong>A request arrives.</strong> It reaches a FastAPI worker through the Elastic IP, the security group and Nginx, as before.' },
        { on: ['app', 'pgb'], run: [['pool', 0]], t: 'microseconds, over localhost',
          say: '<strong>Borrow a connection.</strong> FastAPI’s own pool hands the request a connection to PgBouncer on <code>localhost:6432</code>. It’s already open, so there’s no handshake and no login.' },
        { on: ['pgb', 'sgd', 'db'], run: [['net', 0], ['sql', 0]], t: '~0.2–0.5 ms per round trip',
          say: '<strong>Share a real connection.</strong> PgBouncer lends this transaction one of its 20 open connections to PostgreSQL, across the private network. Up to 400 app connections share those 20, so PostgreSQL never runs more than 20 connection processes.' },
        { on: ['db', 'disk'], run: [['io', 0], ['io', 1], ['sql', 1], ['net', 1]], t: 'usually straight from RAM',
          say: '<strong>Answer from RAM.</strong> PostgreSQL answers from its cache, and the rows travel back to PgBouncer.' },
        { on: ['pgb', 'app', 'nginx', 'users'], run: [['pool', 1], ['app', 1], ['ng', 1], ['fw', 1], ['in', 1]], t: 'nothing opened, nothing closed',
          say: '<strong>Give it back.</strong> When the transaction ends, PgBouncer takes the real connection back for the next one, and the response goes out through Nginx to the browser.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', 'in Bangalore and beyond') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1, one zone</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC</p>' +
            '<div class="ar3-subnet"><p class="ar2-k">Public subnet</p>' +
              '<div class="ar2-row">' +
                '<div class="ar2-edge ar3-edge">' +
                  node('eip', 'ip', 'c-net', 'Elastic IP', 'fixed public address') +
                  node('sga', 'shield', 'c-sec', 'Security group', '443 open, 22 from the office') +
                '</div>' +
                '<div class="ar2-ec2"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'App server: EC2 c7g.large, 2 vCPUs, 4 GB</p>' +
                  '<div class="ar2-sw">' +
                    node('nginx', 'proxy', 'c-sw', 'Nginx', 'HTTPS, port 443') +
                    node('app', 'bolt', 'c-sw', 'FastAPI', '2 workers, a small pool each') +
                    node('pgb', 'proxy', 'c-db', 'PgBouncer', 'port 6432: 400 in, 20 out') +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private"><p class="ar2-k">Private subnet: no public address</p>' +
              '<div class="ar2-row">' +
                '<div class="ar2-edge ar3-edge">' + node('sgd', 'shield', 'c-sec', 'Security group', '5432 from the app server only') + '</div>' +
                '<div class="ar2-ec2 ar3-db"><p class="ar2-k">' + icon('db', 'c-db') + 'Database server: EC2 r7g.large, 2 vCPUs, 16 GB</p>' +
                  '<div class="ar3-two">' +
                    node('db', 'db', 'c-sw', 'PostgreSQL', 'at most 20 connections') +
                    node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '100 GB') +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar2-bak">' + node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 2: before and after splitting the app and the database ---------- */

  W['split-arch'] = function (el) {
    function nd(g, cat, title, sub) {
      return '<div class="nd">' + icon(g, cat) + '<b>' + title + '</b><span>' + sub + '</span></div>';
    }
    el.innerHTML =
      '<div class="sa">' +
        '<div class="sa-col"><p class="sa-h">Today: one server</p>' +
          '<div class="sa-srv sa-mixed"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'EC2 t4g.nano: 2 vCPUs, 512 MB</p>' +
            '<div class="sa-nodes">' + nd('proxy', 'c-sw', 'Nginx', 'HTTPS') + nd('bolt', 'c-sw', 'FastAPI', 'uses CPU') + nd('db', 'c-sw', 'PostgreSQL', 'needs RAM and disk') + '</div>' +
            '<p class="sa-tag bad">Both fight over the same 2 vCPUs, 512 MB and disk</p>' +
          '</div>' +
        '</div>' +
        '<div class="sa-to" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg></div>' +
        '<div class="sa-col"><p class="sa-h">Next: a server each</p>' +
          '<div class="sa-srv"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'App server: EC2 c7g, compute-optimised</p>' +
            '<div class="sa-nodes">' + nd('proxy', 'c-sw', 'Nginx', 'HTTPS') + nd('bolt', 'c-sw', 'FastAPI', 'more workers') + '</div>' +
            '<p class="sa-tag">Tuned for CPU-bound work: cores to spare</p>' +
          '</div>' +
          '<div class="sa-link"><span class="sa-line" aria-hidden="true"></span>private network, same zone: well under 1 ms per query</div>' +
          '<div class="sa-srv sa-db"><p class="ar2-k">' + icon('db', 'c-db') + 'Database server: EC2 r7g, or Amazon RDS</p>' +
            '<div class="sa-nodes">' + nd('db', 'c-sw', 'PostgreSQL', 'in a private subnet') + nd('disk', 'c-sto', 'EBS gp3', 'IOPS bought to match') + '</div>' +
            '<p class="sa-tag">Tuned for I/O-bound work: RAM for the cache, a fast disk</p>' +
          '</div>' +
        '</div>' +
      '</div>';
  };

  /* ---------- Chapter 3: what the network hop costs per request ---------- */

  W['query-latency'] = function (el) {
    var WHERE = [
      { value: 'local', label: 'Same server', rtt: 0.03 },
      { value: 'zone', label: 'Same zone', rtt: 0.4 },
      { value: 'az', label: 'Another zone', rtt: 1.2 }
    ];
    var WORK = 0.3, CONN = 3;   /* ms of database work per query; ms to open a new connection */
    var st = { n: 20, where: 'zone', conn: false };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><label for="qlN">Queries per request</label><input type="range" id="qlN" min="1" max="60" value="' + st.n + '"><output for="qlN"></output></div>' +
        '<div class="w-field"><span class="lbl">Where the database is</span><span class="ql-where"></span></div>' +
        '<label class="ql-check"><input type="checkbox" id="qlC"> Open a new connection for every request (no pool)</label>' +
      '</div>' +
      legend([['net', 'Network round trips'], ['dbw', 'Database work'], ['conn', 'Opening a connection']]) +
      '<div class="wf ql-rows"></div>' +
      '<p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">Assumes small, indexed queries (about 0.3 ms of work each) and about 3 ms to open a new PostgreSQL connection.</p>';
    el.querySelector('.ql-where').appendChild(segmented('Where the database is', WHERE, st.where, function (v) { st.where = v; draw(); }));
    el.querySelector('#qlN').addEventListener('input', function (e) { st.n = +e.target.value; draw(); });
    el.querySelector('#qlC').addEventListener('change', function (e) { st.conn = e.target.checked; draw(); });
    var rowsEl = el.querySelector('.ql-rows'), out = el.querySelector('.readout');

    function row(name, segs, max) {
      var t = 0, cells = '';
      segs.forEach(function (s) {
        if (s[2] <= 0) return;
        cells += '<span class="wf-seg ' + s[0] + '" style="left:' + (t / max * 100) + '%;width:' + (s[2] / max * 100) + '%" tabindex="0" data-tip="<b>' +
          esc(s[1]) + '</b><br>' + fmtMs(s[2]) + '"><span class="seg-label">' + esc(s[1]) + '</span></span>';
        t += s[2];
      });
      return '<div class="wf-row"><span class="wf-name">' + name + '</span><span class="wf-track">' + cells + '</span><span class="wf-total">' + fmtMs(t) + '</span></div>';
    }
    function draw() {
      var rtt = WHERE.filter(function (w) { return w.value === st.where; })[0].rtt, n = st.n, c = st.conn ? CONN : 0;
      var a = [['conn', 'connect', c], ['net', 'round trips', n * rtt], ['dbw', 'work', n * WORK]];
      var b = [['conn', 'connect', c], ['net', 'round trips', Math.min(n, 2) * rtt], ['dbw', 'work', n * WORK]];
      var ta = c + n * rtt + n * WORK, tb = c + Math.min(n, 2) * rtt + n * WORK, max = Math.max(ta, tb, 1);
      el.querySelector('#qlN + output').textContent = n;
      rowsEl.innerHTML = row('As written: ' + n + ' quer' + (n === 1 ? 'y' : 'ies'), a, max) + row('Same data in ' + Math.min(n, 2) + ' quer' + (Math.min(n, 2) === 1 ? 'y' : 'ies'), b, max);
      fitLabels(rowsEl);
      var msg = n + ' quer' + (n === 1 ? 'y' : 'ies') + ' to a database ' + (st.where === 'local' ? 'on the same server' : st.where === 'zone' ? 'in the same zone' : 'in another zone') +
        ' cost <strong>' + fmtMs(ta) + '</strong> per request, ' + fmtMs(n * rtt) + ' of it just on the network. ';
      if (st.where === 'local') msg += 'On the same server, round trips are almost free, which is why the pilot never noticed them.';
      else msg += 'Fetching the same data in ' + Math.min(n, 2) + ' takes <strong>' + fmtMs(tb) + '</strong>: the database does the same work, but the round trips disappear.';
      if (st.conn) msg += ' Opening a new connection adds ' + CONN + ' ms to every request; a pool removes it.';
      out.innerHTML = msg;
    }
    bindTips(el);
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(rowsEl); }).observe(rowsEl);
  };

  /* ---------- Chapter 4: round robin vs least connections, simulated ---------- */

  W['lb-sim'] = function (el) {
    /* The model: 2 app servers with 4 workers each, 16 requests a second,
       90% fast (a product page, 100 ms) and 10% slow (a checkout, 2 s). */
    var P = { rate: 16, workers: 4, pSlow: 0.1, fast: 0.1, slow: 2, dt: 0.005 };
    function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
    function fresh() { return [{ busy: [], q: [] }, { busy: [], q: [] }]; }
    function load(s) { return s.busy.length + s.q.length; }
    function choose(alg, srv, st, r) {
      if (alg === 'rr') { st.turn = 1 - st.turn; return st.turn; }
      var a = load(srv[0]), b = load(srv[1]);
      return a < b ? 0 : b < a ? 1 : (r() < 0.5 ? 0 : 1);
    }
    function step(srv, t, done) {
      srv.forEach(function (s) {
        s.busy = s.busy.filter(function (x) { if (x.end <= t) { done(x); return false; } return true; });
        while (s.busy.length < P.workers && s.q.length) { var q = s.q.shift(); q.end = t + q.d; s.busy.push(q); }
      });
    }
    function pct(arr, f) { if (!arr.length) return 0; var a = arr.slice().sort(function (x, y) { return x - y; }); return a[Math.floor(f * (a.length - 1))]; }
    /* Ten simulated minutes of identical traffic under each algorithm. */
    function simulate(alg) {
      var r = rng(7), srv = fresh(), st = { turn: 0 }, lat = [];
      var next = -Math.log(1 - r()) / P.rate;
      for (var t = 0; t < 600; t += P.dt) {
        while (next <= t) {
          var slow = r() < P.pSlow;
          srv[choose(alg, srv, st, r)].q.push({ a: next, d: slow ? P.slow : P.fast, slow: slow });
          next += -Math.log(1 - r()) / P.rate;
        }
        step(srv, t, function (x) { if (!x.slow) lat.push(x.end - x.a); });
      }
      return { p50: Math.round(pct(lat, 0.5) * 1000), p95: Math.round(pct(lat, 0.95) * 1000) };
    }
    var stats = { rr: simulate('rr'), lc: simulate('lc') };

    var alg = 'lc';
    el.innerHTML =
      '<div class="w-controls"></div>' +
      legend([['lbfast', 'Product page: 100 ms of work'], ['lbslow', 'Checkout: 2 s, waiting for the payment gateway']]) +
      '<p class="lb-from">Nginx sends each new request to…</p>' +
      '<div class="lb-servers">' + [1, 2].map(function (i) {
        return '<div class="lb-card"><p class="lb-name"><b>App server ' + i + '</b><span>4 workers</span></p>' +
          '<div class="lb-slots"></div><p class="lb-qk">Waiting for a worker</p><div class="lb-q"></div></div>';
      }).join('') + '</div>' +
      '<div class="tiles tiles-3 lb-tiles" aria-live="polite">' +
        '<div class="tile"><span>Typical product page (p50)</span><b data-o="p50"></b><small>over 10 simulated minutes</small></div>' +
        '<div class="tile"><span>Slowest 5% of product pages (p95)</span><b data-o="p95"></b><small>over 10 simulated minutes</small></div>' +
        '<div class="tile key"><span>With the other algorithm</span><b data-o="other"></b><small data-o="otherk"></small></div>' +
      '</div>' +
      '<p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">The live view runs at half speed. The numbers in the tiles come from ten simulated minutes of exactly the same traffic under each algorithm.</p>';
    el.querySelector('.w-controls').appendChild(segmented('Load balancing algorithm', [
      { value: 'rr', label: 'Round robin' }, { value: 'lc', label: 'Least connections' }
    ], alg, function (v) { alg = v; reset(); show(); }));
    var cards = el.querySelectorAll('.lb-card'), out = el.querySelector('.readout');
    function o(n) { return el.querySelector('[data-o="' + n + '"]'); }

    function show() {
      var me = stats[alg], other = stats[alg === 'rr' ? 'lc' : 'rr'];
      o('p50').textContent = me.p50 + ' ms';
      o('p95').textContent = me.p95 + ' ms';
      o('other').textContent = other.p95 + ' ms';
      o('otherk').textContent = 'p95 with ' + (alg === 'rr' ? 'least connections' : 'round robin');
      out.innerHTML = alg === 'rr'
        ? '<strong>Round robin</strong> alternates between the servers without looking at them. When one server’s workers are all busy with checkouts, product pages still get sent there, and wait in its queue while the other server has free workers.'
        : '<strong>Least connections</strong> sends each request to the server with fewer requests in progress, so a product page goes wherever a worker is free. The typical page is just as fast, but the slow tail is about ' +
          Math.max(2, Math.round(stats.rr.p95 / stats.lc.p95)) + ' times shorter.';
    }

    /* The live view. */
    var live, st, clock, nextA, last = null, drawn = 0;
    function reset() { live = fresh(); st = { turn: 0 }; clock = 0; nextA = -Math.log(1 - Math.random()) / P.rate; }
    function advance(to) {
      while (clock < to) {
        clock += P.dt;
        while (nextA <= clock) {
          var slow = Math.random() < P.pSlow;
          live[choose(alg, live, st, Math.random)].q.push({ a: nextA, d: slow ? P.slow : P.fast, slow: slow });
          nextA += -Math.log(1 - Math.random()) / P.rate;
        }
        step(live, clock, function () {});
      }
    }
    function cell(x) { return '<i class="' + (x ? (x.slow ? 'lbslow' : 'lbfast') : '') + '"></i>'; }
    function render() {
      live.forEach(function (s, i) {
        var slots = '';
        for (var k = 0; k < P.workers; k++) slots += cell(s.busy[k]);
        cards[i].querySelector('.lb-slots').innerHTML = slots;
        var q = s.q.slice(0, 14).map(cell).join('') + (s.q.length > 14 ? '<em>+' + (s.q.length - 14) + '</em>' : '');
        cards[i].querySelector('.lb-q').innerHTML = q || '<em>none</em>';
      });
    }
    function frame(ts) {
      if (!el.isConnected) return;
      if (last === null) last = ts;
      var dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      advance(clock + dt * 0.5);
      if (ts - drawn > 90) { render(); drawn = ts; }
      requestAnimationFrame(frame);
    }
    reset(); show();
    if (reduceMotion) { advance(30); render(); }
    else requestAnimationFrame(frame);
  };

  /* Chapter 4: an Nginx load balancer in front of two app servers. */
  W['scaleout-live'] = function (el) {
    var node = archNode;
    liveArch(el, {
      joints: true,
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sg', 'v', ''],
        ['lb', 'sg', 'lb', 'h', ''],
        ['a1', 'lb', 'app1', 'v', ''],
        ['a2', 'lb', 'app2', 'v', 'least connections'],
        ['d1', 'app1box', 'pgb', 'v', ''],
        ['d2', 'app2box', 'pgb', 'v', ''],
        ['pool', 'pgb', 'db', 'h', ''],
        ['io', 'db', 'disk', 'h', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true],
        ['ph', 'users', 's3', 'h', '']
      ],
      request: [['in', 0], ['fw', 0], ['lb', 0], ['a1', 0], ['d1', 0], ['pool', 0], ['pool', 1], ['d1', 1], ['a1', 1], ['lb', 1], ['fw', 1], ['in', 1],
                ['in', 0], ['fw', 0], ['lb', 0], ['a2', 0], ['d2', 0], ['pool', 0], ['pool', 1], ['d2', 1], ['a2', 1], ['lb', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'dns'], run: [['dns', 0], ['dns', 1]], t: '~20 ms, then cached',
          say: '<strong>Find the service.</strong> DNS now points <code>tomazon.com</code> at the load balancer’s Elastic IP. Users never see the app servers directly.' },
        { on: ['users', 'eip', 'sg', 'lb'], run: [['in', 0], ['fw', 0], ['lb', 0]], t: '~40 ms: 2 round trips to Mumbai',
          say: '<strong>Connect to the load balancer.</strong> The browser’s HTTPS connection ends at Nginx, which holds the TLS certificate. Behind it, everything stays on the private network.' },
        { on: ['lb', 'app1', 'app2'], run: [['a2', 0]], t: 'a fraction of a millisecond',
          say: '<strong>Choose a server.</strong> Nginx uses least connections: app server 1 has 7 requests in progress, app server 2 has 3, so this one goes to server 2.' },
        { on: ['app2', 'pgb', 'db', 'disk'], run: [['d2', 0], ['pool', 0], ['pool', 1], ['d2', 1]], t: '~0.2–0.5 ms per query',
          say: '<strong>Do the work.</strong> FastAPI on server 2 sends its query across the private network to PgBouncer on the database server, which lends it one of 20 real connections to PostgreSQL over <code>localhost</code>. Both app servers share that one pool, so PostgreSQL sees 20 connections in all.' },
        { on: ['app2', 'lb', 'users'], run: [['a2', 1], ['lb', 1], ['fw', 1], ['in', 1]], t: '~20 ms: 1 round trip',
          say: '<strong>Answer.</strong> The response goes back through Nginx to the browser. The user can’t tell, and doesn’t need to know, which server answered.' },
        { on: ['users', 's3'], run: [['ph', 0], ['ph', 1]], t: 'straight from S3',
          say: '<strong>Fetch the photos.</strong> The page’s photo links point at the S3 bucket, so the browser downloads them straight from S3. The load balancer and the app servers never carry them.' },
        { on: ['lb', 'app2'], run: [['a2', 0]], t: 'after 3 failed attempts',
          say: '<strong>If a server fails.</strong> When requests to app server 1 keep failing, Nginx stops sending it traffic for a while and server 2 takes everything. That’s why each server needs room to spare.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', '10,000 of them') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1, one zone</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC</p>' +
            '<div class="ar3-subnet"><p class="ar2-k">Public subnet</p>' +
              '<div class="ar2-row">' +
                '<div class="ar2-edge ar3-edge">' +
                  node('eip', 'ip', 'c-net', 'Elastic IP', 'the load balancer’s address') +
                  node('sg', 'shield', 'c-sec', 'Security group', '443 open') +
                '</div>' +
                '<div class="ar2-ec2 ar4-lb"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'Load balancer: EC2 c7g.medium</p>' +
                  node('lb', 'proxy', 'c-net', 'Nginx', 'least_conn, health checks') +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private ar4-c"><p class="ar2-k">Private subnet: app servers</p>' +
              '<div class="ar4-apps">' +
                '<div class="ar2-ec2" data-p="app1box">' + node('app1', 'bolt', 'c-sw', 'FastAPI', '8 workers') + '<p class="ar2-k ar4-cap">' + icon('chip', 'c-cpu') + 'App server 1: c7g.2xlarge, 8 vCPUs</p></div>' +
                '<div class="ar2-ec2" data-p="app2box">' + node('app2', 'bolt', 'c-sw', 'FastAPI', '8 workers') + '<p class="ar2-k ar4-cap">' + icon('chip', 'c-cpu') + 'App server 2: c7g.2xlarge, 8 vCPUs</p></div>' +
              '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private ar4-c"><p class="ar2-k">Private subnet: database</p>' +
              '<div class="ar2-ec2 ar3-db">' +
                '<div class="ar2-sw">' +
                  node('pgb', 'proxy', 'c-db', 'PgBouncer', 'port 6432: one pool of 20') +
                  node('db', 'db', 'c-sw', 'PostgreSQL', 'at most 20 connections') +
                  node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '100 GB') +
                '</div>' +
                '<p class="ar2-k ar4-cap">' + icon('db', 'c-db') + 'Database server: EC2 r7g.large, 2 vCPUs, 16 GB</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar2-bak g-bak4">' + node('s3', 'bucket', 'c-sto', 'S3: tomazon-photos', 'product photos, fetched by browsers') +
            node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>'
    });
  };

  /* Chapters 5 and 6 keep chapter 4's architecture and add to it: read replicas in chapter 5,
     then Redis and the cache invalidator in chapter 6. o: { who, users, cache, inv } */
  function growLayout(o) {
    var node = archNode;
    var apps = o.apps || [['FastAPI', 'app server 1'], ['FastAPI', 'app server 2'], ['FastAPI', 'app server 3']];
    return (o.left || '<div class="ar2-left">' +
        node('users', 'user', 'c-user', o.who || 'Users', o.users) +
        node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
      '</div>') +
      '<div class="ar2-region">' +
        '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
        '<div class="ar2-vpc"><p class="ar2-k">VPC</p>' +
          '<div class="ar3-subnet"><p class="ar2-k">Public subnet</p>' +
            '<div class="ar2-row">' +
              '<div class="ar2-edge ar3-edge">' +
                node('eip', 'ip', 'c-net', 'Elastic IP', 'the load balancer’s address') +
                node('sg', 'shield', 'c-sec', 'Security group', '443 open') +
              '</div>' +
              '<div class="ar2-ec2 ar4-lb"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'Load balancer: EC2 c7g.medium</p>' +
                node('lb', 'proxy', 'c-net', 'Nginx', 'least_conn, health checks') +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar3-subnet ar3-private" data-p="apps">' +
            '<div class="ar2-ec2 g-apps"><div class="g-three">' +
              node('app1', 'bolt', 'c-sw', apps[0][0], apps[0][1]) +
              node('app2', 'bolt', 'c-sw', apps[1][0], apps[1][1]) +
              node('app3', 'bolt', 'c-sw', apps[2][0], apps[2][1]) +
            '</div><p class="ar2-k ar4-cap">' + icon('chip', 'c-cpu') + (o.appCap || '3 × EC2 c7g.2xlarge, 8 workers each' + (o.cache ? '; check Redis first' : '')) + '</p></div>' +
            '<p class="ar2-k g-foot">Private subnet: app servers</p>' +
          '</div>' +
          '<div class="g-data' + (o.cache ? ' with-cache' : '') + '">' +
            (o.cache
              ? '<div class="ar3-subnet ar3-private">' +
                  '<div class="ar2-ec2 ar3-db">' + node('redis', 'cache', 'c-db', 'Redis', 'finished pages') +
                  '<p class="ar2-k ar4-cap">' + icon('cache', 'c-db') + 'r7g.large, 16 GB, 10.0.4.10</p></div>' +
                  '<p class="ar2-k g-foot">Private subnet: cache</p>' +
                '</div>'
              : '') +
            '<div class="ar3-subnet ar3-private">' +
              '<div class="ar2-ec2 ar3-db"><div class="g-primary">' +
                '<div class="g-pgb">' + node('pgb', 'proxy', 'c-db', 'PgBouncer', 'port 6432: one pool of 20') + '</div>' +
                '<div class="g-db">' + node('db', 'db', 'c-sw', 'PostgreSQL', 'the primary: every write') + '</div>' +
                (o.inv ? '<div class="g-inv">' + node('inv', 'bolt', 'c-sw', 'Cache invalidator', 'LISTENs on localhost') + '</div>' : '') +
                '<div class="g-disk">' + node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '100 GB') + '</div>' +
              '</div><p class="ar2-k ar4-cap">' + icon('db', 'c-db') + 'Primary: EC2 r7g.large, 10.0.2.14</p></div>' +
              '<p class="ar2-k g-foot left">Private subnet: database</p>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private" data-p="reps">' +
              '<div class="g-reps">' +
                node('rep1', 'db', 'c-db', 'Replica 1', 'read-only, via db-read.internal') +
                node('rep2', 'db', 'c-db', 'Replica 2', 'read-only, via db-read.internal') +
              '</div>' +
              '<p class="ar2-k g-foot">Private subnet: replicas</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="g-bak' + (o.cache ? ' with-cache' : '') + '">' +
          '<div class="g-s3">' + node('s3', 'bucket', 'c-sto', 'S3: tomazon-photos', o.s3sub || 'product photos, fetched by browsers') + '</div>' +
          '<div class="g-snap">' + node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>' +
      '</div>';
  }

  /* The wires every stage shares: chapter 4's path in, and to the primary, plus the replicas. */
  function growWires(o) {
    return [
      ['dns', 'users', 'dns', 'v', 'DNS lookup'],
      ['in', 'users', 'eip', 'h', 'HTTPS'],
      ['fw', 'eip', 'sg', 'v', ''],
      ['lb', 'sg', 'lb', 'h', ''],
      ['a1', 'lb', 'app1', 'v', ''],
      ['a2', 'lb', 'app2', 'v', ''],
      ['a3', 'lb', 'app3', 'v', 'least connections'],
      ['w', 'apps', 'pgb', 'vb', ''],
      ['r', 'apps', 'reps', 'vb', ''],
      ['pool', 'pgb', 'db', 'v', ''],
      ['io', 'db', 'disk', 'v', ''],
      ['wal1', 'db', 'rep1', 'h', 'WAL', true],
      ['wal2', 'db', 'rep2', 'h', '', true],
      ['bak', 'disk', 'snap', 'v', 'daily', true],
      ['ph', 'users', 's3', 'h', '']
    ].concat(o.cache ? [['c', 'apps', 'redis', 'vb', '']] : [])
     .concat(o.inv ? [['note', 'db', 'inv', 'v', '', true], ['del', 'redis', 'inv', 'h', 'DEL', 'rev']] : []);
  }
  /* A request's way in and back out, through a given app server. */
  function inPath(app) { return [['in', 0], ['fw', 0], ['lb', 0], [app, 0]]; }
  function outPath(app) { return [[app, 1], ['lb', 1], ['fw', 1], ['in', 1]]; }

  /* ---------- Chapter 5: a primary for writes, replicas for reads ---------- */

  W['replica-live'] = function (el) {
    var o = { users: '100,000 of them' };
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: growWires(o),
      request: inPath('a1').concat([['r', 0], ['r', 1]], outPath('a1'), inPath('a3'), [['w', 0], ['pool', 0], ['wal1', 0], ['wal2', 0], ['pool', 1], ['w', 1]], outPath('a3')),
      steps: [
        { on: ['users', 'eip', 'sg', 'lb', 'app1', 'rep1'], run: inPath('a1').concat([['r', 0], ['r', 1]], outPath('a1')), t: 'a read',
          say: '<strong>Open a product page.</strong> The way in is the same as in chapter 4. Loading the product only reads data, so app server 1 sends the query to <code>db-read.internal</code>, and replica 1 answers from its own copy.' },
        { on: ['users', 'lb', 'app3', 'pgb', 'db', 'disk'], run: inPath('a3').concat([['w', 0], ['pool', 0], ['pool', 1], ['w', 1]], outPath('a3')), t: 'a write',
          say: '<strong>Add it to the cart.</strong> This request lands on app server 3. Saving the cart item changes data, so it goes to the primary through PgBouncer, exactly as in chapter 4. Every <code>INSERT</code>, <code>UPDATE</code> and <code>DELETE</code> does.' },
        { on: ['db', 'rep1', 'rep2'], run: [['wal1', 0], ['wal2', 0]], t: 'usually a few milliseconds',
          say: '<strong>Stream the change.</strong> The primary appends the new cart item to its write-ahead log, and streams that record to both replicas over the private network.' },
        { on: ['rep1', 'rep2'], run: [], t: 'applied in the same order',
          say: '<strong>Replay it.</strong> Each replica applies the record exactly as the primary did, in the same order. A few milliseconds after the write, both replicas have the cart item too.' },
        { on: ['users', 'lb', 'app2', 'rep2'], run: inPath('a2').concat([['r', 0], ['r', 1]], outPath('a2')), t: 'reads spread across replicas',
          say: '<strong>Spread the reads.</strong> The next read lands on app server 2, and <code>db-read.internal</code> sends it to replica 2. The primary is left with the writes, and each new replica adds more read capacity.' },
        { on: ['disk', 'snap'], run: [['bak', 0]], t: 'as in chapter 4',
          say: '<strong>Back up the primary.</strong> The daily snapshots carry on as before. A replica is a live copy, not a backup: a mistaken <code>DELETE</code> reaches it within milliseconds.' }
      ],
      html: growLayout(o)
    });
  };

  /* ---------- Chapter 5: replication lag on a timeline ---------- */

  W['lag-sim'] = function (el) {
    var RELOAD = 150, SPAN = 2000;   /* the page reloads 150 ms after the write; the timeline shows 2 seconds */
    var st = { lag: 400, ryw: false };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><label for="lgL">Replication lag right now</label><input type="range" id="lgL" min="0" max="1800" step="50" value="' + st.lag + '"><output for="lgL"></output></div>' +
        '<label class="ql-check"><input type="checkbox" id="lgR"> Read your own writes: send this shopper’s reads to the primary just after they write</label>' +
      '</div>' +
      legend([['has', 'Has your order'], ['hasnt', 'Doesn’t have it yet']]) +
      '<div class="lag-tl">' +
        '<div class="lag-row"><span class="lag-name">Primary</span><span class="lag-track" data-t="p"></span></div>' +
        '<div class="lag-row"><span class="lag-name">Replica</span><span class="lag-track" data-t="r"></span></div>' +
        '<div class="lag-axis"><span style="left:0%">0</span><span style="left:25%">0.5 s</span><span style="left:50%">1 s</span><span style="left:75%">1.5 s</span><span style="left:100%">2 s</span></div>' +
        '<span class="lag-mark" style="left:calc(var(--lag-name) + (100% - var(--lag-name)) * ' + (RELOAD / SPAN) + ')"><b>Page reloads</b></span>' +
      '</div>' +
      '<p class="lag-result" aria-live="polite"></p>' +
      '<p class="readout"></p>';
    el.querySelector('#lgL').addEventListener('input', function (e) { st.lag = +e.target.value; draw(); });
    el.querySelector('#lgR').addEventListener('change', function (e) { st.ryw = e.target.checked; draw(); });
    var res = el.querySelector('.lag-result'), out = el.querySelector('.readout');

    function bar(from) {
      var f = Math.min(1, from / SPAN) * 100;
      return '<i class="hasnt" style="left:0;width:' + f + '%"></i><i class="has" style="left:' + f + '%;width:' + (100 - f) + '%"></i>';
    }
    function draw() {
      el.querySelector('#lgL + output').textContent = st.lag + ' ms';
      el.querySelector('[data-t="p"]').innerHTML = bar(0);
      el.querySelector('[data-t="r"]').innerHTML = bar(st.lag);
      var from = st.ryw ? 'primary' : 'replica';
      el.querySelector('[data-t="p"]').parentNode.classList.toggle('reads', st.ryw);
      el.querySelector('[data-t="r"]').parentNode.classList.toggle('reads', !st.ryw);
      var ok = st.ryw || st.lag <= RELOAD;
      res.className = 'lag-result ' + (ok ? 'ok' : 'bad');
      res.innerHTML = ok
        ? 'The reload reads from the ' + from + ', which already has the order: <strong>the shopper sees it</strong>.'
        : 'The reload reads from the replica, which won’t have the order for another ' + (st.lag - RELOAD) + ' ms: <strong>the shopper’s new order is missing</strong>.';
      out.innerHTML = st.ryw
        ? 'For a short window after this shopper writes, their reads go to the primary, which always has the latest data. Everyone else keeps reading from the replicas.'
        : 'The shopper places an order at 0 ms, and “My orders” reloads 150 ms later. Drag the lag past 150 ms to see the problem, then turn on read your own writes.';
    }
    draw();
  };

  /* ---------- 5.3: CAP and PACELC, as the same diagram with two switches ---------- */

  W['cap-pacelc'] = function (el) {
    var node = archNode;
    var st = { when: 'cap', choose: 'c' };
    var WHEN = [{ value: 'cap', label: 'The network breaks: CAP' }, { value: 'pacelc', label: 'The network works: PACELC' }];
    var CHOOSE = {
      cap: [{ value: 'c', label: 'Consistency' }, { value: 'a', label: 'Availability' }],
      pacelc: [{ value: 'c', label: 'Consistency' }, { value: 'l', label: 'Low latency' }]
    };
    var VERDICT = {
      'cap-c': '<strong>Consistency while the link is down:</strong> nobody sees an out-of-date list, but some reads fail or wait for the primary. Right for stock at checkout and payments.',
      'cap-a': '<strong>Availability while the link is down:</strong> every read gets an answer, but replica 1’s answers are out of date until the link is back. Right for product pages and reviews.',
      'pacelc-c': '<strong>Consistency while everything works:</strong> every read is up to date, but every write waits for the replica. Right when a stale read would cost money.',
      'pacelc-l': '<strong>Low latency while everything works:</strong> writes are fast, and a read can be a few milliseconds behind. This is PostgreSQL’s default.'
    };

    /* The same shopper, app server, primary and replica in every scenario. */
    var WRITE = [['in', 0], ['w', 0], ['w', 1], ['in', 1]], READ = [['in', 0], ['r', 0], ['r', 1], ['in', 1]];
    var linkDown = { on: ['primary', 'rep'], run: [], t: 'replica 1 is cut off',
      say: '<strong>The link breaks.</strong> The network between the primary and replica 1 fails. Replica 1 can’t receive any more changes, but shoppers can still reach it.' };
    var orderOnPrimary = { on: ['shop', 'app', 'primary'], run: WRITE, t: 'saved on the primary only',
      say: '<strong>A shopper places an order.</strong> It’s a write, so it goes to the primary, which saves it. Replica 1 never hears about it.' };
    var SCENARIOS = {
      'cap-c': {
        request: WRITE,
        steps: [linkDown, orderOnPrimary,
          { on: ['shop', 'app', 'rep'], run: [['in', 0], ['r', 0]], t: 'replica 1 refuses',
            say: '<strong>They open “My orders”.</strong> The read goes to replica 1. Replica 1 knows it’s cut off from the primary, so it refuses to answer rather than risk an old list.' },
          { on: ['shop', 'app', 'primary'], run: READ.map(function (x) { return [x[0] === 'r' ? 'w' : x[0], x[1]]; }), t: 'slower, but correct',
            say: '<strong>The app asks the primary instead.</strong> The list is right, new order included. The price: reads fail or slow down, and the primary takes extra load until the link is back.' }]
      },
      'cap-a': {
        request: WRITE.concat(READ),
        steps: [linkDown, orderOnPrimary,
          { on: ['shop', 'app', 'rep'], run: READ, t: 'an answer, but an old one',
            say: '<strong>They open “My orders”.</strong> The read goes to replica 1, which answers at once from its own copy. The new order isn’t in it: the shopper gets an answer, but an out-of-date one.' },
          { on: ['primary', 'rep'], run: [['repl', 0]], t: 'when the link comes back',
            say: '<strong>The link comes back.</strong> Replica 1 catches up on everything it missed, and the order appears. Until then, every read from it was a little more out of date.' }]
      },
      'pacelc-c': {
        request: [['in', 0], ['w', 0], ['repl', 0], ['repl', 1], ['w', 1], ['in', 1]],
        steps: [
          { on: ['shop', 'app', 'primary'], run: [['in', 0], ['w', 0]], t: 'the primary saves it',
            say: '<strong>A shopper places an order.</strong> The write reaches the primary, which saves it. The network is fine.' },
          { on: ['primary', 'rep'], run: [['repl', 0], ['repl', 1]], t: '+1 round trip, about 0.5 ms in one zone',
            say: '<strong>Wait for the replica.</strong> Before answering, the primary sends the order to replica 1 and waits until replica 1 confirms it has saved it.' },
          { on: ['primary', 'app', 'shop'], run: [['w', 1], ['in', 1]], t: 'every write pays this',
            say: '<strong>Then answer.</strong> Only now does the shopper see “done”. Every write waits for that extra round trip, and longer if the replica is in another zone or busy.' },
          { on: ['shop', 'app', 'rep'], run: READ, t: 'always up to date',
            say: '<strong>Any read is fresh.</strong> “My orders” reads from replica 1, which already has the order.' }]
      },
      'pacelc-l': {
        request: WRITE.concat([['repl', 0]]),
        steps: [
          { on: ['shop', 'app', 'primary'], run: [['in', 0], ['w', 0]], t: 'the primary saves it',
            say: '<strong>A shopper places an order.</strong> The write reaches the primary, which saves it. The network is fine.' },
          { on: ['primary', 'app', 'shop'], run: [['w', 1], ['in', 1]], t: 'no waiting',
            say: '<strong>Answer at once.</strong> The primary tells the shopper “done” without waiting for any replica. Writes stay fast.' },
          { on: ['primary', 'rep'], run: [['repl', 0]], t: 'a few milliseconds later',
            say: '<strong>Replicate a moment later.</strong> The order streams to replica 1 in the background, a few milliseconds behind the primary.' },
          { on: ['shop', 'app', 'rep'], run: READ, t: 'fresh after those few milliseconds',
            say: '<strong>A read in between misses it.</strong> If “My orders” reads from replica 1 inside those milliseconds, the order isn’t there yet. That’s the replication lag from the timeline above.' }]
      }
    };

    el.innerHTML = '<div class="w-controls cap-controls"><span class="cap-when"></span><span class="cap-choose"></span></div>' +
      '<p class="calc-math cap-verdict" aria-live="polite"></p><div class="cap-arch"></div>';
    el.querySelector('.cap-when').appendChild(segmented('When', WHEN, st.when, function (v) { st.when = v; st.choose = 'c'; chooser(); draw(); }));
    function chooser() {
      var box = el.querySelector('.cap-choose');
      box.innerHTML = '';
      box.appendChild(segmented('Choose', CHOOSE[st.when], st.choose, function (v) { st.choose = v; draw(); }));
    }

    function draw() {
      var key = st.when + '-' + st.choose, sc = SCENARIOS[key];
      el.querySelector('.cap-verdict').innerHTML = VERDICT[key];
      /* A fresh element each time, so the previous diagram's animation stops with it. */
      var holder = el.querySelector('.cap-arch');
      holder.innerHTML = '<div class="cap-live' + (st.when === 'cap' ? ' cap-broken' : '') + '"></div>';
      liveArch(holder.firstChild, {
        wires: [
          ['in', 'shop', 'app', 'h', ''],
          ['w', 'app', 'primary', 'v', ''],
          ['r', 'app', 'rep', 'v', ''],
          ['repl', 'primary', 'rep', 'h', st.when === 'cap' ? 'link down' : 'replication']
        ],
        request: sc.request,
        steps: sc.steps,
        start: 'Step through it',
        back: 'Back to the start',
        idle: 'Press <strong>Step through it</strong> to follow one order and one read.',
        html:
          '<div class="ar2-left">' + node('shop', 'user', 'c-user', 'Shopper', 'places an order, then opens “My orders”') + '</div>' +
          '<div class="ar2-region">' +
            '<p class="ar2-k">Tomazon, in one region</p>' +
            '<div class="cap-app">' + node('app', 'bolt', 'c-sw', 'App server', 'writes go to the primary, reads to the replica') + '</div>' +
            '<div class="cap-dbs">' +
              node('primary', 'db', 'c-db', 'Primary', 'takes every write') +
              node('rep', 'db', 'c-db', 'Replica 1', 'answers reads') +
            '</div>' +
          '</div>'
      });
    }
    chooser();
    draw();
  };

  /* ---------- Chapter 6: Redis between the app and the database ---------- */

  /* Chapter 5's architecture, with Redis added in a subnet of its own. */
  W['cache-arch'] = function (el) {
    var o = { users: '500,000 of them', cache: true };
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: growWires(o),
      request: inPath('a1').concat([['c', 0], ['c', 1]], outPath('a1')),
      steps: [
        { on: ['users', 'eip', 'sg', 'lb', 'app1'], run: inPath('a1'), t: 'as before',
          say: '<strong>A shopper opens the home page.</strong> The request comes in exactly as in chapters 4 and 5, and reaches an app server through the load balancer.' },
        { on: ['app1', 'redis'], run: [['c', 0]], t: '~0.2 ms round trip',
          say: '<strong>Ask Redis first.</strong> The app sends <code>GET home:v1</code> to Redis, on its own server in a new private subnet.' },
        { on: ['redis', 'app1', 'lb', 'users'], run: [['c', 1]].concat(outPath('a1')), t: 'about 2 ms in the app',
          say: '<strong>A hit.</strong> Redis has the page, so the app returns it at once, and the database isn’t touched. During the sale, almost every request ends here.' },
        { on: ['app1', 'rep1', 'rep2'], run: [['r', 0], ['r', 1]], t: '100 queries, about 1 s',
          say: '<strong>A miss.</strong> Once every 5 minutes the key has expired, so the app builds the page from the replicas, exactly as in chapter 5.' },
        { on: ['app1', 'redis'], run: [['c', 0], ['c', 1]], t: 'the next request is a hit',
          say: '<strong>Store it.</strong> The app saves the page with <code>SET home:v1 … EX 300</code>, then returns it. Every request for the next 5 minutes is a hit.' }
      ],
      html: growLayout(o)
    });
  };

  /* The same again, with the cache invalidator on the database server. */
  W['invalidate-arch'] = function (el) {
    var o = { who: 'Shoppers and staff', users: '500,000 of them', cache: true, inv: true };
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: growWires(o),
      request: inPath('a2').concat([['w', 0], ['pool', 0], ['pool', 1], ['w', 1]], outPath('a2'), [['note', 0], ['del', 1]]),
      start: 'Follow a price change',
      idle: 'A price change, from the database to Redis. Press <strong>Follow a price change</strong> to go through it step by step.',
      steps: [
        { on: ['users', 'lb', 'app2', 'pgb', 'db'], run: inPath('a2').concat([['w', 0], ['pool', 0], ['pool', 1], ['w', 1]], outPath('a2')), t: 'a normal write',
          say: '<strong>The team changes a price.</strong> The update goes to the primary through PgBouncer, like every write, and commits.' },
        { on: ['db', 'inv'], run: [['note', 0]], t: 'when the transaction commits',
          say: '<strong>The database announces it.</strong> The trigger on the products table calls NOTIFY. When the transaction commits, PostgreSQL delivers the message to the cache invalidator, which runs on the same server and listens on <code>127.0.0.1</code>.' },
        { on: ['inv', 'redis'], run: [['del', 1]], t: 'about a millisecond',
          say: '<strong>Forget the old copies.</strong> The invalidator deletes <code>home:v1</code> and the product’s own key in Redis. A second later it deletes them again, in case a lagging replica put an old copy back.' },
        { on: ['users', 'lb', 'app1', 'redis', 'rep1', 'rep2'], run: inPath('a1').concat([['c', 0], ['c', 1], ['r', 0], ['r', 1]], outPath('a1')), t: 'one rebuild',
          say: '<strong>The next shopper rebuilds it.</strong> Their request misses in Redis, so the app builds the page again from the replicas, with the new price, and stores it. Everyone after them gets the new price straight from Redis.' }
      ],
      html: growLayout(o)
    });
  };

  /* ---------- Chapter 6: what a TTL costs, for one hot key and for many ---------- */

  W['ttl-tradeoff'] = function (el) {
    var WHAT = [
      { value: 'home', label: 'Home page', keys: 1, rate: 500, q: 100 },
      { value: 'products', label: '10,000 products', keys: 10000, rate: 5000, q: 9 }
    ];
    var TTLS = [{ value: '10', label: '10 s' }, { value: '60', label: '1 min' }, { value: '300', label: '5 min' }, { value: '3600', label: '1 hour' }];
    var st = { what: 'home', ttl: '300', inval: false };
    var AS_WORD = { 10: '10-second', 60: '1-minute', 300: '5-minute', 3600: '1-hour' };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><span class="lbl">What’s cached</span><span class="cores tt-what"></span></div>' +
        '<div class="w-field"><span class="lbl">TTL</span><span class="cores tt-ttl"></span></div>' +
        '<label class="ql-check"><input type="checkbox" id="ttInv"> Also delete the keys whenever the data changes</label>' +
      '</div>' +
      '<div class="tiles tiles-3" aria-live="polite">' +
        '<div class="tile"><span>Hit rate</span><b data-o="hit"></b><small data-o="hitwhy"></small></div>' +
        '<div class="tile"><span>Database queries a second</span><b data-o="db"></b><small data-o="dbwhy"></small></div>' +
        '<div class="tile key"><span>A wrong price can show for</span><b data-o="stale"></b><small data-o="stalewhy"></small></div>' +
      '</div>' +
      '<p class="calc-math" data-o="say"></p>';
    el.querySelector('.tt-what').appendChild(segmented('What’s cached', WHAT, st.what, function (v) { st.what = v; draw(); }));
    el.querySelector('.tt-ttl').appendChild(segmented('TTL', TTLS, st.ttl, function (v) { st.ttl = v; draw(); }));
    el.querySelector('#ttInv').addEventListener('change', function (e) { st.inval = e.target.checked; draw(); });
    function o(n) { return el.querySelector('[data-o="' + n + '"]'); }
    function pct(f) {
      var p = f * 100, d = p >= 99.9 ? 3 : p >= 99 ? 2 : 1, k = Math.pow(10, d);
      return (Math.floor(p * k) / k).toFixed(d) + '%';
    }

    function draw() {
      var w = WHAT.filter(function (x) { return x.value === st.what; })[0], ttl = +st.ttl;
      var perKey = w.rate / w.keys;                       /* requests a second for each key */
      /* After a copy expires, the next request misses; then the copy lives for one TTL.
         So each key misses once every (TTL + time to its next request). */
      var hit = perKey * ttl / (perKey * ttl + 1);
      var dbq = w.rate * (1 - hit) * w.q, without = w.rate * w.q;
      o('hit').textContent = pct(hit);
      o('hitwhy').textContent = fmtNum(perKey) + ' request' + (perKey === 1 ? '' : 's') + ' a second for each key';
      o('db').textContent = dbq >= 100 ? fmtInt(dbq) : fmtNum(dbq);
      o('dbwhy').textContent = 'instead of ' + fmtInt(without) + ' without the cache';
      o('stale').textContent = st.inval ? 'about a second' : fmtHuman(ttl);
      o('stalewhy').textContent = st.inval ? 'deleted on change; the TTL is a safety net' : 'until the copy expires';

      var say;
      if (w.keys === 1) {
        say = 'The home page is asked for 500 times a second, so even a 10-second copy is used thousands of times before it expires. ' +
          'The TTL barely changes the database’s load: <b>' + o('db').textContent + ' queries a second</b> instead of 50,000. What it does decide is how long a wrong price can stay up.';
      } else {
        say = 'Each product page is asked for only about once every 2 seconds. With a ' + AS_WORD[ttl] + ' TTL, ' + ((1 - hit) * 100).toFixed(1) + '%' +
          ' of visits arrive after their copy has expired, and the database still runs <b>' + o('db').textContent + ' queries a second</b>. ' +
          'Longer TTLs cut the load, but leave old prices up for longer.';
      }
      if (st.inval) say += ' Deleting keys when the data changes keeps prices right within about a second, so the TTL can stay long and the database stays quiet.';
      o('say').innerHTML = say;
    }
    draw();
  };

  /* ---------- Chapter 6: the Tomazon home page, and where its 100 queries come from ---------- */

  W['home-queries'] = function (el) {
    /* Each section runs a few queries of its own, then 3 lookups (price, stock, rating) per product it shows. */
    var SECS = [
      { id: 'header', name: 'Header and category menu', lists: ['SELECT id, name FROM categories WHERE in_menu'], products: 0 },
      { id: 'banners', name: 'Sale banners', lists: ['SELECT * FROM banners WHERE live_now', 'SELECT * FROM campaigns WHERE id = ANY($1)'], products: 0 },
      { id: 'deals', name: 'Today’s deals', lists: ['SELECT product_id FROM deals WHERE day = today() LIMIT 8'], products: 8 },
      { id: 'tr1', name: 'Trending in Electronics', lists: ['SELECT product_id FROM trending WHERE category = \'electronics\' LIMIT 6'], products: 6 },
      { id: 'tr2', name: 'Trending in Home & Kitchen', lists: ['SELECT product_id FROM trending WHERE category = \'home\' LIMIT 6'], products: 6 },
      { id: 'tr3', name: 'Trending in Fashion', lists: ['SELECT product_id FROM trending WHERE category = \'fashion\' LIMIT 6'], products: 6 },
      { id: 'new', name: 'New arrivals', lists: ['SELECT id FROM products ORDER BY created_at DESC LIMIT 4'], products: 4 },
      { id: 'brands', name: 'Top brands', lists: ['SELECT name, logo FROM brands WHERE featured'], products: 0 },
      { id: 'footer', name: 'Footer', lists: ['SELECT * FROM site_links WHERE area = \'footer\''], products: 0 }
    ];
    var LOOKUPS = [
      ['SELECT price FROM prices WHERE product_id = $1', 'SELECT product_id, price FROM prices WHERE product_id = ANY($1)'],
      ['SELECT qty FROM stock WHERE product_id = $1', 'SELECT product_id, qty FROM stock WHERE product_id = ANY($1)'],
      ['SELECT avg(stars), count(*) FROM reviews WHERE product_id = $1', 'SELECT product_id, avg(stars), count(*) FROM reviews WHERE product_id = ANY($1) GROUP BY product_id']
    ];
    var st = { sel: 'deals', batch: false };
    function lookups(s) { return s.products ? (st.batch ? 3 : 3 * s.products) : 0; }
    function count(s) { return s.lists.length + lookups(s); }
    function repeat(html, n) { var out = ''; for (var i = 0; i < n; i++) out += html; return out; }
    var CARD = '<span class="hq-card"><i class="hq-img"></i><i class="hq-l hq-price"></i><i class="hq-l hq-stock"></i><i class="hq-l hq-rate"></i></span>';
    function sec(id, inner) {
      return '<div class="hq-sec" data-sec="' + id + '" tabindex="0" role="button"><b class="hq-badge"></b>' + inner + '</div>';
    }
    function shelf(id, title, n) { return sec(id, '<p class="hq-h">' + title + '</p><div class="hq-row r' + n + '">' + repeat(CARD, n) + '</div>'); }

    el.innerHTML =
      '<div class="hq">' +
        '<div class="hq-page" aria-label="A sketch of Tomazon’s home page">' +
          '<div class="hq-chrome"><i></i><i></i><i></i><span>tomazon.com</span></div>' +
          sec('header', '<div class="hq-top"><b class="hq-logo">tomazon</b><span class="hq-search">Search Tomazon</span><span class="hq-cart">Cart</span></div>' +
            '<div class="hq-menu">' + ['Electronics', 'Home &amp; Kitchen', 'Fashion', 'Grocery', 'Books', 'Toys'].map(function (c) { return '<span>' + c + '</span>'; }).join('') + '</div>') +
          sec('banners', '<div class="hq-hero"><b>The 8 p.m. sale</b><span>Up to 60% off, tonight only</span></div>') +
          shelf('deals', 'Today’s deals', 8) +
          shelf('tr1', 'Trending in Electronics', 6) +
          shelf('tr2', 'Trending in Home &amp; Kitchen', 6) +
          shelf('tr3', 'Trending in Fashion', 6) +
          shelf('new', 'New arrivals', 4) +
          sec('brands', '<p class="hq-h">Top brands</p><div class="hq-brands">' + repeat('<i></i>', 6) + '</div>') +
          sec('footer', '<div class="hq-foot">' + repeat('<i></i>', 4) + '</div>') +
        '</div>' +
        '<div class="hq-side">' +
          '<div class="hq-total"><b class="hq-num"></b><span>queries for one home page</span></div>' +
          '<div class="hq-bar"><i class="lst"></i><i class="look"></i></div>' +
          '<p class="kl-key hq-key"><span><i class="hq-k-list"></i>lists and page parts</span><span><i class="hq-k-look"></i>price, stock and rating, per product</span></p>' +
          '<label class="ql-check"><input type="checkbox" class="hq-batch"> Batch the per-product lookups (page 3.3)</label>' +
          '<ol class="hq-list"></ol>' +
          '<figure class="hq-q"><figcaption></figcaption><pre></pre></figure>' +
        '</div>' +
      '</div>' +
      '<p class="readout" aria-live="polite"></p>';

    var list = el.querySelector('.hq-list');
    list.innerHTML = SECS.map(function (s) {
      return '<li><button type="button" data-sec="' + s.id + '"><span>' + s.name + '</span><b></b></button></li>';
    }).join('');

    function draw() {
      var total = 0, listed = 0;
      SECS.forEach(function (s) {
        var n = count(s);
        total += n; listed += s.lists.length;
        el.querySelector('.hq-sec[data-sec="' + s.id + '"] .hq-badge').textContent = n;
        list.querySelector('[data-sec="' + s.id + '"] b').textContent = n;
      });
      el.querySelector('.hq-num').textContent = total;
      el.querySelector('.hq-bar .lst').style.width = listed + '%';
      el.querySelector('.hq-bar .look').style.width = (total - listed) + '%';
      el.querySelectorAll('[data-sec]').forEach(function (n) {
        var on = n.getAttribute('data-sec') === st.sel;
        n.classList.toggle('on', on);
        n.setAttribute('aria-pressed', on ? 'true' : 'false');
      });

      var s = SECS.filter(function (x) { return x.id === st.sel; })[0], lines = '';
      s.lists.forEach(function (q) { lines += '<span class="c">×1  </span><span class="o">' + esc(q) + '</span>\n'; });
      if (s.products) {
        LOOKUPS.forEach(function (q) {
          lines += '<span class="c">×' + (st.batch ? 1 : s.products) + '  </span><span class="o">' + esc(q[st.batch ? 1 : 0]) + '</span>\n';
        });
      }
      el.querySelector('.hq-q figcaption').textContent = s.name + ': ' + count(s) + ' quer' + (count(s) === 1 ? 'y' : 'ies') +
        (s.products ? (st.batch ? ', with the ' + s.products + ' products’ lookups batched' : ', 3 of them for each of its ' + s.products + ' products') : '');
      el.querySelector('.hq-q pre').innerHTML = lines.replace(/\n$/, '');

      el.querySelector('.readout').innerHTML = st.batch
        ? '<strong>Batched, it’s ' + total + ' queries,</strong> about a quarter of a second. Better, but during the sale that’s still 500 × ' + total + ' = ' + fmtInt(500 * total) +
          ' queries a second, for a page that’s the same for every shopper.'
        : '<strong>' + (total - listed) + ' of the ' + total + ' queries</strong> are the same three lookups, a price, a stock level and a rating, asked one product at a time for the 30 products on the page: the N+1 pattern from page 3.3. At about 10 ms each, in a row, they add up to about a second.';
    }

    function pick(e) {
      var t = e.target.closest('[data-sec]');
      if (!t) return;
      st.sel = t.getAttribute('data-sec');
      draw();
    }
    el.addEventListener('click', pick);
    el.addEventListener('keydown', function (e) {
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('hq-sec')) { e.preventDefault(); pick(e); }
    });
    el.querySelector('.hq-batch').addEventListener('change', function (e) { st.batch = e.target.checked; draw(); });
    draw();
  };

  /* ---------- Chapter 7: the strangler fig, one rollout stage at a time ---------- */

  W['strangler-arch'] = function (el) {
    var node = archNode, st = { stage: 'off' };
    var STAGES = [
      { value: 'off', label: 'Before' },
      { value: 'staff', label: 'Staff only' },
      { value: 'ten', label: '10% of shoppers' },
      { value: 'all', label: 'Everyone' },
      { value: 'done', label: 'Old code deleted' }
    ];
    /* Requests as runs of wires: browsing through the core or the catalogue, and a member of staff browsing. */
    var CORE = [['in', 0], ['core', 0], ['cd', 0], ['cd', 1], ['core', 1], ['in', 1]],
        CAT = [['in', 0], ['cat', 0], ['ad', 0], ['ad', 1], ['cat', 1], ['in', 1]],
        STAFF = [['sin', 0], ['cat', 0], ['ad', 0], ['ad', 1], ['cat', 1], ['sin', 1]];
    var checkout = { on: ['shop', 'lb', 'core', 'data'], run: CORE, t: 'always the core API',
      say: '<strong>A shopper checks out.</strong> <code>/api/orders</code> isn’t one of the catalogue’s paths, so it goes to the core API at every stage.' };
    var S = {
      off: {
        say: '<strong>Before.</strong> The catalogue service is deployed and healthy, but Nginx sends it nothing. Every request still goes to the core API.',
        core: 'every request', cat: 'running, no traffic yet', idle: true, request: CORE,
        steps: [
          { on: ['shop', 'lb', 'core', 'data'], run: CORE, t: 'as before',
            say: '<strong>A shopper opens a product page.</strong> Nginx sends it to the core API, which reads the product tables, exactly as before.' },
          { on: ['cat'], run: [], t: 'ready, but idle',
            say: '<strong>The new service waits.</strong> It runs on its own servers and passes its health checks, but no request reaches it yet.' }
        ]
      },
      staff: {
        say: '<strong>Staff only.</strong> Staff browsers carry the <code>tz_beta=1</code> cookie, so their browsing goes to the catalogue service. Shoppers see no change. The team uses the site, and compares errors and p95 with the core API’s.',
        core: 'every shopper request', cat: 'staff browsing only', request: STAFF.concat(CORE),
        steps: [
          { on: ['staff', 'lb', 'cat', 'data'], run: STAFF, t: 'the cookie decides',
            say: '<strong>A member of staff opens a product page.</strong> Nginx sees the <code>tz_beta</code> cookie and sends the request to the catalogue service, which answers from its Redis cache and asks the core API for anything missing.' },
          { on: ['shop', 'lb', 'core', 'data'], run: CORE, t: 'no cookie: no change',
            say: '<strong>A shopper opens the same page.</strong> No cookie, and no shoppers are in the split yet, so it goes to the core API as before.' }
        ]
      },
      ten: {
        say: '<strong>10% of shoppers.</strong> One line, <code>10% catalogue;</code>, sends one in ten visitors’ browsing to the new service. If its errors or p95 rise, deleting that line rolls it back in seconds.',
        core: '90% of browsing, and carts, orders, payments', cat: '10% of browsing, and staff', request: CAT.concat(CORE),
        steps: [
          { on: ['shop', 'lb', 'cat', 'data'], run: CAT, t: '1 in 10 addresses',
            say: '<strong>A shopper in the 10% browses.</strong> The hash of their address falls in the first 10%, so Nginx sends them to the catalogue service, on every visit.' },
          { on: ['shop', 'lb', 'core', 'data'], run: CORE, t: 'the other 90%',
            say: '<strong>Everyone else browses as before,</strong> on the core API.' },
          checkout
        ]
      },
      all: {
        say: '<strong>Everyone.</strong> All browsing goes to the catalogue service. The old catalogue code is still in the core API, unused, so rolling back is still one line.',
        core: 'carts, orders, payments; old catalogue code unused', cat: 'all browsing', request: CAT.concat(CORE),
        steps: [
          { on: ['shop', 'lb', 'cat', 'data'], run: CAT, t: 'every shopper',
            say: '<strong>Every home page, product page and search</strong> is served by the catalogue service. During a sale, only its servers need to grow.' },
          checkout
        ]
      },
      done: {
        say: '<strong>Old code deleted.</strong> After a couple of weeks without problems, the catalogue code comes out of the core API. The monolith is smaller, and the Shopping squad ships the catalogue on its own.',
        core: 'accounts, carts, orders, payments', cat: 'all browsing, shipped by Shopping', request: CAT.concat(CORE),
        steps: [
          { on: ['shop', 'lb', 'cat', 'data'], run: CAT, t: 'its own code, its own deploys',
            say: '<strong>Browsing</strong> is now only the catalogue service’s job. The Shopping squad deploys it whenever it’s ready, without waiting for the Orders squad.' },
          checkout,
          { on: ['core'], run: [], t: 'and repeat',
            say: '<strong>Then the next service.</strong> The same steps, one part at a time. Each one is reversible until its old code is deleted.' }
        ]
      }
    };

    el.innerHTML = '<div class="w-controls"><span class="sf-stage"></span></div>' +
      '<p class="calc-math sf-say" aria-live="polite"></p><div class="sf-arch arch-scroll"></div>' +
      '<p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    el.querySelector('.sf-stage').appendChild(segmented('Rollout stage', STAGES, st.stage, function (v) { st.stage = v; draw(); }));

    function draw() {
      var s = S[st.stage];
      el.querySelector('.sf-say').innerHTML = s.say;
      /* A fresh element each time, so the previous diagram's animation stops with it. */
      var holder = el.querySelector('.sf-arch');
      holder.innerHTML = '<div class="' + (s.idle ? 'sf-idle' : '') + '"></div>';
      liveArch(holder.firstChild, {
        joints: true,
        wires: [
          ['in', 'shop', 'lb', 'h', ''],
          ['sin', 'staff', 'lb', 'h', ''],
          ['core', 'lb', 'core', 'h', ''],
          ['cat', 'lb', 'cat', 'h', ''],
          ['cd', 'core', 'data', 'h', ''],
          ['ad', 'cat', 'data', 'h', ''],
          ['api', 'core', 'cat', 'v', 'product API']
        ],
        request: s.request,
        steps: s.steps,
        start: 'Step through it',
        back: 'Back to the start',
        idle: 'Press <strong>Step through it</strong> to follow the requests at this stage, or pick another stage above.',
        html:
          '<div class="ar2-left">' +
            node('shop', 'user', 'c-user', 'Shoppers', 'a million of them') +
            node('staff', 'user', 'c-user', 'Staff', 'with the tz_beta cookie') +
          '</div>' +
          '<div class="ar2-region">' +
            '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
            '<div class="sf-grid">' +
              '<div class="sf-lb">' + node('lb', 'proxy', 'c-net', 'Nginx', 'load balancer, routes by path') + '</div>' +
              '<div class="sf-core">' + node('core', 'bolt', 'c-cpu', 'Core API', s.core) + '</div>' +
              '<div class="sf-cat">' + node('cat', 'bolt', 'c-cpu', 'Catalogue service', s.cat) + '</div>' +
              '<div class="sf-data">' + node('data', 'db', 'c-db', 'PostgreSQL and Redis', 'the core’s database; the catalogue’s cache') + '</div>' +
            '</div>' +
          '</div>'
      });
    }
    draw();
  };

  /* ---------- Chapter 8: the same price changes through LISTEN/NOTIFY and through a Kafka topic ---------- */

  W['kafka-log'] = function (el) {
    var SHOW = 12, PRODUCTS = [1042, 2210, 377, 5120, 918, 4410, 1311, 2875];
    var MODES = [{ value: 'notify', label: 'LISTEN/NOTIFY' }, { value: 'kafka', label: 'A Kafka topic' }];
    var st = { mode: 'notify' }, timer = null;

    el.innerHTML =
      '<div class="w-controls"><span class="kl-mode"></span></div>' +
      '<div class="kl"></div>' +
      '<p class="kl-key"><span><i class="kl-done"></i>handled</span><span class="k-wait"><i class="kl-wait"></i>waiting in the topic</span><span class="k-miss"><i class="kl-miss"></i>lost</span></p>' +
      '<div class="pt-controls">' +
        '<button type="button" class="btn-sm" data-act="change">Change a price</button>' +
        '<button type="button" class="btn-sm" data-act="stop"></button>' +
        '<button type="button" class="btn-sm" data-act="add"></button>' +
        '<button type="button" class="btn-sm quiet" data-act="reset">Start again</button>' +
      '</div>' +
      '<p class="readout" aria-live="polite"></p>';
    el.querySelector('.kl-mode').appendChild(segmented('How changes travel', MODES, st.mode, function (v) { st.mode = v; fresh(); }));

    function fresh() {
      st.msgs = [];
      st.inv = { on: true, pos: 0, cells: {} };
      st.search = null;
      for (var i = 0; i < 4; i++) { append(); st.inv.cells[i] = 'done'; }
      st.inv.pos = st.msgs.length;
      st.say = 'Each square is one price change. Stop the invalidator, change a few prices, then start it again. ' +
        (st.mode === 'notify' ? 'Then switch to <strong>A Kafka topic</strong> and do the same.' : 'Then add a search indexer.');
      render();
    }
    function append() {
      var off = st.msgs.length;
      st.msgs.push({ off: off, pid: PRODUCTS[off % PRODUCTS.length] });
      return off;
    }
    function groups() { return st.search ? [st.inv, st.search] : [st.inv]; }
    function status(g, off) {
      if (st.mode === 'kafka') return off < g.pos ? 'done' : 'wait';
      return g.cells[off] || 'na';
    }
    function missed(g) {
      return st.msgs.filter(function (m) { return g.cells[m.off] === 'miss'; }).length;
    }
    /* Kafka mode: a running consumer reads one message per tick until it has caught up. */
    function tick() {
      if (!el.isConnected) { clearInterval(timer); return; }
      if (st.mode !== 'kafka') return;
      var moved = false;
      groups().forEach(function (g) {
        if (g.on && g.pos < st.msgs.length) { g.pos = reduceMotion ? st.msgs.length : g.pos + 1; moved = true; }
      });
      if (moved) render();
    }

    function render() {
      var from = Math.max(0, st.msgs.length - SHOW), shown = st.msgs.slice(from), pad = '';
      for (var i = shown.length; i < SHOW; i++) pad += '<i class="kl-empty"></i>';
      function row(name, note, cells) {
        return '<div class="kl-row"><p class="kl-name"><b>' + name + '</b><span>' + note + '</span></p><div class="kl-cells">' + cells + pad + '</div></div>';
      }
      function groupRow(g, name) {
        var note;
        if (st.mode === 'kafka') {
          var lag = st.msgs.length - g.pos;
          note = (g.on ? 'running' : 'stopped') + ' · next offset ' + g.pos + ' · ' + (lag ? 'lag ' + lag : 'up to date');
        } else {
          var m = missed(g);
          note = (g.on ? 'listening' : 'not listening') + (m ? ' · missed ' + m + ', gone for good' : '');
        }
        return row(name, note, shown.map(function (msg) { return '<i class="kl-' + status(g, msg.off) + '"></i>'; }).join(''));
      }
      var topic = shown.map(function (m) {
        return '<i class="kl-msg" title="Offset ' + m.off + ': product ' + m.pid + '’s price changed">' + m.off + '</i>';
      }).join('');
      el.querySelector('.kl').className = 'kl ' + st.mode;
      el.querySelector('.kl').innerHTML =
        row(st.mode === 'kafka' ? 'tomazon.public.products' : 'Price changes', st.mode === 'kafka' ? 'a topic: every change kept for 7 days' : 'NOTIFY sends each one once, and keeps nothing', topic) +
        groupRow(st.inv, 'Cache invalidator') +
        (st.search ? groupRow(st.search, 'Search indexer') : '');
      el.querySelector('[data-act="stop"]').textContent = st.inv.on ? 'Stop the invalidator' : 'Start the invalidator';
      var add = el.querySelector('[data-act="add"]');
      add.textContent = st.search ? 'Search indexer added' : 'Add a search indexer';
      add.disabled = !!st.search;
      el.querySelector('.readout').innerHTML = st.say;
    }

    el.querySelector('.pt-controls').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      var act = b.getAttribute('data-act'), inv = st.inv, kafka = st.mode === 'kafka';
      if (act === 'reset') { fresh(); return; }
      if (act === 'change') {
        var off = append(), lag = st.msgs.length - inv.pos;
        if (!kafka) groups().forEach(function (g) { g.cells[off] = g.on ? 'done' : 'miss'; });
        if (kafka) st.say = inv.on
          ? '<strong>Appended, and read.</strong> The change is written to the end of the topic as offset ' + off + '. The invalidator reads it and moves on, and the message stays in the topic.'
          : '<strong>Kept.</strong> The change is appended as offset ' + off + '. The invalidator is stopped, so its lag grows to ' + lag + '. Nothing is lost: the messages wait in the topic.';
        else st.say = inv.on
          ? '<strong>Delivered.</strong> PostgreSQL sends the notification to every session listening right now, and the invalidator deletes the cached page.'
          : '<strong>Lost.</strong> Nobody is listening, so PostgreSQL drops the notification. Product ' + st.msgs[off].pid + '’s old page stays in Redis until its TTL runs out, and nothing records that it was missed.';
      } else if (act === 'stop') {
        inv.on = !inv.on;
        if (!inv.on) st.say = kafka
          ? '<strong>The invalidator stops.</strong> Its position stays in Kafka: it will carry on from offset ' + inv.pos + '. Now change a price.'
          : '<strong>The invalidator stops listening,</strong> and nothing else notices. Now change a price.';
        else if (kafka) {
          var behind = st.msgs.length - inv.pos;
          st.say = behind
            ? '<strong>Catching up.</strong> The invalidator starts again from offset ' + inv.pos + ', and works through the ' + behind + ' change' + (behind > 1 ? 's' : '') + ' it missed, oldest first.'
            : '<strong>Running again.</strong> Nothing changed while it was stopped, so there’s nothing to catch up on.';
        } else {
          var gone = missed(inv);
          st.say = gone
            ? '<strong>Listening again,</strong> but only to changes from now on. The ' + gone + ' it missed are gone, and it can’t even tell which products they were.'
            : '<strong>Listening again.</strong> Nothing changed while it was stopped, so this time nothing was lost.';
        }
      } else if (act === 'add') {
        st.search = { on: true, pos: 0, cells: {} };
        st.say = kafka
          ? '<strong>A new reader, with the history.</strong> The search indexer is a new consumer group. It starts at the oldest message still kept, offset 0, and reads every change, without slowing the invalidator.'
          : '<strong>A new listener hears only the future.</strong> Everything before it started is gone. To fill its index, it would have to read every product from the tables.';
      }
      render();
    });

    fresh();
    timer = setInterval(tick, 650);
  };

  /* ---------- Chapter 8: the parts of Kafka in one picture: producer, topic, partitions, groups ---------- */

  W['kafka-anatomy'] = function (el) {
    var PARTS = 3, SHOW = 8, MAX_COPIES = 4;
    var KEYS = [1042, 2210, 377, 5120, 918, 4410];                 /* product ids, in the order they change */
    var HOME = { 1042: 0, 2210: 1, 377: 2, 5120: 0, 918: 1, 4410: 2 };   /* where each key hashes to */
    var TERMS = [
      { value: 'producer', label: 'Producer', say: 'A <strong>producer</strong> writes messages to a topic. Here it’s Debezium, publishing every product change.' },
      { value: 'topic', label: 'Topic', say: 'A <strong>topic</strong> is a named stream of messages: here, every change to a product.' },
      { value: 'partition', label: 'Partition', say: 'A topic is split into <strong>partitions</strong>. Each one is an ordered list that only grows at the end, and they can be read in parallel.' },
      { value: 'key', label: 'Key', say: 'Every message has a <strong>key</strong>, here the product id. The same key always goes to the same partition, so one product’s changes stay in order. The colours show the keys.' },
      { value: 'offset', label: 'Offset', say: 'A message’s <strong>offset</strong> is its position in its partition: 0, 1, 2 and so on. The markers show the offset each group will read next.' },
      { value: 'group', label: 'Consumer group', say: 'A <strong>consumer group</strong> is one reader, under one name. Every group gets every message, at its own pace, and keeps its own offsets.' },
      { value: 'consumer', label: 'Consumer', say: 'A <strong>consumer</strong> is one running copy inside a group. Kafka gives each partition to one copy of the group, so the copies share the work.' },
      { value: 'broker', label: 'Broker', say: 'A <strong>broker</strong> is one Kafka server. Each partition has a leader on one broker, which takes its writes, and copies on two others.' }
    ];
    var st;

    el.innerHTML =
      '<div class="w-controls"><span class="ka-terms"></span></div>' +
      '<p class="calc-math ka-def" aria-live="polite"></p>' +
      '<div class="ka">' +
        '<div class="ka-prod" data-t="producer"><p class="ka-h">Producer</p><b>Debezium</b><span>publishes each product change, keyed by product id</span></div>' +
        '<div class="ka-arrow" aria-hidden="true">→</div>' +
        '<div class="ka-topic" data-t="topic"><p class="ka-h">Topic: tomazon.public.products</p><div class="ka-parts"></div>' +
          '<p class="ka-legend"><span><i class="ka-ptr g0"></i>cache invalidator reads next</span><span><i class="ka-ptr g1"></i>search indexer reads next</span></p></div>' +
        '<div class="ka-arrow" aria-hidden="true">→</div>' +
        '<div class="ka-groups"></div>' +
      '</div>' +
      '<div class="pt-controls">' +
        '<button type="button" class="btn-sm" data-act="produce">Produce a message</button>' +
        '<button type="button" class="btn-sm" data-act="copy">Add an invalidator copy</button>' +
        '<button type="button" class="btn-sm quiet" data-act="reset">Start again</button>' +
      '</div>' +
      '<p class="readout" aria-live="polite"></p>';
    el.querySelector('.ka-terms').appendChild(segmented('Kafka terms', TERMS, 'topic', function (v) { st.term = v; render(); }));

    function owner(p, copies) { return Math.floor(p * copies / PARTS); }   /* which copy of a group reads partition p */
    function fresh() {
      st = { term: st ? st.term : 'topic', parts: [[], [], []], n: 0, groups: [
        { name: 'cache-invalidator', label: 'cache invalidator', copies: 2, next: [0, 0, 0], delay: 500 },
        { name: 'search-indexer', label: 'search indexer', copies: 1, next: [0, 0, 0], delay: 1300 }
      ], say: 'Each square is one message, coloured by its key. Pick a term above to see where it is, then produce a few messages.' };
      for (var i = 0; i < 5; i++) append();
      st.groups.forEach(function (g) { g.next = st.parts.map(function (p) { return p.length; }); });
      render();
    }
    function append() {
      var key = KEYS[st.n % KEYS.length], p = HOME[key];
      st.n++;
      st.parts[p].push({ off: st.parts[p].length, key: key });
      return { p: p, key: key, off: st.parts[p].length - 1 };
    }

    function render() {
      var t = st.term;
      el.querySelector('.ka-def').innerHTML = TERMS.filter(function (x) { return x.value === t; })[0].say;
      el.querySelector('.ka-parts').innerHTML = st.parts.map(function (msgs, p) {
        var from = Math.max(0, msgs.length - (SHOW - 1)), cells = '', ptrs = '';
        for (var i = 0; i < SHOW; i++) {
          var m = msgs[from + i];
          cells += m ? '<i class="ka-msg k' + KEYS.indexOf(m.key) + '" title="Product ' + m.key + ', offset ' + m.off + '">' + m.off + '</i>' : '<i class="ka-empty"></i>';
        }
        st.groups.forEach(function (g, gi) {
          var at = g.next[p] - from;
          if (at >= 0 && at < SHOW) ptrs += '<i class="ka-ptr g' + gi + '" style="left:calc(' + at + ' * 100% / ' + SHOW + ')" title="' + g.label + ' reads offset ' + g.next[p] + ' next"></i>';
        });
        return '<div class="ka-part" data-t="partition"><p class="ka-pl"><b>Partition ' + p + '</b><span data-t="broker">leader on broker ' + (p + 1) + '</span></p>' +
          '<div class="ka-strip"><div class="ka-cells">' + cells + '</div><div class="ka-ptrs">' + ptrs + '</div></div></div>';
      }).join('');
      el.querySelector('.ka-groups').innerHTML = st.groups.map(function (g, gi) {
        var copies = '';
        for (var c = 0; c < g.copies; c++) {
          var mine = [];
          for (var p = 0; p < PARTS; p++) if (owner(p, g.copies) === c) mine.push(p);
          copies += '<div class="ka-copy' + (mine.length ? '' : ' idle') + '" data-t="consumer"><b>Copy ' + (c + 1) + '</b><span>' +
            (mine.length ? 'reads partition' + (mine.length > 1 ? 's ' : ' ') + (mine.length > 2 ? mine.slice(0, -1).join(', ') + ' and ' + mine[mine.length - 1] : mine.join(' and ')) : 'idle: no partition left') + '</span></div>';
        }
        return '<div class="ka-group g' + gi + '" data-t="group"><p class="ka-h">Consumer group</p><b class="ka-gname">' + g.name + '</b>' + copies + '</div>';
      }).join('');
      el.querySelectorAll('.ka [data-t]').forEach(function (n) { n.classList.toggle('hl', n.getAttribute('data-t') === t); });
      el.querySelector('.ka').className = 'ka show-' + t;
      el.querySelector('[data-act="copy"]').disabled = st.groups[0].copies >= MAX_COPIES;
      el.querySelector('.readout').innerHTML = st.say;
    }

    el.querySelector('.pt-controls').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      var act = b.getAttribute('data-act');
      if (act === 'reset') { fresh(); return; }
      if (act === 'produce') {
        var m = append();
        st.say = '<strong>Product ' + m.key + ' changed.</strong> Its key always goes to partition ' + m.p + ', so the message is added to the end of that partition as offset ' + m.off +
          '. Each group reads it when it gets there: the cache invalidator quickly, the search indexer a little later.';
        st.groups.forEach(function (g) {
          setTimeout(function () {
            if (!el.isConnected || g.next[m.p] > m.off) return;
            g.next[m.p] = m.off + 1;
            render();
          }, reduceMotion ? 0 : g.delay);
        });
      } else if (act === 'copy') {
        var g = st.groups[0];
        g.copies++;
        st.say = g.copies <= PARTS
          ? '<strong>Copy ' + g.copies + ' joins the cache invalidator.</strong> Kafka shares the partitions out again, so each copy has less to read.'
          : '<strong>Copy ' + g.copies + ' has nothing to do.</strong> There are only ' + PARTS + ' partitions, and each is read by one copy of the group. Partitions limit how many copies can share the work.';
      }
      render();
    });

    fresh();
  };

  /* ---------- Chapter 8: change data capture, from the WAL to Redis and search ---------- */

  W['cdc-arch'] = function (el) {
    var node = archNode;
    liveArch(el, {
      joints: true,
      wires: [
        ['in', 'staff', 'app', 'h', ''],
        ['w', 'app', 'primary', 'h', ''],
        ['slot', 'primary', 'dbz', 'h', 'WAL', true],
        ['pub', 'dbz', 'kafka', 'v', ''],
        ['sub', 'inv', 'kafka', 'h', ''],
        ['del', 'redis', 'inv', 'h', 'DEL'],
        ['six', 'idx', 'kafka', 'h', ''],
        ['put', 'search', 'idx', 'h', '']
      ],
      request: [['in', 0], ['w', 0], ['w', 1], ['in', 1], ['slot', 0], ['pub', 0], ['sub', 1], ['del', 1], ['six', 1], ['put', 1]],
      start: 'Follow a price change',
      idle: 'A price change, from the database to everything that needs it. Press <strong>Follow a price change</strong> to go through it step by step.',
      steps: [
        { on: ['staff', 'app', 'primary'], run: [['in', 0], ['w', 0], ['w', 1], ['in', 1]], t: 'one write, nothing else',
          say: '<strong>Staff change a price.</strong> The core API updates the products table on the primary, and commits. It doesn’t know Kafka exists.' },
        { on: ['primary', 'dbz'], run: [['slot', 0]], t: 'milliseconds after the commit',
          say: '<strong>Debezium reads the WAL.</strong> The committed change is in the WAL, and Debezium streams it through its replication slot, much as a replica would. The slot remembers how far Debezium has read.' },
        { on: ['dbz', 'kafka'], run: [['pub', 0]], t: 'copied to 3 brokers',
          say: '<strong>Publish it.</strong> Debezium turns the change into a message keyed by the product’s id, and sends it to <code>tomazon.public.products</code>. Kafka confirms it only when its in-sync copies, at least 2 of 3 in different zones, have it.' },
        { on: ['kafka', 'inv', 'redis'], run: [['sub', 1], ['del', 1]], t: 'then commit the offset',
          say: '<strong>The cache invalidator acts on it.</strong> One of its two copies reads the message, deletes <code>home:v1</code> and the product’s key in Redis, and only then commits its offset.' },
        { on: ['kafka', 'idx', 'search'], run: [['six', 1], ['put', 1]], t: 'the same message, independently',
          say: '<strong>Search reads it too.</strong> The search indexer is a separate consumer group with its own offset. It reads the same message and updates the product in OpenSearch, at its own pace.' },
        { on: ['inv', 'kafka'], run: [], t: 'nothing is skipped',
          say: '<strong>If an invalidator crashes,</strong> Kafka hands its partitions to the other copy within the session timeout. That copy carries on from the last committed offset, so a few messages may be handled twice, but none are skipped.' }
      ],
      html:
        '<div class="ar2-left">' + node('staff', 'user', 'c-user', 'Staff', 'change a price') + '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
          '<div class="c8-grid">' +
            '<div class="c8-app">' + node('app', 'bolt', 'c-cpu', 'Core API', 'writes to PostgreSQL only') + '</div>' +
            '<div class="c8-primary">' + node('primary', 'db', 'c-db', 'Primary', 'wal_level = logical') + '</div>' +
            '<div class="c8-dbz">' + node('dbz', 'bolt', 'c-sw', 'Debezium', 'on Kafka Connect') + '</div>' +
            '<div class="c8-redis">' + node('redis', 'cache', 'c-db', 'Redis', 'cached pages') + '</div>' +
            '<div class="c8-inv">' + node('inv', 'bolt', 'c-sw', 'Cache invalidator', '2 copies, one consumer group') + '</div>' +
            '<div class="c8-kafka">' + node('kafka', 'log', 'c-sto', 'Kafka', '3 brokers, one per zone') + '</div>' +
            '<div class="c8-search">' + node('search', 'search', 'c-db', 'OpenSearch', 'the search index') + '</div>' +
            '<div class="c8-idx">' + node('idx', 'bolt', 'c-sw', 'Search indexer', 'its own consumer group') + '</div>' +
          '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 9: a product page's photos, from Mumbai or from an edge in the shopper's city ---------- */

  W['edge-latency'] = function (el) {
    var CITIES = [
      { value: 'blr', label: 'Bangalore', rtt: 20 },
      { value: 'dxb', label: 'Dubai', rtt: 35 },
      { value: 'sin', label: 'Singapore', rtt: 60 },
      { value: 'lon', label: 'London', rtt: 120 },
      { value: 'nyc', label: 'New York', rtt: 200 }
    ];
    var SIZES = [{ value: '1000', label: 'Five 200 KB JPEGs: 1 MB' }, { value: '140', label: 'Right-sized WebP: 140 KB' }];
    var EDGE = 10, WINDOW = 14.6;   /* ms to an edge in the shopper's own city; KB in TCP's first window of 10 packets */
    var st = { city: 'nyc', size: '1000' };

    el.innerHTML = '<div class="w-controls el-controls"><span class="el-city"></span><span class="el-size"></span></div>' +
      legend([['conn', 'Connecting: TCP and TLS'], ['net', 'Sending the photos'], ['dbw', 'The edge fetching from Mumbai']]) +
      '<div class="wf el-rows"></div><p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">A model that counts round trips only: a fast connection, and HTTP/2 sending all five photos over one connection. Real pages also wait for DNS, the HTML and the shopper’s own bandwidth.</p>';
    var wf = el.querySelector('.wf'), out = el.querySelector('.readout');
    el.querySelector('.el-city').appendChild(segmented('Where the shopper is', CITIES, st.city, function (v) { st.city = v; draw(); }));
    el.querySelector('.el-size').appendChild(segmented('Photos on the page', SIZES, st.size, function (v) { st.size = v; draw(); }));

    /* TCP's slow start: the first round trip carries about 14.6 KB, and each one after it twice as much. */
    function rounds(kb) { return Math.ceil(Math.log2(kb / WINDOW + 1)); }
    function t(ms) { return ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : Math.round(ms) + ' ms'; }

    function draw() {
      var city = CITIES.filter(function (c) { return c.value === st.city; })[0], r = city.rtt, n = rounds(+st.size);
      var rows = [
        { name: 'From Mumbai', segs: [['conn', 'TCP and TLS', 2 * r], ['net', n + ' round trips of photos', n * r]] },
        { name: 'Edge: a hit', segs: [['conn', 'TCP and TLS', 2 * EDGE], ['net', n + ' round trips of photos', n * EDGE]] },
        { name: 'Edge: a miss', segs: [['conn', 'TCP and TLS', 2 * EDGE], ['dbw', 'one trip to Mumbai', r], ['net', n + ' round trips of photos', n * EDGE]] }
      ];
      var totals = rows.map(function (row) { return row.segs.reduce(function (a, s) { return a + s[2]; }, 0); });
      var max = Math.max.apply(null, totals), html = '';
      rows.forEach(function (row, i) {
        var at = 0, cells = '';
        row.segs.forEach(function (s) {
          cells += '<span class="wf-seg ' + s[0] + '" style="left:' + (at / max * 100) + '%;width:' + (s[2] / max * 100) + '%" tabindex="0" data-tip="<b>' +
            esc(s[1]) + '</b><br>' + t(s[2]) + '" aria-label="' + esc(s[1]) + ', ' + t(s[2]) + '"><span class="seg-label">' + esc(s[1]) + '</span></span>';
          at += s[2];
        });
        html += '<div class="wf-row"><span class="wf-name">' + row.name + '</span><span class="wf-track">' + cells + '</span><span class="wf-total">' + t(totals[i]) + '</span></div>';
      });
      wf.innerHTML = html;
      fitLabels(wf);
      var say = 'From ' + city.label + ', Mumbai is about <strong>' + r + ' ms</strong> away, and the photos need ' + (n + 2) + ' round trips: 2 to connect, and ' + n +
        ' while TCP’s slow start opens up. That’s <strong>' + t(totals[0]) + '</strong> from Mumbai, and <strong>' + t(totals[1]) + '</strong> from an edge in the same city. ';
      say += r <= 20
        ? 'In India, Mumbai is already close, so the edge saves less; its bigger job here is taking the load off the origin.'
        : 'Even a miss takes only <strong>' + t(totals[2]) + '</strong>: the handshakes and slow start happen over the short hop, and the edge crosses to Mumbai just once.';
      if (st.size === '140') say += ' Smaller photos need ' + n + ' round trips of photos instead of 7, wherever they come from.';
      out.innerHTML = say;
    }
    bindTips(el);
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(wf); }).observe(wf);
  };

  /* ---------- Chapter 9: photos through a CloudFront edge; the API still in Mumbai ---------- */

  W['cdn-arch'] = function (el) {
    var node = archNode;
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      wires: [
        ['in', 'shop', 'edge', 'h', ''],
        ['orig', 'edge', 's3', 'h', ''],
        ['api', 'shop', 'api', 'u', 'the API: no CDN']
      ],
      request: [['in', 0], ['in', 1], ['in', 0], ['orig', 0], ['orig', 1], ['in', 1], ['api', 0], ['api', 1]],
      start: 'Follow a product page',
      idle: 'A shopper in New York opens a product page. Press <strong>Follow a product page</strong> to go through it step by step.',
      steps: [
        { on: ['shop', 'edge'], run: [], t: 'about 10 ms away',
          say: '<strong>Find the nearest edge.</strong> The photo links point at <code>img.tomazon.com</code>, an alias for the CloudFront distribution. CloudFront’s DNS answers with an edge location near the shopper, here in New York, and the TCP and TLS handshakes happen with that edge.' },
        { on: ['shop', 'edge'], run: [['in', 0], ['in', 1]], t: 'a hit: tens of milliseconds',
          say: '<strong>A hit.</strong> The edge already has this photo, because a shopper nearby asked for it earlier. It sends it straight back, and Mumbai isn’t involved at all.' },
        { on: ['shop', 'edge', 's3'], run: [['in', 0], ['orig', 0], ['orig', 1]], t: 'a miss: one trip to Mumbai, about 200 ms',
          say: '<strong>A miss.</strong> Nobody near this edge has asked for this photo lately. The edge asks a regional edge cache, then the S3 bucket in Mumbai, over AWS’s own network and on a connection it keeps open. It keeps a copy for the next shopper.' },
        { on: ['edge', 'shop'], run: [['in', 1]], t: 'still far faster than before',
          say: '<strong>Back to the shopper.</strong> Even a miss crosses to Mumbai only once. The handshakes and TCP’s slow start happened over the short hop to the edge, not across the world.' },
        { on: ['shop', 'api'], run: [['api', 0], ['api', 1]], t: 'about 200 ms a round trip, as before',
          say: '<strong>Prices and the cart still come from Mumbai.</strong> They differ for every shopper and change by the second, so nothing caches them. These calls still cross the world, and they’re most of what’s left of the page’s load time.' }
      ],
      html:
        '<div class="ar2-left">' + node('shop', 'user', 'c-user', 'Shopper', 'in New York') + '</div>' +
        '<div class="c9-grid">' +
          '<div class="c9-edge"><p class="ar2-k">Edge location: New York</p>' +
            node('edge', 'edge', 'c-net', 'CloudFront edge', 'copies of popular photos') +
          '</div>' +
          '<div class="ar2-region"><p class="ar2-k">AWS region: Asia Pacific (Mumbai)</p>' +
            '<div class="c9-mum">' +
              node('s3', 'bucket', 'c-sto', 'S3: tomazon-photos', 'private: only CloudFront reads it') +
              node('api', 'proxy', 'c-net', 'Load balancer and API', 'prices, carts, checkout') +
            '</div>' +
          '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 10: a small cluster that keeps putting itself back as declared ---------- */

  W['k8s-cluster'] = function (el) {
    var SLOTS = 4, STEP = reduceMotion ? 0 : 750, MAX_NODES = 6;
    var APPS = { cat: 'catalogue', core: 'core API', resize: 'resizer', email: 'email sender' };
    var st, busy = false, seq = 0;

    el.innerHTML = '<div class="kc"></div>' +
      '<div class="pt-controls">' +
        '<button type="button" class="btn-sm" data-act="crash">Crash a pod</button>' +
        '<button type="button" class="btn-sm" data-act="node">Lose a node</button>' +
        '<button type="button" class="btn-sm" data-act="deploy">Deploy a new catalogue</button>' +
        '<button type="button" class="btn-sm" data-act="scale">A sale: 8 catalogue pods</button>' +
        '<button type="button" class="btn-sm quiet" data-act="reset">Start again</button>' +
      '</div>' +
      '<p class="readout" aria-live="polite"></p>';

    function pod(app, ver, s) { return { id: ++st.n, app: app, ver: ver, s: s || 'run' }; }
    function fresh() {
      seq++; busy = false;
      st = { nodes: [], pending: [], ver: 41, n: 0 };
      ['a', 'b', 'c'].forEach(function (z, i) { st.nodes.push({ name: 'Node ' + (i + 1), zone: 'ap-south-1' + z, up: true, pods: [] }); });
      [['cat', 0], ['core', 0], ['resize', 0], ['cat', 1], ['core', 1], ['cat', 2], ['core', 2], ['email', 2]].forEach(function (x) {
        st.nodes[x[1]].pods.push(pod(x[0], st.ver));
      });
      st.say = 'Three nodes, one in each zone, each with room for 4 pods. The Deployments ask for 3 catalogue pods, 3 core API pods, a resizer and an email sender. Try each button, and watch Kubernetes put things back the way they were declared.';
      render();
    }
    function all() { var out = []; st.nodes.forEach(function (n) { n.pods.forEach(function (p) { out.push(p); }); }); return out; }
    function nodeOf(p) { for (var i = 0; i < st.nodes.length; i++) if (st.nodes[i].pods.indexOf(p) >= 0) return i; return -1; }
    function sweep() { st.nodes.forEach(function (n) { n.pods = n.pods.filter(function (p) { return p.s !== 'stop'; }); }); }
    /* The scheduler: the working node with the most room. */
    function room() {
      var best = -1;
      st.nodes.forEach(function (n, i) { if (n.up && n.pods.length < SLOTS && (best < 0 || n.pods.length < st.nodes[best].pods.length)) best = i; });
      return best;
    }
    function schedule(p) { var j = room(); if (j < 0) { p.s = 'pend'; st.pending.push(p); } else { p.s = 'start'; st.nodes[j].pods.push(p); } }
    function ready() { all().forEach(function (p) { if (p.s === 'start') p.s = 'run'; }); }
    /* When pods can't fit, the node autoscaler adds nodes for them. */
    function autoscale() {
      return [
        function () {
          if (!st.pending.length) return false;
          st.say = '<strong>No room.</strong> ' + st.pending.length + ' pod' + (st.pending.length > 1 ? 's wait' : ' waits') + ' as <code>Pending</code>. The node autoscaler (Karpenter, on EKS) sees them and starts a new node, which takes about a minute.';
        },
        function () {
          if (!st.pending.length) return false;
          var need = Math.min(Math.ceil(st.pending.length / SLOTS), MAX_NODES - st.nodes.length);
          for (var i = 0; i < need; i++) {
            var k = st.nodes.length;
            st.nodes.push({ name: 'Node ' + (k + 1), zone: 'ap-south-1' + 'abc'[k % 3], up: true, pods: [] });
          }
          var waiting = st.pending; st.pending = [];
          waiting.forEach(schedule);
          st.say = '<strong>The new node joins,</strong> and the scheduler places the waiting pods on it.';
        }
      ];
    }
    function run(steps) {
      busy = true; var my = seq;
      (function next(i) {
        if (my !== seq || !el.isConnected) return;
        if (i >= steps.length) { busy = false; render(); return; }
        if (steps[i]() === false) { next(i + 1); return; }   /* a step with nothing to do is skipped */
        render();
        setTimeout(function () { next(i + 1); }, STEP);
      })(0);
    }

    var ACT = {
      crash: function () {
        var p = all().filter(function (x) { return x.app === 'cat' && x.s === 'run'; })[0];
        if (!p) return;
        var where = st.nodes[nodeOf(p)].name;
        run([
          function () { p.s = 'crash'; st.say = '<strong>A catalogue container exits</strong> on ' + where + '. Its readiness probe fails at once, so the Service stops sending it requests.'; },
          function () { p.s = 'start'; p.restarts = (p.restarts || 0) + 1; st.say = '<strong>The kubelet restarts it,</strong> in the same pod, on the same node, within seconds. Nobody was woken up.'; },
          function () { p.s = 'run'; st.say = '<strong>Ready again.</strong> If it kept crashing, Kubernetes would wait longer before each try, from 10 seconds up to 5 minutes. That’s the <code>CrashLoopBackOff</code> you’ll see in <code>kubectl get pods</code>.'; }
        ]);
      },
      node: function () {
        var ups = st.nodes.filter(function (n) { return n.up; });
        if (ups.length < 2) return;
        var n = ups.reduce(function (a, b) { return b.pods.length > a.pods.length ? b : a; });
        var lost;
        run([
          function () { n.up = false; n.pods.forEach(function (p) { p.s = 'lost'; }); st.say = '<strong>' + n.name + ' stops responding:</strong> its hardware has failed. Its pods are gone with it.'; },
          function () { st.say = '<strong>Within about a minute,</strong> Kubernetes marks the node <code>NotReady</code> and takes its pods out of every Service, so no traffic reaches them. By default it then waits 5 minutes, in case the node comes back.'; },
          function () {
            lost = n.pods; n.pods = [];
            lost.forEach(function (p) { schedule(pod(p.app, p.ver)); });
            st.say = '<strong>Five minutes later,</strong> the Deployments see they’re ' + lost.length + ' pod' + (lost.length > 1 ? 's' : '') + ' short, create replacements, and the scheduler places them on the nodes with room.';
          }
        ].concat(autoscale(), [function () { ready(); st.say = '<strong>Back to what was declared,</strong> with no one awake. Copies of every service on other nodes kept serving the whole time, which is why every service runs at least 2.'; }]));
      },
      deploy: function () {
        var nv = st.ver + 1, olds = all().filter(function (p) { return p.app === 'cat' && p.s === 'run' && p.ver === st.ver; });
        var steps = [function () { st.say = '<strong>Deploy v' + nv + '.</strong> The image tag in the catalogue Deployment changes. Kubernetes replaces the ' + olds.length + ' pods a few at a time: start a new one, wait until it’s ready, then stop an old one.'; }];
        olds.forEach(function (old, k) {
          var nw;
          steps.push(function () {
            sweep();
            nw = pod('cat', nv, 'start');
            var j = room();
            if (j < 0) {   /* no spare room: stop an old pod first */
              j = nodeOf(old); st.nodes[j].pods.splice(st.nodes[j].pods.indexOf(old), 1); old = null;
              st.say = 'No room for an extra pod, so an old one stops first, and v' + nv + ' starts in its place (' + (k + 1) + ' of ' + olds.length + ').';
            } else {
              st.say = 'Starting v' + nv + ' (' + (k + 1) + ' of ' + olds.length + '). It gets no traffic until its readiness probe passes.';
            }
            st.nodes[j].pods.push(nw);
          });
          steps.push(function () {
            nw.s = 'run';
            if (old) old.s = 'stop';
            st.say = 'The new pod is ready and joins the Service. ' + (old ? 'An old one is told to stop: it finishes the requests it has, then exits.' : '');
          });
        });
        steps.push(function () { sweep(); st.ver = nv; st.say = '<strong>Done:</strong> every catalogue pod runs v' + nv + ', and requests never stopped. If v' + nv + ' were bad, <code>kubectl rollout undo deployment/catalogue</code> would roll back the same way.'; });
        run(steps);
      },
      scale: function () {
        var have = all().filter(function (p) { return p.app === 'cat' && p.s !== 'stop' && p.s !== 'lost'; }).length + st.pending.filter(function (p) { return p.app === 'cat'; }).length;
        if (have >= 8) return;
        run([
          function () {
            for (var i = have; i < 8; i++) schedule(pod('cat', st.ver));
            st.say = '<strong>The 8 p.m. sale starts.</strong> Catalogue CPU passes 60%, so the Horizontal Pod Autoscaler raises the Deployment to 8 pods, and the scheduler places them where there’s room.';
          }
        ].concat(autoscale(), [function () { ready(); st.say = '<strong>8 catalogue pods are serving.</strong> After the sale, the autoscaler lowers the count again, and the node autoscaler removes nodes that are left empty.'; }]));
      },
      reset: fresh
    };

    function chip(p) {
      var state = { run: '', start: 'starting', crash: 'crashed', lost: 'lost', stop: 'stopping', pend: 'pending' }[p.s];
      return '<span class="kc-pod k-' + p.app + ' s-' + p.s + '"><b>' + APPS[p.app] + (p.app === 'cat' ? ' v' + p.ver : '') + '</b>' +
        (state ? '<em>' + state + '</em>' : p.restarts ? '<em>restarted ' + p.restarts + '×</em>' : '') + '</span>';
    }
    function render() {
      var nodes = st.nodes.map(function (n) {
        var free = '';
        for (var i = n.pods.length; i < SLOTS; i++) free += '<i class="kc-free"></i>';
        return '<div class="kc-node' + (n.up ? '' : ' down') + '"><p class="kc-head"><b>' + n.name + '</b><span>' + (n.up ? n.zone : 'unreachable') + '</span></p>' +
          n.pods.map(chip).join('') + (n.up ? free : '') + '</div>';
      }).join('');
      var pend = st.pending.length ? '<div class="kc-pending"><p class="kc-head"><b>Pending</b><span>waiting for a node with room</span></p>' + st.pending.map(chip).join('') + '</div>' : '';
      el.querySelector('.kc').innerHTML = '<div class="kc-nodes">' + nodes + '</div>' + pend;
      el.querySelector('.readout').innerHTML = st.say;
      var ups = st.nodes.filter(function (n) { return n.up; }).length;
      var cats = all().filter(function (p) { return p.app === 'cat' && p.s !== 'stop' && p.s !== 'lost'; }).length;
      el.querySelectorAll('[data-act]').forEach(function (b) {
        var a = b.getAttribute('data-act');
        b.disabled = a !== 'reset' && (busy || (a === 'node' && ups < 2) || (a === 'scale' && cats >= 8));
      });
    }
    el.querySelector('.pt-controls').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act]');
      if (!b || b.disabled) return;
      ACT[b.getAttribute('data-act')]();
    });
    fresh();
  };

  /* ---------- Chapters 10 and 11: the whole of Tomazon on EKS, every part so far ---------- */

  /* Five columns: S3, then one per program, each above the store it uses most, so nearly every wire
     runs straight. Group boxes (the cluster, the database server, MSK) sit behind the nodes they hold.
     o.europe adds chapter 11's CloudFront edges in front, and the Frankfurt region below. */
  function fullLayout(o) {
    var node = archNode;
    function at(cls, id, g, cat, title, sub) { return '<div class="' + cls + '">' + node(id, g, cat, title, sub) + '</div>'; }
    var left = o.europe
      ? node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        node('shopIn', 'user', 'c-user', 'Shoppers in India', 'most of the 7 million') +
        node('edgeIn', 'edge', 'c-net', 'CloudFront edge', 'in India: pages, photos') +
        '<div class="fa-eu">' + node('shopFr', 'user', 'c-user', 'Shoppers in Europe', 'a tenth of the traffic') + '</div>' +
        node('edgeFr', 'edge', 'c-net', 'CloudFront edge', 'in Frankfurt: pages, photos')
      : node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
        node('shop', 'user', 'c-user', 'Shoppers', '5 million of them') +
        node('edge', 'edge', 'c-net', 'CloudFront edge', 'photos, near the shopper');
    return '<div class="ar2-left fa-left">' + left + '</div>' +
      '<div class="fa-right">' +
        '<div class="ar2-region fa-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai)</p>' +
          '<div class="fa-grid">' +
            '<div class="fa-box fa-k8s"><p class="ar2-k">Amazon EKS cluster: nodes in 3 zones</p></div>' +
            '<div class="fa-box fa-db"><p class="ar2-k">Database server</p></div>' +
            '<div class="fa-box fa-msk"><p class="ar2-k">Amazon MSK</p></div>' +
            at('fa-alb', 'alb', 'proxy', 'c-net', 'Load balancer', 'an ALB, set up by Kubernetes') +
            at('fa-c2 fa-r2', 'core', 'bolt', 'c-cpu', 'Core API', 'carts, orders, payments') +
            at('fa-c3 fa-r2', 'cat', 'bolt', 'c-cpu', 'Catalogue', 'pages, prices, search') +
            at('fa-c4 fa-r2', 'inv', 'bolt', 'c-sw', 'Cache invalidator', 'deletes stale keys') +
            at('fa-c5 fa-r2', 'idx', 'bolt', 'c-sw', 'Search indexer', 'keeps search up to date') +
            at('fa-c1 fa-r3', 's3', 'bucket', 'c-sto', 'S3', 'the photos, private') +
            at('fa-c2 fa-r3', 'pgb', 'proxy', 'c-db', 'PgBouncer', 'one pool of 20') +
            at('fa-c3 fa-r3', 'reps', 'db', 'c-db', 'Replicas 1 and 2', 'read-only') +
            at('fa-c4 fa-r3', 'redis', 'cache', 'c-db', 'Redis', 'cached pages') +
            at('fa-c5 fa-r3', 'os', 'search', 'c-db', 'OpenSearch', 'the search index') +
            at('fa-c2 fa-r4', 'pg', 'db', 'c-sw', 'PostgreSQL', 'the primary: every write') +
            at('fa-c4 fa-r4', 'dbz', 'bolt', 'c-sw', 'Debezium', 'reads the WAL') +
            at('fa-c5 fa-r4', 'kafka', 'log', 'c-sto', 'Kafka', 'product changes') +
            at('fa-c2 fa-r5', 'disk', 'disk', 'c-sto', 'EBS disk', 'the data') +
            at('fa-c3 fa-r5', 'snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') +
          '</div>' +
        '</div>' +
        (o.europe
          ? '<div class="ar2-region fa-region fa-fra">' +
              '<p class="ar2-k">New: AWS region Europe (Frankfurt), for reads</p>' +
              '<div class="fa-grid">' +
                '<div class="fa-box fa-k8s fa-k8s-fra"><p class="ar2-k">Amazon EKS cluster</p></div>' +
                at('fa-alb', 'albF', 'proxy', 'c-net', 'Load balancer', 'an ALB, for reads') +
                at('fa-c3 fa-r2', 'catF', 'bolt', 'c-cpu', 'Catalogue', 'pages, prices, stock') +
                at('fa-c1 fa-r3', 'repF', 'db', 'c-db', 'PostgreSQL replica', 'a little behind Mumbai') +
                at('fa-c4 fa-r3', 'redisF', 'cache', 'c-db', 'Redis', 'Frankfurt’s own') +
              '</div>' +
            '</div>'
          : '') +
      '</div>';
  }

  function fullWires(o) {
    return [
      ['a1', 'alb', 'core', 'v', ''],
      ['a2', 'alb', 'cat', 'v', ''],
      ['w', 'core', 'pgb', 'v', ''],
      ['pool', 'pgb', 'pg', 'v', ''],
      ['io', 'pg', 'disk', 'v', ''],
      ['bak', 'disk', 'snap', 'h', '', true],
      ['r', 'cat', 'reps', 'v', ''],
      ['c', 'cat', 'redis', 'h', ''],
      ['del', 'inv', 'redis', 'v', ''],
      ['wal', 'pg', 'reps', 'h', 'WAL', true],
      ['cdc', 'pg', 'dbz', 'h', ''],
      ['pub', 'dbz', 'kafka', 'h', ''],
      ['sub', 'inv', 'kafka', 'h', ''],
      ['ix', 'kafka', 'idx', 'r', ''],
      ['put', 'idx', 'os', 'v', '']
    ].concat(o.europe ? [
      ['dns', 'dns', 'shopIn', 'v', 'DNS lookup'],
      ['iIn', 'shopIn', 'edgeIn', 'v', ''],
      ['ia', 'edgeIn', 'alb', 'hl', ''],
      ['ip', 'edgeIn', 's3', 'hl', ''],
      ['fIn', 'shopFr', 'edgeFr', 'v', ''],
      ['fw', 'edgeFr', 'alb', 'hl', ''],
      ['fp', 'edgeFr', 's3', 'hl', ''],
      ['fr', 'edgeFr', 'albF', 'h', ''],
      ['af', 'albF', 'catF', 'v', ''],
      ['rf', 'catF', 'repF', 'v', ''],
      ['cf', 'catF', 'redisF', 'v', ''],
      ['walF', 'pg', 'repF', 'ld', 'WAL', true]
    ] : [
      ['dns', 'dns', 'shop', 'v', 'DNS lookup'],
      ['in', 'shop', 'alb', 'hl', 'HTTPS'],
      ['ph', 'shop', 'edge', 'v', 'photos'],
      ['miss', 'edge', 's3', 'h', '']
    ]);
  }

  W['eks-arch'] = function (el) {
    var o = {};
    var page = [['in', 0], ['a2', 0], ['c', 0], ['c', 1], ['r', 0], ['r', 1], ['a2', 1], ['in', 1]];
    var photo = [['ph', 0], ['miss', 0], ['miss', 1], ['ph', 1]];
    var order = [['in', 0], ['a1', 0], ['w', 0], ['pool', 0], ['pool', 1], ['w', 1], ['a1', 1], ['in', 1]];
    var change = [['cdc', 0], ['pub', 0], ['sub', 1], ['del', 0], ['ix', 0], ['put', 0]];
    var copies = [['wal', 0], ['io', 0], ['bak', 0]];
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: fullWires(o),
      request: page.concat(photo, order, change),
      start: 'Follow a request',
      idle: 'Every part of Tomazon so far. What’s new: the programs run as pods in one EKS cluster, behind a load balancer that Kubernetes set up. Press <strong>Follow a request</strong> to go through it step by step.',
      steps: [
        { on: ['shop', 'alb'], run: [['in', 0]], t: 'set up by Kubernetes',
          say: '<strong>The load balancer.</strong> Shoppers reach an Application Load Balancer. Nobody set it up by hand: Kubernetes asked AWS for it, from Tomazon’s manifests. It replaces the Nginx server from chapter 4.' },
        { on: ['alb', 'cat', 'redis', 'reps'], run: page.slice(1), t: 'only to pods that are ready',
          say: '<strong>A product page.</strong> It goes to one of the catalogue pods, on whichever node it runs. The pod reads Redis, and the replicas on a miss.' },
        { on: ['shop', 'edge', 's3'], run: photo, t: 'from a nearby edge',
          say: '<strong>The photos.</strong> They come from a CloudFront edge near the shopper, which fetches a photo from S3 only on a miss (chapter 9).' },
        { on: ['shop', 'alb', 'core', 'pgb', 'pg'], run: order, t: 'writes go to the primary',
          say: '<strong>Checkout.</strong> The load balancer sends it to the core API pods, which write the order to the primary, through PgBouncer.' },
        { on: ['pg', 'dbz', 'kafka', 'inv', 'redis', 'idx', 'os'], run: change, t: 'from the WAL, through Kafka',
          say: '<strong>A price changes.</strong> Debezium reads the change from the WAL and publishes it to Kafka (chapter 8). The cache invalidator deletes the stale keys in Redis, and the search indexer updates OpenSearch. Both take their work from Kafka, so they sit behind no load balancer.' },
        { on: ['pg', 'reps', 'disk', 'snap'], run: copies, t: 'outside the cluster',
          say: '<strong>The data stays outside.</strong> PostgreSQL, its replicas and Redis run on their own EC2 servers, as before: the primary streams its WAL to the replicas, and its disk is backed up every day. A pod can be replaced at any moment; the data can’t.' }
      ],
      html: fullLayout(o)
    });
  };

  /* ---------- Chapter 11: the time to the first byte of a page, by city, protocol and setup ---------- */

  W['ttfb-budget'] = function (el) {
    var CITIES = [
      { value: 'blr', label: 'Bangalore', home: 20, near: 20, region: 'Mumbai' },
      { value: 'fra', label: 'Frankfurt', home: 125, near: 2, region: 'Frankfurt' },
      { value: 'lon', label: 'London', home: 120, near: 15, region: 'Frankfurt' },
      { value: 'nyc', label: 'New York', home: 200, near: 85, region: 'Frankfurt' }
    ];
    var PROTOS = [{ value: '2', label: 'TLS 1.2' }, { value: '1', label: 'TLS 1.3' }, { value: '0', label: 'HTTP/3' }];
    var EDGE = 10, DNS = 10, APP = 50;   /* ms: to an edge in the shopper's city; to a nearby resolver; the app's own work */
    var st = { city: 'fra', proto: '1' };

    el.innerHTML = '<div class="w-controls el-controls"><span class="tb-city"></span><span class="tb-proto"></span></div>' +
      legend([['conn', 'DNS, from a resolver nearby'], ['net', 'The shopper to whoever answers'], ['dbw', 'The edge to the app’s region'], ['cpu', 'The app building the page']]) +
      '<div class="wf el-rows tb-rows"></div><p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">A first visit on a fast connection, counting round trips only. A returning shopper whose connection is still open skips the handshakes.</p>';
    var wf = el.querySelector('.wf'), out = el.querySelector('.readout');
    el.querySelector('.tb-city').appendChild(segmented('Where the shopper is', CITIES, st.city, function (v) { st.city = v; draw(); }));
    el.querySelector('.tb-proto').appendChild(segmented('Protocol', PROTOS, st.proto, function (v) { st.proto = v; draw(); }));
    function t(ms) { return ms >= 1000 ? (ms / 1000).toFixed(2) + ' s' : Math.round(ms) + ' ms'; }

    function draw() {
      var c = CITIES.filter(function (x) { return x.value === st.city; })[0];
      var hs = +st.proto + 1;   /* handshake round trips: TCP + TLS 1.2 = 3, TCP + TLS 1.3 = 2, QUIC = 1 */
      var rows = [
        { name: 'Straight to Mumbai', segs: [['conn', 'DNS', DNS], ['net', 'handshakes', hs * c.home], ['net', 'request', c.home], ['cpu', 'app', APP]] },
        { name: 'Through the edge', segs: [['conn', 'DNS', DNS], ['net', 'handshakes', hs * EDGE], ['net', 'request', EDGE], ['dbw', 'edge to Mumbai', c.home], ['cpu', 'app', APP]] },
        { name: 'Cached at the edge', segs: [['conn', 'DNS', DNS], ['net', 'handshakes', hs * EDGE], ['net', 'request', EDGE]] },
        { name: 'Edge, then ' + c.region, segs: [['conn', 'DNS', DNS], ['net', 'handshakes', hs * EDGE], ['net', 'request', EDGE], ['dbw', 'edge to ' + c.region, c.near], ['cpu', 'app', APP]] }
      ];
      var totals = rows.map(function (row) { return row.segs.reduce(function (a, s) { return a + s[2]; }, 0); });
      var max = Math.max.apply(null, totals), html = '';
      rows.forEach(function (row, i) {
        var at = 0, cells = '';
        row.segs.forEach(function (s) {
          cells += '<span class="wf-seg ' + s[0] + '" style="left:' + (at / max * 100) + '%;width:' + (s[2] / max * 100) + '%" tabindex="0" data-tip="<b>' +
            esc(s[1]) + '</b><br>' + t(s[2]) + '" aria-label="' + esc(s[1]) + ', ' + t(s[2]) + '"><span class="seg-label">' + esc(s[1]) + '</span></span>';
          at += s[2];
        });
        html += '<div class="wf-row"><span class="wf-name">' + row.name + '</span><span class="wf-track">' + cells + '</span><span class="wf-total">' + t(totals[i]) + '</span></div>';
      });
      wf.innerHTML = html;
      fitLabels(wf);
      var say = 'From ' + c.label + ', the first byte takes <strong>' + t(totals[0]) + '</strong> straight from Mumbai: ' + (hs + 1) + ' round trips of ' + c.home +
        ' ms, plus the app’s 50 ms. Through the edge, the handshakes happen ' + EDGE + ' ms away and only the request crosses: <strong>' + t(totals[1]) +
        '</strong>. A cached page: <strong>' + t(totals[2]) + '</strong>. ';
      say += c.value === 'blr'
        ? 'In India, Mumbai is only 20 ms away, so the edge helps mostly by caching.'
        : 'With the app’s reads in ' + c.region + ': <strong>' + t(totals[3]) + '</strong>.';
      if (st.proto === '2') say += ' TLS 1.2 needs two round trips for its handshake; TLS 1.3 needs one.';
      if (st.proto === '0') say += ' HTTP/3 runs over QUIC, which sets up the connection and its encryption in a single round trip.';
      out.innerHTML = say;
    }
    bindTips(el);
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(wf); }).observe(wf);
  };

  /* ---------- Chapter 11: chapter 10's architecture, with CloudFront edges in front and a region in Frankfurt for reads ---------- */

  W['edge-regions'] = function (el) {
    var o = { europe: true };
    var india = [['iIn', 0], ['ia', 0], ['a2', 0], ['c', 0], ['c', 1], ['a2', 1], ['ia', 1], ['iIn', 1]];
    var page = [['fIn', 0], ['fIn', 1]];
    var photo = [['fp', 0], ['fp', 1]];
    var read = [['fIn', 0], ['fr', 0], ['af', 0], ['cf', 0], ['cf', 1], ['rf', 0], ['rf', 1], ['af', 1], ['fr', 1], ['fIn', 1]];
    var write = [['fIn', 0], ['fw', 0], ['a1', 0], ['w', 0], ['pool', 0], ['pool', 1], ['w', 1], ['a1', 1], ['fw', 1], ['fIn', 1]];
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: fullWires(o),
      request: india.concat(page, read, write, [['walF', 0]]),
      start: 'Follow the shoppers',
      idle: 'Chapter 10’s Mumbai region, unchanged. Two parts are new: CloudFront edges in front of <code>tomazon.com</code>, and a second region in Frankfurt, below it, for reads. Press <strong>Follow the shoppers</strong> to go through it step by step.',
      steps: [
        { on: ['shopIn', 'edgeIn', 'alb', 'cat', 'redis'], run: india, t: 'as before, through an edge',
          say: '<strong>India: the same as before.</strong> A shopper in India now connects to a nearby CloudFront edge, which passes the request to Mumbai: the load balancer, a catalogue pod and Redis, exactly as in chapter 10.' },
        { on: ['shopFr', 'edgeFr'], run: page, t: 'a hit: about 40 ms to the first byte',
          say: '<strong>Europe: the page, from the edge.</strong> A shopper in Europe connects to an edge in Frankfurt, about 10 ms away. The product page is the same for everyone, so the edge has it cached and answers at once.' },
        { on: ['edgeFr', 's3'], run: photo, t: 'a miss: one trip to Mumbai',
          say: '<strong>The photos, from the edge too.</strong> Only on a miss does the edge fetch a photo from S3 in Mumbai, and keep a copy for the next shopper (chapter 9).' },
        { on: ['shopFr', 'edgeFr', 'albF', 'catF', 'redisF', 'repF'], run: read, t: 'Frankfurt: a few milliseconds',
          say: '<strong>Prices and stock, from Frankfurt.</strong> They can’t be cached for long, so the edge sends them to the new region: its own load balancer, catalogue pods, Redis, and a replica of the Mumbai database.' },
        { on: ['shopFr', 'edgeFr', 'alb', 'core', 'pgb', 'pg'], run: write, t: 'one trip to Mumbai, about 125 ms',
          say: '<strong>Writes go home.</strong> Adding to the cart, ordering and paying change data, so the edge sends them to the core API in Mumbai, which writes to the only primary.' },
        { on: ['pg', 'repF'], run: [['walF', 0]], t: 'usually under a second behind',
          say: '<strong>The copy catches up.</strong> The primary streams its WAL to the Frankfurt replica, as to its other replicas (page 5.2), only farther away. Everything else in Mumbai, the cache invalidator, the search indexer, Kafka and OpenSearch, works as in chapter 10.' }
      ],
      html: fullLayout(o)
    });
  };

  /* ---------- Chapter 12: adding a primary, with hash-mod-N or with 64 logical shards ---------- */

  W['shard-map'] = function (el) {
    var LOGICAL = 64, CUSTOMERS = 96;
    var MODES = [{ value: 'mod', label: 'Hash mod the number of primaries' }, { value: 'logical', label: '64 logical shards and a map' }];
    var NS = [{ value: '4', label: '4 primaries' }, { value: '5', label: '5' }, { value: '6', label: '6' }];
    var st = { mode: 'mod', n: 4 };
    /* A small integer hash that spreads consecutive ids well. */
    function hash(x) { var h = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
    /* The map starts as 4 blocks of 16; each new primary takes shards, one at a time, from the fullest. */
    function mapFor(n) {
      var m = [], i, k;
      for (i = 0; i < LOGICAL; i++) m.push(Math.floor(i / 16));
      for (k = 4; k < n; k++) {
        for (var moved = 0; moved < Math.floor(LOGICAL / (k + 1)); moved++) {
          var counts = []; for (i = 0; i < k; i++) counts.push(0);
          m.forEach(function (p) { if (p < k) counts[p]++; });
          var big = counts.indexOf(Math.max.apply(null, counts));
          for (i = LOGICAL - 1; i >= 0; i--) if (m[i] === big) { m[i] = k; break; }
        }
      }
      return m;
    }
    var ids = []; for (var c = 0; c < CUSTOMERS; c++) ids.push(48213 + c * 7919);

    el.innerHTML = '<div class="w-controls el-controls"><span class="sm-mode"></span><span class="sm-n"></span></div>' +
      '<div class="sm-key"></div><div class="sm-logical"></div>' +
      '<p class="sm-label">96 customers, coloured by the primary that holds their orders</p><div class="sm-grid sm-cust"></div>' +
      '<p class="calc-math sm-say" aria-live="polite"></p>';
    el.querySelector('.sm-mode').appendChild(segmented('Routing', MODES, st.mode, function (v) { st.mode = v; draw(); }));
    el.querySelector('.sm-n').appendChild(segmented('Primaries', NS, String(st.n), function (v) { st.n = +v; draw(); }));

    function draw() {
      var n = st.n, base = mapFor(4), map = mapFor(n), moved = 0;
      function place(id, count, m) { var h = hash(id); return st.mode === 'mod' ? h % count : m[h % LOGICAL]; }
      el.querySelector('.sm-key').innerHTML = '<p class="kl-key">' + [0, 1, 2, 3, 4, 5].slice(0, n).map(function (p) {
        return '<span><i class="sm-p p' + p + '"></i>orders-' + (p + 1) + '</span>';
      }).join('') + '<span><i class="sm-moved-key"></i>moved</span></p>';
      var logical = '';
      if (st.mode === 'logical') {
        logical = '<p class="sm-label">The shard map: 64 logical shards, coloured by primary</p><div class="sm-grid sm-ls">' +
          map.map(function (p, i) { return '<i class="sm-p p' + p + (p !== base[i] ? ' moved' : '') + '" title="Logical shard ' + i + ' → orders-' + (p + 1) + '">' + i + '</i>'; }).join('') + '</div>';
      }
      el.querySelector('.sm-logical').innerHTML = logical;
      el.querySelector('.sm-cust').innerHTML = ids.map(function (id) {
        var p = place(id, n, map), was = place(id, 4, base);
        if (p !== was) moved++;
        return '<i class="sm-p p' + p + (p !== was ? ' moved' : '') + '" title="Customer ' + id + ' → orders-' + (p + 1) + '"></i>';
      }).join('');
      var pct = Math.round(moved / CUSTOMERS * 100), say;
      if (n === 4) say = 'The starting layout: four primaries. Now add a fifth, and see how many customers’ orders have to move.';
      else if (st.mode === 'mod') say = '<strong>' + moved + ' of 96 customers move (' + pct + '%).</strong> With <code>hash % ' + n + '</code>, changing the number of primaries changes the answer for almost every customer, so almost all the data has to move at once.';
      else say = '<strong>' + moved + ' of 96 customers move (' + pct + '%).</strong> Only the logical shards the new primar' + (n > 5 ? 'ies take' : 'y takes') + ' move, about ' + Math.round((1 - 4 / n) * 100) + '% of the data, the least possible. Each shard moves on its own, then one row of the map changes.';
      el.querySelector('.sm-say').innerHTML = say;
    }
    draw();
  };

  /* ---------- Chapter 12: the shard router in the core API, and four primaries ---------- */

  W['shard-arch'] = function (el) {
    var node = archNode;
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: [
        ['in', 'shop', 'app', 'h', ''],
        ['q1', 'app', 's1', 'v', ''],
        ['q2', 'app', 's2', 'v', ''],
        ['q3', 'app', 's3', 'v', ''],
        ['q4', 'app', 's4', 'v', '']
      ],
      request: [['in', 0], ['q3', 0], ['q3', 1], ['in', 1], ['in', 0], ['q1', 0], ['q1', 1], ['in', 1]],
      start: 'Follow a request',
      steps: [
        { on: ['shop', 'app'], run: [['in', 0]], t: 'customer 48213',
          say: '<strong>“My orders”.</strong> Customer 48213 opens their orders, and the request reaches one of the core API’s pods.' },
        { on: ['app'], run: [], t: 'microseconds, no network call',
          say: '<strong>Find the shard.</strong> The router hashes 48213 to logical shard 37 of 64, and looks it up in the shard map, a 64-row table cached in every pod: shard 37 lives on orders-3.' },
        { on: ['app', 's3', 'shop'], run: [['q3', 0], ['q3', 1], ['in', 1]], t: 'one primary, as before',
          say: '<strong>Ask one primary.</strong> The query goes to orders-3 only, exactly as it used to go to the single primary. Everything about one customer lives on one shard, so “My orders” never needs another.' },
        { on: ['shop', 'app', 's1'], run: [['in', 0], ['q1', 0], ['q1', 1], ['in', 1]], t: 'another customer, another primary',
          say: '<strong>Another customer, another primary.</strong> Customer 1150 hashes to logical shard 9, on orders-1. The writes are spread over four primaries, each with its own replicas, disk and backups.' },
        { on: ['app', 's1', 's2', 's3', 's4'], run: [['q1', 0], ['q2', 0], ['q3', 0], ['q4', 0]], t: 'every shard: avoid',
          say: '<strong>A question about everyone,</strong> such as “today’s orders for one phone”, would have to ask all four primaries and merge the answers. Reports like that go to the data warehouse, fed from Kafka (chapter 8), not to the shards.' }
      ],
      html:
        '<div class="ar2-left">' + node('shop', 'user', 'c-user', 'Shopper', 'customer 48213') + '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai)</p>' +
          '<div class="c12-app">' + node('app', 'bolt', 'c-cpu', 'Core API pods', 'router and shard map, in memory') + '</div>' +
          '<div class="c12-shards">' +
            node('s1', 'db', 'c-db', 'orders-1', 'logical shards 0–15') +
            node('s2', 'db', 'c-db', 'orders-2', 'logical shards 16–31') +
            node('s3', 'db', 'c-db', 'orders-3', 'logical shards 32–47') +
            node('s4', 'db', 'c-db', 'orders-4', 'logical shards 48–63') +
          '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 13: a regional cell in Singapore, fed from the home region in Mumbai ---------- */

  W['global-arch'] = function (el) {
    var node = archNode;
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      wires: [
        ['in', 'shop', 'door', 'v', ''],
        ['w', 'door', 'core', 'h', ''],
        ['r', 'door', 'cat', 'h', ''],
        ['ws', 'core', 'prim', 'h', ''],
        ['cdc', 'prim', 'kafka', 'h', 'CDC', true],
        ['rd', 'cat', 'rdb', 'h', ''],
        ['feed', 'kafka', 'apply', 'v', 'copied', true],
        ['ap', 'rdb', 'apply', 'h', '']
      ],
      request: [['in', 0], ['r', 0], ['rd', 0], ['rd', 1], ['r', 1], ['in', 1], ['in', 0], ['w', 0], ['ws', 0], ['ws', 1], ['w', 1], ['in', 1], ['cdc', 0], ['feed', 0], ['ap', 1]],
      start: 'Follow a shopper',
      idle: 'A shopper in Singapore browses, then orders. Press <strong>Follow a shopper</strong> to go through it step by step.',
      steps: [
        { on: ['shop', 'door'], run: [['in', 0]], t: 'the nearest edge',
          say: '<strong>The same front door everywhere.</strong> The shopper reaches CloudFront’s edge in Singapore, as anyone anywhere reaches their nearest one. The edge picks the region for each request.' },
        { on: ['door', 'cat', 'rdb'], run: [['r', 0], ['rd', 0], ['rd', 1], ['r', 1], ['in', 1]], t: 'all within Singapore',
          say: '<strong>Browsing stays in the cell.</strong> Product pages, prices and search are answered by the Singapore cell, from its own read database. Nothing crosses to Mumbai.' },
        { on: ['shop', 'door', 'core', 'prim'], run: [['in', 0], ['w', 0], ['ws', 0], ['ws', 1], ['w', 1], ['in', 1]], t: 'one trip to the home region',
          say: '<strong>Orders go home.</strong> Placing an order is a write, so it goes to the core API in Mumbai and to the shopper’s shard. One long round trip, at checkout.' },
        { on: ['prim', 'kafka'], run: [['cdc', 0]], t: 'milliseconds',
          say: '<strong>Every change is published.</strong> Debezium reads the primaries’ WAL into Kafka (page 8.3): price changes, stock levels, new products.' },
        { on: ['kafka', 'apply', 'rdb'], run: [['feed', 0], ['ap', 1]], t: 'about a second, region to region',
          say: '<strong>The cell feeds itself.</strong> MSK Replicator copies the catalogue topics into Singapore, and a small applier upserts each change into the read database. If the link breaks, the messages wait, and the cell keeps serving what it has.' }
      ],
      html:
        '<div class="ar2-left c13-left">' +
          node('shop', 'user', 'c-user', 'Shopper', 'in Singapore') +
          node('door', 'edge', 'c-net', 'Front door', 'CloudFront, nearest edge') +
        '</div>' +
        '<div class="c13-regions">' +
          '<div class="ar2-region"><p class="ar2-k">Home region: Mumbai, where every write goes</p><div class="c13-row">' +
            node('core', 'bolt', 'c-cpu', 'Core API', 'carts, orders, payments') +
            node('prim', 'db', 'c-db', 'Primaries', 'products, and orders-1 to orders-4') +
            node('kafka', 'log', 'c-sto', 'Kafka', 'every committed change') +
          '</div></div>' +
          '<div class="ar2-region"><p class="ar2-k">Regional cell: Singapore</p><div class="c13-row">' +
            node('cat', 'bolt', 'c-cpu', 'Catalogue and search', 'the cell’s own pods') +
            node('rdb', 'db', 'c-db', 'Read database', 'catalogue data only') +
            node('apply', 'bolt', 'c-sw', 'Applier', 'reads Kafka, upserts') +
          '</div></div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 14: stay on AWS, or move the steady part to your own servers? ---------- */

  W['cloud-or-own'] = function (el) {
    var BILL = 115, ENGINEER = 6, MOVE = 300;   /* $K a month after tuning; $K a month per engineer, fully loaded; $K one-off to move */
    var STEADY = [{ value: '40', label: '40% steady' }, { value: '60', label: '60%' }, { value: '80', label: '80%' }];
    var PRICE = [{ value: '20', label: 'Own servers at 20% of the cloud price' }, { value: '35', label: '35%' }, { value: '50', label: '50%' }];
    var PEOPLE = [{ value: '2', label: '2 more engineers' }, { value: '4', label: '4' }, { value: '6', label: '6' }];
    var st = { steady: '60', price: '35', people: '4' };

    el.innerHTML = '<div class="w-controls el-controls"><span class="co-steady"></span><span class="co-price"></span><span class="co-people"></span></div>' +
      legend([['net', 'AWS: what stays'], ['dbw', 'Own servers: rent, space, power, network'], ['cpu', 'The extra engineers']]) +
      '<div class="wf el-rows co-rows"></div><p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">Starting from Tomazon’s tuned bill of $115K a month. An engineer costs about $6K a month with everything included, and the move itself, months of work and of paying for both sites, about $300K.</p>';
    var wf = el.querySelector('.wf'), out = el.querySelector('.readout');
    el.querySelector('.co-steady').appendChild(segmented('Share of the bill that is steady', STEADY, st.steady, function (v) { st.steady = v; draw(); }));
    el.querySelector('.co-price').appendChild(segmented('Own servers, against the same in the cloud', PRICE, st.price, function (v) { st.price = v; draw(); }));
    el.querySelector('.co-people').appendChild(segmented('Extra engineers to run them', PEOPLE, st.people, function (v) { st.people = v; draw(); }));
    function k(x) { return '$' + Math.round(x) + 'K'; }

    function draw() {
      var s = st.steady / 100, stay = BILL * (1 - s), own = BILL * s * st.price / 100, people = st.people * ENGINEER;
      var rows = [
        { name: 'Stay on AWS', segs: [['net', 'AWS', BILL]] },
        { name: 'Move the steady part', segs: [['net', 'AWS', stay], ['dbw', 'own servers', own], ['cpu', 'engineers', people]] }
      ];
      var totals = rows.map(function (row) { return row.segs.reduce(function (a, x) { return a + x[2]; }, 0); });
      var max = Math.max.apply(null, totals), html = '';
      rows.forEach(function (row, i) {
        var at = 0, cells = '';
        row.segs.forEach(function (x) {
          cells += '<span class="wf-seg ' + x[0] + '" style="left:' + (at / max * 100) + '%;width:' + (x[2] / max * 100) + '%" tabindex="0" data-tip="<b>' +
            esc(x[1]) + '</b><br>' + k(x[2]) + ' a month" aria-label="' + esc(x[1]) + ', ' + k(x[2]) + ' a month"><span class="seg-label">' + esc(x[1]) + '</span></span>';
          at += x[2];
        });
        html += '<div class="wf-row"><span class="wf-name">' + row.name + '</span><span class="wf-track">' + cells + '</span><span class="wf-total">' + k(totals[i]) + '</span></div>';
      });
      wf.innerHTML = html;
      fitLabels(wf);
      var save = totals[0] - totals[1];
      out.innerHTML = save > 0
        ? 'Moving the steady ' + st.steady + '% costs <strong>' + k(totals[1]) + '</strong> a month instead of $115K: <strong>' + k(save) + ' a month</strong> saved, ' + k(save * 12) +
          ' a year. The move pays for itself in about <strong>' + Math.ceil(MOVE / save) + ' months</strong>' + (MOVE / save > 24 ? ', which is a long time to carry the risk.' : '.')
        : 'Moving <strong>costs more</strong> than staying: ' + k(totals[1]) + ' a month against $115K. The cheaper servers don’t cover the engineers, and the part that has to stay in the cloud.';
    }
    bindTips(el);
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { fitLabels(wf); }).observe(wf);
  };

  /* ---------- Chapter 9: the whole of Tomazon, with shoppers and CloudFront edges in India and New York ---------- */

  W['cdn-full'] = function (el) {
    var node = archNode;
    var o = {
      cache: true,
      apps: [['Core API', 'carts, orders, payments'], ['Catalogue', 'pages, prices, search'], ['Workers', 'invalidators, indexer, resizer']],
      appCap: 'EC2 app servers: several copies of each service',
      s3sub: 'private: only CloudFront reads it',
      left: '<div class="ar2-left c9-left">' +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for tomazon.com') +
          node('shopIn', 'user', 'c-user', 'Shoppers in India', 'most of the 3 million') +
          node('edgeIn', 'edge', 'c-net', 'CloudFront edge', 'Bengaluru') +
          node('shopNY', 'user', 'c-user', 'Shoppers in New York', 'buying from abroad') +
          node('edgeNY', 'edge', 'c-net', 'CloudFront edge', 'New York') +
        '</div>'
    };
    var own = [
      ['dns', 'dns', 'shopIn', 'v', 'DNS lookup'],
      ['in', 'shopIn', 'eip', 'hl', 'HTTPS'],
      ['inNY', 'shopNY', 'eip', 'hl', ''],
      ['pIn', 'shopIn', 'edgeIn', 'v', 'photos'],
      ['pNY', 'shopNY', 'edgeNY', 'v', 'photos'],
      ['oIn', 'edgeIn', 's3', 'h', ''],
      ['oNY', 'edgeNY', 's3', 'h', '']
    ];
    var wires = growWires(o).filter(function (w) { return ['dns', 'in', 'ph'].indexOf(w[0]) < 0; }).concat(own);
    var pageIn = [['in', 0], ['fw', 0], ['lb', 0], ['a2', 0], ['c', 0], ['c', 1], ['a2', 1], ['lb', 1], ['fw', 1], ['in', 1]];
    var pageNY = [['inNY', 0], ['fw', 0], ['lb', 0], ['a2', 0], ['c', 0], ['c', 1], ['a2', 1], ['lb', 1], ['fw', 1], ['inNY', 1]];
    el.innerHTML = '<div class="arch-scroll"><div></div></div><p class="w-note arch-hint">Swipe the diagram sideways to see all of it.</p>';
    liveArch(el.querySelector('.arch-scroll > div'), {
      joints: true,
      wires: wires,
      request: pageIn.concat([['pIn', 0], ['pIn', 1]], pageNY, [['pNY', 0], ['pNY', 1]]),
      start: 'Follow two shoppers',
      idle: 'Shoppers in India and New York open the same product page. Kafka and Debezium (chapter 8) are left out, to keep the picture readable. Press <strong>Follow two shoppers</strong> to go through it step by step.',
      steps: [
        { on: ['shopIn', 'eip', 'sg', 'lb', 'app2', 'redis'], run: pageIn, t: 'about 20 ms a round trip',
          say: '<strong>India: the page.</strong> A shopper in Bangalore opens a product page. The page and its prices come from Mumbai, as always: through the load balancer to the catalogue, which answers from Redis.' },
        { on: ['shopIn', 'edgeIn'], run: [['pIn', 0], ['pIn', 1]], t: 'a few milliseconds',
          say: '<strong>India: the photos.</strong> The photo links point at <code>img.tomazon.com</code>, so the browser fetches the photos from a CloudFront edge in Bengaluru, a few milliseconds away.' },
        { on: ['shopNY', 'eip', 'sg', 'lb', 'app2', 'redis'], run: pageNY, t: 'about 200 ms a round trip',
          say: '<strong>New York: the page.</strong> The same page, for a shopper in New York, still comes from Mumbai: every round trip crosses the world. That’s what is left of the slowness (chapter 11).' },
        { on: ['shopNY', 'edgeNY'], run: [['pNY', 0], ['pNY', 1]], t: 'a hit: tens of milliseconds',
          say: '<strong>New York: the photos.</strong> They come from a CloudFront edge in New York. Most of the page’s bytes no longer cross the world.' },
        { on: ['edgeNY', 's3'], run: [['oNY', 0], ['oNY', 1]], t: 'a miss: one trip to Mumbai',
          say: '<strong>A miss.</strong> If the New York edge doesn’t have a photo yet, it fetches it once from the S3 bucket in Mumbai, keeps a copy, and serves every shopper nearby from that copy.' }
      ],
      html: growLayout(o)
    });
  };

  /* ---------- Measuring: 100 requests, sorted, with p50 and p99 marked ---------- */

  W['percentile-strip'] = function (el) {
    var cells = '';
    for (var i = 1; i <= 100; i++) {
      var slow = i > 98, mark = i === 50 ? ' m50' : i === 99 ? ' m99' : '';
      cells += '<i class="' + (slow ? 'slow' : 'fast') + mark + '" tabindex="' + (mark ? 0 : -1) + '" data-tip="<b>Request ' + i + '</b><br>' + (slow ? '3,000 ms' : '50 ms') + '"></i>';
    }
    el.innerHTML =
      legend([['pfast', '50 ms'], ['pslow', '3,000 ms']]) +
      '<div class="pct-wrap">' +
        '<span class="pct-label l50">Request 50 is the p50: <b>50 ms</b></span>' +
        '<span class="pct-label l99">Request 99 is the p99: <b>3,000 ms</b></span>' +
        '<div class="pct-strip" role="img" aria-label="100 requests sorted from fastest to slowest: 98 take 50 ms and the last 2 take 3,000 ms. Request 50, the p50, is 50 ms; request 99, the p99, is 3,000 ms.">' + cells + '</div>' +
        '<div class="pct-axis"><span>Fastest</span><span>100 requests, sorted</span><span>Slowest</span></div>' +
      '</div>';
    bindTips(el);
  };

  /* ---------- 1.8  Fan-out and the p99 ---------- */

  W['fan-out'] = function (el) {
    el.innerHTML =
      '<div class="w-field"><label for="fanN">Services one page calls</label><input type="range" id="fanN" min="1" max="100" value="10"><output for="fanN"></output></div>' +
      legend([['slow', 'Page load waited on at least one slow call'], ['fast', 'Every call was fast']]) +
      '<div class="dots" role="img"></div><p class="readout" aria-live="polite"></p>';
    var input = el.querySelector('input'), outN = el.querySelector('output'),
        dots = el.querySelector('.dots'), out = el.querySelector('.readout');
    dots.innerHTML = new Array(101).join('<i></i>');
    function draw() {
      var n = +input.value;
      var p = 1 - Math.pow(0.99, n);
      var k = Math.round(p * 100);
      outN.textContent = n;
      Array.prototype.forEach.call(dots.children, function (d, i) { d.className = i < k ? 'slow' : ''; });
      dots.setAttribute('aria-label', k + ' of 100 page loads hit a slow call');
      out.innerHTML = 'Each service is slow on 1 request in 100 (its p99). A page that calls <strong>' + n + '</strong> of them waits on at least one slow call in <strong>' +
        (Math.round(p * 1000) / 10) + '%</strong> of page loads. Each service’s slowest 1% has become the page’s slowest ' + k + '%.';
    }
    input.addEventListener('input', draw);
    draw();
  };

  /* ---------- 1.8  Utilisation vs response time (M/M/1) ---------- */

  W['utilisation'] = function (el) {
    var S = 10, YMAX = 200;            /* 10 ms of work per request; chart tops out at 200 ms */
    var u = 70;
    el.innerHTML =
      '<div class="ut-read" aria-live="polite"><b class="ut-big"></b><span class="ut-say"></span></div>' +
      '<div class="chart"></div>' +
      '<div class="w-field"><label for="utilIn">How busy the server is</label><input type="range" id="utilIn" min="0" max="97" value="' + u + '"><output for="utilIn"></output></div>';
    var box = el.querySelector('.chart'), input = el.querySelector('input'), outU = el.querySelector('output'),
        big = el.querySelector('.ut-big'), say = el.querySelector('.ut-say');
    function R(p) { return S / (1 - p); }

    function draw() {
      var Wd = Math.max(280, box.clientWidth), H = Wd < 520 ? 240 : 300;
      var m = { l: 52, r: 16, t: 34, b: 42 };
      var iw = Wd - m.l - m.r, ih = H - m.t - m.b;
      function x(p) { return m.l + p * iw; }
      function y(ms) { return m.t + ih - Math.min(ms, YMAX) / YMAX * ih; }
      var pts = [], pEnd = 1 - S / YMAX;
      for (var i = 0; i <= 200; i++) { var p = pEnd * i / 200; pts.push(x(p).toFixed(1) + ',' + y(R(p)).toFixed(1)); }
      var g = '';
      [0, 50, 100, 150, 200].forEach(function (t) {
        g += '<line class="grid" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
             '<text class="axis" x="' + (m.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + t + '</text>';
      });
      [0, 20, 40, 60, 80, 100].forEach(function (t) {
        g += '<text class="axis" x="' + x(t / 100) + '" y="' + (m.t + ih + 20) + '" text-anchor="middle">' + t + '%</text>';
      });
      var p = u / 100, rv = R(p), cy = y(rv), cx = x(p);
      var svg = '<svg width="' + Wd + '" height="' + H + '" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Response time rises slowly up to about 60% utilisation, then steeply: 20 ms at 50%, 50 ms at 80%, 100 ms at 90%, 200 ms at 95%.">' +
        '<rect class="band" x="' + x(0.6) + '" y="' + m.t + '" width="' + (x(0.7) - x(0.6)) + '" height="' + ih + '"/>' +
        '<text class="band-label" x="' + ((x(0.6) + x(0.7)) / 2) + '" y="' + (m.t + 14) + '" text-anchor="middle">peak target</text>' +
        g +
        '<line class="base" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>' +
        '<text class="axis" x="' + (m.l + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Utilisation</text>' +
        '<text class="axis" x="' + m.l + '" y="14">Response time, ms</text>' +
        '<polyline class="curve" points="' + pts.join(' ') + '"/>' +
        '<line class="cross" x1="' + cx + '" x2="' + cx + '" y1="' + cy + '" y2="' + (m.t + ih) + '"/>' +
        '<circle class="dot" cx="' + cx + '" cy="' + cy + '" r="6"/>' +
        '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>' +
        '</svg>';
      box.innerHTML = svg;
      box.querySelector('.hit').addEventListener('pointermove', function (e) {
        var rect = box.querySelector('svg').getBoundingClientRect();
        var v = Math.round(Math.max(0, Math.min(97, (e.clientX - rect.left - m.l) / iw * 100)));
        if (v !== u) { u = v; input.value = v; draw(); }
      });
      outU.textContent = u + '%';
      big.textContent = fmtMs(rv) + (rv > YMAX ? ' (off the chart)' : '');
      say.innerHTML = 'per request at ' + u + '% busy: ' + S + ' ms of work plus <strong>' + fmtMs(rv - S) + '</strong> waiting in line' +
        (rv / S >= 2 ? ': ' + fmtNum(rv / S) + '× as long as on an idle server.' : '.');
    }
    input.addEventListener('input', function () { u = +input.value; draw(); });
    draw();
    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () { if (Math.abs(box.clientWidth - lastW) > 4) { lastW = box.clientWidth; draw(); } }).observe(box);
    }
  };

  /* ---------- How a CPU works: the clock and the pipeline ---------- */

  W['clock-pipeline'] = function (el) {
    var STAGES = [
      { name: 'Fetch', short: 'F', verb: 'being fetched' },
      { name: 'Decode', short: 'D', verb: 'being decoded' },
      { name: 'Execute', short: 'E', verb: 'executing' },
      { name: 'Store', short: 'S', verb: 'storing its result' }
    ];
    var INSTR = ['Load price', 'Load 1.18', 'Multiply', 'Store the answer'];
    var TICKS = INSTR.length + STAGES.length - 1;          /* 7 */
    var NS = 1 / 3;                                         /* one tick at 3 GHz */
    var t = 0, timer = null;

    var wave = '<svg viewBox="0 0 40 20" preserveAspectRatio="none" aria-hidden="true"><path d="M0 17 H9 V3 H29 V17 H40"/></svg>';
    var g = '<span class="pl-lab"></span>';
    for (var c = 1; c <= TICKS; c++) g += '<span class="pl-head" data-t="' + c + '"><span class="l">Tick </span>' + c + '</span>';
    g += '<span class="pl-lab">Clock</span>';
    for (c = 1; c <= TICKS; c++) g += '<span class="pl-clock" data-t="' + c + '">' + wave + '</span>';
    INSTR.forEach(function (name, i) {
      g += '<span class="pl-lab"><b>' + (i + 1) + '</b> ' + esc(name) + '</span>';
      for (var c = 1; c <= TICKS; c++) {
        var st = c - 1 - i;
        g += st >= 0 && st < STAGES.length
          ? '<span class="pl-cell s' + st + '" data-t="' + c + '"><span class="l">' + STAGES[st].name + '</span><span class="s">' + STAGES[st].short + '</span></span>'
          : '<span class="pl-empty" data-t="' + c + '"></span>';
      }
    });

    el.innerHTML =
      '<div class="pl-controls"><button type="button" class="btn-sm" data-play>Play</button>' +
        '<div class="w-field"><label for="plT">Tick</label><input type="range" id="plT" min="0" max="' + TICKS + '" value="0"><output for="plT"></output></div></div>' +
      legend(STAGES.map(function (s, i) { return ['st' + i, s.name]; })) +
      '<div class="pl-grid" style="--ticks:' + TICKS + '">' + g + '</div>' +
      '<p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">Simplified: real cores split the work into 14–20 smaller stages, but the idea is the same.</p>';
    var input = el.querySelector('#plT'), out = el.querySelector('.readout'), play = el.querySelector('[data-play]');

    function draw() {
      input.value = t;
      el.querySelector('#plT + output').textContent = t + ' of ' + TICKS;
      el.querySelectorAll('.pl-grid [data-t]').forEach(function (n) {
        var k = +n.getAttribute('data-t');
        n.classList.toggle('future', k > t);
        n.classList.toggle('now', k === t);
      });
      if (t === 0) { out.innerHTML = 'Press Play, or drag the slider, to run the clock one tick at a time.'; return; }
      var busy = [], done = 0;
      INSTR.forEach(function (name, i) {
        var st = t - 1 - i;
        if (st >= STAGES.length) done++;
        else if (st >= 0) busy.push('instruction ' + (i + 1) + ' is ' + STAGES[st].verb);
      });
      if (t === TICKS) {
        out.innerHTML = 'All 4 instructions finished in <strong>' + TICKS + ' ticks</strong>, about ' + fmtNum(TICKS * NS) + ' ns at 3 GHz. ' +
          'One at a time, without overlapping, they would have taken ' + INSTR.length * STAGES.length + ' ticks.';
        return;
      }
      out.innerHTML = '<strong>Tick ' + t + '</strong>, ' + fmtNum(t * NS) + ' ns in: ' + busy.join(', ') + '.' +
        (done ? ' ' + done + ' finished.' : '');
    }
    function stop() { clearInterval(timer); timer = null; play.textContent = 'Play'; }
    play.addEventListener('click', function () {
      if (timer) { stop(); return; }
      if (t >= TICKS) t = 0;
      play.textContent = 'Pause';
      t++; draw();
      timer = setInterval(function () {
        if (!el.isConnected || t >= TICKS) { stop(); return; }
        t++; draw();
        if (t >= TICKS) stop();
      }, 900);
    });
    input.addEventListener('input', function () { stop(); t = +input.value; draw(); });
    draw();
  };

  /* ---------- Processes and threads: what's inside a process, and turns on a core ---------- */

  W['process-thread'] = function (el) {
    var PROCS = [
      { id: 'A', cls: 'pa', name: 'Process A', what: 'a web server, PID 1207',
        mem: 'your code, objects and caches', files: 'sockets to users and to the database, a log file',
        threads: [['A1', 'handling request 1'], ['A2', 'handling request 2'], ['A3', 'handling request 3']] },
      { id: 'B', cls: 'pb', name: 'Process B', what: 'a database, PID 2290',
        mem: 'table pages cached in RAM', files: 'data files, its network socket',
        threads: [['B1', 'running a query'], ['B2', 'writing to its log']] }
    ];
    var SLICES = [
      { cores: ['A1', 'B1'], queue: ['A2', 'B2'], sleep: { A3: 'waiting for the database' },
        say: 'A1 and B1 have the two cores. A2 and B2 are ready but wait in line. A3 is waiting for the database, so it sleeps and uses no CPU at all.' },
      { cores: ['A2', 'B2'], queue: ['A1', 'B1'], sleep: { A3: 'waiting for the database' },
        say: 'A few milliseconds later the kernel swaps them: A2 and B2 get the cores, and A1 and B1 go to the back of the line.' },
      { cores: ['A3', 'A1'], queue: ['B1', 'A2'], sleep: { B2: 'waiting for the disk' },
        say: 'The database answered, so A3 is ready again and gets a core. B2 has asked the disk for data, so now it sleeps.' },
      { cores: ['B1', 'A2'], queue: ['A3', 'A1'], sleep: { B2: 'waiting for the disk' },
        say: 'And round it goes: every ready thread gets a turn. With 4 threads ready and 2 cores, the load average is 4: 2 running, 2 waiting.' }
    ];
    var k = 0;
    function procOf(th) { return PROCS.filter(function (p) { return p.id === th[0]; })[0]; }
    function chip(th) { return '<span class="pt-chip ' + procOf(th).cls + '">' + th + '</span>'; }

    el.innerHTML =
      '<div class="pt-procs">' + PROCS.map(function (p, i) {
        return (i ? '<div class="pt-wall" aria-hidden="true"><span>Separate memory</span></div>' : '') +
          '<div class="pt-proc ' + p.cls + '">' +
            '<p class="pt-title"><b>' + p.name + '</b><span>' + esc(p.what) + '</span></p>' +
            '<div class="pt-mem"><b>Private memory</b><span>' + esc(p.mem) + '</span></div>' +
            '<div class="pt-mem"><b>Open files and connections</b><span>' + esc(p.files) + '</span></div>' +
            '<div class="pt-threads">' + p.threads.map(function (t) {
              return '<div class="pt-thread" data-th="' + t[0] + '"><b>Thread ' + t[0] + '</b><span class="pt-job">' + esc(t[1]) + '</span>' +
                '<span class="pt-own">own stack, own place in the code</span><span class="pt-state"></span></div>';
            }).join('') + '</div>' +
            '<p class="pt-note">' + (p.threads.length > 1 ? 'All ' + p.threads.length + ' threads share this memory and these files' : 'Its threads share this memory and these files') + '</p>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="pt-kernel"><b>Kernel scheduler</b><span>gives each ready thread a turn on a core, a few milliseconds at a time</span></div>' +
      '<div class="pt-hw">' +
        '<div class="pt-cores"><div class="pt-core"><small>Core 1</small><span class="pt-slot"></span></div><div class="pt-core"><small>Core 2</small><span class="pt-slot"></span></div></div>' +
        '<div class="pt-queue"><small>Ready, waiting in line for a core</small><span class="pt-slot"></span></div>' +
      '</div>' +
      '<div class="pt-controls"><button type="button" class="btn-sm" data-next>Next time slice</button><span class="pt-count"></span></div>' +
      '<p class="readout" aria-live="polite"></p>';

    var slots = el.querySelectorAll('.pt-core .pt-slot'), queue = el.querySelector('.pt-queue .pt-slot'),
        out = el.querySelector('.readout'), count = el.querySelector('.pt-count');
    function draw() {
      var s = SLICES[k];
      s.cores.forEach(function (th, i) { slots[i].innerHTML = chip(th); });
      queue.innerHTML = s.queue.map(chip).join('');
      el.querySelectorAll('.pt-thread').forEach(function (n) {
        var th = n.getAttribute('data-th'), ci = s.cores.indexOf(th), st = n.querySelector('.pt-state');
        n.classList.remove('running', 'ready', 'sleeping');
        if (ci >= 0) { n.classList.add('running'); st.textContent = 'Running on core ' + (ci + 1); }
        else if (s.queue.indexOf(th) >= 0) { n.classList.add('ready'); st.textContent = 'Ready, waiting for a core'; }
        else { n.classList.add('sleeping'); st.textContent = 'Sleeping: ' + s.sleep[th]; }
      });
      count.textContent = 'Time slice ' + (k + 1) + ' of ' + SLICES.length;
      out.innerHTML = s.say;
    }
    el.querySelector('[data-next]').addEventListener('click', function () { k = (k + 1) % SLICES.length; draw(); });
    draw();
  };

  /* ---------- Serving many requests: one event-loop thread, many connections ---------- */

  W['event-loop'] = function (el) {
    var W8 = { C1: 'user', C2: 'user', C3: 'db', C4: 'user', C5: 'db', C6: 'user', C7: 'api', C8: 'user' };
    var WAIT = { user: 'waiting for the user', db: 'waiting for the database', api: 'waiting for the payment API' };
    function merge(o) { var r = {}; for (var k in W8) r[k] = W8[k]; for (k in o) r[k] = o[k]; return r; }
    var STEPS = [
      { st: merge({}), ready: [],
        thread: 'Asks the kernel: “wake me when any of these 8 sockets has data” (<code>epoll_wait</code>). Then it sleeps, using no CPU.',
        say: 'All 8 connections are waiting: for their users, for the database, for the payment API. Nobody needs the thread, so it sleeps.' },
      { st: merge({ C2: 'ready:a new request arrived', C5: 'ready:the database answered' }), ready: ['C2', 'C5'],
        thread: 'Woken by the kernel with a short list: C2 and C5 are ready.',
        say: 'Data arrived on two sockets. The kernel noticed (it handles all network traffic anyway) and woke the thread with the list of ready ones.' },
      { st: merge({ C2: 'busy:reading the request, sending a database query', C5: 'ready:the database answered' }), ready: ['C5'],
        thread: 'Handles C2: reads the request, sends a query to the database, and moves on <strong>without waiting</strong> for the answer.',
        say: 'This takes the thread a fraction of a millisecond. The database will take 20 ms to answer, but the thread doesn’t wait for it.' },
      { st: merge({ C2: 'db', C5: 'busy:building the response, sending it' }), ready: [],
        thread: 'Handles C5: the database has answered, so it builds the response and sends it back to the user.',
        say: 'C2 is now waiting for the database, like C3. C5’s user gets their answer.' },
      { st: merge({ C2: 'db' }), ready: [],
        thread: 'The list is done, so it asks the kernel again and sleeps until the next socket is ready.',
        say: 'That’s one turn of the event loop. It repeats thousands of times a second, and one thread keeps all 8 connections moving, or 10,000.' }
    ];
    var k = 0;
    el.innerHTML =
      '<div class="ev-conns">' + Object.keys(W8).map(function (c) {
        return '<div class="ev-conn" data-c="' + c + '"><b>' + c + '</b><span class="ev-st"></span></div>';
      }).join('') + '</div>' +
      '<div class="ev-row">' +
        '<div class="ev-kernel"><small>Kernel: sockets with data ready</small><span class="ev-ready"></span></div>' +
        '<div class="ev-thread"><small>The one event-loop thread</small><p></p></div>' +
      '</div>' +
      '<div class="pt-controls"><button type="button" class="btn-sm" data-next>Next step</button><span class="pt-count"></span></div>' +
      '<p class="readout" aria-live="polite"></p>';
    var ready = el.querySelector('.ev-ready'), thread = el.querySelector('.ev-thread p'),
        out = el.querySelector('.readout'), count = el.querySelector('.pt-count');
    function draw() {
      var s = STEPS[k];
      el.querySelectorAll('.ev-conn').forEach(function (n) {
        var v = s.st[n.getAttribute('data-c')], kind = v.split(':')[0], text = v.indexOf(':') > 0 ? v.slice(v.indexOf(':') + 1) : WAIT[v];
        n.className = 'ev-conn ' + (kind === 'ready' ? 'ready' : kind === 'busy' ? 'busy' : 'waiting');
        n.querySelector('.ev-st').textContent = (kind === 'ready' ? 'Ready: ' : kind === 'busy' ? 'Thread is ' : '') + text;
      });
      ready.innerHTML = s.ready.length ? s.ready.map(function (c) { return '<span class="pt-chip pa">' + c + '</span>'; }).join('') : '<em>none</em>';
      thread.innerHTML = s.thread;
      count.textContent = 'Step ' + (k + 1) + ' of ' + STEPS.length;
      out.innerHTML = s.say;
    }
    el.querySelector('[data-next]').addEventListener('click', function () { k = (k + 1) % STEPS.length; draw(); });
    draw();
  };

  /* ---------- Processes and threads: the thread sweet spot ---------- */

  W['thread-sweet-spot'] = function (el) {
    /* Gunther's Universal Scalability Law, with threads as the load:
       throughput(n) = SOLO·n / (1 + σ(n−1) + κ·n(n−1)).
       σ is the share of each request spent under a lock every thread needs: threads queue for it,
       so the curve flattens. κ is the cost of keeping shared data in sync: when one thread changes
       it, every other core's cached copy goes stale and must be fetched again. That happens between
       every pair of threads, so it grows with n² and the curve falls. The peak is at n = √((1−σ)/κ).
       Every thread is kept busy, so response time = n ÷ throughput (Little's Law). */
    var SOLO = 20;                           /* requests a second one thread manages alone: 50 ms each */
    var SYNC = 0.0005;                       /* κ: puts the sweet spot at about 44 threads with a 5% lock */
    var lock = 5, pos = 40;                  /* pos is the threads slider: 2^(pos/10) threads, 1 to 256 */
    function threadsAt(v) { return Math.max(1, Math.round(Math.pow(2, v / 10))); }

    el.innerHTML =
      '<div class="ts-fields">' +
        '<div class="w-field"><label for="tsN">Threads</label><input type="range" id="tsN" min="0" max="80" value="' + pos + '"><output for="tsN"></output></div>' +
        '<div class="w-field"><label for="tsL">Share of each request spent under a shared lock</label><input type="range" id="tsL" min="0" max="20" value="' + lock + '"><output for="tsL"></output></div>' +      '</div>' +
      '<div class="ut-read" aria-live="polite"><b class="ut-big"></b><span class="ut-say"></span></div>' +
      legend([['ideal', 'Perfect scaling'], ['real', 'Your service'], ['hurt', 'Too many threads']]) +
      '<div class="chart"></div>' +
      '<p class="w-note">A busy service: one request takes 50 ms on its own, and there is enough traffic to keep every thread busy. Response time is threads ÷ throughput (Little’s Law).</p>';
    var box = el.querySelector('.chart'), inN = el.querySelector('#tsN'), inL = el.querySelector('#tsL'),
        big = el.querySelector('.ut-big'), say = el.querySelector('.ut-say');
    function draw() {
      var s = lock / 100, k = SYNC, n = threadsAt(pos);
      function X(t) { return SOLO * t / (1 + s * (t - 1) + k * t * (t - 1)); }
      var bestN = Math.round(Math.sqrt((1 - s) / k)), top = X(bestN), now = X(n);
      var wait = n / now * 1e9, bestWait = bestN / top * 1e9;           /* response times in ns, for fmtNs */

      var ax = niceAxis(top * 1.25);
      var Wd = Math.max(280, box.clientWidth), H = Wd < 520 ? 240 : 290;
      var m = { l: 48, r: 16, t: 30, b: 42 }, iw = Wd - m.l - m.r, ih = H - m.t - m.b;
      function x(t) { return m.l + Math.log2(t) / 8 * iw; }
      function y(v) { return m.t + ih - Math.min(v, ax.max) / ax.max * ih; }
      var real = [], ideal = [];
      for (var i = 0; i <= 160; i++) {
        var t = Math.pow(2, 8 * i / 160);
        real.push(x(t).toFixed(1) + ',' + y(X(t)).toFixed(1));
        if (SOLO * t <= ax.max) ideal.push(x(t).toFixed(1) + ',' + y(SOLO * t).toFixed(1));
      }
      if (ax.max / SOLO < 256) ideal.push(x(ax.max / SOLO).toFixed(1) + ',' + y(ax.max).toFixed(1));

      var g = '';
      for (var v = 0; v <= ax.max; v += ax.step) {
        g += '<line class="grid" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>' +
             '<text class="axis" x="' + (m.l - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + fmtInt(v) + '</text>';
      }
      (iw < 360 ? [1, 4, 16, 64, 256] : [1, 2, 4, 8, 16, 32, 64, 128, 256]).forEach(function (c) {
        g += '<text class="axis" x="' + x(c) + '" y="' + (m.t + ih + 20) + '" text-anchor="middle">' + c + '</text>';
      });

      /* Past the peak: shade it. Label the peak beside the dashed line, on the left if it fits. */
      var bx = x(bestN), label = 'sweet spot: ' + bestN + ' threads', lw = label.length * 6.2;
      var onLeft = bx - 8 - lw >= m.l, lx = onLeft ? bx - 8 : Math.min(bx + 8, m.l + iw - lw);
      var band = '<rect class="hurt" x="' + bx + '" y="' + m.t + '" width="' + (m.l + iw - bx) + '" height="' + ih + '"/>' +
                 '<line class="hurt-edge" x1="' + bx + '" x2="' + bx + '" y1="' + m.t + '" y2="' + (m.t + ih) + '"/>';

      box.innerHTML = '<svg width="' + Wd + '" height="' + H + '" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Requests a second against number of threads. Throughput peaks at about ' +
          bestN + ' threads, ' + fmtInt(top) + ' a second. With ' + n + ' threads: ' + fmtInt(now) + ' a second.">' +
        band + g +
        '<line class="base" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>' +
        '<text class="axis" x="' + (m.l + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Threads</text>' +
        '<text class="axis" x="' + m.l + '" y="14">Requests a second</text>' +
        '<polyline class="curve ideal" points="' + ideal.join(' ') + '"/>' +
        '<polyline class="curve" points="' + real.join(' ') + '"/>' +
        '<line class="cross" x1="' + x(n) + '" x2="' + x(n) + '" y1="' + y(now) + '" y2="' + (m.t + ih) + '"/>' +
        '<circle class="dot peak" cx="' + bx + '" cy="' + y(top) + '" r="5"/>' +
        '<text class="peak-label" x="' + lx + '" y="' + (y(top) - 12) + '" text-anchor="' + (onLeft ? 'end' : 'start') + '">' + label + '</text>' +
        '<circle class="dot" cx="' + x(n) + '" cy="' + y(now) + '" r="6"/>' +
        '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>' +
        '</svg>';
      box.querySelector('.hit').addEventListener('pointermove', function (e) {
        var rect = box.querySelector('svg').getBoundingClientRect();
        var p = Math.round(Math.max(0, Math.min(1, (e.clientX - rect.left - m.l) / iw)) * 80);
        if (p !== pos) { pos = p; inN.value = p; draw(); }
      });

      el.querySelector('#tsN + output').textContent = n;
      el.querySelector('#tsL + output').textContent = lock + '%';
      big.textContent = fmtInt(now);
      var verdict;
      if (now >= top * 0.95) verdict = '<strong>Around the sweet spot:</strong> close to the most this service can do.';
      else if (n < bestN) verdict = '<strong>Below the sweet spot.</strong> More threads still help, up to about ' + fmtInt(top) + ' a second at ' + bestN + ' threads.';
      else verdict = '<strong>Too many threads.</strong> ' + bestN + ' threads would serve ' + Math.round((top / now - 1) * 100) +
        '% more requests, each in ' + fmtNs(bestWait) + ' instead of ' + fmtNs(wait) + '.';
      say.innerHTML = 'requests a second with ' + n + ' thread' + (n === 1 ? '' : 's') + ', each taking about ' + fmtNs(wait) + '. ' + verdict;
    }
    inN.addEventListener('input', function () { pos = +inN.value; draw(); });
    inL.addEventListener('input', function () { lock = +inL.value; draw(); });
    draw();
    if (window.ResizeObserver) {
      var lastW = 0;
      new ResizeObserver(function () { if (Math.abs(box.clientWidth - lastW) > 4) { lastW = box.clientWidth; draw(); } }).observe(box);
    }
  };

  /* ---------- Networks: TCP slow start ---------- */

  W['slow-start'] = function (el) {
    var SIZES = [
      { value: '14', label: '14 KB', bytes: 14e3 },
      { value: '100', label: '100 KB', bytes: 100e3 },
      { value: '500', label: '500 KB', bytes: 500e3 },
      { value: '2000', label: '2 MB', bytes: 2e6 }
    ];
    var INIT = 10 * 1460;                /* initial window: 10 packets of 1,460 bytes */
    var size = '500', place = 'us';
    el.innerHTML = '<div class="w-controls ss-controls"></div><div class="ss-cols" aria-hidden="true"></div>' +
      '<p class="ss-axis">Round trip</p><p class="readout" aria-live="polite"></p>' +
      '<p class="w-note">Simplified: ideal slow start from a 10-packet window with no losses. The TCP and TLS handshakes add two more round trips on a new connection.</p>';
    var ctr = el.querySelector('.w-controls'), cols = el.querySelector('.ss-cols'), out = el.querySelector('.readout');
    ctr.appendChild(segmented('Response size', SIZES, size, function (v) { size = v; draw(); }));
    ctr.appendChild(segmented('Where the server is', PLACES, place, function (v) { place = v; draw(); }));

    function draw() {
      var s = SIZES.filter(function (x) { return x.value === size; })[0], r = placeBy(place).rtt;
      var left = s.bytes, cwnd = INIT, rounds = [];
      while (left > 0) { var sent = Math.min(cwnd, left); rounds.push(sent); left -= sent; cwnd *= 2; }
      var max = Math.max.apply(null, rounds);
      cols.innerHTML = rounds.map(function (b, i) {
        return '<div class="ss-col" tabindex="0" data-tip="<b>Round trip ' + (i + 1) + '</b><br>' + fmtNum(b / 1000) + ' KB sent">' +
          '<span class="ss-val">' + fmtNum(b / 1000) + ' KB</span>' +
          '<span class="ss-bar" style="height:' + Math.max(3, b / max * 100) + '%"></span>' +
          '<span class="ss-n">' + (i + 1) + '</span></div>';
      }).join('');
      var t = rounds.length * r, bw = s.bytes / 125e6 * 1000;
      out.innerHTML = rounds.length === 1
        ? 'A <strong>' + s.label + '</strong> response fits in the very first round trip: <strong>' + fmtMs(t) + '</strong> at this distance. That’s why the first 14 KB of a page matter.'
        : 'A <strong>' + s.label + '</strong> response on a new connection needs <strong>' + rounds.length + ' round trips</strong>: <strong>' +
          fmtMs(t) + '</strong> at this distance, while a 1 Gbps link could carry it in ' + fmtMs(bw) + '. A warm connection that has already grown its window can send it in about one.';
    }
    bindTips(el);
    draw();
  };

  /* ---------- How disks work: is the default cloud SSD enough? ---------- */

  W['disk-picker'] = function (el) {
    /* AWS EBS limits per volume (gp3 limits as raised in September 2025). Cloud SSDs count an
       operation bigger than 256 KB as several, and gp3 needs 1 IOPS for every 0.25 MB/s it moves. */
    var GP3 = { iops: 3000, mbs: 125, maxIops: 80000, maxMbs: 2000 };
    var IO2 = { maxIops: 256000, maxMbs: 4000 };
    var OPTIONS = [
      { id: 'gp3', name: 'Default gp3', short: 'Default gp3', what: '3,000 IOPS and 125 MB/s, included in the price' },
      { id: 'gp3x', name: 'gp3 with extra IOPS and throughput', short: 'gp3 + extras', what: 'Up to 80,000 IOPS and 2,000 MB/s. You pay only for what you add, and can change it while the volume is in use.' },
      { id: 'io2', name: 'io2 Block Express', short: 'io2', what: 'Up to 256,000 IOPS and 4,000 MB/s, with steadier sub-millisecond latency. Costs more per IOPS.' },
      { id: 'nvme', name: 'Local NVMe (instance store)', short: 'Local NVMe', what: 'The fastest there is. Its data is lost if the server stops, so only for data copied to other servers.' }
    ];
    var SIZES = [{ value: '4', label: '4 KB' }, { value: '8', label: '8 KB' }, { value: '16', label: '16 KB' },
                 { value: '64', label: '64 KB' }, { value: '256', label: '256 KB' }, { value: '1024', label: '1 MB' }];
    var st = { r: 2400, w: 600, kb: '8' };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><label for="dpR">Reads per second at the busiest hour</label><input type="range" id="dpR" min="0" max="20000" step="100" value="' + st.r + '"><output for="dpR"></output></div>' +
        '<div class="w-field"><label for="dpW">Writes per second at the busiest hour</label><input type="range" id="dpW" min="0" max="10000" step="100" value="' + st.w + '"><output for="dpW"></output></div>' +
        '<div class="w-field"><span class="lbl">Average size of one read or write</span><span class="cores"></span></div>' +
      '</div>' +
      '<div class="tiles tiles-3" aria-live="polite">' +
        '<div class="tile"><span>IOPS needed</span><b data-o="iops"></b><small>with 50% headroom</small></div>' +
        '<div class="tile"><span>Throughput needed</span><b data-o="mbs"></b><small>with 50% headroom</small></div>' +
        '<div class="tile key"><span>Recommended disk</span><b data-o="pick"></b><small data-o="set"></small></div>' +
      '</div>' +
      '<div class="dp-opts" role="list" aria-label="Disk options, simplest first"></div>' +
      '<p class="calc-math" data-o="say"></p>';
    el.querySelector('.cores').appendChild(segmented('Average size of one read or write', SIZES, st.kb, function (v) { st.kb = v; draw(); }));
    el.querySelector('#dpR').addEventListener('input', function (e) { st.r = +e.target.value; draw(); });
    el.querySelector('#dpW').addEventListener('input', function (e) { st.w = +e.target.value; draw(); });
    function o(n) { return el.querySelector('[data-o="' + n + '"]'); }
    function round100(n) { return Math.ceil(n / 100) * 100; }

    function draw() {
      var kb = +st.kb, ops = st.r + st.w;
      var iops = round100(ops * Math.ceil(kb / 256) * 1.5);
      var mbs = Math.ceil(ops * kb / 1000 * 1.5);
      /* gp3 needs 1 IOPS for every 0.25 MB/s, so a lot of throughput can mean buying IOPS too. */
      var gp3Iops = Math.max(GP3.iops, iops, round100(mbs * 4));
      var io2Iops = Math.max(100, iops, round100(mbs / 0.256));   /* io2 gives 0.256 MB/s per IOPS */
      var fits = {
        gp3: iops <= GP3.iops && mbs <= GP3.mbs,
        gp3x: gp3Iops <= GP3.maxIops && mbs <= GP3.maxMbs,
        io2: io2Iops <= IO2.maxIops && mbs <= IO2.maxMbs,
        nvme: true
      };
      var pick = OPTIONS.filter(function (x) { return fits[x.id]; })[0];

      el.querySelector('#dpR + output').textContent = fmtInt(st.r);
      el.querySelector('#dpW + output').textContent = fmtInt(st.w);
      o('iops').textContent = fmtInt(iops);
      o('mbs').textContent = fmtInt(mbs) + ' MB/s';
      o('pick').textContent = pick.short;

      var extras = [];
      if (gp3Iops > GP3.iops) extras.push(fmtInt(gp3Iops) + ' IOPS');
      if (mbs > GP3.mbs) extras.push(fmtInt(mbs) + ' MB/s');
      o('set').textContent = pick.id === 'gp3' ? 'Nothing to buy' :
        pick.id === 'gp3x' ? 'Set ' + extras.join(' and ') :
        pick.id === 'io2' ? 'Set ' + fmtInt(io2Iops) + ' IOPS' : 'Only for data copied elsewhere';

      el.querySelector('.dp-opts').innerHTML = OPTIONS.map(function (x) {
        var state = x === pick ? 'pick' : fits[x.id] ? 'fits' : 'no';
        var label = state === 'pick' ? 'Pick this' : state === 'fits' ? 'Also fits' : 'Too small';
        return '<div class="dp-opt ' + state + '" role="listitem"><div><b>' + x.name + '</b><span>' + x.what + '</span></div><em>' + label + '</em></div>';
      }).join('');

      var size = SIZES.filter(function (x) { return x.value === st.kb; })[0].label;
      var say = fmtInt(ops) + ' operations a second × ' + size + ' = <b>' + fmtNum(ops * kb / 1000) + ' MB/s</b> today. ';
      if (pick.id === 'gp3') {
        say += 'Both fit inside the default gp3 volume, with room to grow. There is nothing to buy.';
      } else if (pick.id === 'gp3x') {
        say += 'Keep the gp3 volume and set it to <b>' + extras.join('</b> and <b>') + '</b>. You pay only for the part above the included 3,000 IOPS and 125 MB/s. ';
        var lim = Math.floor(GP3.mbs * 1000 / kb);   /* operations a second before 125 MB/s runs out */
        if (mbs > GP3.mbs && lim < GP3.iops) say += 'At ' + size + ' each, 125 MB/s runs out at about ' + fmtInt(lim) + ' operations a second, before the IOPS limit does. ';
        if (gp3Iops > iops && gp3Iops > GP3.iops) say += 'The extra IOPS are there because gp3 needs 1 IOPS for every 0.25 MB/s it moves. ';
      } else if (pick.id === 'io2') {
        say += 'That is more than one gp3 volume can give (80,000 IOPS and 2,000 MB/s). io2 goes up to 256,000 IOPS and 4,000 MB/s, at a higher price per IOPS. ';
      } else {
        say += 'No single cloud volume reaches this. Use local NVMe on a storage-optimised server if the data is copied to other servers, or spread the data across several volumes or servers. ';
      }
      if (pick.id !== 'gp3' && st.r >= ops * 0.7) say += 'Most of this is reads: more RAM for the page cache (page 1.6) can answer many of them from memory, so measure again before you buy. ';
      if (mbs > 1000 || iops > 40000) say += 'Check the server too: each EC2 size caps how fast it can talk to its disks, and smaller sizes can’t use a fast volume’s full speed.';
      o('say').innerHTML = say;
    }
    draw();
  };

  /* ---------- Networks: how much bandwidth your responses need ---------- */

  W['net-picker'] = function (el) {
    /* AWS network specifications (Gbps). Sizes up to 4xlarge are sold as "up to" their burst figure,
       but only the baseline is steady; bursts last about 5 to 60 minutes. */
    var SERVERS = [
      { name: 'c7g.large', vcpu: 2, base: 0.937, burst: 12.5 },
      { name: 'c7g.xlarge', vcpu: 4, base: 1.876, burst: 12.5 },
      { name: 'c7g.2xlarge', vcpu: 8, base: 3.75, burst: 15 },
      { name: 'c7g.4xlarge', vcpu: 16, base: 7.5, burst: 15 },
      { name: 'c7g.8xlarge', vcpu: 32, base: 15, burst: 15 },
      { name: 'c7g.16xlarge', vcpu: 64, base: 30, burst: 30 }
    ];
    var NETWORK_OPT = [   /* the network-optimised family: far more bandwidth per vCPU */
      { name: 'c7gn.large', vcpu: 2, base: 6.25 }, { name: 'c7gn.xlarge', vcpu: 4, base: 12.5 },
      { name: 'c7gn.2xlarge', vcpu: 8, base: 25 }, { name: 'c7gn.4xlarge', vcpu: 16, base: 50 }
    ];
    var SIZES = [{ value: '2', label: '2 KB' }, { value: '20', label: '20 KB' }, { value: '100', label: '100 KB' },
                 { value: '500', label: '500 KB' }, { value: '2000', label: '2 MB' }, { value: '10000', label: '10 MB' }];
    var PER_GB = 0.09;    /* AWS data transfer out to the internet, first tier, per GB */
    var st = { rps: 100, kb: '2000' };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><label for="npR">Requests per second at the busiest hour</label><input type="range" id="npR" min="10" max="2000" step="10" value="' + st.rps + '"><output for="npR"></output></div>' +
        '<div class="w-field"><span class="lbl">Average size of one response</span><span class="cores"></span></div>' +
      '</div>' +
      '<div class="tiles tiles-3" aria-live="polite">' +
        '<div class="tile"><span>Bandwidth needed</span><b data-o="need"></b><small data-o="needmb"></small></div>' +
        '<div class="tile key"><span>Recommended server</span><b data-o="pick"></b><small data-o="pickwhy"></small></div>' +
        '<div class="tile"><span>Data out in that hour</span><b data-o="gb"></b><small data-o="cost"></small></div>' +
      '</div>' +
      '<div class="dp-opts" role="list" aria-label="Servers, smallest first"></div>' +
      '<p class="calc-math" data-o="say"></p>';
    el.querySelector('.cores').appendChild(segmented('Average size of one response', SIZES, st.kb, function (v) { st.kb = v; draw(); }));
    el.querySelector('#npR').addEventListener('input', function (e) { st.rps = +e.target.value; draw(); });
    function o(n) { return el.querySelector('[data-o="' + n + '"]'); }
    function rate(gbps) { return gbps >= 1 ? fmtNum(gbps) + ' Gbps' : fmtNum(gbps * 1000) + ' Mbps'; }
    /* AWS figures as published (0.937, 1.876), not rounded */
    function steady(s) { return s.base + ' Gbps steady' + (s.burst > s.base ? ', bursts to ' + s.burst + ' Gbps' : ''); }

    function draw() {
      var kb = +st.kb, mbs = st.rps * kb / 1000;          /* MB per second today */
      var gbpsNow = mbs * 8 / 1000, need = gbpsNow * 1.5;  /* with 50% headroom */
      var pick = SERVERS.filter(function (s) { return s.base >= need; })[0];
      var size = SIZES.filter(function (x) { return x.value === st.kb; })[0].label;
      var gb = st.rps * kb * 3600 / 1e6;

      el.querySelector('#npR + output').textContent = fmtInt(st.rps);
      o('need').textContent = rate(need);
      o('needmb').textContent = fmtNum(mbs * 1.5) + ' MB/s, with 50% headroom';
      o('pick').textContent = pick ? pick.name : 'Several servers';
      o('pickwhy').textContent = pick ? steady(pick) : 'or a CDN in front';
      o('gb').textContent = gb >= 1 ? fmtInt(gb) + ' GB' : fmtNum(gb * 1000) + ' MB';
      o('cost').textContent = gb * PER_GB >= 1 ? 'about $' + fmtInt(gb * PER_GB) + ' to the internet' : 'under $1 to the internet';

      el.querySelector('.dp-opts').innerHTML = SERVERS.map(function (s) {
        var state = s === pick ? 'pick' : s.base >= need ? 'fits' : s.burst >= need ? 'burst' : 'no';
        var label = { pick: 'Pick this', fits: 'Also fits', burst: 'Only in bursts', no: 'Too small' }[state];
        return '<div class="dp-opt ' + state + '" role="listitem"><div><b>' + s.name + '</b><span>' + steady(s) + ', ' + s.vcpu + ' vCPUs</span></div><em>' + label + '</em></div>';
      }).join('');

      var say = fmtInt(st.rps) + ' requests a second × ' + size + ' = <b>' + fmtNum(mbs) + ' MB/s</b>, or ' + rate(gbpsNow) + ', at the busiest hour. ';
      var large = SERVERS[0];
      if (pick === large) {
        say += 'Even with headroom, that fits in the steady ' + large.base + ' Gbps of a c7g.large, the app server from chapter 3. The network isn’t your limit here. ';
      } else if (pick) {
        say += 'That needs a <b>' + pick.name + '</b> for its steady ' + pick.base + ' Gbps. ';
        if (large.burst >= need) say += 'A c7g.large could only manage it in bursts, which last about 5 to 60 minutes. ';
        var opt = NETWORK_OPT.filter(function (s) { return s.base >= need; })[0];
        if (opt && opt.vcpu < pick.vcpu) say += 'If bandwidth is all you need, the network-optimised family gives far more per vCPU: a <b>' + opt.name + '</b> has ' + opt.base + ' Gbps steady with ' + opt.vcpu + ' vCPUs instead of ' + pick.vcpu + '. ';
      } else {
        say += 'No single c7g server has this much: spread the traffic over several servers behind a load balancer. ';
      }
      if (kb >= 500) say += 'Responses this big are usually files: serve them from object storage (S3) behind a CDN (CloudFront), and this traffic leaves your servers entirely. ';
      if (need > 5) say += 'Traffic that goes straight to the internet, not through a load balancer, is capped at 5 Gbps on servers with fewer than 32 vCPUs.';
      o('say').innerHTML = say;
    }
    draw();
  };

  /* ---------- 1.9  Capacity calculator ---------- */

  W['capacity'] = function (el) {
    /* Daily users slide on a log scale from 1,000 to 100 million. */
    function usersAt(t) {
      var v = Math.pow(10, 3 + 5 * t / 100);
      var mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
      return Math.round(v / mag) * mag;
    }
    var st = { t: 60, rpu: 20, peak: 3, cpu: 10, lat: 100, util: 70, cores: '8' };
    el.innerHTML =
      '<div class="calc">' +
        field('cUsers', 'Daily active users', '<input type="range" id="cUsers" min="0" max="100" value="' + st.t + '">') +
        field('cRpu', 'Requests per user per day', '<input type="range" id="cRpu" min="1" max="200" value="' + st.rpu + '">') +
        field('cPeak', 'Busiest hour vs average', '<input type="range" id="cPeak" min="1" max="10" step="0.5" value="' + st.peak + '">') +
        field('cCpu', 'CPU time per request', '<input type="range" id="cCpu" min="1" max="200" value="' + st.cpu + '">') +
        field('cLat', 'Total time per request', '<input type="range" id="cLat" min="10" max="2000" step="10" value="' + st.lat + '">') +
        field('cUtil', 'Highest utilisation you’ll accept', '<input type="range" id="cUtil" min="40" max="90" step="5" value="' + st.util + '">') +
        '<div class="w-field"><span class="lbl" id="cCoresL">Cores per server</span><span class="cores"></span></div>' +
      '</div>' +
      '<div class="tiles" aria-live="polite">' +
        '<div class="tile"><span>Average load</span><b data-o="avg"></b><small>requests a second</small></div>' +
        '<div class="tile"><span>Busiest hour</span><b data-o="peak"></b><small>requests a second</small></div>' +
        '<div class="tile"><span>Cores needed</span><b data-o="cores"></b><small>at the busiest hour</small></div>' +
        '<div class="tile"><span>In flight</span><b data-o="flight"></b><small>requests at once, at the busiest hour</small></div>' +
        '<div class="tile key"><span>Servers</span><b data-o="servers"></b><small data-o="spare"></small></div>' +
      '</div>' +
      '<p class="calc-math" data-o="math"></p>' +
      '<p class="w-note">CPU only. In real systems memory, the database or the network often runs out first; the next chapters deal with those.</p>';

    function field(id, label, input) {
      return '<div class="w-field"><label for="' + id + '">' + label + '</label>' + input + '<output for="' + id + '"></output></div>';
    }
    el.querySelector('.cores').appendChild(segmented('Cores per server', ['2', '4', '8', '16', '32', '64'].map(function (c) {
      return { value: c, label: c };
    }), st.cores, function (v) { st.cores = v; draw(); }));

    var ids = { cUsers: 't', cRpu: 'rpu', cPeak: 'peak', cCpu: 'cpu', cLat: 'lat', cUtil: 'util' };
    Object.keys(ids).forEach(function (id) {
      el.querySelector('#' + id).addEventListener('input', function (e) { st[ids[id]] = +e.target.value; draw(); });
    });
    function o(name) { return el.querySelector('[data-o="' + name + '"]'); }

    function draw() {
      var users = usersAt(st.t);
      var perDay = users * st.rpu;
      var avg = perDay / 86400;
      var peak = avg * st.peak;
      var busy = peak * st.cpu / 1000;
      var need = busy / (st.util / 100);
      var per = +st.cores;
      var servers = Math.max(1, Math.ceil(need / per));
      el.querySelector('#cUsers + output').textContent = fmtInt(users);
      el.querySelector('#cRpu + output').textContent = st.rpu;
      el.querySelector('#cPeak + output').textContent = st.peak + '×';
      el.querySelector('#cCpu + output').textContent = st.cpu + ' ms';
      el.querySelector('#cLat + output').textContent = fmtInt(st.lat) + ' ms';
      el.querySelector('#cUtil + output').textContent = st.util + '%';
      o('avg').textContent = fmtNum(avg);
      o('peak').textContent = fmtNum(peak);
      o('cores').textContent = fmtNum(need);
      o('flight').textContent = fmtNum(peak * st.lat / 1000);
      o('servers').textContent = servers;
      o('spare').textContent = 'of ' + per + ' cores, plus 1 spare';
      o('math').innerHTML = fmtInt(users) + ' users × ' + st.rpu + ' requests ÷ 86,400 s = <b>' + fmtNum(avg) + '/s</b> on average. ' +
        '× ' + st.peak + ' at the busiest hour = <b>' + fmtNum(peak) + '/s</b>. ' +
        '× ' + st.cpu + ' ms of CPU = <b>' + fmtNum(busy) + ' cores</b> busy. ' +
        '÷ ' + st.util + '% = <b>' + fmtNum(need) + ' cores</b>, so <b>' + servers + ' server' + (servers === 1 ? '' : 's') + '</b> of ' + per + ' cores, plus one spare. ' +
        'And ' + fmtNum(peak) + '/s × ' + fmtInt(st.lat) + ' ms each = <b>' + fmtNum(peak * st.lat / 1000) + ' requests in flight</b> (Little’s Law).';
    }
    draw();
  };

  /* ---------- Home: the users scale ---------- */

  W['user-scale'] = function (el) {
    var decades = [0, 1, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e7];
    function pos(v) { return v <= 0 ? 0 : (Math.log10(v) + 1) / 8 * 100; }
    /* One marker per chapter up to a million; the chapters past it share one marker at the end of the rail. */
    var stops = ZTM.chapters.filter(function (c) { return c.users !== null && c.users <= 1e6; });
    var beyond = ZTM.chapters.filter(function (c) { return c.users !== null && c.users > 1e6; });
    if (beyond.length) stops.push({ n: beyond[0].n, label: beyond[0].n + '–' + beyond[beyond.length - 1].n, title: 'Beyond a million', users: 1e7 });
    var always = ZTM.chapters.filter(function (c) { return c.users === null; });
    el.innerHTML =
      '<div class="us-count"><b class="us-num">0</b><span class="us-unit">users</span></div>' +
      '<div class="us-rail">' +
        '<div class="us-line"><span class="us-fill"></span><span class="us-head"></span></div>' +
        decades.map(function (d) { return '<span class="us-dec" style="left:' + pos(d) + '%">' + ZTM.usersLabel(d) + '</span>'; }).join('') +
        /* Labels alternate between two lanes so neighbours never collide. */
        stops.map(function (c, i) {
          var cls = 'us-stop' + (c.label ? ' lane-c' : i % 2 ? ' lane-b' : '') + (i === 0 ? ' first' : '') + (i === stops.length - 1 ? ' last' : '');
          return '<a class="' + cls + '" href="#/' + c.n + '" style="left:' + pos(c.users) + '%" data-at="' + pos(c.users) + '">' +
            '<i></i><span><em>' + (c.label || c.n) + '</em> ' + esc(c.title) + '</span></a>';
        }).join('') +
      '</div>' +
      always.map(function (c) {
        return '<a class="us-always" href="#/' + c.n + '"><span><em>' + c.n + '</em> ' + esc(c.title) + '</span><small>at every stage</small></a>';
      }).join('');

    var num = el.querySelector('.us-num'), fill = el.querySelector('.us-fill'), head = el.querySelector('.us-head');
    var stopEls = el.querySelectorAll('.us-stop');
    var END = pos(1e6);
    function usersAtPos(p) {
      var f = p / 100 * 8;
      return f < 1 ? Math.round(f) : Math.round(Math.pow(10, f - 1));
    }
    function paint(p) {
      fill.style.width = p + '%';
      head.style.left = p + '%';
      num.textContent = fmtInt(p >= END ? 1e6 : usersAtPos(p));
      stopEls.forEach(function (s) { s.classList.toggle('reached', +s.dataset.at <= p + 0.01); });
    }
    if (reduceMotion) { paint(END); return; }
    paint(0);
    var start = null, DUR = 3200;
    function step(ts) {
      if (!el.isConnected) return;
      if (start === null) start = ts;
      var k = Math.min(1, (ts - start) / DUR);
      var e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   /* ease in-out */
      paint(e * END);
      if (k < 1) requestAnimationFrame(step);
    }
    setTimeout(function () { requestAnimationFrame(step); }, 400);
  };
})();
