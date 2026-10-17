/* Chapter 7: Split the monolith.
   Same conventions as the earlier chapters. Tomazon passes a million users. The servers
   cope; the codebase doesn't: two squads keep breaking each other in one app. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[7] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes a million users. The servers cope, the database copes, and the cache keeps pages fast.</li>
      <li>The team has grown too: about 12 engineers, all changing one codebase every day. The monolith that let a small team move fast now makes a bigger team trip over itself.</li>
      <li>This is the moment page 2.4 warned about: a reason you can name to split the app. This chapter splits off one service, safely, while everything keeps running.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Tell when the bottleneck is the codebase and the team, not the servers.</li>
        <li>Weigh a monolith against microservices, and try the cheaper fixes first.</li>
        <li>Choose the first service to split out, and say why.</li>
        <li>Move traffic to it gradually with the strangler fig pattern, using Nginx.</li>
        <li>Name the new problems a network between services brings.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================== The next bottleneck */
    {
      group: 'The next bottleneck',
      slug: 'teams-collide',
      title: 'Two squads, one codebase',
      sub: 'Two features that each worked break payments when they ship together.',
      html: `
        <ol class="points lede">
          <li>The team now works as two squads. <strong>Shopping</strong> owns the catalogue: the home page, product pages, search and coupons. <strong>Orders</strong> owns checkout, payments and delivery.</li>
          <li>Both squads still work in the same FastAPI monolith, on the same database tables, and ship through the same deploy.</li>
        </ol>

        <h2>The afternoon payments broke</h2>
        <ol class="steps">
          <li><strong>Orders adds a delivery partner.</strong> The change rewrites the payment webhook: the request the payment gateway sends when a shopper’s payment succeeds. The new webhook checks the amount paid against the order’s <code>total</code>, marks the order paid, and books the delivery.</li>
          <li><strong>Shopping adds coupons.</strong> The change renames the order’s <code>total</code> to <code>subtotal</code>, adds a <code>discount</code>, and updates every line that used <code>total</code>, in the code as it was when the work began.</li>
          <li><strong>Each passes its tests.</strong> The two changes touch different files, so they merge without a conflict, and each was tested on its own branch. Orders ships at 2 p.m., Shopping at 3 p.m.</li>
          <li><strong>Payments stop being recorded.</strong> The new webhook still reads <code>total</code>, which no longer exists, and fails on every payment. Shoppers are charged, but their orders stay “awaiting payment”.</li>
        </ol>
        <ol class="points">
          <li>Rolling back the coupon change stops the damage. The gateway retries a webhook that failed, so most of the stuck orders are marked paid once the fix is out. A reconciliation job, comparing the gateway’s list of payments with the orders table, finds the rest.</li>
          <li>Nothing was wrong with the servers, the database or the deploy. The deploy shipped exactly what it was given: two changes that were each correct, and wrong together.</li>
        </ol>

        <h2>The bottleneck is the codebase</h2>
        <ol class="points">
          <li>Over time, the modules from page 2.4 grew into each other. Coupons reach into orders, the webhook reaches into products, and anything can change a shared model.</li>
          <li>No one can change one area without understanding all of it, so every change needs more meetings, more coordination and more care.</li>
          <li>This has a name. <strong>Conway’s law</strong> says a system ends up shaped like the teams that build it. Two squads in one tangled codebase get a tangled system, and step on each other in it.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Symptom</th><th>What it looks like at Tomazon</th></tr></thead>
          <tbody>
            <tr><td>Changes collide</td><td>Two changes that each pass their tests break when they ship together</td></tr>
            <tr><td>Deploys wait for each other</td><td>Shopping can’t ship a fix while Orders is mid-release, so both release together, less often</td></tr>
            <tr><td>Any bug can break anything</td><td>A coupon change takes down payments</td></tr>
            <tr><td>Scaling is all or nothing</td><td>A sale needs ten times the browsing capacity, so the whole app scales, checkout code included</td></tr>
            <tr><td>New engineers are slow to start</td><td>They have to understand the whole app before changing a small part of it</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>The bottleneck moves, and not always to a server.</strong> Once the machines are sorted, the limit is
            often how fast people can change the system safely.</li>
            <li><strong>Test changes together before they ship.</strong> A merge queue tests each change on top of everything
            that’s about to ship, so two changes that only break together are caught before production.</li>
            <li><strong>Payment flows need a safety net.</strong> Webhooks fail. Keep the handler simple, let the gateway retry,
            and reconcile against the gateway’s records every day.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>When healthy servers ship broken releases, look at how the code and the teams are organised.</p>
        </aside>`
    },

    /* ============================================== Splitting the monolith */
    {
      group: 'Splitting the monolith',
      slug: 'monolith-or-microservices',
      title: 'Monolith or microservices?',
      sub: 'What splitting buys, what it costs, and the cheaper fixes to try first.',
      html: `
        <ol class="points lede">
          <li>A <strong>microservice</strong> is a small app that owns one part of the product, runs and deploys on its own, and talks to the others over the network (page 2.4).</li>
          <li>Splitting the monolith into services solves a people problem: teams can change their own part without waiting for, or breaking, anyone else. It does that by adding a technical problem: a network between the parts.</li>
        </ol>

        <h2>What splitting buys, and what it costs</h2>
        <table class="data">
          <thead><tr><th></th><th>One monolith</th><th>Several services</th></tr></thead>
          <tbody>
            <tr><td>Shipping a change</td><td>Everyone ships together, through one deploy</td><td>Each team ships its own service, whenever it’s ready</td></tr>
            <tr><td>When one part breaks</td><td>It can take the whole app down</td><td>The rest can keep working, if they’re built to cope without it</td></tr>
            <tr><td>Scaling</td><td>Scale the whole app, every part of it</td><td>Scale each service on its own: many catalogue servers, few for checkout</td></tr>
            <tr><td>A call between two parts</td><td>A function call: nanoseconds, never lost</td><td>A network call: about a millisecond, and it can be slow, fail or time out (page 1.8)</td></tr>
            <tr><td>Data that spans parts</td><td>One database, one transaction</td><td>Each service owns its data; keeping them consistent is your problem</td></tr>
            <tr><td>Running it</td><td>One app to deploy, monitor and debug</td><td>Many: more pipelines, more dashboards, and tracing to follow one request across services</td></tr>
          </tbody>
        </table>

        <h2>Try the cheaper fixes first</h2>
        <ol class="points">
          <li><strong>Make the module boundaries real.</strong> Each module owns its tables, and others call its service layer instead of reaching into its models (page 2.4). A check in CI can enforce it.</li>
          <li><strong>Give each part an owner.</strong> A code owners file makes the Orders squad review any change to payment code, whoever wrote it. That alone would have caught the coupon change.</li>
          <li><strong>Test changes together.</strong> A merge queue tests every change on top of everything else that’s about to ship.</li>
          <li><strong>Ship behind feature flags.</strong> New code ships switched off, and is switched on separately. A bad feature is turned off in seconds, without a rollback.</li>
        </ol>

        <h2>Tomazon’s decision</h2>
        <ol class="points">
          <li>Tomazon does all four. The collisions get rarer, but two problems remain.</li>
          <li>The squads still can’t ship independently: one deploy carries both squads’ changes.</li>
          <li>And the catalogue has a completely different load from the rest. Browsing is most of the traffic (a shopping visit is about 90% reads, page 5.1), and during a sale it jumps far more than checkouts do. Scaling the whole app for it is wasteful.</li>
          <li>Those are the two reasons page 2.4 named for splitting. So Tomazon starts splitting, one service at a time.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Microservices solve a people problem, at a technical price.</strong> Split when teams block each other
            or one part needs very different scaling, not because it’s fashionable.</li>
            <li><strong>Service boundaries follow team boundaries.</strong> Each service should be owned by one team. A service
            two teams must change together is a monolith split in the wrong place.</li>
            <li><strong>Never rewrite the whole thing at once.</strong> A big-bang rewrite stops new features for months and
            usually takes longer than planned. Split piece by piece, with the app running.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Fix the boundaries inside the monolith first. Split out a service only for a reason you can name.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Splitting the monolith',
      slug: 'first-service',
      title: 'Choosing the first service',
      sub: 'Start with a part that’s safe to get wrong, easy to cut out, and easy to describe.',
      html: `
        <ol class="points lede">
          <li>The first service is where the team learns to build, deploy and run services at all. Mistakes will happen, so choose where they’ll hurt least.</li>
          <li>A good first candidate passes three tests, and a fourth makes it even better.</li>
        </ol>

        <h2>Four tests for the first service</h2>
        <ol class="points">
          <li><strong>Low risk.</strong> If it fails for an hour, nobody loses money or data. Payments and orders fail this test.</li>
          <li><strong>Few dependencies.</strong> It calls few other parts of the app, and few parts call it. Pulling it out shouldn’t mean untangling everything.</li>
          <li><strong>A clear job.</strong> You can say what it does in one sentence. Architects call this a <strong>bounded context</strong>.</li>
          <li><strong>A different load.</strong> If it needs to scale differently from the rest, splitting it out pays for itself.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Candidate</th><th>Low risk?</th><th>Few dependencies?</th><th>A clear job?</th><th>A different load?</th></tr></thead>
          <tbody>
            <tr><td>Payments</td><td>No: a bug loses money</td><td>No: orders, coupons, the gateway</td><td>Yes</td><td>No</td></tr>
            <tr><td>Orders</td><td>No: a bug loses orders</td><td>No: users, products, payments, delivery</td><td>Yes</td><td>No</td></tr>
            <tr><td>Accounts and sign-in</td><td>No: if it’s down, nobody can sign in</td><td>No: every part needs it</td><td>Yes</td><td>No</td></tr>
            <tr class="hl"><td>Catalogue: home page, product pages, search</td><td>Fairly: shoppers can’t browse, but no money or data is lost</td><td>Yes: it only reads products, from Redis and the replicas</td><td>Yes: “show what Tomazon sells”</td><td>Yes: most of the traffic, and it spikes in sales</td></tr>
          </tbody>
        </table>

        <h2>The catalogue service</h2>
        <ol class="points">
          <li>The catalogue is Tomazon’s best first candidate. It’s almost entirely read-only: it reads products from Redis and the replicas (chapters 5 and 6), and changes nothing.</li>
          <li>It also scales on its own. During a sale, the catalogue service can run on ten servers while the rest of the app stays on three.</li>
          <li>The Shopping squad owns it. The rest of the monolith, now called the <strong>core API</strong>, stays with Orders for now: accounts, carts, orders and payments.</li>
        </ol>

        <h2>The first new problem: sharing the data</h2>
        <ol class="points">
          <li>The catalogue service needs product data, but the core API still owns it: staff change prices and stock there, and checkout reads them there.</li>
          <li>The tempting shortcut is to point the catalogue service at the core’s tables on the replicas. It works on day one, but it ties the two together again: the core team can no longer rename a column without breaking the catalogue. That’s the coupon bug, now across two services.</li>
          <li>The fix is a <strong>contract</strong>: a small, versioned interface that the owner promises to keep stable, however its own tables change.</li>
          <li>Tomazon’s first contract is a database view, <code>catalogue_v1.products</code>. The core team owns the tables behind it. When they rename a column, the same migration updates the view, so the catalogue sees no change.</li>
          <li>Prices still change in the core API, and the cache invalidator from page 6.3 still deletes the cached copies, so the catalogue’s pages stay fresh.</li>
        </ol>
        <figure class="term">
          <figcaption>The contract, owned by the core team, in PostgreSQL</figcaption>
<pre><span class="o">CREATE SCHEMA catalogue_v1;

CREATE VIEW catalogue_v1.products AS          </span><span class="c">-- only what the catalogue needs</span><span class="o">
  SELECT id, name, description, price, stock > 0 AS in_stock, rating
  FROM products
  WHERE listed;

GRANT USAGE ON SCHEMA catalogue_v1 TO catalogue;
GRANT SELECT ON ALL TABLES IN SCHEMA catalogue_v1 TO catalogue;   </span><span class="c">-- and nothing else</span></pre>
          <ol class="points term-note">
            <li>The <code>catalogue</code> login can read the view, but not the <code>products</code> table behind it, so the shortcut isn’t even possible.</li>
            <li>Views and permissions replicate like everything else, so the catalogue service reads the view on the replicas.</li>
            <li>A view is a stepping stone: both services still share one database, and a slow catalogue query still slows the replicas the core reads from. The longer-term contract is an API, or events that let the catalogue keep its own copy (chapter 8).</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Start at the edge, not the core.</strong> Read-only, low-risk parts make the best first services. Leave
            payments and orders until the team has run a service in production.</li>
            <li><strong>Sharing tables is sharing a monolith.</strong> If two services read and write the same tables, they still
            can’t change independently. Each service owns its data, and others get only what a contract gives them.</li>
            <li><strong>Contracts change slowly.</strong> Add fields freely, but never remove or rename one until every caller
            has stopped using it.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Split off the safest, most self-contained part first, and give it a contract, not a back door into the tables.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Splitting the monolith',
      slug: 'strangler-fig',
      title: 'The strangler fig',
      sub: 'Move traffic to the new service a little at a time, with Nginx deciding where each request goes.',
      html: `
        <ol class="points lede">
          <li>The catalogue service is built. Switching all traffic to it in one go would be a gamble: if it’s wrong, every shopper sees it at once.</li>
          <li>The <strong>strangler fig pattern</strong> moves traffic over gradually, and keeps the old code as a fallback until the new service has proved itself. Martin Fowler named it after a fig that grows around a host tree until it replaces it.</li>
        </ol>

        <h2>How it works</h2>
        <ol class="steps">
          <li><strong>Put a router in front.</strong> Every request already passes through Nginx, the load balancer from page 4.3. Nginx decides where each one goes.</li>
          <li><strong>Start with everything on the old code.</strong> The new service is running, but Nginx sends it nothing yet.</li>
          <li><strong>Send a little traffic to the new service.</strong> First staff, then 1% of shoppers, then 10%, then everyone. Compare its errors and p95 with the old code at each step.</li>
          <li><strong>Roll back in seconds if anything looks wrong.</strong> Rolling back is one line of Nginx config and a reload, not a deploy.</li>
          <li><strong>Delete the old code.</strong> Once all the traffic is on the new service for a while, the catalogue code in the core API is unused. Delete it, and the monolith is smaller.</li>
          <li><strong>Repeat for the next service.</strong></li>
        </ol>

        <h2>Nginx as the router</h2>
        <figure class="term">
          <figcaption>/etc/nginx/conf.d/app.conf on the load balancer: staff and 10% of shoppers try the catalogue service</figcaption>
<pre><span class="o">upstream core {                                  </span><span class="c"># the monolith, now called the core API</span><span class="o">
    least_conn;
    server 10.0.1.21:8000 max_fails=3 fail_timeout=10s;
    server 10.0.1.22:8000 max_fails=3 fail_timeout=10s;
    server 10.0.1.23:8000 max_fails=3 fail_timeout=10s;
}
upstream catalogue {                             </span><span class="c"># the new catalogue service</span><span class="o">
    least_conn;
    server 10.0.1.31:8000 max_fails=3 fail_timeout=10s;
    server 10.0.1.32:8000 max_fails=3 fail_timeout=10s;
}

split_clients "\${remote_addr}" $catalogue_share {
    10%   catalogue;
    *     core;
}
map $cookie_tz_beta $catalogue_backend {         </span><span class="c"># staff carry a tz_beta=1 cookie</span><span class="o">
    "1"       catalogue;
    default   $catalogue_share;
}

server {
    listen 443 ssl;
    server_name tomazon.com;

    location /api/home     { proxy_pass http://$catalogue_backend; }
    location /api/products { proxy_pass http://$catalogue_backend; }
    location /api/search   { proxy_pass http://$catalogue_backend; }
    location /             { proxy_pass http://core; }   </span><span class="c"># carts, orders, payments</span><span class="o">
}</span></pre>
          <ol class="points term-note">
            <li>Only the catalogue’s paths are split. Carts, orders and payments still go to the core API. (The proxy settings from page 4.3 are left out here.)</li>
            <li><code>split_clients</code> hashes the visitor’s IP address, so the same visitor keeps landing on the same side, and sees one version consistently. Many mobile shoppers share one address through their carrier, so 10% of addresses isn’t exactly 10% of shoppers; for a rollout, that’s close enough.</li>
            <li>The <code>map</code> sends anyone with the <code>tz_beta</code> cookie to the new service, whatever the split says. That’s how staff try it first.</li>
            <li>To go from 10% to 50%, change one number and run <code>nginx -s reload</code>: requests in progress finish on the old settings. To roll back, delete the <code>10%</code> line and reload.</li>
          </ol>
        </figure>

        <p>Step through the rollout:</p>
        <div class="widget" data-widget="strangler-arch"></div>

        <h2>What Tomazon has signed up for</h2>
        <ol class="points">
          <li>The catalogue was the easy one: it only reads. The hard ones are still in the core API, and they write.</li>
          <li>Picture orders as its own service. Checkout calls the payment service, the payment succeeds, and then the order service crashes before it saves the order. The shopper has paid for an order that doesn’t exist.</li>
          <li>Inside the monolith, one database transaction made that impossible: both happened, or neither did. Across services, there’s no such transaction. Keeping data consistent across services is one of the hardest problems in software.</li>
        </ol>
        <table class="data">
          <thead><tr><th>In the monolith</th><th>Across services</th></tr></thead>
          <tbody>
            <tr><td>A function call that always arrives</td><td>A network call that can be slow, fail, or arrive twice</td></tr>
            <tr><td>One transaction for the order and the payment</td><td>Two services, two databases, and no transaction across them</td></tr>
            <tr><td>One log to read when something breaks</td><td>A request that crosses services, followed with distributed tracing</td></tr>
            <tr><td>One deploy</td><td>Versioned contracts, so each service can deploy without breaking the others</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>Calls from one service straight to another are fragile: if the other service is down or slow, the caller is stuck too.</li>
          <li>The answer is to stop waiting for each other. A service records what happened, such as “payment received”, and the others act on it when they can, safely, even if they’re down for a while. Chapter 8 does that with queues and events.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Migrate with a router, not a rewrite.</strong> A router in front lets old and new run side by side, and
            makes every step reversible.</li>
            <li><strong>Move traffic in small steps, and measure each one.</strong> Compare errors and p95 between the old and new
            paths before the next step.</li>
            <li><strong>Finish the job.</strong> Delete the old code once the new service has all the traffic. Two copies of the
            same feature, half-migrated, are worse than either one.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Route a little traffic, measure, route more, and delete the old code at the end.</p>
        </aside>`
    }
  ]
};
