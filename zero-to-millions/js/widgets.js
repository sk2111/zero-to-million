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
    var humanTicks = ['1 s', '10 s', '2 min', '17 min', '3 h', '1 day', '12 days', '4 mo', '3 yr'];
    var mode = 'real';

    var grid = ticks.map(function (t) { return '<i class="gl" style="left:' + pos(t) + '%"></i>'; }).join('');
    el.innerHTML = '<div class="w-controls"></div>' +
      legend([['cpu', 'CPU and memory'], ['disk', 'Disk'], ['net', 'Network']]) +
      '<div class="ladder">' +
        '<div class="ld-row ld-axis" aria-hidden="true"><span></span><span class="ld-track">' +
          ticks.map(function (t, i) { return '<span class="tick" style="left:' + pos(t) + '%" data-i="' + i + '"></span>'; }).join('') +
        '</span><span></span></div>' +
        rows.map(function (r) {
          return '<div class="ld-row" tabindex="0" data-ns="' + r[2] + '" data-tip="">' +
            '<span class="ld-label">' + esc(r[1]) + '</span>' +
            '<span class="ld-track">' + grid + '<span class="ld-bar ' + r[0] + '" style="width:' + pos(r[2]) + '%"></span></span>' +
            '<span class="ld-value"></span></div>';
        }).join('') +
      '</div><p class="readout" aria-live="polite"></p>';
    var out = el.querySelector('.readout');
    el.querySelector('.w-controls').appendChild(segmented('Time scale', [
      { value: 'real', label: 'Real time' }, { value: 'human', label: 'If 1 ns were 1 second' }
    ], mode, function (v) { mode = v; draw(); }));

    function draw() {
      var human = mode === 'human';
      el.querySelectorAll('.tick').forEach(function (t) {
        var i = +t.dataset.i;
        t.textContent = human ? humanTicks[i] : fmtNs(ticks[i]);
      });
      el.querySelectorAll('.ld-row[data-ns]').forEach(function (row, i) {
        var ns = +row.dataset.ns, r = rows[i];
        var v = human ? fmtHuman(ns) : fmtNs(ns);
        row.querySelector('.ld-value').textContent = (human ? '' : '~') + v;
        row.setAttribute('data-tip', '<b>' + esc(r[1]) + '</b><br>~' + fmtNs(ns) + ', or ' + fmtHuman(ns) + ' on the human scale<br><span class="tip-note">' + esc(r[3]) + '</span>');
        row.setAttribute('aria-label', r[1] + ': about ' + fmtNs(ns) + '; ' + fmtHuman(ns) + ' on the human scale');
      });
      out.innerHTML = human
        ? 'If reading from the L1 cache took one second, reading from RAM would take <strong>' + fmtHuman(100) + '</strong>, one SSD read <strong>' +
          fmtHuman(1e5) + '</strong>, and a round trip to the US <strong>' + fmtHuman(2e8) + '</strong>.'
        : 'Every bar is on a log scale: each gridline is ten times the one before. From the top row to the bottom is a factor of 200 million.';
    }
    bindTips(el);
    draw();
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

  /* ---------- Processes and threads: Amdahl's Law ---------- */

  W['amdahl'] = function (el) {
    var CORES = [1, 2, 4, 8, 16, 32, 64, 128];
    var p = 95, ci = 3;
    el.innerHTML =
      '<div class="am-fields">' +
        '<div class="w-field"><label for="amP">Share of the work that can run in parallel</label><input type="range" id="amP" min="50" max="100" value="' + p + '"><output for="amP"></output></div>' +
        '<div class="w-field"><label for="amC">Cores</label><input type="range" id="amC" min="0" max="7" value="' + ci + '"><output for="amC"></output></div>' +
      '</div>' +
      '<div class="ut-read" aria-live="polite"><b class="ut-big"></b><span class="ut-say"></span></div>' +
      legend([['ideal', 'Perfect scaling'], ['real', 'Your program'], ['usl', 'Your program, with coordination costs']]) +
      '<div class="chart"></div>';
    var box = el.querySelector('.chart'), inP = el.querySelector('#amP'), inC = el.querySelector('#amC'),
        big = el.querySelector('.ut-big'), say = el.querySelector('.ut-say');
    function S(f, n) { return 1 / ((1 - f) + f / n); }
    /* Gunther's Universal Scalability Law: the serial share (as in Amdahl) plus a small cost
       for every pair of threads that must coordinate (locks, shared memory). */
    var BETA = 0.0005;
    function U(f, n) { return n / (1 + (1 - f) * (n - 1) + BETA * n * (n - 1)); }

    function draw() {
      var f = p / 100, n = CORES[ci], sp = S(f, n), limit = f < 1 ? 1 / (1 - f) : Infinity;
      var ax = niceAxis(Math.max(8, S(f, 128) * 1.15));
      var Wd = Math.max(280, box.clientWidth), H = Wd < 520 ? 240 : 290;
      var m = { l: 44, r: 16, t: 30, b: 42 }, iw = Wd - m.l - m.r, ih = H - m.t - m.b;
      function x(c) { return m.l + Math.log2(c) / 7 * iw; }
      function y(v) { return m.t + ih - Math.min(v, ax.max) / ax.max * ih; }
      var real = [], ideal = [], usl = [];
      var peakN = Math.min(128, Math.max(1, Math.sqrt(f / BETA))), peak = U(f, peakN);
      for (var i = 0; i <= 140; i++) {
        var c = Math.pow(2, 7 * i / 140);
        real.push(x(c).toFixed(1) + ',' + y(S(f, c)).toFixed(1));
        usl.push(x(c).toFixed(1) + ',' + y(U(f, c)).toFixed(1));
        if (c <= ax.max) ideal.push(x(c).toFixed(1) + ',' + y(c).toFixed(1));
      }
      if (ax.max < 128) ideal.push(x(ax.max).toFixed(1) + ',' + y(ax.max).toFixed(1));
      var g = '';
      for (var t = 0; t <= ax.max; t += ax.step) {
        g += '<line class="grid" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(t) + '" y2="' + y(t) + '"/>' +
             '<text class="axis" x="' + (m.l - 8) + '" y="' + (y(t) + 4) + '" text-anchor="end">' + t + '×</text>';
      }
      CORES.forEach(function (c) {
        g += '<text class="axis" x="' + x(c) + '" y="' + (m.t + ih + 20) + '" text-anchor="middle">' + c + '</text>';
      });
      var lim = '';
      if (limit <= ax.max) {
        lim = '<line class="limit" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + y(limit) + '" y2="' + y(limit) + '"/>' +
              '<text class="band-label" x="' + (m.l + 6) + '" y="' + (y(limit) - 6) + '">limit ' + fmtNum(limit) + '×</text>';
      }
      box.innerHTML = '<svg width="' + Wd + '" height="' + H + '" viewBox="0 0 ' + Wd + ' ' + H + '" role="img" aria-label="Speed-up against number of cores. With ' +
          p + '% parallel work, ' + n + ' cores give ' + fmtNum(sp) + ' times.">' +
        g + lim +
        '<line class="base" x1="' + m.l + '" x2="' + (m.l + iw) + '" y1="' + (m.t + ih) + '" y2="' + (m.t + ih) + '"/>' +
        '<text class="axis" x="' + (m.l + iw / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Cores</text>' +
        '<text class="axis" x="' + m.l + '" y="14">Speed-up</text>' +
        '<polyline class="curve ideal" points="' + ideal.join(' ') + '"/>' +
        '<polyline class="curve" points="' + real.join(' ') + '"/>' +
        '<polyline class="curve usl" points="' + usl.join(' ') + '"/>' +
        '<circle class="dot usl" cx="' + x(peakN) + '" cy="' + y(peak) + '" r="5"/>' +
        '<text class="usl-label" x="' + x(peakN) + '" y="' + (y(peak) + 20) + '" text-anchor="middle">sweet spot, about ' + Math.round(peakN) + ' cores</text>' +
        '<line class="cross" x1="' + x(n) + '" x2="' + x(n) + '" y1="' + y(sp) + '" y2="' + (m.t + ih) + '"/>' +
        '<circle class="dot" cx="' + x(n) + '" cy="' + y(sp) + '" r="6"/>' +
        '<rect class="hit" x="' + m.l + '" y="' + m.t + '" width="' + iw + '" height="' + ih + '"/>' +
        '</svg>';
      box.querySelector('.hit').addEventListener('pointermove', function (e) {
        var rect = box.querySelector('svg').getBoundingClientRect();
        var k = Math.round(Math.max(0, Math.min(7, (e.clientX - rect.left - m.l) / iw * 7)));
        if (k !== ci) { ci = k; inC.value = k; draw(); }
      });
      el.querySelector('#amP + output').textContent = p + '%';
      el.querySelector('#amC + output').textContent = n;
      big.textContent = fmtNum(sp) + '×';
      say.innerHTML = 'faster on ' + n + ' core' + (n === 1 ? '' : 's') + (f < 1
        ? ', with ' + (100 - p) + '% of the work serial. <strong>No number of cores can beat ' + fmtNum(limit) + '×.</strong>'
        : '. With nothing serial, speed-up equals the core count. Real programs never quite get there.') +
        ' Add coordination costs and the speed-up peaks at about <strong>' + Math.round(peakN) + ' cores</strong>, then falls.';
    }
    inP.addEventListener('input', function () { p = +inP.value; draw(); });
    inC.addEventListener('input', function () { ci = +inC.value; draw(); });
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
