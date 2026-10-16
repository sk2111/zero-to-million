/* Zero to a million: routing, sidebar and page rendering.
   Pages are addressed by hash: #/ is home, #/1 is chapter 1's cover,
   #/1/cpu is a section. ← and → walk the pages in order. */
(function () {
  var chapters = ZTM.chapters;
  var content = ZTM.content || {};
  var pageEl = document.getElementById('page');
  var shell = document.getElementById('shell');
  var narrow = window.matchMedia('(max-width: 900px)');

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  /* ---------- the page list ---------- */

  var pages = [{ kind: 'home', id: '', title: 'Home' }];
  chapters.forEach(function (ch) {
    pages.push({ kind: 'cover', ch: ch, id: String(ch.n), title: 'Chapter ' + ch.n + ': ' + ch.title });
    var c = content[ch.n];
    if (ch.status === 'ready' && c) {
      c.sections.forEach(function (s, i) {
        var inGroup = c.sections.filter(function (x) { return x.group === s.group; });
        pages.push({ kind: 'section', ch: ch, sec: s, num: ch.n + '.' + (i + 1), id: ch.n + '/' + s.slug, title: s.title,
          groupPos: inGroup.indexOf(s) + 1, groupLen: inGroup.length });
      });
    }
  });

  function current() {
    var id = location.hash.replace(/^#\/?/, '');
    for (var i = 0; i < pages.length; i++) if (pages[i].id === id) return i;
    return 0;
  }
  function go(i) {
    if (i < 0 || i >= pages.length) return;
    location.hash = '#/' + pages[i].id;
  }

  /* ---------- sidebar ---------- */

  function renderToc(p) {
    var html = '<ol class="toc-list">';
    chapters.forEach(function (ch) {
      var active = p.ch && p.ch.n === ch.n;
      var c = content[ch.n];
      html += '<li class="toc-ch' + (active ? ' active' : '') + (ch.status !== 'ready' ? ' planned' : '') + '">' +
        '<a href="#/' + ch.n + '"' + (p.kind === 'cover' && active ? ' aria-current="page"' : '') + '>' +
        '<span class="toc-users">' + ZTM.usersLabel(ch.users) + '</span>' +
        '<span class="toc-dot" aria-hidden="true"></span>' +
        '<span class="toc-name"><span class="toc-n">' + ch.n + '</span>' + esc(ch.title) +
        (ch.status !== 'ready' ? '<small>Planned</small>' : '') + '</span></a>';
      if (active && ch.status === 'ready' && c) {
        html += '<ol class="toc-secs">' + c.sections.map(function (s, i) {
          var id = ch.n + '/' + s.slug;
          var head = s.group && (i === 0 || c.sections[i - 1].group !== s.group) ? '<li class="toc-group" aria-hidden="true">' + esc(s.group) + '</li>' : '';
          return head + '<li><a href="#/' + id + '"' + (p.id === id ? ' aria-current="page"' : '') + '><span class="toc-n">' + ch.n + '.' + (i + 1) + '</span>' + esc(s.title) + '</a></li>';
        }).join('') + '</ol>';
      }
      html += '</li>';
    });
    document.getElementById('toc').innerHTML = html + '</ol>';
  }

  /* ---------- pages ---------- */

  function pagerNav(i) {
    var prev = pages[i - 1], next = pages[i + 1];
    return '<nav class="page-nav" aria-label="Pages">' +
      (prev ? '<a class="pn prev" href="#/' + prev.id + '"><small>Previous</small><span>' + esc(prev.title) + '</span></a>' : '<span></span>') +
      (next ? '<a class="pn next" href="#/' + next.id + '"><small>Next</small><span>' + esc(next.title) + '</span></a>' : '<span></span>') +
      '</nav>';
  }

  function homeHtml() {
    var ready = chapters.filter(function (c) { return c.status === 'ready'; }).length;
    return '<section class="hero">' +
        '<h1 class="hero-title">Zero to<br>a million</h1>' +
        '<p class="hero-sub">A practical way to scale your system from 0&nbsp;to a million users.</p>' +
        '<div class="us" data-widget="user-scale"></div>' +
        '<div class="hero-actions"><a class="btn primary" href="#/1">Start chapter 1</a>' +
        '<button type="button" class="btn" data-scroll="roadmap">See all chapters</button></div>' +
      '</section>' +
      '<section class="roadmap" id="roadmap">' +
        '<div class="roadmap-head"><h2>The chapters</h2>' +
        '<p>Each chapter starts where the last one stopped. We add a new piece to the system only when the current design runs out of room, ' +
        'and we look at the numbers that tell us it has. ' + ready + ' of ' + chapters.length + ' chapters are written so far.</p></div>' +
        '<ol class="rm-list">' + chapters.map(function (ch) {
          return '<li class="' + (ch.status === 'ready' ? 'ready' : 'planned') + '"><a href="#/' + ch.n + '">' +
            '<span class="rm-users"><b>' + ZTM.usersLabel(ch.users) + '</b><small>' + (ch.users === null ? 'at every stage' : 'users') + '</small></span>' +
            '<span class="rm-body"><span class="rm-title"><span class="rm-n">' + ch.n + '</span>' + esc(ch.title) + '</span>' +
            '<span class="rm-q">' + esc(ch.question) + '</span></span>' +
            '<span class="rm-status">' + (ch.status === 'ready' ? 'About ' + ch.minutes + ' min' : 'Planned') + '</span>' +
          '</a></li>';
        }).join('') + '</ol>' +
      '</section>';
  }

  function coverHtml(p) {
    var ch = p.ch, c = content[ch.n];
    var html = '<header class="cover-head">' +
      '<p class="cover-k">Chapter ' + ch.n + '<span>' + (ch.users === null ? 'At every stage' : 'From ' + ZTM.usersLabel(ch.users) + ' users') + '</span></p>' +
      '<h1 class="cover-title">' + esc(ch.title) + '</h1>' +
      '<p class="cover-q">' + esc(ch.question) + '</p></header>';
    if (ch.status === 'ready' && c) {
      html += c.intro;
      html += '<h2>In this chapter</h2><ol class="sec-list">' + c.sections.map(function (s, i) {
        return '<li><a href="#/' + ch.n + '/' + s.slug + '"><span class="sec-n">' + ch.n + '.' + (i + 1) + '</span>' +
          '<span><b>' + esc(s.title) + '</b><span>' + esc(s.sub) + '</span></span></a></li>';
      }).join('') + '</ol>';
      html += '<p class="cover-time">About ' + ch.minutes + ' minutes, with a few things to try in the terminal and on the page.</p>';
    } else {
      html += '<p class="lede">' + esc(ch.summary) + '</p>' +
        '<div class="planned-box"><h2>What this chapter will cover</h2><ul>' +
        ch.topics.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul>' +
        '<p>This chapter is an outline for now. The topics and order may change once we write it.</p></div>';
    }
    return html;
  }

  function sectionHtml(p) {
    var group = p.sec.group ? '<p class="sec-group">' + esc(p.sec.group) + (p.groupLen > 1 ? '<span>' + p.groupPos + ' of ' + p.groupLen + '</span>' : '') + '</p>' : '';
    return '<header class="sec-head">' + group + '<h1><span class="sec-num">' + p.num + '</span> ' + esc(p.sec.title) + '</h1>' +
      '<p class="sec-sub">' + esc(p.sec.sub) + '</p></header>' + p.sec.html;
  }

  function addCopyButtons(root) {
    root.querySelectorAll('.term').forEach(function (t) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'copy';
      b.textContent = 'Copy commands';
      b.addEventListener('click', function () {
        /* Lines that start with "$ ", plus continuation lines after a trailing backslash. */
        var lines = [], cont = false;
        t.querySelector('pre').innerText.split('\n').forEach(function (l) {
          if (!cont && !/^\$ /.test(l)) return;
          lines.push(cont ? l : l.replace(/^\$ /, '').replace(/\s+#.*$/, ''));
          cont = /\\$/.test(l);
        });
        var done = function () { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy commands'; }, 1600); };
        if (navigator.clipboard) navigator.clipboard.writeText(lines.join('\n')).then(done, function () {});
      });
      t.appendChild(b);
    });
  }

  function render() {
    var i = current(), p = pages[i];
    if (ZTM.hideTip) ZTM.hideTip();
    var body = p.kind === 'home' ? homeHtml() : p.kind === 'cover' ? coverHtml(p) : sectionHtml(p);
    pageEl.className = 'page page-' + p.kind;
    pageEl.innerHTML = '<div class="page-inner">' + body + (p.kind === 'home' ? '' : pagerNav(i)) + '</div>';
    pageEl.querySelectorAll('[data-widget]').forEach(function (el) {
      var f = ZTM.widgets[el.getAttribute('data-widget')];
      if (f) f(el);
    });
    addCopyButtons(pageEl);
    pageEl.querySelectorAll('table.data').forEach(function (t) {   /* wide tables scroll inside, never the page */
      var w = document.createElement('div');
      w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });
    renderToc(p);

    document.getElementById('crumb').innerHTML = p.kind === 'home' ? '<b>Zero to a million</b>'
      : '<a href="#/' + p.ch.n + '">Chapter ' + p.ch.n + '</a><b>' + esc(p.kind === 'section' ? p.num + ' ' + p.sec.title : p.ch.title) + '</b>';
    var inCh = p.ch ? pages.filter(function (x) { return x.ch === p.ch; }) : [];
    document.getElementById('count').textContent = inCh.length > 1 ? (inCh.indexOf(p) + 1) + ' of ' + inCh.length : '';
    document.getElementById('progress').style.width = (i / (pages.length - 1) * 100) + '%';
    document.getElementById('prevBtn').disabled = i === 0;
    document.getElementById('nextBtn').disabled = i === pages.length - 1;
    document.title = p.kind === 'home' ? 'Zero to a Million' : p.title + ' – Zero to a Million';

    window.scrollTo(0, 0);
    pageEl.focus({ preventScroll: true });
    if (narrow.matches) setSide(false);
  }

  /* ---------- sidebar show / hide ---------- */

  var toggle = document.getElementById('sideToggle'), scrim = document.getElementById('scrim');
  function sideOpen() { return narrow.matches ? shell.classList.contains('side-open') : !shell.classList.contains('side-hidden'); }
  function setSide(open) {
    if (narrow.matches) {
      shell.classList.toggle('side-open', open);
      scrim.hidden = !open;
    } else {
      shell.classList.toggle('side-hidden', !open);
      store('ztm-side', open ? 'shown' : 'hidden');
    }
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  toggle.addEventListener('click', function () { setSide(!sideOpen()); });
  scrim.addEventListener('click', function () { setSide(false); });
  function syncSide() {
    shell.classList.remove('side-open');
    scrim.hidden = true;
    shell.classList.toggle('side-hidden', !narrow.matches && store('ztm-side') === 'hidden');
    toggle.setAttribute('aria-expanded', sideOpen() ? 'true' : 'false');
  }
  if (narrow.addEventListener) narrow.addEventListener('change', syncSide);
  syncSide();

  /* ---------- theme ---------- */

  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    store('ztm-theme', t);
    document.querySelectorAll('[data-theme-set]').forEach(function (b) {
      b.setAttribute('aria-pressed', b.getAttribute('data-theme-set') === t ? 'true' : 'false');
    });
  }
  document.querySelectorAll('[data-theme-set]').forEach(function (b) {
    b.addEventListener('click', function () { setTheme(b.getAttribute('data-theme-set')); });
  });
  setTheme(document.documentElement.getAttribute('data-theme') || 'light');

  /* ---------- keys and buttons ---------- */

  document.getElementById('prevBtn').addEventListener('click', function () { go(current() - 1); });
  document.getElementById('nextBtn').addEventListener('click', function () { go(current() + 1); });

  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    var t = e.target;
    if (t.closest && t.closest('input, select, textarea, [role="radiogroup"], [contenteditable]')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); go(current() + 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(current() - 1); }
    else if (e.key === 's' || e.key === 'S') { setSide(!sideOpen()); }
    else if (e.key === 'Escape' && narrow.matches) { setSide(false); }
  });

  pageEl.addEventListener('click', function (e) {
    var b = e.target.closest('[data-scroll]');
    var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (b) document.getElementById(b.getAttribute('data-scroll')).scrollIntoView({ behavior: calm ? 'auto' : 'smooth' });
  });

  window.addEventListener('hashchange', render);
  render();
})();
