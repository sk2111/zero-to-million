/* Tomazon War Room · Chapter 2: The 2 AM Call
   Each scene sets the narration, the presenter notes, which controls are
   unlocked, and (through `sim`) which moment of the night the simulator shows.
   Scenes that share a `sim` tag continue the same live simulation. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});

  // The server was created on Saturday 14 March at 18:19.
  const BOOT_TO_0140 = 209 * 86400 + 26460;   // until 10 Oct, 01:40

  const sims = {
    quiet: {
      vm: 'xs', rps: 3, clock: '21:10:00', date: 'Tue 22 Sep', ymd: '2026-09-22', uptimeS: 192 * 86400 + 10260, prewarm: 40,
      term: ['# A quiet Tuesday evening, six months after launch.']
    },
    incident: {
      vm: 'xs', rps: 3, ramp: { to: 34, dur: 90, at: 360 }, clock: '01:40:00', date: 'Sat 10 Oct', ymd: '2026-10-10',
      uptimeS: BOOT_TO_0140, prewarm: 1320,
      term: ['# 2:02 AM. Your laptop, balanced on a pillow. Tom is still on the phone.']
    },
    xray: {
      vm: 'xs', rps: 3, clock: '01:40:00', date: 'Sat 10 Oct', ymd: '2026-10-10', uptimeS: BOOT_TO_0140, prewarm: 10,
      term: ['# Replay. It is 1:40 AM and everything is still fine.']
    },
    fix: {
      vm: 'xs', rps: 3, ramp: { to: 34, dur: 90, at: 360 }, clock: '01:40:00', date: 'Sat 10 Oct', ymd: '2026-10-10',
      uptimeS: BOOT_TO_0140, prewarm: 1800,
      term: ['# Back to 2:10 AM. The server is still drowning.', '# Use the controls, or log in and try things: ssh root@tomazon.app']
    },
    green: {
      vm: 'l', rps: 34, clock: '03:17:00', date: 'Sat 10 Oct', ymd: '2026-10-10', uptimeS: 640, prewarm: 60,
      term: ['# 3:17 AM. Resized to 2 vCPU and 4 GB. Tomazon is back.']
    },
    morning: {
      vm: 'l', rps: 9, clock: '09:14:00', date: 'Sat 10 Oct', ymd: '2026-10-10', uptimeS: 21640, prewarm: 30,
      term: ['# 9:14 AM. You slept for five hours.']
    }
  };

  const ALL = ['traffic', 'vm', 'swap', 'conns', 'line', 'reboot', 'speed'];

  const scenes = [
    {
      id: 'quiet', sim: 'quiet',
      kicker: 'Six months later · Tuesday 22 September',
      title: 'Quiet, steady growth',
      body: '<p>The experiment worked. Shops listed their products and people ordered them. Six months later, on a busy evening, the server handles about <b>3 requests a second</b>, and memory sits around three quarters full.</p>' +
        '<p>Nobody looks at graphs, because there are no graphs. You never set up monitoring. It works, so why would you?</p>',
      notes: '<p>Recap the diagram from Chapter 1: the browser, requests in on the top lane, answers back on the bottom lane, one box running nginx, the app and PostgreSQL.</p>' +
        '<p>Plant the seed: no monitoring, no alerts. It pays off in a few minutes.</p>' +
        '<p>Ask: <b>is 77% memory a problem?</b> Not by itself. The real question is headroom: how much extra traffic could this box absorb before something gives? Nobody knows. Neither did you.</p>'
    },
    {
      id: 'call', sim: 'incident', blind: true,
      kicker: 'Saturday 10 October · 2:02 AM',
      title: 'Your phone is buzzing',
      body: '<p>It\'s 2:02 in the morning. The phone on your nightstand is lighting up the whole room. It\'s Tom.</p>' +
        '<p>From here on, the diagram and the monitoring panel are dark. That\'s what you actually had that night.</p>',
      overlay: { kind: 'phone' },
      notes: '<p>Let it ring for a few seconds before you press Accept. Press Decline once if you want a laugh: Tom calls again.</p>' +
        '<p>Remind the room of Tom\'s line from Chapter 1: "Who orders things at 2 AM?" "Everyone, once it exists."</p>' +
        '<p>After the call, ask: <b>it\'s 2 AM and the site is down. What is the first thing that goes through your head?</b> Collect the answers. You\'ll use them in the next scene.</p>'
    },
    {
      id: 'suspects', sim: 'incident', blind: true,
      kicker: '2:03 AM',
      title: 'Hacked? DDoS? Is the cloud down?',
      body: '<p>Your brain lists every disaster at once. Each suspect has a quick check, and some checks are much cheaper than others. Without even logging in, what can you rule out from your laptop?</p>',
      overlay: { kind: 'suspects' },
      chips: ['dig tomazon.app', 'ping tomazon.app', 'curl -I https://tomazon.app'],
      notes: '<p>Have the room vote on which suspect to check first. Good on-call engineers test the <b>cheapest</b> idea first.</p>' +
        '<ul><li><code>dig</code> answers instantly: DNS is fine and the domain hasn\'t expired.</li>' +
        '<li><code>ping</code> answers in about 40 ms: the machine is up and the network is fine. The kernel answers ping by itself, so ping works even when every program on the box is stuck.</li>' +
        '<li><code>curl</code> hangs for 10 seconds and times out: the website isn\'t answering.</li></ul>' +
        '<p>So it\'s not DNS and not the cloud provider\'s network. It\'s something on the machine itself.</p>'
    },
    {
      id: 'ssh', sim: 'incident', blind: true,
      kicker: '2:04 AM',
      title: 'Knock knock',
      body: '<p>You open a terminal and type the command you\'ve typed a hundred times since launch night. Normally you\'re in before you finish blinking.</p>',
      chips: ['ssh root@tomazon.app'],
      notes: '<p>Run it and let the silence sit while the cursor blinks. Don\'t fill it.</p>' +
        '<p>Ask: <b>why would SSH itself be slow?</b> The SSH server has to start a new process for your session and give it memory. If the machine can\'t do that quickly, even the front door is jammed.</p>' +
        '<p>When the login banner appears, point at it: system load around 100 on a single core, memory 99%, swap 96%.</p>'
    },
    {
      id: 'htop', sim: 'incident', blind: true,
      kicker: '2:05 AM',
      title: 'What is this machine doing?',
      body: '<p>You\'re in, barely. Every command takes seconds to answer. You run the first thing every engineer runs.</p>',
      chips: ['htop'],
      notes: '<p>Read the screen together:</p><ul>' +
        '<li><b>CPU</b> is pinned at 100%, and much of it is red. Red is kernel time, not your app.</li>' +
        '<li>The busiest process isn\'t Tomazon. It\'s <b>kswapd0</b>, the kernel thread that moves memory pages between RAM and disk.</li>' +
        '<li><b>Mem</b> is full. <b>Swp</b> (swap) is nearly full.</li>' +
        '<li>Dozens of <b>postgres: tomazon tomazon … SELECT</b> processes. In PostgreSQL every connection is a whole process with its own memory.</li>' +
        '<li><b>Load average</b> around 100 on a 1-core machine, and lots of processes in state <b>D</b>: stuck waiting on the disk.</li></ul>' +
        '<p>Press <kbd>q</kbd> to leave htop.</p>'
    },
    {
      id: 'evidence', sim: 'incident', blind: true,
      kicker: '2:07 AM',
      title: 'Follow the evidence',
      body: '<p>The machine is drowning in memory demand. But whose? Who are all these visitors, and what have the kernel and the app been complaining about?</p>',
      chips: ['tail /var/log/nginx/access.log', 'free -m', 'dmesg | tail', 'journalctl -u tomazon-app'],
      notes: '<p>The access log is the twist. Real phones, <b>Instagram</b> as the referrer, almost everyone opening the same product page. Status <b>499</b> means the customer gave up and closed the tab before the server answered.</p>' +
        '<p><b>This isn\'t an attack. It\'s success.</b> From the server\'s side, a DDoS and a viral moment look almost the same.</p>' +
        '<p><code>journalctl</code> shows <code>QueuePool limit of size 100 overflow 0 reached</code>: every request needs a database connection, and all 100 are stuck. <code>dmesg</code> shows hung-task warnings: processes stuck on the disk for over two minutes.</p>'
    },
    {
      id: 'aha', sim: 'incident', blind: true,
      kicker: '2:08 AM',
      title: '512 megabytes',
      body: '<p>Then you notice the number in the corner of htop: <b>Mem 512M</b>. The cheapest option, the responsible choice, back when you had zero users. Your phone has 8 GB. Your laptop has 16. Tomazon, a store with customers on three continents, runs on less memory than a phone from 2012.</p>',
      overlay: { kind: 'bars' },
      notes: '<p>This is the punchline, and the callback to Chapter 1. Not hackers. Not a DDoS. <b>Capacity.</b> Most outages are boring.</p>' +
        '<p>Ask: <b>was 512 MB the wrong choice on launch night?</b> No. It was right for an experiment. It became wrong slowly and silently, because nobody was watching. The mistake wasn\'t the size. It was flying blind.</p>'
    },
    {
      id: 'xray', sim: 'xray', unlock: ['traffic', 'speed'],
      kicker: 'Replay with the lights on',
      title: 'What actually happened',
      body: '<p>Let\'s rewind to 1:40 AM and replay the night with the view you didn\'t have. The diagram and the monitoring are back on. Traffic is normal: 3 requests a second.</p>' +
        '<p>Press <b>Viral reel</b>, or drag the <b>Traffic</b> slider yourself, and watch what happens inside the machine.</p>',
      notes: '<p><b>Predict before you click.</b> Ask the room: "Traffic goes from 3 to 34 requests a second. What happens to response time?"</p>' +
        '<p>Then drag the slider slowly instead: 3, then 10, 15, 18. Watch the p95 chart. Response time barely moves, then bends upward as the CPU nears 100%. That\'s queueing: near full utilization, a little more load means a lot more waiting.</p>' +
        '<p>Somewhere around 19 to 20 requests a second, the machine falls off a cliff. Not gradually: a cliff. The next scene explains why.</p>' +
        '<p>Use 3× or 10× speed to get through the slow parts.</p>'
    },
    {
      id: 'spiral', sim: 'xray', unlock: ['traffic', 'speed'],
      kicker: 'Why it fell off a cliff',
      title: 'The death spiral',
      body: '<p>Servers don\'t slow down gently. Once requests start waiting, every waiting request holds a database connection and its memory, full memory spills onto the disk, and the disk makes everything wait even longer.</p>',
      overlay: { kind: 'loop' },
      notes: '<p>This loop is the most important idea in the session. Walk around it one station at a time.</p>' +
        '<p><b>Little\'s Law</b>: requests in flight = arrival rate × time each one takes. Ask a junior to do the math: 3 a second × 0.2 s = 0.6 requests in flight. 34 a second × 10 s = 340 in flight. The app\'s pool allows 100 connections, each a Postgres process of about 11 MB: 1.1 GB, on a 0.5 GB machine.</p>' +
        '<p>For the seniors: once the spiral starts, lowering traffic doesn\'t fix it. Try it in the sim: let it thrash, then drag traffic back to 3. It stays broken. That\'s a <b>metastable failure</b>: the trigger is gone but the system stays stuck in the bad state. Only a reboot or more capacity gets it out.</p>'
    },
    {
      id: 'fix', sim: 'fix', unlock: ALL,
      kicker: 'Back to 2:10 AM',
      title: 'Make it stop',
      body: '<p>The incident is still running and Tom is still on the line. You have options. Try them one at a time and watch the diagram and the graphs:</p>' +
        '<p><b>Reboot</b> the server. Turn <b>swap off</b>. Lower <b>max DB connections</b> and <b>turn away</b> what doesn\'t fit. Or <b>resize</b> the server.</p>',
      chips: ['ssh root@tomazon.app', 'systemctl restart tomazon-app', 'tail /var/log/postgresql/postgresql-16-main.log'],
      notes: '<p>Let the room drive. What they will find:</p><ul>' +
        '<li><b>Reboot</b>: about 15 seconds of downtime, then it falls over again within half a minute. Rebooting doesn\'t add capacity. Restarting the app does the same thing, faster.</li>' +
        '<li><b>Swap off</b>: no more thrashing and SSH is instant, but now the kernel\'s OOM killer shoots a Postgres process. PostgreSQL then restarts every connection to stay safe ("terminating any other active server processes"), and customers see "Internal Server Error". It happens again and again. The Postgres log and <code>dmesg | tail</code> show it.</li>' +
        '<li><b>Max DB connections 8 + turn away fast</b>: the server stays healthy and serves what it can, about 22 a second. Everyone else gets a quick 503 instead of a 10-second hang. That\'s <b>load shedding</b>.</li>' +
        '<li><b>Resize to 2 vCPU · 4 GB</b>: about 12 seconds of downtime, then it just works, for $20 more a month.</li></ul>' +
        '<p>Ask: <b>which would you do at 2 AM?</b> (Usually: resize now, fix the connection limit tomorrow, add monitoring this week.)</p>'
    },
    {
      id: 'green', sim: 'green', unlock: ALL,
      kicker: 'Saturday · 3:17 AM',
      title: 'Green again',
      body: '<p>You resized to <b>2 vCPU and 4 GB</b>. The bill went from $4 to $24 a month. Pages load in a fraction of a second and orders are flowing again.</p>' +
        '<p>Before going back to bed you add one thing: an alert that pages you when memory goes above 80%. Next time, a graph wakes you up. Not Tom.</p>',
      overlay: { kind: 'lessons' },
      notes: '<p>Go through the takeaways. Then ask the seniors: <b>what\'s still wrong with this setup?</b></p><ul>' +
        '<li>It\'s still one machine. If it dies, Tomazon dies.</li>' +
        '<li>The app and the database still fight over the same CPU and memory.</li>' +
        '<li>Nobody has mentioned backups. Ever.</li>' +
        '<li>The pool still allows 100 connections. The next spike just needs to be bigger.</li></ul>'
    },
    {
      id: 'next', sim: 'morning', unlock: ALL,
      kicker: 'Saturday · 9:14 AM',
      title: 'One more thing',
      body: '<p>Tom slept well. You didn\'t. Your phone buzzes again.</p>',
      overlay: { kind: 'chat' },
      notes: '<p>Cliffhanger into the next chapter.</p>' +
        '<p>Ask: <b>the new server tops out around 42 requests a second. Ten times last night is 340. What\'s your plan for Saturday?</b> Buy a 32-core machine? What\'s the biggest machine you can buy, and what happens when it needs a kernel patch in the middle of the sale?</p>' +
        '<p>That\'s Chapter 3: The Big Sale.</p>'
    }
  ];

  const content = {
    call: {
      time: '2:02', date: 'Saturday, 10 October', caller: 'Tom', sub: 'Co-founder, Tomazon · mobile',
      lines: [
        ['Tom', 'Hey. Hey. Are you awake? Tomazon is down.'],
        ['Tom', 'Like, completely. The page just keeps loading and then dies.'],
        ['Tom', 'People are sending me screenshots. Hundreds of them.'],
        ['Tom', 'Did we get hacked?? Is this a DDoS? Is the cloud down?'],
        ['You', 'Okay. Okay. Give me five minutes.']
      ]
    },
    suspects: [
      { title: 'We got hacked', q: 'Someone broke in and took the site down.', how: 'Look for logins you don\'t recognise and processes you didn\'t start.', cmd: 'last', where: 'on the server' },
      { title: 'It\'s a DDoS attack', q: 'Someone is flooding us with fake traffic.', how: 'Look at who is actually sending the requests.', cmd: 'tail /var/log/nginx/access.log', where: 'on the server' },
      { title: 'The cloud provider is down', q: 'Our data centre is having a bad night.', how: 'Can you reach the machine at all?', cmd: 'ping tomazon.app', where: 'from your laptop' },
      { title: 'DNS broke or the domain expired', q: 'tomazon.app no longer points at our server.', how: 'Ask DNS where tomazon.app points.', cmd: 'dig tomazon.app', where: 'from your laptop' },
      { title: 'My last deploy broke it', q: 'Something I shipped is crashing.', how: 'What changed, and when? The last deploy was Tuesday evening, and the site ran fine for three days after it.', cmd: null },
      { title: 'The disk is full', q: 'Logs filled the disk and everything stopped.', how: 'Check how much disk space is left.', cmd: 'df -h', where: 'on the server' }
    ],
    memory: [
      { label: 'Your laptop', mb: 16384, value: '16 GB' },
      { label: 'Your phone', mb: 8192, value: '8 GB' },
      { label: 'Chrome with 20 tabs open', mb: 3072, value: 'about 3 GB' },
      { label: 'A phone from 2012', mb: 1024, value: '1 GB' },
      { label: 'Tomazon\'s only server', mb: 512, value: '512 MB', hero: true }
    ],
    loop: {
      trigger: 'It starts when traffic jumps from 3 to 34 requests a second.',
      stations: [
        ['Requests wait longer', 'the CPU is full, the line grows'],
        ['More requests in flight', 'in flight = rate × wait'],
        ['Each one holds memory', 'a Postgres connection, ~11 MB'],
        ['RAM runs out', 'kernel pushes pages to disk'],
        ['Disk is ~1000× slower', 'than RAM, for every page'],
        ['Everything slows down', 'even SSH and the kernel']
      ],
      worked: [
        { k: 'A quiet evening', v: '3/s × 0.2 s = 0.6 in flight', n: 'A few connections busy. Nobody notices.' },
        { k: 'The reel', v: '34/s × 10 s = 340 in flight', n: 'The pool allows 100 connections × 11 MB = 1.1 GB, on a 0.5 GB machine.' }
      ]
    },
    lessons: [
      ['Most outages are boring', 'Not hackers. Not a DDoS. A server that ran out of room, slowly, while nobody watched.'],
      ['Servers fall off cliffs', 'Response time stays flat, then explodes as the CPU nears 100%. Past that point, a little more traffic means a lot more waiting.'],
      ['Slow makes more slow', 'Requests in flight = arrival rate × wait (Little\'s Law). Waiting requests hold connections and memory, and running out of memory makes everything wait longer.'],
      ['Swap turns a memory problem into a disk problem', 'Disk is about a thousand times slower than RAM. A thrashing server is technically up and practically dead.'],
      ['The OOM killer goes for your database', 'With no swap, Linux kills a process to survive. On a small all-in-one server that\'s often a Postgres connection, and PostgreSQL then restarts every connection.'],
      ['No monitoring means your users are your monitoring', 'An alert at 80% memory would have woken you an hour earlier, before a single customer noticed.']
    ],
    terms: ['Vertical scaling', 'Capacity planning', 'Little\'s Law', 'Queueing', 'Connection pools', 'Swap thrashing', 'OOM killer', 'Load shedding', 'Metastable failure', 'Monitoring and alerting'],
    chat: {
      who: 'Tom', seen: 'online',
      messages: [
        ['Tom', 'You\'re a legend. Slept like a baby.', '9:12 AM'],
        ['Tom', 'Also: 1,140 orders last night. Even with the outage!!', '9:12 AM'],
        ['Tom', 'Quick one. Marketing wants to run the Great Tomazon Sale this Saturday. They\'re expecting 10x last night\'s traffic.', '9:13 AM'],
        ['Tom', 'We\'re fine now, right?', '9:14 AM']
      ],
      after: 'Your new server tops out around 42 requests a second. Ten times last night is 340. And it\'s still one machine.',
      next: 'Chapter 3 · The Big Sale'
    }
  };

  TZ.CHAPTERS = TZ.CHAPTERS || [];
  TZ.CHAPTERS[1] = { id: 'ch2', number: 2, title: 'The 2 AM Call', sims, scenes, content };
})();
