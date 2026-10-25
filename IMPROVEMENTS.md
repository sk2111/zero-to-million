# Zero to a Million Users: release review

Reviewed 25 October 2026, at commit `10fbe4e`. The live site at sk2111.github.io matches this commit.
The review covers all 14 chapters, the cheat sheet, the widgets, the styles, the README and the published site.

**How to use this file**

- Every item has an ID, a priority, where to look, what's wrong, and a suggested fix. Tick the box when it's done.
- **P1**: wrong, broken or misleading. Fix before sharing the book widely.
  **P2**: weakens the book, or trips up a careful reader.
  **P3**: polish.
- Finished items move to [IMPROVEMENTS-DONE.md](IMPROVEMENTS-DONE.md), so this file only lists what's left.
- File links are relative to the repo root. Line numbers are as of `10fbe4e`.
- Sections 1 and 4 come from reading the whole book and testing the site. Section 2 merges four independent
  chapter-by-chapter fact checks with that reading. Where two reviews found the same problem, it appears once.

---

## Verdict

**Functionality is solid.** All 68 pages render in light and dark, at 1440, 1280 and 390 px wide, with no
console errors, no broken internal links, no empty widgets and no `NaN` or `undefined` on screen, even after
every slider, button and select was worked. The arrow keys walk all 68 pages in order, and the simulators' maths
matches the text. Section 5 lists what the code review found:
- diagram pages that stay in memory (K2);
- a "Copy commands" button that can empty the clipboard (K3);
- gaps in keyboard and screen-reader support (K7–K11).

**The design is consistent and polished.** Typography, the sidebar, the notes and the architecture diagrams
read as one system in both themes. The problems are local: tiny text in the widest diagrams on a laptop, and print.

**Chapters 1 to 8 are careful and well taught.** The chapter 1 reviewer re-did every calculation and terminal
total and found them all correct. Chapter 7 is the strongest chapter.

**The weaknesses are at the level of the whole story:**

1. Tomazon's numbers stop following the book's own traffic model after chapter 4 (S1).
2. Chapters 9 to 14 were cut down hard on 18 October. Some of what was removed is still referred to, or was
   the answer to the problem the chapter sets up (S3, S12, S13).
3. A few later claims don't hold up for an expert reader: the chapter 12 flash sale, and home regions in
   chapter 13 (S3, S4, S5).
4. Chapter 6's cache numbers ignore the cache stampede (6-1).
5. Some snippets won't run as written: the PgBouncer config in 3-4, the Nginx config in 4-2, and the Debezium
   setup in 8-2.

### Do these first

