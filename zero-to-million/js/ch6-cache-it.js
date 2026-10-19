/* Chapter 6: Cache it.
   Same conventions as the earlier chapters. Tomazon passes 500,000 users: replicas keep
   the database calm, but pages are slow because every visit repeats the same work. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[6] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 500,000 users. The replicas from chapter 5 keep the database calm, and nothing crashes.</li>
      <li>But during sales, shoppers say the home page is slow, and some leave before they see a single deal.</li>
      <li>Let’s see what it is.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Find repeated work by counting the queries behind one request.</li>
        <li>Decide what’s worth caching: expensive, asked for often, and the same for everyone.</li>
        <li>Explain what Redis is and why it’s fast.</li>
        <li>Add a cache-aside layer with Redis to a FastAPI app.</li>
        <li>Keep the cache honest when data changes.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'slow-pages',
      title: 'Fast servers, slow pages',
      sub: 'Every server looks healthy, yet the home page takes over a second.',
      html: `
        <ol class="points lede">
          <li>The sale starts at 8 p.m. Within minutes, shoppers report that the home page takes 2–3 seconds to appear. Some give up before they see a single deal.</li>
          <li>The dashboards disagree. App servers at 30% CPU, the replicas comfortable, no errors. Every part looks healthy.</li>
          <li>When every part is healthy and the whole is slow, the time is going into how the parts are used.</li>
        </ol>

        <h2>Count the queries behind one page</h2>
        <ol class="points">
          <li>Measure one request from end to end: how many queries it runs, and how long they take. In FastAPI, a counter in an SQLAlchemy event hook, logged once per request, is enough. Tracing tools such as OpenTelemetry show the same thing.</li>
        </ol>
        <figure class="term">
          <figcaption>The app’s request log, with a query count added, at the start of the sale</figcaption>
<pre><span class="p">$</span> tail -3 /var/log/tomazon/requests.log
<span class="o">GET /api/home              200  queries=100  db=962ms   total=1041ms
GET /api/products/TZ-10442 200  queries=9    db=31ms    total=38ms
GET /api/home              200  queries=100  db=1288ms  total=1370ms</span></pre>
          <ol class="points term-note">
            <li>The home page runs 100 queries every time.</li>
            <li>Each query is quick, about 10 ms with the network round trip and the ORM, but 100 of them in a row add up to about a second (page 3.3).</li>
            <li>A product page runs 9 and takes 38 ms. The home page is the problem.</li>
          </ol>
        </figure>
        <p>Here’s Tomazon’s home page, section by section. Pick a section, on the page or in the list, to see the queries it runs:</p>
        <div class="widget" data-widget="home-queries"></div>

        <h2>The same answer, for every shopper</h2>
        <ol class="points">
          <li>The home page changes a few times a day: when the team edits a banner, or a deal starts or ends.</li>
          <li>Yet Tomazon rebuilds it from 100 queries on every visit. During the sale that’s about 500 home page views a second, or 50,000 queries a second, all to produce the same answer.</li>
          <li>Fewer, better queries (page 3.3) make each build cheaper. Not building it at all is cheaper still.</li>
        </ol>

        <h2>What’s worth caching</h2>
        <ol class="points">
          <li>A <strong>cache</strong> keeps the answer to an expensive question, so the next time it’s asked, the answer comes from memory (page 1.6).</li>
          <li>A request answered from the cache is a <strong>hit</strong>. One that isn’t there yet is a <strong>miss</strong>: do the real work, then store the answer. The share of requests that are hits is the <strong>hit rate</strong>.</li>
          <li>A result is worth caching when it passes three tests:</li>
        </ol>
        <table class="data">
          <thead><tr><th>Test</th><th>The home page</th><th>A shopper’s cart</th></tr></thead>
          <tbody>
            <tr><td>Expensive to produce?</td><td>Yes: 100 queries, about 1 second</td><td>No: 2 queries, a few milliseconds</td></tr>
            <tr><td>Asked for often?</td><td>Yes: 500 times a second during the sale</td><td>Only by its owner</td></tr>
            <tr><td>The same for everyone, for a while?</td><td>Yes, until the team edits it</td><td>No: different for every shopper, and it changes with every click</td></tr>
            <tr><td>Verdict</td><td><strong>Cache it</strong></td><td><strong>Leave it</strong>: cheap and personal</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Healthy servers and slow pages mean repeated work.</strong> Count the queries per request. The cost is
            usually in one or two endpoints, not spread evenly.</li>
            <li><strong>Cache finished answers, not tables.</strong> Store the home page’s whole JSON, not raw rows that still
            need 99 more lookups to become a page.</li>
            <li><strong>A cache hides slow code; it doesn’t fix it.</strong> Fix N+1 queries first (page 3.3), then cache
            what’s still expensive.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Cache answers that are expensive, popular and the same for everyone. Leave cheap and personal ones alone.</p>
        </aside>`
    },

    /* ============================================================= Caching */
    {
      group: 'Caching',
      slug: 'redis',
      title: 'Redis: a cache in memory',
      sub: 'An in-memory key-value store between the app and the database.',
      html: `
        <ol class="points lede">
          <li><strong>Redis</strong> is an open-source, in-memory data store. Tomazon uses it as a cache: a place to keep finished answers, close to the app, in RAM.</li>
          <li>The app asks Redis first, and goes to the database only when Redis doesn’t have the answer.</li>
        </ol>

        <h2>Why it’s fast</h2>
        <ol class="points">
          <li><strong>It answers from RAM.</strong> Everything Redis holds is in memory, about a thousand times faster to reach than an SSD (page 1.10).</li>
          <li><strong>It stores finished answers.</strong> This is the bigger win. One lookup returns the whole home page, instead of 100 queries to rebuild it.</li>
          <li><strong>It’s a key-value store.</strong> Every value has a name, its key, such as <code>home:v1</code>, and you fetch it by that name. There are no joins and no query planner: <code>GET home:v1</code> returns the value, or nothing.</li>
          <li><strong>It runs one command at a time.</strong> Commands run one after another on a single thread, so there are no locks to fight over. One Redis server handles over 100,000 simple commands a second.</li>
          <li><strong>The trade-off:</strong> RAM is limited, it costs more than disk, and a restart can empty it. That’s fine for a cache: everything in it can be rebuilt from PostgreSQL, which stays the source of truth.</li>
        </ol>
        <figure class="term">
          <figcaption>Try it on the app server</figcaption>
<pre><span class="p">$</span> redis-cli -h 10.0.4.10 SET home:v1 '{"banners": [...], "deals": [...]}' EX 300
<span class="o">OK</span>
<span class="p">$</span> redis-cli -h 10.0.4.10 TTL home:v1
<span class="o">(integer) 297</span>
<span class="p">$</span> redis-cli -h 10.0.4.10 --latency
<span class="o">min: 0, max: 2, avg: 0.21 (2481 samples)</span></pre>
          <ol class="points term-note">
            <li><code>SET … EX 300</code> stores the value for 300 seconds. After that, Redis deletes it by itself. That lifetime is its <strong>TTL</strong> (time to live).</li>
            <li><code>TTL</code> shows the seconds left: 297.</li>
            <li><code>--latency</code> measures the round trip to Redis over the private network: about 0.2 ms.</li>
          </ol>
        </figure>

        <h2>Cache-aside: check Redis first</h2>
        <ol class="points">
          <li>On each request, the app asks Redis for the key. On a <strong>hit</strong>, it returns the stored answer at once.</li>
          <li>On a <strong>miss</strong>, it builds the answer from the database, stores it in Redis with a TTL, and returns it. The next request is a hit.</li>
          <li>This pattern is called <strong>cache-aside</strong>: the app manages the cache itself, and the database never knows the cache exists.</li>
        </ol>
        <figure class="term">
          <figcaption>Cache-aside for the home page, in FastAPI</figcaption>
<pre><span class="o">import json
import redis.asyncio as redis

cache = redis.Redis(host="10.0.4.10", port=6379)    </span><span class="c"># the Redis server, on the private network</span><span class="o">
HOME_TTL = 300                                       </span><span class="c"># seconds: a copy lives at most 5 minutes</span><span class="o">

@app.get("/api/home")
async def home():
    cached = await cache.get("home:v1")
    if cached:                                       </span><span class="c"># a hit: no database at all</span><span class="o">
        return json.loads(cached)
    page = await build_home_page()                   </span><span class="c"># a miss: the 100 queries, about 1 s</span><span class="o">
    await cache.set("home:v1", json.dumps(page), ex=HOME_TTL)
    return page</span></pre>
          <ol class="points term-note">
            <li>A hit takes about 2 ms: the round trip to Redis, plus turning the stored JSON back into a response.</li>
            <li>A miss takes about a second, as before, but now it happens once every 5 minutes instead of 500 times a second.</li>
            <li>The <code>v1</code> in the key is a version. When the page’s format changes, the new code uses <code>home:v2</code>, and the old copies simply expire.</li>
          </ol>
        </figure>

        <h2>Where Redis sits</h2>
        <p>Redis gets a server of its own on the private network, next to the database. Step through a hit and a miss:</p>
        <div class="widget" data-widget="cache-arch"></div>
        <ol class="points">
          <li><strong>The result:</strong> the home page drops from about a second to about 2 ms. Its database load drops from 50,000 queries a second to 100 queries every 5 minutes.</li>
          <li><strong>Size it for what you cache.</strong> The home page is about 200 KB, and 10,000 product pages at about 20 KB each are 200 MB. An r7g.large with 16 GB leaves plenty of room. Amazon ElastiCache runs the same Redis as a managed service.</li>
          <li><strong>Set a memory limit, and what to drop when it’s full.</strong> <code>maxmemory 12gb</code> with <code>maxmemory-policy allkeys-lru</code> makes Redis evict the least recently used keys, instead of running out of memory.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>The database stays the source of truth.</strong> Lose Redis and you lose speed, not data.</li>
            <li><strong>But plan for an empty cache.</strong> After a restart, every request misses and the whole load lands on
            the database at once. Make sure it can survive that for a few minutes.</li>
            <li><strong>Give every key a TTL.</strong> A key without one can stay wrong forever.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Check Redis first, fall back to the database, and give every key an expiry.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Caching',
      slug: 'invalidation',
      title: 'Keeping the cache honest',
      sub: 'When the data changes, the copy in Redis stays wrong until something removes it.',
      html: `
        <ol class="points lede">
          <li>Halfway through the sale, the team drops the price of the noise-cancelling headphones from ₹2,999 to ₹2,499. PostgreSQL has the new price at once.</li>
          <li>Redis still holds the home page it built 3 minutes ago, with the old price. For up to 2 more minutes, every shopper sees ₹2,999, and some of them find a different price at checkout.</li>
          <li>Removing copies that have become wrong, in time, is <strong>cache invalidation</strong>. It’s famously one of the hardest problems in computing.</li>
        </ol>

        <h2>Option 1: a shorter TTL</h2>
        <ol class="points">
          <li>A shorter TTL limits how long a copy can be wrong. The cost is more misses, and every miss is a rebuild on the database.</li>
          <li>For one hot page, that cost is tiny: the home page rebuilt every 10 seconds is still only about 10 queries a second.</li>
          <li>For thousands of pages, each visited now and then, it’s huge: most visits arrive after their copy has expired, so most of them miss. Compare the two:</li>
        </ol>
        <div class="widget" data-widget="ttl-tradeoff"></div>
        <ol class="points" start="4">
          <li>And whatever the TTL, a price can still be wrong for that long. A TTL on its own can’t make the cache both fast and correct.</li>
        </ol>

        <h2>Option 2: delete the key when the data changes</h2>
        <ol class="points">
          <li>The code that changes a price also deletes every cached copy that contains it. The next request misses and rebuilds with the new price.</li>
          <li><strong>Delete, don’t update.</strong> Writing the new value into the cache from here can race with a rebuild that’s already running, and leave the old copy behind. Deleting is simple and safe.</li>
          <li><strong>Keep the TTL as a safety net.</strong> If a delete is ever missed, the copy still expires.</li>
        </ol>
        <figure class="term">
          <figcaption>Delete after the change is committed</figcaption>
<pre><span class="o">async def update_price(product_id: int, price: int):
    async with primary.begin() as db:
        await db.execute(UPDATE_PRICE, {"id": product_id, "price": price})
    await cache.delete("home:v1", f"product:{product_id}")      </span><span class="c"># only after the commit</span></pre>
          <ol class="points term-note">
            <li>The delete comes after the transaction commits. Deleting first would let another request rebuild the page from the old price in between.</li>
          </ol>
        </figure>

        <h2>Option 3: let the database announce changes</h2>
        <ol class="points">
          <li>Deleting in code works while one place changes prices. Once prices also change from an admin tool, a nightly import and a script someone runs by hand, one of them will forget.</li>
          <li>PostgreSQL can announce changes itself. A <strong>trigger</strong> on the products table runs on every insert, update and delete, and calls <strong>NOTIFY</strong> with the product’s id on a channel named <code>product_changes</code>.</li>
          <li>A small service, the <strong>cache invalidator</strong>, keeps a connection open and <strong>LISTEN</strong>s on that channel. For each message, it deletes the matching keys in Redis.</li>
          <li>NOTIFY is delivered only when the transaction commits, so a change that’s rolled back never clears the cache.</li>
        </ol>
        <figure class="term">
          <figcaption>The trigger, in PostgreSQL</figcaption>
<pre><span class="o">CREATE FUNCTION notify_product_change() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('product_changes',
    (CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END)::text);
  RETURN NULL;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER product_changed AFTER INSERT OR UPDATE OR DELETE ON products
  FOR EACH ROW EXECUTE FUNCTION notify_product_change();</span></pre>
        </figure>
        <figure class="term">
          <figcaption>The cache invalidator, a small Python service on the database server</figcaption>
<pre><span class="o">async def main():
    db = await asyncpg.connect("postgresql://invalidator@127.0.0.1:5432/tomazon")
    await db.add_listener("product_changes", on_change)
    await asyncio.Event().wait()                     </span><span class="c"># keep listening</span><span class="o">

def on_change(conn, pid, channel, product_id):
    asyncio.create_task(forget(product_id))

async def forget(product_id):
    keys = ("home:v1", f"product:{product_id}")
    await cache.delete(*keys)
    await asyncio.sleep(1)                           </span><span class="c"># a replica may still have the old row,</span><span class="o">
    await cache.delete(*keys)                        </span><span class="c"># so delete again once it has caught up</span></pre>
          <ol class="points term-note">
            <li>It connects straight to PostgreSQL, not through PgBouncer: LISTEN needs a session of its own, which PgBouncer’s transaction mode doesn’t keep. And it must be the primary: replicas don’t deliver notifications.</li>
            <li>The second delete, a second later, is for a lagging replica: a request that misses in between can rebuild the page from a replica that hasn’t replayed the change yet (chapter 5), and put the old price back.</li>
          </ol>
        </figure>
        <p>Here’s the whole path, from a price change to a fresh page:</p>
        <div class="widget" data-widget="invalidate-arch"></div>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Data</th><th>Cached as</th><th>Kept fresh by</th></tr></thead>
          <tbody>
            <tr><td>The home page</td><td><code>home:v1</code>, TTL 5 minutes</td><td>Deleted by the invalidator on any product, deal or banner change</td></tr>
            <tr><td>Product pages</td><td><code>product:&lt;id&gt;</code>, TTL 10 minutes, with a little randomness</td><td>Deleted by the invalidator when that product changes</td></tr>
            <tr><td>Stock at checkout, carts, orders</td><td>Not cached</td><td>Always read from the primary (chapter 5)</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Reads are now fast: Redis answers the popular pages, and the replicas take the rest.</li>
          <li>Every server now has room to spare at a million users.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Every cache is a copy, and every copy can be wrong.</strong> It’s chapter 5’s lesson again: decide, for
            each kind of data, how wrong it may be and for how long.</li>
            <li><strong>Invalidate by deleting, and keep a TTL anyway.</strong> Deletes make the cache correct; the TTL limits
            the damage when a delete goes missing.</li>
            <li><strong>Never trust a cached value where money depends on it.</strong> Show the cached price on the page, but
            read the price and the stock from the primary at checkout.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Delete on change, expire anyway, and never charge from a cached price.</p>
        </aside>`
    }
  ]
};
