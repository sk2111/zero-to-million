/* Chapter 2: One server.
   Same conventions as chapter 1: each section is one page, `group` is the part
   of the chapter it belongs to, and text is written as numbered points. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[2] = {
  intro: `
    <ol class="points lede">
      <li>You now know what one machine can do. Time to build something on it.</li>
      <li>Most products start as a pilot: a small version for real users, to find out whether it’s worth building properly. Internal tools such as a product explorer or a chat assistant usually start exactly this way.</li>
      <li>In this phase the goal is speed: build, ship, watch how people use it, and change it, as fast as possible. The architecture should help with that, not get in the way.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain what a pilot is for, and what to leave out of it.</li>
        <li>Explain why a monolith is usually the right first architecture.</li>
        <li>Draw the first architecture, one server on AWS, and the path one request takes through it.</li>
        <li>Say what to measure while the pilot runs, and what will run out first.</li>
        <li>Explain why one server stops coping as users grow, and diagnose it with chapter 1’s tools.</li>
      </ul>
    </div>`,

  sections: [

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
            <tr><td>Caches, queues, read replicas</td><td>They solve problems you don’t have yet</td><td>Measurements show a real bottleneck (chapters 5 and 6)</td></tr>
            <tr><td>Several regions</td><td>The users are in one place</td><td>Users are spread across the world, or you must survive a region going down (chapter 7)</td></tr>
          </tbody>
        </table>

        <h2>What a pilot does need</h2>
        <ol class="points">
          <li><strong>HTTPS</strong>, even for an internal tool.</li>
          <li><strong>Backups</strong> of the database, and one test that you can actually restore them.</li>
          <li><strong>Basic monitoring:</strong> is it up, how fast is it, is it running out of anything. Chapter 1’s tools cover this.</li>
          <li><strong>A way to see usage and collect feedback</strong>, covered on page 2.4.</li>
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
  chat/
    api.py
    service.py     <span class="c"># calls products.service to look things up</span>
    models.py
  users/
    api.py
    service.py
    models.py</span></pre>
          <ol class="points term-note">
            <li>Each folder is one feature, with the same three files.</li>
            <li><code>chat</code> asks <code>products.service</code> for what it needs and never reads the products tables directly. That one rule is what makes a later split possible.</li>
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
          <li>Here’s what that looks like on AWS, for users in Bangalore. Step through it to follow one request.</li>
        </ol>

        <div class="widget" data-widget="pilot-arch"></div>
        <p class="caption">AWS has no Bangalore region. Mumbai (ap-south-1) is the nearest region with every service; Hyderabad (ap-south-2) is closer but newer, with fewer services.</p>

        <h2>What’s in the picture</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>What it does</th><th>Worth knowing</th></tr></thead>
          <tbody>
            <tr><td>EC2 instance, t4g.nano</td><td>The virtual machine: 2 vCPUs (ARM, AWS Graviton), 512 MB of RAM, a 20 GB gp3 disk, Ubuntu</td><td>Burstable: it runs at full speed on CPU credits, with a baseline of 5% per vCPU. Fine for a pilot’s light, spiky traffic (page 1.4).</td></tr>
            <tr><td>Nginx</td><td>Accepts HTTPS on port 443, holds the TLS certificate (free from Let’s Encrypt), and forwards each request to the app</td><td>It also serves static files and shields the app from slow clients.</td></tr>
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
          <li>The next size up, t4g.small with 2 GB, costs only a little more each month and removes the worry. Memory is likely to be the first thing this server runs out of.</li>
        </ol>

        <h2>How much can it handle?</h2>
        <ol class="points">
          <li>Say each request needs about 10 ms of CPU. Two vCPUs at full speed could handle about 200 requests a second.</li>
          <li>But a t4g.nano’s baseline is 5% per vCPU. Sustained, that’s about 10 requests a second. CPU credits cover short bursts above that; steady load above it either runs out of credits or, in unlimited mode, costs extra.</li>
          <li>A pilot with 50 active users, each making a request every 10 seconds, needs at most 5 requests a second. That’s plenty of room.</li>
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
          <li><strong>Usage events.</strong> Record what people do: opened the product explorer, searched, asked the chat assistant a question, gave up halfway. A simple events table in PostgreSQL is enough to start.</li>
          <li><strong>The key numbers.</strong> Daily and weekly active users, how many come back, which features get used, and where people drop off.</li>
          <li><strong>Feedback.</strong> A feedback button in the app, plus talking to a few users every week. What they say explains what the numbers show.</li>
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
<span class="o wrap">10.0.1.5 [16/Oct/2026:10:41:07 +0530] "GET /api/products?q=adc HTTP/1.1" 200 5123 0.042
10.0.1.9 [16/Oct/2026:10:41:08 +0530] "POST /api/chat HTTP/1.1" 200 18234 1.873
10.0.1.5 [16/Oct/2026:10:41:09 +0530] "GET /api/products/AD7124 HTTP/1.1" 200 2211 0.018</span></pre>
          <ol class="points term-note">
            <li>Each line is one request: who asked, when, what, the status code (200 is success), the response size in bytes, and the time in seconds.</li>
            <li>Product pages take 18–42 ms. The chat request takes 1.9 seconds: it waits on a language model, so it’s I/O-bound (page 1.3).</li>
            <li>Collect these times and you can work out p50 and p95 for every endpoint (page 1.11).</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Decide what success looks like before the pilot starts.</strong> For example: 30 weekly active users
            after a month, and half of them coming back. Then the data can actually answer the question.</li>
            <li><strong>Watch p95, not just the average.</strong> The slow requests are the ones users remember (page 1.11).</li>
            <li><strong>Set a few alarms, not many.</strong> Server down, errors rising, disk over 80% full, available memory
            under 20%. Alarms that nobody acts on soon get ignored.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>If you can’t tell how people are using the pilot, it isn’t teaching you anything.</p>
        </aside>`
    },

    /* ====================================================== After the pilot */
    {
      group: 'After the pilot',
      slug: 'pilot-succeeds',
      title: 'When the pilot succeeds',
      sub: 'More users arrive, and the single server starts to crack.',
      html: `
        <ol class="points lede">
          <li>The pilot worked. A hundred people use it every week and ask for more, and word spreads to other teams.</li>
          <li>That’s the good news. The bad news: an architecture sized for 100 users won’t survive 1,000.</li>
          <li>Be ready to change it. The pilot’s architecture was right for the pilot; holding on to it now is the mistake.</li>
        </ol>

        <h2>What starts to go wrong</h2>
        <p>As usage grows, the problems arrive in roughly this order:</p>
        <ol class="steps">
          <li><strong>The busiest hour gets slow.</strong> p95 goes from 80 ms to 800 ms, while the average still looks fine (page 1.11).</li>
          <li><strong>The chat assistant times out</strong> now and then, because every worker is busy.</li>
          <li><strong>Nginx starts returning 502 and 504 errors:</strong> the app is too busy to answer it in time.</li>
          <li><strong>One night the product stops answering.</strong> In the morning, <code>dmesg</code> shows the OOM killer stopped PostgreSQL (page 1.6).</li>
        </ol>

        <h2>Diagnose it with chapter 1’s tools</h2>
        <figure class="term">
          <figcaption>On the struggling server, at the busiest hour</figcaption>
<pre><span class="p">$</span> uptime
<span class="o"> 19:12:44 up 41 days,  2 users,  load average: 5.81, 4.92, 3.40</span>
<span class="p">$</span> free -h
<span class="o">               total        used        free      shared  buff/cache   available
Mem:           459Mi       402Mi        11Mi       9.0Mi        46Mi        18Mi
Swap:          1.0Gi       612Mi       412Mi</span>
<span class="p">$</span> top -o %MEM                   <span class="c"># sorted by memory; some columns left out</span>
<span class="o">    PID USER      %CPU %MEM COMMAND
   1834 postgres  61.2 24.1 postgres: app explorer 127.0.0.1(48812) SELECT
   1207 app       48.7 19.8 gunicorn: worker [app.main:app]
   1208 app       44.1 19.5 gunicorn: worker [app.main:app]
    911 postgres  12.0  9.6 postgres: checkpointer
    642 www-data   6.3  2.1 nginx: worker process</span></pre>
          <ol class="points term-note">
            <li>Load 5.81 on 2 vCPUs: almost 3 threads ready for every core, and rising (page 1.3).</li>
            <li>Only 18 MB <code>available</code>, and 612 MB already swapped out to disk: the server has run out of memory (page 1.6).</li>
            <li><code>top</code> shows who is competing: PostgreSQL and both FastAPI workers want the same 2 vCPUs and the same 459 MB, and Nginx needs a share too.</li>
            <li>CloudWatch adds one more: <code>CPUCreditBalance</code> is at 0, so the burstable CPU has nothing left to burst with.</li>
          </ol>
        </figure>

        <h2>The real problem: everything shares one machine</h2>
        <ol class="points">
          <li>Nginx, FastAPI and PostgreSQL all run on the same EC2 instance, so they share the same 2 vCPUs, the same 512 MB of RAM and the same disk.</li>
          <li>At 1,000 users each part needs more: more FastAPI workers to serve more people at once, more database connections, and more RAM for PostgreSQL to cache its data. Together they need more than the server has:</li>
        </ol>
        <div class="over-wrap">
          <div class="budget over" role="img" aria-label="At 1,000 users the server needs about 670 MB: 150 MB for Ubuntu, 220 MB for PostgreSQL, 280 MB for four FastAPI workers and 20 MB for Nginx. It has 512 MB, so about 158 MB is swapped to disk.">
            <span class="b-os" style="flex-grow:150"><b>150 MB</b></span>
            <span class="b-db" style="flex-grow:220"><b>220 MB</b></span>
            <span class="b-app" style="flex-grow:280"><b>280 MB</b></span>
            <span class="b-ng" style="flex-grow:20"></span>
          </div>
          <span class="over-zone" style="left:76.4%"></span>
          <span class="over-mark" style="left:76.4%"><b>The server has 512 MB</b><span>158 MB too much: swapped to disk</span></span>
        </div>
        <div class="legend budget-legend"><span><i class="sw b-os"></i>Ubuntu and system services</span><span><i class="sw b-db"></i>PostgreSQL, more connections and cache</span><span><i class="sw b-app"></i>FastAPI, 4 workers</span><span><i class="sw b-ng"></i>Nginx</span></div>
        <ol class="points" start="3">
          <li>Worse, the parts make each other slower. A slow query keeps a FastAPI worker waiting. Waiting workers hold memory that PostgreSQL wanted for its cache. With less cache, PostgreSQL reads from disk, and its queries get slower still.</li>
          <li>And it’s still a single point of failure. When the OOM killer stops PostgreSQL, the whole product is down, for everyone.</li>
          <li>This is a time bomb. Nothing is wrong with the code, but every new user brings the explosion a little closer.</li>
        </ol>

        <h2>Two kinds of work, one machine</h2>
        <ol class="points">
          <li>A web API pilot like this one puts the two kinds of work from page 1.3 on the same server.</li>
          <li>From the server’s point of view, the <strong>app</strong> (FastAPI) is the part that burns CPU: parsing requests, running the business logic, building JSON responses.</li>
          <li>The <strong>database</strong> (PostgreSQL) is the part that needs memory and disk: plenty of RAM to cache its data, and fast reads and writes for everything else. It’s I/O-bound.</li>
          <li>On one machine you can’t tune for both. More app workers take memory away from the database’s cache, and a heavy query takes CPU away from the app. The more users, the harder they fight.</li>
        </ol>

        <h2>Two ways forward</h2>
        <table class="data">
          <thead><tr><th>Option</th><th>What you do</th><th>Good</th><th>Limits</th></tr></thead>
          <tbody>
            <tr><td>Scale up</td><td>Move to a bigger EC2 instance, with more vCPUs and RAM</td><td>Quick: no code change, done in minutes</td><td>It has a ceiling, the price roughly doubles with each size, resizing means a few minutes of downtime, and it’s still one machine doing everything</td></tr>
            <tr><td>Split out</td><td>Give the app and the database a server each</td><td>Each one is sized and tuned for its own kind of work, and grows on its own</td><td>One more server to run, and every query now crosses the network</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Scaling up buys time, and it’s often the right first move. But it has a ceiling, and the app and the database still fight over one machine.</li>
          <li>The longer-term step is to split them:</li>
        </ol>
        <div class="widget" data-widget="split-arch"></div>
        <ol class="points" start="3">
          <li><strong>The app server</strong> is tuned for CPU-bound work: a compute-optimised instance (AWS c family), sized by how many requests it has to serve.</li>
          <li><strong>The database server</strong> is tuned for I/O-bound work: a memory-optimised instance (AWS r family), so the working set fits in RAM, with a disk whose IOPS match the load (page 1.7). It can be your own EC2 instance, or Amazon RDS, a managed PostgreSQL that handles backups, updates and failover for you.</li>
          <li>Keep both in the same zone and the same private network, so a query crosses the network in well under a millisecond. Put the database in a private subnet that the internet can’t reach at all.</li>
          <li>The new cost is that network hop. A page that runs 30 queries now pays 30 round trips, so it pays to make fewer, better queries (page 1.8).</li>
        </ol>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>The pilot did its job. It proved people want the product, and it showed exactly what breaks first.</li>
          <li>Your 100 users are happy, and 1,000 more are coming. Chapter 3 takes the next steps one at a time: scale up, split the app and the database onto their own servers, then remove the single point of failure.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Measure before you change anything.</strong> Chapter 1’s tools turn “the app is slow” into “the server
            is out of memory and swapping”, and that tells you what to fix first.</li>
            <li><strong>Scale before it explodes.</strong> The alarms from page 2.4 (available memory, load, CPU credits) warn
            you weeks ahead. Plan the next step when they trend up, not when the server falls over.</li>
            <li><strong>Expect the architecture to change.</strong> Each stage of growth needs a different design. The one that
            was right for 100 users is now the bottleneck, and that’s normal.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>When one server runs everything, every part competes for the same CPU, memory and disk. Growth turns that competition into failure.</p>
        </aside>`
    }
  ]
};
