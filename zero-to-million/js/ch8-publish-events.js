/* Chapter 8: Publish events.
   Same conventions as the earlier chapters. The cache invalidator from 6.3 fails quietly;
   Tomazon replaces LISTEN/NOTIFY with a Kafka log fed from the WAL by Debezium. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[8] = {
  intro: `
    <ol class="points lede">
      <li>Chapter 7 left Tomazon with services that need to hear about each other’s changes. One piece of Tomazon already does that: the cache invalidator from page 6.3.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why LISTEN/NOTIFY, and any message sent once and kept nowhere, loses data.</li>
        <li>Choose between a message queue and a log, and say why.</li>
        <li>Explain Kafka’s topics, partitions, offsets, consumer groups and replication.</li>
        <li>Capture database changes with Debezium, and turn them into Kafka messages.</li>
        <li>Run Kafka safely: duplicates, lag, a full primary disk, and what to watch.</li>
      </ul>
    </div>`,

  sections: [

    /* =========================================================== Why events */
    {
      group: 'The next bottleneck',
      slug: 'listener-died',
      title: 'The listener that went deaf',
      sub: 'The cache invalidator stopped working, and nothing noticed until shoppers did.',
      html: `
        <ol class="points lede">
          <li>During a sale, the team cuts the prices of a few products.</li>
          <li>Shoppers keep seeing the old prices, and some find a different price at checkout.</li>
          <li>The database has the new prices, but Redis still has the old pages. The cache invalidator from page 6.3 has stopped deleting them.</li>
        </ol>

        <h2>What happened</h2>
        <ol class="steps">
          <li><strong>The database restarts briefly</strong> for a settings change. The app servers reconnect on their own.</li>
          <li><strong>The invalidator doesn’t.</strong> It keeps running, but it’s no longer listening.</li>
          <li><strong>Nothing notices.</strong> Its health check only asks “is it running?”, and it is.</li>
          <li><strong>Every change message is lost.</strong> PostgreSQL sends each NOTIFY only to whoever is listening at that moment, and keeps nothing.</li>
          <li><strong>Someone restarts the invalidator,</strong> and it works again. But the changes it missed are gone for good.</li>
        </ol>

        <h2>Why LISTEN/NOTIFY isn’t enough</h2>
        <ol class="points">
          <li><strong>It keeps nothing.</strong> A message sent while a reader is down is lost.</li>
          <li><strong>It can’t catch up.</strong> A reader that restarts can’t ask what it missed.</li>
          <li><strong>It can’t show progress.</strong> There’s no way to tell whether a reader is keeping up.</li>
        </ol>

        <h2>More readers are coming</h2>
        <ol class="points">
          <li><strong>The catalogue service</strong> wants its own copy of the products (page 7.3).</li>
          <li><strong>Search</strong> needs every product change to keep its results right.</li>
          <li><strong>A placed order</strong> should send an email, book a delivery and update the sales dashboard.</li>
          <li>Each of them needs every change, even ones made while it was down.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A message that can be lost will be lost.</strong> If missing one leaves data wrong, use something that
            keeps messages until they’re handled.</li>
          </ol>
        </aside>`
    },

    /* ============================================================= Messages */
    {
      group: 'Messages',
      slug: 'queue-or-log',
      title: 'A queue or a log',
      sub: 'Two ways to carry messages between services: one deletes a message when it’s done, the other keeps it.',
      html: `
        <ol class="points lede">
          <li>Two kinds of system carry messages between services reliably. They look alike, but they keep messages in different ways, and that decides what they’re good for.</li>
          <li>A <strong>message queue</strong>, such as RabbitMQ or Amazon SQS, holds each job until a worker finishes it, then deletes it.</li>
          <li>A <strong>log</strong>, such as Apache Kafka or Amazon Kinesis, keeps every message, in order, for a set time. Each reader keeps its own place in it.</li>
        </ol>

        <table class="data">
          <thead><tr><th></th><th>Message queue</th><th>Log</th></tr></thead>
          <tbody>
            <tr><td>After a message is handled</td><td>It’s deleted</td><td>It stays until its retention runs out (Kafka’s default: 7 days)</td></tr>
            <tr><td>Who gets a message</td><td>One worker. To reach several services, copy it into one queue for each</td><td>Every reader gets every message, from the same log</td></tr>
            <tr><td>Keeping track</td><td>The queue tracks each message: delivered, acknowledged, or due for a retry</td><td>Each reader stores one number: its offset, how far it has read</td></tr>
            <tr><td>Order</td><td>Roughly first in, first out; retries can reorder</td><td>Strict order within a partition</td></tr>
            <tr><td>Replay</td><td>Impossible: handled messages are gone</td><td>Any reader can rewind, and a new reader can start from the oldest message kept</td></tr>
            <tr><td>Best for</td><td>Jobs: “send this email”, “resize this photo”, with retries and a dead-letter queue</td><td>Facts that many services react to: “price changed”, “order placed”</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Tomazon’s problem is a fact: “product 1042’s price changed”. The cache invalidator, the catalogue and search all need it, each at its own pace.</li>
          <li>A queue for each reader would work, but the sender would have to know every reader, and a new reader couldn’t get the history. A log fits.</li>
          <li>Jobs still suit a queue. Sending order emails, for example, is one job per order, and a queue’s retries and dead-letter queue are exactly what it needs.</li>
        </ol>

        <h2>How Kafka works</h2>
        <p>Here’s how the parts fit together. Pick a term to see where it is:</p>
        <div class="widget" data-widget="kafka-anatomy"></div>
        <dl class="terms">
          <div><dt>Topic</dt><dd>A named log of messages, such as <code>tomazon.public.products</code>.</dd></div>
          <div><dt>Partition</dt><dd>A topic is split into partitions, each an append-only file on disk. Messages with the same key, such as a product id, always go to the same partition, so the changes to one product stay in order.</dd></div>
          <div><dt>Offset</dt><dd>A message’s position in its partition: 0, 1, 2 and so on.</dd></div>
          <div><dt>Producer</dt><dd>Anything that writes messages to a topic.</dd></div>
          <div><dt>Consumer group</dt><dd>One reader, under one name, such as <code>cache-invalidator</code>. Each group reads the whole topic, independently of the others. Kafka shares the partitions out among the running copies in a group, so each message is handled by one copy.</dd></div>
          <div><dt>Committed offset</dt><dd>How far a group has got, stored in Kafka itself. After a restart, the group carries on from there.</dd></div>
          <div><dt>Broker</dt><dd>One Kafka server. Each partition is copied to three brokers, one in each availability zone. One copy leads and takes the writes; the others follow it.</dd></div>
          <div><dt>Retention</dt><dd>How long messages are kept: 7 days by default. A compacted topic instead keeps the latest message for each key, for as long as the topic exists.</dd></div>
        </dl>

        <p>Try it. The same price changes, sent through LISTEN/NOTIFY and through a Kafka topic:</p>
        <div class="widget" data-widget="kafka-log"></div>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Queues for jobs, logs for facts.</strong> If one worker must do something, use a queue. If many services
            need to know something happened, use a log.</li>
            <li><strong>The key decides the order.</strong> Kafka keeps order only within a partition. Key each message by the thing
            whose changes must stay in order, and never rely on order across keys.</li>
            <li><strong>Partitions limit how many copies can share the work.</strong> Each partition is read by one copy of a
            reader at a time. With 12 partitions, up to 12 copies can work side by side; a 13th would sit idle. So choose
            enough partitions at the start: adding more later moves some products to a different partition, and for a
            while their changes can arrive out of order.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Use a queue when one worker must do a job. Use a log when many readers need the same facts.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Messages',
      slug: 'change-data-capture',
      title: 'Capture changes from the WAL',
      sub: 'Don’t make the app send every change. Read them from the log the database already keeps.',
      html: `
        <ol class="points lede">
          <li>Kafka is running. Now every product change has to get into it.</li>
          <li>The obvious way is for the app to save the product, then send a message to Kafka. Writing to two systems like this is called a <strong>dual write</strong>, and it can’t be made reliable.</li>
        </ol>

        <h2>Why the app shouldn’t send it</h2>
        <table class="data">
          <thead><tr><th>What goes wrong</th><th>What readers see</th></tr></thead>
          <tbody>
            <tr><td>The app commits the change, then crashes before sending</td><td>Nothing: the change is saved, and never announced</td></tr>
            <tr><td>The app sends first, then the transaction rolls back</td><td>A change that never happened</td></tr>
            <tr><td>Kafka is slow or down</td><td>Either every write waits for Kafka, or messages pile up in memory and are lost on a restart</td></tr>
            <tr><td>Prices also change from the admin tool, the nightly import and a script run by hand</td><td>Whichever one forgot to send</td></tr>
          </tbody>
        </table>

        <h2>Read the WAL instead</h2>
        <ol class="points">
          <li>PostgreSQL writes every change to its WAL before it commits. It’s the same log the replicas follow (page 5.2). If a change is in the WAL, it happened; if it isn’t, it didn’t.</li>
          <li><strong>Change data capture</strong> (CDC) reads the WAL, and turns each committed change into a message. <strong>Debezium</strong> is the common open-source tool for it. It runs as a connector on <strong>Kafka Connect</strong>, a service for moving data in and out of Kafka.</li>
          <li>The app doesn’t change at all. Whatever writes to the products table, the app, the import or a hand-typed <code>UPDATE</code>, ends up in Kafka, in commit order.</li>
          <li>Debezium reads through a <strong>replication slot</strong>: PostgreSQL remembers how far it has read, and keeps the WAL it hasn’t read yet. After a restart, Debezium carries on exactly where it stopped.</li>
        </ol>
        <figure class="term">
          <figcaption>Preparing the primary</figcaption>
<pre><span class="c"># postgresql.conf (wal_level needs a restart)</span><span class="o">
wal_level = logical
max_slot_wal_keep_size = 50GB          </span><span class="c"># a stopped reader can hold back at most 50 GB of WAL</span><span class="o">

</span><span class="c">-- in psql, as the database owner</span><span class="o">
CREATE ROLE debezium WITH LOGIN REPLICATION PASSWORD '…';
GRANT SELECT ON products TO debezium;
CREATE PUBLICATION debezium FOR TABLE products;</span></pre>
          <ol class="points term-note">
            <li><code>wal_level = logical</code> makes the WAL carry enough detail to rebuild each changed row, not just the bytes that changed on disk.</li>
            <li>The publication lists the tables Debezium may read: for now, just <code>products</code>.</li>
          </ol>
        </figure>

        <h2>The new cache invalidator</h2>
        <figure class="term">
          <figcaption>The cache invalidator, now a Kafka consumer. Two copies run, with the same group id</figcaption>
<pre><span class="o">consumer = Consumer({
    "bootstrap.servers": KAFKA_BROKERS,
    "group.id": "cache-invalidator",        </span><span class="c"># both copies share this name</span><span class="o">
    "enable.auto.commit": False,            </span><span class="c"># commit only after the work is done</span><span class="o">
})
consumer.subscribe(["tomazon.public.products"])

while True:
    msg = consumer.poll(1.0)
    if msg is None or msg.error():
        continue
    product_id = json.loads(msg.key())["id"]
    cache.delete("home:v1", f"product:{product_id}")
    consumer.commit(message=msg, asynchronous=False)</span></pre>
          <ol class="points term-note">
            <li>The product id comes from the message’s key, so it works for updates and deletes alike.</li>
            <li>The offset is committed only after the delete. If the invalidator crashes in between, it reads the message again after a restart. Kafka delivers <strong>at least once</strong>, and deleting a key twice is harmless.</li>
            <li>If one copy crashes, Kafka moves its partitions to the other copy within the session timeout (45 seconds by default), and that copy carries on from the last committed offset.</li>
            <li>The second delete from page 6.3, a second later for lagging replicas, still applies. It’s left out here.</li>
          </ol>
        </figure>
        <p>Here’s the whole path, from a price change to Redis and search:</p>
        <div class="widget" data-widget="cdc-arch"></div>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Don’t write to two systems and hope.</strong> Write once, to the database, and let the WAL carry the change
            everywhere else.</li>
            <li><strong>Every consumer must be idempotent.</strong> At-least-once delivery means duplicates, so handling a message
            twice must do no harm.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Write each change once, to the database, and let change data capture deliver it.</p>
        </aside>`
    },

    /* ============================================================ Running it */
    {
      group: 'Running it',
      slug: 'running-kafka',
      title: 'The price of a log',
      sub: 'Kafka is now as important as the database, and needs the same care.',
      html: `
        <ol class="points lede">
          <li>The fragile listener is gone. In its place is a small cluster of servers that holds every change Tomazon makes.</li>
          <li>That cluster now matters as much as the database: if it stops, cache invalidation and search updates stop with it.</li>
        </ol>

        <h2>Run it yourself, or managed?</h2>
        <table class="data">
          <thead><tr><th></th><th>Kafka on your own servers</th><th>Amazon MSK</th></tr></thead>
          <tbody>
            <tr><td>Who runs the brokers</td><td>You: setup, disks, upgrades</td><td>AWS</td></tr>
            <tr><td>When a broker dies</td><td>You replace it</td><td>AWS replaces it</td></tr>
            <tr><td>Cost</td><td>Cheaper servers, more of your team’s time</td><td>Pricier servers, less of your time</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Tomazon uses Amazon MSK: three brokers, one in each zone in Mumbai.</li>
        </ol>

        <h2>Settings that keep messages safe</h2>
        <table class="data">
          <thead><tr><th>Setting</th><th>Tomazon’s value</th><th>What it means</th></tr></thead>
          <tbody>
            <tr><td><code>replication.factor</code></td><td>3</td><td>Every message is kept on three brokers</td></tr>
            <tr><td><code>min.insync.replicas</code></td><td>2</td><td>A write only counts once two brokers have it, so losing one loses nothing</td></tr>
            <tr><td><code>retention.ms</code></td><td>7 days</td><td>A reader that stops can catch up any time within a week</td></tr>
          </tbody>
        </table>

        <h2>What to watch</h2>
        <ol class="points">
          <li><strong>Consumer lag</strong> is how many messages a reader still has to read. It’s the number that would have caught the stopped invalidator in minutes.</li>
        </ol>
        <figure class="term">
          <figcaption>Lag for each partition (some columns left out)</figcaption>
<pre><span class="o">$ kafka-consumer-groups.sh --bootstrap-server $KAFKA_BROKERS --describe --group cache-invalidator

GROUP              TOPIC                    PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
cache-invalidator  tomazon.public.products  0          48211           48211           0
cache-invalidator  tomazon.public.products  1          47120           47120           0
cache-invalidator  tomazon.public.products  2          46875           47302           427</span></pre>
          <ol class="points term-note">
            <li>Partition 2 is 427 messages behind. If that number keeps growing, the reader has stopped or can’t keep up.</li>
          </ol>
        </figure>
        <table class="data">
          <thead><tr><th>Watch</th><th>Alert when</th></tr></thead>
          <tbody>
            <tr><td>Consumer lag, for each group</td><td>It keeps growing for 5 minutes</td></tr>
            <tr><td>Broker disks</td><td>They’re more than 70% full</td></tr>          </tbody>
        </table>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Duplicates</td><td>After a crash, a reader can see the same message twice</td><td>Make handling a message twice harmless, like deleting a key twice</td></tr>
            <tr><td>A bad message</td><td>One message crashes the reader every time it tries it, and that partition stops</td><td>Set the message aside in a separate topic, carry on, and alert</td></tr>
            <tr><td>A full database disk</td><td>Debezium is down for long, and PostgreSQL keeps all the WAL it hasn’t read</td><td>Cap how much WAL it may keep (<code>max_slot_wal_keep_size</code>), and alert early</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>The cluster</td><td>Amazon MSK, three brokers, one per zone</td></tr>
            <tr><td>Getting changes in</td><td>Debezium, reading the database’s WAL</td></tr>
            <tr><td>Readers</td><td>The cache invalidator (2 copies), the search indexer and the catalogue service</td></tr>
            <tr><td>Safety</td><td>3 copies of every message, readers safe to repeat, and alerts on lag</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Changes now reach every service that needs them, even one that was down when they happened.</li>        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A log is a database.</strong> Keep copies, watch its disk, and test what happens when a broker dies.</li>
            <li><strong>Alert on lag, not just on “up”.</strong> When readers fail quietly, everything looks up, and nothing moves.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Make every reader safe to repeat, and watch every group’s lag.</p>
        </aside>`
    }
  ]
};
