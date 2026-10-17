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
    snap: '<path d="M8 12h4l2-3h4l2 3h4v11H8z"/><circle cx="16" cy="17" r="3.5"/>'
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
      '<div class="pt-controls"><button type="button" class="btn-sm" data-next>Follow a request</button><span class="pt-count"></span></div>' +
      '<p class="readout" aria-live="polite"></p>';

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
        if (x[3] === 'h') {
          var x1 = A.r + 3, x2 = B.l - 3, mx = (x1 + x2) / 2;
          pts = Math.abs(A.cy - B.cy) < 2 ? [[x1, A.cy], [x2, A.cy]] : [[x1, A.cy], [mx, A.cy], [mx, B.cy], [x2, B.cy]];
          lx = x1 + 6; ly = A.cy - 8;
        } else if (x[3] === 'u') {   /* under a row: down, across, back up */
          var yb = Math.max(A.b, B.b) + 18;
          pts = [[A.cx, A.b + 3], [A.cx, yb], [B.cx, yb], [B.cx, B.b + 3]];
          lx = (A.cx + B.cx) / 2 - 24; ly = yb + 14;
        } else {   /* 'v' turns halfway down; 'vt' turns just above the target, below a label at the top of its box */
          var y1 = A.b + 3, y2 = B.t - 3, my = x[3] === 'vt' ? y2 - 14 : (y1 + y2) / 2;
          pts = Math.abs(A.cx - B.cx) < 2 ? [[A.cx, y1], [A.cx, y2]] : [[A.cx, y1], [A.cx, my], [B.cx, my], [B.cx, y2]];
          lx = Math.max(A.cx, B.cx) + 8; ly = my + 4;
        }
        for (var i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]);
        bends = bends.concat(pts.slice(1, -1));
        var d = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join('L');
        /* requests go both ways; a backup (one-way) is marked with a fifth flag */
        var oneWay = !!x[5];
        w += '<path data-w="' + x[0] + '" class="wire' + (oneWay ? ' slow' : '') + '" d="' + d + '"' + (oneWay ? '' : ' marker-start="url(#' + head + ')"') + ' marker-end="url(#' + head + ')"/>';
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
        out.innerHTML = 'Live traffic: each dot is one request, orange on its way in and teal on its way back. Press <strong>Follow a request</strong> to go through it step by step.';
        btn.textContent = 'Follow a request';
        live();
        return;
      }
      count.textContent = 'Step ' + (k + 1) + ' of ' + STEPS.length + ': ' + s.t;
      out.innerHTML = s.say;
      btn.textContent = k === STEPS.length - 1 ? 'Back to live traffic' : 'Next step';
      animate(s.run);
    }
    btn.addEventListener('click', function () { k = k === STEPS.length - 1 ? -1 : k + 1; draw(); });

    layout();
    draw();
    if (window.ResizeObserver) new ResizeObserver(function () { layout(); }).observe(box);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  }

  /* Chapter 2: the pilot, everything on one server. */
  W['pilot-arch'] = function (el) {
    var node = archNode;
    liveArch(el, {
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sg', 'v', ''],
        ['ng', 'sg', 'nginx', 'h', ''],
        ['app', 'nginx', 'app', 'h', ''],
        ['sql', 'app', 'db', 'h', ''],
        ['io', 'db', 'disk', 'v', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true]
      ],
      request: [['in', 0], ['fw', 0], ['ng', 0], ['app', 0], ['sql', 0], ['sql', 1], ['app', 1], ['ng', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'dns'], run: [['dns', 0], ['dns', 1]], t: '~20 ms, then cached',
          say: '<strong>Find the server.</strong> The browser asks DNS for <code>app.example.com</code>. Route 53 answers with the server’s Elastic IP. The answer is cached, so this happens rarely.' },
        { on: ['users', 'eip', 'sg', 'nginx'], run: [['in', 0], ['fw', 0], ['ng', 0]], t: '~40 ms: 2 round trips to Mumbai',
          say: '<strong>Connect.</strong> The browser opens a connection to the Elastic IP. The security group lets port 443 through, and Nginx completes the TCP and TLS handshakes.' },
        { on: ['nginx', 'app'], run: [['app', 0]], t: 'microseconds',
          say: '<strong>Hand over.</strong> Nginx forwards the request to a FastAPI worker over <code>localhost</code>. It never leaves the machine.' },
        { on: ['app', 'db', 'disk'], run: [['sql', 0], ['sql', 1]], t: '~5 ms of work, ~1 ms per query',
          say: '<strong>Do the work.</strong> FastAPI runs the endpoint and queries PostgreSQL, also over <code>localhost</code>: no network round trip. If the data isn’t in RAM, PostgreSQL reads it from the disk.' },
        { on: ['nginx', 'app', 'users'], run: [['app', 1], ['ng', 1], ['fw', 1], ['in', 1]], t: '~20 ms: 1 round trip',
          say: '<strong>Answer.</strong> The response goes back through Nginx to the browser. First request: about 85 ms in all. Later requests on the same connection skip DNS and the handshakes: about 25 ms.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', 'in Bangalore') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for app.example.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC, public subnet</p>' +
            '<div class="ar2-row">' +
              '<div class="ar2-edge">' +
                node('eip', 'ip', 'c-net', 'Elastic IP', 'fixed public address') +
                node('sg', 'shield', 'c-sec', 'Security group', '443 open, 22 from the office') +
              '</div>' +
              '<div class="ar2-ec2"><p class="ar2-k">' + icon('chip', 'c-cpu') + 'EC2 t4g.nano: 2 vCPUs, 512 MB. Inside, everything talks over localhost.</p>' +
                '<div class="ar2-sw">' +
                  node('nginx', 'proxy', 'c-sw', 'Nginx', 'HTTPS, port 443') +
                  node('app', 'bolt', 'c-sw', 'FastAPI', '2 workers') +
                  node('db', 'db', 'c-sw', 'PostgreSQL', 'on localhost') +
                '</div>' +
                '<div class="ar2-disk">' + node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '20 GB') + '</div>' +
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
          say: '<strong>Find the server.</strong> DNS still points <code>app.example.com</code> at the Elastic IP, now attached to the app server.' },
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
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for app.example.com') +
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
                    node('nginx', 'proxy', 'c-sw', 'Nginx', 'HTTPS, port 443') +
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
       90% fast (a product page, 100 ms) and 10% slow (a chat answer, 2 s). */
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
      legend([['lbfast', 'Product page: 100 ms of work'], ['lbslow', 'Chat answer: 2 s of work']]) +
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
        ? '<strong>Round robin</strong> alternates between the servers without looking at them. When one server’s workers are all busy with chats, product pages still get sent there, and wait in its queue while the other server has free workers.'
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
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'eip', 'h', 'HTTPS'],
        ['fw', 'eip', 'sg', 'v', ''],
        ['lb', 'sg', 'lb', 'h', ''],
        ['a1', 'lb', 'app1', 'v', ''],
        ['a2', 'lb', 'app2', 'v', 'least connections'],
        ['d1', 'app1box', 'db', 'v', ''],
        ['d2', 'app2box', 'db', 'v', ''],
        ['io', 'db', 'disk', 'h', ''],
        ['bak', 'disk', 'snap', 'v', 'daily', true]
      ],
      request: [['in', 0], ['fw', 0], ['lb', 0], ['a1', 0], ['d1', 0], ['d1', 1], ['a1', 1], ['lb', 1], ['fw', 1], ['in', 1],
                ['in', 0], ['fw', 0], ['lb', 0], ['a2', 0], ['d2', 0], ['d2', 1], ['a2', 1], ['lb', 1], ['fw', 1], ['in', 1]],
      steps: [
        { on: ['users', 'dns'], run: [['dns', 0], ['dns', 1]], t: '~20 ms, then cached',
          say: '<strong>Find the service.</strong> DNS now points <code>app.example.com</code> at the load balancer’s Elastic IP. Users never see the app servers directly.' },
        { on: ['users', 'eip', 'sg', 'lb'], run: [['in', 0], ['fw', 0], ['lb', 0]], t: '~40 ms: 2 round trips to Mumbai',
          say: '<strong>Connect to the load balancer.</strong> The browser’s HTTPS connection ends at Nginx, which holds the TLS certificate. Behind it, everything stays on the private network.' },
        { on: ['lb', 'app1', 'app2'], run: [['a2', 0]], t: 'a fraction of a millisecond',
          say: '<strong>Choose a server.</strong> Nginx uses least connections: app server 1 has 7 requests in progress, app server 2 has 3, so this one goes to server 2.' },
        { on: ['app2', 'db', 'disk'], run: [['d2', 0], ['d2', 1]], t: '~0.2–0.5 ms per query',
          say: '<strong>Do the work.</strong> FastAPI on server 2 queries PostgreSQL over the private network, through its connection pool. Both app servers share the same database.' },
        { on: ['app2', 'lb', 'users'], run: [['a2', 1], ['lb', 1], ['fw', 1], ['in', 1]], t: '~20 ms: 1 round trip',
          say: '<strong>Answer.</strong> The response goes back through Nginx to the browser. The user can’t tell, and doesn’t need to know, which server answered.' },
        { on: ['lb', 'app2'], run: [['a2', 0]], t: 'after 3 failed attempts',
          say: '<strong>If a server fails.</strong> When requests to app server 1 keep failing, Nginx stops sending it traffic for a while and server 2 takes everything. That’s why each server needs room to spare.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', '10,000 of them') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for app.example.com') +
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
                '<div class="ar3-two">' +
                  node('db', 'db', 'c-sw', 'PostgreSQL', 'shared by both app servers') +
                  node('disk', 'disk', 'c-sto', 'EBS gp3 disk', '100 GB') +
                '</div>' +
                '<p class="ar2-k ar4-cap">' + icon('db', 'c-db') + 'Database server: EC2 r7g.large, 2 vCPUs, 16 GB</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar2-bak">' + node('snap', 'snap', 'c-sto', 'EBS snapshots', 'daily backup') + '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 5: a primary for writes, replicas for reads ---------- */

  W['replica-live'] = function (el) {
    var node = archNode;
    liveArch(el, {
      wires: [
        ['dns', 'users', 'dns', 'v', 'DNS lookup'],
        ['in', 'users', 'lb', 'h', 'HTTPS'],
        ['lb1', 'lb', 'app1', 'vt', ''],
        ['lb2', 'lb', 'app2', 'vt', ''],
        ['lb3', 'lb', 'app3', 'vt', ''],
        ['q1', 'app1', 'rep1', 'v', ''],
        ['q2', 'app3', 'primary', 'v', 'SQL'],
        ['q3', 'app2', 'rep2', 'v', ''],
        ['wal1', 'primary', 'rep1', 'h', 'WAL', true],
        ['wal2', 'primary', 'rep2', 'u', 'WAL stream', true]
      ],
      joints: true,
      request: [['in', 0], ['lb1', 0], ['q1', 0], ['q1', 1], ['lb1', 1], ['in', 1],
                ['in', 0], ['lb3', 0], ['q2', 0], ['wal1', 0], ['wal2', 0], ['q2', 1], ['lb3', 1], ['in', 1],
                ['in', 0], ['lb2', 0], ['q3', 0], ['q3', 1], ['lb2', 1], ['in', 1]],
      steps: [
        { on: ['users', 'lb', 'app1', 'rep1'], run: [['in', 0], ['lb1', 0], ['q1', 0], ['q1', 1], ['lb1', 1], ['in', 1]], t: 'a read',
          say: '<strong>Open a conversation.</strong> The load balancer sends the request to app server 1. Loading the conversation only reads data, so the app sends the query to a replica, and replica 1 answers from its own copy.' },
        { on: ['users', 'lb', 'app3', 'primary'], run: [['in', 0], ['lb3', 0], ['q2', 0], ['q2', 1], ['lb3', 1], ['in', 1]], t: 'a write',
          say: '<strong>Ask a question.</strong> This request lands on app server 3. Saving the question changes data, so it goes to the primary, whichever app server sends it. Every <code>INSERT</code>, <code>UPDATE</code> and <code>DELETE</code> does.' },
        { on: ['primary', 'rep1', 'rep2'], run: [['wal1', 0], ['wal2', 0]], t: 'usually a few milliseconds',
          say: '<strong>Stream the change.</strong> The primary appends the new message to its write-ahead log, and streams that record to both replicas over the private network.' },
        { on: ['rep1', 'rep2'], run: [], t: 'applied in the same order',
          say: '<strong>Replay it.</strong> Each replica applies the record exactly as the primary did, in the same order. A few milliseconds after the write, both replicas have the question too.' },
        { on: ['users', 'lb', 'app2', 'rep2'], run: [['in', 0], ['lb2', 0], ['q3', 0], ['q3', 1], ['lb2', 1], ['in', 1]], t: 'reads spread across replicas',
          say: '<strong>Spread the reads.</strong> Every app server can reach every database. The next read lands on app server 2 and goes to replica 2. The primary is left with the writes, and each new replica adds more read capacity.' }
      ],
      html:
        '<div class="ar2-left">' +
          node('users', 'user', 'c-user', 'Users', '100,000 of them') +
          node('dns', 'dns', 'c-net', 'Route 53', 'DNS for app.example.com') +
        '</div>' +
        '<div class="ar2-region">' +
          '<p class="ar2-k">AWS region: Asia Pacific (Mumbai), ap-south-1</p>' +
          '<div class="ar2-vpc"><p class="ar2-k">VPC</p>' +
            '<div class="ar3-subnet"><p class="ar2-k">Public subnet</p>' +
              '<div class="ar5-mid">' + node('lb', 'proxy', 'c-net', 'Load balancer', 'least connections') + '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private"><p class="ar2-k">Private subnet: app servers</p>' +
              '<div class="ar5-apps">' +
                node('app1', 'bolt', 'c-cpu', 'App server 1', 'FastAPI, 8 workers') +
                node('app2', 'bolt', 'c-cpu', 'App server 2', 'FastAPI, 8 workers') +
                node('app3', 'bolt', 'c-cpu', 'App server 3', 'FastAPI, 8 workers') +
              '</div>' +
            '</div>' +
            '<div class="ar3-subnet ar3-private ar5-sub">' +
              '<div class="ar5-db">' +
                node('primary', 'db', 'c-db', 'Primary', 'every write, and reads that must be fresh') +
                node('rep1', 'db', 'c-db', 'Replica 1', 'read-only copy') +
                node('rep2', 'db', 'c-db', 'Replica 2', 'read-only copy') +
              '</div>' +
              '<p class="ar2-k ar5-foot">Private subnet: database</p>' +
            '</div>' +
          '</div>' +
        '</div>'
    });
  };

  /* ---------- Chapter 5: replication lag on a timeline ---------- */

  W['lag-sim'] = function (el) {
    var RELOAD = 150, SPAN = 2000;   /* the page reloads 150 ms after the write; the timeline shows 2 seconds */
    var st = { lag: 400, ryw: false };
    el.innerHTML =
      '<div class="calc">' +
        '<div class="w-field"><label for="lgL">Replication lag right now</label><input type="range" id="lgL" min="0" max="1800" step="50" value="' + st.lag + '"><output for="lgL"></output></div>' +
        '<label class="ql-check"><input type="checkbox" id="lgR"> Read your own writes: send this user’s reads to the primary just after they write</label>' +
      '</div>' +
      legend([['has', 'Has your question'], ['hasnt', 'Doesn’t have it yet']]) +
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
        ? 'The reload reads from the ' + from + ', which already has the question: <strong>the user sees it</strong>.'
        : 'The reload reads from the replica, which won’t have the question for another ' + (st.lag - RELOAD) + ' ms: <strong>the user’s own question is missing</strong>.';
      out.innerHTML = st.ryw
        ? 'For a short window after this user writes, their reads go to the primary, which always has the latest data. Everyone else keeps reading from the replicas.'
        : 'The user asks a question at 0 ms, and the page reloads the conversation 150 ms later. Drag the lag past 150 ms to see the problem, then turn on read your own writes.';
    }
    draw();
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
    var BASE_IOPS = 3000, BASE_MBS = 125;          /* AWS gp3 without extras */
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
        '<div class="tile key"><span>Default cloud SSD</span><b data-o="ok"></b><small>3,000 IOPS and 125 MB/s</small></div>' +
      '</div>' +
      '<p class="calc-math" data-o="say"></p>' +
      '<p class="w-note">Based on AWS gp3, where IOPS and throughput can be bought separately. Cloud SSDs count an operation bigger than 256 KB as several.</p>';
    el.querySelector('.cores').appendChild(segmented('Average size of one read or write', SIZES, st.kb, function (v) { st.kb = v; draw(); }));
    el.querySelector('#dpR').addEventListener('input', function (e) { st.r = +e.target.value; draw(); });
    el.querySelector('#dpW').addEventListener('input', function (e) { st.w = +e.target.value; draw(); });
    function o(n) { return el.querySelector('[data-o="' + n + '"]'); }
    function round100(n) { return Math.ceil(n / 100) * 100; }

    function draw() {
      var kb = +st.kb, ops = st.r + st.w;
      var iops = round100(ops * Math.ceil(kb / 256) * 1.5);
      var mbs = Math.ceil(ops * kb / 1000 * 1.5);
      var iopsOk = iops <= BASE_IOPS, mbsOk = mbs <= BASE_MBS;
      el.querySelector('#dpR + output').textContent = fmtInt(st.r);
      el.querySelector('#dpW + output').textContent = fmtInt(st.w);
      o('iops').textContent = fmtInt(iops);
      o('mbs').textContent = fmtInt(mbs) + ' MB/s';
      o('ok').textContent = iopsOk && mbsOk ? 'Enough' : 'Not enough';
      var lim = Math.floor(BASE_MBS * 1000 / kb);   /* ops per second before 125 MB/s runs out */
      var say = fmtInt(ops) + ' operations a second × ' + SIZES.filter(function (x) { return x.value === st.kb; })[0].label +
        ' = <b>' + fmtNum(ops * kb / 1000) + ' MB/s</b> today. ';
      if (iopsOk && mbsOk) {
        say += 'Both fit inside the default 3,000 IOPS and 125 MB/s, with room to grow.';
      } else {
        var fix = [];
        if (!iopsOk) fix.push('about <b>' + fmtInt(iops) + ' IOPS</b>');
        if (!mbsOk) fix.push('about <b>' + fmtInt(mbs) + ' MB/s</b>');
        say += 'Buy ' + fix.join(' and ') + ' on the same volume. ';
        if (!mbsOk && lim < BASE_IOPS) say += 'At ' + st.kb + ' KB each, 125 MB/s runs out at about ' + fmtInt(lim) + ' operations a second, before the IOPS limit does. ';
        if (iops > 16000) say += 'That is a lot for one general-purpose volume: look at a high-IOPS volume (AWS io2), or local NVMe if the data is replicated.';
      }
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
    var stops = ZTM.chapters.filter(function (c) { return c.users !== null; });
    var always = ZTM.chapters.filter(function (c) { return c.users === null; });
    el.innerHTML =
      '<div class="us-count"><b class="us-num">0</b><span class="us-unit">users</span></div>' +
      '<div class="us-rail">' +
        '<div class="us-line"><span class="us-fill"></span><span class="us-head"></span></div>' +
        decades.map(function (d) { return '<span class="us-dec" style="left:' + pos(d) + '%">' + ZTM.usersLabel(d) + '</span>'; }).join('') +
        /* Labels alternate between two lanes so neighbours never collide. */
        stops.map(function (c, i) {
          var cls = 'us-stop' + (i % 2 ? ' lane-b' : '') + (i === 0 ? ' first' : '') + (i === stops.length - 1 ? ' last' : '');
          return '<a class="' + cls + '" href="#/' + c.n + '" style="left:' + pos(c.users) + '%" data-at="' + pos(c.users) + '">' +
            '<i></i><span><em>' + c.n + '</em> ' + esc(c.title) + '</span></a>';
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
