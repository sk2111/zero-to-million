/* Chapter 12: Split the data.
   Same conventions as the earlier chapters. One page: a phone launch shows that every write still lands
   on one primary. Replicas and caches can't help; the orders are sharded by customer. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[12] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 10 million users, and a phone brand picks it for the exclusive launch of its new phone.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why replicas and caches can’t help with writes.</li>
        <li>Choose a shard key, and explain logical shards and a shard map.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'sharding',
      title: '10 million users, and one database takes every write',
      sub: 'Reads are spread across replicas, caches and regions. Every write lands on one primary.',
      html: `
        <ol class="points lede">
          <li>At noon on launch day, the phone brand puts 200,000 phones on sale, with about 5 million shoppers waiting.</li>
          <li>If a quarter of them try in the first minute, that’s about 20,000 attempts to buy every second.</li>
          <li>Tomazon’s busiest hour, the 6 p.m. sale (page 6.1), runs at about 150 orders a second.</li>
        </ol>

        <h2>The bottleneck: one primary</h2>
        <ol class="points">
          <li>Every order, payment, cart change and account update is written to one PostgreSQL primary in Mumbai: an r7g.8xlarge, with 32 vCPUs.</li>
          <li>At the 6 p.m. peak it already writes about 4,000 rows a second, at 60% CPU. Its order tables hold 2.5 TB, and grow by about 100 GB a month.</li>
          <li>Replicas, Redis and the Frankfurt region took the reads away (chapters 5, 6 and 11). None of them can take a write: every write still goes to this one primary.</li>
        </ol>

        <h2>Where sharding helps</h2>
        <ol class="points">
          <li><strong>Sharding</strong> splits a table’s rows across several primaries, called <strong>shards</strong>. Each one takes only its share of the writes, and holds only its share of the data.</li>
          <li><strong>A shard key decides where each row lives.</strong> Tomazon uses the customer: orders, carts, payments and addresses are almost always about one customer, so nearly every query stays on one shard.</li>
          <li><strong>Logical shards keep growth cheap.</strong> Customers are hashed into 64 logical shards, and a small <strong>shard map</strong> says which primary holds each one. Adding a fifth primary later moves a few logical shards, not most of the data.</li>
          <li><strong>The catalogue isn’t sharded.</strong> Everyone reads the same products, and replicas and caches already spread those reads. Products stay on the original primary.</li>
        </ol>

        <aside class="note tip">
          <h3>Tip: try everything else before sharding</h3>
          <ol class="points">
            <li>Sharding is a big change, and hard to undo. So first, try everything that keeps one database. Tomazon has done most of it already.</li>
          </ol>
          <table class="data">
            <thead><tr><th>Option</th><th>What it does</th><th>At Tomazon</th></tr></thead>
            <tbody>
              <tr><td>Faster queries</td><td>Adds missing indexes, rewrites slow queries, and keeps copies of data where it’s read, to save joins</td><td>Done (pages 3.3 and 5.1). Writes are already short, and every extra index makes each write slower</td></tr>
              <tr><td>A bigger server</td><td>More CPU, more RAM, faster disks</td><td>Already an r7g.8xlarge. It only buys time: there’s a largest instance, and backing up or restoring 2.5 TB already takes hours (page 4.2)</td></tr>
              <tr><td>Read replicas</td><td>Copies of the database that answer reads</td><td>Done, in Mumbai (page 5.2) and Frankfurt (chapter 11). Every write still goes to the primary</td></tr>
              <tr><td>Caching</td><td>Keeps often-read data in memory, so fewer reads reach the database</td><td>Done, with Redis (chapter 6). It takes reads, not writes</td></tr>
              <tr><td>Archiving</td><td>Moves old rows to cheaper storage: another database, or S3</td><td>Not yet. It would shrink the order tables and their backups, but every new order still goes to the one primary</td></tr>
              <tr><td>Connection pooling</td><td>Shares a few database connections between many app processes</td><td>Done, with PgBouncer (pages 3.3 and 4.4). It saves connections, not writes</td></tr>
            </tbody>
          </table>
          <ol class="points">
            <li><strong>None of them spreads the writes.</strong> Each one makes writes cheaper, takes reads away, or buys time. On launch day, every attempt to buy would still land on one primary.</li>
          </ol>
        </aside>

        <h2>The new architecture</h2>
        <ol class="points">
          <li><strong>Four order shards,</strong> orders-1 to orders-4, each a primary with its own replica, holding 16 logical shards each.</li>
          <li><strong>One router, in the core API.</strong> It picks the shard for every order query, so nothing else needs to know that shards exist.</li>
          <li><strong>Moved one logical shard at a time,</strong> while shoppers kept ordering: copy its rows, keep the copy up to date, then switch its row in the shard map.</li>
        </ol>
        <div class="widget wide" data-widget="shard-arch"></div>
        <table class="data">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr class="hl"><td>Writes at the 6 p.m. peak</td><td>4,000 a second, on one primary</td><td>About 1,000 a second on each of four</td></tr>
            <tr><td>Order data on each primary</td><td>2.5 TB</td><td>About 625 GB</td></tr>
          </tbody>
        </table>`
    }
  ]
};
