/* Chapter 9: Serve it nearby.
   Same conventions as the earlier chapters. Tomazon starts delivering abroad: pages are slow
   far from Mumbai, and the bill for sending photos keeps climbing. Both are fixed at the edge. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[9] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 3 million users, and starts delivering abroad: to the UAE, Singapore, the UK and the US.</li>
      <li>Its first shoppers abroad say product pages crawl. At the same time, sending data to the internet has become one of the biggest lines on the AWS bill.</li>
      <li>Both have the same cause: every photo travels from Mumbai, to every shopper, every time. This chapter moves the photos close to the shoppers, and sends fewer bytes.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain, in round trips, why distance makes pages slow.</li>
        <li>Explain how a CDN works: edges, hits, misses, and what belongs on it.</li>
        <li>Put CloudFront in front of a private S3 bucket.</li>
        <li>Name files so they can be cached for a year, and make photos smaller.</li>
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
          <li>Chapter 2 said to move the photos behind a CDN before the traffic grew (page 2.2). Chapter 4 moved them to S3. The CDN never happened, and every browser fetches every photo straight from the bucket in Mumbai.</li>
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

        <h2>Why one page of photos needs many round trips</h2>
        <ol class="points">
          <li><strong>Connecting costs two.</strong> The photos live on another host, S3, so the browser opens a new connection: one round trip for TCP, one for TLS (page 1.8).</li>
          <li><strong>Sending costs more.</strong> TCP doesn’t know how fast the path is, so it starts with about 10 packets, roughly 14 KB, and doubles that every round trip. This is called <strong>slow start</strong>. A product page’s five 200 KB photos, 1 MB in all, need 7 round trips to get through.</li>
          <li><strong>So distance multiplies.</strong> 9 round trips take 0.2 s from Bangalore, and 1.8 s from New York, however fast the shopper’s connection is. Bandwidth barely matters; round trips do.</li>
        </ol>
        <p>Try it for each city:</p>
        <div class="widget" data-widget="edge-latency"></div>

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
          <li><strong>Even a miss is faster than going to Mumbai.</strong> The handshakes and slow start happen over the short hop to the edge. The edge reaches the origin over AWS’s own network, on connections it keeps open, so a miss adds about one round trip to Mumbai, not nine.</li>
        </ol>
        <p>Step through a product page from New York:</p>
        <div class="widget" data-widget="cdn-arch"></div>

        <h2>What belongs on a CDN</h2>
        <table class="data">
          <thead><tr><th>Content</th><th>The same for every shopper?</th><th>How often it changes</th><th>On the CDN?</th></tr></thead>
          <tbody>
            <tr><td>Product photos</td><td>Yes</td><td>Never, under one name (page 9.3)</td><td>Yes, cached for a year</td></tr>
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
            <li><strong>Each edge has its own hit rate.</strong> With thousands of photos and hundreds of edges, a quiet edge misses
            often. Regional edge caches, and Origin Shield, one more shared layer in front of the origin, catch most of those misses.</li>
            <li><strong>Never cache anything personal.</strong> One cached cart or account page can be shown to every shopper near
            that edge.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Put what’s the same for every shopper on the CDN, and keep anything personal off it.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'The CDN',
      slug: 'cloudfront',
      title: 'Photos through CloudFront',
      sub: 'A private bucket, a distribution in front of it, names that never change, and smaller photos.',
      html: `
        <ol class="points lede">
          <li>The photos are already in S3. Four changes put them on the CDN and make them light.</li>
        </ol>

        <h2>1. A private bucket, readable only by CloudFront</h2>
        <ol class="points">
          <li>Turn on S3’s Block Public Access for <code>tomazon-photos</code>, so nobody can fetch from the bucket directly and run up its egress bill.</li>
          <li>Give the distribution an <strong>origin access control</strong>, and let the bucket policy allow only that distribution to read.</li>
        </ol>
        <figure class="term">
          <figcaption>The bucket policy: only this CloudFront distribution may read photos</figcaption>
<pre><span class="o">{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "cloudfront.amazonaws.com" },
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::tomazon-photos/*",
    "Condition": { "StringEquals": {
      "AWS:SourceArn": "arn:aws:cloudfront::111122223333:distribution/EDFDVBD6EXAMPLE"
    } }
  }]
}</span></pre>
        </figure>

        <h2>2. The distribution</h2>
        <p>A CloudFront <strong>distribution</strong> is one CDN setup: where the originals are, and how to cache them.</p>
        <table class="data">
          <thead><tr><th>Setting</th><th>Tomazon’s choice</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Origin</td><td>The <code>tomazon-photos</code> bucket, with the origin access control</td><td>Only CloudFront can read the photos</td></tr>
            <tr><td>Domain</td><td><code>img.tomazon.com</code>, with a certificate from AWS Certificate Manager in us-east-1</td><td>CloudFront reads certificates only from that region, wherever the origin is</td></tr>
            <tr><td>DNS</td><td>A Route 53 alias record from <code>img.tomazon.com</code> to the distribution</td><td>Shoppers see Tomazon’s name, not CloudFront’s</td></tr>
            <tr><td>Cache policy</td><td><code>CachingOptimized</code>, a managed policy</td><td>Follows each file’s own <code>Cache-Control</code>, up to a year, and keeps cookies and query strings out of the cache key</td></tr>
            <tr><td>Protocols</td><td>HTTPS only, with HTTP/2 and HTTP/3</td><td>Plain HTTP is redirected</td></tr>
            <tr><td>Price class</td><td>All edge locations</td><td>The shoppers abroad are the point</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>The app’s JavaScript, CSS and fonts move to the same bucket, under <code>static/</code>, and are served the same way.</li>
        </ol>

        <h2>3. Names that never change</h2>
        <ol class="points">
          <li>Never overwrite a photo. Each version gets a new name, made from a hash of its content, such as <code>p/1042/a3f9c1e2-800.webp</code>. Replacing a photo means uploading a new file, and pointing the product at its new name.</li>
          <li>A file whose name changes whenever its content does can be cached for a year, by the CDN and by the shopper’s browser: <code>Cache-Control: public, max-age=31536000, immutable</code>.</li>
          <li>Nothing ever has to be removed from the CDN. The old copies simply stop being asked for.</li>
          <li>CloudFront can remove copies on request, an <strong>invalidation</strong>: the first 1,000 paths a month are free, then $0.005 a path, and it takes from seconds to minutes. Keep it for emergencies, not for every change.</li>
        </ol>
        <figure class="term">
          <figcaption>A photo, fetched through the CDN from New York</figcaption>
<pre><span class="o">$ curl -sI https://img.tomazon.com/p/1042/a3f9c1e2-800.webp
HTTP/2 200
content-type: image/webp
content-length: 81244
cache-control: public, max-age=31536000, immutable
x-cache: Hit from cloudfront
x-amz-cf-pop: JFK50-P3
age: 51240</span></pre>
          <ol class="points term-note">
            <li><code>x-cache: Hit from cloudfront</code>: the edge had a copy. On a miss, it says <code>Miss from cloudfront</code>.</li>
            <li><code>x-amz-cf-pop</code> names the edge location that answered; JFK is New York.</li>
            <li><code>age</code> is how long, in seconds, the edge has held this copy: here about 14 hours.</li>
          </ol>
        </figure>

        <h2>4. Send fewer bytes</h2>
        <ol class="points">
          <li>The product page loaded five full-size 200 KB JPEGs, though it shows one large photo and four small thumbnails.</li>
          <li>Resizing is a job, so it goes on a queue (page 8.2). When a photo is uploaded, S3 sends an event to an SQS queue, and a resize worker makes 300 px, 800 px and 1,600 px versions in WebP, saves them under their new names, and records them on the product.</li>
          <li>WebP files are typically 25–35% smaller than JPEGs of the same quality, and every current browser shows them.</li>
          <li>The product page now loads one 800 px photo of about 80 KB and four 300 px thumbnails of about 15 KB: about 140 KB instead of 1 MB. The 1,600 px version loads only when a shopper zooms in.</li>
          <li>Staff upload straight to a separate, private bucket, using a short-lived link from the API, so large uploads never pass through the app servers.</li>
        </ol>
        <figure class="term">
          <figcaption>A short-lived upload link, from the admin API</figcaption>
<pre><span class="o">@app.post("/admin/products/{product_id}/photos")
async def start_upload(product_id: int):
    key = f"{product_id}/{uuid4()}.jpg"
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": "tomazon-uploads", "Key": key, "ContentType": "image/jpeg"},
        ExpiresIn=300,                                </span><span class="c"># valid for 5 minutes</span><span class="o">
    )
    return {"upload_url": url}</span></pre>
          <ol class="points term-note">
            <li>The browser sends the file straight to S3 with a <code>PUT</code> to that link. The upload then starts the resize job.</li>
            <li>Originals stay in <code>tomazon-uploads</code>, which CloudFront can’t read. Shoppers only ever see the resized copies.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Version names instead of invalidating.</strong> A file that never changes under its name can be cached
            everywhere, for as long as you like.</li>
            <li><strong>Do the heavy work once, when the data arrives.</strong> Resizing on upload costs one job per photo;
            resizing per view costs it millions of times.</li>
            <li><strong>Keep the origin private.</strong> A public bucket behind a CDN still gets fetched directly, by bots and old
            links, at full price.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Give every file a name that changes when its content does, and cache it for a year.</p>
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
          <li><strong>New York:</strong> a product page’s photos now take about 60 ms from the edge, instead of about 1.8 s from Mumbai. The whole page drops from about 6 s to about 2 s.</li>
          <li><strong>What’s left</strong> is mostly the API: prices, stock and the cart still come from Mumbai, at 200 ms a round trip. Serving those from closer needs servers in more regions (chapter 11).</li>
          <li><strong>India gains less time,</strong> because Mumbai is already close. There the CDN’s main gift is load: the origin hardly sees photo traffic any more.</li>
          <li><strong>Watch the hit rate.</strong> CloudFront reports it for each distribution. For photos with year-long names, aim for 95% or more; lower means the cache key is too wide, or quiet edges keep missing. Origin Shield, which costs $0.009 per 10,000 requests in India, collapses those misses into one request to S3.</li>
        </ol>

        <h2>Cheaper, but not because of the CDN</h2>
        <table class="data">
          <thead><tr><th>Setup</th><th>Sent a month</th><th>About, a month</th></tr></thead>
          <tbody>
            <tr><td>Before: photos straight from S3 in Mumbai</td><td>100 TB</td><td>$8,800</td></tr>
            <tr><td>CloudFront, the same photos, pay as you go</td><td>100 TB</td><td>$9,100</td></tr>
            <tr><td>CloudFront, right-sized WebP photos, pay as you go</td><td>15 TB</td><td>$2,100</td></tr>
            <tr class="hl"><td>CloudFront, right-sized WebP photos, flat-rate plan</td><td>15 TB</td><td>$1,450</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>In India, a CDN’s gigabyte costs about the same.</strong> CloudFront charges $0.109 per GB from Indian edges after a free first terabyte, falling to $0.085 and $0.082: close to sending from Mumbai directly. Add $0.012 per 10,000 requests, and the same 100 TB costs a little more. Moving the same bytes to a CDN makes them faster, not cheaper.</li>
          <li><strong>Fetching from the origin is free.</strong> CloudFront doesn’t charge for data it pulls from S3 or EC2, so misses add nothing to the bill.</li>
          <li><strong>The big saving is sending fewer bytes.</strong> Right-sized WebP photos are about 7 times smaller, and year-long browser caching means returning shoppers don’t download them again.</li>
          <li><strong>The pricing plan does the rest.</strong> AWS added flat-rate CloudFront plans in late 2025. The Premium plan, at its 750-million-request level, costs $1,450 a month, and includes AWS WAF, DDoS protection and Route 53 DNS. Its allowances aren’t hard limits, but traffic that stays well above them for months can get slower delivery, so choose the level that fits.</li>
        </ol>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Overwriting a file under the same name</td><td>Shoppers see the old one until it expires, and different edges disagree</td><td>A new name for every version; invalidate only in an emergency</td></tr>
            <tr><td>Caching something personal</td><td>One shopper’s cart or account page is shown to others near that edge</td><td>Cache only what’s the same for everyone. Never cache a response that sets a cookie</td></tr>
            <tr><td>A cache key that’s too wide</td><td>Cookies, headers or query strings such as <code>?v=123</code> in the key turn most requests into misses</td><td>Keep them out of the key; watch the hit rate</td></tr>
            <tr><td>A public bucket</td><td>Bots and old links fetch from S3 directly, at full price</td><td>Block Public Access, and an origin access control</td></tr>
            <tr><td>Fonts from another domain</td><td>Browsers refuse to use them</td><td>Send an <code>Access-Control-Allow-Origin</code> header with the fonts</td></tr>
            <tr><td>Putting the API behind the CDN later</td><td>Nginx sees the edge’s address, not the shopper’s, so page 7.4’s split and any rate limits break</td><td>Take the shopper’s address from <code>X-Forwarded-For</code>, trusting it only from CloudFront’s address ranges</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Photos</td><td>The private <code>tomazon-photos</code> bucket behind CloudFront at <code>img.tomazon.com</code>, through an origin access control</td></tr>
            <tr><td>Uploads</td><td>Short-lived links to the private <code>tomazon-uploads</code> bucket; S3 events to an SQS queue; a resize worker making WebP at 300, 800 and 1,600 px</td></tr>
            <tr><td>Names and caching</td><td>Content-hash names, and <code>Cache-Control: public, max-age=31536000, immutable</code></td></tr>
            <tr><td>JavaScript, CSS, fonts</td><td>The same distribution, under <code>static/</code>, with hashed names</td></tr>
            <tr><td>The API</td><td>Still straight to the load balancer in Mumbai</td></tr>
            <tr><td>Pricing</td><td>A flat-rate Premium plan, at the level that fits the traffic</td></tr>
            <tr><td>Watching</td><td>Hit rate, requests to the origin, errors at the edge, and p95 page load per country</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Tomazon now runs many kinds of program: the core API, the catalogue service, two cache invalidators, the search indexer, the email sender, the photo resizer and Debezium. Each runs on servers set up by hand, and each is deployed its own way.</li>
          <li>Questions that were easy with one app are hard now. If a server dies, who starts its programs somewhere else? If one crashes, who restarts it? How do you replace 40 running copies with a new version without downtime? And how does the catalogue service find the core API, when copies come and go?</li>
          <li>Chapter 10 packages each service as a container, and hands the running of them to an orchestrator: Kubernetes.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A CDN cuts latency; it doesn’t always cut cost.</strong> Compare the price per gigabyte for the regions
            your shoppers are in before promising savings.</li>
            <li><strong>The cheapest byte is the one you don’t send.</strong> Right-sized images and long browser caching saved
            more than the CDN did.</li>
            <li><strong>Check the bill by region and by line.</strong> Data transfer grows with traffic, quietly, and is easy to
            miss until it’s one of the biggest costs.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Serve the same bytes from near the shopper, send as few as you can, and check what each gigabyte costs.</p>
        </aside>`
    }
  ]
};
