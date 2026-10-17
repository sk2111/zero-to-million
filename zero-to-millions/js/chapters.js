/* The workshop's roadmap. Every chapter is listed here; a chapter with
   status 'ready' also has its pages in its own file (ch1-fundamentals.js…).
   `users` is roughly where the system is when the chapter starts, and drives
   both the sidebar's users column and the scale on the home page. */
window.ZTM = window.ZTM || {};

ZTM.chapters = [
  {
    n: 1, slug: 'fundamentals', title: 'Fundamentals', users: 0, status: 'ready', minutes: 75,
    question: 'What can one machine actually do?',
    summary: 'CPU, processes and threads, memory, disk and network: how each one works, how it behaves under load, and what that means for system design.'
  },
  {
    n: 2, slug: 'one-server', title: 'One server', users: 1, status: 'ready', minutes: 45,
    question: 'How do you ship a pilot fast, on one machine?',
    summary: 'Start with a pilot to learn whether people want the product, build it as a monolith, and run it on one small server.',
    topics: ['DNS and domain names', 'HTTP and HTTPS', 'Web server, app server, database on one box', 'The life of a request', 'Deploying and restarting safely']
  },
  {
    n: 3, slug: 'scale-up', title: 'Scale up, split out', users: 1000, status: 'ready', minutes: 30,
    question: 'How do you give the app and the database room to grow?',
    summary: 'Move the database to its own server, then choose the right kind of instance for the app and for the database.',
    topics: ['Scaling up, and its ceiling', 'Splitting the app and the database onto their own servers', 'Choosing instance types for CPU-bound and I/O-bound work', 'Your own PostgreSQL, or Amazon RDS', 'Connection pooling', 'Removing the single point of failure']
  },
  {
    n: 4, slug: 'scale-out', title: 'Scale out', users: 10000, status: 'ready', minutes: 40,
    question: 'The app server is full. A bigger server, or more of them?',
    summary: 'Find the bottleneck, scale the app tier out to several servers behind an Nginx load balancer, and choose how to spread the requests.',
    topics: ['Load balancers', 'Stateless application servers', 'Sessions and sticky routing', 'Health checks', 'Rolling deploys']
  },
  {
    n: 5, slug: 'make-it-fast', title: 'Make it fast', users: 100000, status: 'ready', minutes: 45,
    question: 'The database is the bottleneck. Now what?',
    summary: 'Find what the database is busy with, scale its reads with replicas, and handle the consistency trade-offs that copies bring.',
    topics: ['Indexes and query plans', 'Caching with Redis', 'Cache invalidation', 'Read replicas and replication lag', 'CDNs for static content']
  },
  {
    n: 6, slug: 'do-it-later', title: 'Do it later', users: 1000000, status: 'planned',
    question: 'Which work doesn’t need to happen while the user waits?',
    summary: 'Queues, background workers and events: moving slow work out of the request path.',
    topics: ['Message queues', 'Background workers', 'At-least-once delivery and idempotency', 'Events and pub/sub', 'Backpressure']
  },
  {
    n: 7, slug: 'beyond-a-million', title: 'Beyond a million', users: 10000000, status: 'planned',
    question: 'What do we do when one database can’t hold it all?',
    summary: 'Sharding, partitioning and multiple regions, and the consistency trade-offs that come with them.',
    topics: ['Partitioning and sharding', 'Choosing a shard key', 'Multiple regions', 'Consistency vs availability (CAP in practice)', 'Picking the right database']
  },
  {
    n: 8, slug: 'when-things-break', title: 'When things break', users: null, status: 'planned',
    question: 'How do we keep working while parts of the system fail?',
    summary: 'Timeouts, retries, circuit breakers, rate limits and monitoring. These apply at every stage, not just at the end.',
    topics: ['Timeouts and retries with backoff', 'Circuit breakers', 'Rate limiting and load shedding', 'Logs, metrics and traces', 'Alerts that mean something']
  }
];

/* 0 → "0", 1000 → "1K", 1000000 → "1M". */
ZTM.usersLabel = function (u) {
  if (u === null || u === undefined) return 'Any';
  if (u >= 1e6) return (u / 1e6) + 'M';
  if (u >= 1e3) return (u / 1e3) + 'K';
  return String(u);
};
