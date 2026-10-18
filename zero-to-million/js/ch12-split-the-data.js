/* Chapter 12: Split the data.
   Same conventions as the earlier chapters. One page: a phone launch shows that every write still lands
   on one primary. Replicas and caches can't help; the orders are sharded by customer. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[12] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 10 million users, and a phone brand picks it for the exclusive launch of its new phone.</li>
      <li>Reads are spread across replicas, caches and two regions. Every write still lands on one PostgreSQL primary in Mumbai. This chapter splits the data across several primaries: sharding.</li>
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
          <li>The phone brand plans to sell 200,000 phones at noon, with about 5 million shoppers waiting. In the first minute, that could be 20,000 attempts to buy every second.</li>
          <li>Tomazon’s busiest moment so far, the 8 p.m. sale, brought about 150 orders a second.</li>
        </ol>

        <h2>The bottleneck: one primary</h2>
        <ol class="points">
          <li>Every order, payment, cart change and account update is written to one PostgreSQL primary in Mumbai: an r7g.8xlarge, with 32 vCPUs.</li>
          <li>At the 8 p.m. peak it already writes about 4,000 rows a second, at 60% CPU. Its order tables hold 2.5 TB, and grow by about 100 GB a month.</li>
        </ol>

        <h2>Replicas and caches help, but aren’t enough</h2>
        <ol class="points">
          <li>Replicas, Redis and the Frankfurt region took the reads away (chapters 5, 6 and 11). None of them can take a write.</li>
          <li>A bigger server only buys time. There’s a largest instance, and backing up or restoring 2.5 TB already takes hours.</li>
        </ol>

        <h2>Where sharding helps</h2>
        <ol class="points">
          <li><strong>Sharding</strong> splits a table’s rows across several primaries, called <strong>shards</strong>. Each one takes only its share of the writes, and holds only its share of the data.</li>
          <li><strong>A shard key decides where each row lives.</strong> Tomazon uses the customer: orders, carts, payments and addresses are almost always about one customer, so nearly every query stays on one shard.</li>
          <li><strong>Logical shards keep growth cheap.</strong> Customers are hashed into 64 logical shards, and a small <strong>shard map</strong> says which primary holds each one. Adding a fifth primary later moves a few logical shards, not most of the data.</li>
          <li><strong>The catalogue isn’t sharded.</strong> Everyone reads the same products, and replicas and caches already spread those reads. Products stay on the original primary.</li>        </ol>

        <h2>The new architecture</h2>
        <ol class="points">
          <li><strong>Four order shards,</strong> orders-1 to orders-4, each a primary with its own replica, holding 16 logical shards each.</li>
          <li><strong>One router, in the core API.</strong> It picks the shard for every order query, so nothing else needs to know that shards exist.</li>
          <li><strong>Moved one logical shard at a time,</strong> while shoppers kept ordering: copy its rows, keep the copy up to date, then switch its row in the shard map.</li>
        </ol>
        <div class="widget" data-widget="shard-arch"></div>
        <table class="data">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr class="hl"><td>Writes at the 8 p.m. peak</td><td>4,000 a second, on one primary</td><td>About 1,000 a second on each of four</td></tr>
            <tr><td>Order data on each primary</td><td>2.5 TB</td><td>About 625 GB</td></tr>
          </tbody>
        </table>`
    }
  ]
};
