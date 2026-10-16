# Zero to a million

A practical way to scale your application from 0 to a million users. It's a plain
chapter-by-chapter walkthrough with no story: a chapter sidebar, readable pages, and a few small
interactive pieces where a number is easier to feel than to read.

## Run it

Open `index.html` in Chrome or Edge. There's no build step and no server. It works offline;
without internet the fonts fall back to Segoe UI.

- `index.html#/1` opens Chapter 1's cover. `index.html#/1/cpu` opens one section.
- Light is the default because it projects better. The switch at the bottom of the sidebar
  remembers your choice.
- On a projector, zoom the browser (Ctrl + / Ctrl −) to taste. The text scales with the window.

| Key | Does |
|---|---|
| → or PageDown | Next page (presentation clickers work) |
| ← or PageUp | Previous page |
| S | Hide or show the sidebar |

## Chapters

| # | Chapter | Starts at | Status |
|---|---|---|---|
| 1 | Fundamentals | 0 users | Written |
| 2 | One server | 1 | Planned |
| 3 | Scale up, split out | 1K | Planned |
| 4 | Scale out | 10K | Planned |
| 5 | Make it fast | 100K | Planned |
| 6 | Do it later | 1M | Planned |
| 7 | Beyond a million | 10M | Planned |
| 8 | When things break | every stage | Planned |

Chapter 1 has 15 pages in five parts. Each resource goes from how it works, to how it behaves
in practice, to what it means for system design.

| Part | Pages |
|---|---|
| CPU | How a CPU works · Processes and threads · CPU-bound and I/O-bound work · Serving many requests at once |
| Memory | How memory works · Memory in practice |
| Disk | How disks work · Writing data safely |
| Network | How networks work · Networks in practice |
| Putting it together | What's inside a server · Latency numbers · Measuring performance · How much can one server handle? · Recap |

## Files

```
index.html               the shell: sidebar, top bar, page area
css/style.css            all styles, light and dark
js/chapters.js           the roadmap: every chapter's title, users, status, planned topics
js/ch1-fundamentals.js   Chapter 1's pages (HTML in template strings)
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
