/* Chapter 3: Scale up, split out.
   Same conventions as chapters 1 and 2: one page per section, `group` for the
   sidebar, text written as numbered points. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[3] = {
  intro: `
    <ol class="points lede">
      <li>The pilot is a success, and 1,000 users are on their way.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why one server stops coping as users grow, and diagnose it with chapter 1’s tools.</li>
        <li>Move the database to its own server without losing data.</li>
        <li>Explain what changes when the app and the database talk over the network.</li>
        <li>Keep the cost of that network hop small, with fewer queries and connection pooling.</li>
        <li>Choose an instance family for an app server and for a database server, and say why.</li>
        <li>Size both servers for about 1,000 users from measurements.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'one-thousand-users',
      title: '1,000 users, and one server runs out of room',
      sub: 'More users arrive, and the single server starts to crack.',
      html: `
        <ol class="points lede">
          <li>The pilot worked. About a hundred shoppers order from Tomazon every week, many of them come back, and word spreads across the city.</li>
          <li>That’s the good news. The bad news: an architecture sized for 100 users won’t survive 1,000.</li>
          <li>Be ready to change it. The pilot’s architecture was right for the pilot; holding on to it now is the mistake.</li>
        </ol>

        <h2>What starts to go wrong</h2>
        <p>As usage grows, the problems arrive in roughly this order:</p>
        <ol class="steps">
          <li><strong>The busiest hour gets slow.</strong> p95 goes from 80 ms to 800 ms, while the average still looks fine (page 1.11).</li>
          <li><strong>Checkout times out</strong> now and then, because every worker is busy, and some shoppers give up with a full cart.</li>
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
   1834 postgres  61.2 24.1 postgres: app tomazon 127.0.0.1(48812) SELECT
   1207 app       48.7 19.8 gunicorn: worker [app.main:app]
   1208 app       44.1 19.5 gunicorn: worker [app.main:app]
    911 postgres  12.0  9.6 postgres: checkpointer
    642 www-data   6.3  2.1 nginx: worker process</span></pre>
          <ol class="points term-note">
            <li>Load 5.81 on 2 vCPUs: almost 3 threads ready for every core, and rising (page 1.3).</li>
            <li>Only 18 MB <code>available</code>, and 612 MB already swapped out to disk: the server has run out of memory (page 1.6).</li>
            <li><code>top</code> shows who is competing: PostgreSQL and both FastAPI workers want the same 2 vCPUs and the same 459 MB, and Nginx needs a share too.</li>
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
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Measure before you change anything.</strong> Chapter 1’s tools turn “the app is slow” into “the server
            is out of memory and swapping”, and that tells you what to fix first.</li>
            <li><strong>Scale before it explodes.</strong> The alarms from page 2.6 (available memory, load, CPU credits) warn
            you weeks ahead. Plan the next step when they trend up, not when the server falls over.</li>
            <li><strong>Expect the architecture to change.</strong> Each stage of growth needs a different design. The one that
            was right for 100 users is now the bottleneck, and that’s normal.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>When one server runs everything, every part competes for the same CPU, memory and disk. Growth turns that competition into failure.</p>
        </aside>`
    },

    /* =========================================================== Split out */
    {
      group: 'Split out',
      slug: 'database-server',
      title: 'Give the database its own server',
      sub: 'The first big step for a growing web app: the app and the database on separate machines.',
      html: `
        <ol class="points lede">
          <li>Page 3.1 found one overloaded server, where the app and the database fought over the same CPU, memory and disk.</li>
          <li>The fix most web apps reach for first: move the database to a server of its own. The app stays the same monolith; only where things run changes.</li>
        </ol>

        <p>Here’s the new architecture. Step through it to follow a request:</p>
        <div class="widget" data-widget="split-live"></div>

        <h2>What changes</h2>
        <ol class="points">
          <li><strong>Each part gets its own machine.</strong> The app server’s CPU and RAM go to FastAPI, and the database server’s RAM goes to PostgreSQL’s cache.</li>
          <li><strong>The database is off the internet.</strong> It lives in a private subnet with no public address, and its security group accepts port 5432 only from the app server’s security group.</li>
          <li><strong>Every query crosses the network.</strong> A round trip inside one zone takes about 0.2–0.5 ms, instead of microseconds over <code>localhost</code>. Page 3.3 shows what that adds up to, and how to keep it small.</li>
          <li><strong>Connections cost more.</strong> Opening a PostgreSQL connection now means a TCP handshake across the network, plus a new process on the database server. Page 3.3 covers keeping them open with pooling.</li>
          <li><strong>Each side can grow on its own:</strong> a bigger app server when CPU runs out, a bigger database server when memory or disk does. Page 3.4 picks the right kind of server for each.</li>
          <li><strong>The photos stay with the app, for now.</strong> They’re still on the app server’s disk, and Nginx still serves them.</li>
        </ol>

        <h2>Moving the database without losing data</h2>
        <ol class="steps">
          <li><strong>Create the database server</strong> in a private subnet, in the same zone as the app server: your own EC2 instance, or Amazon RDS.</li>
          <li><strong>Copy the data.</strong> For a pilot-sized database, <code>pg_dump</code> and <code>pg_restore</code> during a short maintenance window is enough. For a bigger one, PostgreSQL’s logical replication keeps the new server in sync until you switch.</li>
          <li><strong>Point the app at it.</strong> Change <code>DATABASE_URL</code> to the new server’s private address, and restart the app.</li>
          <li><strong>Watch it.</strong> Response times, errors, and the new server’s CPU, memory and disk, with chapter 1’s tools.</li>
          <li><strong>Keep the old copy</strong> for a few days, read-only, in case you need to roll back.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it: copying the database during a maintenance window</figcaption>
<pre><span class="p">$</span> pg_dump -Fc -d tomazon -f tomazon.dump                          <span class="c"># on the old server: a compressed copy</span>
<span class="p">$</span> pg_restore -j 2 -h 10.0.2.14 -U app -d tomazon tomazon.dump     <span class="c"># load it into the new database server</span>
<span class="p">$</span> psql -h 10.0.2.14 -U app -d tomazon -c "select count(*) from products;"
<span class="o"> count
-------
 10482
(1 row)</span></pre>
          <ol class="points term-note">
            <li><code>-Fc</code> writes PostgreSQL’s compressed custom format, which <code>pg_restore</code> can load with several jobs in parallel (<code>-j 2</code>).</li>
            <li><code>10.0.2.14</code> is the new server’s private address: only machines inside the VPC can reach it.</li>
            <li>Counting the rows of the big tables on both servers is a quick check that the copy is complete.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Split by resource first, by feature later.</strong> This split gives each kind of work its own
            machine. The code is still one monolith (page 2.4).</li>
            <li><strong>The database is now your most important server.</strong> It holds the only copy of the data, so
            backups, monitoring and alarms matter most here.</li>
            <li><strong>Same zone, private network.</strong> Keep the hop short and the database unreachable from outside.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>For a growing web app, moving the database to its own server is usually the first, cheapest big win.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Split out',
      slug: 'round-trips',
      title: 'The new cost: network round trips',
      sub: 'Queries that were free over localhost now cross the network. Make fewer of them, and keep connections open.',
      html: `
        <ol class="points lede">
          <li>On one server, the app talked to PostgreSQL over <code>localhost</code>. A round trip took a few hundredths of a millisecond, so 10 or 20 queries per API call were practically free.</li>
          <li>Now every query crosses the network. Inside one zone that’s about 0.2–0.5 ms per round trip, on top of the query’s own work.</li>
          <li>Twenty small queries per request now add about 10–20 ms that every user waits for, and more if the database sits in another zone. Try it:</li>
        </ol>
        <div class="widget" data-widget="query-latency"></div>

        <h2>Make fewer queries</h2>
        <ol class="points">
          <li><strong>Watch out for N+1 queries.</strong> Code that loads a list, then runs one more query for each item, makes 21 round trips for 20 items. ORMs do this quietly through lazy loading.</li>
          <li><strong>Fetch related data together.</strong> A JOIN, an <code>IN (…)</code> list, or the ORM’s eager loading gets everything in one or two round trips.</li>
          <li><strong>Let the database do the work.</strong> Counting, summing and filtering in SQL returns one small answer, instead of thousands of rows for Python to go through.</li>
          <li><strong>Write in batches.</strong> Insert or update many rows in one statement or one transaction, not one round trip per row.</li>
        </ol>
        <figure class="term">
          <figcaption>N+1 queries in SQLAlchemy, and the fix</figcaption>
<pre><span class="c"># N+1: one query for the products, then one more for each product’s reviews</span>
<span class="o">products = session.scalars(select(Product).where(Product.category == "headphones").limit(20)).all()
for p in products:
    print(p.name, len(p.reviews))           </span><span class="c"># lazy load: a new query every time round</span>

<span class="c"># 2 queries in total, however many products there are</span>
<span class="o">products = session.scalars(
    select(Product).where(Product.category == "headphones").limit(20)
    .options(selectinload(Product.reviews))
).all()</span></pre>
          <ol class="points term-note">
            <li>The first version makes 21 round trips: 1 for the list, 20 for the reviews.</li>
            <li><code>selectinload</code> fetches every product’s reviews in one extra query, using <code>IN (…)</code>. Same data, 2 round trips.</li>
          </ol>
        </figure>

        <h2>Structure queries well</h2>
        <ol class="points">
          <li><strong>Select only the columns you need,</strong> so less data crosses the network.</li>
          <li><strong>Make sure each query uses an index,</strong> so the database’s own work stays small. Chapter 5 goes deeper.</li>
          <li><strong>Run independent queries at the same time.</strong> With an async driver, <code>asyncio.gather</code> sends two queries at once on two pooled connections, and you wait for the slower one instead of both in turn.</li>
        </ol>

        <h2>Keep connections open: pooling</h2>
        <ol class="points">
          <li>Opening a new PostgreSQL connection is expensive: a TCP handshake across the network, authentication, and a new process on the database server (page 1.2). That’s a few milliseconds before the first query even starts.</li>
          <li><strong>A pool in the app</strong> keeps a few connections open and lends one to each request. SQLAlchemy does this by default; size it with <code>pool_size</code>.</li>
          <li><strong>PgBouncer</strong> sits in front of PostgreSQL and shares a small number of real database connections between many app processes. In transaction mode, 400 app connections can share 20 database connections, keeping PostgreSQL near its sweet spot (page 1.2).</li>
        </ol>
        <figure class="term">
          <figcaption>A minimal pgbouncer.ini, running on the app server</figcaption>
<pre><span class="o">[databases]
tomazon = host=10.0.2.14 port=5432 dbname=tomazon

[pgbouncer]
listen_port = 6432
pool_mode = transaction
max_client_conn = 400        </span><span class="c">; connections the app may open</span><span class="o">
default_pool_size = 20       </span><span class="c">; real connections to PostgreSQL</span></pre>
          <ol class="points term-note">
            <li>The app now connects to <code>localhost:6432</code> instead of the database server directly.</li>
            <li>PgBouncer keeps 20 connections to the database at <code>10.0.2.14</code> open, and hands them out one transaction at a time.</li>
          </ol>
        </figure>

        <p>Here’s where the pools sit in the architecture. Step through it to follow one query:</p>
        <div class="widget" data-widget="pool-arch"></div>

        <h2>Measure it</h2>
        <ol class="points">
          <li><strong>Count the queries per request.</strong> Log them in development (SQLAlchemy’s <code>echo=True</code>), and treat any endpoint that runs dozens as a bug.</li>
          <li><strong>Turn on <code>pg_stat_statements</code></strong> on the database. It shows which queries run most often and take the most total time, which is where to start.</li>
        </ol>
        <figure class="term">
          <figcaption>Try it on the database server</figcaption>
<pre><span class="p">$</span> sudo -u postgres psql -c "ALTER SYSTEM SET shared_preload_libraries = 'pg_stat_statements';"
<span class="o">ALTER SYSTEM</span>
<span class="p">$</span> sudo systemctl restart postgresql             <span class="c"># the library only loads at startup</span>
<span class="p">$</span> sudo -u postgres psql -d tomazon -c "CREATE EXTENSION pg_stat_statements;"
<span class="o">CREATE EXTENSION</span>
<span class="p">$</span> psql -d tomazon                               <span class="c"># a day later</span>
<span class="o">tomazon=> SELECT calls, round(mean_exec_time::numeric, 2) AS mean_ms,
                  round(total_exec_time) AS total_ms, left(query, 50) AS query
             FROM pg_stat_statements ORDER BY calls DESC LIMIT 5;

  calls  | mean_ms | total_ms |                       query
---------+---------+----------+----------------------------------------------------
 2400360 |    0.05 |   120018 | SELECT * FROM reviews WHERE product_id = $1
 1003127 |    0.03 |    30094 | SELECT * FROM sessions WHERE token = $1
 1001894 |    0.04 |    40076 | SELECT * FROM users WHERE id = $1
  200413 |    0.06 |    12025 | SELECT * FROM products WHERE id = $1
  120018 |    0.82 |    98415 | SELECT id, name, price FROM products WHERE categor</span></pre>
          <ol class="points term-note">
            <li>Turning it on takes three steps: load the library, restart PostgreSQL, and create the extension in the database. On Amazon RDS the library is already loaded, so only the last step is needed.</li>
            <li>It groups queries by shape, with each value replaced by <code>$1</code>, and counts how many times each one ran (<code>calls</code>) and how long it spent inside the database (<code>mean_ms</code>, <code>total_ms</code>).</li>
            <li>The reviews lookup ran 2.4 million times: exactly 20 times as often as the category listing. That’s the N+1 from above, one extra query for each product on every 20-product page.</li>
            <li>Each one takes just 0.05 ms in the database, so it looks harmless. But these times don’t include the network. Each call is also a round trip of 0.2–0.5 ms, so a category page spends about 1 ms on its reviews in the database, and 4–10 ms crossing the network.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Every split adds a network hop.</strong> Moving parts apart trades local speed for room to grow, so
            design each request to cross the network as rarely as possible.</li>
            <li><strong>Count round trips, not just query time.</strong> Fifty fast queries can be slower than two heavier ones.</li>
            <li><strong>Pool at every hop.</strong> Keep-alive from browsers to Nginx, and a pool plus PgBouncer from the app to
            the database.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Cross the network as few times as possible per request: fewer queries, batched work, and connections that stay open.</p>
        </aside>`
    },
    /* ------------------------------------------------------------------ */
    {
      group: 'Split out',
      slug: 'right-instance',
      title: 'The right instance for each job',
      sub: 'Match each server’s strongest resource to the work it does.',
      html: `
        <ol class="points lede">
          <li>Once they’re split, the app server and the database server need different things. Cloud instance families exist for exactly this.</li>
          <li>They differ mainly in how much memory, and how fast a disk, you get per vCPU. Page 1.4 showed how to read the names.</li>
        </ol>

        <table class="data">
          <thead><tr><th>Family (AWS)</th><th>Built for</th><th class="num">RAM per vCPU</th><th>Use it for</th></tr></thead>
          <tbody>
            <tr><td>Compute-optimised: c, such as c7g</td><td>CPU-heavy work</td><td class="num">2 GB</td><td>App servers and API workers</td></tr>
            <tr><td>General purpose: m, such as m7g</td><td>A balance of CPU and memory</td><td class="num">4 GB</td><td>Small all-in-one servers, mixed work</td></tr>
            <tr><td>Memory-optimised: r, such as r7g</td><td>Big working sets in RAM</td><td class="num">8 GB</td><td>Databases and caches</td></tr>
            <tr><td>Storage-optimised: i, such as i4g and i4i</td><td>Fast local NVMe disks inside the server</td><td class="num">8 GB</td><td>Databases whose disk is the bottleneck, that can survive losing it</td></tr>
            <tr><td>Extra memory: x, such as x2gd</td><td>Very large amounts of memory</td><td class="num">16 GB</td><td>Huge in-memory databases</td></tr>
          </tbody>
        </table>

        <h2>The app server: tuned for CPU</h2>
        <ol class="points">
          <li>From the server’s point of view, the app is the part that burns CPU (page 3.1), so start compute-optimised: a c7g.large has 2 vCPUs and 4 GB.</li>
          <li>Run one FastAPI worker per vCPU with <code>async</code> endpoints, and watch CPU at the busiest hour.</li>
          <li>When CPU runs short, move up a size: a c7g.xlarge has 4 vCPUs.</li>
          <li>Keep optimising the code too, starting with the slowest endpoints. Cutting 10 ms of CPU from every request can be worth a whole server.</li>
        </ol>

        <h2>The database server: tuned for memory and disk</h2>
        <ol class="points">
          <li>The database is I/O-bound. It wants its working set in RAM (page 1.6) and a fast disk for everything else (page 1.7), so it wants a lot of RAM per vCPU.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Option</th><th>Disk</th><th>Good at</th><th>Watch out for</th></tr></thead>
          <tbody>
            <tr><td>Memory-optimised with EBS: r7g with gp3 or io2</td><td>A network-attached EBS volume</td><td>8 GB of RAM per vCPU. The disk survives the server, and snapshots give you backups.</td><td>EBS limits on IOPS and throughput, and about 1 ms per read (page 1.7)</td></tr>
            <tr><td>Storage-optimised: i4g or i4i</td><td>Local NVMe SSDs inside the server</td><td>8 GB of RAM per vCPU, tens of thousands of IOPS even on the smallest size, and about 0.1 ms per read</td><td><strong>The disk is lost if the instance stops or fails.</strong> Use it only with a replica on another server and continuous backups to S3.</td></tr>
            <tr><td>Amazon RDS, such as db.r7g</td><td>EBS, managed by AWS</td><td>Backups, updates and failover done for you</td><td>Costs more than running it yourself, with less control</td></tr>
          </tbody>
        </table>
        <ol class="points" start="2">
          <li>For most teams at this stage, memory-optimised with EBS, or RDS, is the safer start. Move to local NVMe once you’ve measured that the EBS volume is the limit, and replication is in place.</li>
        </ol>

        <h2>Worked example: sizing for 1,000 users</h2>
        <ol class="steps">
          <li><strong>Measure the pilot.</strong> At the busiest hour it serves about 50 requests a second, each using about 20 ms of CPU.</li>
          <li><strong>App server.</strong> 50 × 20 ms = 1 core busy. A c7g.large, with 2 vCPUs, runs at about 50%, leaving headroom for spikes (page 1.13).</li>
          <li><strong>Database memory.</strong> The hot tables and indexes come to about 6 GB. An r7g.large, with 16 GB, holds all of it in RAM, with room to grow.</li>
          <li><strong>Database disk.</strong> <code>iostat</code> shows about 1,500 IOPS at the busiest hour. The default gp3 volume, with 3,000 IOPS, is enough; buy more when it isn’t (page 1.7).</li>
          <li><strong>Result:</strong> a c7g.large for the app, and an r7g.large with gp3 for the database. Measure again after the move, because the bottleneck will be somewhere new.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Pick the family by what runs out.</strong> The app runs out of CPU, so c. The database runs out of
            memory and disk, so r, or i when the disk is the limit.</li>
            <li><strong>Graviton (the g in c7g and r7g) is usually the cheapest per unit of work,</strong> as long as
            everything you run has an ARM64 build (page 1.4).</li>
            <li><strong>The bottleneck moves.</strong> Every change shifts it somewhere else, so measure again after each step.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Give each server the resource its work needs most: CPU for the app, memory and a fast disk for the database.</p>
        </aside>`
    }
  ]
};
