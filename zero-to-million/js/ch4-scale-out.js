/* Chapter 4: Scale out.
   Same conventions as the earlier chapters: one page per section, `group` for
   the sidebar, text written as numbered points. This chapter follows one
   growth story from 1,000 to 10,000 users. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[4] = {
  intro: `
    <ol class="points lede">
      <li>V1 is a success, and marketing brings in 10,000 users. This time the database copes, but the app server’s CPU is full.</li>
      <li>This chapter covers the step every growing web app takes next: from one app server to several, with a load balancer in front.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Find which tier is the bottleneck, using chapter 1’s tools.</li>
        <li>Explain the trade-offs between scaling up and scaling out, including cost.</li>
        <li>Choose a load balancing algorithm for your traffic, and set it up in Nginx.</li>
        <li>Say what an app needs before it can run on several servers.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'ten-thousand-users',
      title: '10,000 users, and the app slows down',
      sub: 'Growth brings the next bottleneck. Find which tier is full before changing anything.',
      html: `
        <ol class="points lede">
          <li>V1 is a success. A thousand people use it every week, and the feedback is good.</li>
          <li>Then marketing gets involved: an announcement, a demo at the all-hands, a newsletter. Within a month there are 10,000 users.</li>
          <li>And the app slows down again.</li>
        </ol>

        <h2>What users notice</h2>
        <ol class="steps">
          <li><strong>The busiest hour is slow.</strong> Pages that took 100 ms now take 1–2 seconds between 10 and 12 in the morning.</li>
          <li><strong>Some requests fail</strong> with 504 Gateway Timeout from Nginx.</li>
          <li><strong>Quiet hours are fine.</strong> The problem only appears when everyone is using it at once.</li>
        </ol>

        <h2>First, check the database</h2>
        <figure class="term">
          <figcaption>On the database server, at the busiest hour</figcaption>
<pre><span class="p">$</span> uptime
<span class="o"> 11:04:51 up 63 days,  1 user,  load average: 0.84, 0.91, 0.88</span>
<span class="p">$</span> free -h
<span class="o">               total        used        free      shared  buff/cache   available
Mem:            15Gi       4.2Gi       1.1Gi       2.1Gi        10Gi        11Gi
Swap:             0B          0B          0B</span>
<span class="p">$</span> iostat -xz 1
<span class="o">Device      r/s     w/s    rkB/s    wkB/s  r_await  w_await  aqu-sz  %util
nvme1n1    42.0   180.0    336.0   2880.0     0.61     0.92    0.2    6.1</span></pre>
          <ol class="points term-note">
            <li>Load 0.84 on 2 vCPUs: plenty of CPU to spare.</li>
            <li>11 GB <code>available</code> and no swap: the working set fits in RAM with room to grow.</li>
            <li>About 220 operations a second, reads in 0.6 ms, the disk busy 6% of the time: the disk is fine too.</li>
            <li>The database isn’t the problem.</li>
          </ol>
        </figure>

        <h2>Then the app server</h2>
        <figure class="term">
          <figcaption>On the app server, at the same moment</figcaption>
<pre><span class="p">$</span> nproc
<span class="o">2</span>
<span class="p">$</span> uptime
<span class="o"> 11:05:12 up 63 days,  1 user,  load average: 7.92, 7.40, 6.15</span>
<span class="p">$</span> top
<span class="o">%Cpu(s): 96.4 us,  2.9 sy,  0.0 ni,  0.5 id,  0.0 wa,  0.0 hi,  0.2 si,  0.0 st</span></pre>
          <ol class="points term-note">
            <li>A load of 7.92 on 2 vCPUs: about 4 threads for every core, and rising through the morning.</li>
            <li>96% <code>us</code> and no <code>wa</code>: the CPU is busy running our own code, not waiting for anything.</li>
            <li>This is Server 1 from page 1.3: the app server is CPU-bound, and full.</li>
          </ol>
        </figure>

        <h2>Bigger server, or more servers?</h2>
        <ol class="points">
          <li>The fix is more CPU for the app. There are two ways to get it: a bigger app server (<strong>scaling up</strong>, or vertical scaling) or more app servers (<strong>scaling out</strong>, or horizontal scaling).</li>
          <li>The next page compares them.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Check every tier before fixing one.</strong> Five minutes on the database server ruled it out, and saved
            a week spent tuning the wrong thing.</li>
            <li><strong>The bottleneck moves.</strong> Chapter 3 gave the database room, so this time the app ran out first.</li>
            <li><strong>Look at the busiest hour.</strong> Averages over a whole day hide the peak, and the peak is what users feel.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Find the tier that’s full before you add anything. Here it’s the app server, not the database.</p>
        </aside>`
    },

    /* =========================================================== Scale out */
    {
      group: 'Scale out',
      slug: 'up-or-out',
      title: 'Scale up or scale out?',
      sub: 'A bigger server, or more of them: what each one costs you, and what it buys.',
      html: `
        <ol class="points lede">
          <li><strong>Scaling up</strong> (vertical) means replacing a server with a bigger one. <strong>Scaling out</strong> (horizontal) means adding more servers of the same size, and spreading the requests between them.</li>
          <li>Both add CPU. They differ in how far they can go, what they cost, and what happens when something breaks.</li>
        </ol>

        <table class="data">
          <thead><tr><th></th><th>Scale up (vertical)</th><th>Scale out (horizontal)</th></tr></thead>
          <tbody>
            <tr><td>How</td><td>A bigger instance: c7g.large becomes c7g.4xlarge</td><td>More instances, with a load balancer in front</td></tr>
            <tr><td>Code changes</td><td>None</td><td>The app must not keep anything important in one server’s memory (page 4.4)</td></tr>
            <tr><td>How far it goes</td><td>Up to the biggest instance in the family, then it stops</td><td>Keep adding servers</td></tr>
            <tr><td>If a server fails</td><td>Everything is down</td><td>The others keep serving</td></tr>
            <tr><td>Deploying a new version</td><td>A restart, so a short outage</td><td>One server at a time, with no outage</td></tr>
            <tr><td>Adding capacity</td><td>In doubling steps, with a few minutes of downtime to resize</td><td>One server at a time, with no downtime</td></tr>
            <tr><td>Paying for capacity</td><td>Sized for the busiest hour, all day, every day</td><td>Add servers for busy hours, remove them when it’s quiet</td></tr>
            <tr><td>New moving parts</td><td>None</td><td>A load balancer, health checks, and more servers to look after</td></tr>
          </tbody>
        </table>

        <h2>What about cost?</h2>
        <ol class="points">
          <li>In the cloud, the price per vCPU stays about the same as an instance gets bigger within one family: a c7g.4xlarge costs 8 times as much as a c7g.large, and has 8 times the vCPUs.</li>
          <li>So scaling out isn’t cheaper because small servers are cheaper. It’s cheaper because you pay for what you actually need: add one server when traffic grows a little, and remove servers at night and at weekends, instead of paying for the busiest hour all day.</li>
          <li>Shopping has a daily rhythm: busy evenings, quiet nights. Running fewer servers in the quiet hours alone can cut the app servers’ bill by a third or more.</li>
          <li>Scaling up also runs out. Each step doubles the bill in one go, and past the biggest instance there’s no next size at any price.</li>
        </ol>

        <h2>What we chose, and why</h2>
        <ol class="steps">
          <li><strong>The need.</strong> About 500 requests a second at the busiest hour × 20 ms of CPU each = 10 cores busy. To peak at around 70% (page 1.11), that’s about 14 vCPUs.</li>
          <li><strong>Scaling up</strong> would mean one c7g.4xlarge, with 16 vCPUs. Simple, but every deploy and every failure still takes the whole product down.</li>
          <li><strong>Scaling out</strong> means two c7g.2xlarge, with 8 vCPUs each, behind a load balancer. The same total capacity at about the same price, and no single app server whose failure stops everything.</li>
          <li><strong>One catch.</strong> If one of the two fails, the other has 8 vCPUs for 10 cores of work, and slows down. Either size each server to carry the busiest hour alone, or run three. Plan for one server to be missing: this is called <strong>N+1</strong>.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Scale up first while it’s cheap and simple.</strong> Scale out when you need the product to survive a
            server failure, or the next size up is a big jump.</li>
            <li><strong>Plan for N+1.</strong> Capacity that only works when every server is healthy isn’t really capacity.</li>
            <li><strong>Scaling out only works if any server can handle any request.</strong> Page 4.4 covers what that means for the app.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Scale up for simplicity; scale out for resilience and flexibility. Most web apps end up scaling out their app servers.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Scale out',
      slug: 'load-balancing',
      title: 'Load balancing',
      sub: 'Something has to decide which server gets each request. The way it decides matters.',
      html: `
        <ol class="points lede">
          <li>A <strong>load balancer</strong> sits in front of the app servers and decides which one gets each request.</li>
          <li>You already run one: Nginx. Its <code>upstream</code> block can spread requests across several servers, and it moves to a small server of its own, in front of the app servers.</li>
        </ol>

        <h2>Ways to choose a server</h2>
        <table class="data">
          <thead><tr><th>Algorithm</th><th>How it picks</th><th>Good when</th><th>Weak when</th></tr></thead>
          <tbody>
            <tr><td>Round robin (Nginx’s default)</td><td>Each server in turn</td><td>Requests all take about the same time</td><td>Some requests take far longer than others</td></tr>
            <tr><td>Weighted round robin</td><td>In turn, but bigger servers get a bigger share</td><td>Servers of different sizes</td><td>The same weakness as round robin</td></tr>
            <tr><td>Least connections (<code>least_conn</code>)</td><td>The server with the fewest requests in progress right now</td><td>Request times vary a lot</td><td>Rarely; it’s a good default for web apps</td></tr>
            <tr><td>Two random choices (<code>random two least_conn</code>)</td><td>Picks two servers at random and sends to the less busy one</td><td>Many servers, or several load balancers sharing them</td><td>With just two servers it’s the same as least connections</td></tr>
            <tr><td>IP hash (<code>ip_hash</code>)</td><td>The same client IP always goes to the same server</td><td>The app keeps sessions in one server’s memory</td><td>Many users share one IP, such as a whole office behind one address: they all land on one server</td></tr>
          </tbody>
        </table>

        <h2>Round robin vs least connections</h2>
        <ol class="points">
          <li>This app mixes fast requests (product pages, about 100 ms) with slow ones (checkout, about 2 seconds, because it waits for the payment gateway).</li>
          <li><strong>Round robin</strong> sends every other request to each server, even when one server’s workers are all busy with checkouts. Fast requests then queue behind slow ones.</li>
          <li><strong>Least connections</strong> sends each request to the server with fewer in progress, so a fast request goes wherever a worker is free. Switch between them:</li>
        </ol>
        <div class="widget" data-widget="lb-sim"></div>

        <h2>The Nginx configuration</h2>
        <figure class="term">
          <figcaption>/etc/nginx/conf.d/app.conf on the load balancer</figcaption>
<pre><span class="o">upstream app {
    least_conn;
    server 10.0.1.21:8000 max_fails=3 fail_timeout=10s;
    server 10.0.1.22:8000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    listen 443 ssl;
    server_name tomazon.com;

    location / {
        proxy_pass http://app;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_next_upstream error timeout;
    }
}</span></pre>
          <ol class="points term-note">
            <li><code>least_conn</code> sends each request to the app server with the fewest requests in progress.</li>
            <li><code>max_fails=3 fail_timeout=10s</code>: after 3 failed attempts within 10 seconds, Nginx stops sending that server traffic for 10 seconds. This is a passive health check.</li>
            <li><code>proxy_next_upstream</code>: if a server fails or times out, Nginx retries the request on the other one. It doesn’t retry POSTs by default, because repeating one could, say, place an order twice.</li>
            <li><code>keepalive 32</code>, with HTTP/1.1 and an empty <code>Connection</code> header, keeps connections to the app servers open instead of opening one per request (page 3.2).</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Use least connections when request times vary,</strong> which for most web apps they do. Round robin is
            fine when every request costs about the same.</li>
            <li><strong>Avoid sticky sessions if you can.</strong> Tying users to one server makes the load uneven, and breaks
            their sessions when that server goes away.</li>
            <li><strong>Health checks are part of load balancing.</strong> Spreading requests is only half the job; the other
            half is not sending them to a server that’s broken.</li>
            <li><strong>The managed alternative</strong> is an AWS Application Load Balancer: round robin or least outstanding
            requests, active health checks, and it runs across several zones for you.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Send each request to the server that’s least busy right now, and stop sending to servers that keep failing.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Scale out',
      slug: 'architecture-10k',
      title: 'The architecture for 10,000 users',
      sub: 'A load balancer in front, two app servers behind it, one database.',
      html: `
        <ol class="points lede">
          <li>Nginx moves to a small server of its own at the front, and the app runs on two app servers behind it.</li>
          <li>The database stays on one server: at 10,000 users it still has room. One thing moves onto it: PgBouncer. Step through a request:</li>
        </ol>
        <div class="widget" data-widget="scaleout-live"></div>

        <h2>What scaling out needs</h2>
        <ol class="points">
          <li><strong>Stateless app servers.</strong> Any server must be able to handle any request, so nothing a user needs can live in one server’s memory or disk. Sessions go in the database or Redis, or in a signed cookie; uploaded files go to S3.</li>
          <li><strong>Health checks.</strong> Open-source Nginx only notices a broken server when real requests to it fail. For active checks that call a <code>/health</code> endpoint every few seconds, use an AWS load balancer or Nginx Plus.</li>
          <li><strong>Rolling deploys.</strong> Take one app server out of the <code>upstream</code>, deploy to it, put it back, then do the next. Users never see an outage.</li>
          <li><strong>Logs and metrics in one place.</strong> Logging in to a server to read its logs no longer works when there are two. Send them all to one place, such as CloudWatch Logs.</li>
          <li><strong>Database connections add up.</strong> Two app servers × 8 workers × a pool of 10 = 160 connections from the app. One PgBouncer in front of the database turns them into 20 (below).</li>
        </ol>

        <h2>Move PgBouncer next to the database</h2>
        <ol class="points">
          <li>In chapter 3, PgBouncer ran on the app server, and PostgreSQL saw its 20 connections (page 3.2).</li>
          <li>Scaling out copies the app server, and its PgBouncer with it. Each copy opens its own 20 connections: two app servers mean 40, and ten would mean 200. Every one of them is a PostgreSQL process with its own memory (page 1.2).</li>
          <li>So PgBouncer moves onto the database server. Every app server connects to it on port 6432, and PostgreSQL sees one pool of 20, however many app servers there are.</li>
          <li>Each query still crosses the network once. Before, it crossed after PgBouncer; now it crosses before it.</li>
        </ol>
        <table class="data">
          <thead><tr><th>What changes</th><th>Before (page 3.2)</th><th>Now</th></tr></thead>
          <tbody>
            <tr><td>Where PgBouncer runs</td><td>On the app server</td><td>On the database server</td></tr>
            <tr><td>The app connects to</td><td><code>localhost:6432</code></td><td><code>10.0.2.14:6432</code></td></tr>
            <tr><td>PgBouncer reaches PostgreSQL at</td><td><code>10.0.2.14:5432</code>, over the network</td><td><code>127.0.0.1:5432</code>, on the same server</td></tr>
            <tr><td>The database’s security group lets in</td><td>Port 5432, from the app server</td><td>Port 6432 only, from the app servers</td></tr>
            <tr><td>Connections PostgreSQL sees</td><td>20 for each app server</td><td>20 in total</td></tr>
          </tbody>
        </table>
        <ol class="points" start="5">
          <li><strong>The trade-off:</strong> one PgBouncer now serves every app server, so if it stops, the whole app loses the database. Because it runs on the database server, that’s the same failure as losing the database itself. Chapter 5’s replicas will need a pooler address that can follow the primary when it moves. On Amazon RDS, RDS Proxy does this job as a managed service.</li>
        </ol>

        <h2>The new weak spots</h2>
        <ol class="points">
          <li><strong>The load balancer is now a single point of failure.</strong> If its server stops, nothing gets through. The usual fixes are an AWS Application Load Balancer, which runs across zones for you, or two Nginx servers sharing an Elastic IP that moves to the healthy one.</li>
          <li><strong>Everything is still in one zone.</strong> If that zone has an outage, all of it goes down. Spreading the app servers across two zones is the next step.</li>
          <li><strong>The database is still one server.</strong> It was fine at 10,000 users, but it’s the next thing to watch. Read replicas come in chapter 5, and caching in chapter 6.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Make the app stateless before you scale out.</strong> It’s the one thing horizontal scaling can’t work without.</li>
            <li><strong>Check each tier for one missing server.</strong> The app tier survives losing a server now (with N+1).
            The load balancer and the database don’t yet.</li>
            <li><strong>Scaling out multiplies everything:</strong> servers, logs, deploys and connections. Automate the
            setup so a new server is one command away (page 2.5).</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Scale out the stateless parts first, and keep the state in the database, the cache and object storage.</p>
        </aside>`
    }
  ]
};
