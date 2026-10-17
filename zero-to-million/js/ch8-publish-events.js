/* Chapter 8: Publish events.
   Same conventions as the earlier chapters. The cache invalidator from 6.3 fails quietly;
   Tomazon replaces LISTEN/NOTIFY with a Kafka log fed from the WAL by Debezium. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[8] = {
  intro: `
    <ol class="points lede">
      <li>Chapter 7 left Tomazon with services that need to hear about each other’s changes. One piece of Tomazon already does that: the cache invalidator from page 6.3.</li>
      <li>At 2 million users, it fails quietly in the middle of a sale, and shows that a message that can be lost, eventually will be.</li>
      <li>This chapter replaces it with a log that keeps every change until every reader has it: Apache Kafka, fed straight from the database’s WAL.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why LISTEN/NOTIFY, and any message sent once and kept nowhere, loses data.</li>
        <li>Choose between a message queue and a log, and say why.</li>
        <li>Explain Kafka’s topics, partitions, offsets, consumer groups and replication.</li>
        <li>Capture database changes with Debezium, and publish events safely with an outbox.</li>
        <li>Run Kafka safely: duplicates, lag, a full primary disk, and what to watch.</li>
      </ul>
    </div>`,

  sections: [

    /* =========================================================== Why events */
    {
      group: 'Why events',
      slug: 'listener-died',
      title: 'The listener that went deaf',
      sub: 'The cache invalidator stopped working at 7:35, and nothing noticed until shoppers did.',
      html: `
        <ol class="points lede">
          <li>Friday, 8 p.m.: Tomazon’s flash sale starts, and the pricing team cuts the prices of 40 products in the first ten minutes.</li>
          <li>Shoppers keep seeing the old prices. Some add products to their cart at one price, and find another at checkout. Support tickets pile up.</li>
          <li>PostgreSQL has the new prices. Redis still has the old pages. The cache invalidator from page 6.3 hasn’t deleted anything since 7:35.</li>
        </ol>

        <h2>What happened</h2>
        <ol class="steps">
          <li><strong>7:35: PostgreSQL restarts.</strong> A configuration change needs a restart, and the database is back in 5 seconds. The app servers reconnect on their own.</li>
          <li><strong>The invalidator doesn’t.</strong> Its code reconnects when a query fails, but a listener never sends a query. It sits waiting on a connection that no longer exists.</li>
          <li><strong>Nothing notices.</strong> The process is still running, so its health check, “is the process up?”, keeps passing.</li>
          <li><strong>Every notification is dropped.</strong> NOTIFY delivers only to sessions listening at that moment. With nobody listening, PostgreSQL throws each one away.</li>
          <li><strong>8:20: someone restarts the invalidator,</strong> and it works again. The 45 minutes of changes it missed are gone, and it has no record of which products they were.</li>
        </ol>
        <ol class="points">
          <li>The TTL safety net from page 6.3 did its job: no copy stayed wrong for much more than 10 minutes.</li>
          <li>But in a flash sale, the first 10 minutes after a price change are the ones that matter most.</li>
        </ol>

        <h2>Why more care won’t fix LISTEN/NOTIFY</h2>
        <table class="data">
          <thead><tr><th>What Tomazon needs</th><th>What LISTEN/NOTIFY does</th></tr></thead>
          <tbody>
            <tr><td>Keep changes while a reader is down</td><td>Sends each notification once, to whoever is listening, and keeps nothing</td></tr>
            <tr><td>Let a reader catch up after a restart</td><td>Has no record of what any reader has seen</td></tr>
            <tr><td>Add a new reader that needs the history</td><td>A new listener hears only what happens from now on</td></tr>
            <tr><td>Share the work between several copies of a reader</td><td>Every listener gets every message, so two copies do the same work twice</td></tr>
            <tr><td>See how far behind a reader is</td><td>There’s no such number</td></tr>
            <tr><td>Keep the primary for the database’s own work</td><td>Every listener holds a connection to the primary, because replicas don’t deliver notifications</td></tr>
          </tbody>
        </table>

        <h2>More readers are coming</h2>
        <ol class="points">
          <li><strong>The catalogue service</strong> wants its own copy of the products, instead of reading the core’s view (page 7.3).</li>
          <li><strong>Search</strong> is moving to OpenSearch, which needs every product change to keep its index right.</li>
          <li><strong>A placed order</strong> should send a confirmation email, book a delivery and update the sales dashboard. None of that should happen while the shopper waits.</li>
          <li>Every one of these readers needs every change, even the ones made while it was down.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A message that can be lost will be lost.</strong> If missing one would leave data wrong, it needs delivery
            that survives restarts, crashes and deploys.</li>
            <li><strong>Health checks must test the work, not the process.</strong> A deaf listener passes “is it running?”. Check
            “when did it last handle a change?” instead.</li>
            <li><strong>Every background reader needs one number on a dashboard:</strong> how far behind it is.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Never send a change that must arrive through something that can drop it.</p>
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
            <li><strong>Partitions cap a group’s parallelism.</strong> A group can’t have more working copies than the topic has
            partitions. Choose enough for the future (Tomazon uses 12): adding partitions later sends some keys to new
            partitions, and breaks their order while it happens.</li>
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
GRANT SELECT ON products, outbox TO debezium;
CREATE PUBLICATION debezium FOR TABLE products, outbox;</span></pre>
          <ol class="points term-note">
            <li><code>wal_level = logical</code> makes the WAL carry enough detail to rebuild each changed row, not just the bytes that changed on disk.</li>
            <li>The publication lists the tables Debezium may read. The <code>outbox</code> table is explained below.</li>
          </ol>
        </figure>
        <figure class="term">
          <figcaption>The Debezium connector, registered with Kafka Connect</figcaption>
<pre><span class="o">{
  "name": "tomazon-postgres",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "plugin.name": "pgoutput",
    "database.hostname": "10.0.2.14",
    "database.port": "5432",
    "database.user": "debezium",
    "database.password": "\${file:/opt/connect/secrets.properties:db_password}",
    "database.dbname": "tomazon",
    "topic.prefix": "tomazon",
    "table.include.list": "public.products,public.outbox",
    "publication.name": "debezium",
    "publication.autocreate.mode": "disabled",
    "slot.name": "debezium",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "key.converter.schemas.enable": "false",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false",
    "transforms": "outbox",
    "transforms.outbox.type": "io.debezium.transforms.outbox.EventRouter",
    "transforms.outbox.table.expand.json.payload": "true",
    "transforms.outbox.predicate": "isOutbox",
    "predicates": "isOutbox",
    "predicates.isOutbox.type": "org.apache.kafka.connect.transforms.predicates.TopicNameMatches",
    "predicates.isOutbox.pattern": "tomazon.public.outbox"
  }
}</span></pre>
          <ol class="points term-note">
            <li>Debezium connects straight to the primary on port 5432, not through PgBouncer: like LISTEN, a replication connection needs a session of its own (page 6.3).</li>
            <li>Each table gets its own topic, named after it: changes to products go to <code>tomazon.public.products</code>. Each message is keyed by the row’s primary key, and written as plain JSON.</li>
            <li>The <code>transforms</code> and <code>predicates</code> lines apply Debezium’s outbox event router to the outbox table only. The outbox is explained below.</li>
            <li>On its first start, Debezium takes a snapshot: it reads every existing row once, then streams changes from that point.</li>
            <li>The password comes from a secrets file on the Kafka Connect server, not from the config.</li>
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

        <h2>Raw changes or real events: the outbox</h2>
        <ol class="points">
          <li>A CDC message is a row of a table. Its fields are the core’s column names, so a reader that relies on them is tied to the table again: the shared-table problem from page 7.3, by another route.</li>
          <li>That’s fine for the cache invalidator, which only needs the id. But events other teams build on, such as “order placed”, should be designed and versioned, like the view in page 7.3.</li>
          <li>The <strong>outbox pattern</strong> does that. In the same transaction that saves the order, the core inserts a row into an <code>outbox</code> table: the event’s type and its content. Both commit, or neither does.</li>
          <li>Debezium reads the new outbox row from the WAL, and its outbox event router publishes it as the event itself. The order tables can change freely behind it.</li>
        </ol>
        <figure class="term">
          <figcaption>Saving an order and its event in one transaction</figcaption>
<pre><span class="o">async with primary.begin() as db:                </span><span class="c"># one transaction</span><span class="o">
    order_id = await db.scalar(INSERT_ORDER, order)
    await db.execute(INSERT_OUTBOX, {
        "aggregatetype": "order",
        "aggregateid": order_id,
        "type": "order_placed.v1",
        "payload": json.dumps({"order_id": order_id, "user_id": user.id,
                               "total": total, "items": items}),
    })</span></pre>
          <ol class="points term-note">
            <li>The router publishes each outbox row to <code>outbox.event.order</code>, keyed by the order id, so the events for one order stay in order.</li>
            <li>A cleanup job deletes old outbox rows. Debezium doesn’t need them: it read them from the WAL.</li>
            <li>This is how the core will tell delivery, email and analytics about an order: one transaction saves the order and its event, and each reader acts when it can.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Don’t write to two systems and hope.</strong> Write once, to the database, and let the WAL carry the change
            everywhere else.</li>
            <li><strong>Publish events, not tables, to other teams.</strong> Raw CDC is fine within one team. Between teams, use an
            outbox, with versioned event types.</li>
            <li><strong>Every consumer must be idempotent.</strong> At-least-once delivery means duplicates, so handling a message
            twice must do no harm.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Save the change and its event in one transaction, and let change data capture deliver it.</p>
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
          <li>The fragile listener is gone. In its place is a cluster of servers that holds every change Tomazon makes.</li>
          <li>That cluster is now as critical as the database. If it stops, cache invalidation, search updates and order emails stop with it.</li>
        </ol>

        <h2>Run it yourself, or managed?</h2>
        <table class="data">
          <thead><tr><th></th><th>Kafka on EC2</th><th>Amazon MSK</th></tr></thead>
          <tbody>
            <tr><td>What you run</td><td>Brokers in three zones, KRaft controllers, disks, upgrades</td><td>You choose the broker size and count; AWS runs them</td></tr>
            <tr><td>When a broker dies</td><td>You replace it, and move its partitions</td><td>AWS replaces it</td></tr>
            <tr><td>Kafka Connect for Debezium</td><td>You run it too</td><td>MSK Connect can run it</td></tr>
            <tr><td>Cost</td><td>Cheaper servers, more engineers’ time</td><td>A premium on the servers, less time</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>KRaft is how Kafka’s brokers agree on the cluster’s state, without ZooKeeper. Since Kafka 4.0, it’s the only way.</li>
          <li>Tomazon’s team understands how Kafka works, but doesn’t want to be on call for brokers. It runs Amazon MSK: three <code>kafka.m7g.large</code> brokers, one in each zone in Mumbai.</li>
        </ol>

        <h2>Settings that keep messages safe</h2>
        <table class="data">
          <thead><tr><th>Setting</th><th>Tomazon’s value</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td><code>replication.factor</code></td><td>3</td><td>Each partition lives on three brokers, one per zone</td></tr>
            <tr><td><code>min.insync.replicas</code></td><td>2</td><td>A write is refused unless at least two copies are in sync, so losing one broker loses nothing</td></tr>
            <tr><td><code>acks</code> (producers)</td><td>all</td><td>The producer waits until every in-sync copy has the message. It’s the default since Kafka 3.0</td></tr>
            <tr><td><code>enable.idempotence</code> (producers)</td><td>true</td><td>A producer’s retry can’t write the same message twice. Also the default since Kafka 3.0</td></tr>
            <tr><td><code>retention.ms</code></td><td>7 days</td><td>A reader that breaks on a Friday night can still catch up after a long weekend</td></tr>
            <tr><td>Partitions for products</td><td>12</td><td>Room for up to 12 working copies of each consumer group</td></tr>
          </tbody>
        </table>

        <h2>What to watch</h2>
        <ol class="points">
          <li><strong>Consumer lag</strong> is the gap between the newest message and a group’s committed offset. It’s the number that would have caught the deaf listener in minutes, not 45.</li>
        </ol>
        <figure class="term">
          <figcaption>Lag for each partition (some columns left out)</figcaption>
<pre><span class="o">$ kafka-consumer-groups.sh --bootstrap-server $KAFKA_BROKERS --describe --group cache-invalidator

GROUP              TOPIC                    PARTITION  CURRENT-OFFSET  LOG-END-OFFSET  LAG
cache-invalidator  tomazon.public.products  0          48211           48211           0
cache-invalidator  tomazon.public.products  1          47120           47120           0
cache-invalidator  tomazon.public.products  2          46875           47302           427</span></pre>
          <ol class="points term-note">
            <li><code>CURRENT-OFFSET</code> is where the group has got to; <code>LOG-END-OFFSET</code> is the newest message. Partition 2 is 427 changes behind.</li>
            <li>A lag that’s large but falling is a reader catching up. A lag that keeps growing is a reader that has stopped, or can’t keep up.</li>
          </ol>
        </figure>
        <table class="data">
          <thead><tr><th>Watch</th><th>Why</th><th>Alert when</th></tr></thead>
          <tbody>
            <tr><td>Consumer lag, per group</td><td>A reader has stopped, or fallen behind</td><td>It grows for 5 minutes in a row</td></tr>
            <tr><td>Under-replicated partitions</td><td>A broker is down or slow, so fewer copies are safe</td><td>Above 0 for more than a few minutes</td></tr>
            <tr><td>Broker disk</td><td>7 days of messages must fit</td><td>Above 70% full</td></tr>
            <tr><td>WAL kept for the replication slot, in <code>pg_replication_slots</code></td><td>If Debezium stops, the primary keeps every WAL file since, and its disk fills</td><td>Above 10 GB</td></tr>
            <tr><td>Connector status</td><td>A failed connector stops publishing, quietly</td><td>Anything but <code>RUNNING</code></td></tr>
          </tbody>
        </table>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>Duplicates</td><td>After a crash or a rebalance, a consumer reads again everything since its last commit</td><td>Make every consumer idempotent. Deleting a key twice is harmless; for emails, record which event ids were sent</td></tr>
            <tr><td>A poison message</td><td>One message makes the consumer crash. It restarts, reads the same message, and crashes again, and its partition stops moving</td><td>Catch the error, send the message to a dead-letter topic, carry on, and alert</td></tr>
            <tr><td>A full primary disk</td><td>Debezium is down for a long time, and its slot keeps all the WAL since</td><td><code>max_slot_wal_keep_size</code>, and an alert on the slot. Past the limit, the slot is dropped, and Debezium must take a new snapshot</td></tr>
            <tr><td>A renamed column</td><td>Every raw CDC message changes shape, and readers break</td><td>Readers use only the fields they need. Events between teams go through the outbox</td></tr>
          </tbody>
        </table>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>The cluster</td><td>Amazon MSK: 3 × <code>kafka.m7g.large</code>, one per zone</td></tr>
            <tr><td>Getting changes in</td><td>Debezium on MSK Connect, reading the WAL of <code>products</code> and <code>outbox</code></td></tr>
            <tr><td>Topics</td><td><code>tomazon.public.products</code> (12 partitions, 7 days) and <code>outbox.event.order</code></td></tr>
            <tr><td>Readers</td><td>The cache invalidator (2 copies), the search indexer, the catalogue service’s own copy of products, and order emails</td></tr>
            <tr><td>Safety</td><td>Replication factor 3, <code>min.insync.replicas</code> 2, idempotent consumers, and alerts on lag</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Tomazon now runs many kinds of program: the core API, the catalogue service, two cache invalidators, the search indexer, the email sender and Debezium. Each runs on servers set up by hand, and each is deployed its own way.</li>
          <li>Questions that were easy with one app are hard now. If a server dies, who starts its programs somewhere else? If one crashes, who restarts it? How do you replace 40 running copies with a new version without downtime? And how does the catalogue service find the core API, when copies come and go?</li>
          <li>Chapter 9 packages each service as a container, and hands the running of them to an orchestrator: Kubernetes.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>A log is a database.</strong> Treat it like one: replicate it, watch its disk, plan its capacity, and test
            what happens when a broker dies.</li>
            <li><strong>Alert on lag, not just on “up”.</strong> Most failures in asynchronous systems are quiet: everything is
            running, and nothing is moving.</li>
            <li><strong>Every new moving part has a price.</strong> Kafka fixed lost changes, and brought brokers, connectors, slots
            and lag to look after. Add one only when it solves a problem you have.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Make every consumer idempotent, and put every group’s lag on a dashboard.</p>
        </aside>`
    }
  ]
};
