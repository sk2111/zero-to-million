/* Chapter 9: Serve it nearby.
   Same conventions as the earlier chapters. Tomazon starts delivering abroad: pages are slow
   far from Mumbai, and the bill for sending photos keeps climbing. Both are fixed at the edge. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[9] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 3 million users, and starts delivering abroad: to the UAE, Singapore, the UK and the US.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain, in round trips, why distance makes pages slow.</li>
        <li>Explain how a CDN works: edges, hits, misses, and what belongs on it.</li>
        <li>Send fewer bytes, by making photos smaller.</li>
        <li>Work out what a CDN really saves, and what it doesn’t.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'far-away',
      title: 'Slow abroad, expensive at home',
      sub: 'Photos sent from Mumbai take seconds to reach New York, and every gigabyte is billed.',
      html: `
        <ol class="points lede">
          <li>A shopper in New York writes in: product pages take about 6 seconds to load, and the photos appear last. Shoppers in London say the same, a little less.</li>
          <li>The same month, the AWS bill shows about $8,800 for data sent from S3 to the internet: several times what the app servers cost.</li>
          <li>Chapter 2 said to move the photos behind a CDN before the traffic grew (page 2.2). Page 4.4 moved them to S3. The CDN never happened, and every browser fetches every photo straight from the bucket in Mumbai.</li>
        </ol>

        <h2>Distance is time</h2>
        <ol class="points">
          <li>Light in fibre covers about 200 km every millisecond, so every 100 km between the shopper and the server adds at least 1 ms to each round trip (page 1.8).</li>
          <li>Real round trips take longer still: cables don’t follow the shortest path, and every router on the way adds a little.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Shopper in</th><th>Distance from Mumbai</th><th>Light in fibre, there and back</th><th>A real round trip</th></tr></thead>
          <tbody>
            <tr><td>Bangalore</td><td>850 km</td><td>8.5 ms</td><td>about 20 ms</td></tr>
            <tr><td>Dubai</td><td>1,900 km</td><td>19 ms</td><td>about 35 ms</td></tr>
            <tr><td>Singapore</td><td>3,900 km</td><td>39 ms</td><td>about 60 ms</td></tr>
            <tr><td>London</td><td>7,200 km</td><td>72 ms</td><td>about 120 ms</td></tr>
            <tr><td>New York</td><td>12,500 km</td><td>125 ms</td><td>about 200 ms</td></tr>
          </tbody>
        </table>

        <h2>Why it costs so much</h2>
        <ol class="points">
          <li>AWS charges for every gigabyte sent from a region to the internet: from Mumbai, about $0.11 per GB for the first 10 TB a month, falling to about $0.08 at higher volumes.</li>
          <li>Tomazon now serves about 100 million product pages a month, at 1 MB of photos each: about 100 TB.</li>
          <li>That’s about $8,600 for the data, and about $200 more for 500 million S3 requests. Photos are almost every byte Tomazon sends.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Latency is set by distance and round trips.</strong> No code change makes light faster. Move the bytes
            closer, or make fewer round trips.</li>
            <li><strong>Every byte costs twice:</strong> in the shopper’s time, and in the egress bill. Heavy responses pay both.</li>
            <li><strong>Measure from where your users are.</strong> A dashboard in Mumbai says the site is fast. Real user
            monitoring, timings sent back from shoppers’ browsers, shows the p95 for each country.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>You can’t speed up light. Move the bytes closer to the shopper, and send fewer of them.</p>
        </aside>`
    },

    /* ============================================================== The CDN */
    {
      group: 'The CDN',
      slug: 'cdn',
      title: 'A CDN: copies near the shopper',
      sub: 'Hundreds of caches around the world, each keeping copies of what shoppers nearby ask for.',
      html: `
        <ol class="points lede">
          <li>A <strong>content delivery network</strong> (CDN) is a network of servers, called <strong>edge locations</strong>, in hundreds of cities. Each one keeps copies of files that shoppers near it have asked for, and serves them from there.</li>
          <li>The servers that hold the originals, here the S3 bucket in Mumbai, are called the <strong>origin</strong>.</li>
          <li>Amazon CloudFront has more than 700 edge locations in over 100 cities, including Mumbai, Delhi, Chennai, Hyderabad, Bengaluru and Kolkata. Akamai, Cloudflare and Fastly work the same way.</li>
        </ol>

        <h2>Hits and misses</h2>
        <ol class="steps">
          <li><strong>The shopper reaches a nearby edge.</strong> Photo links point at <code>img.tomazon.com</code>, an alias for the CDN. The CDN’s DNS answers with an edge near the shopper, so the connection and its handshakes stay local.</li>
          <li><strong>A hit.</strong> If the edge has a copy that hasn’t expired, it sends it at once. The origin never hears about it.</li>
          <li><strong>A miss.</strong> Otherwise the edge asks one of about a dozen <strong>regional edge caches</strong>, bigger caches shared by many edges, and only then the origin. It keeps the copy for the next shopper.</li>
          <li><strong>Copies are pulled, not pushed.</strong> An edge holds only what shoppers near it have asked for, and drops what nobody has asked for lately to make room.</li>
        </ol>
        <ol class="points">
          <li><strong>Even a miss is faster than going to Mumbai.</strong> The connection is set up over the short hop to the edge. The edge reaches the origin over AWS’s own network, on connections it keeps open, so a miss adds just one trip to Mumbai.</li>
        </ol>
        <p>Step through a product page from New York:</p>
        <div class="widget" data-widget="cdn-arch"></div>
        <p>And the whole of Tomazon, with shoppers in India and in New York:</p>
        <div class="widget" data-widget="cdn-full"></div>

        <h2>What belongs on a CDN</h2>
        <table class="data">
          <thead><tr><th>Content</th><th>The same for every shopper?</th><th>How often it changes</th><th>On the CDN?</th></tr></thead>
          <tbody>
            <tr><td>Product photos</td><td>Yes</td><td>Never: a changed photo gets a new name</td><td>Yes, cached for a year</td></tr>
            <tr><td>JavaScript, CSS and fonts</td><td>Yes</td><td>With each release, under a new name</td><td>Yes, cached for a year</td></tr>
            <tr><td>The home page</td><td>Yes, for shoppers who aren’t signed in</td><td>Every few minutes</td><td>Possible, for a minute or two. Not yet</td></tr>
            <tr><td>Prices and stock</td><td>Yes</td><td>By the second</td><td>No: they must be right at checkout</td></tr>
            <tr><td>Carts, orders and accounts</td><td>No: each shopper’s own</td><td>Constantly</td><td>Never</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A CDN is a cache.</strong> Everything from chapter 6 applies: what the key is, how long a copy lives, how to
            replace it, and the hit rate.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Put what’s the same for every shopper on the CDN, and keep anything personal off it.</p>
        </aside>`
    },

    /* ============================================================ Running it */
    {
      group: 'Running it',
      slug: 'cdn-results',
      title: 'What the CDN changed',
      sub: 'Much faster abroad. Cheaper too, but mostly for a different reason than you’d expect.',
      html: `
        <ol class="points lede">
          <li>A month later, product pages are faster everywhere, and the photo bill is a sixth of what it was.</li>
          <li>The speed came from the CDN. Most of the saving didn’t.</li>
        </ol>

        <h2>Faster</h2>
        <ol class="points">
          <li><strong>New York:</strong> photos now arrive in about 60 ms from a nearby edge, instead of about 1.8 s from Mumbai. The whole page drops from about 6 s to about 2 s.</li>
          <li><strong>What’s left</strong> is mostly the API, which still runs in Mumbai (chapter 11).</li>
          <li><strong>India gains less,</strong> because Mumbai is already close. There, the CDN mainly takes load off the origin.</li>
        </ol>

        <h2>Cheaper, but not because of the CDN</h2>
        <table class="data">
          <thead><tr><th>Setup</th><th>About, a month</th></tr></thead>
          <tbody>
            <tr><td>Before: photos straight from S3 in Mumbai</td><td>$8,800</td></tr>
            <tr><td>Through the CDN, the same photos</td><td>$9,100</td></tr>
            <tr><td>Through the CDN, smaller photos</td><td>$2,100</td></tr>
            <tr class="hl"><td>Smaller photos, on a flat-rate CDN plan</td><td>$1,450</td></tr>
          </tbody>
        </table>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Changing a photo under the same name</td><td>Shoppers keep seeing the old one until it expires</td><td>Give every new version a new name</td></tr>
            <tr><td>Caching something personal</td><td>One shopper’s cart is shown to others</td><td>Cache only what’s the same for everyone</td></tr>
            <tr><td>Leaving the bucket public</td><td>Bots fetch from S3 directly, at full price</td><td>Make it private, so only CloudFront can read it</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Photos</td><td>A private S3 bucket behind CloudFront, at <code>img.tomazon.com</code></td></tr>
            <tr><td>Smaller photos</td><td>Small WebP copies, made when a photo is uploaded</td></tr>
            <tr><td>Caching</td><td>A new name for every version of a photo, cached for a year</td></tr>
            <tr><td>The API</td><td>Still in Mumbai, for now</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Tomazon now runs many kinds of program: the core API, the catalogue service, the cache invalidators, the search indexer, the email sender and the photo resizer. Each is set up and deployed by hand.</li>        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A CDN cuts latency; it doesn’t always cut cost.</strong> Check the price per GB where your users are.</li>
            <li><strong>The cheapest byte is the one you don’t send.</strong> Smaller photos saved more than the CDN did.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Serve the same bytes from near the shopper, and send as few as you can.</p>
        </aside>`
    }
  ]
};
