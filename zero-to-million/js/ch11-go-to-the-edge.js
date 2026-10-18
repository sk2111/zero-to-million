/* Chapter 11: Go to the edge.
   Same conventions as the earlier chapters. Tomazon launches in Europe; pages are slow there
   although every server is fast. The time is in round trips to Mumbai, so the work moves closer. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[11] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 7 million users, and opens in Europe, with a warehouse near Amsterdam. Within a month, European shoppers are a tenth of the traffic.</li>
      <li>They find Tomazon slow. Photos arrive fast, from CloudFront (chapter 9), but every page and every API call still crosses to Mumbai and back.</li>
      <li>This chapter finds where the time goes, then moves the work closer to the shopper, step by step: the connection, the cached pages, small pieces of code, and finally the reads themselves.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Split a page’s load time into processing time and network time.</li>
        <li>Count the round trips before a page’s first byte, and use time to first byte to find a distance problem.</li>
        <li>Choose what to move to the edge: connections, cached pages, or small functions.</li>
        <li>Add a second region for reads, while writes stay in one place.</li>
        <li>Name the traps: stale copies, personal data in caches, and data crossing borders.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'slow-in-europe',
      title: 'Slow in Europe, fast at home',
      sub: 'Every server is healthy, yet the same page is twice as slow in Frankfurt. Where does the time go?',
      html: `
        <ol class="points lede">
          <li>European shoppers leave product pages far more often than Indian shoppers do, and fewer of them reach checkout.</li>
          <li>The servers aren’t the reason. The app takes about 50 ms to build a product page, wherever the shopper is.</li>
          <li>The first theory is the third-party scripts: analytics, the chat widget and marketing tags. They do slow pages down. But do they slow Europe down more?</li>
        </ol>

        <h2>Change one thing at a time</h2>
        <ol class="points">
          <li>To test the theory, the team loads the same product page, with the same scripts, from two test machines: one in Bangalore, one in Frankfurt. Only the shopper’s location changes.</li>
        </ol>
        <table class="data">
          <thead><tr><th></th><th>From Bangalore</th><th>From Frankfurt</th></tr></thead>
          <tbody>
            <tr><td>Time to first byte of the page</td><td>0.12 s</td><td>0.44 s</td></tr>
            <tr><td>Third-party scripts</td><td>0.6 s</td><td>0.6 s</td></tr>
            <tr><td>Ready for “Add to cart”</td><td>1.6 s</td><td>2.5 s</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>The scripts cost the same in both places.</strong> They come from their vendors’ own CDNs, near each tester. They slow every page, but they don’t explain Europe.</li>
          <li><strong>The difference is all distance.</strong> The page crosses to Mumbai about 8 times in a row before it’s usable: 3 times for the page itself, then 5 API calls, each waiting for the one before. From Frankfurt each crossing takes 105 ms longer than from Bangalore: about 0.85 s more in all.</li>
        </ol>

        <h2>Processing time and network time</h2>
        <ol class="points">
          <li>Any response takes <strong>processing time</strong>, the server thinking and building it, and <strong>network time</strong>, the request and the answer crossing the network.</li>
          <li>Chapters 3 to 10 cut processing time: pooling, replicas, caches, more servers. None of that touches network time, which is set by distance (page 9.1).</li>
          <li>A round trip between Frankfurt and Mumbai takes about 125 ms. Light in fibre alone would need about 63 ms for the 6,300 km there and back; real cables are longer, and routers add time.</li>
        </ol>

        <h2>The round trips before the first byte</h2>
        <table class="data">
          <thead><tr><th>Step</th><th>Round trips to the server</th><th>From Frankfurt</th></tr></thead>
          <tbody>
            <tr><td>DNS: find the address</td><td>None, usually: a resolver near the shopper answers, often from its cache</td><td>about 10 ms</td></tr>
            <tr><td>TCP: open a connection</td><td>1</td><td>125 ms</td></tr>
            <tr><td>TLS: agree on encryption</td><td>1 with TLS 1.3; 2 with the older TLS 1.2</td><td>125 ms</td></tr>
            <tr><td>The request, and the first byte back</td><td>1, plus the app’s own time</td><td>125 + 50 ms</td></tr>
            <tr class="hl"><td>Time to first byte, first visit</td><td>3</td><td>about 435 ms</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>Time to first byte (TTFB)</strong> is the time from asking for the page to the first byte of its HTML arriving. It comes before any image, script or style, so third-party content can’t inflate it.</li>
          <li>A high TTFB can mean a slow server or a long way. Measure it from two places: if it grows with distance while the server’s own time stays the same, the problem is the network.</li>
          <li>The app can report its own time in a <code>Server-Timing: app;dur=48</code> header. Browser developer tools then show the server’s 48 ms apart from the network’s share.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Separate processing time from network time</strong> before optimising either. A faster server can’t
            shorten a 125 ms round trip.</li>
            <li><strong>Test from where your users are, changing one thing at a time.</strong> Synthetic tests from several cities,
            and real-user timings by country, turn opinions into evidence.</li>
            <li><strong>Count the round trips in a row.</strong> Requests that wait for each other multiply the distance; requests
            made in parallel don’t.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>If the time to first byte grows with distance while the server’s time doesn’t, move the work closer.</p>
        </aside>`
    },

    /* ================================================ Closer to the shopper */
    {
      group: 'Closer to the shopper',
      slug: 'the-edge',
      title: 'Do more at the edge',
      sub: 'End connections near the shopper, cache whole pages there, and run small decisions there too.',
      html: `
        <ol class="points lede">
          <li><strong>Edge computing</strong> means doing work at locations close to the user, instead of only in a central region.</li>
          <li>The edge locations already serve Tomazon’s photos (chapter 9). They can do more, in steps, from cheapest to hardest: end the connection, cache whole pages, and run small pieces of code.</li>
        </ol>

        <h2>1. End the connection at the edge</h2>
        <ol class="points">
          <li>Put CloudFront in front of <code>tomazon.com</code> itself, not just the photos. The shopper’s TCP and TLS handshakes then happen with an edge about 10 ms away.</li>
          <li>The edge keeps connections to Mumbai open, across AWS’s own network, so only the request itself crosses. Two of the three long round trips disappear.</li>
          <li>API requests pass through uncached, with the managed <code>CachingDisabled</code> policy, and every cookie, header and query string goes to the app.</li>
          <li>The edge also speaks HTTP/3 to the shopper. It sets up the connection and its encryption in a single round trip, and copes better with lossy mobile networks.</li>
        </ol>

        <h2>2. Cache whole pages at the edge</h2>
        <ol class="points">
          <li>Most of a product page is the same for every shopper: the name, the description, the photos, the reviews. Only the price, the stock and the cart change often or differ by shopper.</li>
          <li>So the page’s HTML no longer contains anything personal. The shopper’s name and cart count come from an API call after the page loads, and so do the price and stock.</li>
          <li>Now the HTML can be cached: <code>Cache-Control: public, max-age=60, stale-while-revalidate=300</code>. An edge serves it for 60 seconds; for 5 minutes after that, it serves the old copy at once while it fetches a fresh one in the background.</li>
          <li>A cached page’s first byte arrives in about 40 ms, in Frankfurt or anywhere else.</li>
        </ol>
        <p>Compare the four setups, by city and protocol:</p>
        <div class="widget" data-widget="ttfb-budget"></div>

        <h2>3. Run small decisions at the edge</h2>
        <table class="data">
          <thead><tr><th></th><th>CloudFront Functions</th><th>Lambda@Edge</th></tr></thead>
          <tbody>
            <tr><td>Runs in</td><td>Every edge location</td><td>The regional edge caches</td></tr>
            <tr><td>Language</td><td>JavaScript, in a small, fast runtime</td><td>Node.js or Python</td></tr>
            <tr><td>Time allowed</td><td>Under a millisecond of work</td><td>Up to 5 s for requests from shoppers, 30 s for requests to the origin</td></tr>
            <tr><td>Network calls</td><td>None</td><td>Allowed</td></tr>
            <tr><td>Good for</td><td>Redirects, header changes, tidying the cache key, A/B buckets, checking a signed token</td><td>Larger rewrites, and decisions that need another service</td></tr>
          </tbody>
        </table>
        <figure class="term">
          <figcaption>A CloudFront Function: tracking tags shouldn’t split the cache</figcaption>
<pre><span class="o">function handler(event) {
  var req = event.request, kept = {};
  for (var name in req.querystring) {
    if (name.indexOf('utm_') !== 0 &amp;&amp; name !== 'gclid' &amp;&amp; name !== 'fbclid') {
      kept[name] = req.querystring[name];
    }
  }
  req.querystring = kept;            </span><span class="c">// /products/1042?utm_source=mail is now /products/1042</span><span class="o">
  return req;
}</span></pre>
          <ol class="points term-note">
            <li>Every ad campaign adds its own <code>utm_</code> tags, so without this each link would be a separate cache entry, and almost every visit a miss.</li>
            <li>Analytics still sees the tags: they stay in the address bar, where the scripts read them. Only the cache and the app stop seeing them.</li>
          </ol>
        </figure>
        <ol class="points">
          <li><strong>Edge code without edge data is a long round trip with extra steps.</strong> A function that asks the database in Mumbai crosses the world anyway. Keep edge code to decisions it can make on its own.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>End connections near the user.</strong> It’s the cheapest edge win: no code changes, and two long round
            trips fewer on every new connection.</li>
            <li><strong>Make pages cacheable by moving the personal parts out.</strong> A page that’s the same for everyone can be
            served from every edge; a page with one shopper’s name in it can’t be shared.</li>
            <li><strong>Lock the origin to the CDN.</strong> Let the load balancer accept only CloudFront, using AWS’s managed list
            of CloudFront’s addresses and a secret header, so nobody can go around the edge.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Handshakes and shared pages belong at the edge. Decisions that need your data don’t.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Closer to the shopper',
      slug: 'second-region',
      title: 'A second region for Europe',
      sub: 'Reads from a copy in Frankfurt; writes still go home to Mumbai.',
      html: `
        <ol class="points lede">
          <li>The edge fixed the first byte. But the page then asks for prices, stock, delivery estimates and search results, and none of those can be cached for long.</li>
          <li>Each of those calls still crosses to Mumbai. To shorten them, the app and a copy of its data have to be in Europe too.</li>
        </ol>

        <h2>Read nearby, write at home</h2>
        <ol class="points">
          <li><strong>A second region.</strong> Tomazon runs a second EKS cluster in Frankfurt (eu-central-1), with the catalogue service and search. With everything already in manifests, that’s the same files applied to a new cluster (chapter 10).</li>
          <li><strong>A copy of the data.</strong> A PostgreSQL replica in Frankfurt streams the primary’s WAL from Mumbai, like the replicas of page 5.2, only farther. Frankfurt gets its own Redis.</li>
          <li><strong>Reads go to the nearest region.</strong> The read paths point at one origin name with Route 53 latency records for both regions. Each edge resolves it to whichever region is closer, and if Frankfurt fails its health check, edges fall back to Mumbai.</li>
          <li><strong>Writes go home.</strong> Carts, orders, payments and accounts change data, so CloudFront sends those paths straight to Mumbai, where the only primary is. One long round trip, at moments when shoppers expect to wait a little.</li>
        </ol>
        <p>Follow one shopper in Frankfurt:</p>
        <div class="widget" data-widget="edge-regions"></div>

        <h2>Keeping the copy honest</h2>
        <ol class="points">
          <li><strong>Replication is asynchronous.</strong> Waiting for Frankfurt to confirm would add 125 ms to every commit in Mumbai, PACELC’s trade-off from page 5.3. The replica is usually under a second behind, more during write bursts.</li>
          <li><strong>Read your own writes from Mumbai.</strong> A shopper who has just changed their address could see the old one from the Frankfurt replica. As in page 5.4, a short-lived cookie sends their reads to Mumbai for a few seconds after a write.</li>
          <li><strong>Invalidate after the replica has caught up.</strong> A Frankfurt copy of the cache invalidator reads the same Kafka topic, with its own consumer group (page 8.3). Each Debezium message carries the change’s WAL position, so the invalidator waits until the Frankfurt replica has replayed that far (<code>pg_last_wal_replay_lsn()</code>) before deleting the keys. Otherwise the next miss could cache the old price again.</li>
          <li><strong>Data can’t always cross borders freely.</strong> Europe’s GDPR governs European shoppers’ personal data, and India’s DPDP Act governs Indian shoppers’. Decide with your lawyers which personal data may be copied to which region, before you copy it.</li>
        </ol>

        <h2>What changed for a shopper in Frankfurt</h2>
        <table class="data">
          <thead><tr><th></th><th>Before</th><th>After</th></tr></thead>
          <tbody>
            <tr><td>Time to first byte, product page</td><td>0.44 s</td><td>0.04 s, cached at the edge</td></tr>
            <tr><td>Price and stock</td><td>0.18 s</td><td>0.06 s, from Frankfurt</td></tr>
            <tr><td>Add to cart</td><td>0.18 s</td><td>0.19 s: still one trip to Mumbai</td></tr>
            <tr class="hl"><td>Ready for “Add to cart”</td><td>2.5 s</td><td>1.5 s, about as fast as in Bangalore</td></tr>
          </tbody>
        </table>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Something personal in a cached page</td><td>One shopper’s name or cart is shown to everyone near that edge</td><td>Keep cached HTML identical for everyone; never cache a response that sets a cookie</td></tr>
            <tr><td>An origin open to the internet</td><td>Bots and old links go around the edge, its caching and its protection</td><td>Accept only CloudFront’s addresses, plus a secret header</td></tr>
            <tr><td>The shopper’s address hidden</td><td>The load balancer sees CloudFront, so rate limits and fraud checks see one address for thousands of shoppers</td><td>Use the viewer address CloudFront passes on, and trust it only from CloudFront</td></tr>
            <tr><td>Edge code that calls Mumbai</td><td>Every request pays the long round trip it was meant to save</td><td>Edge code decides on its own; data calls go to the nearest region</td></tr>
            <tr><td>Reading your own write from far away</td><td>A shopper’s change seems to vanish for a second</td><td>Read from Mumbai for a few seconds after a write</td></tr>
            <tr><td>A cache filled from a lagging replica</td><td>Frankfurt keeps an old price for a full TTL</td><td>Delete keys only once the replica has replayed the change</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>The front door</td><td>CloudFront in front of <code>tomazon.com</code>, with HTTP/3; the load balancers accept only CloudFront</td></tr>
            <tr><td>Pages</td><td>Product and home pages with nothing personal in them, cached for 60 s with <code>stale-while-revalidate</code></td></tr>
            <tr><td>Edge code</td><td>CloudFront Functions to tidy cache keys and redirect; no edge code that needs data</td></tr>
            <tr><td>Reads</td><td>Catalogue and search in Mumbai and Frankfurt, chosen by Route 53 latency records, with a PostgreSQL replica and Redis in each</td></tr>
            <tr><td>Writes</td><td>Carts, orders, payments and accounts, always to Mumbai</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Reads are now local on two continents. Writes aren’t: every cart change, order and payment, from India and from Europe, lands on one PostgreSQL primary in Mumbai.</li>
          <li>Replicas spread the reads, but not the writes. The primary’s write load and its disk keep growing, and a bigger instance buys time, not a solution.</li>
          <li>Chapter 12 splits the data itself across several primaries.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Move reads before writes.</strong> Copies of data for reading are a solved problem; several places that
            accept writes to the same data are a much harder one.</li>
            <li><strong>Every copy far away is a stale copy.</strong> Everything chapter 5 said about lag applies, with bigger
            numbers.</li>
            <li><strong>Where data may live is a design constraint.</strong> Privacy law can decide your architecture as firmly as
            latency does.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Cache what you can at the edge, read the rest nearby, and send writes home.</p>
        </aside>`
    }
  ]
};
