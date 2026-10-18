/* Chapter 10: Run many services.
   Same conventions as the earlier chapters. One page: Tomazon's services are already containers,
   but people still run them; Kubernetes, on Amazon EKS, takes that job over. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[10] = {
  intro: `
    <ol class="points lede">
      <li>Tomazon passes 5 million users. It runs six kinds of program, about 20 copies in all, on servers that people look after by hand.</li>
      <li>This chapter shows why containers alone aren’t enough, and hands the running of the programs to Kubernetes.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain why running many services by hand stops working.</li>
        <li>Say what containers solve, and what they leave to people.</li>
        <li>Explain what Kubernetes does, and how Tomazon runs on Amazon EKS.</li>
      </ul>
    </div>`,

  sections: [

    /* ========================================================== The problem */
    {
      group: 'The next bottleneck',
      slug: 'kubernetes',
      title: '5 million users, and too many programs to run by hand',
      sub: 'The services are already containers. Something still has to run them, and today that’s people.',
      html: `
        <ol class="points lede">
          <li>Tomazon now runs six kinds of program: the core API, the catalogue, the cache invalidators, the search indexer, the email sender and the photo resizer.</li>
          <li>That’s about 20 copies in all, and 30 during a sale, on EC2 servers that people set up and look after by hand.</li>
        </ol>

        <h2>The bottleneck: people</h2>
        <ol class="points">
          <li><strong>A server dies, and a person rebuilds it.</strong> At 2 a.m. one night, a worker server fails. The email sender and the photo resizer on it stop, and the engineer on call takes two hours to work out what ran there and set it up again.</li>
          <li><strong>Deploys log into servers one by one.</strong> Last week the script failed halfway, and shoppers saw two versions of the catalogue for an hour.</li>
          <li><strong>Sales need servers added by hand,</strong> and the load balancer’s list edited by hand, then undone afterwards.</li>
          <li>The servers aren’t the limit any more. The people running them are.</li>
        </ol>

        <h2>Containers help, but aren’t enough</h2>
        <ol class="points">
          <li>Every service is already packaged as a <strong>container image</strong>: its code, its libraries and everything else it needs, built once and run the same on any server.</li>
          <li>That fixed “it works on that server”. But a container is only a package. It doesn’t choose a server to run on, notice when its server dies, start again somewhere else, or tell other services where it is.</li>
        </ol>

        <h2>Where Kubernetes helps</h2>
        <ol class="points">
          <li><strong>Kubernetes</strong> runs containers across a group of servers, called <strong>nodes</strong>, that together make a <strong>cluster</strong>. Each running copy of a program is a <strong>pod</strong>.</li>
          <li>You don’t tell it how. You write down what you want, in short files called <strong>manifests</strong>: “keep 10 copies of the catalogue running, each with 1 CPU and 1 GB of memory”.</li>
          <li>Kubernetes compares what you asked for with what is running, all the time, and fixes any difference.</li>
        </ol>
        <table class="data">
          <thead><tr><th>When</th><th>By hand</th><th>With Kubernetes</th></tr></thead>
          <tbody>
            <tr><td>A program crashes</td><td>Someone restarts it</td><td>It’s restarted in seconds</td></tr>
            <tr><td>A server dies</td><td>Someone rebuilds it, from memory</td><td>Its pods start again on other nodes, within minutes</td></tr>
            <tr><td>Deciding what runs where</td><td>A person chooses, and some servers sit half empty</td><td>Each pod goes to a node with room for it</td></tr>
            <tr><td>A new version</td><td>A script logs into servers one by one</td><td>Pods are replaced a few at a time, and one command undoes it</td></tr>
            <tr><td>A sale</td><td>Servers added by hand</td><td>More pods, and more nodes, added as the load grows</td></tr>
            <tr><td>Finding a service</td><td>Addresses in config files</td><td>One stable name, such as <code>http://catalogue</code>, however many pods it has</td></tr>
          </tbody>
        </table>

        <h2>The new architecture</h2>
        <ol class="points">
          <li><strong>Amazon EKS</strong> is Kubernetes run by AWS. AWS runs the part that makes the decisions; Tomazon’s nodes, EC2 servers in three zones, run the pods. Karpenter adds and removes nodes as the pods need room.</li>
          <li>All six programs move into the cluster. An Application Load Balancer, set up by Kubernetes, replaces the Nginx load balancer from chapters 4 and 7.</li>
          <li><strong>The data stays outside:</strong> PostgreSQL and Redis on their own EC2 servers, Kafka on MSK, photos on S3 and CloudFront. A pod can be replaced at any moment; the data can’t.</li>
        </ol>
        <div class="widget" data-widget="eks-arch"></div>`
    }
  ]
};
