# Tomazon War Room

A system design workshop told as a story. Instead of a tour of concepts, the room lives through
Tomazon's growth one incident at a time, and each fix creates the next problem. The concept
names (vertical scaling, load shedding, Little's Law…) arrive *after* people have felt the pain
they solve.

**Chapter 1: The 3 AM Call** is built. A single 512 MB server melts down after an Instagram
reel goes viral. The room investigates with a fake but faithful terminal, then replays the
night with the monitoring they never had.

## Run it

Open `index.html` in Chrome or Edge. There's no build step and no server, and it works offline
(without internet the fonts fall back to system fonts).

- `index.html#s7` opens scene 7 directly. `index.html#free` opens free play.
- Best on a 1920×1080 projector. On a 1366×768 laptop, zoom the browser to 80% (Ctrl −).

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

## Chapter 1, scene by scene (about 45 minutes)

| # | Scene | What happens |
|---|---|---|
| 1 | Meet Tomazon | The storefront. You and Tom launch. |
| 2 | One $4 server | The diagram: nginx, app and MySQL share 1 vCPU and 512 MB. |
| 3 | Quiet growth | 3 req/s, 77% memory, no monitoring. |
| 4 | Your phone is buzzing | Tom calls at 2:47 AM. The diagram and monitoring go dark. |
| 5 | Hacked? DDoS? | Suspect cards. `dig` and `ping` work, `curl` times out. |
| 6 | Knock knock | `ssh` takes about 9 seconds to get in. Load ~100, memory 99%, swap 96%. |
| 7 | What is this machine doing? | `htop`: CPU pinned and mostly kernel time, kswapd0 on top, processes stuck in D. |
| 8 | Follow the evidence | Access log: Instagram referrers, status 499. It's success, not an attack. |
| 9 | 512 megabytes | Memory comparison, to scale. |
| 10 | What actually happened | Replay at 2:25 AM with the lights on. Drag traffic and find the cliff. |
| 11 | The death spiral | Little's Law and the feedback loop. |
| 12 | Make it stop | Reboot, swap off (OOM killer), load shedding, resize. |
| 13 | Green again | Takeaways and the names for what they learned. |
| 14 | One more thing | Tom: "10x traffic this Saturday. We're fine, right?" |

## The full workshop (2.5 to 3 hours)

1. **The 3 AM Call** (built): capacity, queueing, Little's Law, swap, the OOM killer, vertical scaling, monitoring.
2. **The Big Sale**: the vertical ceiling, single points of failure, moving the database out, a load balancer with two app servers, sessions that log people out → a shared session store.
3. **Monday Morning Slowness**: slow queries, indexes, caching, read replicas, stale data.
4. **The Order Email**: slow work inside requests, queues and workers, retries, idempotency.
5. **The Payment Gateway Meltdown**: timeouts, retry storms, backoff with jitter, circuit breakers, rate limits.
6. **Epilogue**: the Day 1 diagram next to today's. Every box exists because of a 3 AM call.

## How the simulation works

One VM, stepped every 0.1 s (`js/sim.js`, tunables in `TZ.PARAMS`):

- Each request needs 45 ms of CPU plus 60 ms of waiting on network and disk. Queueing delay grows as ρ/(1−ρ), which gives the hockey stick.
- Requests are tracked first-in-first-out, so requests in flight = arrival rate × time in system (Little's Law) falls out of the model instead of being faked.
- Every busy worker holds 11 MB. When memory runs past RAM, it spills into swap at disk speed, and busy pages on disk slow everything down.
- With swap off, the OOM killer kills the biggest process: MySQL. Workers stuck for 30 s are killed by the app, and customers give up after 10 s.
- The kernel log, the systemd journal, the nginx logs and htop are all generated from the live state.

Numbers worth knowing: 1 vCPU / 512 MB falls off the cliff at about 19 req/s. 2 vCPU / 4 GB holds
up to about 42 req/s. Once the small box is thrashing, dropping traffic back to normal does *not*
bring it back. That's deliberate: it's a metastable failure, and a good discussion for the seniors.

## Files

```
index.html          page shell
css/style.css       all styles (one dark theme)
js/sim.js           the server model
js/flow.js          animated request diagram
js/metrics.js       monitoring panel and charts
js/terminal.js      laptop shell + SSH session, htop, logs
js/overlays.js      scene cards (phone call, suspects, loop…)
js/story-ch1.js     Chapter 1: scenes, notes and content
js/app.js           wiring, game loop, keyboard
```

A new chapter is a new `story-chN.js` with the same shape: `sims` (named starting states),
`scenes` (text, notes, unlocked controls, scene card) and `content` (card data). Chapter 2 will
also need the model to support more than one server.