| # | Item | Why first |
|---|---|---|
| 1 | [S3](#s3) Chapter 12's flash sale | The chapter sets a problem it doesn't solve; the answer is in git |
| 2 | [S4](#s4), [S5](#s5) Home regions in chapter 13 | Contradicts chapter 12's sharding and its own privacy point |
| 3 | [6-1](#ch6) Cache stampede | Chapter 6's headline numbers are wrong under its own assumptions |
| 4 | [7-1](#ch7) Diagrams break 7.3's contract | Every diagram from 8.4 on shows the shortcut that 7.3 rejects |
| 5 | [S1](#s1) One consistent set of numbers | The book's promise is "each time, we look at the numbers" |
| 6 | [S8](#s8) Indexes | Promised in 3.3 and claimed in 12.1, never taught |
| 7 | [C1](#c1) Cheat sheet rules with no source | Links open pages that don't contain the rule |

### Decisions for you

Some items change the scope of the book, so they're yours to call before anyone edits:

- [ ] **D1. How long should chapters 9 to 14 be?** They were cut from 3 to 4 pages each to 1 or 2 on 18 October
  (see S13 for the list). Options:
  - Keep them short, but add the notes, rules and missing links (minimum).
  - Restore a few key pages from git (recommended: the CloudFront page in 9 and the flash-sale page in 12).
  - Restore most of them.
- [ ] **D2. Title versus content.** The book is titled "Zero to a million users" but runs to 25 million (S14).
  Options:
  - Keep the title and make chapters 7 to 14 an explicit "Beyond a million" part (recommended).
  - Change the subtitle.

  The later-chapter references are fixed; S17 lists the other two kinds.
- [ ] **D4. What does the book call itself?** "Workshop" (chapters 2 and 14), "the book" (cheat sheet) and "a guide"
  (home page) are all in use.
- [ ] **D5. How should phone readers see the wide diagrams?** Today they scroll sideways with no hint (UX5).

---

## 1. Story and continuity (whole book)

<a id="s1"></a>
- [ ] **S1 · P1 · The numbers stop following the model after chapter 4.**
  - Chapter 2's model is 1 shopper in 10 online at the busiest hour, each making a request every 2 s. It gives
    500 req/s at 10K users, and chapter 4 uses that figure.
  - The same model gives 5,000 req/s at 100K users (about 143 vCPUs at 20 ms of CPU each) and 25,000 req/s at
    500K users.
  - Yet the diagrams show 3 × c7g.2xlarge (24 vCPUs) at 100K, 500K and 2M users
    ([widgets.js:1028](zero-to-million/js/widgets.js#L1028), [widgets.js:1958](zero-to-million/js/widgets.js#L1958)),
    and page 5.1 shows them about 15% busy.
  - The database primary stays a 2-vCPU r7g.large up to 2M users
    ([widgets.js:1031](zero-to-million/js/widgets.js#L1031), [widgets.js:1980](zero-to-million/js/widgets.js#L1980)).
    In 12.1 it is suddenly an r7g.8xlarge, with no step in between
    ([ch12:37](zero-to-million/js/ch12-split-the-data.js#L37)).
  - Smaller mismatches of the same kind:
    - 3.4's "6 GB hot set" and "1,500 IOPS" against 2.2's ~150 MB database and the t4g.nano's 250 IOPS cap (see 3-1).
    - 6.1's "10 ms per query" against 3.3's 0.2–0.5 ms round trip (see 6-5).
    - 9.1's 100 million product pages a month against the 6.2 widget's 5,000 a second (see 9-6).
  - **Fix:**
    - Derive every chapter's numbers from one model, kept in a spreadsheet.
    - Show them in a small "Tomazon now" line on each chapter's first page: users, peak req/s, app servers,
      database primary, data size.
    - Update the diagram labels to match.
    - Alternatively, say once that from chapter 5 on "users" means registered accounts, with a stated share
      active at the peak.
    - Either way, show the primary being scaled up (see S9).

<a id="s3"></a>
- [ ] **S3 · P1 · The flash sale in chapter 12 isn't solved by what the chapter adds.**
  - 12.1 opens with 20,000 attempts a second to buy one phone. Every one of them updates the same stock row on
    the products primary, which "isn't sharded" ([ch12:47](zero-to-million/js/ch12-split-the-data.js#L47)).
  - Sharding orders by customer never touches that hot row. After the change each shard takes "about 1,000
    a second" ([ch12:81](zero-to-million/js/ch12-split-the-data.js#L81)), so the launch-day load is never answered.
  - The answer used to be in the book. The page "Keep the sale off the shared database" (a waiting room, stock
    counted atomically in Redis, orders through SQS, and a separate cell for the sale) was removed in `fa56834`:
    `git show 443e472:zero-to-million/js/ch12-split-the-data.js`.
  - Even if the load spread evenly, 20,000 a second across 4 shards is at least 5,000 writes a second each.
    Today's 32-vCPU primary does 4,000 rows a second at 60% CPU, and every order writes several rows.
  - **Fix:**
    - Restore that page, trimmed, as 12.2.
    - Add a "Launch: 20,000 attempts a second" row to the before and after table.
    - Name the problem: the shard key spreads customers, not products.
  - Or change 12.1's trigger to steady write growth (4,000 rows/s at 60% CPU, +100 GB a month) and drop the
    launch.

<a id="s4"></a>
- [ ] **S4 · P1 · Home regions don't fit chapter 12's shard key.**
  - Chapter 12 hashes customers into 64 logical shards, so each logical shard holds customers from every country.
  - Moving one to Frankfurt therefore can't give "each customer's data… in the region they shop from"
    ([ch13:52](zero-to-million/js/ch13-go-global.js#L52)). The 13.1 diagram's step text makes the same claim.
  - **Fix:** one short paragraph explaining how a customer gets a home region:
    - Keep a small directory of customer → home region, set at sign-up and carried in the session.
    - Hash each customer into their region's own range of logical shards.
    - Moving existing customers then has to be done customer by customer, not one logical shard at a time.

<a id="s5"></a>
- [ ] **S5 · P1 · Chapter 13 contradicts itself on personal data.**
  - It says "No personal data leaves home" ([ch13:49](zero-to-million/js/ch13-go-global.js#L49)).
  - Then "Every shard has a standby in another region" ([ch13:53](zero-to-million/js/ch13-go-global.js#L53)).
  - **Fix:** put each standby in a second region within the same jurisdiction (Hyderabad for Mumbai, another EU
    region for Frankfurt), or say what the law allows.

<a id="s6"></a>
- [ ] **S6 · P2 · Chapter 13 never says where stock and price are checked at checkout.**
  - Stock and prices reach each cell asynchronously from Mumbai, yet checkout runs in the cell.
  - So a cell can oversell, or charge a price that is minutes old ("Catalogue changes arrive late; everything else
    works").
  - That contradicts 5.3 ("Strong: stock at checkout") and 6.3 ("never charge from a cached price").
  - **Fix:** one or two lines.
    - Each region owns its own warehouses' stock. Europe already has the Amsterdam warehouse (11.1).
    - Or checkout reserves stock and confirms the price in Mumbai: one long round trip, at a moment when shoppers
      expect to wait.


<a id="s8"></a>
- [ ] **S8 · P1 · Indexes are promised and claimed, but never taught.**
  - 3.3 says "Make sure each query uses an index… Chapter 5 goes deeper"
    ([ch3:246](zero-to-million/js/ch3-scale-up.js#L246)). Chapter 5 has no index or `EXPLAIN`.
  - 12.1's table then says indexes are "Done (pages 3.3 and 5.1)"
    ([ch12:58](zero-to-million/js/ch12-split-the-data.js#L58)).
  - 5.1's top query, catalogue search at 77% of database time, is exactly the case for one.
  - **Fix:** add a short section to 5.1: `EXPLAIN ANALYZE` on the search query, a sequential scan, an index (or a
    trigram or full-text index), then measure again. What's left justifies the replicas.

<a id="s9"></a>
- [ ] **S9 · P2 · Chapter 5 skips the book's own "scale up first" rule.**
  - 4.2 says "Scale up first while it's cheap and simple".
  - At 100K users the database is still a 2-vCPU r7g.large, and 5.1 goes straight to replicas: "a bigger
    database server only buys time" ([ch5:120](zero-to-million/js/ch5-make-it-fast.js#L120)).
  - **Fix:** one step. Scale the primary up and measure, then add replicas because reads keep growing and a
    replica doubles as a spare. This also explains the r7g.8xlarge in 12.1 (S1).

<a id="s10"></a>
- [ ] **S10 · P2 · Parts appear without being introduced.**
  - **OpenSearch and the search indexer.**
    - First seen in 8.1 ("**Search** needs every product change", [ch8:57](zero-to-million/js/ch8-publish-events.js#L57))
      and in the 8.4 and 9.2 diagrams.
    - Up to chapter 5, search was a PostgreSQL query.
  - **The email sender and the photo resizer.**
    - Listed as running programs on 9.3's last line ([ch9:183](zero-to-million/js/ch9-serve-it-nearby.js#L183)),
      and chapter 10 depends on both.
    - Chapter 8 only says order emails *would* suit a queue.
  - **Containers.** "Every service is already packaged as a container image"
    ([ch10:45](zero-to-million/js/ch10-run-many-services.js#L45)).
  - **Auto scaling.**
    - 5.1 says "the app tier adds servers when it's busy" ([ch5:35](zero-to-million/js/ch5-make-it-fast.js#L35)).
    - But chapter 4 has a fixed Nginx upstream, and 10.1 says sales need servers "added by hand"
      ([ch10:39](zero-to-million/js/ch10-run-many-services.js#L39)).
  - **A NAT gateway.**
    - From 4.4 the app servers sit in a private subnet, so they can't reach the payment gateway, SMS or email.
    - A NAT gateway first appears as a line in 14.1's bill.
  - **The load balancer's own server** (c7g.medium). It appears in the diagrams, and in the text only in passing.
  - **Fix:** a sentence or two where each one arrives. Remove the auto-scaling claim from 5.1 or introduce it.

<a id="s11"></a>
- [ ] **S11 · P2 · Two threads are opened and never closed.**
  - **Payments and orders across services.**
    - 7.4 "What Tomazon has signed up for" raises paying for an order that was never saved.
    - Chapter 8 then handles product changes only. There is no outbox, saga or idempotency key for payments.
    - Fix: resolve it in chapter 8 (order events through the same CDC path, and an idempotency key on payment
      calls), or end 7.4 by naming it as an accepted risk.
  - **High availability.**
    - The database is a single point of failure from 2.5 on, and 4.4 names the load balancer as one too.
    - The book never says Tomazon fixed either. Standbys first appear in chapters 12 and 13.
    - Fix: a short "survive losing a server or a zone" step in chapter 4 or 5: an ALB across zones, a database
      standby with automatic failover, and RPO and RTO in one line each. `chapters.js` still lists "Removing the
      single point of failure" as a chapter 3 topic.

<a id="s12"></a>
- [ ] **S12 · P2 · Chapter 9 was cut too far.**
  - The page "Photos through CloudFront" and 9.1's round-trip section were removed in `3d3ec5a`.
  - What's left still depends on them:
    - The outcome "Send fewer bytes, by making photos smaller" has no page.
    - The cost table ($8,800 → $9,100 → $2,100 → $1,450) has no explanation.
    - "Make it private, so only CloudFront can read it" is never explained.
    - The photo resizer is never introduced.
    - The `edge-latency` widget is orphaned.
  - **Fix:** restore a slim 9.3 from `git show 1ff67a9:zero-to-million/js/ch9-serve-it-nearby.js`: a private
    bucket with origin access control, versioned names, and WebP on upload. Add the four bullets under the
    cost table, and put the flat-rate plan in "What we chose".
  - See 9-1 for the full list.

<a id="s13"></a>
- [ ] **S13 · P2 · Chapters 10 to 14 are outlines next to the rest** (decision D1).
  - Each was 3 or 4 pages until 18 October. The earlier versions are in git:

    | Chapter | Restore from | Pages it had |
    |---|---|---|
    | 10 | `1ff67a9` | The night a server died · Containers: one package that runs anywhere · Kubernetes: say what, not how · Tomazon on EKS |
    | 11 | `1ff67a9` | Slow in Europe, fast at home · Do more at the edge · A second region for Europe |
    | 12 | `443e472` | The launch that could sink checkout · Keep the sale off the shared database · Sharding: more than one primary · Moving to shards, and living with them |
    | 13 | `529dc48` | 20 million users, and four regions with one home · A shop in every region · Feeding each region its data · Writes near home, and losing a region |
    | 14 | `529dc48` | The bill that outgrew the business · Tune first, then decide where to run · Moving without stopping · What it all comes down to |

  - **What's missing compared with chapters 2 to 9.** Pages 10.1, 11.1, 12.1, 13.1 and 14.1 have:
    - no "For system design" box and no "Rule of thumb" box;
    - no "Try it" terminal, no "What we chose" and no "Where this leads";
    - one-sentence intros, and two or three "By the end you can" items.
  - **What an expert reader will look for and not find:**
    - Kubernetes health probes, requests and limits, and autoscaling.
    - How the edge sends reads to the nearest region.
    - Resharding, cross-shard queries, hot shards and global IDs.
    - Failing over between regions.
  - **Fix (minimum):**
    - Add a design box and a rule box to each of these pages, so the cheat sheet's rules exist where it links (C1).
    - Embed the four finished but unused widgets that match these chapters: `k8s-cluster` (10), `ttfb-budget` (11),
      `shard-map` (12) and `cloud-or-own` (14). It's the cheapest depth available.
  - **Fuller:** restore one more page per chapter from git. Chapter 12 needs it most, then 13.

<a id="s14"></a>
- [ ] **S14 · P2 · The title promises a million users; the book goes to 25 million** (decision D2).
  - The hero, the sidebar and the subtitle all say "to a million users".
  - The home page scale ends at 1M and puts chapters 8 to 14 together at the 10M mark as "Beyond a million".
    Their real starting points run from 2M to 25M.
  - 6.3 ends "Congratulations! You've taken Tomazon to a million users."
    ([ch6:285](zero-to-million/js/ch6-cache-it.js#L285)). That is at 500K users, a chapter before 1M, and it's
    the only "Congratulations" in the book.
  - **Fix:**
    - Keep the title and make chapters 7 to 14 an explicit part, "Beyond a million", with a group heading in the
      sidebar and the roadmap.
    - Extend the scale to 25M, with each chapter on its own mark.
    - Move the congratulations to 7.1's opening, or drop it.

<a id="s15"></a>
- [ ] **S15 · P3 · Chapter openings don't follow one pattern.**
  - Chapters 3–5 and 10–14 title their first page "N users, and …". Chapters 6–9 don't.
  - Chapter 8 never states its user count. "Tomazon passes 2 million users" was removed in `068b0c3`.
  - In chapters 3 and 5 the intro repeats the first page's lede almost word for word, for example "10,000 users was a
    success…" in chapter 5.
  - **Fix:** one pattern for every chapter. The intro says where Tomazon is. The first page says what broke,
    titled "N users, and …".

<a id="s16"></a>
- [ ] **S16 · P3 · Words that clash across chapters.**
  - "Opens in Europe" (11) and "opens in Singapore and Ohio" ([ch13:10](zero-to-million/js/ch13-go-global.js#L10)):
    shoppers there were already served from chapter 9. Say "opens an AWS region in…".
  - "Users" and "shoppers" alternate.
  - "Bangalore" and "Bengaluru" ([ch9:45](zero-to-million/js/ch9-serve-it-nearby.js#L45) and
    [ch9:87](zero-to-million/js/ch9-serve-it-nearby.js#L87)).
  - "Datacenter" (chapter 1) and "data centre" (chapter 14). The book is otherwise British: optimise, utilisation, fibre.
  - Product ids: `TZ-10442` (6.1), "product 1042" (8.2), and `product_id: int` (6.3).
  - "Workshop", "book" and "guide": see D4.


---

## 2. Content, chapter by chapter

Items already covered in section 1 aren't repeated here.

<a id="ch1"></a>
### Chapter 1: Fundamentals

Every calculation and terminal total was re-done and is correct, and the HTML is well formed. What's left is
mostly precision and currency.


<a id="ch2"></a>
### Chapter 2: One server

The arithmetic is right throughout, and so are the t4g.nano's specs (5% baseline per vCPU, 32 Mbps, 250 IOPS,
5.4 MB/s, unlimited mode by default).

- [ ] **2-1 · P2 · Port 80 is missing.** "Port 443 open to everyone" plus a Let's Encrypt certificate
  ([ch2:321](zero-to-million/js/ch2-one-server.js#L321), and the pilot-arch widget). Certbot's HTTP-01 challenge
  and the HTTP-to-HTTPS redirect both need port 80. Say "80 (redirect only) and 443", or use DNS-01 with Route 53.
- [ ] **2-2 · P2 · Two figures in 2.2 have no breakdown.**
  - "About 400 MB" and "About 670 MB" ([ch2:126](zero-to-million/js/ch2-one-server.js#L126)) aren't explained;
    the 670 MB only appears in 3.1.
  - The growth to 10,000 products at 1,000 shoppers isn't among the stated assumptions.
- [ ] **2-3 · P3 · Payment gateways.** "Razorpay or Stripe" ([ch2:190](zero-to-million/js/ch2-one-server.js#L190)):
  Stripe India has been invite-only for new businesses since 2024 (medium confidence). Consider "Razorpay or Cashfree".

<a id="ch3"></a>
### Chapter 3: Scale up, split out

- [ ] **3-1 · P1 · 3.4's sizing contradicts chapter 2**
  ([ch3:372–375](zero-to-million/js/ch3-scale-up.js#L372)).
  - "Measure the pilot… about 50 requests a second": the pilot served 5. 50 is the 1,000-shopper figure.
  - "20 ms of CPU" is twice 2.2's estimate, with no comment.
  - "Hot tables and indexes come to about 6 GB": 2.2 puts the whole database at about 150 MB.
  - "About 1,500 IOPS": the t4g.nano's steady limit is 250, and 4.1 shows about 220 IOPS at ten times the users.
  - **Fix:**
    - "At about 1,000 shoppers: 50 req/s, as 2.2 predicted, but 20 ms of CPU each, twice the estimate."
    - Make the hot set about 1 GB and say what's in it.
    - Drop the IOPS to 100–200.
- [ ] **3-4 · P2 · The minimal `pgbouncer.ini` won't accept connections**
  ([ch3:258–265](zero-to-million/js/ch3-scale-up.js#L258)).
  - With no `listen_addr`, it listens only on a Unix socket.
  - There's no `auth_type` or `auth_file`.
  - psycopg 3's prepared statements break transaction pooling.
  - Add `listen_addr = 127.0.0.1`, `auth_type = scram-sha-256`, `auth_file = …` and `max_prepared_statements = 200`.
    In 4.4, note that `listen_addr` becomes the private IP.
- [ ] **3-5 · P2 · Four workers break the book's own rule.** The 670 MB budget gives "FastAPI, 4 workers" on 2 vCPUs
  ([ch3:77–86](zero-to-million/js/ch3-scale-up.js#L77)), against the one-async-worker-per-vCPU rule. Grow the
  memory through PostgreSQL instead, or explain the workers.
- [ ] **3-6 · P2 · The diagnosis ignores CPU and network.**
  - By 2.2's own numbers, CPU (5× the baseline) and network (2.5×) run out before memory (1.3×).
  - 3.1 shows only memory, never the CPU credits 2.6 told you to watch.
  - `free` shows 612 MB swapped, while the bar says 158 MB too much.
  - [ch3:124](zero-to-million/js/ch3-scale-up.js#L124) cites load and credit alarms that 2.6 never set.
- [ ] **3-7 · P2 · Own PostgreSQL or RDS?** The book never says which Tomazon picks
  ([ch3:367](zero-to-million/js/ch3-scale-up.js#L367)). Chapter 4 depends on it: it runs `iostat` on the server and
  installs PgBouncer there, which RDS doesn't allow. State the choice and the reason.
- [ ] **3-8 · P3 · Gaps on the migration page.**
  - `pg_restore` needs the target database to exist.
  - The photos have to move to the new app server too.
  - Rolling back loses the writes made since the switch.
  - The 3.2 diagram shows c7g.large and 16 GB before 3.4 chooses them.

<a id="ch4"></a>
### Chapter 4: Scale out

The scale-up versus scale-out maths, the per-vCPU pricing and the PgBouncer move are all correct.

- [ ] **4-1 · P2 · The plan for one missing server is never chosen.** 4.2 states the rule
  ([ch4:139–141](zero-to-million/js/ch4-scale-out.js#L139)), then 4.4 ships two servers, each too small to carry the
  peak alone. "Rolling deploys… Users never see an outage" overloads the one left. Chapter 5's diagram then shows
  three servers, unexplained. Say what was chosen: preferably three servers.
- [ ] **4-2 · P2 · The Nginx config won't load.** `listen 443 ssl` with no `ssl_certificate` and
  `ssl_certificate_key` fails `nginx -t` ([ch4:195–212](zero-to-million/js/ch4-scale-out.js#L195)). Also add
  `proxy_set_header Host $host` and `X-Forwarded-Proto`, or FastAPI builds the wrong redirect URLs.
- [ ] **4-3 · P2 · S3: the policy and the cost are both wrong**
  ([ch4:267–268](zero-to-million/js/ch4-scale-out.js#L267)).
  - A bucket policy can't limit reads to "Tomazon users"; it makes the photos public. Block Public Access must
    also be turned off.
  - "10 GB cost about 25 cents" is storage only. Sending the photos costs about $0.11 per GB.
- [ ] **4-4 · P2 · Least connections versus async workers.** The case for least connections assumes blocking
  workers ([ch4:186](zero-to-million/js/ch4-scale-out.js#L186)). The book chose async workers, which a checkout
  waiting on the payment gateway doesn't tie up. The `lb-sim` widget also shows 4 workers per server, against 8 in
  the architecture. Model the slots as in-flight limits, or say checkout is a sync endpoint.
- [ ] **4-5 · P3 · Smaller points.**
  - "The new weak spots" lists only the load balancer, but the single database is one too.
  - Sessions are already in the database (the `sessions` table in 3.3); say so in 4.4.
  - "Deploying… a short outage" overstates it: Gunicorn reloads gracefully on HUP.
  - "it moves to a small server" ([ch4:169](zero-to-million/js/ch4-scale-out.js#L169)) has an unclear "it".

<a id="ch5"></a>
### Chapter 5: Make it fast

The query statistics check out (77%, 95%, the visit ratios), and so do streaming replication,
read-your-own-writes and the LSN technique.

- [ ] **5-2 · P2 · The replicas have no pooling.** 3 servers × 8 workers × a pool of 10 is 240 connections per replica,
  above PostgreSQL's default `max_connections` of 100 ([ch5:189–194](zero-to-million/js/ch5-make-it-fast.js#L189)).
  Put PgBouncer on or in front of the replicas.
- [ ] **5-3 · P2 · "Waits until a replica has saved the order… Always up to date" is wrong**
  ([ch5:286](zero-to-million/js/ch5-make-it-fast.js#L286), and the cap-pacelc widget at
  [widgets.js:1165](zero-to-million/js/widgets.js#L1165)). A synchronous commit only *flushes* the WAL; reads are
  fresh only with `remote_apply`, and only from that replica.
- [ ] **5-4 · P2 · Multi-AZ isn't a read replica.** "A replica can be promoted… RDS Multi-AZ does this automatically"
  ([ch5:214](zero-to-million/js/ch5-make-it-fast.js#L214)). An RDS Multi-AZ standby is separate and can't serve
  reads; read replicas are promoted by hand. Separate the two.
- [ ] **5-5 · P2 · Page 5.3 is too dense**: the lag story, a widget, distributed systems, CAP, two tables, PACELC, a
  second widget and four consistency models. Split it into "Replication lag" and "CAP and PACELC".
- [ ] **5-6 · P3 · Smaller points.**
  - With 400 ms of lag, "Half a second later the first order appears" reads as if the shopper reorders within half
    a second.
  - "Two connections" should be "two connection pools".
  - `pg_stat_replication` needs a privileged role.
  - No step actually creates a replica (`pg_basebackup -R`).
  - The code is sync, while the book recommends async.
  - "10,000 users became/was a success" is awkward.

<a id="ch6"></a>
### Chapter 6: Cache it

- [ ] **6-1 · P1 · The cache stampede is missing, so the headline numbers are wrong**
  ([ch6:159](zero-to-million/js/ch6-cache-it.js#L159), [:168](zero-to-million/js/ch6-cache-it.js#L168),
  [:205](zero-to-million/js/ch6-cache-it.js#L205), [widgets.js:1242](zero-to-million/js/widgets.js#L1242)).
  - With cache-aside as written, the 1-second rebuild isn't stored until it finishes. At 500 requests a second,
    about 500 requests miss together each time `home:v1` expires or is deleted: about 50,000 queries in a burst,
    not "100 every 5 minutes".
  - A 10-second TTL averages about 5,000 queries a second, not 10.
  - The invalidator deletes the key on every product, deal or banner change, so the stampede happens often
    during a sale.
  - **Fix:** a short section, "One rebuild, not 500". Take a lock with `SET home:v1:lock 1 NX EX 10`; the others
    serve the old copy or wait. Then correct the three sentences and the TTL widget's text.
- [ ] **6-2 · P2 · Price changes never fire the trigger.** The `home-queries` widget reads prices from a separate
  `prices` table ([widgets.js:1344](zero-to-million/js/widgets.js#L1344)). The trigger (6.3) and the Debezium
  publication (8.3) are on `products` only, and 5.1 reads `price` from `products`. Change the widget's query to
  `products`.
- [ ] **6-3 · P2 · The hit rate is overstated as a miss rate.** "Most visits arrive after their copy has expired, so
  most of them miss" ([ch6:206](zero-to-million/js/ch6-cache-it.js#L206)). The widget's own numbers give an 83% hit
  rate at a 10 s TTL. Say "far more of them miss: one in six at 10 seconds".
- [ ] **6-4 · P2 · TTL jitter is used but not explained.** "TTL 10 minutes, with a little randomness"
  ([ch6:277](zero-to-million/js/ch6-cache-it.js#L277)). Add one sentence on why: keys cached together expire
  together. The TTL widget has no 10-minute option, though 10 minutes is the value chosen.
- [ ] **6-5 · P2 · 10 ms per query, on "comfortable" replicas**
  ([ch6:52](zero-to-million/js/ch6-cache-it.js#L52)).
  - Page 3.3's numbers make 100 queries take 30–50 ms, not a second.
  - The replicas are called comfortable while serving roughly 95,000 queries a second, on two 2-vCPU servers.
  - Part of S1.
- [ ] **6-6 · P3 · Smaller points.**
  - "Over a second" (sub), "2–3 seconds" (text) and 1.0–1.4 s (log) all describe the same page.
  - A hit runs `json.loads` and then re-serialises 200 KB; return the cached bytes instead.
  - "Deleting is simple and safe": say "safer".
  - The trigger must also go on `deals` and `banners`.
  - ElastiCache runs Redis OSS or Valkey, not current Redis.
  - `async with primary.begin()` needs an async engine, but 5.2's engines are sync.
  - `create_task` without keeping a reference.
  - 6.3 is dense; consider splitting it.

<a id="ch7"></a>
### Chapter 7: Split the monolith

The strongest chapter. The `split_clients` and `map` config is valid.

- [ ] **7-1 · P1 · The diagrams break 7.3's contract.** 7.3 rejects reading the core's tables directly: "Tomazon's
  contract is an API" ([ch7:179–181](zero-to-million/js/ch7-split-the-monolith.js#L179)). But from 8.4 on, every
  diagram shows the catalogue reading the replicas through `db-read.internal`
  ([widgets.js:1893](zero-to-million/js/widgets.js#L1893), [widgets.js:2082](zero-to-million/js/widgets.js#L2082)).
  Cheapest fix: make 7.3's contract read-only views in a `catalogue` schema on the replicas, which is what the
  diagrams already show.
- [ ] **7-2 · P2 · Coupons fall between the squads.** Shopping owns coupons
  ([ch7:34](zero-to-million/js/ch7-split-the-monolith.js#L34)), but they stay in the core API, which Orders owns.
  So the 7.1 collision can happen again. Say that coupons move to Orders, or name the gap.
- [ ] **7-3 · P3 · Smaller points.**
  - The rollout steps are "staff, 1%, 10%, everyone" in the text, "10% to 50%" in the config note, and
    "staff, 10%, everyone" in the widget. Use one sequence.
  - The upstreams drop 4.3's `keepalive 32`.
  - Code owners for "payment code" wouldn't catch a change to how an order's price is stored; say "order and
    payment code".
  - "Fairly" low risk: a catalogue outage in a sale loses sales.

<a id="ch8"></a>
### Chapter 8: Publish events

- [ ] **8-1 · P2 · Seven days of retention defeats a new reader.** The text and the `kafka-log` widget say a new
  reader gets "the history" ([ch8:91](zero-to-million/js/ch8-publish-events.js#L91),
  [widgets.js:1673](zero-to-million/js/widgets.js#L1673)). With 7-day retention, the search indexer never sees
  products that haven't changed in a week. Make `tomazon.public.products` a compacted topic (8.2 already defines
  compaction), or say that a new reader starts from a Debezium snapshot.
- [ ] **8-2 · P2 · The Debezium connector config is missing, and the code depends on it**
  ([ch8:163–176](zero-to-million/js/ch8-publish-events.js#L163)).
  - Debezium looks for a publication named `dbz_publication` unless `publication.name=debezium` is set.
  - `json.loads(msg.key())["id"]` works only with `key.converter.schemas.enable=false`.
  - Add a short connector config, and say where Kafka Connect runs.
- [ ] **8-3 · P2 · The WAL alert was removed.** "WAL the database keeps for Debezium" was removed from "What to watch"
  in `5229372`, and the traps table still says "alert early". It also left a stray `</tr> </tbody>` at
  [ch8:277](zero-to-million/js/ch8-publish-events.js#L277). Restore the row, and add one sentence on what hitting
  `max_slot_wal_keep_size` costs: the slot is invalidated, and Debezium must re-snapshot.
- [ ] **8-4 · P2 · Two accuracy slips in 8.3.**
  - "If a change is in the WAL, it happened" ([ch8:158](zero-to-million/js/ch8-publish-events.js#L158)): the WAL also
    holds rolled-back work. What counts is the commit record.
  - "Debezium carries on exactly where it stopped" ([ch8:161](zero-to-million/js/ch8-publish-events.js#L161)): it
    resumes from the last confirmed position, so some changes may arrive twice. This also contradicts line 198.
- [ ] **8-5 · P2 · Promises the chapter doesn't keep.**
  - "The price of a log" gives no price; `chapters.js` promises "what it costs to run". Add a rough monthly figure
    for MSK and Kafka Connect.
  - "Holds every change Tomazon makes" and "Changes now reach every service" ([ch8:230](zero-to-million/js/ch8-publish-events.js#L230),
    [:307](zero-to-million/js/ch8-publish-events.js#L307)): only `products` is published. Tone both down.
- [ ] **8-6 · P3 · Smaller points.**
  - 8.1 and 8.2 have no rule of thumb; 8.2's was removed in `e2738a3`.
  - `min.insync.replicas` only protects writes with `acks=all`.
  - "Each an append-only file": it's segment files.
  - The Broker definition states Tomazon's setup as if it were Kafka's.
  - "A dual write can't be made reliable": the outbox pattern can.
  - "Kafka is running" in 8.3 comes before 8.4 explains how it runs.
  - "down for long" should be "down for a long time".
  - Stray `</li> </ol>` leftovers at [ch8:307](zero-to-million/js/ch8-publish-events.js#L307) and
    [ch9:183](zero-to-million/js/ch9-serve-it-nearby.js#L183).

<a id="ch9"></a>
### Chapter 9: Serve it nearby

9.1's distance and egress maths checks out: Mumbai's tiers give about $8,600 for 100 TB. So does 9.2's description
of CloudFront.

- [ ] **9-1 · P2 · Chapter 9 relies on the deleted page.** See S12. The cost table, the "smaller photos" outcome,
  the private bucket and the resizer all need it.
- [ ] **9-2 · P2 · "About 1.8 s of photos from Mumbai" and the 6 s page are never derived**
  ([ch9:145](zero-to-million/js/ch9-serve-it-nearby.js#L145)). The removed round-trip section and the
  `edge-latency` widget did this.
- [ ] **9-3 · P3 · The photo saving doesn't add up.** Photos save about 1.7 s (1.8 s → 60 ms), but the page drops 4 s
  (6 s → 2 s). Say where the rest comes from: JavaScript and CSS on the CDN too.
- [ ] **9-4 · P3 · "What belongs on a CDN" clashes with chapter 6.**
  - It says the home page changes "every few minutes"; chapter 6 says "a few times a day".
  - It says prices change "by the second", though chapter 6 caches them for 5–10 minutes.
  - Split the row: stock changes by the second, prices a few times a day.
- [ ] **9-5 · P3 · The cost table's header** "About, a month" ([ch9:151](zero-to-million/js/ch9-serve-it-nearby.js#L151))
  should be "Cost a month (about)".
- [ ] **9-6 · P3 · Derive the 100 million product pages a month** (for example, users × visits × pages per visit,
  from 5.1). Label the 6.2 widget's 5,000 a second as the sale peak.

<a id="ch10"></a>
### Chapter 10: Run many services

Accurate at its level, and the by-hand versus Kubernetes table is good. One page is not enough for containers,
Kubernetes and EKS.

- [ ] **10-1 · P2 · Kubernetes is the only pattern with no cost or trade-off.** The page never mentions:
  - a new system to learn and run, with cluster upgrades every year;
  - EKS's control-plane fee, about $0.10 an hour per cluster;
  - more things to debug;
  - ECS on Fargate, the obvious alternative for six services.

  The cheat sheet's trade-off for this pattern, "Keep the data outside the cluster", is advice, not a cost.
- [ ] **10-2 · P2 · The table promises things it never explains.** None of these is named:
  - Deployment and Service.
  - Readiness and liveness probes. The widget says traffic goes "only to pods that are ready"
    ([widgets.js:2380](zero-to-million/js/widgets.js#L2380)).
  - The HorizontalPodAutoscaler. Karpenter only adds nodes.
  - Requests versus limits. "1 CPU and 1 GB" is a request.
  - Spreading pods across the three zones.

  Two good links back: going over a memory limit means `OOMKilled`, exit code 137 (page 1.6). And page 2.3
  ruled Kubernetes out "for one small app", which this page could close.
- [ ] **10-3 · P2 · Embed the finished `k8s-cluster` widget**
  ([widgets.js:2200](zero-to-million/js/widgets.js#L2200)). It lets you crash a pod, lose a node, deploy, and run a
  sale. It already matches the text; it just isn't on the page.
- [ ] **10-4 · P3 · Smaller points.**
  - The ALB is created by the AWS Load Balancer Controller from an Ingress, which isn't named.
  - OpenSearch is missing from the "data stays outside" list.
  - "That fixed 'it works on that server'" reads oddly. Say "ended 'it works on my machine, but not on that server'".
  - For the containers back-story, see S10.

### Chapter 11: Go to the edge

The two-city test is the best diagnosis of chapters 10 to 14, and its round-trip arithmetic agrees with chapter 9.

- [ ] **11-1 · P2 · Frankfurt's cache is never invalidated, and its search isn't there.**
  - The cache invalidator deletes keys in Mumbai only (the widget says it "works as in chapter 10",
    [widgets.js:2482](zero-to-million/js/widgets.js#L2482)). So Frankfurt serves stale prices for up to 10 minutes,
    right after the page says edge copies of prices "would soon be wrong".
  - The text gives Frankfurt "the catalogue and search", but the diagram has no search index there.
  - **Fix:** run a Frankfurt invalidator and indexer that read Kafka, or drop "search" from the text.
- [ ] **11-2 · P2 · The cheapest fix is skipped.**
  - "5 API calls, each waiting for the one before" ([ch11:48](zero-to-million/js/ch11-go-to-the-edge.js#L48)) is
    about 0.6 s of Europe's extra 0.9 s.
  - By the book's own rules (count round trips, page 1.8; "engineer the solution to fit"), the first step is
    fewer calls, or calls in parallel.
  - Show that step and what it saves, then why a region is still needed.
- [ ] **11-3 · P2 · Pages are cached at the edge without the trap.**
  - Keep cookies and `Authorization` out of the cache key, and never cache a response that sets a cookie.
    That is page 9.3's "one shopper's cart is shown to others".
  - "Keeps a copy for 60 seconds, as it does a photo": photos are kept for a year.
  - The 0.04 s first byte is on a cache hit only; say so in the table.
- [ ] **11-4 · P3 · Smaller points.**
  - CloudFront doesn't pick the nearer region by itself. That needs Route 53 latency-based routing or an edge
    function, and failover back to Mumbai is missing.
  - "So far the edges only serve photos": 9.2 put JavaScript, CSS and fonts there too.
  - The name and cart calls still go to Mumbai, so the "1.5 s" total is closer to 1.75 s.
  - Shoppers' reads go to Mumbai "for a few seconds" after a write, against 5.4's 30 seconds.
  - Consider splitting the page into "the edge" and "a second region", and embedding the unused `ttfb-budget`
    widget ([widgets.js:2396](zero-to-million/js/widgets.js#L2396)).

### Chapter 12: Split the data

Shard keys, logical shards and the shard map are explained clearly, and the "try everything else first" table is
good. This is the chapter that most needs more than one page (S3 covers the unsolved launch).

- [ ] **12-1 · P2 · The cutover is hand-waved.** "Copy its rows, keep the copy up to date, then switch its row in
  the shard map" ([ch12:73–75](zero-to-million/js/ch12-split-the-data.js#L73)) leaves out what makes it safe:
  - Pause writes to that logical shard briefly, and wait for the copy to catch up.
  - Make every pod reload the map. The widget says the map is cached in every pod.
  - Make the old primary refuse writes for that shard, or a pod with a stale map loses an order.
  - Each row also needs to carry its logical shard number, so one shard's rows can be copied.
- [ ] **12-2 · P2 · The costs of sharding are missing.**
  - Cross-shard queries for warehouse picking lists, staff dashboards and finance, usually served from a copy fed by
    Kafka.
  - Order ids that are unique across shards, and finding an order from an email link.
  - An order and its stock change are no longer one transaction (page 2.4); link back to 7.2.
  - One Debezium connector per shard.
  - Five databases' worth of migrations, backups and monitoring.
- [ ] **12-3 · P2 · The "try everything else first" table leaves out two options that fit this exact problem:**
  - Splitting by function: give the catalogue its own database, and move carts, the busiest writers, off
    PostgreSQL.
  - Smoothing the spike with a queue or waiting room.
- [ ] **12-4 · P3 · Smaller points.**
  - "Nothing else needs to know that shards exist" ([ch12:74](zero-to-million/js/ch12-split-the-data.js#L74)):
    Debezium and the email sender do.
  - "(page 4.2)" sits after the backup claim, but 4.2 is about the largest instance.
  - Archiving "Not yet" hints at a step the book never takes.
  - Embed the unused `shard-map` widget (hash mod N against 64 logical shards,
    [widgets.js:2489](zero-to-million/js/widgets.js#L2489)).

### Chapter 13: Go global

The hardest topic in the book, on its shortest page. S4, S5 and S6 cover its core problems.

- [ ] **13-1 · P2 · An asynchronous standby can lose orders.** A standby 100–200 ms away must be asynchronous, so a
  failover can lose the last seconds of orders. Someone also has to decide to fail over, which brings a split-brain
  risk. Add one line on what is at risk and how it is reconciled.
- [ ] **13-2 · P2 · A new cell can't be built from the topic alone.**
  - The topics keep only 7 days (8.4), so a new Singapore cell can't build its catalogue from them.
  - Say "seeded from a snapshot, then kept current from the topic".
  - "Applier" is never defined. Call it a consumer group.
- [ ] **13-3 · P2 · Routing to the home cell is never explained.** The page doesn't cover:
  - how a request reaches the customer's home cell (a token or a directory, read at the edge);
  - a European customer shopping from India;
  - keeping sign-up emails unique across regions;
  - where India's shoppers go if Mumbai's cell is lost.
- [ ] **13-4 · P3 · Only streaming replicas copy everything.** "It can't choose what it copies"
  ([ch13:44](zero-to-million/js/ch13-go-global.js#L44)) is true of the streaming replicas in 5.2, not of PostgreSQL
  logical replication. Say "A streaming replica (page 5.2)…".

### Chapter 14: Count the cost

Every number checks out, including the bill, the savings, the cost per 1,000 orders and the payback. 14.2 is a
strong ending.

- [ ] **14-1 · P2 · The link between the data centre and AWS is missing.**
  - Under "Move only the steady part", the shards and Kafka move to an Indian data centre, while sale-time pods and
    the other regions stay on AWS.
  - Every query and every replicated byte then crosses a private link (Direct Connect). That adds latency to each
    of about 20 queries per request (3.3), and AWS charges for data leaving AWS, on the very line the page calls
    "the surprise".
  - MSK Replicator only works between MSK clusters.
  - Put the link and its cost into the decision and into the $21,000.
- [ ] **14-2 · P2 · The move's assumptions are hidden in an unused widget.**
  - "$21,000 a month, paid back in about 15 months" ([ch14:79](zero-to-million/js/ch14-count-the-cost.js#L79))
    states no cost to pay back.
  - The assumptions are only in `cloud-or-own` ([widgets.js:2607](zero-to-million/js/widgets.js#L2607)): own servers
    at 35% of the cloud price, 4 engineers at $6,000 a month, and $300,000 to move.
  - The $94,000 and $2.60 figures include $24,000 of engineers' pay; the $180,000 and $115,000 figures include no
    staff.
  - **Fix:** state the three assumptions or embed the widget, and relabel the row "AWS + own servers + extra
    engineers".
- [ ] **14-3 · P2 · 14.1 is crowded.** It packs the bill, tuning, cloud versus own servers, the decision and the
  migration onto one page. Split it into two pages, as `fa56834` had it. Explain NAT gateways and the free S3
  gateway endpoint in a clause each (S10).
- [ ] **14-4 · P3 · Smaller points.**
  - The 37signals figures are gross savings, not net of rent, power and hardware, and there's no starting bill
    (about $3.2M a year). Give before and after, net, with the year (medium confidence).
  - Savings Plans are bought for compute that then moves off AWS: "commit only for what stays".
  - Spot capacity can be reclaimed with 2 minutes' notice, at sale time of all times. Mention the on-demand
    fallback.
  - "Real-user timings (chapter 11)": chapter 11 used test machines. Real-user monitoring is on 9.1.
  - "Shifted by weight": 7.4 moved traffic by share.
  - $68,000 of on-demand nodes is roughly 300–450 nodes, against 3 at 5M users (S1).

---

## 3. Cheat sheet

<a id="c1"></a>
- [ ] **C1 · P2 · Rules of thumb with no source.** "Every rule of thumb in the book" links 10 rules to pages 10.1,
  11.1, 12.1, 13.1 and 14.1, which have no rule box. Readers who click through don't find the rule. Add rule
  boxes to those pages (S13), or reword the section heading.
- [ ] **C2 · P2 · "On one page" prints as about 13 A4 pages.** The README also says "one printable page". Either add a
  condensed print layout (2 pages: patterns and rules), or drop the "one page" promise from the README.
- [ ] **C3 · P3 · Rule and number mismatches.**
  - Page 3.1's rule ("When one server runs everything, every part competes…") is missing.
  - "Cache it or leave it" is settled by "Plan for an empty cache", which doesn't settle the choice. That rule
    comes from 6.2 but links to 6.1; use 6.1's rule.
- [ ] **C4 · P3 · Re-check patterns 10, 12 and 13 after S3–S5 and 10-1 are fixed.** For example, "personal data
  stays home" sits beside "a standby in another region".

The cheat sheet is otherwise a faithful summary: all 81 links resolve, and its numbers match chapters 1–3.

---

## 4. Design and UX

- [ ] **UX2 · P2 · The widest diagrams are too small to read on a laptop with the sidebar open.**
  - At 1440×900, the 8.4 and 12.1 diagrams scale their labels to about 7 px, and the step text beside them to
    about 9 px.
  - Readers aren't presenting, and most won't think to press S.
  - **Fix:** collapse the sidebar automatically on pages with a `.widget.wide`, or add an "expand" button that opens
    the diagram full-window. Keep the step text at body size, outside the scaled part. K4 is the related code bug:
    the 60% floor isn't enforced.
- [ ] **UX3 · P2 · The home page scale stops at a million** and puts chapters 8 to 14 at 10M (see S14).
- [ ] **UX4 · P2 · Terminals print faint.**
  - On chapter pages, `.term` is light text on a dark background, with `print-color-adjust: economy`.
  - With Chrome's default (no background graphics), the text prints as light grey (#ababab) on white, about 2.3:1.
  - Add print rules for `.term`: a light background and dark text, or `print-color-adjust: exact` as the cheat
    sheet already has.
- [ ] **UX5 · P3 · Phones get no hint that diagrams scroll sideways.** Below 720 px, add a small
  "Scroll sideways, or turn your phone" hint above wide diagrams (decision D5). The 3.2 diagram also overflows the
  screen by 5 px at 390 px wide.
- [ ] **UX6 · P3 · No reading progress.** With 68 pages, a "read" tick in the sidebar and a "Continue where you
  left off" button on the home page would help. Both fit in `localStorage`.
- [ ] **UX7 · P3 · The first visit is always light.** It ignores the OS dark-mode setting. That's deliberate for
  projectors, but web readers could get `prefers-color-scheme` when there's no saved choice.
- [ ] **UX8 · P3 · Every lede is a numbered list,** and the numbering continues across widgets (1.1 runs 1–3, then a
  widget, then 4–7). Numbers suggest steps. Use bullets for points that aren't a sequence, unless the numbers help
  when presenting.
- [ ] **UX9 · P3 · Covers of chapters 10 to 13 look empty:** a one-line intro and a single item under
  "In this chapter" (S13).
- [ ] **UX10 · P3 · Accessibility** (axe-core, 15 pages, both themes). Nothing critical. Each of these is one line
  to fix:
  - An empty first `<th>` in comparison tables on 8.2, 8.4 and 12.1: add visually hidden text (done on 1.1 and 1.2).
  - Every note is an unlabelled `<aside>` landmark: add `aria-label`, or use `<div>`.
  - Two near-miss contrasts in light mode: `.b-db` labels at 4.41:1, and the cheat sheet's `small` at 4.48:1.
  - The chapter 2 cover jumps from h1 to h3.

---

## 5. Functionality and code

### What was tested

| Check | Result |
|---|---|
| Every page (68) at 1440×900 light, 1440×900 dark, 1280×720 and 390×844 | All render; 0 console errors, 0 page errors, 0 failed requests |
| Every widget: sliders to min, max and middle; every select option; every button, 12 rounds; hovers | No exceptions; no `NaN`, `undefined` or `Infinity` on screen |
| Internal links (`#/…`) and in-page anchors | 0 broken |
| Keyboard: → from home to the end | Visits all 68 pages in order and stops at the cheat sheet |
| Horizontal overflow | None on desktop; one 5 px overflow on a phone (3.2) |
| Timers and listeners after a full read-through | No intervals left running; diagram pages stay in memory until the next window resize (K2) |
| Print to PDF (cheat sheet, 3.3) | Works; see UX4 and C2 |
| Live site against the repo | Identical to `10fbe4e`, apart from line endings |

### Findings

The code is in good shape for a static site with no build step.
- The maths in the simulators matches the text: TTL hit rate, USL peak, M/M/1, Little's law, slow start and the
  latency ladder.
- All 17 live-diagram specs are consistent.
- Almost every animation loop stops when its page goes away.
- If PostHog is blocked, nothing breaks.

- [ ] **K2 · P2 · Diagram pages stay in memory until the window is resized.**
  - Each wide diagram adds a `resize` listener on `window` that removes itself only on a later resize
    ([widgets.js:499–500](zero-to-million/js/widgets.js#L499)). Its closure holds the old page's DOM.
  - Measured with garbage collection forced: three passes over the chapter 8–13 diagrams keep 11,456 nodes and
    19 listeners. A presenter paging back and forth keeps adding to that.
  - **Fix:** give pages an unmount hook. Before replacing `pageEl.innerHTML`, `app.js` aborts an `AbortController`;
    widgets pass its `signal` to `addEventListener`, and disconnect their observers.
- [ ] **K3 · P2 · "Copy commands" appears on blocks that have no commands** ([app.js:159–181](zero-to-million/js/app.js#L159)).
  - 13 of the 37 terminal blocks have no `$ ` line: config files, Python, SQL and the directory tree.
  - Clicking the button there empties the reader's clipboard, still says "Copied", and logs `commands copied`.
  - In psql sessions (3.3, 5.1), only the shell line is copied, not the SQL.
  - If the clipboard fails, the reader gets no message, and "Copied" isn't announced to screen readers.
  - **Fix:**
    - Add the button only when there are commands to copy, or label it "Copy code" and copy the whole block.
    - Show "Couldn't copy" when it fails.
    - Announce the result in a polite live region.
- [ ] **K4 · P2 · The diagram scale floor isn't enforced** ([widgets.js:489](zero-to-million/js/widgets.js#L489)).
  - The comment says diagrams never shrink below 60%, but the floor applies only to the height term.
  - At 1366×768, 12.1 scales to 0.55. The step text, which sits inside the scaled element, renders at 7.4 px.
  - **Fix:** clamp the whole scale to at least 0.6, scroll sideways below that, and keep the step panel
    (`.pt-dock`) outside the scaled element. This is the code side of UX2.
- [ ] **K6 · P2 · The load-balancer simulator goes stale with reduced motion** ([widgets.js:842](zero-to-million/js/widgets.js#L842), :891).
  - With reduced motion on, switching the algorithm updates the tiles but not the server cards.
  - Fix: call `advance(30); render()` in that case.
  - The seeded simulation (240,000 steps) also reruns on every visit to 4.3, though its results never change.
    Hard-code them.
- [ ] **K7 · P2 · The closed sidebar is still reachable by keyboard on tablets and phones**
  ([style.css:1479–1487](zero-to-million/css/style.css#L1479), [app.js:230–239](zero-to-million/js/app.js#L230)).
  - Below 900 px, the closed drawer is only moved off screen. About 20 invisible links stay in the tab order and
    in what screen readers read.
  - Opening the drawer doesn't move focus into it.
  - **Fix:** make the drawer `inert` or `visibility: hidden` when closed. Move focus into it on open, and back to
    the menu button on close or Escape.
- [ ] **K8 · P2 · The page keys take over too much** ([app.js:276–284](zero-to-million/js/app.js#L276)).
  - Shift+arrow isn't excluded, so it breaks keyboard text selection.
  - Arrow keys on a focused, scrollable code block or table turn the page instead of scrolling it.
  - PageDown never scrolls a long page.
  - The single-key `S` shortcut can't be turned off, which fails WCAG 2.1.4.
  - **Fix:**
    - Skip when Shift is held.
    - Skip when the target or one of its parents can scroll sideways.
    - Use PageUp and PageDown only at the top or bottom of the page.
    - Let readers turn `S` off, or require a modifier.
- [ ] **K9 · P3 · The lag slider on 5.3 announces a bare number.** Set `aria-valuetext` with units, as chapter 1's
  sliders now do ("16 threads", "1,000,000 users", "70% busy").
- [ ] **K10 · P2 · Hard-coded colours fail contrast in dark mode** (besides UX1):
  - `#b42b2b` red text on 3.1, at 2.8:1 ([style.css:603](zero-to-million/css/style.css#L603), :616).
  - The kafka-anatomy offsets, at 2.0:1 ([style.css:792–795](zero-to-million/css/style.css#L792)).
  - The query-latency "connect" label, at 1.8:1 ([style.css:1083](zero-to-million/css/style.css#L1083)).
  - **Fix:** add theme tokens such as `--bad`, and use `--chip-ink` for text on accent fills.
- [ ] **K11 · P2 · The focus ring is removed on the home-page section picker** (6.1,
  [style.css:709](zero-to-million/css/style.css#L709)). Focus becomes a 1.5:1 grey border that can't be told apart
  from selection. Keep the global accent outline.
- [ ] **K12 · P3 · Covers of chapters 10–13 never say "There are a few things to try on the page".** They have live
  diagrams, but the check looks only for `class="widget"`, not `widget wide`
  ([app.js:137–140](zero-to-million/js/app.js#L137)).
- [ ] **K13 · P3 · Live regions are too chatty.**
  - kafka-log rewrites its readout every 650 ms.
  - kafka-anatomy and lb-sim each have two live regions.
  - **Fix:** write only when the text changes, and keep one live region per widget.
- [ ] **K14 · P3 · ARIA details.**
  - `aria-label` sits on a role-less `div` in 6.1's home-page picker (`.hq-page`).
  - lb-sim's fast and slow slots, and kafka-anatomy's keys, rely on colour alone.
  - The in-page scroll buttons don't move focus to their target.
- [ ] **K15 · P3 · Analytics gaps.** `widget used` misses keyboard-only changes to the segmented controls, and clicks
  on 6.1's sections ([app.js:295–302](zero-to-million/js/app.js#L295)).
- [ ] **K16 · P3 · Motion and performance.**
  - The diagrams' idle animation keeps running when they're off screen; 9.2 and 6.3 run two at once.
  - With reduced motion, `live()` loops a no-op 900 ms timer forever.
  - `reduceMotion` is read once, at load.
  - **Fix:** pause off-screen animations with an IntersectionObserver, and listen for changes to the media query.
- [ ] **K17 · P3 · Dead code and duplication.**
  - 7 unused widgets, about 14% of `widgets.js` (R6).
  - About 45 dead CSS rules:
    - `.g-*`, `.el-rows`, `.co-rows`, `.c9-left` and `.kc-*`
    - `.sm-*`, `.c12-*` and `.c13-*`
    - `.dots`, `.ss-*` and `.sw.slow`/`.sw.fast`
    - `.ld-row[data-ns]`, which never matches
    - `.note.runs-out`, which is used nowhere
  - Helpers defined more than once:
    - `at`, `sub` and `frame`, three times
    - the waterfall row renderer, five times
    - about 60 lines shared by `split-live` and `pool-arch`
    - the chart scaffolding, twice
- [ ] **K18 · P3 · CSS hygiene.**
  - A `.tiles-3` `!important` pair.
  - The class `.c-net` is purple, while the token `--c-net` is green.
  - The print theme block is a partial hand copy of the light tokens.
  - Comments carry stale page numbers, such as "1.2 request timeline" (now 1.3) and diagrams "10.3/12.3/13.2" that
    no longer exist.

---

## 6. README, repo and publishing

- [ ] **R2 · P3 · Removed pages fall back to home silently** ([app.js:29–32](zero-to-million/js/app.js#L29)).
  - An unknown address renders the home page while the URL stays wrong, and the visit is logged as `home`.
  - The same happens with a trailing slash or capitals: `#/1/`, `#/1/cpu/`, `#/1/CPU`.
  - Pages such as `#/9/cloudfront` existed and may have been shared.
  - **Fix:**
    - Strip the trailing slash and lower-case the address.
    - Keep old slugs as aliases.
    - Fall back to the chapter's cover when the chapter number matches; otherwise show "page not found".
- [ ] **R3 · P3 · The README has drifted from the book.**
  - It says "a plain chapter-by-chapter walkthrough with no story" ([README.md:3](zero-to-million/README.md#L3)),
    but chapters 2–14 follow Tomazon.
  - It calls the cheat sheet "one printable page" (C2).
  - It tells you to give a chapter `minutes`, a field that doesn't exist.
  - It lists `.note.runs-out`, which is unused, and leaves out `.note.tip` and `.note.important`, which are used.
  - Its keys table leaves out Escape, and its file list leaves out `favicon.svg`.
  - The page counts, user counts and analytics events in it are all accurate.
- [ ] **R4 · P3 · Stale roadmap data.** `topics` in [chapters.js](zero-to-million/js/chapters.js) are stale for the
  written chapters, for example "DNS and domain names" and "Removing the single point of failure". They're shown
  only for planned chapters, so it's dead data that misleads whoever edits next. Update or delete them.
- [ ] **R5 · P3 · No link previews.** There are no Open Graph or Twitter tags, so links shared in Slack, LinkedIn or
  WhatsApp show no preview card. Add `og:title`, `og:description` and an `og:image`.
- [ ] **R6 · P3 · Seven finished widgets are on no page:**
  - `edge-latency` (S12)
  - `k8s-cluster` (10-3)
  - `ttfb-budget` (11-4)
  - `shard-map` (12-4)
  - `cloud-or-own` (14-2)
  - `fan-out` ([widgets.js:2704](zero-to-million/js/widgets.js#L2704))
  - `slow-start` ([widgets.js:3083](zero-to-million/js/widgets.js#L3083))

  The first five fit pages that exist today. Use them, or delete them, so `widgets.js` (234 KB, loaded on every
  page) carries only what's shown.
