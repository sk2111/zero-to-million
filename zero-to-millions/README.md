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
| 2 | One server | 1 | Written |
| 3 | Scale up, split out | 1K | Started |
| 4 | Scale out | 10K | Written |
| 5 | Make it fast | 100K | Started |
| 6 | Do it later | 1M | Planned |
| 7 | Beyond a million | 10M | Planned |
| 8 | When things break | every stage | Planned |

Chapter 1 has 14 pages in five parts. Each resource goes from how it works, to how it behaves
in practice, to what it means for system design.

| Part | Pages |
|---|---|
| CPU | How a CPU works · Processes and threads · CPU-bound and I/O-bound work · What to look for in a CPU · Serving many requests at once |
| Memory | How memory works · Memory in practice |
| Disk | How disks work (including picking a disk for your workload) |
| Network | How networks work |
| Putting it together | What's inside a server · Latency numbers · Measuring performance · How much can one server handle? · Recap |

Chapter 2 has 5 pages: Start with a pilot · Start with a monolith · The first architecture
(one t4g.nano server in AWS Mumbai running Nginx, FastAPI and PostgreSQL, with a step-through of
one request and a 512 MB memory budget) · Watching the pilot · When the pilot succeeds (growth to
1,000 users, diagnosing the overloaded server, why everything on one machine is a time bomb).

Chapter 3 so far has 3 pages: Give the database its own server (a live two-server diagram, what
changes, how to move the data) · The new cost: network round trips (N+1 queries, query structure,
pooling with PgBouncer) · The right instance for each job (instance families, the app tuned
for CPU, the database on r + EBS, storage-optimised NVMe or RDS, and sizing for 1,000 users).

Chapter 4 has 4 pages: 10,000 users, and the app slows down (finding the full tier) · Scale up or
scale out? (trade-offs, cost, sizing with N+1) · Load balancing (algorithms, a round robin vs least
connections simulator, the Nginx config) · The architecture for 10,000 users (live diagram, what
scaling out needs, the new weak spots).

Chapter 5 has 4 pages: 100,000 users, and the database runs hot (pg_stat_statements, a chatbot is
about 70% reads) · Read replicas (streaming replication, routing reads and writes) · Replication lag
and the CAP theorem (a lag timeline, CAP and PACELC, shades of consistency) · Living with stale reads
(read your own writes and five other strategies).

## Files

```
index.html               the shell: sidebar, top bar, page area
css/style.css            all styles, light and dark
js/chapters.js           the roadmap: every chapter's title, users, status, planned topics
js/ch1-fundamentals.js   Chapter 1's pages (HTML in template strings)
js/ch2-one-server.js     Chapter 2's pages
js/ch3-scale-up.js       Chapter 3's pages
js/ch4-scale-out.js      Chapter 4's pages
js/ch5-make-it-fast.js   Chapter 5's pages
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
