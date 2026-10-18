/* Chapter 14: Count the cost. The last chapter.
   Same conventions as the earlier chapters. The AWS bill outgrows the business: measure it, tune
   it, move only the steady part, and finish the workshop with what it all comes down to. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[14] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 25 million users. Every design from chapters 2 to 13 is working. Then the month’s AWS bill arrives: $180,000.</li>
      <li>In six months the bill has grown 70%, while orders grew 30%. Each order costs more to serve than it did before.</li>
      <li>This last chapter finds where the money goes, cuts what’s wasted, weighs the cloud against running your own servers, and ends with what the whole journey comes down to.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Break a cloud bill down, and track the cost of each order like any other metric.</li>
        <li>Cut a bill without moving anywhere: right-sizing, commitments, Spot and data transfer.</li>
        <li>Weigh the cloud against your own servers, people included.</li>
        <li>Plan a move between providers without stopping.</li>
        <li>Say what the whole workshop comes down to.</li>
      </ul>
    </div>`,

  sections: [

    /* ============================================================= The cost */
    {
      group: 'The next bottleneck',
      slug: 'the-bill',
      title: 'The bill that outgrew the business',
      sub: 'Before cutting anything, find out where every dollar goes.',
      html: `
        <ol class="points lede">
          <li>A cloud bill grows quietly. Every chapter added something that runs all the time: replicas, caches, brokers, regions, standbys.</li>
          <li>Each was the right call when it was made. Nobody was watching what they cost together.</li>
        </ol>

        <h2>Where $180,000 a month goes</h2>
        <table class="data">
          <thead><tr><th>Line</th><th>A month</th><th>What’s in it</th></tr></thead>
          <tbody>
            <tr><td>Compute</td><td>$68,000</td><td>EKS nodes in four regions, all at on-demand prices</td></tr>
            <tr><td>Databases</td><td>$46,000</td><td>Shard primaries, replicas and cross-region standbys, on EC2 with fast disks</td></tr>
            <tr><td>Data transfer</td><td>$24,000</td><td>Between zones and regions, and through NAT gateways</td></tr>
            <tr><td>Kafka</td><td>$16,000</td><td>MSK, MSK Connect and MSK Replicator</td></tr>
            <tr><td>Everything else</td><td>$20,000</td><td>Redis, OpenSearch, load balancers, EKS control planes, snapshots</td></tr>
            <tr><td>CloudFront and S3</td><td>$6,000</td><td>Photos, pages and the API at the edge</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>The surprise is data transfer.</strong> Moving bytes between zones, between regions and through NAT gateways costs more than all of Kafka. Nobody chose it; it came with the design.</li>
          <li><strong>The cost per 1,000 orders</strong> rose from $3.80 to $5.00 in six months. That one number says the bill is growing faster than the business.</li>
        </ol>

        <h2>Make cost something you can see</h2>
        <ol class="points">
          <li><strong>Tag everything.</strong> Every resource gets a team and a service tag, so the bill can be split by who runs what.</li>
          <li><strong>Put the detailed bill in the warehouse.</strong> AWS’s Cost and Usage Report lists every charge, hour by hour. Loaded next to the order data, it gives the cost per order, per service and per region.</li>
          <li><strong>Show cost beside latency.</strong> The cost per 1,000 orders goes on the same dashboard as p95 and errors, with an alert when it rises for two weeks in a row.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Cost is a design property,</strong> like latency and availability. Every component has a running price, and
            designs should be compared on it.</li>
            <li><strong>Track unit cost, not the total.</strong> A bill that grows with the business is success; a cost per order
            that grows is a problem.</li>
            <li><strong>Watch the bytes that move.</strong> Data crossing zones, regions and gateways is the cost most designs forget.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>If you can’t say what each service and each order costs, you can’t say what to cut.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'The cost',
      slug: 'cloud-or-own',
      title: 'Tune first, then decide where to run',
      sub: 'Most of the waste goes without moving anywhere. Only then does cloud against your own servers make sense.',
      html: `
        <ol class="points lede">
          <li>The tempting answer to a big bill is to leave the cloud. The cheaper first answer is to stop paying for what isn’t used.</li>
        </ol>

        <h2>Tune before you move</h2>
        <table class="data">
          <thead><tr><th>Lever</th><th>What Tomazon did</th><th>Saved a month</th></tr></thead>
          <tbody>
            <tr><td>Right-size</td><td>Pod requests matched to measured use (page 10.4), so Karpenter packs nodes tighter: average node use rose from 35% to 60%</td><td>$18,000</td></tr>
            <tr><td>Delete what’s idle</td><td>Old snapshots, unattached disks, and test clusters left running</td><td>$15,000</td></tr>
            <tr><td>Commit</td><td>Savings Plans on the steady base of compute. AWS discounts up to 66% for the flexible plan, up to 72% for one instance family</td><td>$14,000</td></tr>
            <tr><td>Stop paying to move bytes</td><td>S3 traffic through free gateway endpoints instead of NAT gateways; Kafka consumers reading from a replica in their own zone</td><td>$12,000</td></tr>
            <tr><td>Spot for bursts</td><td>Extra catalogue pods for sales on Spot instances, which AWS can take back with 2 minutes’ notice</td><td>$6,000</td></tr>
            <tr class="hl"><td>In all</td><td>Two months of work, no migration</td><td>$65,000: from $180,000 to $115,000</td></tr>
          </tbody>
        </table>

        <h2>The cloud or your own servers</h2>
        <table class="data">
          <thead><tr><th></th><th>Cloud</th><th>Own servers: rented dedicated, or bought and placed in a data centre</th></tr></thead>
          <tbody>
            <tr><td>A steady server</td><td>The highest price; commitments cut it by half or more</td><td>Often several times cheaper than on-demand cloud, less so against committed prices</td></tr>
            <tr><td>Bandwidth</td><td>Charged per GB out, and between zones and regions</td><td>Usually a large allowance included in the rent</td></tr>
            <tr><td>More capacity</td><td>Minutes</td><td>Days to weeks: order, rack, cable</td></tr>
            <tr><td>Databases, Kafka, load balancers, DDoS protection</td><td>Ready-made, run by the provider</td><td>Yours to run, upgrade and fix</td></tr>
            <tr><td>A failed disk at 3 a.m.</td><td>Mostly the provider’s problem</td><td>Your team’s, with spares and runbooks</td></tr>
            <tr><td>Best for</td><td>Spiky, new or fast-changing work</td><td>Large, steady, well-understood work</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>“10 to 20 times cheaper” compares the wrong things.</strong> It sets rented hardware against on-demand cloud prices, without the people, spare servers, second site and managed services you then provide yourself.</li>
          <li><strong>Real savings are large, but smaller than that.</strong> 37signals, the company behind Basecamp, spent about $700,000 on servers and cut its cloud bill by about $2 million a year; its own figures leave out some costs, such as replacing hardware later.</li>
          <li><strong>It’s not all or nothing.</strong> The steady, predictable part can move; the spiky, global and edge parts can stay where they’re cheap to run.</li>
        </ol>
        <p>Try Tomazon’s numbers:</p>
        <div class="widget" data-widget="cloud-or-own"></div>

        <h2>Tomazon’s decision</h2>
        <ol class="points">
          <li>About 60% of the tuned bill is steady: the database shards, Kafka and the baseline of compute in Mumbai, busy around the clock.</li>
          <li>Moving that part saves about $21,000 a month, and takes about 15 months to pay back the move. Worth doing, carefully, but far from the 10× the slogans promise.</li>
          <li>So Tomazon moves its home region’s steady base to dedicated servers in an Indian data centre. Flash-sale capacity, the other regions’ cells, CloudFront and S3 stay on AWS, where elastic and global is what they need.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Tune before you migrate.</strong> Right-sizing, commitments and data-transfer fixes are fast, safe and often
            save a third.</li>
            <li><strong>Count people in every cost comparison.</strong> Hardware is cheap; the engineers who run it, at night, are not.</li>
            <li><strong>Steady work wants owned capacity; spiky work wants the cloud.</strong> Most large systems end up using both.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Cut the waste first, then move only what’s steady, and only if the saving beats the people it needs.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'The cost',
      slug: 'the-move',
      title: 'Moving without stopping',
      sub: 'The strangler fig one last time: build the new site, shift traffic by weight, move the data last.',
      html: `
        <ol class="points lede">
          <li>Moving from one provider to another while shoppers keep shopping is page 7.4’s strangler fig at the largest scale: build alongside, move a little, measure, move more, and keep the way back open.</li>
        </ol>

        <h2>The playbook</h2>
        <ol class="steps">
          <li><strong>Build the new site, and break it on purpose.</strong> Servers in two separate halls, networking, a Kubernetes distribution such as k3s, local NVMe storage, monitoring, backups and on-call runbooks. Before any shopper arrives, pull a disk, cut a power feed and kill a server.</li>
          <li><strong>Connect it to AWS privately.</strong> A dedicated link, such as AWS Direct Connect, lets the old and new sites talk quickly and safely while both are running.</li>
          <li><strong>Move the stateless services first.</strong> The same manifests from chapter 10 run on the new cluster. Weighted records send 1% of traffic to it, then 10%, 50% and 100%, comparing errors and p95 at every step.</li>
          <li><strong>Move the data last, one shard at a time.</strong> Each shard gets a replica on the new servers, streaming across the link. A planned switchover pauses that shard’s writes for seconds, promotes the replica, and changes its row in the shard map (page 12.3). Kafka moves by copying topics to a new cluster with MirrorMaker 2, then moving consumers group by group.</li>
          <li><strong>Keep the way back open.</strong> Until the last shard has moved, AWS can take the traffic back in minutes. Paying for both sites for weeks is part of the price.</li>
          <li><strong>Switch off, and check the bill.</strong> Delete the old resources, and confirm next month’s bill shows the saving.</li>
        </ol>
        <ol class="points">
          <li><strong>Anycast doesn’t split traffic by percentage.</strong> The internet’s routing sends each network’s traffic to one place, chosen by path, so it can’t send exactly 1% to a new site. Gradual shifts use weights in DNS or at the edge; anycast decides where each shopper enters.</li>
          <li><strong>Owning your addresses helps, but isn’t enough.</strong> Addresses you own can move between providers. The work is in the services and data behind them.</li>
          <li><strong>The data is the hard part.</strong> Moving stateless pods takes days; moving databases safely takes most of the project.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Portable designs keep options open.</strong> Kubernetes manifests, open-source databases and Kafka moved;
            anything tied to one provider’s service would have had to be rebuilt.</li>
            <li><strong>Every migration is a strangler fig.</strong> Run old and new side by side, shift by weight, and delete the old
            only when nothing uses it.</li>
            <li><strong>Test failure before trusting the new home.</strong> A site that has never lost a server hasn’t been tested.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Move stateless first and data last, by weight, with the way back open until the end.</p>
        </aside>`
    },

    /* ============================================================== The end */
    {
      group: 'The end',
      slug: 'takeaways',
      title: 'What it all comes down to',
      sub: 'From one small server to 25 million users: every step answered a problem we could name and measure.',
      html: `
        <ol class="points lede">
          <li>You’ve followed Tomazon from a $3-a-month server for 100 shoppers to four regions and 25 million users.</li>
          <li>No step was planned years ahead. Each one began with a problem the numbers showed, and added the smallest thing that solved it.</li>
        </ol>

        <h2>The journey</h2>
        <table class="data">
          <thead><tr><th>Chapter</th><th>Users</th><th>The problem we measured</th><th>What we added</th></tr></thead>
          <tbody>
            <tr><td>2 One server</td><td>100</td><td>A pilot to ship, fast</td><td>One small server, one app</td></tr>
            <tr><td>3 Scale up, split out</td><td>1K</td><td>The app and the database fighting over one server</td><td>A server for the database</td></tr>
            <tr><td>4 Scale out</td><td>10K</td><td>App servers at 100% CPU</td><td>A load balancer and more app servers</td></tr>
            <tr><td>5 Make it fast</td><td>100K</td><td>The database busy, mostly with reads</td><td>Read replicas</td></tr>
            <tr><td>6 Cache it</td><td>500K</td><td>The same pages rebuilt for every shopper</td><td>Redis</td></tr>
            <tr><td>7 Split the monolith</td><td>1M</td><td>Two teams breaking each other’s releases</td><td>A first service, moved in gradually</td></tr>
            <tr><td>8 Publish events</td><td>2M</td><td>A listener that lost changes</td><td>Kafka, fed from the WAL</td></tr>
            <tr><td>9 Serve it nearby</td><td>3M</td><td>Slow photos abroad, and a growing bill</td><td>A CDN, and smaller photos</td></tr>
            <tr><td>10 Run many services</td><td>5M</td><td>A server lost at 2 a.m.</td><td>Containers and Kubernetes</td></tr>
            <tr><td>11 Go to the edge</td><td>7M</td><td>Slow in Europe, with fast servers</td><td>Edge caching, and a second region</td></tr>
            <tr><td>12 Split the data</td><td>10M</td><td>Every write on one primary</td><td>A flash-sale cell, and shards</td></tr>
            <tr><td>13 Go global</td><td>20M</td><td>Four regions sharing one home</td><td>Regional cells and home regions</td></tr>
            <tr><td>14 Count the cost</td><td>25M</td><td>A bill growing faster than the business</td><td>Cost tracking, tuning, owned servers for the steady part</td></tr>
          </tbody>
        </table>

        <h2>The takeaways</h2>
        <ol class="points">
          <li><strong>Scale based on need.</strong> Tomazon’s pilot ran on one tiny server, and it was the right design. Add capacity and complexity when a measured limit is near, not because a bigger design looks impressive.</li>
          <li><strong>Solve real problems.</strong> Name the problem before the technology. “The app servers are at 100% CPU” chose a load balancer; “two teams keep breaking each other” chose a service. “Microservices are modern” chooses nothing.</li>
          <li><strong>Add value.</strong> Every change should make something better for shoppers or the business: faster pages, fewer failures, a lower cost per order. If you can’t say what a change improves, don’t make it.</li>
          <li><strong>Engineer the solution to fit.</strong> Choose the smallest change that solves the problem: a cache before a rewrite, a replica before a shard, tuning before a migration. Every new part has a running cost (page 8.4).</li>
          <li><strong>Measure, then optimise.</strong> <code>pg_stat_statements</code> found the busy queries (page 5.1). Testing from two cities found the distance (page 11.1). The bill’s line items found the waste (page 14.1). Work on what the numbers point at.</li>
          <li><strong>Don’t optimise blindly.</strong> Guesses optimise the wrong thing. The scripts weren’t what slowed Europe down; shards wouldn’t have fixed one hot row; a CDN didn’t make India’s bandwidth cheaper. Each time, a measurement told us what a guess would have got wrong.</li>
          <li><strong>Observability is mandatory.</strong> You can’t scale, fix or pay for what you can’t see. Build it in from the first server, not after the first outage.</li>
        </ol>

        <h2>What to see, from day one</h2>
        <table class="data">
          <thead><tr><th>Signal</th><th>The question it answers</th><th>At Tomazon</th></tr></thead>
          <tbody>
            <tr><td>Metrics</td><td>Is it healthy right now? Watch the four golden signals: latency, traffic, errors and saturation</td><td>p95 per endpoint, the primary’s CPU, consumer lag (page 8.4)</td></tr>
            <tr><td>Logs</td><td>What exactly happened?</td><td>The payment webhook’s error after the coupon release (page 7.1)</td></tr>
            <tr><td>Traces</td><td>Where did one request spend its time, across services?</td><td>A checkout through the edge, the core API, a shard and the payment gateway</td></tr>
            <tr><td>Real-user timings</td><td>What do shoppers actually experience, country by country?</td><td>Time to first byte in Frankfurt (page 11.1)</td></tr>
            <tr><td>Cost</td><td>What does each service, and each order, cost?</td><td>The cost per 1,000 orders (page 14.1)</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>Set targets, and alert on them.</strong> Decide what good means, such as 99.9% of checkouts succeeding and product pages under 1 s at p95, and alert when a target is at risk, not on every busy CPU.</li>
          <li><strong>Use open standards.</strong> OpenTelemetry collects metrics, logs and traces in one vendor-neutral format, so you can change tools without changing code.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Every design is a snapshot.</strong> The right architecture for 100 users is wrong for 10 million, and the
            reverse. Design for the next step, not the last one.</li>
            <li><strong>Trade-offs never go away.</strong> Consistency or latency, speed or cost, simple or scalable: name the
            trade-off, choose it on purpose, and write down why.</li>
            <li><strong>The numbers lead.</strong> Every chapter started with a measurement. Keep measuring, and the next step
            will show itself.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Start small. Measure everything. Add only what the numbers ask for.</p>
        </aside>`
    }
  ]
};
