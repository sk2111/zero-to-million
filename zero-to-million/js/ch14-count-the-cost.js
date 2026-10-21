/* Chapter 14: Count the cost. The last chapter.
   Same conventions as the earlier chapters. Two pages: the AWS bill outgrows the business, so tune it,
   move only the steady part; then what the whole workshop comes down to. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[14] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 25 million users. Every design from chapters 2 to 13 works. Then the month’s AWS bill arrives: $180,000.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Track the cost of each order like any other metric.</li>
        <li>Cut a cloud bill before moving anything.</li>
        <li>Weigh the cloud against your own servers, people included.</li>
        <li>Say what the whole workshop comes down to.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'the-bill',
      title: '25 million users, and a bill that outgrew the business',
      sub: 'The bill grew 70% in six months, while orders grew 30%. Where does the money go?',
      html: `
        <ol class="points lede">
          <li>Every chapter added something that runs all the time: replicas, caches, brokers, regions, standbys.</li>
          <li>Each was the right call when it was made. Nobody watched what they cost together.</li>
        </ol>

        <h2>The bottleneck: the cost of each order</h2>
        <ol class="points">
          <li><strong>The cost per 1,000 orders</strong> rose from $3.80 to $5.00 in six months. That one number says the bill is growing faster than the business.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Where $180,000 a month goes</th><th>A month</th></tr></thead>
          <tbody>
            <tr><td>Compute: EKS nodes in four regions, all at on-demand prices</td><td>$68,000</td></tr>
            <tr><td>Databases: shard primaries, replicas and standbys</td><td>$46,000</td></tr>
            <tr class="hl"><td>Data transfer: between zones and regions, and through NAT gateways</td><td>$24,000</td></tr>
            <tr><td>Everything else: Redis, OpenSearch, load balancers, snapshots</td><td>$20,000</td></tr>
            <tr><td>Kafka: MSK and its connectors</td><td>$16,000</td></tr>
            <tr><td>CloudFront and S3</td><td>$6,000</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>The surprise is data transfer.</strong> Moving bytes between zones and regions costs more than all of Kafka. Nobody chose it; it came with the design.</li>
        </ol>

        <h2>Tune first</h2>
        <table class="data">
          <thead><tr><th>Lever</th><th>Saved a month</th></tr></thead>
          <tbody>
            <tr><td>Right-size: the CPU and memory each pod asks for matched to what it really uses, so nodes are packed tighter</td><td>$18,000</td></tr>
            <tr><td>Delete what’s idle: old snapshots, unattached disks, forgotten test clusters</td><td>$15,000</td></tr>
            <tr><td>Commit: Savings Plans for the steady base of compute</td><td>$14,000</td></tr>
            <tr><td>Stop paying to move bytes: S3 traffic around the NAT gateways, Kafka reads within a zone</td><td>$12,000</td></tr>
            <tr><td>Spot instances for the extra pods during sales</td><td>$6,000</td></tr>
            <tr class="hl"><td>In all, in two months, without moving anything</td><td>$65,000</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>Then keep cost in sight.</strong> Every resource is tagged with its team and service, and the cost per 1,000 orders sits on the same dashboard as p95 and errors.</li>
        </ol>

        <h2>The cloud, or your own servers</h2>
        <ol class="points">
          <li><strong>Steady work is cheaper on your own servers; spiky work is cheaper in the cloud.</strong> Your own servers cost less each, and include bandwidth. But they take weeks to add, and your team runs the databases, Kafka and the disk that fails at 3 a.m.</li>
          <li><strong>“10 to 20 times cheaper” compares the wrong things.</strong> It leaves out the people, the spare servers and the second site. Real savings are large, but smaller: 37signals spent about $700,000 on servers and cut its cloud bill by about $2 million a year.</li>
        </ol>

        <h2>Tomazon’s decision</h2>
        <ol class="points">
          <li><strong>Move only the steady part.</strong> About 60% of the tuned bill runs around the clock: the database shards, Kafka and the baseline of compute in Mumbai. It moves to dedicated servers in an Indian data centre, saving about $21,000 a month, paid back in about 15 months.</li>
          <li><strong>Keep the rest on AWS.</strong> Sale-time capacity, the other regions’ cells, CloudFront and S3 stay where elastic and global is what they need.</li>
          <li><strong>Move without stopping.</strong> It’s the strangler fig once more (page 7.4): stateless services first, shifted by weight; the data last, one shard at a time; and the way back to AWS open until the end.</li>
        </ol>
        <table class="data">
          <thead><tr><th></th><th>Before</th><th>After tuning</th><th>After the move</th></tr></thead>
          <tbody>
            <tr><td>The monthly bill</td><td>$180,000</td><td>$115,000</td><td>About $94,000</td></tr>
            <tr class="hl"><td>Cost per 1,000 orders</td><td>$5.00</td><td>About $3.20</td><td>About $2.60</td></tr>
          </tbody>
        </table>`
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
            <tr><td>10 Run many services</td><td>5M</td><td>A server lost at 2 a.m.</td><td>Kubernetes</td></tr>
            <tr><td>11 Go to the edge</td><td>7M</td><td>Slow in Europe, with fast servers</td><td>Edge caching, and a second region</td></tr>
            <tr><td>12 Split the data</td><td>10M</td><td>Every write on one primary</td><td>Order shards, by customer</td></tr>
            <tr><td>13 Go global</td><td>20M</td><td>Four regions depending on Mumbai</td><td>Regional cells and home regions</td></tr>
            <tr><td>14 Count the cost</td><td>25M</td><td>A bill growing faster than the business</td><td>Tuning, and owned servers for the steady part</td></tr>
          </tbody>
        </table>

        <h2>The takeaways</h2>
        <ol class="points">
          <li><strong>Scale based on need.</strong> Tomazon’s pilot ran on one tiny server, and it was the right design. Add capacity and complexity when a measured limit is near.</li>
          <li><strong>Solve real problems.</strong> Name the problem before the technology. “The app servers are at 100% CPU” chose a load balancer; “microservices are modern” chooses nothing.</li>
          <li><strong>Add value.</strong> Every change should make something better for shoppers or the business: faster pages, fewer failures, a lower cost per order.</li>
          <li><strong>Engineer the solution to fit.</strong> Choose the smallest change that solves the problem: a cache before a rewrite, a replica before a shard, tuning before a migration.</li>
          <li><strong>Measure, then optimise.</strong> <code>pg_stat_statements</code> found the busy queries, testing from two cities found the distance, and the bill’s lines found the waste.</li>
          <li><strong>Don’t optimise blindly.</strong> The scripts weren’t what slowed Europe down, and a CDN didn’t make India’s bandwidth cheaper. Each time, a measurement told us what a guess would have got wrong.</li>
          <li><strong>Observability is mandatory.</strong> You can’t scale, fix or pay for what you can’t see. Build it in from the first server, not after the first outage.</li>
        </ol>

        <h2>What to see, from day one</h2>
        <table class="data">
          <thead><tr><th>Signal</th><th>The question it answers</th><th>At Tomazon</th></tr></thead>
          <tbody>
            <tr><td>Metrics</td><td>Is it healthy right now? Latency, traffic, errors and saturation</td><td>p95 per endpoint, the primary’s CPU, Kafka consumer lag</td></tr>
            <tr><td>Logs</td><td>What exactly happened?</td><td>The payment errors after the coupon release (page 7.1)</td></tr>
            <tr><td>Traces</td><td>Where did one request spend its time, across services?</td><td>A checkout through the edge, the core API and a shard</td></tr>
            <tr><td>Real-user timings</td><td>What do shoppers actually experience, country by country?</td><td>Time to first byte in Frankfurt (chapter 11)</td></tr>
            <tr><td>Cost</td><td>What does each service, and each order, cost?</td><td>The cost per 1,000 orders (page 14.1)</td></tr>
          </tbody>
        </table>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Start small. Measure everything. Add only what the numbers ask for.</p>
        </aside>`
    }
  ]
};
