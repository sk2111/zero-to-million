---
name: aws-architecture-diagram
description: Build or change an AWS architecture diagram in the Zero to a Million book, the region, VPC and subnet pictures drawn in zero-to-million/js/widgets.js. Use for any page that shows Tomazon's AWS architecture, so every chapter's diagram has the same sideways, wide, one-screen layout as 6.3 and 8.4.
---

# AWS architecture diagrams

Every AWS architecture diagram in the book looks and works the same way. Two builders in `zero-to-million/js/widgets.js` draw all of them; their styles are the `.k6-*`, `.k7-*`, `.k8-*`, `.k9-*`, `.k12-*` and `.kf-*` rules in `zero-to-million/css/style.css`.

| Builder | Draws | Widgets |
|---|---|---|
| `c6Arch(el, o, spec)`, with `c6Layout(o)` and `c6Wires(o)` | Chapters 5 and 6: five columns | 5.2 `replica-live`, 6.2 `cache-arch`, 6.3 `invalidate-arch` |
| `c8Arch(el, o, spec)`, with `c8Layout(o)`, `c8Wires(o)` and `c11Frankfurt(o)` | Chapters 8 to 13: seven columns, plus Frankfurt under Mumbai | 8.4 `kafka-full`, 9 `cdn-full`, 10 `eks-arch`, 11 `edge-regions`, 12 `shard-arch`, 13 `global-arch` |

A new chapter's diagram should usually be the previous chapter's options plus one more option in the builder, not a new layout. The comment above `c8Wires` lists the options.

## The convention

- **6.2's look.** Users and Route 53 on the left. Then the region, a tinted VPC, and labelled public and private subnet cards. Orange EC2 frames and magenta database frames, with instance captions. Parts at the standard `.nd` size. S3 and EBS snapshots in the region but outside the VPC.
- **Sideways, on one screen.** Tiers run left to right (public subnet, app servers, data, workers, Kafka), not top to bottom. A second region goes under the first, on the same columns. The author explains the diagram step by step and must not have to scroll.
- **Wide.** The widget breaks out of the 60rem text column, and the step text sits beside the diagram in the left column. `fitWide` scales the whole picture down to fit the screen's width and height, never below 60%, instead of squeezing its columns. Don't design for phones: they scroll the diagram sideways.
- **Clean wires.** Every wire is straight or makes one turn, and no two wires cross. Wires from one part may share a stem, and wires into one part may merge (a dot marks the join), but a wire never runs behind a part it doesn't connect, or along a border.
- **Only what exists.** A chapter's diagram shows every part built in that chapter and the earlier ones, and nothing from later chapters. Labels change with the chapter: user counts, "New:" only in the chapter that adds the part, instance sizes once the text changes them. Step text never points ahead to a later chapter; it can point back, e.g. "(page 3.2)".

## Building one

1. **On the page:** `<div class="widget wide" data-widget="NAME"></div>`.
2. **The widget:** call a builder with this chapter's options and the steps:
   ```js
   W['NAME'] = function (el) {
     var o = { eks: true, europe: true, fra: 'reads', shops: [...], ... };
     c8Arch(el, o, { request: [...], start: 'Follow ...', idle: '...', steps: [{ on: [...], run: [...], t: '...', say: '...' }] });
   };
   ```
   The builder sets `joints`, `dock: 'side'`, the wires and the HTML, then calls `liveArch` and `fitWide`.
3. **The HTML** is `.ar2-left` (users and Route 53, or from chapter 9 the `.k9-left` grid of shoppers beside their CloudFront edges), then `.ar2-region` holding the region label (`p.ar2-k`) and a `.k8-grid` with a modifier (`.k6-grid`, `.k7-grid`) that sets its columns, rows and card areas. A second region is another `.ar2-region.kf-region` after the first.
4. **Behind the parts**, in this order:
   - The VPC: `.k8-bg.k8-vpc`. Its label sits bottom left.
   - Subnet cards: `.k8-bg.k8-sub`, plus `.k8-priv` for private ones and `.k8-foot` to put the label underneath. Each gets a grid-area class.
   - Server frames: `frame(cls, caption)` gives `.k8-frame` with a `p.k8-cap` tab on its top border (`.k8-low` puts it on the bottom). Colour it with `.k8-dbf` (database), `.k8-mskf` (MSK) or `.k8-eksf` (an EKS cluster, dashed). A frame is a grid item of its own, drawn behind its parts, so it never makes a row taller and the parts stay level.
   - Put every label and caption on a side no wire crosses.
