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
    n: 2, slug: 'one-server', title: 'One server', users: 100, status: 'ready', minutes: 50,
    question: 'A new project: where do you start, and how do you ship it fast?',
    summary: 'Turn the request into requirements and estimates, start with a pilot built as one app, and run it on one small server.',
    topics: ['DNS and domain names', 'HTTP and HTTPS', 'Web server, app server, database on one box', 'The life of a request', 'Deploying and restarting safely']
  },
  {
    n: 3, slug: 'scale-up', title: 'Scale up, split out', users: 1000, status: 'ready', minutes: 40,
    question: 'How do you give the app and the database room to grow?',
    summary: 'Find what breaks first as users grow, move the database to its own server, then choose the right kind of instance for the app and for the database.',
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
    topics: ['Finding what the database is busy with', 'Read replicas and replication lag', 'CAP and PACELC', 'Living with stale reads']
  },
  {
    n: 6, slug: 'cache-it', title: 'Cache it', users: 500000, status: 'ready', minutes: 45,
    question: 'Every server looks healthy, but pages are slow. Why?',
    summary: 'Find the work you repeat for every shopper, keep the answer in Redis, and keep the cache honest when the data changes.',
    topics: ['Finding repeated work', 'Redis and cache-aside', 'TTLs and hit rate', 'Cache invalidation', 'Stampedes and lagging replicas']
  },
  {
    n: 7, slug: 'split-the-monolith', title: 'Split the monolith', users: 1000000, status: 'ready', minutes: 45,
    question: 'The servers are fine, but releases keep breaking. Why?',
    summary: 'See when the team, not the servers, is the bottleneck, choose the first service to split out, and move traffic to it gradually with the strangler fig pattern.',
    topics: ['Conway’s law', 'Monolith or microservices', 'Choosing the first service', 'Contracts between services', 'The strangler fig pattern with Nginx']
  },
  {
    n: 8, slug: 'publish-events', title: 'Publish events', users: 2000000, status: 'ready', minutes: 50,
    question: 'How does every service hear about a change, even one that was down?',
    summary: 'Replace a fragile listener with a durable log: queues and logs, Kafka, change data capture with Debezium, and what it costs to run.',
    topics: ['Message queues and logs', 'Kafka: topics, partitions, consumer groups', 'Change data capture with Debezium', 'At-least-once delivery and idempotency', 'Consumer lag']
  },
  {
    n: 9, slug: 'serve-it-nearby', title: 'Serve it nearby', users: 3000000, status: 'ready', minutes: 45,
    question: 'Shoppers abroad say pages crawl, and the bandwidth bill keeps climbing. Why?',
    summary: 'See why distance makes pages slow, put the photos on a CDN, send fewer bytes, and find out what a CDN really saves.',
    topics: ['Distance and the speed of light', 'How a CDN works', 'Smaller images', 'What a CDN really saves']
  },
  {
    n: 10, slug: 'run-many-services', title: 'Run many services', users: 5000000, status: 'ready', minutes: 50,
    question: 'Dozens of programs on dozens of servers: who starts, restarts and moves them?',
    summary: 'Package each service as a container, and let Kubernetes run them, heal them, place them, roll out new versions and let services find each other.',
    topics: ['Containers and images', 'Desired state', 'Pods, Deployments and Services', 'Probes, requests and rolling updates', 'Amazon EKS and the Gateway API']
  },
  {
    n: 11, slug: 'go-to-the-edge', title: 'Go to the edge', users: 7000000, status: 'ready', minutes: 45,
    question: 'Pages are slow in Europe, yet every server is fast. Where does the time go?',
    summary: 'Split load time into processing and network time, count the round trips before the first byte, and move work closer: connections and cached pages at the edge, reads in a second region, writes at home.',
    topics: ['Processing time and network time', 'Time to first byte', 'Ending connections and caching pages at the edge', 'CloudFront Functions and Lambda@Edge', 'A second region for reads']
  },
  {
    n: 12, slug: 'split-the-data', title: 'Split the data', users: 10000000, status: 'ready', minutes: 50,
    question: 'One database takes every write. What happens when one launch could swamp it?',
    summary: 'Tell a hot spot from a volume problem, keep a flash sale off the shared database, then shard the orders by customer, with logical shards and a map.',
    topics: ['Noisy neighbours and hot spots', 'Flash sales: waiting rooms, Redis and queues', 'Choosing a shard key', 'Logical shards and the shard map', 'Moving to shards without stopping']
  },
  {
    n: 13, slug: 'go-global', title: 'Go global', users: 20000000, status: 'ready', minutes: 50,
    question: 'How does Tomazon serve every continent, and survive losing one?',
    summary: 'See why copying everything to every region breaks down, run a complete cell in every region, choose a front door, feed each cell only the data it needs, put customers’ shards in their home region, and plan for losing a region.',
    topics: ['Regional cells', 'DNS routing and anycast', 'Feeding regions with change data capture', 'Home regions for writes', 'Losing a region']
  },
  {
    n: 14, slug: 'count-the-cost', title: 'Count the cost', users: 25000000, status: 'ready', minutes: 50,
    question: 'The bill grows faster than the business. Is the cloud still the right home?',
    summary: 'Find where the money goes, cut the waste without moving, weigh the cloud against your own servers, move only the steady part, and finish with what the whole journey comes down to.',
    topics: ['Unit cost and cost visibility', 'Tuning a cloud bill', 'Cloud or your own servers', 'Moving between providers without stopping', 'The takeaways, and observability']
  }
];

/* 0 → "0", 1000 → "1K", 1000000 → "1M". */
ZTM.usersLabel = function (u) {
  if (u === null || u === undefined) return 'Any';
  if (u >= 1e6) return (u / 1e6) + 'M';
  if (u >= 1e3) return (u / 1e3) + 'K';
  return String(u);
};
