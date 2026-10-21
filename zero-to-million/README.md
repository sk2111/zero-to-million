# Zero to a million users

A practical guide to scaling your app from zero to a million users. It's a plain
chapter-by-chapter walkthrough with no story: a chapter sidebar, readable pages, and a few small
interactive pieces where a number is easier to feel than to read.

## Run it

Open `index.html` in Chrome or Edge. There's no build step and no server. It works offline;
without internet the fonts fall back to Segoe UI.

- `index.html#/1` opens Chapter 1's cover. `index.html#/1/cpu` opens one section.
- Light is the default because it projects better. The switch at the bottom of the sidebar
  remembers your choice.
- On a projector, zoom the browser (Ctrl + / Ctrl −) to taste. Text steps up one size on
  screens 1600 px and wider.

| Key | Does |
|---|---|
| → or PageDown | Next page (presentation clickers work) |
| ← or PageUp | Previous page |
| S | Hide or show the sidebar |

## Chapters

| # | Chapter | Starts at | Status |
|---|---|---|---|
| 1 | Fundamentals | 0 users | Written |
| 2 | One server | 100 | Written |
| 3 | Scale up, split out | 1K | Written |
| 4 | Scale out | 10K | Written |
| 5 | Make it fast | 100K | Written |
| 6 | Cache it | 500K | Written |
| 7 | Split the monolith | 1M | Written |
| 8 | Publish events | 2M | Written |
| 9 | Serve it nearby | 3M | Written |
| 10 | Run many services | 5M | Written |
| 11 | Go to the edge | 7M | Written |
| 12 | Split the data | 10M | Written |
| 13 | Go global | 20M | Written |
| 14 | Count the cost | 25M | Written |

Every chapter after the first two opens with a page grouped under "The next bottleneck": the
measured problem that the rest of the chapter solves.

Chapter 1 has 14 pages in five parts. Each resource goes from how it works, to how it behaves
in practice, to what it means for system design.

| Part | Pages |
|---|---|
| CPU | How a CPU works · Processes and threads · CPU-bound and I/O-bound work · What to look for in a CPU |
| Memory | How memory works · Memory in practice |
| Disk | How disks work (including picking a disk for your workload) |
| Network | How networks work |
| Putting it together | What's inside a server · Latency numbers · Measuring performance · Serving many requests at once · How much can one server handle? · Recap |

From chapter 2 on, the running example is **Tomazon**, an online store like Amazon: the requirements
and estimates in chapter 2 set the numbers the later chapters build on.

Chapter 2 has 6 pages: Clarify the requirements (functional and non-functional, with Tomazon's
answers) · Estimate the capacity (users, traffic, CPU, storage, photos, memory and network, for the
pilot and for 1,000 shoppers) · Start with a pilot · Start with a monolith · The first architecture
(one t4g.nano server in AWS Mumbai running Nginx, FastAPI and PostgreSQL, with a step-through of
one request and a 512 MB memory budget) · Watching the pilot.

Chapter 3 has 4 pages: 1,000 users, and one server runs out of room (diagnosing the overloaded
server, why everything on one machine is a time bomb, scale up or split out) · Give the database its own server (a live two-server diagram, what
changes, how to move the data) · The new cost: network round trips (N+1 queries, query structure,
pooling with PgBouncer) · The right instance for each job (instance families, the app tuned
for CPU, the database on r + EBS, storage-optimised NVMe or RDS, and sizing for 1,000 users).

Chapter 4 has 4 pages: 10,000 users, and the app slows down (finding the full tier) · Scale up or
scale out? (trade-offs, cost, sizing with N+1) · Load balancing (algorithms, a round robin vs least
connections simulator, the Nginx config) · The architecture for 10,000 users (live diagram, what
scaling out needs, the new weak spots).

Chapter 5 has 4 pages: 100,000 users, and the database runs hot (pg_stat_statements, a shopping
visit is about 90% reads) · Read replicas (streaming replication, routing reads and writes) · Replication lag
and the CAP theorem (a lag timeline, CAP and PACELC, shades of consistency) · Living with stale reads
(read your own writes and five other strategies).

Chapter 6 has 3 pages: Fast servers, slow pages (counting the queries behind one request, what is
worth caching) · Redis: a cache in memory (why it is fast, cache-aside in FastAPI, a live diagram,
sizing and eviction) · Keeping the cache honest (a TTL trade-off calculator, deleting on change,
PostgreSQL triggers with LISTEN/NOTIFY and a cache invalidator).

Chapter 7 has 4 pages: Two squads, one codebase (a payment webhook broken by two changes that each
passed their tests; Conway's law) · Monolith or microservices? (what splitting buys and costs, the
cheaper fixes to try first) · Choosing the first service (four tests, the catalogue service, a
database view as its first contract) · The strangler fig (Nginx `split_clients` routing, a rollout
diagram from staff to everyone, and the new problems a network between services brings).

Chapter 8 has 4 pages: The listener that went deaf (the cache invalidator fails quietly in a sale;
why LISTEN/NOTIFY can't be fixed) · A queue or a log (RabbitMQ and SQS vs Kafka, Kafka's parts, a
widget that sends the same changes through NOTIFY and through a topic) · Capture changes from the
WAL (the dual-write problem, Debezium, the new cache invalidator as a Kafka consumer) · The price of a log (Amazon MSK or your own, safe settings, consumer lag, the traps, and a live diagram of the whole architecture so far).

