/* Tomazon War Room · Chapter 1: 48 Hours
   The origin story. Two friends, one idea, a 48-hour MVP, and every choice
   from language to server. Scenes with a `card` show an interactive card
   (js/ch1-cards.js) instead of the live board. `hour` drives the 48-hour
   clock and `decides` the "Your stack" panel. */
(function () {
  'use strict';
  const TZ = (window.TZ = window.TZ || {});

  const sims = {
    fresh: {
      fresh: true, vm: 'xs', rps: 0, dns: false, freshHost: true,
      clock: '18:20:00', date: 'Sat 14 Mar', ymd: '2026-03-14', uptimeS: 70, prewarm: 2,
      term: ['# Saturday 14 March, 6:20 PM. Hour 47 of 48.', '# Your new server is ready at 203.0.113.42. Tom is refreshing the dashboard.']
    }
  };

  const stack = [
    { key: 'language', label: 'Language', value: 'Python' },
    { key: 'framework', label: 'Web framework', value: 'FastAPI' },
    { key: 'orm', label: 'Talking to the DB', value: 'SQLAlchemy (ORM)' },
    { key: 'dbkind', label: 'Kind of database', value: 'Relational' },
    { key: 'db', label: 'Database', value: 'PostgreSQL' },
    { key: 'cloud', label: 'Cloud', value: 'DigitalOcean' },
    { key: 'server', label: 'Server', value: '1 vCPU · 512 MB · Bangalore' }
  ];

  const scenes = [
    {
      id: 'world', card: { kind: 'world' }, clock: ['Wed 11 Mar', '23:30'],
      kicker: 'Prologue',
      title: 'A world without online shopping',
      body: '<p>In our world, someone started selling books from a website in 1995, and the rest is history. This story happens in a slightly different world. It has smartphones, Instagram and cloud servers. But nobody, anywhere, has thought of selling things online.</p><p>Not yet.</p>',
      notes: '<p>Set the premise with a smile: everything modern exists except online shopping. That lets us use today\'s tools while living through the decisions the first online stores had to make.</p>' +
        '<p>Ask the room: <b>if you had to build online shopping from nothing, what would you need?</b> Collect answers. You\'ll need them in the 48-hour scene.</p>'
    },
    {
      id: 'idea', card: {
        kind: 'dialogue', place: 'Hostel room 214 · Wednesday, 11:40 PM',
        lines: [
          ['tom', 'What if every shop in town put their stuff on a website?'],
          ['you', 'Like a catalog?'],
          ['tom', 'A catalog you can order from. From your phone. At 2 AM.'],
          ['you', 'Who orders things at 2 AM?'],
          ['tom', 'Everyone. Once it exists.'],
          ['you', 'So shops upload their products. With a price.'],
          ['tom', 'Uncle Ramesh has a shop. He\'d do it. Probably.'],
          ['you', 'And people just press Order? No payments?'],
          ['tom', 'Cash on delivery. Keep it simple.'],
          ['tom', 'I\'m calling it Tomazon.'],
          ['you', 'Why Tom—'],
          ['tom', 'Everything from A to T.'],
          ['you', 'What comes after T?'],
          ['tom', 'Version 2.']
        ]
      }, clock: ['Wed 11 Mar', '23:40'],
      kicker: 'Wednesday 11 March · 11:40 PM',
      title: 'Tom has an idea',
      body: '<p>Exams are over. The Maggi is getting cold. Your friend Tom has been staring at the ceiling for ten minutes.</p>',
      notes: '<p>Let the conversation play (it plays itself; Pause and Next line are under the chat). Point out the 2 AM line: it comes back in Chapter 2.</p>' +
        '<p>Ask: <b>is this a good idea?</b> Then: <b>how would you find out, without spending six months building it?</b></p>'
    },
    {
      id: 'mvp', card: { kind: 'mvp' }, clock: ['Wed 11 Mar', '23:58'],
      kicker: 'Wednesday · 11:58 PM',
      title: 'Not a small product. An experiment.',
      body: '<p>You both want to start building everything. Then you remember the one useful line from the startup club talk: an MVP is not a smaller, buggier version of your final product. It\'s an experiment. Its job isn\'t money or users. Its job is to find out whether your idea is true.</p>',
      notes: '<p>Read the hypothesis out loud. The success number matters: decide what "it worked" means <b>before</b> you build, or you\'ll call anything a success.</p>' +
        '<p>Click both outcomes. If the idea is wrong, you lost a weekend, not six months. That\'s the whole point of an MVP.</p>'
    },
    {
      id: 'scope', card: { kind: 'scope' }, hour: 0, clock: ['Thu 12 Mar', '19:00'],
      kicker: 'Thursday 12 March · 7:00 PM · Hour 0 of 48',
      title: '48 hours',
      body: '<p>You agree on a deadline: <b>48 hours</b>, starting now. Tom wants everything. Pick what goes into the experiment. Every feature costs hours, and the clock is already running.</p>',
      notes: '<p>Let the room vote features in and out. The four that test the hypothesis are locked in. Everything else has to justify itself.</p>' +
        '<p>Payments is the classic trap: cash on delivery tests the same hypothesis for zero hours. Ask: <b>which of these features would change what we learn?</b> (Almost none.)</p>'
    },
    {
      id: 'stack', card: { kind: 'stack' }, hour: 0.3, clock: ['Thu 12 Mar', '19:20'],
      kicker: 'Thursday · 7:20 PM',
      title: 'Choosing your tools',
      body: '<p>Before the first line of code, you need a <b>tech stack</b>: the layers your app is built from. Each layer answers one question. Click a layer to see what it does. The dot on the right is a request travelling down the stack and the answer coming back up.</p>',
      notes: '<p>This is the map for the next decisions. The panel on the right fills in as you go.</p>' +
        '<p>Make the point early: for an MVP, the best choice at almost every layer is the boring one you already know.</p>'
    },
    {
      id: 'language', card: { kind: 'language' }, hour: 0.6, decides: 'language', clock: ['Thu 12 Mar', '19:35'],
      kicker: 'Thursday · 7:35 PM',
      title: 'Which language?',
      body: '<p>Python, JavaScript, Java, Go, Ruby, Rust. Any of them could build Tomazon. Click each one to hear you and Tom argue about it, then decide.</p>',
      notes: '<p>For an MVP, the best language is the one you already know. The speed that matters is how fast you learn whether the idea works, not how fast the code runs.</p>' +
        '<p>Ask the seniors: <b>when would you pick Go or Java instead?</b> (A team that already knows it, very high throughput, a big codebase that benefits from strict types.)</p>'
    },
    {
      id: 'framework', card: { kind: 'framework' }, hour: 1.2, decides: 'framework', clock: ['Thu 12 Mar', '20:10'],
      kicker: 'Thursday · 8:10 PM',
      title: 'A language is not enough',
      body: '<p>Python on its own can answer a web request, but you\'d write all the plumbing by hand: reading the URL, checking every input, turning results into JSON. A <b>framework</b> does the plumbing so you only write the Tomazon parts. Compare the two, then send each one a bad request.</p>',
      notes: '<p>Send <code>{"product_id": "abc"}</code> in both tabs. Plain Python crashes with a 500. FastAPI answers with a clear 422, because the type hints double as input checking.</p>' +
        '<p>Be fair to the others: Django is even more "batteries included" (admin panel, ORM and logins built in). Flask is minimal. FastAPI is the modern middle: small, fast, with validation and API docs for free.</p>'
    },
    {
      id: 'orm', card: { kind: 'orm' }, hour: 2, decides: 'orm', clock: ['Thu 12 Mar', '21:00'],
      kicker: 'Thursday · 9:00 PM',
      title: 'Talking to the database',
      body: '<p>Your code needs to ask the database things like "which products does shop 7 sell?". You could glue SQL strings together yourself, or use an <b>ORM</b> (object-relational mapper) that turns Python into SQL for you. Type a store ID, then try something sneaky.</p>',
      notes: '<p>This is <b>SQL injection</b>, still one of the most common security holes on the web. An ORM sends the value separately from the query (a parameter), so a value can never turn into code.</p>' +
        '<p>For the seniors: an ORM isn\'t magic. It can still produce slow queries. That\'s a problem for a later chapter.</p>'
    },
    {
      id: 'data', card: { kind: 'datamodel' }, hour: 3.5, decides: 'dbkind', clock: ['Thu 12 Mar', '22:30'],
      kicker: 'Thursday · 10:30 PM',
      title: 'Where does the data live?',
      body: '<p>Shops, products and orders have to live somewhere that survives a reboot. Two big families: <b>relational</b> databases, like giant, strict, linked spreadsheets, and <b>non-relational</b> ones, like folders of flexible documents.</p>',
      notes: '<p>Run "Rename a shop" in both views: one row versus hundreds of copies. Then "A product with odd fields": documents win on flexibility.</p>' +
        '<p>Ask: <b>for a shop, what matters more: flexibility or correctness?</b> (Correctness. Stock and money must never be wrong.)</p>'
    },
    {
      id: 'acid', card: { kind: 'acid' }, hour: 4.2, decides: 'dbkind', clock: ['Thu 12 Mar', '23:15'],
      kicker: 'Thursday · 11:15 PM',
      title: 'ACID: why shops need transactions',
      body: '<p>One protein shaker left. Two customers press Buy at the same moment. Or the server loses power halfway through an order. What happens to your data? Run both experiments with transactions <b>off</b>, then <b>on</b>.</p>',
      notes: '<p>The race is about <b>Isolation</b>. The power cut is about <b>Atomicity</b>. Then explain the other two letters: <b>Consistency</b> (rules like "stock never below zero" always hold) and <b>Durability</b> (once it says "Order placed", it survives a crash, because it\'s written to disk first).</p>' +
        '<p>This is why e-commerce, banking and bookings live on relational databases.</p>'
    },
    {
      id: 'postgres', card: { kind: 'dbpick' }, hour: 5.1, decides: 'db', clock: ['Fri 13 Mar', '00:05'],
      kicker: 'Friday 13 March · 12:05 AM',
      title: 'PostgreSQL or MySQL?',
      body: '<p>Both are free, fast and run some of the biggest sites in the world. Tom suggests a third option.</p>',
      notes: '<p>Be fair to MySQL: it would have been a perfectly good choice. PostgreSQL wins here on JSONB for odd product fields, strictness about bad data, and extensions like PostGIS for "shops near me" later.</p>' +
        '<p>Excel is the joke, but ask: <b>why exactly can\'t a spreadsheet be our database?</b> (Many writers at once, transactions, size.)</p>'
    },
    {
      id: 'cloud', card: { kind: 'cloud' }, hour: 46.5, decides: 'cloud', clock: ['Sat 14 Mar', '17:30'],
      kicker: 'Saturday 14 March · 5:30 PM · Hour 46',
      title: 'Where will it run?',
      body: '<p>Forty-six hours in. The code works on your laptop. The deadline is 7 PM. Now Tomazon needs a computer that\'s always on, with a public address. Three clouds and one very bad idea.</p>',
      notes: '<p>AWS and Google Cloud are more powerful, and everything you learn there is valuable. But for one server, today, simplicity wins. Be fair: AWS Lightsail is AWS\'s own simple option.</p>' +
        '<p>Ask: <b>what would make you move to AWS later?</b> (Managed databases, more regions, a team that knows it, credits.)</p>'
    },
    {
      id: 'droplet', card: { kind: 'droplet' }, hour: 47.1, decides: 'server', clock: ['Sat 14 Mar', '18:05'],
      kicker: 'Saturday · 6:05 PM · Hour 47',
      title: 'Create the server',
      body: '<p>Four choices and a button: where it lives, what it runs, how big it is, and how you\'ll log in. The real form looks different, but it asks exactly these questions.</p>',
      notes: '<p>Point at the size: <b>512 MB, $4 a month</b>. Zero users, zero revenue: this is the responsible choice. Ask the room to remember the number. It comes back in Chapter 2.</p>' +
        '<p>Bangalore because the customers are nearby: every request makes a round trip, and distance is time.</p>'
    },
    {
      id: 'ssh', sim: 'fresh', hour: 47.3,
      kicker: 'Saturday · 6:20 PM · Hour 47',
      title: 'Hello, server',
      body: '<p>A computer in Bangalore now has your name on it and a public IP address: <b>203.0.113.42</b>. Nothing runs on it yet except Ubuntu and the front door you\'re about to knock on: <b>SSH</b>.</p>',
      chips: ['ssh root@203.0.113.42', 'yes'],
      notes: '<p>The first time you connect, SSH asks whether you trust this machine\'s fingerprint. It\'s checking that nobody is pretending to be your server. Type <code>yes</code>.</p>' +
        '<p>Point at the login banner: memory usage around 20%. Ubuntu alone uses about 100 MB of your 512. On the left, the browser says "refused": nothing is listening for web traffic yet.</p>' +
        '<p>Fun fact: within minutes of creating any server, bots from around the world start knocking on it, trying passwords. That\'s why you picked an SSH key.</p>'
    },
    {
      id: 'deploy', sim: 'fresh', hour: 47.5,
      kicker: 'Saturday · 6:31 PM · Hour 47',
      title: 'Ship it',
      body: '<p>Three steps between you and a live website: install the software, fetch your code, and run the deploy script you wrote at 4 AM. Watch the server card on the left as each piece arrives.</p>',
      chips: ['apt install -y nginx postgresql python3-venv', 'git clone https://github.com/tom-and-you/tomazon.git', 'cd tomazon && ./deploy.sh'],
      notes: '<p>After <code>apt</code> finishes, the browser shows "Welcome to nginx!": the web server works but has nothing to serve yet. PostgreSQL appears using about 170 MB.</p>' +
        '<p>The deploy script installs the Python packages, creates the tables (migrations), gets an HTTPS certificate, and starts the app. Look at the memory bar: about three quarters of the 512 MB is gone before a single customer arrives.</p>'
    },
    {
      id: 'live', sim: 'fresh', ensureLive: true, clockJump: '19:01:00', hour: 48,
      kicker: 'Saturday · 7:01 PM · Hour 48',
      title: 'Tomazon is live',
      body: '<p>Tom opens tomazon.app on his phone. It loads. He sends the link to every shopkeeper he knows, and to Uncle Ramesh. Each white dot on the left is a request going in; each green dot is a fast answer coming back.</p>',
      overlay: { kind: 'launch' },
      notes: '<p>Celebrate. Then walk the diagram: the browser, requests on the top lane, answers on the bottom lane, and one small box running everything.</p>' +
        '<p>Ask: <b>what\'s the single point of failure here?</b> (All of it: one machine, one disk, one database.)</p>' +
        '<p>Tease Chapter 2: six months later, at 2 AM, your phone rings.</p>'
    }
  ];

  const content = {
    products: [
      { name: 'Protein Shaker, Leak-Proof (mostly)', price: '₹99', rating: '★★★★½', reviews: '12', icon: 'shaker', bg: '#ffe4dc', badge: 'New', shop: 'Sharma General Store' },
      { name: 'Rubber Duck for Debugging, Senior Edition', price: '₹249', rating: '★★★★★', reviews: '3', icon: 'duck', bg: '#e0f2fe', shop: 'Sharma General Store' },
      { name: 'Mechanical Keyboard That Wakes the Neighbours', price: '₹3,499', rating: '★★★★', reviews: '1', icon: 'keyboard', bg: '#ede9fe', shop: 'Ravi Electronics' },
      { name: 'Mug: "It Works On My Machine"', price: '₹349', rating: '★★★★½', reviews: '7', icon: 'mug', bg: '#fef3c7', shop: 'Sharma General Store' },
      { name: 'USB-C Cable That Works on the First Try', price: '₹599', rating: '★★★', reviews: '2', icon: 'cable', bg: '#dcfce7', badge: 'Rare find', shop: 'Ravi Electronics' },
      { name: 'Headphones for Open-Plan Offices', price: '₹2,199', rating: '★★★★', reviews: '4', icon: 'headphones', bg: '#f1f5f9', shop: 'Ravi Electronics' }
    ],
    launch: {
      order: { title: 'New order #1', item: '2-slice toaster · ₹1,299', from: 'From: Ramesh (Tom\'s uncle) · Cash on delivery' },
      tracker: [['Shops listed', '3 of 10'], ['Orders', '1 of 30'], ['Days left in the experiment', '14']]
    }
  };

  TZ.CHAPTERS = TZ.CHAPTERS || [];
  TZ.CHAPTERS[0] = { id: 'ch1', number: 1, title: '48 Hours', sims, scenes, stack, content };
})();
