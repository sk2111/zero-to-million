# Tomazon War Room

A system design workshop told as a story. Instead of a tour of concepts, the room lives through
Tomazon's life: two college friends build it in 48 hours, then it grows one incident at a time,
and each fix creates the next problem. The concept names (MVP, ORM, ACID, Little's Law, load
shedding…) arrive *after* people have felt the problem they solve.

**The premise:** a world exactly like ours (smartphones, Instagram, cloud servers) except that
nobody has thought of selling things online yet. That's why you and Tom can build the first
online store with today's tools.

## Run it

Open `index.html` in Chrome or Edge. There's no build step and no server, and it works offline
(without internet the fonts fall back to system fonts).

- `index.html#c1s4` opens Chapter 1, scene 4. `index.html#free` opens free play.
- Best on a 1920×1080 projector. On a 1366×768 laptop, zoom the browser to 80% (Ctrl −).
- Light and Dark switch in the top bar. Light is the default (it projects better); the choice is remembered.

## Presenting

| Key | Does |
|---|---|
| → or PageDown | Next scene (presentation clickers work) |
| ← or PageUp | Previous scene |
| N | Presenter notes: talking points and the questions to ask the room |
| Esc | Close the scene card |
| q | Quit htop |
| Ctrl+C | Stop a command that's hanging (ssh, curl, tail -f) |

The command chips under the story text type themselves into the terminal, so you don't have to
type live in front of the room. You can still type anything; `help` lists what the terminal knows.

## Chapter 1: 48 Hours (about 50 minutes)

| # | Scene | What the room does |
|---|---|---|
| 1 | A world without online shopping | The premise: our world vs Tomazon's world. |
| 2 | Tom has an idea | Watch you and Tom talk it out in hostel room 214. |
| 3 | Not a small product. An experiment. | The MVP hypothesis and what happens if it's right or wrong. |
| 4 | 48 hours | Pick features against a 26-hour build budget. Payments, mobile app and AI all try to sneak in. |
| 5 | Choosing your tools | Click through the layers of a tech stack. |
| 6 | Which language? | Hear the debate for six languages, then decide: Python. |
| 7 | A language is not enough | Plain Python vs FastAPI. Send both a bad request: 500 vs 422. |
| 8 | Talking to the database | Live SQL injection: string-built SQL vs the ORM (SQLAlchemy). |
| 9 | Where does the data live? | Tables vs documents. Rename a shop in both. |
| 10 | ACID | Two buyers, one shaker; a power cut mid-order. Transactions off, then on. |
| 11 | PostgreSQL or MySQL? | And Tom's suggestion: Excel. |
| 12 | Where will it run? | AWS, Google Cloud, DigitalOcean, or the laptop under the bed. |
| 13 | Create the server | Region, OS, size, login. Bangalore, Ubuntu, $4 for 512 MB. |
| 14 | Hello, server | First SSH: the fingerprint prompt, a fresh Ubuntu box. |
| 15 | Ship it | `apt install`, `git clone`, `./deploy.sh`. Watch each piece appear on the server. |
| 16 | Tomazon is live | The storefront, order #1 from Uncle Ramesh, the experiment's scoreboard. |

A "Your stack" panel on the right fills in as each decision is made, with the 48-hour clock above it.

## Chapter 2: The 2 AM Call (about 45 minutes)

| # | Scene | What happens |
|---|---|---|
| 1 | Quiet growth | Six months later: 3 req/s, 77% memory, no monitoring. |
| 2 | Your phone is buzzing | Tom calls at 2:02 AM. The diagram and monitoring go dark. |
| 3 | Hacked? DDoS? | Suspect cards. `dig` and `ping` work, `curl` times out. |
| 4 | Knock knock | `ssh` takes about 9 seconds. Load ~100, memory 99%, swap 96%. |
| 5 | What is this machine doing? | `htop`: CPU pinned, kswapd0 on top, dozens of Postgres connection processes stuck in D. |
| 6 | Follow the evidence | Access log: Instagram referrers, status 499. The app log: the connection pool is exhausted. |
| 7 | 512 megabytes | The callback to Chapter 1's choice, drawn to scale. |
| 8 | What actually happened | Replay at 1:40 AM with the lights on. Drag traffic and find the cliff. |
| 9 | The death spiral | Little's Law and the feedback loop. |
| 10 | Make it stop | Reboot, swap off (the OOM killer shoots Postgres), load shedding, resize. |
| 11 | Green again | Takeaways and the names for what they learned. |
| 12 | One more thing | Tom: "10x traffic this Saturday. We're fine, right?" |

## The full workshop (2.5 to 3 hours)

1. **48 Hours** (built): MVP thinking, scope, tech stack choices, ORMs, SQL injection, relational vs non-relational, ACID, choosing a cloud, a first server.
2. **The 2 AM Call** (built): capacity, queueing, Little's Law, connection pools, swap, the OOM killer, vertical scaling, monitoring.
3. **The Big Sale**: the vertical ceiling, single points of failure, moving the database out, a load balancer with two app servers, sessions that log people out → a shared session store.
4. **Monday Morning Slowness**: slow queries, indexes, caching, read replicas, stale data.
5. **The Order Email**: slow work inside requests, queues and workers, retries, idempotency.
6. **The Payment Gateway Meltdown**: timeouts, retry storms, backoff with jitter, circuit breakers, rate limits.

## How the simulation works

One VM, stepped every 0.1 s (`js/sim.js`, tunables in `TZ.PARAMS`):

- Each request needs 45 ms of CPU plus 60 ms of waiting on network and disk. Queueing delay grows as ρ/(1−ρ), which gives the hockey stick.
- Every request in flight holds a database connection, and in PostgreSQL every connection is a whole process with its own memory (about 11 MB here, with the app's share).
- Requests are tracked first-in-first-out, so requests in flight = arrival rate × time in system (Little's Law) falls out of the model instead of being faked.
- When memory runs past RAM, it spills into swap at disk speed, and busy pages on disk slow everything down.
- With swap off, the OOM killer kills a Postgres process and PostgreSQL restarts every connection. Requests that can't get a connection for 30 s fail. Customers give up after 10 s.
- A fresh server starts with only Ubuntu and SSH; `apt install` and `./deploy.sh` bring nginx, PostgreSQL and the app to life.
- The kernel log, the systemd journal, the nginx and Postgres logs, and htop are all generated from the live state.

Numbers worth knowing: 1 vCPU / 512 MB falls off the cliff at about 19 req/s. 2 vCPU / 4 GB holds
up to about 42 req/s. Once the small box is thrashing, dropping traffic back to normal does *not*
bring it back. That's deliberate: it's a metastable failure, and a good discussion for the seniors.

## Files

```
index.html          page shell
css/style.css       all styles, light and dark
js/sim.js           the server model
js/flow.js          animated request diagram
js/metrics.js       monitoring panel and charts
js/terminal.js      laptop shell + SSH session: htop, logs, apt, git, deploy
js/overlays.js      scene cards over the board (phone call, suspects, launch…)
js/ch1-cards.js     Chapter 1's interactive cards (dialogue, MVP, scope, stack decisions…)
js/story-ch1.js     Chapter 1: 48 Hours
js/story-ch2.js     Chapter 2: The 2 AM Call
js/app.js           wiring, chapters, game loop, keyboard, theme
```

A new chapter is a new `story-chN.js` that sets `TZ.CHAPTERS[N-1]` with the same shape: `sims`
(named starting states), `scenes` (text, notes, unlocked controls, a scene card or an interactive
`card`) and `content`. Chapter 3 will also need the model to support more than one server.
