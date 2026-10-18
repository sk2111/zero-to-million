/* Chapter 12: Split the data.
   Same conventions as the earlier chapters. A phone brand's flash-sale launch would swamp the
   one primary that takes every write. Isolate the sale; then shard the orders by customer. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[12] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 10 million users. A phone brand chooses it for the exclusive launch of its new phone: three flash sales of 200,000 phones each, at noon.</li>
      <li>It’s the biggest deal in Tomazon’s history, and a moment later, its biggest worry. Reads can be spread across replicas, caches and regions. Every write still lands on one PostgreSQL primary in Mumbai.</li>
      <li>This chapter keeps the sale from swamping everyone else, then splits the data across several primaries: sharding.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Tell a hot spot from a write-volume problem, and fix each one the right way.</li>
        <li>Isolate a noisy neighbour, so one workload’s spike can’t starve the rest.</li>
        <li>Choose a shard key, and route each query to the right shard.</li>
        <li>Use logical shards so that adding a database moves as little data as possible.</li>
        <li>Move to shards without stopping, and avoid the traps that come after.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'the-launch',
      title: 'The launch that could sink checkout',
      sub: 'One sale, one product, five million shoppers, and one database that takes every write.',
      html: `
        <ol class="points lede">
          <li>The brand expects 5 million shoppers to be waiting at noon, and 200,000 phones to sell out within minutes. In the first minute, that could be 20,000 attempts to buy every second.</li>
          <li>Tomazon’s busiest ordinary moment, the 8 p.m. sale, brings about 150 orders a second.</li>
        </ol>

        <h2>Where every write goes today</h2>
        <ol class="points">
          <li>Every order, payment, cart change and account update is written to one primary: an r7g.8xlarge with 32 vCPUs and 256 GB of memory.</li>
          <li>At the 8 p.m. peak it writes about 4,000 rows a second, at 60% CPU. The order tables hold 2.5 TB, and grow by about 100 GB a month.</li>
          <li>Replicas, caches and the second region (chapters 5, 6 and 11) took the reads away. None of them can take a write.</li>
        </ol>

        <h2>Two different problems</h2>
        <table class="data">
          <thead><tr><th></th><th>The hot spot</th><th>The volume</th></tr></thead>
          <tbody>
            <tr><td>What it is</td><td>Thousands of transactions a second changing <em>one row</em>: the launch phone’s stock</td><td>Ever more writes, of every kind, to one server</td></tr>
            <tr><td>Why it hurts</td><td>Each transaction locks the row until it commits, about 1–2 ms, so they queue one behind another. One row takes at most about 500–1,000 changes a second</td><td>The primary’s CPU, disk and WAL have a ceiling. The biggest memory-optimised instance has 192 vCPUs; after that there’s no bigger server</td></tr>
            <tr><td>Who suffers</td><td>Everyone: the queued transactions hold database connections, so the pool runs dry and every other checkout waits</td><td>Everyone, slowly: vacuum, backups and restores of 2.5 TB take hours</td></tr>
            <tr><td>The fix</td><td>Keep the sale’s spike away from the shared database (page 12.2)</td><td>Split the data across several primaries (page 12.3)</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Sharding alone wouldn’t save the launch. However many primaries there are, the phone’s stock is one row on one of them.</li>
          <li>Both problems are cases of the <strong>noisy neighbour</strong>: one workload’s spike degrading everything that shares its resources. Here, the sale shares a primary, and a connection pool, with every other shopper.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Replicas scale reads; nothing but splitting scales writes.</strong> Know which kind of load is growing before
            choosing the fix.</li>
            <li><strong>Find the hot keys.</strong> A single row, counter or cache key that everyone updates caps the whole system,
            however much hardware is behind it.</li>
            <li><strong>Size for recovery, not just for traffic.</strong> A database that takes hours to restore is too big for one
            server, even when it’s fast enough.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Fix hot spots by changing how the work flows; fix volume by splitting the data.</p>
        </aside>`
    },

    /* ======================================================= The flash sale */
    {
      group: 'The flash sale',
      slug: 'flash-sale',
      title: 'Keep the sale off the shared database',
      sub: 'Let shoppers in at a pace the system can take, count the stock in Redis, and write orders steadily.',
      html: `
        <ol class="points lede">
          <li>A flash sale is mostly people being told “sold out”. Only 200,000 of the 5 million will buy, so the system must turn the rest away cheaply, and keep the database for the buyers.</li>
        </ol>

        <h2>Four changes for the launch</h2>
        <ol class="steps">
          <li><strong>A waiting room.</strong> At noon, shoppers join a queue at the edge, and are let into the sale at a rate the system can serve, say 2,000 a second. The rest see their place in the queue, not an error.</li>
          <li><strong>Stock counted in Redis.</strong> The 200,000 phones are a number in Redis. Each buyer reserves one with an atomic decrement, which takes microseconds and locks nothing in PostgreSQL.</li>
          <li><strong>Orders through a queue.</strong> A successful reservation becomes a message on an SQS queue (page 8.2). Order workers write the orders to the database at a steady 1,000 a second, not 20,000 at once.</li>
          <li><strong>A cell of its own.</strong> The sale runs on its own pods, in their own node pool, with its own Redis and queue. If the sale struggles, ordinary shoppers don’t notice.</li>
        </ol>
        <figure class="term">
          <figcaption>Reserving stock in Redis: check and decrement in one step</figcaption>
<pre><span class="c">-- KEYS[1] = stock:launch-phone     ARGV[1] = how many to reserve</span><span class="o">
local left = tonumber(redis.call('GET', KEYS[1]) or '0')
if left &lt; tonumber(ARGV[1]) then
  return -1                                    </span><span class="c">-- sold out: nothing changes</span><span class="o">
end
return redis.call('DECRBY', KEYS[1], ARGV[1])</span></pre>
          <ol class="points term-note">
            <li>Redis runs a script as one step, so two buyers can never both take the last phone.</li>
            <li>A reservation lasts 10 minutes. If payment doesn’t complete, a worker adds the phone back.</li>
            <li>Redis is the gate, not the record. The orders in PostgreSQL are the truth, and after each sale a job checks that phones sold plus phones left equals 200,000.</li>
          </ol>
        </figure>

        <h2>What the database sees</h2>
        <ol class="points">
          <li>Before: up to 20,000 transactions a second fighting over one row, and every other checkout stuck behind them.</li>
          <li>After: a steady 1,000 orders a second from the workers, no shared hot row, and ordinary checkout untouched. The sale takes a few minutes longer to settle, which nobody minds: every buyer already has a reservation.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Turn a spike into a queue.</strong> A queue lets the slow part work at its own pace while the fast part
            answers everyone at once.</li>
            <li><strong>Move hot counters out of the database.</strong> Count in memory, atomically, and write the results to the
            database steadily.</li>
            <li><strong>Give the noisy workload walls.</strong> Separate pods, caches and queues, bulkheads, keep one spike from
            sinking the rest.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Admit what you can serve, reserve in memory, and write to the database at its own pace.</p>
        </aside>`
    },

    /* =================================================== Splitting the data */
    {
      group: 'Splitting the data',
      slug: 'sharding',
      title: 'Sharding: more than one primary',
      sub: 'Split the rows across several databases, and route every query to the one that holds its data.',
      html: `
        <ol class="points lede">
          <li>The launch is safe. The volume isn’t: writes keep growing every month, and one primary has a ceiling.</li>
          <li><strong>Sharding</strong> splits a table’s rows across several databases, called <strong>shards</strong>, each a primary with its own replicas. Each shard takes only its share of the writes, and holds only its share of the data.</li>
          <li>A <strong>shard key</strong>, a column every query carries, decides which shard each row lives on.</li>
        </ol>

        <h2>Choosing the shard key</h2>
        <table class="data">
          <thead><tr><th>Shard by</th><th>Suits</th><th>Watch out for</th></tr></thead>
          <tbody>
            <tr class="hl"><td>Customer</td><td>Orders, carts, payments, addresses: almost every query is about one customer</td><td>A few huge customers, such as companies buying for thousands of staff</td></tr>
            <tr><td>Tenant (one store or business)</td><td>Platforms that host many shops, where each shop’s data stands alone. The biggest tenants get a shard of their own</td><td>Tenants of very different sizes</td></tr>
            <tr><td>Time</td><td>Logs and events, where new data is written and old data only read</td><td>All the writes land on the newest shard</td></tr>
            <tr><td>Product</td><td>Catalogue data</td><td>Popular products make hot shards. Tomazon’s catalogue is read-heavy, and already scaled with replicas and caches</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Tomazon shards by <strong>customer</strong>. “My orders”, the cart and checkout all touch one customer, so nearly every query stays on one shard.</li>
          <li>Stock moves to the inventory service’s own database, and the catalogue stays with the catalogue service. Neither is sharded by customer.</li>
        </ol>

        <h2>Logical shards: make adding a database cheap</h2>
        <ol class="points">
          <li>The obvious router, <code>hash(customer) % 4</code>, has a trap: when a fifth database is added, the answer changes for most customers, and most of the data must move at once.</li>
          <li>Instead, customers are hashed into 64 <strong>logical shards</strong>, and a small <strong>shard map</strong> says which database holds each one. Adding a database moves a few whole logical shards, and changes a few rows of the map.</li>
        </ol>
        <p>Add a fifth primary both ways, and count the customers whose data has to move:</p>
        <div class="widget" data-widget="shard-map"></div>

        <h2>The router</h2>
        <figure class="term">
          <figcaption>The shard router, in one place in the core API</figcaption>
<pre><span class="o">LOGICAL_SHARDS = 64

def logical_shard(customer_id: int) -&gt; int:
    digest = hashlib.blake2b(customer_id.to_bytes(8, "big"), digest_size=8).digest()
    return int.from_bytes(digest, "big") % LOGICAL_SHARDS

def orders_db(customer_id: int):
    primary = SHARD_MAP[logical_shard(customer_id)]   </span><span class="c"># "orders-3": the map, cached in memory</span><span class="o">
    return POOLS[primary]                              </span><span class="c"># one connection pool per primary</span></pre>
          <ol class="points term-note">
            <li>The hash must give the same answer in every process, forever. Python’s built-in <code>hash()</code> doesn’t for strings: it changes with every restart.</li>
            <li>The map is a 64-row table, cached in every pod and reloaded when it changes. Every order query goes through <code>orders_db()</code>; nothing else knows that shards exist.</li>
            <li>An order id must lead to its shard too: the payment gateway’s webhook (page 7.1) knows only the order id. So each order id carries its logical shard in a few of its bits, next to a timestamp.</li>
          </ol>
        </figure>
        <p>Follow two customers to their shards:</p>
        <div class="widget" data-widget="shard-arch"></div>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Choose the key your queries already use.</strong> A good shard key keeps nearly every request on one shard;
            a bad one turns them into questions for every shard.</li>
            <li><strong>Separate the logical layout from the physical one.</strong> Many logical shards on few databases make later
            growth a matter of moving pieces, not reshuffling everything.</li>
            <li><strong>Route in one place.</strong> A router scattered through the codebase is a router that someone will bypass.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Shard by what nearly every query is about, and keep a map between logical shards and databases.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Splitting the data',
      slug: 'living-with-shards',
      title: 'Moving to shards, and living with them',
      sub: 'Move one logical shard at a time, then keep queries, IDs and changes shard-shaped.',
      html: `
        <ol class="points lede">
          <li>Tomazon moves its order data from one primary to four, while shoppers keep ordering. It’s page 7.4’s strangler fig again, one logical shard at a time.</li>
        </ol>

        <h2>The move</h2>
        <ol class="steps">
          <li><strong>Route through the map first.</strong> Ship the router with every logical shard mapped to the old primary. Nothing moves yet, but every query now goes through <code>orders_db()</code>.</li>
          <li><strong>Copy and follow.</strong> For each logical shard, copy its rows to its new primary, and keep the copy up to date from the WAL, with logical replication or Debezium (chapter 8).</li>
          <li><strong>Switch one shard.</strong> Pause writes for that logical shard for a few seconds, wait until its copy has caught up, change its row in the map, and resume. Customers in the other 63 notice nothing.</li>
          <li><strong>Check, then clean up.</strong> Compare row counts and checksums between old and new. When all 64 have moved, the old primary’s order tables can go.</li>
        </ol>

        <h2>Build it, or use a sharded database?</h2>
        <table class="data">
          <thead><tr><th></th><th>Your own router</th><th>Citus</th><th>Aurora PostgreSQL Limitless</th></tr></thead>
          <tbody>
            <tr><td>What it is</td><td>A shard map and router in your code, over ordinary PostgreSQL</td><td>An open-source PostgreSQL extension that spreads tables across nodes</td><td>An AWS-managed sharded PostgreSQL, generally available since October 2024</td></tr>
            <tr><td>Queries across shards</td><td>You write them</td><td>Handled, as distributed SQL</td><td>Handled, by its routers</td></tr>
            <tr><td>Moving data</td><td>You build it</td><td>A built-in rebalancer</td><td>Managed by AWS</td></tr>
            <tr><td>Ties you to</td><td>Nothing</td><td>The extension</td><td>AWS</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Tomazon’s order queries are almost all about one customer, so its own router is enough, on plain PostgreSQL it already knows how to run. A system with many queries across customers would lean towards Citus or Limitless.</li>
        </ol>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Queries without the shard key</td><td>They must ask every shard and merge the answers: slow, and only as available as the slowest shard</td><td>Every order query carries the customer. Reports and analytics go to the data warehouse, fed from Kafka</td></tr>
            <tr><td>Transactions across shards</td><td>There’s no single transaction to keep them consistent</td><td>Keep each transaction on one shard. Work that spans shards goes through events and the outbox (page 8.3)</td></tr>
            <tr><td>A hot shard</td><td>One huge customer, such as a company buying for its 50,000 staff, overloads its shard</td><td>The map can give them a logical shard, even a primary, of their own</td></tr>
            <tr><td>IDs from a sequence</td><td>Each shard’s sequence makes the same numbers</td><td>Time-ordered IDs with the shard inside them</td></tr>
            <tr><td>Schema changes</td><td>Four databases, changed one by one, briefly disagree</td><td>Changes that work with old and new code alike: add first, remove later (page 7.3)</td></tr>
            <tr><td>Backups</td><td>Each shard is backed up at its own moment, so there’s no single point in time across all of them</td><td>Design so each shard can be restored on its own</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Flash sales</td><td>A waiting room at the edge, stock reserved in Redis, orders written through SQS, all in a cell of their own</td></tr>
            <tr><td>Shard key</td><td>The customer, for orders, carts, payments and addresses</td></tr>
            <tr><td>Layout</td><td>64 logical shards on 4 primaries, orders-1 to orders-4, each with its own replicas</td></tr>
            <tr><td>Routing</td><td>One router in the core API, with the shard map cached in every pod</td></tr>
            <tr><td>Not sharded</td><td>The catalogue and stock, each in its own service’s database</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Writes are spread now, but all four primaries are in Mumbai. A shopper in Singapore or Ohio still crosses the world to place an order.</li>
          <li>And the Frankfurt replicas copy everything, including every shopper’s personal data, to Europe. Adding more regions that way would copy it to every continent.</li>
          <li>Chapter 13 builds Tomazon for many regions: a copy of the shop in each, fed only the data it needs, and shards that can live near their customers.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Shard late, but plan early.</strong> Sharding is a big, lasting cost. Put a customer or tenant id on every row
            long before you need it, and the move becomes possible.</li>
            <li><strong>Every shard is a full database.</strong> Replicas, backups, monitoring and upgrades now happen four times.</li>
            <li><strong>Isolation is a feature.</strong> Shards and cells limit how far one problem spreads, and can give your
            biggest customers room of their own.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Move one logical shard at a time, and keep every transaction on one shard.</p>
        </aside>`
    }
  ]
};