5. **The parts:** `at('k8-cN k8-rM', node(id, glyph, colour, title, sub))`. `k8-r123` and the like span rows; `.k7-pg` centres a part across columns 4 and 5. S3 and the snapshots are `.k8-out` parts in the last row, outside the VPC, as wide as their words.
6. **Rows that must line up are `1fr`.** A part spanning two or three `1fr` rows sits exactly on their middle, so it can fan out to the parts beside it with straight wires.
7. **Wires** use the `liveArch` route types: `h`, `hl`, `v`, `vb`, `vt`, `vu`, `u`, `r`, `ld` and `lb`. A wire is `[id, from, to, route, label, oneWay, lane]`:
   - `oneWay` is `true` for one-way flows (WAL, NOTIFY, backups), or `'rev'` to point the arrow at the wire's start. They draw dashed.
   - `lane`, a number, sets where an `h` or `hl` wire turns: that many pixels past its source. Use it to keep wires off borders, as the shoppers' wires do.
   - `u` runs under a row. Use it to pass a part, and keep that row's labels on top so the lane under it is clear.
   - Plan the grid around the wires, not the other way round. A wire from one region to the other should drop straight down: put its two ends in the same column.
8. **Steps:** list in `on` every part the step's wires pass through. Run a wire with `[id, 0]` from its source, `[id, 1]` back.
9. **Colours:**

   | Class | Colour | For |
   |---|---|---|
   | `c-cpu` | Orange | EC2 caption icons |
   | `c-sw` | Slate | Programs |
   | `c-db` | Magenta | Databases and caches |
   | `c-sto` | Green | Storage and Kafka |
   | `c-net` | Purple | Network |
   | `c-sec` | Red | Security groups |
   | `c-user` | Navy | Users |

## Before you finish

Screenshot the diagram with `shot/shot.ps1`, which opens the book from this repo in headless Chrome and moves the widget to the top of the screen.

```powershell
.claude/skills/aws-architecture-diagram/shot/shot.ps1 -Query "page=6/invalidation&w=invalidate-arch&steps=2&noside=1" -Name s2 -W 1440 -H 900
```

The query takes these parameters:

| Parameter | Effect |
|---|---|
| `page` | The page to open, e.g. `8/running-kafka`. Slugs: 5/read-replicas, 6/redis, 6/invalidation, 8/running-kafka, 9/cdn, 10/kubernetes, 11/edge, 12/sharding, 13/four-regions |
| `w` | The widget's name |
| `steps` | How many times to press the step button |
| `noside=1` | Hide the sidebar |
| `theme=dark` | Dark mode |
| `measure=1` | Print the diagram's natural size, each region's height and the fitted scale, top right |
| `dy` | Pixels above the widget, 20 by default |
| `at` | A CSS selector to move to the top instead of a widget, e.g. `at=%23cs-watch` (`#` written as `%23`) |
| `print=1` | Apply the page's `@media print` rules on screen; use `-W 800` for an A4 width |

The PNG lands in `%TEMP%\ztm-shots`. Two helpers sit beside the script:

- `crop.ps1 -In a.png -Out b.png -X -Y -W -H -Scale 2` zooms into a corner.
- `montage.ps1 -In a.png,b.png,... -Out m.png -Cols 2 -Scale 0.5 -CropH 1200` tiles every step into one sheet.

Check each of these:

- At 1920px, at 1440px with the sidebar hidden, and at 1440px with it open: it fits, scaled if need be, and no caption is cut off. Measure with `measure=1` at a tall window (`-H 1500`): the natural height should stay near 800px for one region. A 1080p browser window gives about 855px, so the floor of 60% fits about 1200px. Chapters 12 and 13 are past that, at about 1300px and 1430px, and need a taller or full-screen window.
- Light and dark mode.
- Every step: the right parts and wires light up, and the rest fade.
- No wire crosses another, runs behind a part, or runs along a border.

The harness switches CSS transitions off, because the headless clock never finishes them; without that, faded parts look unfaded. If the book gains a chapter file, add it to the script list in `shot/view.html`.
