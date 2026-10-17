/* Chapter 5: Make it fast.
   Same conventions as the earlier chapters. The growth story continues from
   10,000 towards 100,000 users; this time the database is the bottleneck. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[5] = {
  intro: `
    <ol class="points lede">
      <li>10,000 users became a success, and over the next year the product grows towards 100,000.</li>
      <li>The app tier copes, but the database starts to run hot, and almost all of its work turns out to be reading.</li>
      <li>The answer is read replicas: copies of the database that take the reads. They work, and they bring a new problem with them: copies that are slightly behind.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Tell an app-tier problem from a database problem.</li>
        <li>Find the queries that cost the database the most, with <code>pg_stat_statements</code>.</li>
        <li>Work out your app’s read/write ratio, and explain why it decides how you scale.</li>
        <li>Scale reads with replicas, and explain how PostgreSQL streaming replication works.</li>
        <li>Explain the CAP theorem and the shades of consistency, with examples from a real app.</li>
        <li>Handle replication lag, with read your own writes and the other strategies.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'database-runs-hot',
      title: '100,000 users, and the database runs hot',
      sub: 'This time the app servers are fine. The database is doing too much reading.',
      html: `
        <ol class="points lede">
          <li>10,000 users was a success. Over the next year, the product grows towards 100,000.</li>
          <li>The app keeps up. The load balancer spreads the traffic, and the app tier adds servers when it’s busy and removes them when it’s quiet. Nothing crashes.</li>
          <li>Then, past a certain point, users start to feel it again: the chat is sluggish, and the conversation history takes seconds to load.</li>
        </ol>

        <h2>The app servers look healthy</h2>
        <figure class="term">
          <figcaption>On one of the app servers, at the busiest hour</figcaption>
<pre><span class="p">$</span> nproc
<span class="o">8</span>
<span class="p">$</span> uptime
<span class="o"> 10:31:07 up 20 days,  1 user,  load average: 1.12, 1.30, 1.25</span>
<span class="p">$</span> top
<span class="o">%Cpu(s): 14.2 us,  2.1 sy,  0.0 ni, 83.4 id,  0.0 wa,  0.0 hi,  0.3 si,  0.0 st</span></pre>
          <ol class="points term-note">
            <li>A load of 1.12 on 8 vCPUs, and the CPU 83% idle: the app servers have plenty of room, and memory looks just as calm.</li>
            <li>Yet requests are slow. The app servers are waiting for something, like Server 3 on page 1.3.</li>
            <li>Adding more app servers won’t help.</li>
          </ol>
        </figure>

        <h2>The database doesn’t</h2>
        <figure class="term">
          <figcaption>On the database server, at the same moment</figcaption>
<pre><span class="p">$</span> uptime
<span class="o"> 10:31:40 up 140 days,  1 user,  load average: 3.86, 3.71, 3.40</span>
<span class="p">$</span> top
<span class="o">%Cpu(s): 91.7 us,  5.8 sy,  0.0 ni,  2.1 id,  0.2 wa,  0.0 hi,  0.2 si,  0.0 st</span></pre>
          <ol class="points term-note">
            <li>A load of 3.86 on its 2 vCPUs, and the CPU 92% busy: the database is the tier that’s full.</li>
            <li>Almost no <code>wa</code>: it isn’t waiting for the disk. Its data is in RAM, and it’s busy computing answers to queries.</li>
            <li>So which queries?</li>
          </ol>
        </figure>

        <h2>What the database is busy with</h2>
        <figure class="term">
          <figcaption>PostgreSQL’s own statistics, with the pg_stat_statements extension turned on</figcaption>
<pre><span class="p">$</span> psql -d explorer
<span class="o">explorer=> SELECT calls, round(total_exec_time) AS total_ms,
                  round(mean_exec_time, 2) AS mean_ms, left(query, 48) AS query
             FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 6;

  calls  | total_ms | mean_ms |                      query
---------+----------+---------+--------------------------------------------------
 3000412 |  6300865 |    2.10 | SELECT id, role, content, created_at FROM messag
 2000188 |   800075 |    0.40 | INSERT INTO messages (conversation_id, role, con
 1500203 |   450061 |    0.30 | SELECT * FROM sessions WHERE token = $1
 1500091 |   450027 |    0.30 | SELECT * FROM user_settings WHERE user_id = $1
 1000117 |   400047 |    0.40 | SELECT * FROM users WHERE id = $1
 1000064 |   300019 |    0.30 | UPDATE conversations SET updated_at = now() WHER</span></pre>
          <ol class="points term-note">
            <li><code>pg_stat_statements</code> groups every query the database runs by its shape, and counts how many times it ran (<code>calls</code>), the total time and the average.</li>
            <li>Four of the top six are reads (<code>SELECT</code>). The top one, loading a conversation’s history, takes 72% of all the database’s time on its own.</li>
            <li>The writes (<code>INSERT</code> and <code>UPDATE</code>) are short, cheap and well down the list.</li>
          </ol>
        </figure>

        <h2>Why it’s mostly reads</h2>
        <ol class="points">
          <li>Think about what one chat session does. Opening the chat loads the user, their session, their settings, their list of conversations and the latest messages. All of that is reading.</li>
          <li>Then the user asks a few questions. Each one reads the session and the conversation so far, and writes two rows: the question, and the answer.</li>
        </ol>
        <table class="data">
          <thead><tr><th>One chat session</th><th class="num">Reads</th><th class="num">Writes</th></tr></thead>
          <tbody>
            <tr><td>Open the chat: user, session, settings, conversations, latest messages, product context</td><td class="num">6</td><td class="num">0</td></tr>
            <tr><td>Ask a question, 3 times: read the session and the conversation, write the question and the answer</td><td class="num">6</td><td class="num">6</td></tr>
            <tr><td>Total</td><td class="num">12</td><td class="num">6</td></tr>
          </tbody>
        </table>
        <ol class="points" start="3">
          <li>That’s about 70% reads and 30% writes. And because the reads are the heavier queries, they take an even bigger share of the database’s time:</li>
        </ol>
        <div class="ratio">
          <p class="ratio-k">Every 100 queries</p>
          <div class="budget" role="img" aria-label="Of every 100 queries, 70 are reads and 30 are writes."><span class="b-read" style="flex-grow:70"><b>70 reads</b></span><span class="b-write" style="flex-grow:30"><b>30 writes</b></span></div>
          <p class="ratio-k">The database’s time</p>
          <div class="budget" role="img" aria-label="Reads take 87% of the database’s time, writes 13%."><span class="b-read" style="flex-grow:87"><b>87% reading</b></span><span class="b-write" style="flex-grow:13"><b>13%</b></span></div>
        </div>

        <h2>The challenge</h2>
        <ol class="points">
          <li><strong>Writes aren’t the bottleneck.</strong> They’re a small share of the work, and each one is cheap.</li>
          <li><strong>Reads are.</strong> Every user who opens the chat makes the database fetch and sort history it has already sent many times before.</li>
          <li>More app servers won’t help, and a bigger database server only buys time (page 4.2). The challenge for 100,000 users is to serve far more reads, without sending every one of them to a single database server.</li>
          <li>The rest of this chapter is about how.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Measure the database query by query, not just by CPU.</strong> <code>pg_stat_statements</code> tells you
            which queries to fix first, and often it’s just one or two.</li>
            <li><strong>Know your read/write ratio.</strong> Most web apps read far more than they write, often 80–90% reads or
            more. That ratio decides which scaling tools fit.</li>
            <li><strong>Idle app servers with slow requests mean the time is going somewhere else.</strong> Follow it to the
            tier that’s actually full.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>When the app servers are idle and requests are slow, look at the database, and look at it query by query.</p>
        </aside>`
    },

    /* ========================================================= Read replicas */
    {
      group: 'Read replicas',
      slug: 'read-replicas',
      title: 'Read replicas',
      sub: 'One database takes the writes; copies of it answer the reads.',
      html: `
        <ol class="points lede">
          <li>Reads are 87% of the database’s work, and they don’t change anything. So they don’t all have to go to the same server.</li>
          <li>A <strong>read replica</strong> is a full copy of the database that keeps itself up to date with the original, the <strong>primary</strong>, and answers read queries.</li>
          <li>All writes (<code>INSERT</code>, <code>UPDATE</code>, <code>DELETE</code>) go to the primary, and reads go to the replicas. It’s one of the most common patterns in the industry. Older material calls it master–slave replication; today we say primary and replica.</li>
        </ol>

        <p>Here’s how the architecture changes. Step through it to see a read, a write, and how the change reaches the replicas:</p>
        <div class="widget" data-widget="replica-live"></div>

        <h2>How PostgreSQL keeps the replicas up to date</h2>
        <ol class="steps">
          <li><strong>The primary logs every change.</strong> Before changing any data, PostgreSQL appends a record of the change to its <strong>write-ahead log</strong> (WAL): an ordered list of everything that has happened to the database.</li>
          <li><strong>Each replica subscribes to that log.</strong> It connects to the primary over the private network and asks for the WAL, starting from wherever it left off.</li>
          <li><strong>The primary streams it.</strong> New records are sent on as soon as they’re written. This is <strong>streaming replication</strong>, and it’s built into PostgreSQL.</li>
          <li><strong>The replica replays it.</strong> It applies the records in exactly the same order, so its copy of the data matches the primary’s, a few milliseconds later.</li>
          <li><strong>The replica answers reads while it replays.</strong> PostgreSQL calls this a hot standby. Any attempt to write to it fails with an error.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it: checking replication from both sides</figcaption>
<pre><span class="p">$</span> psql -d explorer -c "SELECT client_addr, state, replay_lag FROM pg_stat_replication;"     <span class="c"># on the primary</span>
<span class="o"> client_addr |   state   |   replay_lag
-------------+-----------+-----------------
 10.0.3.21   | streaming | 00:00:00.012314
 10.0.3.22   | streaming | 00:00:00.018902
(2 rows)</span>
<span class="p">$</span> psql -h 10.0.3.21 -d explorer -c "SELECT pg_is_in_recovery();"                          <span class="c"># on a replica</span>
<span class="o"> pg_is_in_recovery
-------------------
 t
(1 row)</span></pre>
          <ol class="points term-note">
            <li>On the primary, <code>pg_stat_replication</code> lists every replica. Both are <code>streaming</code>, and each is about 12–19 ms behind (<code>replay_lag</code>).</li>
            <li>On a replica, <code>pg_is_in_recovery()</code> returns <code>t</code> (true): it’s a copy, replaying the primary’s log, and it won’t accept writes.</li>
          </ol>
        </figure>

        <h2>Sending each query to the right server</h2>
        <ol class="points">
          <li>The app now needs two connections: one to the primary for writes, and one to the replicas for reads.</li>
          <li>With several replicas, put them behind a single address, so the app doesn’t need to know how many there are: a DNS name, PgBouncer or HAProxy in front of them, or Amazon Aurora’s reader endpoint.</li>
        </ol>
        <figure class="term">
          <figcaption>Two engines in SQLAlchemy: one for writes, one for reads</figcaption>
<pre><span class="o">primary = create_engine("postgresql+psycopg://app@10.0.2.14/explorer")
replica = create_engine("postgresql+psycopg://app@db-read.internal/explorer")   </span><span class="c"># both replicas behind one name</span><span class="o">

def get_history(conversation_id):
    with replica.connect() as db:                  </span><span class="c"># a read: any replica will do</span><span class="o">
        return db.execute(HISTORY_SQL, {"cid": conversation_id}).all()

def save_message(conversation_id, role, content):
    with primary.begin() as db:                    </span><span class="c"># a write: always the primary</span><span class="o">
        db.execute(INSERT_SQL, {"cid": conversation_id, "role": role, "content": content})</span></pre>
          <ol class="points term-note">
            <li>Every function decides where it goes: reads use <code>replica</code>, writes use <code>primary</code>.</li>
            <li>With two replicas sharing the reads, the 87% of the database’s time spent reading is now split across two servers, and the primary is left with the writes. Need more read capacity? Add a replica.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Replicas scale reads, not writes.</strong> Every replica still has to replay every write. If writes are
            the bottleneck, more replicas won’t help (chapter 7).</li>
            <li><strong>A replica is also a spare.</strong> If the primary fails, a replica can be promoted to take its place.
            Amazon RDS Multi-AZ does this automatically.</li>
            <li><strong>Keep replicas as big as the primary.</strong> A smaller replica can fall behind just replaying a busy
            primary’s writes.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Send writes to the primary and reads to the replicas, and add replicas as the reads grow.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Read replicas',
      slug: 'replication-lag',
      title: 'Replication lag and the CAP theorem',
      sub: 'Copies take time to catch up, and distributed systems make you choose what to give up.',
      html: `
        <ol class="points lede">
          <li>Streaming is fast, but it isn’t instant. A replica is always slightly behind the primary: usually a few milliseconds, but under heavy load it can be a second or more.</li>
          <li>That delay is <strong>replication lag</strong>, and it brings a new kind of bug that isn’t really a bug.</li>
        </ol>

        <h2>Where did my question go?</h2>
        <ol class="steps">
          <li>A user asks the assistant: “Which ADC suits a 24-bit weigh scale?” The app saves the question: a write, so it goes to the primary.</li>
          <li>The page immediately reloads the conversation: a read, so it goes to a replica.</li>
          <li>The replica is 400 ms behind, so the question isn’t there yet. The conversation shows everything except what the user just typed.</li>
          <li>The user types it again. Half a second later the first one appears, and now there are two.</li>
        </ol>
        <p>Nothing is broken: every part did exactly what it was built to do. This is how a system with copies behaves. Try it:</p>
        <div class="widget" data-widget="lag-sim"></div>

        <h2>The CAP theorem</h2>
        <ol class="points">
          <li>A system that keeps copies of its data on several machines would like to promise three things:</li>
        </ol>
        <dl class="terms">
          <div><dt>Consistency</dt><dd>Every read sees the latest write, whichever copy answers it.</dd></div>
          <div><dt>Availability</dt><dd>Every request gets an answer, even when part of the system can’t be reached.</dd></div>
          <div><dt>Partition tolerance</dt><dd>The system keeps working when the network between its machines breaks.</dd></div>
        </dl>
        <ol class="points" start="2">
          <li>The CAP theorem says that while the network is split, you can’t keep both consistency and availability. It’s often summed up as “pick two of three”, but that’s misleading.</li>
          <li>Networks do break, so partition tolerance isn’t something you can opt out of. The real question is what you give up while the network is broken: consistency, or availability.</li>
          <li>In our setup: the link between the primary and replica 1 fails. Replica 1 stops receiving changes, but users’ reads still arrive at it. There are two possible answers:</li>
        </ol>
        <table class="data">
          <thead><tr><th>Choose</th><th>What happens</th><th>Right for</th></tr></thead>
          <tbody>
            <tr><td>Consistency</td><td>Replica 1 stops answering, or the app sends its reads to the primary. Some reads fail or slow down, but nobody sees old data.</td><td>Permissions, payments, quotas</td></tr>
            <tr><td>Availability</td><td>Replica 1 keeps answering, with data that gets older every second the link stays down.</td><td>Chat history, product pages, dashboards</td></tr>
          </tbody>
        </table>
        <ol class="points" start="5">
          <li>Even when the network is fine, there’s a smaller version of the same trade-off. Making every write wait for the replicas keeps them fresh, but slows every write; not waiting keeps writes fast, but lets reads be slightly stale. This extension is called <strong>PACELC</strong>.</li>
          <li>PostgreSQL’s default, asynchronous replication, chooses fast writes, and accepts the lag you saw above.</li>
        </ol>

        <h2>Shades of consistency</h2>
        <table class="data">
          <thead><tr><th>Model</th><th>What it promises</th><th>Where it fits in our app</th></tr></thead>
          <tbody>
            <tr><td>Strong</td><td>Every read sees the latest write, on every server</td><td>Removing someone’s access must take effect at once, everywhere</td></tr>
            <tr><td>Eventual</td><td>If writes stop, every copy catches up, sooner or later</td><td>Usage dashboards, “most asked questions”, counts</td></tr>
            <tr><td>Read your own writes</td><td>You always see your own changes, even if others see them a little later</td><td>The user sees the question they’ve just asked</td></tr>
            <tr><td>Causal</td><td>An effect never shows up before its cause</td><td>In a shared conversation, nobody sees the assistant’s answer without the question it answers</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>Replicas with asynchronous replication give eventual consistency by default.</li>
          <li>The good news: most of the app is perfectly happy with that. The skill is finding the few places that aren’t, and handling them. That’s the next page.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Replication lag is physics, not a bug.</strong> You can make it smaller, but never zero without slowing
            every write.</li>
            <li><strong>Choose consistency per feature, not for the whole system.</strong> Chat history can be a moment behind;
            permissions can’t.</li>
            <li><strong>CAP is a decision you make for failures.</strong> Know in advance which side each feature is on, so the
            system behaves the way you chose when the network does break.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Every copy of the data is a little out of date. Decide, feature by feature, how out of date is acceptable.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Read replicas',
      slug: 'stale-reads',
      title: 'Living with stale reads',
      sub: 'You can’t remove the lag, so make the app smart enough that users never notice it.',
      html: `
        <ol class="points lede">
          <li>Removing replication lag means slowing down every write, so most systems don’t.</li>
          <li>Instead, the app decides, for each read, whether a slightly old answer is fine. Here are the strategies, from the simplest to the strictest.</li>
        </ol>

        <h2>Six ways to handle it</h2>
        <ol class="points">
          <li><strong>Accept it where it’s harmless.</strong> Dashboards, usage stats, the list of popular questions: being a few seconds out of date changes nothing. Read them from the replicas and move on.</li>
          <li><strong>Read your own writes.</strong> Right after a user writes something, send that user’s reads to the primary for a short window. Everyone else keeps reading from the replicas. This fixes the missing question.</li>
          <li><strong>Wait for the exact position.</strong> A more precise version: after the write, note the primary’s position in its log (<code>pg_current_wal_lsn()</code>). Send the user’s reads to a replica only once it has replayed past that position (<code>pg_last_wal_replay_lsn()</code>), and to the primary until then.</li>
          <li><strong>Keep the critical reads on the primary.</strong> Permissions, payments, quotas, and anything a decision depends on. They’re a small share of the reads, so the replicas still take most of the load.</li>
          <li><strong>Watch the lag, and drop lagging replicas.</strong> Alert when <code>replay_lag</code> passes a second or two, and take a replica out of the read pool when it falls far behind, so a struggling replica can’t serve very old data.</li>
          <li><strong>Need no lag at all? Use synchronous replication.</strong> With <code>synchronous_commit = remote_apply</code>, each commit waits until a replica has applied it. Reads are always fresh, but every write is slower, and if that replica goes down, writes stop. That’s CAP, choosing consistency.</li>
        </ol>

        <figure class="term">
          <figcaption>Read your own writes in FastAPI: a short window after each write</figcaption>
<pre><span class="o">READ_YOUR_WRITES = 30   </span><span class="c"># seconds: comfortably longer than our worst replication lag</span><span class="o">

def db_for_read(request: Request):
    wrote_at = float(request.cookies.get("wrote_at", 0))
    return primary if time.time() - wrote_at &lt; READ_YOUR_WRITES else replica

@app.post("/api/conversations/{cid}/messages")
def ask(cid: int, msg: Message, response: Response):
    save_message(cid, "user", msg.text)              </span><span class="c"># a write, on the primary</span><span class="o">
    response.set_cookie("wrote_at", str(time.time()), max_age=READ_YOUR_WRITES)
    ...

@app.get("/api/conversations/{cid}")
def history(cid: int, request: Request):
    with db_for_read(request).connect() as db:       </span><span class="c"># the primary for 30 s after a write</span><span class="o">
        return db.execute(HISTORY_SQL, {"cid": cid}).all()</span></pre>
          <ol class="points term-note">
            <li>After a user writes, a cookie records when. For the next 30 seconds, that user’s reads go to the primary.</li>
            <li>Everyone else, and this user after the window, reads from the replicas as usual.</li>
            <li>Make the window longer than the lag you normally see, and watch the lag so you know when that stops being true.</li>
          </ol>
        </figure>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Data</th><th>Strategy</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>A user’s own conversation, right after they ask</td><td>Read your own writes</td><td>They must see what they just typed</td></tr>
            <tr><td>Conversation history, product pages</td><td>Replicas</td><td>A moment behind is fine, and these are most of the reads</td></tr>
            <tr><td>Who has access to what</td><td>Always the primary</td><td>Removing access has to work at once</td></tr>
            <tr><td>Usage dashboards</td><td>Replicas</td><td>Nobody notices if a count is a few seconds old</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Read replicas are a big win, with a price.</strong> You trade the simplicity of one up-to-date database
            for the complexity of copies that lag behind.</li>
            <li><strong>Lag is permanent, so design for it.</strong> It can’t be removed without slowing writes; the app has to
            handle it.</li>
            <li><strong>Stale data hurts most right after a user changes something.</strong> That moment is where trust is won
            or lost, so protect it with read your own writes.</li>
            <li><strong>Most reads don’t need to be fresh.</strong> Keep the strict handling for the few that do, and the
            replicas carry everything else.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Send a user’s reads to the primary right after they write, keep the critical reads there too, and let the replicas handle the rest.</p>
        </aside>`
    }
  ]
};