Chapter 9 has 3 pages: Slow abroad, expensive at home (distance and the speed of light, the egress
bill) · A CDN: copies near the shopper (edges, hits and misses, regional edge caches, a live
diagram, what belongs on a CDN) · What the CDN changed (speed, why the bill fell mostly for
other reasons, flat-rate pricing, the traps).

Chapter 10 has 1 page: 5 million users, and too many programs to run by hand (the bottleneck is
the people running the servers; containers package the services but don't run them; what Kubernetes
does instead; Tomazon on Amazon EKS, with a live diagram and the data kept outside the cluster).

Chapter 11 has 1 page: 7 million users, and Europe finds Tomazon slow (testing from two cities shows
the time is distance, not servers; the CDN has the photos but not the pages; ending connections and
caching pages at the edge; a second region in Frankfurt for reads while writes go to Mumbai, with a
live diagram and the before and after).

Chapter 12 has 1 page: 10 million users, and one database takes every write (a phone launch; replicas
and caches can't take writes; sharding by customer with 64 logical shards and a shard map; four
order shards, with a live diagram and the before and after).

Chapter 13 has 1 page: 20 million users, and four regions with one home (copying every database to
every region doesn't stretch to four; replicas copy everything and take no writes; regional cells fed
only the catalogue through Kafka; home regions through the shard map, with standbys; the full
architecture with a Frankfurt cell, and the before and after).

Chapter 14, the last, has 2 pages: 25 million users, and a bill that outgrew the business (where
$180,000 a month goes, cost per 1,000 orders, tuning first, cloud vs your own servers, moving only the
steady part, the before and after) · What it all comes down to (the journey in one table, the
takeaways, and what to observe from day one).

After chapter 14 comes the cheat sheet (`index.html#/cheatsheet`, also linked from the home page and
the sidebar): system design on one printable page, kept free of the running example. It has the key
takeaways, the loop every chapter runs, the latency ladder and back-of-the-envelope numbers, the 13
scaling patterns (when you see it, what to add, the trade-off), the trade-offs to know, every rule
of thumb linked to its page, and what to watch.

## Files

```
index.html               the shell: sidebar, top bar, page area, and the PostHog setup
css/style.css            all styles, light and dark
js/chapters.js           the roadmap: every chapter's title, users, status, planned topics
js/ch1-fundamentals.js   Chapter 1's pages (HTML in template strings)
js/ch2-one-server.js     Chapter 2's pages
js/ch3-scale-up.js       Chapter 3's pages
js/ch4-scale-out.js      Chapter 4's pages
js/ch5-make-it-fast.js   Chapter 5's pages
js/ch6-cache-it.js       Chapter 6's pages
js/ch7-split-the-monolith.js  Chapter 7's pages
js/ch8-publish-events.js      Chapter 8's pages
js/ch9-serve-it-nearby.js     Chapter 9's pages
js/ch10-run-many-services.js  Chapter 10's pages
js/ch11-go-to-the-edge.js     Chapter 11's pages
js/ch12-split-the-data.js     Chapter 12's pages
js/ch13-go-global.js          Chapter 13's pages
js/ch14-count-the-cost.js     Chapter 14's pages, and the takeaways
js/cheatsheet.js         the cheat sheet: system design on one page, after chapter 14
js/widgets.js            the interactive pieces, mounted by data-widget="…"
js/app.js                routing, sidebar, keys, prev/next
```

## Adding a chapter

1. Write `js/chN-something.js` the way `ch1-fundamentals.js` is written:
   `ZTM.content[N] = { intro, sections: [{ group, slug, title, sub, html }] }`. `group` puts the
   page under a heading in the sidebar (Chapter 1 uses CPU, Memory, Disk, Network, Putting it together).
2. Add a `<script>` tag for it in `index.html`, before `widgets.js`.
3. In `js/chapters.js`, set that chapter's `status` to `'ready'` and give it `minutes`.

The building blocks used in Chapter 1's HTML are `.lede`, `.figures`, `.split`, `dl.terms`,
`ol.steps`, `ul.plain`, `table.data`, `.note.design` (for system design), `.note.runs-out`,
`.note.rule` (rule of thumb), `figure.term`, and
`<div class="widget" data-widget="…">`.

Layout: every block on a page (text, notes, tables, terminals, widgets and diagrams) shares one
centred column (`--column`), so all the edges line up. Type is IBM Plex Sans and IBM Plex Mono;
sizes come from the `--fs-*` tokens at the top of `css/style.css`.

## Analytics

The published site reports reading to PostHog; the setup is at the top of `index.html`. It runs
only on `sk2111.github.io`, so opening the files locally, or a fork's copy, reports nothing.

- Pages are hash routes (`#/1/cpu`), so `app.js` sends each page view itself, with `page`,
  `page_kind`, `chapter`, `section`, `prev_page`, `theme`, and `via`: how the reader got there
  (`entry`, `key` for arrow keys and clickers, `button`, `link`, or `other` for back, forward and
  typed addresses).
- Three more events: `widget used` (the first time a reader works each interactive piece on a
  page), `commands copied`, and `page printed`.
- PostHog adds the rest itself: clicks, time on page and scroll depth (on the next page view, and
  on `$pageleave` for the last page), the referrer, the country and the device.
- Open the site once with `?notrack` (`https://sk2111.github.io/zero-to-million/?notrack`) to stop
  counting your own visits in that browser. `?track` counts them again.
