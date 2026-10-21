/* Chapter 13: Go global.
   Same conventions as the earlier chapters. One page: copying every database to four regions, with
   every write going to Mumbai, doesn't stretch. Each region gets a cell, and customers a home region. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[13] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 20 million users, and opens in Singapore and Ohio. With Mumbai and Frankfurt, that makes four regions.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why copying every database to every region doesn’t scale.</li>
        <li>Describe a regional cell, and how it gets only the data it needs.</li>
        <li>Place each customer’s data in their home region, and say what happens when a region is lost.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'four-regions',
      title: '20 million users, and four regions with one home',
      sub: 'Copying every database to every region, and sending every write to Mumbai, doesn’t stretch to four.',
      html: `
        <ol class="points lede">
          <li>The quickest way into Singapore and Ohio is chapter 11’s recipe, twice more: a cluster in each region, and a replica of every database.</li>
          <li>Within three months, that recipe shows its limits.</li>
        </ol>

        <h2>The bottleneck: every region depends on Mumbai</h2>
        <ol class="points">
          <li><strong>Every region holds everything.</strong> Each replica copies every table, so every shopper’s orders and addresses end up on every continent, where privacy law may not allow them.</li>
          <li><strong>Every write crosses the world.</strong> A shopper in Ohio waits for a round trip to Mumbai, about 200 ms, every time they change their cart.</li>
          <li><strong>Mumbai’s problems are everyone’s.</strong> A 40-minute network problem between Mumbai and Singapore left Singapore’s shoppers seeing old prices and stock the whole time.</li>
        </ol>

        <h2>Replicas help, but aren’t enough</h2>
        <ol class="points">
          <li>A replica works well far away, but it can’t choose what it copies: it replays every row of its primary.</li>
          <li>And it can’t take writes, so every region still sends them home to Mumbai.</li>
        </ol>

        <h2>Where cells and home regions help</h2>
        <ol class="points">
          <li><strong>A cell in every region.</strong> Each region runs its own complete shop: catalogue pods, Redis, a search index and its own read database. To serve a page, a cell never calls another region.</li>
          <li><strong>Fed only the catalogue.</strong> Debezium already publishes product changes to Kafka (chapter 8). MSK Replicator copies those topics to each region, and an applier writes them into the cell’s own database. No personal data leaves home.</li>
          <li><strong>A home region for every customer.</strong> The shard map (chapter 12) can place a logical shard on a primary in any region. Each customer’s data lives in the region they shop from, so their writes are local, and their personal data stays there.</li>
          <li><strong>Losing a region stays local.</strong> Every shard has a standby in another region. If a region is lost, browsing carries on everywhere, and only its own customers’ checkouts pause until the standby takes over.</li>
        </ol>

        <h2>The new architecture</h2>
        <ol class="points">
          <li><strong>Mumbai stays the catalogue’s home.</strong> Staff edit products there, and every cell receives the changes.</li>
          <li><strong>Frankfurt, Singapore and Ohio run the same cell,</strong> built from the same manifests (chapter 10). The diagram shows Frankfurt’s.</li>
        </ol>
        <div class="widget wide" data-widget="global-arch"></div>
        <table class="data">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr><td>What each region holds</td><td>A copy of everything, personal data included</td><td>The catalogue, and its own customers’ data</td></tr>
            <tr class="hl"><td>A shopper in Ohio changing their cart</td><td>About 200 ms, to Mumbai</td><td>Local, in Ohio</td></tr>
            <tr><td>A network problem with Mumbai</td><td>Old prices and stock in that region</td><td>Catalogue changes arrive late; everything else works</td></tr>
          </tbody>
        </table>`
    }
  ]
};
