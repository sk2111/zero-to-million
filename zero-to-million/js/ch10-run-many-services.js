/* Chapter 10: Run many services.
   Same conventions as the earlier chapters. Tomazon now runs many programs on hand-built
   servers; a server dies at 2 a.m. Containers package them; Kubernetes runs them. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[10] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 5 million users. It now runs six kinds of program, about 20 copies in all and 30 during a sale, on servers that people set up and look after by hand.</li>
      <li>Every new service made the system easier to change, and harder to run. Each server is a little different, and the person on call is the only one who knows what runs where.</li>
      <li>This chapter packages every program the same way, as a container, and hands the running of them to Kubernetes.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Name the jobs that running many services by hand leaves to people.</li>
        <li>Explain what a container is, and what it isn’t.</li>
        <li>Explain how Kubernetes keeps a cluster the way you declared it.</li>
        <li>Write a Deployment and a Service, with probes and resource requests.</li>
        <li>Plan a move to Amazon EKS, and know its traps and its costs.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The problem',
      slug: 'server-died',
      title: 'The night a server died',
      sub: 'One worker server failed at 2 a.m., and putting it back depended on one person’s memory.',
      html: `
        <ol class="points lede">
          <li>Tomazon’s programs run on about 20 EC2 servers. The API services have servers of their own. The smaller programs share a few worker servers, placed wherever there was room at the time.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Program</th><th>Copies</th><th>Where it runs</th></tr></thead>
          <tbody>
            <tr><td>Core API</td><td>6</td><td>Its own 6 servers</td></tr>
            <tr><td>Catalogue service</td><td>10, and 20 in a sale</td><td>Its own servers, added by hand before each sale</td></tr>
            <tr><td>Cache invalidator</td><td>2</td><td>Worker servers 1 and 2</td></tr>
            <tr><td>Search indexer</td><td>1</td><td>Worker server 2</td></tr>
            <tr><td>Email sender</td><td>1</td><td>Worker server 2</td></tr>
            <tr><td>Photo resizer</td><td>1</td><td>Worker server 2</td></tr>
          </tbody>
        </table>

        <h2>Saturday, 2 a.m.</h2>
        <ol class="steps">
          <li><strong>Worker server 2 fails.</strong> The hardware under it breaks, and EC2’s status check fails. The alert wakes the engineer on call.</li>
          <li><strong>Some things heal themselves.</strong> The other cache invalidator takes over in under a minute, because Kafka hands it the dead one’s partitions (page 8.3).</li>
          <li><strong>The rest just stop.</strong> Order emails and resize jobs pile up in their SQS queues, and the search indexer’s lag grows in Kafka. Nothing is lost (page 8.2), but no order confirmations go out, and new photos show as blank.</li>
          <li><strong>The rebuild.</strong> The engineer launches a new server and runs the setup scripts. They fail: the resizer needs a newer image library than the scripts install, and one Python package won’t build on the newer Ubuntu.</li>
          <li><strong>4 a.m.: everything is back.</strong> Two hours, most of it spent remembering what ran on the dead server and how it was set up.</li>
        </ol>
        <ol class="points">
          <li>Deploys are fragile too. A script logs into the 10 catalogue servers one by one. Last week it failed halfway, and shoppers got two versions of the catalogue for an hour.</li>
          <li>And addresses live in config files. Adding catalogue servers for a sale means editing the load balancer’s list by hand, and removing them again after.</li>
        </ol>

        <h2>The jobs left to people</h2>
        <table class="data">
          <thead><tr><th>Job</th><th>Today</th><th>What it should be</th></tr></thead>
          <tbody>
            <tr><td>The same software everywhere</td><td>Servers set up months apart, by scripts that have drifted</td><td>One package, built once, that runs the same on every server</td></tr>
            <tr><td>Healing</td><td>A person restarts what crashed, and rebuilds what was lost</td><td>Crashed programs restart; lost ones start again elsewhere</td></tr>
            <tr><td>Placing programs</td><td>A person decides what runs where; some servers sit half empty</td><td>Software places each copy where there’s room</td></tr>
            <tr><td>Rolling out</td><td>A script logs into servers one by one</td><td>Copies replaced gradually, checked, and undone with one command</td></tr>
            <tr><td>Finding each other</td><td>Addresses in config files, edited by hand</td><td>Each service has one stable name, however many copies it has</td></tr>
            <tr><td>Scaling</td><td>Servers added by hand before a sale</td><td>Copies, and servers, added as the load grows</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Every server set up by hand drifts.</strong> If you can’t rebuild a server from scratch, automatically,
            you don’t really know what’s on it.</li>
            <li><strong>Count the single copies.</strong> Every program with only one copy is an outage waiting for its server to
            fail. Queues and logs made this one an inconvenience instead of data loss.</li>
            <li><strong>Operations is part of the design.</strong> Each service you add is something more to deploy, watch, heal
            and place. At some point that work needs software, not people.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>If putting a server back needs someone’s memory, it isn’t automated yet.</p>
        </aside>`
    },

    /* =========================================================== Containers */
    {
      group: 'Containers',
      slug: 'containers',
      title: 'Containers: one package that runs anywhere',
      sub: 'A program and everything it needs, in one image that runs the same everywhere.',
      html: `
        <ol class="points lede">
          <li>A <strong>container</strong> runs a program together with everything it needs: the language runtime, the libraries, the system packages and its own files.</li>
          <li>The same container runs the same way on a laptop, in CI and in production. The resizer’s image library goes wherever the resizer goes.</li>
        </ol>

        <h2>What a container is</h2>
        <ol class="points">
          <li><strong>It isn’t a virtual machine.</strong> A container is an ordinary Linux process, which the kernel isolates. It gets its own view of the files, processes and network (namespaces), and limits on how much CPU and memory it may use (cgroups).</li>
          <li><strong>All containers on a server share its kernel.</strong> So a container starts in about a second, once its image is on the server, and adds almost no overhead. A VM boots a whole operating system of its own.</li>
          <li><strong>An image is the package a container starts from.</strong> It’s read-only, built in layers from a <code>Dockerfile</code>, and kept in a registry; on AWS, that’s Amazon ECR.</li>
        </ol>
        <table class="data">
          <thead><tr><th></th><th>Virtual machine (an EC2 server)</th><th>Container</th></tr></thead>
          <tbody>
            <tr><td>Isolation</td><td>Its own kernel, enforced by the hypervisor</td><td>A shared kernel, with namespaces and cgroups</td></tr>
            <tr><td>Starts in</td><td>Tens of seconds to minutes</td><td>About a second, once the image is there</td></tr>
            <tr><td>Size</td><td>Gigabytes: a whole operating system</td><td>Tens to hundreds of megabytes: an app and its libraries</td></tr>
            <tr><td>On one server</td><td>One, or a few</td><td>Dozens</td></tr>
          </tbody>
        </table>

        <h2>Packaging the catalogue service</h2>
        <figure class="term">
          <figcaption>Dockerfile for the catalogue service</figcaption>
<pre><span class="o">FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt     </span><span class="c"># cached until requirements change</span><span class="o">
COPY . .

USER 1000                                              </span><span class="c"># don’t run as root</span><span class="o">
EXPOSE 8000
CMD ["uvicorn", "catalogue.main:app", "--host", "0.0.0.0", "--port", "8000"]</span></pre>
          <ol class="points term-note">
            <li>Each line makes a layer, and unchanged layers are reused. Copying <code>requirements.txt</code> before the code means a code change doesn’t reinstall every package.</li>
            <li>One process per container. To serve more, Kubernetes runs more containers, not more workers inside one.</li>
          </ol>
        </figure>
        <figure class="term">
          <figcaption>Build it once, tag it with the commit, and push it to ECR</figcaption>
<pre><span class="p">$</span> docker build -t 111122223333.dkr.ecr.ap-south-1.amazonaws.com/catalogue:9f3c2ab .
<span class="p">$</span> docker push 111122223333.dkr.ecr.ap-south-1.amazonaws.com/catalogue:9f3c2ab</pre>
          <ol class="points term-note">
            <li>The tag is the Git commit, never <code>latest</code>. The image CI tested is exactly the one production runs, and you can always tell which code is running.</li>
          </ol>
        </figure>

        <h2>The rules for containers</h2>
        <ol class="points">
          <li><strong>Nothing important is kept inside.</strong> A container can be replaced at any moment, so state lives in the database, Redis or S3, as for the stateless servers of page 4.4.</li>
          <li><strong>Settings come from outside,</strong> as environment variables or mounted files. The same image runs in testing and in production.</li>
          <li><strong>Logs go to standard output,</strong> where the platform collects them. A log file inside the container vanishes with it.</li>
          <li><strong>The memory limit is a hard wall.</strong> A container that goes past it is killed at once, with exit code 137, <code>OOMKilled</code> (page 1.6).</li>
          <li><strong>Docker builds images; it needn’t run them.</strong> Since version 1.24, Kubernetes runs containers through a runtime such as containerd, not Docker. Images built with Docker are a standard format (OCI), and run unchanged.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Build once, run anywhere.</strong> An image built in CI and promoted unchanged to production removes a whole
            class of “works on that server” failures.</li>
            <li><strong>Containers are disposable.</strong> Design every service so that losing any copy, at any moment, loses
            nothing.</li>
            <li><strong>Containers alone don’t solve the night of the dead server.</strong> They make every program easy to start
            anywhere; something still has to decide where, and notice when it’s gone.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>One image per commit, one process per container, and nothing inside that you’d miss.</p>
        </aside>`
    },

    /* =========================================================== Kubernetes */
    {
      group: 'Kubernetes',
      slug: 'kubernetes',
      title: 'Kubernetes: say what, not how',
      sub: 'You declare what should run. Kubernetes keeps comparing that with what is running, and fixes the difference.',
      html: `
        <ol class="points lede">
          <li><strong>Kubernetes</strong> runs containers across a group of servers, called a <strong>cluster</strong>.</li>
          <li>You don’t tell it “start this container on server 3”. You tell it what you want: “keep 10 copies of <code>catalogue:9f3c2ab</code> running, each with 1 CPU and 1 GB of memory”.</li>
          <li>Its controllers compare what you asked for with what’s running, all the time, and fix any difference. A crashed copy is restarted, a missing one is created, an extra one is stopped. That loop is the whole idea.</li>
        </ol>

        <h2>The parts</h2>
        <dl class="terms">
          <div><dt>Node</dt><dd>One server in the cluster, such as an EC2 instance. An agent on each node, the kubelet, starts and watches its containers.</dd></div>
          <div><dt>Control plane</dt><dd>The cluster’s brain: the API server you send changes to, the database it keeps them in (etcd), the scheduler that picks a node for each new pod, and the controllers.</dd></div>
          <div><dt>Pod</dt><dd>The smallest thing Kubernetes runs: one container, occasionally a few that must sit together, with one IP address. Pods are disposable: they’re replaced, never repaired.</dd></div>
          <div><dt>Deployment</dt><dd>“Keep this many pods of this image running.” It also replaces them gradually when the image changes.</dd></div>
          <div><dt>Service</dt><dd>One stable name and address for a set of pods, such as <code>http://catalogue</code>. It always points at the pods that are ready, wherever they are.</dd></div>
          <div><dt>Gateway and HTTPRoute</dt><dd>How traffic from outside gets in: which hostnames and paths go to which Service.</dd></div>
          <div><dt>ConfigMap and Secret</dt><dd>Settings and passwords, given to pods as environment variables or files.</dd></div>
          <div><dt>Probes</dt><dd>Checks the kubelet runs on each container. Readiness: should this pod get traffic now? Liveness: is it stuck, and should it be restarted?</dd></div>
        </dl>

        <h2>The catalogue, declared</h2>
        <figure class="term">
          <figcaption>catalogue.yaml: a Deployment and a Service</figcaption>
<pre><span class="o">apiVersion: apps/v1
kind: Deployment
metadata:
  name: catalogue
spec:
  replicas: 10
  selector:
    matchLabels: { app: catalogue }
  template:
    metadata:
      labels: { app: catalogue }
    spec:
      containers:
      - name: catalogue
        image: 111122223333.dkr.ecr.ap-south-1.amazonaws.com/catalogue:9f3c2ab
        ports: [{ containerPort: 8000 }]
        resources:
          requests: { cpu: "1", memory: 1Gi }      </span><span class="c"># what the scheduler sets aside</span><span class="o">
          limits: { memory: 1Gi }                  </span><span class="c"># past this, the container is killed</span><span class="o">
        readinessProbe:
          httpGet: { path: /healthz/ready, port: 8000 }
          periodSeconds: 5
        livenessProbe:
          httpGet: { path: /healthz/live, port: 8000 }
          periodSeconds: 10
          failureThreshold: 3
---
apiVersion: v1
kind: Service
metadata:
  name: catalogue
spec:
  selector: { app: catalogue }
  ports: [{ port: 80, targetPort: 8000 }]</span></pre>
          <ol class="points term-note">
            <li><code>requests</code>: the scheduler places a pod only on a node with that much CPU and memory not yet set aside.</li>
            <li>There’s a memory limit but no CPU limit, a common choice for web services: a busy pod may use a node’s spare CPU, instead of being slowed down at its limit.</li>
            <li>The readiness probe keeps a pod out of the Service until it’s ready, and takes it out again if it stops being ready.</li>
            <li>The liveness probe restarts a pod that has stopped responding three times in a row. It checks only the process itself, never the database: if PostgreSQL is slow, restarting every pod at once makes things worse.</li>
            <li><code>kubectl apply -f catalogue.yaml</code> sends it to the cluster. Changing the image tag and applying again is a deploy.</li>
          </ol>
        </figure>

        <p>Break the cluster and watch it recover:</p>
        <div class="widget" data-widget="k8s-cluster"></div>

        <h2>What happens when</h2>
        <table class="data">
          <thead><tr><th>Event</th><th>What Kubernetes does</th><th>How long</th></tr></thead>
          <tbody>
            <tr><td>A container crashes</td><td>The kubelet restarts it in place. If it keeps crashing, it waits longer each time (<code>CrashLoopBackOff</code>)</td><td>Seconds; then from 10 seconds up to 5 minutes between tries</td></tr>
            <tr><td>A node dies</td><td>Marks it <code>NotReady</code> and stops sending its pods traffic; later, recreates them on other nodes</td><td>About a minute to stop the traffic; by default, 5 minutes more to recreate</td></tr>
            <tr><td>A new image is deployed</td><td>A rolling update: by default up to 25% extra pods start, and at most 25% are unavailable at once. Each new pod must be ready before more old ones stop</td><td>Minutes, depending on the pod count and start-up time</td></tr>
            <tr><td>Load grows</td><td>The Horizontal Pod Autoscaler adds pods. If no node has room, they wait as <code>Pending</code>, and a node autoscaler adds nodes</td><td>Seconds for pods; about a minute for a new node</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Declare the end state, not the steps.</strong> A system that keeps converging on what you declared recovers
            from failures nobody predicted.</li>
            <li><strong>Healing isn’t instant.</strong> A lost node’s pods come back minutes later. Run at least 2 copies of
            everything that matters, on different nodes and zones.</li>
            <li><strong>Probes decide what “healthy” means.</strong> A wrong probe either sends traffic to pods that can’t serve, or
            restarts pods that were fine.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Say what should run, give every container honest requests and probes, and let the cluster keep it so.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Kubernetes',
      slug: 'tomazon-on-eks',
      title: 'Tomazon on EKS',
      sub: 'What moves into the cluster, what stays out, and the settings that keep it calm.',
      html: `
        <ol class="points lede">
          <li>Tomazon moves to Amazon EKS over two months, one service at a time: the workers first, the catalogue next, the core API last. It’s page 7.4’s strangler fig again, with a new home instead of a new service.</li>
        </ol>

        <h2>What moves, and what stays</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Runs on</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Core API, catalogue, cache invalidators, search indexer, email sender, photo resizer</td><td>Pods on EKS</td><td>They keep no state, so any copy can be replaced at any moment</td></tr>
            <tr><td>PostgreSQL and Redis</td><td>Their own EC2 servers, as before</td><td>Data needs careful, rare changes. Moving it into the cluster buys nothing yet</td></tr>
            <tr><td>Kafka and Debezium</td><td>Amazon MSK and MSK Connect</td><td>Already run by AWS (page 8.4)</td></tr>
            <tr><td>Photos</td><td>S3 and CloudFront</td><td>Already run by AWS (page 9.3)</td></tr>
          </tbody>
        </table>

        <h2>The cluster</h2>
        <ol class="points">
          <li><strong>The control plane is EKS’s job.</strong> AWS runs it across three zones, for $0.10 an hour per cluster (about $73 a month) while its Kubernetes version is in standard support. In extended support, it’s six times that, so upgrade on time.</li>
          <li><strong>The nodes are Tomazon’s:</strong> c7g.2xlarge instances in three zones, added and removed by Karpenter as pods need room.</li>
          <li><strong>Every pod gets a VPC address.</strong> EKS’s network plugin gives each pod a real IP address in the VPC, so a c7g.2xlarge can hold 58 pods. The subnets need room for every pod, not just every server.</li>
          <li><strong>Traffic comes in through the Gateway API.</strong> The AWS Load Balancer Controller turns Tomazon’s Gateway into an Application Load Balancer, and its HTTPRoutes into the ALB’s rules. The Nginx load balancer from chapters 4 and 7 retires.</li>
          <li><strong>Not ingress-nginx.</strong> The popular Ingress controller built on Nginx was retired in March 2026, with no more fixes or security updates. New clusters should use the Gateway API.</li>
        </ol>
        <figure class="term">
          <figcaption>routes.yaml: page 7.4’s routing, now as an HTTPRoute</figcaption>
<pre><span class="o">apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: tomazon
spec:
  parentRefs:
  - name: tomazon-public                       </span><span class="c"># the Gateway, which becomes the ALB</span><span class="o">
  hostnames: ["tomazon.com"]
  rules:
  - matches:
    - path: { type: PathPrefix, value: /api/home }
    - path: { type: PathPrefix, value: /api/products }
    - path: { type: PathPrefix, value: /api/search }
    backendRefs:
    - { name: catalogue, port: 80 }
  - backendRefs:                               </span><span class="c"># everything else</span><span class="o">
    - { name: core, port: 80 }</span></pre>
          <ol class="points term-note">
            <li>Each <code>backendRef</code> can also carry a <code>weight</code>, so the next strangler fig’s 10% split is two numbers in this file instead of <code>split_clients</code>.</li>
          </ol>
        </figure>
        <p>Follow the requests through the cluster:</p>
        <div class="widget" data-widget="eks-arch"></div>

        <h2>Settings that keep it calm</h2>
        <table class="data">
          <thead><tr><th>Setting</th><th>Tomazon’s choice</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>Copies and spread</td><td>At least 2 pods per service, spread across zones with <code>topologySpreadConstraints</code></td><td>A node, or a whole zone, can go</td></tr>
            <tr><td>Autoscaling</td><td>Catalogue: 6 to 30 pods, aiming for 60% CPU</td><td>Sales scale themselves</td></tr>
            <tr><td>Disruption budget</td><td>A <code>PodDisruptionBudget</code> of at most 1 pod per service unavailable</td><td>Node upgrades drain nodes; this stops them taking too many copies at once</td></tr>
            <tr><td>Requests</td><td>Set from measured use, and checked every quarter</td><td>Too high wastes nodes; too low packs pods onto nodes that then run out of memory</td></tr>
            <tr><td>Graceful shutdown</td><td>A 10-second pause before a pod stops (<code>preStop</code>), within a 30-second grace period</td><td>The load balancer takes a few seconds to stop sending to a stopping pod. Without the pause, deploys cause errors</td></tr>
          </tbody>
        </table>

        <h2>The traps</h2>
        <table class="data">
          <thead><tr><th>Trap</th><th>What happens</th><th>The fix</th></tr></thead>
          <tbody>
            <tr><td>A liveness probe that checks the database</td><td>PostgreSQL slows down, every probe fails, and every pod restarts at once</td><td>Liveness checks the process only. Dependencies belong, at most, in readiness</td></tr>
            <tr><td>No resource requests</td><td>The scheduler packs pods anywhere; nodes run out of memory, and pods are evicted</td><td>Requests on every container</td></tr>
            <tr><td>A memory limit set too tight</td><td>Pods are <code>OOMKilled</code> at the peak of a sale</td><td>Set it from the measured peak, with room to spare</td></tr>
            <tr><td>The <code>latest</code> tag</td><td>Nobody can tell which code runs, and rollbacks don’t roll back</td><td>Tag by commit</td></tr>
            <tr><td>Running out of IP addresses</td><td>New pods stay <code>Pending</code>: no address left in the subnet</td><td>Size subnets for pods, or turn on prefix delegation</td></tr>
            <tr><td>Postponed upgrades</td><td>The version leaves standard support, and the cluster costs six times as much</td><td>Upgrade a version every few months, as routine work</td></tr>
          </tbody>
        </table>

        <h2>Is it worth it?</h2>
        <ol class="points">
          <li>Kubernetes is a large system to learn and to run. For a team with two or three programs, a few well-scripted servers, or Amazon ECS, which is simpler and AWS-only, cost far less effort.</li>
          <li>Tomazon now has six kinds of program, 20 to 30 copies, and 25 engineers who deploy every day. At that point, the jobs Kubernetes does (healing, placing, rolling out, finding and scaling) cost more done by people.</li>
        </ol>

        <h2>What we chose</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>Choice</th></tr></thead>
          <tbody>
            <tr><td>Packaging</td><td>One image per service, tagged with the commit, in Amazon ECR</td></tr>
            <tr><td>Cluster</td><td>Amazon EKS in Mumbai, nodes in three zones, added and removed by Karpenter</td></tr>
            <tr><td>Traffic in</td><td>Gateway API, made into an ALB by the AWS Load Balancer Controller</td></tr>
            <tr><td>Each service</td><td>A Deployment, a Service if anything calls it, probes, requests, at least 2 pods across zones</td></tr>
            <tr><td>Outside the cluster</td><td>PostgreSQL and Redis on EC2; Kafka on MSK; photos on S3 and CloudFront</td></tr>
          </tbody>
        </table>

        <h2>Where this leads</h2>
        <ol class="points">
          <li>The app tier can now grow as far as the load needs: more pods, more nodes, no one awake.</li>
          <li>The data can’t. Every order, payment and stock change still goes to one PostgreSQL primary. Replicas spread the reads (page 5.2), but every write still lands on that one server, and its disk keeps growing.</li>
          <li>A bigger server buys time, not a solution. Chapter 11 splits the data itself across several databases.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Keep state out of the first move.</strong> Put the stateless services on the platform first. Databases can
            follow later, if ever, once the team knows the platform well.</li>
            <li><strong>A platform is a product.</strong> Someone has to own the cluster, its upgrades and its defaults, or every
            team reinvents them.</li>
            <li><strong>Adopt it when the manual work costs more.</strong> Kubernetes pays off with many services and frequent
            deploys, not before.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Move stateless services first, keep the data outside, and upgrade the cluster as routine work.</p>
        </aside>`
    }
  ]
};
