/* The cheat sheet: system design on one page, after chapter 14.
   It keeps only what holds for any system, not the running example: the takeaways, the loop every
   chapter runs, the numbers to know, the scaling patterns with what each one costs, the trade-offs,
   and every rule of thumb, each linked to the page it comes from. app.js adds it as the last page
   when ZTM.cheatsheet exists. */
window.ZTM = window.ZTM || {};

ZTM.cheatsheet = (function () {

  /* Page 14.2's takeaways, said for any system. The first is the one the others serve. */
  var TAKEAWAYS = [
    ['Scale based on need', 'Start with the simplest design that works, even one small server. Add capacity and complexity only when a measured limit is near.'],
    ['Solve real problems', 'Name the problem before the technology. “The app servers are at 100% CPU” chooses a load balancer; “microservices are modern” chooses nothing.'],
    ['Add value', 'Every change should make something better for users or the business: faster pages, fewer failures, a lower cost per request.'],
    ['Engineer the solution to fit', 'Choose the smallest change that solves the problem: a cache before a rewrite, a replica before a shard, tuning before a migration.'],
    ['Measure, then optimise', 'Find the busiest queries before tuning, test from two places before blaming the servers, and read the bill line by line before cutting it.'],
    ['Don’t optimise blindly', 'A guess picks the wrong fix. A measurement shows where the time and the money really go.'],
    ['Observability is mandatory', 'You can’t scale, fix or pay for what you can’t see. Build it in from the first server, not after the first outage.']
  ];

  /* The patterns, in the order the book adds them: [kind, name, when you see, add, what it costs, chapter] */
  var PATTERNS = [
    ['start', 'Start with one server', 'A new product: few users, and requirements that will change.',
      'One small server running the web server, the app and the database, as one codebase: a monolith. HTTPS, daily backups, basic monitoring.',
      'A single point of failure: fine at the start, as long as it’s written down.', 2],
    ['compute', 'Give the database its own server', 'The app and the database fight over one server’s CPU, memory and disk: the p95 climbs, the server swaps, the OOM killer strikes.',
      'Split by resource: a compute-optimised server for the app, a memory-optimised one with a fast disk for the database.',
      'Every query now crosses the network. Count round trips, fix N+1 queries, and pool connections.', 3],
    ['compute', 'Scale out the stateless tier', 'The app servers are CPU-bound (high <code>us</code>, no <code>wa</code>) while the database has room.',
      'More app servers behind a load balancer, with health checks. Least connections when request times vary.',
      'Servers must keep no state. Plan for one to be missing (N+1). The load balancer is a new single point of failure.', 4],
    ['data', 'Add read replicas', 'The database is busy, and most of its time goes on reads.',
      'Copies of the database that answer reads: writes go to the primary, reads to the replicas.',
      'Replication lag: a replica is always a little behind. Read your own writes, and keep critical reads on the primary.', 5],
    ['data', 'Cache the answers', 'Servers are healthy but pages are slow: the same expensive answer is built again for every request.',
      'An in-memory cache such as Redis, used cache-aside, with an expiry on every key.',
      'Keeping it honest: delete on change, expire anyway. Plan for an empty cache, and never trust a cached value where money depends on it.', 6],
    ['people', 'Split out a service', 'Servers are healthy but releases break: teams trip over each other in one codebase.',
      'Fix the boundaries inside the monolith first. Then split off the safest, most self-contained part behind a contract, and move traffic to it gradually: the strangler fig.',
      'Function calls become network calls that can fail. No transaction spans two services, and each one owns its data.', 7],
    ['data', 'Publish changes to a log', 'Several readers need every change, even one that was down when it happened, and a notification nobody keeps loses them.',
      'A log such as Kafka, fed from the database’s write-ahead log by change data capture. One consumer group per reader.',
      'At least once means duplicates: make every reader safe to repeat, and watch consumer lag. One more cluster to run.', 8],
    ['distance', 'Put a CDN in front', 'Far-away users wait on round trips, and sending bytes dominates the bill.',
      'A CDN in front of private object storage, smaller files, and a new name for every version so it can be cached for a long time.',
      'Only what’s the same for everyone can be cached. The speed comes from the CDN; most of the saving comes from sending fewer bytes.', 9],
    ['people', 'Let an orchestrator run it', 'Too many programs on too many servers to run by hand: slow recoveries, half-finished deploys, scaling by hand.',
      'Containers, run by Kubernetes: declare what should run, and it restarts, places, rolls out and scales them.',
      'Keep the data outside the cluster: a pod can be replaced at any moment; the data can’t.', 10],
    ['distance', 'Go to the edge, add a read region', 'Far-away users are slow, although every server is fast: the time goes in round trips.',
      'End connections and cache whole pages at the edge. Add a region near those users that serves reads.',
      'Writes still go home to the one primary, and the far region’s reads are a little behind.', 11],
    ['data', 'Shard the writes', 'One primary can’t take the writes, and replicas and caches only take reads.',
      'Split the rows across several primaries by a shard key that keeps each query on one shard: many logical shards, and a map of where each lives.',
      'A big change, and hard to undo. First try faster queries, a bigger server, archiving and pooling.', 12],
    ['distance', 'Cells and home regions', 'Many regions depend on one: every write crosses the world, personal data is copied everywhere, and one region’s trouble spreads.',
      'A complete cell in each region, fed only the shared data, and each user’s data in a home region, with a standby in another.',
      'If a region is lost, its own users’ writes pause until the standby takes over. Shared data can arrive late.', 13],
    ['money', 'Count the cost', 'The bill grows faster than the business. Watch the cost per unit of work, such as per 1,000 orders.',
      'Tune first: right-size, delete what’s idle, commit to the steady base, stop paying to move bytes. Then move only the steady part.',
      'Your own servers take weeks to add, and your team runs them. “10 to 20 times cheaper” leaves out the people.', 14]
  ];

  /* Choices with two sides: [question, [side, what it means], [side, what it means], the rule that settles it, page] */
  var TRADEOFFS = [
    ['Scale up or scale out', ['Up: a bigger server', 'No code change. Stops at the largest instance, and one failure takes everything down.'],
      ['Out: more servers', 'Needs stateless servers and a load balancer. Survives a failure, and deploys without downtime.'],
      'Scale up for simplicity; scale out for resilience and flexibility.', '4.2'],
    ['A monolith or services', ['Monolith', 'Function calls in nanoseconds, one transaction, one deploy. Right while the product is small and changing.'],
      ['Services', 'Each team ships and scales its part alone. Calls cross the network and can fail; no transaction spans two services.'],
      'Services solve a people problem, at a technical price.', '7.2'],
    ['A queue or a log', ['Queue', 'Deletes each job once a worker finishes it. Retries, and a dead-letter queue for the ones that keep failing.'],
      ['Log', 'Keeps every message, in order, for a set time. Many readers, each at its own pace, and a new one can replay the history.'],
      'Queues for jobs, logs for facts.', '8.2'],
    ['Consistency or availability', ['While the network is split', 'Keep the copies consistent, or keep answering. You can’t have both: that’s CAP.'],
      ['The rest of the time', 'Wait for the copies (consistent), or answer at once (low latency): that’s PACELC.'],
      'Choose per feature: consistency for money and stock, availability for browsing.', '5.3'],
    ['How fresh must a read be?', ['Strong', 'The latest value, always: payments, and stock at checkout.'],
      ['Eventual', 'A moment behind is fine: counts, lists, dashboards.'],
      'In between: read your own writes for a user’s own changes; causal order for replies.', '5.3'],
    ['Round robin or least connections', ['Round robin', 'Each server in turn. Fine when every request costs about the same.'],
      ['Least connections', 'The server with the fewest requests in progress. Use it when request times vary.'],
      'Send each request to the least busy server, and stop sending to ones that keep failing.', '4.3'],
    ['The cloud or your own servers', ['Cloud', 'Elastic and global, paid by use. Spiky work is cheaper here.'],
      ['Own servers', 'Cheaper each, bandwidth included. Weeks to add, and your team runs everything on them.'],
      'Steady work is cheaper on your own servers; spiky work is cheaper in the cloud.', '14.1'],
    ['Cache it or leave it', ['Cache it', 'Expensive to build, popular, and the same for everyone.'],
      ['Leave it', 'Cheap to build, or personal to one user.'],
      'Plan for an empty cache: after a restart, every request misses.', '6.1']
  ];

  /* Every rule of thumb, grouped by theme: [kind, theme, [[rule, page]]] */
  var RULES = [
    ['start', 'Find what’s full first', [
      ['Before you scale anything, find out which part is full.', '1.9'],
      ['Before adding CPU, prove the CPU is the bottleneck: high <code>us</code>, low <code>wa</code>, and load above the core count.', '1.3'],
      ['Find the tier that’s full before you add anything.', '4.1'],
      ['When the app servers are idle and requests are slow, look at the database, query by query.', '5.1'],
      ['When healthy servers ship broken releases, look at how the code and the teams are organised.', '7.1'],
      ['To tell server time from network time, test the same page from two places.', '11.1'],
      ['Estimate to find the order of magnitude, then measure to correct it.', '2.2']
    ]],
    ['compute', 'Know the machine', [
      ['To get more from a CPU: run fewer instructions, make fewer trips to memory, use more cores.', '1.1'],
      ['Count ready threads, not threads. Grow pools only while throughput keeps rising.', '1.2'],
      ['Most requests wait far more than they compute, so concurrency matters more than cores.', '1.14'],
      ['Watch <code>available</code> memory, not <code>free</code>, and alert when it drops below about 15–20%.', '1.6'],
      ['Disk is for keeping data safe; RAM is for speed. Keep the hot path off the disk.', '1.7'],
      ['Count round trips, not bytes.', '1.8'],
      ['Spec sheets tell you where to start; benchmarking your own workload tells you what to buy.', '1.4']
    ]],
    ['start', 'Start simple', [
      ['Don’t design anything until you can say who uses it, what they do with it, and how many of them there are.', '2.1'],
      ['Build the simplest thing that lets real users try the product, and measure everything they do.', '2.3'],
      ['Monolith first. Split a part out when you can point at the problem it solves.', '2.4'],
      ['One small server, HTTPS, daily backups, and a written list of what you’ve chosen not to handle yet.', '2.5'],
      ['If you can’t tell how people use it, it isn’t teaching you anything.', '2.6']
    ]],
    ['compute', 'Grow the servers', [
      ['Moving the database to its own server is usually the first, cheapest big win.', '3.2'],
      ['Cross the network as few times as possible per request: fewer queries, batched work, connections that stay open.', '3.3'],
      ['Give each server the resource its work needs most: CPU for the app, memory and a fast disk for the database.', '3.4'],
      ['Plan for one server to be missing: capacity that needs every server healthy isn’t really capacity.', '4.2'],
      ['Scale out the stateless parts first, and keep the state in the database, the cache and object storage.', '4.4']
    ]],
    ['data', 'Grow the data', [
      ['Send writes to the primary and reads to the replicas, and add replicas as the reads grow.', '5.2'],
      ['Every copy of the data is a little out of date. Decide, feature by feature, how out of date is acceptable.', '5.3'],
      ['Send a user’s reads to the primary right after they write, and keep the critical reads there too.', '5.4'],
      ['Check the cache first, fall back to the database, and give every key an expiry.', '6.2'],
      ['Delete on change, expire anyway, and never charge from a cached price.', '6.3'],
      ['Replicas and caches take reads. Only sharding spreads the writes.', '12.1'],
      ['Pick a shard key that keeps nearly every query on one shard, and split into many logical shards with a map.', '12.1']
    ]],
    ['people', 'Services and events', [
      ['Fix the boundaries inside the monolith first. Split out a service only for a reason you can name.', '7.2'],
      ['Split off the safest, most self-contained part first, and give it a contract, not a back door into the tables.', '7.3'],
      ['Route a little traffic, measure, route more, and delete the old code at the end.', '7.4'],
      ['Write each change once, to the database, and let change data capture deliver it.', '8.3'],
      ['Make every reader safe to repeat, and watch every group’s lag.', '8.4'],
      ['Declare what should run, and let the orchestrator keep it that way. Keep the data outside the cluster.', '10.1']
    ]],
    ['distance', 'Go far', [
      ['You can’t speed up light. Move the bytes closer to the user, and send fewer of them.', '9.1'],
      ['Put what’s the same for every user on the CDN, and keep anything personal off it.', '9.2'],
      ['A faster server can’t shorten a round trip. Cache at the edge what’s the same for everyone.', '11.1'],
      ['Read from the nearest region; send writes home to the primary.', '11.1'],
      ['Keep each user’s data in their home region, and send only the shared data around.', '13.1']
    ]],
    ['money', 'Pay less', [
      ['Track the cost per unit of work like any other metric, on the same dashboard as latency and errors.', '14.1'],
      ['Tune before you move anything: right-size, delete what’s idle, commit to the steady base.', '14.1'],
      ['Move only the steady part, and keep the way back open until the end.', '14.1']
    ]]
  ];

  /* Page 1.14's USE checks and its table of where to look, and page 14.2's signals */
  var USE = [['U', 'Utilisation', 'How busy is it?'], ['S', 'Saturation', 'Is work queuing for it?'], ['E', 'Errors', 'Is it reporting any?']];
  var USE_TABLE = [
    ['CPU', '<code>top</code>: us + sy, per core', 'Load above the core count; <code>r</code> in <code>vmstat 1</code>; high <code>st</code> (steal) on cloud VMs', 'Rare: machine-check errors in <code>dmesg</code>'],
    ['Memory', '<code>free -h</code>: used vs available', 'Swapping: <code>si</code>/<code>so</code> in <code>vmstat 1</code>', 'OOM kills in <code>dmesg</code>, exit code 137'],
    ['Disk', '<code>iostat -xz 1</code>: %util', '<code>aqu-sz</code> and <code>await</code> rising', 'Disk full (<code>df -h</code>)'],
    ['Network', '<code>sar -n DEV 1</code>: bytes a second', 'Packets resent (<code>nstat</code>)', 'Connection errors and timeouts']
  ];
  var SIGNALS = [
    ['Metrics', 'Is it healthy right now? Latency, traffic, errors and saturation.', 'p95 per endpoint, CPU, consumer lag'],
    ['Logs', 'What exactly happened?', 'the errors right after a release'],
    ['Traces', 'Where did one request spend its time, across services?', 'one request through the edge, the services and the database'],
    ['Real-user timings', 'What do users actually experience, country by country?', 'time to first byte, by country'],
    ['Cost', 'What does each service, and each unit of work, cost?', 'the cost per 1,000 orders']
  ];

  function ref(page) {
    var p = page.split('.'), sec = ZTM.content[p[0]] && ZTM.content[p[0]].sections[p[1] - 1];
    return sec ? '<a class="cs-ref" href="#/' + p[0] + '/' + sec.slug + '" title="Page ' + page + ': ' + sec.title.replace(/"/g, '&quot;') + '">' + page + '</a>' : '';
  }
  function chref(n) {
    var ch = ZTM.chapters[n - 1];
    return '<a class="cs-ref" href="#/' + n + '" title="Chapter ' + n + ': ' + ch.title + '">Ch ' + n + '</a>';
  }
  function head(id, n, title, lead) {
    return '<h2 class="cs-h" id="' + id + '"><span>' + n + '</span>' + title + '</h2>' + (lead ? '<p class="cs-lead">' + lead + '</p>' : '');
  }
  var SECTIONS = [['cs-takeaways', '', 'The key takeaways'], ['cs-loop', '01', 'One loop'], ['cs-numbers', '02', 'Fundamentals'],
    ['cs-patterns', '03', 'Scaling patterns'], ['cs-trades', '04', 'Trade-offs'], ['cs-rules', '05', 'Rules of thumb'], ['cs-watch', '06', 'What to watch']];

  /* Page 1.10's ladder, on the same log scale as its widget: each step right is ten times longer */
  function ladder() {
    var ROWS = [
      ['compute', 'Read from the L1 cache', 1, '1 ns'],
      ['compute', 'Read from the L2 cache', 4, '4 ns'],
      ['compute', 'Read from RAM', 100, '100 ns'],
      ['compute', 'Switch threads on a core', 3000, '3 µs'],
      ['distance', 'Send 1 KB on a 1 Gbps link', 1e4, '10 µs'],
      ['data', 'Read 4 KB at random from an SSD', 1e5, '100 µs'],
      ['distance', 'Round trip inside a datacenter', 5e5, '500 µs'],
      ['data', 'Read 1 MB in sequence from an SSD', 1e6, '1 ms'],
      ['data', 'Read 1 MB in sequence from a hard disk', 5e6, '5 ms'],
      ['data', 'Hard disk random read', 1e7, '10 ms'],
      ['distance', 'Round trip to a city 1,000 km away', 2e7, '20 ms'],
      ['distance', 'Round trip halfway round the world', 2e8, '200 ms']
    ];
    var LO = Math.log10(0.3), HI = Math.log10(3e8);
    return '<div class="cs-ladder"><h3>How long things take ' + ref('1.10') + '</h3>' +
      ROWS.map(function (r) {
        var w = ((Math.log10(r[2]) - LO) / (HI - LO) * 100).toFixed(1);
        return '<div class="cl-row k-' + r[0] + '"><span>' + r[1] + '</span>' +
          '<span class="cl-track" aria-hidden="true"><i style="--w:' + w + '%"></i></span><span class="cl-val">~' + r[3] + '</span></div>';
      }).join('') +
      '<p class="cl-note">Memory is nanoseconds, SSDs are microseconds, networks and spinning disks are milliseconds. The bars are on a log scale: each step right is ten times longer.</p>' +
      '<p class="cs-legend"><span class="k-compute"><i></i>CPU and memory</span><span class="k-data"><i></i>Disk</span><span class="k-distance"><i></i>Network</span></p>' +
    '</div>';
  }
  function fig(big, text, page) { return '<div class="cs-fig"><b>' + big + '</b><span>' + text + ref(page) + '</span></div>'; }

  return function () {
    var html = '';

    html += '<header class="cs-head"><div>' +
        '<p class="cs-k">Cheat sheet<span>Fundamentals, patterns and rules of thumb from all 14 chapters</span></p>' +
        '<h1 class="cs-title">System design on one page</h1>' +
        '<p class="cs-sub">What to measure, what to reach for, and what each choice costs. Only the parts that hold for any system.</p>' +
        '<div class="cs-actions"><button type="button" class="btn primary" data-print>Print it</button><a class="btn" href="#/1">Start at chapter 1</a></div>' +
      '</div>' +
      '<nav class="cs-index" aria-label="On this page"><p>On this page</p><ol>' + SECTIONS.map(function (s) {
        return '<li><button type="button" data-scroll="' + s[0] + '"><span>' + s[1] + '</span>' + s[2] + '</button></li>';
      }).join('') + '</ol></nav></header>';

    html += '<section class="cs-band" id="cs-takeaways" aria-label="The key takeaways">' +
        '<p class="cs-band-k">The key takeaways<a href="#/14/takeaways">From page 14.2</a></p>' +
        '<p class="cs-motto">Start small. <em>Measure everything.</em> Add only what the numbers ask for.</p>' +
        '<ol class="cs-take">' + TAKEAWAYS.map(function (t) { return '<li><b>' + t[0] + '</b><span>' + t[1] + '</span></li>'; }).join('') + '</ol>' +
      '</section>';

    html += head('cs-loop', '01', 'One loop, every time', 'Every scaling step follows the same loop. It starts at the next bottleneck, and adds a new piece only when the numbers show the current design has run out of room.') +
      '<ol class="cs-loop">' +
        '<li><b>Measure</b><span>Watch the numbers that show a limit coming: latency percentiles, saturation, lag, cost.</span></li>' +
        '<li><b>Find what’s full</b><span>Check each resource for utilisation, saturation and errors. Name the problem before the technology.</span></li>' +
        '<li><b>Add the smallest fix</b><span>Choose the smallest change that solves the problem, not the most fashionable one.</span></li>' +
        '<li><b>Measure again</b><span>Confirm the fix worked. The bottleneck will now be somewhere new.</span></li>' +
      '</ol>' +
      '<p class="cs-again"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4"/></svg>Then the loop starts again, at the next bottleneck.</p>' +
      '<div class="cs-before"><b>The smallest fix first</b>' +
        '<span><b>A cache</b> before a rewrite</span><span><b>A replica</b> before a shard</span><span><b>Tuning</b> before a migration</span></div>';

    html += head('cs-numbers', '02', 'Fundamentals', 'Most of system design is knowing roughly how long things take, and doing the arithmetic in your head.') +
      '<div class="cs-nums">' + ladder() +
        '<div class="cs-side">' +
          '<div class="cs-fig"><b>in progress = <code>throughput × latency</code></b><span>Little’s law. 200 requests a second at 50 ms each are 10 in progress at once, so you need at least 10 workers.' + ref('1.11') + '</span></div>' +
          '<div class="cs-fig"><b>p99, not the average</b><span>An average of 109 ms looks fine when the p99 is 3 seconds. The slow tail is where your unhappy users are.' + ref('1.11') + '</span></div>' +
          '<div class="cs-fig"><b>60–70% busy</b><span>is where to plan the busiest hour. At 80%, a resource is already full: the queue grows much faster than the load.' + ref('1.11') + '</span></div>' +
          '<div class="cs-fig"><b>Estimate before you buy</b><ol class="cs-chain">' +
            '<li><span><b>1 million users</b> × 20 requests = 20 million a day</span></li>' +
            '<li><span>÷ 100,000 seconds = <b>200 a second</b></span></li>' +
            '<li><span>× 3 for the busiest hour = <b>600 a second</b></span></li>' +
            '<li><span>× 10 ms of CPU each = <b>6 cores busy</b></span></li>' +
            '<li><span>÷ 0.7, to peak at 70% = <b>about 9 cores</b>' + ref('1.13') + '</span></li></ol></div>' +
        '</div>' +
      '</div>' +
      '<div class="cs-strip"><h3>Numbers to do it with</h3>' +
        fig('86,400 s', 'in a day: call it 100,000.', '1.13') +
        fig('≈ 12 a second', 'is a million requests a day. A billion a day is about 12,000 a second.', '1.13') +
        fig('2–5×', 'the average traffic, in the busiest hour. Size for that hour, not the day.', '1.13') +
        fig('1,000×', 'faster: RAM, compared with a read from an SSD.', '1.10') +
        fig('~0.5 ms', 'a round trip to a server nearby. Twenty small queries add up to 10 ms.', '3.3') +
        fig('÷ 8', 'Networks count bits, disks count bytes: 1 Gbps is 125 MB/s.', '1.8') +
        fig('5 µs a km', 'for light in fibre: 1,000 km is at least 10 ms there and back.', '1.8') +
        fig('~100 IOPS', 'random reads a second from a hard disk. An SSD does tens of thousands; NVMe 500,000 or more.', '1.7') +
      '</div>';

    html += head('cs-patterns', '03', 'Scaling patterns', 'In the order the book adds them. Reach for each one when its symptom shows up, not before: every pattern solves one problem and brings a new one.') +
      '<ol class="cs-patterns">' + PATTERNS.map(function (p) {
        return '<li class="k-' + p[0] + '"><div class="cp-head"><h3>' + p[1] + '</h3>' + chref(p[5]) + '</div>' +
          '<p class="cp-line cp-when"><em>When</em><span>' + p[2] + '</span></p>' +
          '<p class="cp-line cp-add"><em>Add</em><span>' + p[3] + '</span></p>' +
          '<p class="cp-line cp-cost"><em>Trade-off</em><span>' + p[4] + '</span></p></li>';
      }).join('') +
      '<li class="cp-note"><b>Every pattern trades one problem for another.</b><span>Add them one at a time, only when the numbers ask for one, and measure again after each. The next bottleneck will be somewhere new.</span></li>' +
      '</ol>';

    html += head('cs-trades', '04', 'Trade-offs to know', 'Most design choices have two good answers. Know both sides, and the rule that usually settles it.') +
      '<div class="cs-trades">' + TRADEOFFS.map(function (t) {
        return '<section class="cs-trade"><h3>' + t[0] + ref(t[4]) + '</h3>' +
          '<div class="ct-sides"><div><b>' + t[1][0] + '</b>' + t[1][1] + '</div><div><b>' + t[2][0] + '</b>' + t[2][1] + '</div></div>' +
          '<p class="ct-rule"><span>' + t[3] + '</span></p></section>';
      }).join('') + '</div>';

    html += head('cs-rules', '05', 'Rules of thumb', 'Every rule of thumb in the book, grouped by what it helps with. The number opens the page it comes from.') +
      '<div class="cs-rules">' + RULES.map(function (g) {
        return '<section class="cs-group k-' + g[0] + '"><h3>' + g[1] + '</h3><ul>' +
          g[2].map(function (r) { return '<li>' + r[0] + ref(r[1]) + '</li>'; }).join('') + '</ul></section>';
      }).join('') + '</div>';

    html += head('cs-watch', '06', 'What to watch', 'You can’t scale, fix or pay for what you can’t see.') +
      '<h3 class="cs-watch-h">Is a resource full? Check it in this order ' + ref('1.14') + '</h3>' +
      '<ol class="cs-use">' + USE.map(function (u) { return '<li><b><i>' + u[0] + '</i> ' + u[1] + '</b><span>' + u[2] + '</span></li>'; }).join('') + '</ol>' +
      '<table class="data cs-usetable"><thead><tr><th>Resource</th><th>Utilisation: how busy?</th><th>Saturation: is work waiting?</th><th>Errors</th></tr></thead><tbody>' +
        USE_TABLE.map(function (r) { return '<tr><td>' + r.join('</td><td>') + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<h3 class="cs-watch-h">Is the system healthy? Five signals, from day one ' + ref('14.2') + '</h3>' +
      '<ul class="cs-signals">' + SIGNALS.map(function (s) {
        return '<li><b>' + s[0] + '</b><span>' + s[1] + '</span><small>For example: ' + s[2] + '</small></li>';
      }).join('') + '</ul>';

    return html;
  };
})();
