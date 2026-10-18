/* Chapter 13: Go global.
   Same conventions as the earlier chapters. Tomazon runs a cell in every region, feeds each one
   only the data it needs, places shards near their customers, and plans for losing a region. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[13] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 20 million users, and opens in Southeast Asia and North America. With Mumbai and Frankfurt, that makes four regions.</li>
      <li>The two-region design from chapter 11 doesn’t stretch to four. Every region would hold a full copy of every database, personal data included, and every region would depend on Mumbai to stay healthy.</li>
      <li>This chapter gives each region its own complete shop, feeds it only the data it needs, moves customers’ data near them, and plans for losing a whole region.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Design regional cells that serve their shoppers on their own.</li>
        <li>Choose between DNS-based routing and anycast for a global front door.</li>
        <li>Feed each region selected data through change data capture, safely.</li>
        <li>Place customers’ shards in their home region.</li>
        <li>Say what keeps working, and what doesn’t, when a region is lost.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'four-regions',
      title: '20 million users, and four regions with one home',
      sub: 'Chapter 11’s recipe, repeated for every region, copies everything and depends on Mumbai for all of it.',
      html: `
        <ol class="points lede">
          <li>Tomazon opens in Singapore and Ohio. The quickest way there is chapter 11’s recipe, twice more: a cluster in each region, and a streaming replica of each database.</li>
          <li>Within three months, that recipe shows its limits.</li>
        </ol>

        <h2>What the recipe costs at four regions</h2>
        <ol class="points">
          <li><strong>Every region holds everything.</strong> Five primaries, the catalogue’s and four order shards, each streamed to three other regions: 15 full copies, with every shopper’s orders and addresses on every continent. Privacy law cares where that data goes.</li>
          <li><strong>Every region replays every write.</strong> A replica in Ohio applies every order placed in India, though Ohio’s pages never read them, and Mumbai sends its whole write stream across the oceans three times.</li>
          <li><strong>Every region depends on Mumbai.</strong> Last month a network problem between Mumbai and Singapore lasted 40 minutes. Singapore’s replica fell 40 minutes behind, and its shoppers saw old prices and stock the whole time.</li>
          <li><strong>Writes cross the world.</strong> A shopper in Ohio adding to their cart waits for a round trip to Mumbai, about 200 ms, on every write.</li>
          <li><strong>One deploy reaches every region at once.</strong> A bad configuration change broke the catalogue in all four regions for 20 minutes.</li>
        </ol>

        <h2>What each region needs</h2>
        <table class="data">
          <thead><tr><th>Need</th><th>Today</th><th>Where this chapter fixes it</th></tr></thead>
          <tbody>
            <tr><td>Serve its shoppers on its own</td><td>Needs fresh data from Mumbai, and stalls with it</td><td>Regional cells (page 13.2)</td></tr>
            <tr><td>Hold only the data it needs</td><td>Holds a copy of everything, personal data included</td><td>Selective feeds through Kafka (page 13.3)</td></tr>
            <tr><td>Take its own customers’ writes</td><td>Sends every write to Mumbai</td><td>Home regions (page 13.4)</td></tr>
            <tr><td>Fail on its own</td><td>A Mumbai problem or a bad deploy reaches every region</td><td>Cells, one-at-a-time deploys, and failover (pages 13.2 and 13.4)</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Repeating a design multiplies its weaknesses.</strong> What was fine for two regions isn’t for four: every
            copy, dependency and cost grows with each one added.</li>
            <li><strong>Dependencies decide how failures spread.</strong> If every region needs Mumbai, Mumbai’s problem is
            everyone’s.</li>
            <li><strong>Decide what each region holds before copying it.</strong> Where data lives is a requirement, not a detail.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Before adding a region, decide what it must do on its own, and what it must never hold.</p>
        </aside>`
    },


    /* ======================================================= Many regions */
    {
      group: 'Many regions',
      slug: 'regional-cells',
      title: 'A shop in every region',
      sub: 'Each region runs a complete, independent copy of everything a shopper needs to browse.',
      html: `
        <ol class="points lede">
          <li>Tomazon now serves shoppers from four AWS regions: Mumbai, Frankfurt, Singapore and Ohio.</li>
          <li>Each region runs a <strong>cell</strong>: a complete copy of everything needed to browse and search, with its own EKS cluster, catalogue and search pods, Redis and read database. To serve a page, a cell never calls another region.</li>
        </ol>

        <h2>What a cell does on its own, and what goes home</h2>
        <table class="data">
          <thead><tr><th>Request</th><th>Served by</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Home page, product pages, search</td><td>The shopper’s nearest cell</td><td>Read-only, and the same for everyone in the region</td></tr>
            <tr><td>Prices and stock on the page</td><td>The nearest cell, about a second behind</td><td>Good enough to show; checkout checks again</td></tr>
            <tr><td>Cart, orders, payments, account</td><td>The region that holds the customer’s shard</td><td>Writes, and money: one place decides</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>Failures stay where they start.</strong> A bad deploy, a full disk or an outage in one cell affects one region’s shoppers, not everyone’s.</li>
          <li><strong>Deploys go one cell at a time.</strong> A new version goes to the smallest region first, and moves on only if its errors and p95 stay flat.</li>
          <li><strong>Every cell is built from the same files.</strong> The manifests from chapter 10 and an infrastructure-as-code template make a new region a copy, not a project.</li>
        </ol>

        <h2>One front door for the world</h2>
        <ol class="points">
          <li>Shoppers everywhere use the same name, <code>tomazon.com</code>. Something has to send each one to the right place. There are two ways.</li>
        </ol>
        <table class="data">
          <thead><tr><th></th><th>DNS-based routing (Route 53 latency records, CloudFront)</th><th>Anycast (Global Accelerator, CloudFront static IPs)</th></tr></thead>
          <tbody>
            <tr><td>How it chooses</td><td>DNS gives different answers depending on where the question comes from</td><td>The same IP addresses are announced from many places, and the internet’s routing (BGP) delivers each packet to the nearest</td></tr>
            <tr><td>“Nearest” means</td><td>Nearest to the shopper’s DNS resolver, which is usually, not always, near the shopper</td><td>Fewest network hops away, which is usually, not always, the lowest latency</td></tr>
            <tr><td>When a location fails</td><td>Shoppers keep the old answer until it expires, and some resolvers keep it longer</td><td>Traffic moves to the next location within seconds, with no DNS change</td></tr>
            <tr><td>Fixed addresses</td><td>No: the addresses change</td><td>Yes: a small fixed set, for firewall allow-lists and bare domains such as <code>tomazon.com</code></td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>On AWS you can’t announce addresses from a region yourself. Anycast comes from AWS Global Accelerator, which can even announce an address range you own, or from CloudFront’s anycast static IPs, added in late 2024.</li>
          <li>Tomazon already has a global front door: CloudFront’s edges (chapter 11). Each edge picks the region for each request. It adds CloudFront’s anycast static IPs for the bare <code>tomazon.com</code> and for partners whose firewalls need fixed addresses.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Cells limit the blast radius.</strong> Build each region so that it can serve its shoppers with every other
            region gone.</li>
            <li><strong>Hidden calls home break cells.</strong> One service that quietly asks Mumbai for every page ties every
            region to Mumbai. Test cells by cutting the link.</li>
            <li><strong>Roll out region by region.</strong> A global deploy is a global outage waiting for one bad change.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Each region serves its own shoppers on its own; only writes go to where the data lives.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Many regions',
      slug: 'feeding-regions',
      title: 'Feeding each region its data',
      sub: 'Send every cell the catalogue changes it needs, and nothing else, through Kafka.',
      html: `
        <ol class="points lede">
          <li>Frankfurt’s read data comes from a streaming replica of the Mumbai primary (chapter 11). Doing that in four regions would work, technically. Streaming replication copes with long distances and many replicas.</li>
          <li>The problem is what it copies: every table and every row, including every customer’s orders and addresses, to every continent. A physical replica can’t choose.</li>
        </ol>

        <h2>Change data capture, region by region</h2>
        <ol class="steps">
          <li><strong>Publish the changes.</strong> Debezium already turns every committed change into a Kafka message (page 8.3). The catalogue topics carry products, prices, stock levels and categories, and no personal data.</li>
          <li><strong>Copy the topics to each region.</strong> MSK Replicator copies those topics into a Kafka cluster in each region. If a region’s link breaks, its messages wait in Mumbai’s Kafka and catch up later.</li>
          <li><strong>Apply them locally.</strong> In each cell, an applier reads the local copy and upserts each change into the cell’s own read database, and into its search index.</li>
        </ol>
        <ol class="points">
          <li><strong>The regional database isn’t a replica.</strong> A streaming replica is read-only: it can only replay its primary’s WAL, so nothing else can write to it. The cell’s read database is an ordinary database, whose only writer is the applier.</li>
          <li><strong>So it can be shaped for reading.</strong> It holds only what pages need, already joined: a product with its price, stock and rating in one row.</li>
        </ol>
        <figure class="term">
          <figcaption>The applier’s upsert: safe to run twice, and safe out of order</figcaption>
<pre><span class="o">INSERT INTO products (id, name, price, in_stock, rating, lsn)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (id) DO UPDATE
   SET name = EXCLUDED.name, price = EXCLUDED.price,
       in_stock = EXCLUDED.in_stock, rating = EXCLUDED.rating, lsn = EXCLUDED.lsn
 WHERE products.lsn &lt; EXCLUDED.lsn;          </span><span class="c">-- an older or repeated change does nothing</span></pre>
          <ol class="points term-note">
            <li><code>lsn</code> is the change’s position in the source’s WAL, carried in every Debezium message. The row keeps the newest position it has applied.</li>
            <li>Kafka delivers at least once (page 8.3), so the same change can arrive twice. Applying it twice changes nothing.</li>
            <li>A message keyed by product id always lands in the same partition, so one product’s changes arrive in order. The <code>WHERE</code> guards against anything that doesn’t.</li>
          </ol>
        </figure>

        <h2>Keeping every region honest</h2>
        <ol class="points">
          <li><strong>Start from a snapshot.</strong> A new region is filled from a snapshot of the catalogue, then follows the topics from the position the snapshot was taken at.</li>
          <li><strong>Watch each region’s lag.</strong> Consumer lag per region (page 8.4) says how stale each cell is. Alert when it grows for minutes.</li>
          <li><strong>Reconcile every night.</strong> Compare counts and checksums per category between Mumbai and each cell. Bugs in appliers cause slow, silent drift; only checking finds it.</li>
          <li><strong>Never charge from a copy.</strong> A cell’s price can be a second old. Checkout reads the price and stock from the home region, as page 6.3 said for the cache.</li>
        </ol>
        <p>Follow a shopper in Singapore:</p>
        <div class="widget" data-widget="global-arch"></div>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Replicate what each region needs, not everything.</strong> Selective copies cost less, expose less personal
            data, and can be shaped for reading.</li>
            <li><strong>Make every apply idempotent and ordered.</strong> Carry a version, such as the WAL position, with each change,
            and ignore anything older than what you have.</li>
            <li><strong>Copies drift.</strong> Lag alerts catch slow copies; only reconciliation catches wrong ones.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Feed each region the changes it needs, versioned, and check every night that it agrees with home.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Many regions',
      slug: 'losing-a-region',
      title: 'Writes near home, and losing a region',
      sub: 'Put each customer’s shard in their home region, and plan for a region going dark.',
      html: `
        <ol class="points lede">
          <li>Browsing is local everywhere now. Writes still all go to Mumbai, where the four order shards are, so a shopper in Ohio crosses the world to add to their cart.</li>
          <li>The shard map from page 12.3 already has the answer: a logical shard can live on a primary in any region.</li>
        </ol>

        <h2>Home regions</h2>
        <ol class="points">
          <li>Each customer gets a <strong>home region</strong> when they sign up, from where they shop. Tomazon reserves logical shards for each region: new European customers are placed in Frankfurt’s, Indian customers in Mumbai’s, and so on.</li>
          <li>The edge reads the home region from the shopper’s sign-in token, and sends their writes there. For most shoppers, every write is now local.</li>
          <li>Their personal data stays in their home region too, which makes Europe’s GDPR and India’s DPDP Act easier to satisfy.</li>
          <li>A traveller’s writes still go home: a long round trip, but a rare one. Moving a customer who emigrates is moving one customer’s rows between shards, a support task, not a redesign.</li>
          <li>The catalogue keeps one home, Mumbai, where staff edit it. Data that everyone writes to at once, like stock in a flash sale, needs one place to decide.</li>
        </ol>

        <h2>Losing a region</h2>
        <table class="data">
          <thead><tr><th>If this region is lost</th><th>What still works</th><th>What doesn’t, until recovery</th></tr></thead>
          <tbody>
            <tr><td>Singapore</td><td>Everything: its shoppers are served by the next-nearest cell, a little slower</td><td>Writes for customers whose home is Singapore</td></tr>
            <tr><td>Mumbai</td><td>Browsing and search everywhere, from each cell’s own data. European, Asian and American customers’ orders</td><td>Orders from customers whose home is Mumbai. Catalogue and price changes, which wait</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>Degrade, don’t disappear.</strong> When a home region is down, the site stays up for browsing, and its customers see “checkout is paused, try again shortly” instead of an error page.</li>
          <li><strong>Each shard has a standby in another region.</strong> Promoting it brings writes back within minutes. Replication across regions is asynchronous, so the last second or so of writes before the failure can be lost: the PACELC trade-off from page 5.3, at its largest.</li>
          <li><strong>Practise it.</strong> A failover that has never been run will not work on the night. Run one, on purpose, every few months.</li>
        </ol>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>A cell that quietly calls home</td><td>One region’s outage takes every region down with it</td><td>Cut the link in a test, and see what breaks</td></tr>
            <tr><td>Personal data in the regional copies</td><td>Every region holds every customer’s data</td><td>Only catalogue topics go to cells; personal data stays in the home region’s shard</td></tr>
            <tr><td>Charging from a regional copy</td><td>A price a second old is charged</td><td>Checkout reads price and stock from home</td></tr>
            <tr><td>Two regions writing the same data</td><td>Conflicting changes, and no rule for which one wins</td><td>Every piece of data has one home that takes its writes</td></tr>
            <tr><td>A global deploy</td><td>One bad change breaks every region at once</td><td>Deploy one cell at a time</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Regions</td><td>Mumbai, Frankfurt, Singapore and Ohio, each a complete cell for browsing and search</td></tr>
            <tr><td>Front door</td><td>CloudFront’s edges, plus its anycast static IPs for the bare domain and partners</td></tr>
            <tr><td>Data in the cells</td><td>Catalogue topics only, copied by MSK Replicator and upserted by an applier, reconciled nightly</td></tr>
            <tr><td>Writes</td><td>To the customer’s home region, through the shard map; the catalogue’s home is Mumbai</td></tr>
            <tr><td>Losing a region</td><td>Cross-region standbys for every shard; browsing stays up; failovers practised every quarter</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Tomazon now runs in four regions, with dozens of services, hundreds of pods and a standby for every shard. The design works.</li>
          <li>But every chapter added something that runs, and is billed, all the time. The AWS bill has grown 70% in six months, while orders grew 30%.</li>
          <li>Chapter 14, the last, finds where the money goes, and asks whether every part still belongs in the cloud.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Give every piece of data one home.</strong> Many regions can read it; one region writes it. Data written in
            several places needs conflict rules, and those are much harder.</li>
            <li><strong>Put data near the people who write it.</strong> Home regions make writes local, and keep personal data where
            the law expects it.</li>
            <li><strong>Decide what “down” looks like.</strong> Choose, in advance, what each region keeps doing when another is lost.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Read everywhere, write at the data’s home, and practise losing a region.</p>
        </aside>`
    }
  ]
};
