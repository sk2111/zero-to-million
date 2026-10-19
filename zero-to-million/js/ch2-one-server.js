/* Chapter 2: One server.
   Same conventions as chapter 1: each section is one page, `group` is the part
   of the chapter it belongs to, and text is written as numbered points. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[2] = {
  intro: `
    <ol class="points lede">
      <li>You now have the fundamentals. Time to put them into practice.</li>
      <li>Here’s the project: build an online store like Amazon, called <strong>Tomazon</strong>. What’s the first thing you do?</li>
      <li>Not writing code, and not choosing a database. First, find out what is really being asked for, and roughly how big it will be.</li>
      <li>Then start small: a pilot that real shoppers can use, built as one app on one server. In this phase the goal is speed: build, ship, watch how people use it, and change it, as fast as possible.</li>
    </ol>
    <aside class="note important">
      <h3>Important: we build it from the parts</h3>
      <ol class="points">
        <li>AWS can hide most of this behind serverless and managed services: Lambda or Fargate instead of a server you run, DynamoDB or Aurora Serverless instead of your own PostgreSQL.</li>
        <li>We mention them where they fit, but we don’t build Tomazon with them. Doing that would skip exactly what this workshop is here to teach.</li>
        <li>Building from the parts gives you the mental model underneath: CPU, memory, disk, network, processes and connections. With it, you can reason about what a managed or serverless service does for you, where its limits come from, what it costs, and when it’s the right choice.</li>
      </ol>
    </aside>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Turn a vague request into clear functional and non-functional requirements.</li>
        <li>Estimate users, traffic, storage, memory and bandwidth on paper, before buying anything.</li>
        <li>Explain what a pilot is for, and what to leave out of it.</li>
        <li>Explain why a monolith is usually the right first architecture.</li>
        <li>Draw the first architecture, one server on AWS, and the path one request takes through it.</li>
        <li>Say what to measure while the pilot runs, and what will run out first.</li>
      </ul>
    </div>`,

  sections: [

    /* ===================================================== Before you build */
    {
      group: 'Before you build',
      slug: 'requirements',
      title: 'Clarify the requirements',
      sub: 'Before any code, find out what is really being asked for.',
      html: `
        <ol class="points lede">
          <li>“Build a store like Amazon” sounds like a clear request. It isn’t. It could mean a marketplace for hundreds of millions of people, or a small shop in one city that sells a few thousand products.</li>
          <li>Those are completely different systems. So the first thing to do is ask questions until you know which one you’re building.</li>
          <li>There are two kinds of requirements to pin down: what the system must do (<strong>functional</strong>), and how well it must do it (<strong>non-functional</strong>).</li>
        </ol>

        <h2>Functional requirements: what it must do</h2>
        <p>Ask these first. The answers on the right are the ones Tomazon is built on for the rest of the workshop:</p>
        <table class="data">
          <thead><tr><th>Ask</th><th>Why it matters</th><th>Tomazon’s answer</th></tr></thead>
          <tbody>
            <tr><td>Who will use it?</td><td>A public store has to handle strangers: sign-up, fraud, and traffic you don’t control.</td><td>Shoppers, starting in one city, Bangalore. Plus Tomazon’s own staff, who add products and send out orders.</td></tr>
            <tr><td>What are the core features, and which matter most?</td><td>Build the most important ones first, and leave the rest for later.</td><td>Must have: search and browse products, a cart, checkout and payment, order history. Later: reviews, wish lists, recommendations, other sellers.</td></tr>
            <tr><td>What exactly can a user do?</td><td>Each action becomes an API endpoint and a few database tables.</td><td>Shoppers search, view a product, add it to the cart, pay, and track their orders. Staff add products, update stock and mark orders as shipped.</td></tr>
            <tr><td>How will they use it?</td><td>A website, mobile apps and a public API each need different work.</td><td>A website that works well on phones. Apps can come later.</td></tr>
            <tr><td>Which languages and currencies?</td><td>Each one adds translated text, formats and prices.</td><td>English, with prices in rupees.</td></tr>
            <tr><td>What kinds of data?</td><td>Text, images and structured data each suit a different kind of storage.</td><td>Products, prices, stock, orders and customers are structured, and orders need transactions: a relational database. Product photos are files: object storage.</td></tr>
            <tr><td>Which outside systems does it need?</td><td>Every dependency adds waiting time and a new way to fail.</td><td>A payment gateway for cards and UPI, a delivery partner, and SMS and email for order updates.</td></tr>
          </tbody>
        </table>

        <h2>Non-functional requirements: how well it must do it</h2>
        <table class="data">
          <thead><tr><th>Ask</th><th>Why it matters</th><th>Tomazon’s answer</th></tr></thead>
          <tbody>
            <tr><td>How many users and requests?</td><td>It sets the size of everything else.</td><td>About 100 regular shoppers in the pilot. 1,000 if it catches on, and millions in the long run.</td></tr>
            <tr><td>How much data, and how fast does it grow?</td><td>It decides the storage, and when one disk stops being enough.</td><td>About 2,000 products to start, each with a few photos. Orders are small; photos are not (next page).</td></tr>
            <tr><td>What goes in, and what comes out?</td><td>Request and response sizes decide the network bandwidth.</td><td>Small JSON in and out, plus product photos: the biggest responses by far.</td></tr>
            <tr><td>How many reads for each write?</td><td>Read-heavy systems scale with caches and copies of the database; write-heavy ones need other tools.</td><td>Very read-heavy: shoppers look at many products for every one they buy.</td></tr>
            <tr><td>Can it ever be down?</td><td>Staying up through failures needs at least two of everything, which costs money and time.</td><td>The pilot can be down for an hour at night now and then. Later, every minute down is lost sales.</td></tr>
            <tr><td>How fast must it be?</td><td>It sets a time budget for every part of a request.</td><td>Product pages in well under a second. Checkout can take a couple of seconds, because it waits for the payment gateway.</td></tr>
            <tr><td>How up to date must the data be?</td><td>Always showing the latest data is simple on one server, and harder once data is copied (chapter 5).</td><td>Stock and payments must be exact: never sell the last item twice, never charge twice. Product pages and reviews can be a moment behind.</td></tr>
            <tr><td>What matters most?</td><td>You can’t optimise for everything at once.</td><td>For the pilot: speed of change and low cost. Correct orders and payments, always.</td></tr>
          </tbody>
        </table>

        <h2>How to ask</h2>
        <ol class="points">
          <li>Ask the people who asked for it, and the people who will use it: here, Tomazon’s founders and a few would-be shoppers. They often want different things.</li>
          <li>Push for numbers. “Lots of products” and “fast” can’t be designed for; “2,000 products” and “pages in under a second” can.</li>
          <li>Write down what’s out of scope too: no mobile app, no other sellers, one city. It stops the project from growing quietly.</li>
          <li>Agree on the answers before you build. Getting the scope right early stops you from building the wrong system well.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Non-functional requirements decide the architecture.</strong> Tomazon for 100 shoppers and Amazon for
            hundreds of millions have the same features: search, cart, checkout. Almost everything else about them is different.</li>
            <li><strong>Every answer is a design decision.</strong> “One city” rules out several regions and most of the scale.
            “Never sell the last item twice” decides how stock is updated at checkout.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Don’t design anything until you can say who uses it, what they do with it, and how many of them there are.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Before you build',
      slug: 'estimates',
      title: 'Estimate the capacity',
      sub: 'Users, traffic, storage, memory and network, worked out on paper before you buy anything.',
      html: `
        <ol class="points lede">
          <li>With the requirements written down, put rough numbers on them. It’s the estimation from page 1.13, applied to a real product.</li>
          <li>The numbers don’t need to be exact. They need to tell you whether this is one small server or fifty big ones.</li>
          <li>Work each one out for the pilot, and again for the 1,000 shoppers you hope to reach, so you can see what grows fastest.</li>
        </ol>

        <h2>Tomazon, in numbers</h2>
        <p>Assume about 1 in 10 regular shoppers is online at the busiest hour, and each makes a request every 2 seconds while
        browsing. About 1 request in 5 opens a product page, with 5 photos of about 200 KB each. Each shopper orders about once a week.</p>
        <table class="data">
          <thead><tr><th>Estimate</th><th>How</th><th>The pilot: 100 shoppers</th><th>At 1,000 shoppers</th></tr></thead>
          <tbody>
            <tr><td>Online at the busiest hour</td><td>About 1 in 10 regular shoppers</td><td>10</td><td>100</td></tr>
            <tr><td>Traffic</td><td>Shoppers online × 1 request every 2 seconds</td><td>10 × 0.5 = <strong>5 requests a second</strong></td><td>100 × 0.5 = <strong>50 requests a second</strong></td></tr>
            <tr><td>CPU</td><td>Requests a second × about 10 ms of CPU each</td><td>5 × 10 ms = <strong>5% of one core</strong></td><td>50 × 10 ms = <strong>half a core</strong></td></tr>
            <tr><td>Database</td><td>Products at about 5 KB each, orders at about 2 KB each</td><td>2,000 products = 10 MB, plus <strong>about 10 MB of orders a year</strong></td><td>10,000 products = 50 MB, plus <strong>about 100 MB of orders a year</strong></td></tr>
            <tr><td>Photos</td><td>Products × 5 photos × 200 KB</td><td>2,000 × 1 MB = <strong>2 GB</strong></td><td>10,000 × 1 MB = <strong>10 GB</strong></td></tr>
            <tr><td>Memory</td><td>The app’s workers, the database and its cache, and the OS (page 2.5)</td><td><strong>About 400 MB</strong>: fits in 512 MB</td><td><strong>About 670 MB</strong>: more than 512 MB</td></tr>
            <tr><td>Network</td><td>About 4 KB per request, plus 1 MB of photos per product page (page 1.8)</td><td>5 × 4 KB + 1 page a second × 1 MB = <strong>about 1 MB/s</strong> (8 Mbps)</td><td>50 × 4 KB + 10 pages a second × 1 MB = <strong>about 10 MB/s</strong> (80 Mbps)</td></tr>
          </tbody>
        </table>

        <h2>What the numbers say</h2>
        <ol class="points">
          <li><strong>The pilot is small on every count.</strong> 5 requests a second, 20 MB of data and 1 MB/s of traffic fit on one small server (page 2.5).</li>
          <li><strong>Photos are the heaviest part by far.</strong> They’re 100 times bigger than the database, and almost all of the network traffic. For the pilot, Nginx can serve them from the server’s disk.</li>
          <li><strong>Keep the estimates.</strong> Once the pilot runs, compare them with what you measure (page 2.6). Where they differ, you’ve learned how people really use the store.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Estimate the busiest hour, not the day.</strong> 100 shoppers spread over a day is almost nothing; the
            same shoppers all browsing at 9 p.m. are your real load.</li>
            <li><strong>Keep big files apart from everything else.</strong> Photos and the database grow at very different rates,
            and want very different storage.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Estimate to find the order of magnitude, then measure to correct it.</p>
        </aside>`
    },

    /* =========================================================== The pilot */
    {
      group: 'The pilot',
      slug: 'pilot',
      title: 'Start with a pilot',
      sub: 'Find out whether people want it before building it to last.',
      html: `
        <ol class="points lede">
          <li>A <strong>pilot</strong>, or MVP (minimum viable product), is the smallest version of the product that real users can use.</li>
          <li>Its job is to answer one question: do people want this? Everything else can wait until the answer is yes.</li>
        </ol>

        <h2>What a pilot optimises for</h2>
        <ol class="points">
          <li><strong>Speed of change.</strong> In the early days you’ll change the product every week as you learn. The faster you can build, ship and change, the faster you find what works.</li>
          <li><strong>Learning.</strong> Measure how people actually use it: which features, how often, where they give up. Ask them for feedback directly.</li>
          <li><strong>Low cost.</strong> A pilot that fails should cost weeks, not months, and very little money.</li>
        </ol>

        <h2>What a pilot doesn’t need yet</h2>
        <table class="data">
          <thead><tr><th>Leave out</th><th>Why it can wait</th><th>Add it when</th></tr></thead>
          <tbody>
            <tr><td>Several servers and a load balancer</td><td>A handful of users fit easily on one machine</td><td>Traffic is real, or the product must survive a server failure (chapter 4)</td></tr>
            <tr><td>Microservices</td><td>They slow down every change while the product is still moving</td><td>The team and the codebase are big enough that one codebase gets in the way</td></tr>
            <tr><td>Kubernetes</td><td>A lot to learn and run for one small app</td><td>You run many services and need to automate deploying them</td></tr>
            <tr><td>Caches, queues, read replicas</td><td>They solve problems you don’t have yet</td><td>Measurements show a real bottleneck (chapters 5, 6 and 8)</td></tr>
            <tr><td>Several regions</td><td>The users are in one place</td><td>Users are spread across the world, or you must survive a region going down (chapters 11 and 13)</td></tr>
          </tbody>
        </table>

        <h2>What a pilot does need</h2>
        <ol class="points">
          <li><strong>HTTPS</strong> from day one: shoppers type in passwords and addresses.</li>
          <li><strong>Payments through a payment gateway</strong> such as Razorpay or Stripe. Card details go straight to the gateway and never touch your server, which keeps most of the card-security rules (PCI DSS) off your plate.</li>
          <li><strong>Backups</strong> of the database, and one test that you can actually restore them.</li>
          <li><strong>Basic monitoring:</strong> is it up, how fast is it, is it running out of anything. Chapter 1’s tools cover this.</li>
          <li><strong>A way to see usage and collect feedback</strong>, covered on page 2.6.</li>
          <li><strong>A simple, repeatable deploy:</strong> one command or one pipeline, so shipping a change is boring.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Optimise for change, not for scale.</strong> Most pilots never need to handle a million users. The ones
            that do will have the time, the money and the reasons to change the architecture.</li>
            <li><strong>Write down the limits you accept.</strong> “One server, no high availability, up to about 100 users” is
            a fine decision, as long as everyone knows it was made on purpose.</li>
            <li><strong>Keep the exit doors open.</strong> Clean module boundaries, a standard database and configuration in
            environment variables cost little now, and make every later step easier.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Build the simplest thing that lets real users try the product, and measure everything they do.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'The pilot',
      slug: 'monolith',
      title: 'Start with a monolith',
      sub: 'One codebase, one app to deploy: the fastest way to start.',
      html: `
        <ol class="points lede">
          <li>A <strong>monolith</strong> is one application that contains every feature: one codebase, built and deployed as one unit, usually with one database.</li>
          <li><strong>Microservices</strong> split the same features into many small applications that talk to each other over the network.</li>
        </ol>

        <h2>Why a monolith is the right start</h2>
        <ol class="points">
          <li><strong>Simple to develop.</strong> One codebase, one language, one place to look. A new feature is a new module, not a new service.</li>
          <li><strong>Simple to test.</strong> Run the whole app on a laptop and test it end to end, with no other services to fake.</li>
          <li><strong>Simple to deploy.</strong> One thing to build, one thing to ship, one thing to roll back.</li>
          <li><strong>Simple to debug.</strong> One log, one process, and a stack trace that shows the whole story.</li>
          <li><strong>Fast and reliable inside.</strong> A call between two features is a function call: nanoseconds, and it never gets lost. Between microservices it’s a network call: milliseconds, and it can fail.</li>
          <li><strong>Easy transactions.</strong> Saving an order and updating the stock happen in one database transaction, instead of being coordinated across services.</li>
        </ol>

        <table class="data">
          <thead><tr><th></th><th>Monolith</th><th>Microservices</th></tr></thead>
          <tbody>
            <tr><td>Codebases and deploys</td><td>One</td><td>One per service</td></tr>
            <tr><td>A call between two features</td><td>A function call: nanoseconds</td><td>A network call: milliseconds, and it can fail</td></tr>
            <tr><td>Testing the whole product</td><td>Run one app</td><td>Run every service, or fake them</td></tr>
            <tr><td>Data shared by features</td><td>One database, one transaction</td><td>Each service owns its data, and keeping it consistent is your job</td></tr>
            <tr><td>Right for</td><td>Small teams and products that are still changing</td><td>Large teams that need to ship independently</td></tr>
          </tbody>
        </table>

        <h2>Build it so it can be split later</h2>
        <ol class="points">
          <li>Organise the code by feature (orders, users, search), each in its own module with a clear interface. This is often called a <strong>modular monolith</strong>.</li>
          <li>Let modules use each other only through those interfaces, never by reaching into each other’s tables.</li>
          <li>Then, if one part later needs to scale on its own, it can move out into a service without rewriting everything.</li>
        </ol>

        <figure class="term">
          <figcaption>A modular FastAPI monolith</figcaption>
<pre><span class="o">app/
  main.py          <span class="c"># creates the FastAPI app and adds each module’s routes</span>
  products/
    api.py         <span class="c"># HTTP routes: /api/products/…</span>
    service.py     <span class="c"># business logic; other modules call this</span>
    models.py      <span class="c"># its database tables</span>
  orders/
    api.py
    service.py     <span class="c"># calls products.service for prices and stock</span>
    models.py
  users/
    api.py
    service.py
    models.py</span></pre>
          <ol class="points term-note">
            <li>Each folder is one feature, with the same three files.</li>
            <li><code>orders</code> asks <code>products.service</code> for prices and stock, and never reads the products tables directly. That one rule is what makes a later split possible.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Split only for a reason you can name.</strong> Good reasons: one part needs very different scaling, or
            teams keep blocking each other. “Microservices are modern” is not a reason.</li>
            <li><strong>Most of the cost of microservices is the network.</strong> Every split turns a function call into a
            network call that can be slow, fail or time out, as chapter 1 showed.</li>
            <li><strong>A modular monolith is cheap insurance.</strong> Good module boundaries cost little now, and decide how
            painful a later split will be.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Monolith first. Split a part out when you can point at the problem it solves, not before.</p>
        </aside>`
    },

    /* ========================================================== One server */
    {
      group: 'One server',
      slug: 'first-architecture',
      title: 'The first architecture',
      sub: 'One small server on AWS, running the whole product.',
      html: `
        <ol class="points lede">
          <li>For the pilot, everything runs on one virtual machine: the web server, the FastAPI app and the PostgreSQL database.</li>
          <li>Here’s what that looks like on AWS, for Tomazon’s first shoppers in Bangalore. Step through it to follow one request.</li>
        </ol>

        <div class="widget" data-widget="pilot-arch"></div>
        <p class="caption">AWS has no Bangalore region. Mumbai (ap-south-1) is the nearest region with every service; Hyderabad (ap-south-2) is closer but newer, with fewer services.</p>

        <h2>What’s in the picture</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>What it does</th><th>Worth knowing</th></tr></thead>
          <tbody>
            <tr><td>EC2 instance, t4g.nano</td><td>The virtual machine: 2 vCPUs (ARM, AWS Graviton), 512 MB of RAM, Ubuntu</td><td>Burstable: it runs at full speed on CPU credits, with a baseline of 5% per vCPU. Fine for a pilot’s light, spiky traffic (page 1.4).</td></tr>
            <tr><td>EBS gp3 disk, 20 GB</td><td>The server’s disk, attached over AWS’s network: Ubuntu, PostgreSQL’s data, the product photos and a swap file</td><td>About 9 GB is used: Ubuntu about 5 GB, photos 2 GB, swap 1 GB, and the database well under 1 GB (page 2.2). gp3 is AWS’s default SSD volume (page 1.7).</td></tr>
            <tr><td>Network</td><td>Carries every request and response, photos included</td><td>Sold as “up to 5 Gbps”, but a t4g.nano’s steady baseline is 32 Mbps. It goes faster only in bursts, while it has network credits (page 1.8).</td></tr>
            <tr><td>Nginx</td><td>Accepts HTTPS on port 443, holds the TLS certificate (free from Let’s Encrypt), and forwards each request to the app</td><td>It also serves the product photos straight from the disk, and shields the app from slow clients.</td></tr>
            <tr><td>FastAPI under Gunicorn</td><td>Your application, as 2 worker processes, one per vCPU</td><td>With <code>async</code> endpoints, each worker can hold many waiting requests at once (page 1.12).</td></tr>
            <tr><td>PostgreSQL</td><td>The database, reached over <code>localhost</code></td><td>A query has no network round trip. Its data lives on the gp3 disk.</td></tr>
            <tr><td>Elastic IP and Route 53</td><td>A fixed public IP address, and DNS that points your domain at it</td><td>Without an Elastic IP, the address changes when the server is stopped and started.</td></tr>
            <tr><td>Security group</td><td>The firewall: port 443 open to everyone, port 22 (SSH) only from your office</td><td>PostgreSQL’s port stays closed to the internet.</td></tr>
            <tr><td>EBS snapshots</td><td>A daily copy of the disk, stored by AWS</td><td>Your backup. Restore one to a test server once, to be sure it works.</td></tr>
          </tbody>
        </table>

        <h2>Will it fit in 512 MB?</h2>
        <p>A rough memory budget for this server, using chapter 1’s numbers:</p>
        <div class="budget" role="img" aria-label="512 MB: about 150 MB for Ubuntu, 110 MB for PostgreSQL, 140 MB for two FastAPI workers, 10 MB for Nginx, and 100 MB left for the page cache">
          <span class="b-os" style="flex-grow:150"><b>150 MB</b></span>
          <span class="b-db" style="flex-grow:110"><b>110 MB</b></span>
          <span class="b-app" style="flex-grow:140"><b>140 MB</b></span>
          <span class="b-ng" style="flex-grow:10"></span>
          <span class="b-free" style="flex-grow:100"><b>100 MB</b></span>
        </div>
        <div class="legend budget-legend"><span><i class="sw b-os"></i>Ubuntu and system services</span><span><i class="sw b-db"></i>PostgreSQL</span><span><i class="sw b-app"></i>FastAPI, 2 workers</span><span><i class="sw b-ng"></i>Nginx, 10 MB</span><span><i class="sw b-free"></i>Left for the page cache</span></div>
        <ol class="points">
          <li>It fits, but only just. PostgreSQL has about 100 MB of page cache for its data, so once the data grows past that, queries start reading from disk (page 1.6).</li>
          <li>Add a 1 GB swap file as a safety net, so a sudden spike slows the server down instead of the OOM killer stopping PostgreSQL.</li>
        </ol>

        <h2>Does it fit the estimates?</h2>
        <p>Every estimate from page 2.2, next to what this server gives:</p>
        <table class="data">
          <thead><tr><th>Resource</th><th>The pilot needs</th><th>A t4g.nano gives</th><th>Fits?</th></tr></thead>
          <tbody>
            <tr><td>CPU</td><td>5 requests a second × 10 ms: 5% of one core</td><td>2 vCPUs, with a steady baseline of 5% each: 10% of one core</td><td>Yes, with CPU credits for spikes</td></tr>
            <tr><td>Memory</td><td>About 400 MB</td><td>512 MB</td><td>Yes, only just</td></tr>
            <tr><td>Disk space</td><td>About 9 GB</td><td>20 GB</td><td>Yes, with room to grow</td></tr>
            <tr><td>Disk speed</td><td>About 10 reads and 1 MB a second, for photos. Database reads come from RAM.</td><td>250 IOPS and 5.4 MB/s steady. gp3’s 3,000 IOPS and 125 MB/s only in bursts.</td><td>Yes</td></tr>
            <tr><td>Network</td><td>About 8 Mbps, or 12 Mbps with 50% headroom</td><td>32 Mbps steady, bursts to 5 Gbps</td><td>Yes</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>The pilot fits on every count, with the most room on disk space and the least on memory.</li>
          <li><strong>A small instance limits its disk and network, not just its CPU.</strong> A gp3 volume offers 3,000 IOPS and 125 MB/s, but a t4g.nano can only use 250 IOPS and 5.4 MB/s steadily (page 1.7).</li>
          <li>When traffic becomes steady rather than spiky, move to a bigger or non-burstable instance. That’s where chapter 3 starts.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Keep the database on the same server, for now.</strong> There’s no network hop and nothing extra to run.
            The cost: the app and the database fight over the same CPU and memory, and one failure takes both down. Chapter 3 splits them.</li>
            <li><strong>This server is a single point of failure.</strong> If it stops, the product is down until it’s back. For
            a pilot that’s usually an acceptable trade-off, as long as it’s written down.</li>
            <li><strong>Automate the setup.</strong> A script, or a tool such as Ansible or Terraform, lets you rebuild the server
            from scratch in minutes. That is your real disaster recovery.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>One small server, HTTPS, daily backups, and a written list of what you’ve chosen not to handle yet.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'One server',
      slug: 'watching-the-pilot',
      title: 'Watching the pilot',
      sub: 'Two things to measure: how the product is used, and how the server is coping.',
      html: `
        <ol class="points lede">
          <li>A pilot exists to learn, so measuring is part of the product, not an extra.</li>
          <li>Watch two things: how people use the product, and how the server is coping.</li>
        </ol>

        <h2>How the product is used</h2>
        <ol class="points">
          <li><strong>Usage events.</strong> Record what shoppers do: searched, viewed a product, added it to the cart, started checking out, gave up halfway, paid. A simple events table in PostgreSQL is enough to start.</li>
          <li><strong>The key numbers.</strong> Visitors, orders, and the share of visits that end in an order. How many shoppers come back. And where they drop off between the cart and the payment.</li>
          <li><strong>Feedback.</strong> A feedback button in the app, plus talking to a few shoppers every week. What they say explains what the numbers show.</li>
        </ol>

        <h2>How the server is coping</h2>
        <table class="data">
          <thead><tr><th>Watch</th><th>Why</th><th>How</th></tr></thead>
          <tbody>
            <tr><td>Is it up?</td><td>Users notice downtime first</td><td>A check from outside every minute: CloudWatch Synthetics, or any uptime service</td></tr>
            <tr><td>Response time (p50 and p95) and errors</td><td>Slowness and errors drive users away quietly</td><td>Nginx access logs with the request time added, or metrics from the app</td></tr>
            <tr><td>CPU, memory, disk</td><td>The first thing to run out is your next problem (chapter 1)</td><td>CloudWatch shows CPU. Memory and disk need the CloudWatch agent: EC2 doesn’t report them by default.</td></tr>
            <tr><td>CPU credits</td><td>When a burstable server runs out of credits, it slows down, or in unlimited mode (the default for t4g) it keeps going and costs extra</td><td>CloudWatch’s <code>CPUCreditBalance</code> metric</td></tr>
            <tr><td>Backups</td><td>A backup you’ve never restored isn’t a backup</td><td>Check the daily snapshot exists, and restore one to a test server once</td></tr>
          </tbody>
        </table>

        <figure class="term">
          <figcaption>Try it on the server</figcaption>
<pre><span class="p">$</span> sudo tail -3 /var/log/nginx/access.log     <span class="c"># a simple log format, with the request time at the end</span>
<span class="o wrap">203.0.113.5 [16/Oct/2026:10:41:07 +0530] "GET /api/products?q=headphones HTTP/1.1" 200 5123 0.042
198.51.100.9 [16/Oct/2026:10:41:08 +0530] "POST /api/checkout HTTP/1.1" 200 1834 1.873
203.0.113.5 [16/Oct/2026:10:41:09 +0530] "GET /api/products/TZ-10442 HTTP/1.1" 200 2211 0.018</span></pre>
          <ol class="points term-note">
            <li>Each line is one request: who asked, when, what, the status code (200 is success), the response size in bytes, and the time in seconds.</li>
            <li>Product pages take 18–42 ms. The checkout takes 1.9 seconds: it waits for the payment gateway, so it’s I/O-bound (page 1.3).</li>
            <li>Collect these times and you can work out p50 and p95 for every endpoint (page 1.11).</li>
          </ol>
        </figure>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>The pilot does its job: it proves people want the product, and the numbers show what’s running low.</li>
          <li>Word spreads, and 1,000 shoppers are on their way.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Decide what success looks like before the pilot starts.</strong> For example: 200 orders
            in the first month, and a third of buyers ordering again. Then the data can actually answer the question.</li>
            <li><strong>Watch p95, not just the average.</strong> The slow requests are the ones users remember (page 1.11).</li>
            <li><strong>Set a few alarms, not many.</strong> Server down, errors rising, disk over 80% full, available memory
            under 20%. Alarms that nobody acts on soon get ignored.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>If you can’t tell how people are using the pilot, it isn’t teaching you anything.</p>
        </aside>`
    }
  ]
};
