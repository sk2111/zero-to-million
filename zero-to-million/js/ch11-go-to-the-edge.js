/* Chapter 11: Go to the edge.
   Same conventions as the earlier chapters. One page: Tomazon opens in Europe and pages are slow there,
   although every server is fast. The CDN already has the photos; the pages and reads move closer too. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[11] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 7 million users and opens in Europe. European shoppers find it slow, although every server is fast.</li>
      <li>This chapter finds where the time goes, and moves the work closer to them.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Tell server time from network time, by testing from two places.</li>
        <li>Explain what moving work to the edge saves, and what it can’t.</li>
        <li>Add a second region for reads, while writes stay in one place.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'edge',
      title: '7 million users, and Europe finds Tomazon slow',
      sub: 'Every server is fast. The time goes in crossing to Mumbai and back.',
      html: `
        <ol class="points lede">
          <li>Tomazon opens in Europe, with a warehouse near Amsterdam. Within a month, European shoppers are a tenth of the traffic.</li>
          <li>They find Tomazon slow, and fewer of them reach checkout.</li>
        </ol>

        <h2>The bottleneck: distance</h2>
        <ol class="points">
          <li>The team loads the same product page from two test machines, one in Bangalore and one in Frankfurt. Only the place changes.</li>
        </ol>
        <table class="data">
          <thead><tr><th></th><th>From Bangalore</th><th>From Frankfurt</th></tr></thead>
          <tbody>
            <tr><td>Time to first byte of the page</td><td>0.12 s</td><td>0.44 s</td></tr>
            <tr><td>Ready for “Add to cart”</td><td>1.6 s</td><td>2.5 s</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>The servers aren’t the reason.</strong> The app builds the page in about 50 ms, wherever the shopper is.</li>
          <li><strong>The network is.</strong> A round trip from Frankfurt to Mumbai takes about 125 ms, and the page crosses about 8 times in a row before it’s usable: 3 times for the page itself (connect, agree on encryption, ask), then 5 API calls, each waiting for the one before.</li>
        </ol>

        <h2>The CDN helps, but isn’t enough</h2>
        <ol class="points">
          <li>The photos already come from a CloudFront edge near each shopper (chapter 9).</li>
          <li>But the page itself, and every API call, still go to Mumbai. A faster server can’t shorten a 125 ms round trip.</li>
        </ol>

        <h2>Where the edge helps</h2>
        <ol class="points">
          <li><strong>Edge computing</strong> means doing work at locations close to the shopper, instead of only in one region.</li>
          <li><strong>End the connection at the edge.</strong> CloudFront now sits in front of <code>tomazon.com</code> itself, not just the photos. The shopper connects to an edge about 10 ms away, and the edge keeps its connections to Mumbai open. Two of the three long round trips go.</li>
          <li><strong>Cache whole pages at the edge.</strong> The personal parts of a product page, the shopper’s name and cart, and the fast-changing price and stock, now load after the page. The page is then the same for everyone, so an edge keeps it for 60 seconds, and its first byte arrives in about 40 ms.</li>
          <li><strong>Not everything can be cached.</strong> Prices, stock and search results change by the second. Code at the edge that asks Mumbai for them pays the long trip anyway. For those, the app and its data have to be in Europe too.</li>
        </ol>

        <h2>The new architecture</h2>
        <ol class="points">
          <li><strong>A second region, for reads.</strong> Frankfurt gets its own EKS cluster with the catalogue and search (the same manifests, applied again: chapter 10), its own Redis, and a PostgreSQL replica that streams from the primary in Mumbai (page 5.2).</li>
          <li><strong>Reads go to the nearest region.</strong> Each CloudFront edge sends price, stock and search requests to whichever region is closer.</li>
          <li><strong>Writes go home.</strong> Carts, orders, payments and accounts go to Mumbai, where the only primary is: one long round trip, at moments when shoppers expect to wait a little.</li>
          <li><strong>The copy is a little behind.</strong> Right after a shopper changes something, their reads go to Mumbai for a few seconds, so they see their own change (page 5.4).</li>
        </ol>
        <div class="widget" data-widget="edge-regions"></div>
        <table class="data">
          <thead><tr><th>For a shopper in Frankfurt</th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr><td>First byte of a product page</td><td>0.44 s</td><td>0.04 s, from the edge</td></tr>
            <tr><td>Price and stock</td><td>0.18 s</td><td>0.06 s, from Frankfurt</td></tr>
            <tr><td>Add to cart</td><td>0.18 s</td><td>0.19 s, still in Mumbai</td></tr>
            <tr class="hl"><td>Ready for “Add to cart”</td><td>2.5 s</td><td>1.5 s, about as fast as in Bangalore</td></tr>
          </tbody>
        </table>`
    }
  ]
};
