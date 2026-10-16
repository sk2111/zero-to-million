/* Chapter 1: Fundamentals.
   Each section is one page: `title` and `sub` make the page header, `group`
   is the part of the chapter it belongs to (shown in the sidebar), and `html`
   is the body. Elements with data-widget="…" are filled in by widgets.js.
   Every resource goes the same way: how it works, how it behaves in practice,
   then what it means for system design. Text is written as numbered points
   (ol.points) rather than paragraphs; a list that continues after a widget or
   table uses start="…". Numbers are rounded on purpose: they are orders of
   magnitude to remember, not benchmarks. */
window.ZTM = window.ZTM || {};
ZTM.content = ZTM.content || {};

ZTM.content[1] = {
  intro: `
    <ol class="points lede">
      <li>Every system you will ever scale, from a side project to a production application, runs on the same few parts: CPU, memory, disk and network.</li>
      <li>The operating system shares those parts out between all the programs on the machine.</li>
      <li>For each part we start with how it works, then how it behaves under load, then what it means when you design a system.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain what clock speed, cores, processes and threads mean for how fast your code can run.</li>
        <li>Read <code>top</code>, <code>htop</code>, <code>free</code>, <code>iostat</code> and <code>ss</code> and say which resource is the bottleneck.</li>
        <li>Explain why a server at 90% CPU feels far slower than one at 50%.</li>
        <li>Estimate on paper how many users one server can handle.</li>
      </ul>
    </div>`,

  sections: [

    /* ================================================================== CPU */
    {
      group: 'CPU',
      slug: 'cpu',
      title: 'How a CPU works',
      sub: 'Clock speed, cores, and what a core is really doing all day.',
      html: `
        <ol class="points lede">
          <li>A CPU runs instructions: add two numbers, compare two values, load something from memory, jump to another place in the code.</li>
          <li>Your Python function, your SQL query and your JSON parser all end up as millions of these tiny instructions. The example below shows how.</li>
          <li>How fast a CPU is comes down to two things: its <strong>clock speed</strong> (how many steps each core takes per second) and its <strong>number of cores</strong> (how many of those step-takers work side by side).</li>
        </ol>

        <h2>From one line of Python to CPU instructions</h2>
        <div class="compile" role="group" aria-label="One line of Python, the bytecode it becomes, and the machine instructions behind one bytecode step">
          <div class="cp-panel">
            <p class="cp-head"><b>1. Your code</b><span>1 line</span></p>
<pre class="cp-code"><span class="cp-dim">def add_gst(price):</span>
    <span data-k="ret">return</span> <span data-k="load">price</span> <span data-k="mul">*</span> <span data-k="const">1.18</span></pre>
          </div>
          <div class="cp-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg></div>
          <div class="cp-panel">
            <p class="cp-head"><b>2. Python bytecode</b><span>4 steps</span></p>
<pre class="cp-code"><span data-k="load">LOAD_FAST     price</span>
<span data-k="const">LOAD_CONST    1.18</span>
<span data-k="mul">BINARY_OP     *</span>
<span data-k="ret">RETURN_VALUE</span></pre>
          </div>
          <div class="cp-panel cp-machine">
            <p class="cp-head"><b>3. What the CPU runs for one step, <code>BINARY_OP *</code></b><span>dozens of instructions</span></p>
<pre class="cp-code">mov     rdi, [rsp+8]         <span class="cp-dim">; get the price object</span>
cmp     [rdi+8], rbx         <span class="cp-dim">; is it really a float?</span>
jne     slow_path            <span class="cp-dim">; if not, take the long way round</span>
movsd   xmm0, [rdi+16]       <span class="cp-dim">; load its value from memory</span>
mulsd   xmm0, [rsi+16]       <span class="cp-dim">; multiply it by 1.18</span>
call    PyFloat_FromDouble   <span class="cp-dim">; wrap the answer in a new Python object</span>
<span class="cp-dim">…       then reference counting, and fetching the next step</span></pre>
          </div>
        </div>
        <p class="caption">Simplified x86-64. Point at a piece of the code to see where it goes. You can see the bytecode for
        your own code with <code>python -m dis yourfile.py</code>.</p>
        <ol class="points">
          <li>One line of Python became 4 bytecode steps, and each step becomes dozens to hundreds of machine instructions, depending on the types involved.</li>
          <li>At 3 GHz and about one instruction per tick, a few hundred instructions take about a tenth of a microsecond.</li>
          <li>Compiled languages such as Go, Rust and C (and Java once its JIT has warmed up) turn the same line into a handful of machine instructions. That’s one reason they run CPU-heavy code 10–100 times faster than standard Python.</li>
        </ol>

        <h2>The clock: what a “tick” is</h2>
        <ol class="points">
          <li>Everything inside a CPU moves in step with a clock, like a metronome that beats billions of times a second.</li>
          <li>On each beat, or tick, a core moves its instructions one stage further: fetch the next instruction, decode it, execute it, store the result.</li>
          <li><strong>Clock speed</strong> is the number of ticks per second, measured in gigahertz (GHz). 3 GHz means 3 billion ticks a second, so one tick lasts a third of a nanosecond.</li>
          <li>Modern cores overlap those stages and work on several instructions at once, so at best a core finishes 4 or more instructions per tick. Real server code averages around 1, because the core often waits for data from memory.</li>
          <li>Put together: instructions per second ≈ clock speed × instructions per tick × number of cores. 3 GHz × 1 × 8 cores is about 24 billion instructions a second.</li>
        </ol>

        <div class="figures">
          <div class="fig"><small>Clock speed</small><b>3 GHz</b><span>3 billion ticks a second for each core.</span></div>
          <div class="fig"><small>Instructions per tick</small><b>About 1</b><span>What real server code often manages. Up to 4 or more at peak.</span></div>
          <div class="fig"><small>Number of cores</small><b>4–64 vCPUs</b><span>A typical cloud server. On Intel and AMD, one vCPU is half a physical core.</span></div>
        </div>

        <h2>What to look for in a CPU</h2>
        <table class="data">
          <thead><tr><th>Parameter</th><th>Typical server value</th><th>What it tells you</th><th>Matters most for</th></tr></thead>
          <tbody>
            <tr><td>Clock speed</td><td>2–3.5 GHz base, up to about 4 GHz boost</td><td>Ticks per second for each core. Boost is the top speed when the chip is cool and not fully loaded.</td><td>How long one CPU-heavy request takes</td></tr>
            <tr><td>Physical cores</td><td>8 to over 100 per chip</td><td>How many things truly run at the same instant</td><td>Throughput: requests served in parallel</td></tr>
            <tr><td>Threads per core</td><td>1 or 2</td><td>Hyper-threading: one core presenting itself as two, so it can work on a second thread while the first waits for memory</td><td>About 10–30% more throughput, not twice as much</td></tr>
            <tr><td>vCPUs</td><td>2 to 192+ per cloud instance</td><td>What the cloud bills you for: one hyper-thread on Intel and AMD, a whole core on AWS Graviton</td><td>Comparing instance sizes and prices</td></tr>
            <tr><td>Generation</td><td>e.g. AMD EPYC Zen 5, Intel Xeon 6, AWS Graviton4</td><td>How much work each tick does. A newer core at the same GHz can be 1.5 times faster than one from ten years earlier.</td><td>Getting more for the same money. Don’t compare GHz across generations; benchmark.</td></tr>
            <tr><td>Cache (L2 and L3)</td><td>1–2 MB L2 per core, tens to hundreds of MB L3</td><td>How much hot data stays right next to the cores</td><td>Databases, caches, anything with a big working set</td></tr>
            <tr><td>Instruction set</td><td>x86-64 (Intel, AMD) or ARM64 (Graviton, Ampere)</td><td>Which machine instructions the chip understands</td><td>Your binaries and Docker images must be built for it. ARM is often cheaper for the same work.</td></tr>
            <tr><td>Sockets</td><td>1 or 2 CPU chips per server</td><td>Two chips means two groups of memory (NUMA)</td><td>Very large databases</td></tr>
          </tbody>
        </table>

        <h2>Clock speed stopped growing, so cores multiplied</h2>
        <ol class="points">
          <li>Until about 2005, every new CPU had a faster clock, and old code simply got quicker.</li>
          <li>Then clock speeds hit a wall at around 3–4 GHz: going faster made the chips too hot to cool.</li>
          <li>Chip makers spent their extra transistors on more cores instead.</li>
          <li>That is the root of this whole workshop. One core isn’t getting much faster, so the only way to do more work is in parallel: first more cores, then more machines.</li>
        </ol>

        <h2>A core spends most of its life waiting</h2>
        <p>At 3 GHz, a core can do a lot in the time it takes data to arrive:</p>
        <table class="data">
          <thead><tr><th>While the core waits for</th><th class="num">It could have run about</th></tr></thead>
          <tbody>
            <tr><td>A value from its L1 cache (~1 ns)</td><td class="num">3 ticks</td></tr>
            <tr><td>A value from RAM (~100 ns)</td><td class="num">300 ticks</td></tr>
            <tr><td>A 4 KB read from an SSD (~100 µs)</td><td class="num">300,000 ticks</td></tr>
            <tr><td>A round trip to another server in the datacenter (~0.5 ms)</td><td class="num">1.5 million ticks</td></tr>
            <tr><td>A round trip from India to the US (~200 ms)</td><td class="num">600 million ticks</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>When a core waits for RAM, it simply stalls, and that stall still counts as “CPU busy”.</li>
          <li>When a thread waits for disk or network, the OS hands the core to another thread instead.</li>
          <li>This table is why caches, memory layout and network round trips matter so much.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> lscpu | grep -E '^CPU\\(s\\)|Model name|per core|per socket|Socket\\(s\\)'
<span class="o">CPU(s):                  8
  Model name:            Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz
    Thread(s) per core:  2
    Core(s) per socket:  4
    Socket(s):           1</span>
<span class="p">$</span> sudo perf stat -a sleep 5        <span class="c"># count what the whole machine did for 5 seconds</span>
<span class="o">    21,034,551,201      cycles
    14,302,694,817      instructions       #    0.68  insn per cycle</span></pre>
          <ol class="points term-note">
            <li>8 vCPUs, but only 4 real cores with 2 threads each, running at a 2.9 GHz base clock.</li>
            <li>0.68 instructions per cycle (per tick): the cores spend much of their “busy” time waiting for memory.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>CPU % is not how much work you’re doing.</strong> A core stalled on memory shows as 100% busy.
            <code>perf stat</code> shows instructions per cycle; well below 1 usually means memory stalls, not heavy computation.</li>
            <li><strong>With hyper-threads, 50% is not half full.</strong> 16 vCPUs at 50% can mean the 8 physical cores
            are already close to busy. The remaining “half” adds only 10–30% more throughput.</li>
            <li><strong>Parallelism buys throughput, not speed.</strong> More cores let you serve more requests at once.
            A request that needs 200 ms of CPU still takes 200 ms, however many cores you buy.</li>
            <li><strong>Language choice is a capacity decision.</strong> The same CPU-heavy endpoint can need ten times
            the servers in an interpreted language as in a compiled one. For I/O-bound work, the difference mostly disappears.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Buy more cores to serve more requests. Buy faster cores, or write faster code, to make each request quicker.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'CPU',
      slug: 'processes-and-threads',
      title: 'Processes and threads',
      sub: 'How one machine runs hundreds of programs on a handful of cores.',
      html: `
        <ol class="points lede">
          <li>A server with 8 cores is usually running hundreds of programs.</li>
          <li>The OS makes that work by slicing time: each thread gets a core for a few milliseconds, then steps aside for the next one.</li>
          <li>To reason about any server, you need to know what it’s slicing: processes and threads.</li>
        </ol>

        <dl class="terms">
          <div><dt>Process</dt><dd>A running program. It has its own private memory, its own open files and
          connections, and at least one thread. If it crashes, other processes carry on.</dd></div>
          <div><dt>Thread</dt><dd>A line of execution inside a process, with its own place in the code and its own
          stack, sharing everything else with the other threads in that process. The OS schedules threads, not processes.</dd></div>
          <div><dt>Kernel</dt><dd>The core of the OS. Whenever your code needs hardware (read a file, send on a
          socket, get more memory), it asks the kernel through a system call.</dd></div>
        </dl>

        <h2>Process or thread?</h2>
        <table class="data">
          <thead><tr><th></th><th>Process</th><th>Thread</th></tr></thead>
          <tbody>
            <tr><td>Memory</td><td>Private. Others can’t read or corrupt it.</td><td>Shared with every thread in the process.</td></tr>
            <tr><td>Cost to start</td><td>Higher: up to milliseconds for a large program</td><td>Lower: tens of microseconds</td></tr>
            <tr><td>If it crashes</td><td>Only that process dies</td><td>The whole process dies with it</td></tr>
            <tr><td>Sharing data</td><td>Pipes, sockets, shared memory: slower</td><td>Read the same variable, guarded by a lock</td></tr>
            <tr><td>You’ll see it in</td><td>PostgreSQL connections, gunicorn workers, Chrome tabs</td><td>Java and Go servers, Puma, MySQL connections</td></tr>
          </tbody>
        </table>

        <h2>Taking turns on a core</h2>
        <p>Every thread is in one of three states, and only the first one uses the CPU:</p>
        <table class="data">
          <thead><tr><th>State</th><th>What it means</th><th>Uses CPU?</th></tr></thead>
          <tbody>
            <tr><td>Running</td><td>On a core right now</td><td>Yes</td></tr>
            <tr><td>Runnable</td><td>Ready to go, waiting in line for a free core</td><td>No, but it’s in the queue</td></tr>
            <tr><td>Sleeping</td><td>Waiting for disk, network, a lock or a timer</td><td>No</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>When more threads are runnable than there are cores, they queue.</li>
          <li>That queue is what <strong>load average</strong> measures. On Linux it also counts threads stuck waiting on disk.</li>
          <li>A load of 12 on 8 cores means that, on average, 4 threads are waiting for a turn.</li>
          <li>Moving a core from one thread to another is a <strong>context switch</strong>. It takes a few microseconds and leaves the caches full of the previous thread’s data.</li>
          <li>Tens of thousands of context switches a second is normal for a busy server. Far beyond that, the machine spends real time just switching.</li>
        </ol>

        <h2>Why more threads isn’t always faster</h2>
        <ol class="points">
          <li>Threads that share data need locks so they don’t trip over each other.</li>
          <li>While one thread holds a lock, the others wait, however many cores you have.</li>
          <li>Amdahl’s Law puts a number on it: the part of the work that can’t run in parallel caps the speed-up.</li>
        </ol>
        <div class="widget" data-widget="amdahl"></div>
        <ol class="points" start="4">
          <li>It can get worse than flat. When threads keep fighting over the same locks and the same memory, adding cores can make the system slower.</li>
          <li>Neil Gunther’s Universal Scalability Law describes this. You’ll see the same shape again with servers and databases in later chapters.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> ps -o pid,nlwp,rss,cmd -C postgres | head -4     <span class="c"># nlwp = threads in the process</span>
<span class="o">    PID NLWP   RSS CMD
    812    1 27144 postgres: checkpointer
    815    1 11380 postgres: walwriter
   2290    1 14012 postgres: app orders 10.0.1.17(51544) idle</span>
<span class="p">$</span> pidstat -w -p 2290 1                             <span class="c"># context switches per second</span>
<span class="o">14:02:11      UID       PID   cswch/s nvcswch/s  Command
14:02:12      113      2290    412.00      3.00  postgres</span></pre>
          <ol class="points term-note">
            <li>Every PostgreSQL connection is its own process with a single thread.</li>
            <li>This one gives up its core voluntarily 412 times a second (<code>cswch</code>): it’s waiting on disk and network.</li>
            <li>It is almost never pushed off its core (<code>nvcswch</code>), so the CPU is not its problem.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Isolation costs memory; sharing costs safety.</strong> Processes are why one bad request can’t
            corrupt another’s data, and why 100 workers hold 100 copies of your app in memory.</li>
            <li><strong>PostgreSQL runs a process per connection.</strong> A few hundred connections means a few hundred
            processes, which is why production Postgres sits behind a connection pooler such as PgBouncer.</li>
            <li><strong>Standard Python runs one thread at a time.</strong> The GIL lets only one thread execute Python
            code at once (a thread waiting on I/O lets go of it). To use 8 cores, run 8 processes.</li>
            <li><strong>Involuntary context switches mean CPU shortage.</strong> Voluntary switches mean threads are
            waiting on I/O. Involuntary ones mean threads were pushed off a core that someone else needed.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Count runnable threads, not threads. 2,000 sleeping threads are fine; 50 runnable threads on 8 cores are not.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'CPU',
      slug: 'cpu-bound-io-bound',
      title: 'CPU-bound and I/O-bound work',
      sub: 'How work really behaves on a CPU, and why most servers are waiting, not computing.',
      html: `
        <ol class="points lede">
          <li>Every request is a mix of computing and waiting.</li>
          <li>Which one dominates decides how to scale it: more cores, or more requests in flight at once.</li>
        </ol>

        <h2>Most web requests barely use the CPU</h2>
        <p>A typical 50 ms API call, broken down: the CPU is busy for only 4 ms of it.</p>
        <div class="widget" data-widget="request-timeline"></div>

        <div class="split">
          <div>
            <h3>CPU-bound work</h3>
            <ol class="points">
              <li>Time goes into computing: resizing images, hashing passwords, compression, PDFs, ML inference, parsing huge JSON.</li>
              <li>Throughput = cores ÷ CPU time per request.</li>
              <li>8 cores at 10 ms each top out near 800 requests a second.</li>
            </ol>
          </div>
          <div>
            <h3>I/O-bound work</h3>
            <ol class="points">
              <li>Time goes into waiting for a database, another service or the disk.</li>
              <li>Throughput is set by how many requests are in flight.</li>
              <li>8 workers at 50 ms each top out at 160 requests a second, with the CPU over 90% idle.</li>
            </ol>
          </div>
        </div>

        <h2>Reading the CPU line in top</h2>
        <table class="data">
          <thead><tr><th>Field</th><th>Time spent</th><th>If it’s high</th></tr></thead>
          <tbody>
            <tr><td><code>us</code></td><td>Running your code</td><td>CPU-bound: profile it, or add cores</td></tr>
            <tr><td><code>sy</code></td><td>In the kernel, working for you: system calls, networking</td><td>Too many small reads and writes, or too many context switches</td></tr>
            <tr><td><code>wa</code></td><td>Idle, with threads waiting for disk</td><td>Disk-bound, not CPU-bound. More CPU won’t help</td></tr>
            <tr><td><code>st</code></td><td>Taken by the hypervisor for another VM</td><td>A noisy neighbour, or a burstable instance out of credits</td></tr>
            <tr><td><code>id</code></td><td>Idle</td><td>Headroom, unless it’s idle because every thread is waiting on a lock</td></tr>
          </tbody>
        </table>

        <h2>htop: the same numbers, easier to read</h2>
        <ol class="points">
          <li><code>htop</code> draws one bar per core, so a single maxed-out core stands out at a glance. <code>top</code>’s summary line averages it away.</li>
          <li>CPU bar colours: <strong>green</strong> is your code, <strong>red</strong> is the kernel, <strong>blue</strong> is low-priority work, and <strong>cyan</strong> is time taken by the hypervisor (steal).</li>
          <li>Memory bar: <strong>green</strong> is used by programs, <strong>blue</strong> is buffers, and <strong>yellow</strong> is page cache, which Linux gives back when programs need it.</li>
          <li>Useful keys: <kbd>F6</kbd> to sort by CPU or memory, <kbd>t</kbd> for a tree of processes, <kbd>H</kbd> to hide threads, and <kbd>F2</kbd> to turn on “Detailed CPU time”, which shows iowait and steal separately.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> htop
<span class="o">    0[||||||||||||||||||||||||||||||||||97.4%]   Tasks: 112, 389 thr; 2 running
    1[|||||                            14.2%]   Load average: 1.42 1.20 1.05
    2[||||||                           18.9%]   Uptime: 12 days, 03:14:07
    3[||||                             11.0%]
  Mem[|||||||||||||||||||||||     3.10G/7.70G]
  Swp[                              0K/2.00G]</span></pre>
          <ol class="points term-note">
            <li>One core is pinned at 97% while the other three are nearly idle.</li>
            <li>That’s a single-threaded process at its limit, a common sight with standard Python because of the GIL.</li>
            <li><code>top</code> would show this machine as 35% busy and hide the problem. Adding cores won’t help; more processes will.</li>
          </ol>
        </figure>

        <aside class="note runs-out">
          <h3>When it runs out</h3>
          <ol class="points">
            <li><strong>Load average stays above the core count</strong>, and every request gets slower, not just the heavy
            ones, because they all share the queue.</li>
            <li><strong>Containers can run out on an idle machine.</strong> A Kubernetes CPU limit of 1 gives the container
            100 ms of CPU every 100 ms. Four busy threads use that up in 25 ms, and the container is frozen for the other 75.
            Look for <code>nr_throttled</code> in <code>cpu.stat</code>.</li>
            <li><strong>Burstable instances</strong> (AWS T family) run at full speed until their CPU credits are spent,
            then drop to a fraction of a core.</li>
          </ol>
        </aside>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> uptime
<span class="o"> 14:02:11 up 12 days,  3 users,  load average: 3.92, 3.10, 2.45</span>
<span class="p">$</span> top            <span class="c"># press 1 to see each core</span>
<span class="o">%Cpu(s): 88.1 us,  4.0 sy,  0.0 ni,  6.9 id,  0.6 wa,  0.0 hi,  0.1 si,  0.3 st</span>
<span class="p">$</span> cat /sys/fs/cgroup/cpu.stat     <span class="c"># inside a container (cgroup v2)</span>
<span class="o">usage_usec 912334871
nr_periods 51231
nr_throttled 8840
throttled_usec 664210334</span></pre>
          <ol class="points term-note">
            <li>On this 4-core box, load 3.92 and 88% <code>us</code>: CPU-bound and nearly full.</li>
            <li>The container was throttled in 8,840 of 51,231 periods (17%) and lost 664 seconds of running time.</li>
            <li>Users see that as random latency spikes.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Know which kind each endpoint is.</strong> Mixing them on one worker pool is how a few heavy
            requests (a report, an export) slow down every cheap one. Give heavy work its own pool, or a queue (chapter 6).</li>
            <li><strong>I/O-bound services scale with concurrency.</strong> If CPU is low and throughput is capped, you
            need more requests in flight (more workers, async I/O), not more cores.</li>
            <li><strong>Be careful with CPU limits.</strong> Many teams run latency-sensitive services on Kubernetes with
            CPU requests but no CPU limits, or limits well above normal use, because of the throttling above.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Before adding CPU, prove the CPU is the bottleneck: high <code>us</code>, load above the core count, and few threads waiting on I/O.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'CPU',
      slug: 'concurrency',
      title: 'Serving many requests at once',
      sub: 'Worker processes, thread pools and event loops: the three ways servers juggle users.',
      html: `
        <ol class="points lede">
          <li>A server spends most of its time waiting on I/O.</li>
          <li>So the real question is how many requests it can keep in flight while it waits.</li>
          <li>There are three classic answers, and every web framework you use is built on one of them.</li>
        </ol>

        <table class="data">
          <thead><tr><th>Model</th><th>How it works</th><th>You’ll see it in</th><th>Good at</th><th>Watch out for</th></tr></thead>
          <tbody>
            <tr><td>Worker processes</td><td>Each process handles one request at a time</td><td>gunicorn (sync), PHP-FPM, PostgreSQL</td><td>Isolation, simple code</td><td>Memory: 100 workers × 100 MB = 10 GB, for only 100 requests in flight</td></tr>
            <tr><td>Thread pool</td><td>Many threads in one process, one request per thread</td><td>Tomcat and Spring MVC, Puma, MySQL</td><td>Simple blocking code, shared caches</td><td>Each waiting thread still holds its stack, and the pool size caps concurrency</td></tr>
            <tr><td>Event loop</td><td>One thread juggles thousands of requests, switching whenever one would wait</td><td>Node.js, Python asyncio and FastAPI, Nginx, Redis</td><td>Tens of thousands of slow connections</td><td>One CPU-heavy task or one blocking call freezes everyone</td></tr>
          </tbody>
        </table>

        <h2>The C10K problem</h2>
        <ol class="points">
          <li>In 1999, Dan Kegel asked how one server could handle 10,000 connections at once.</li>
          <li>With a thread per connection, 10,000 threads meant gigabytes of stacks and a scheduler drowning in context switches.</li>
          <li>The answer was the event loop, built on OS features (<code>epoll</code> on Linux, <code>kqueue</code> on BSD) that tell one thread which of thousands of sockets are ready.</li>
          <li>Nginx and Node.js grew out of that idea.</li>
        </ol>

        <h2>The modern middle ground</h2>
        <ol class="points">
          <li>Go’s goroutines start with a stack of just a few KB, and Java’s virtual threads (Java 21) are similarly cheap.</li>
          <li>You write simple blocking code, and the runtime runs it on a handful of OS threads, much like an event loop.</li>
          <li>You get thread-style code at close to event-loop cost.</li>
        </ol>

        <h2>How many workers do you need?</h2>
        <ol class="points">
          <li>Requests in flight = requests per second × time per request. This is <strong>Little’s Law</strong>, and it works for any queue.</li>
          <li>At 200 requests a second taking 250 ms each, 50 requests are in flight on average.</li>
          <li>With sync workers you need at least 50, plus headroom for spikes.</li>
          <li>With async I/O, one process per core can hold all 50.</li>
        </ol>

        <aside class="note runs-out">
          <h3>When it runs out</h3>
          <ol class="points">
            <li><strong>All workers busy, CPU idle.</strong> Every worker is waiting on something slow, and new requests
            queue behind them. This is the classic “the server is slow but nothing is busy”.</li>
            <li><strong>Event-loop lag.</strong> On Node.js or asyncio, timers start firing late because something is
            hogging the one thread. Node measures it with <code>monitorEventLoopDelay</code>.</li>
          </ol>
        </aside>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> ps -o pid,nlwp,rss,cmd -C gunicorn
<span class="o">    PID NLWP    RSS CMD
   1201    1  48212 gunicorn: master [orders:app]
   1207    1 132904 gunicorn: worker [orders:app]
   1208    1 131620 gunicorn: worker [orders:app]
   1209    1 133488 gunicorn: worker [orders:app]
   1210    1 132176 gunicorn: worker [orders:app]</span>
<span class="p">$</span> ss -ltn 'sport = :8000'          <span class="c"># Recv-Q = connections waiting to be picked up</span>
<span class="o">State   Recv-Q  Send-Q   Local Address:Port   Peer Address:Port
LISTEN  97      2048           0.0.0.0:8000        0.0.0.0:*</span></pre>
          <ol class="points term-note">
            <li>Four sync workers at about 130 MB each.</li>
            <li>97 connections are waiting for one of them to be free.</li>
            <li>The fix is more requests in flight, not more CPU.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Your slowest dependency sets your worker count.</strong> If the payment service goes from 100 ms to
            5 s, every request holds a worker 50 times longer, and a pool sized for a normal day is gone in seconds. That’s
            how one slow service takes down everything that calls it (chapter 8 covers timeouts).</li>
            <li><strong>Event loops hate surprises.</strong> One blocking call (a sync database driver, a huge
            <code>JSON.parse</code>, a runaway regex) stalls every request on that loop. Node also runs file access and
            <code>dns.lookup</code> on a thread pool of just 4 threads by default, which quietly becomes a bottleneck.</li>
            <li><strong>Pools multiply.</strong> 20 app servers × 8 processes × a 10-connection database pool = 1,600
            database connections. Do this sum before the database does it for you.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Workers needed ≈ peak requests per second × response time in seconds, plus about 50% headroom.</p>
        </aside>`
    },

    /* =============================================================== Memory */
    {
      group: 'Memory',
      slug: 'memory',
      title: 'How memory works',
      sub: 'RAM, caches, and why where data sits matters as much as what you do with it.',
      html: `
        <ol class="points lede">
          <li>Memory holds everything a running program is using: its code, its variables, the request it’s handling, the rows it just read.</li>
          <li>It’s fast compared with disk, but slow compared with the CPU.</li>
          <li>That gap shapes how fast code really runs.</li>
        </ol>

        <div class="figures">
          <div class="fig"><small>Reading from RAM</small><b>~100 ns</b><span>300 ticks of a 3 GHz core.</span></div>
          <div class="fig"><small>Cache line</small><b>64 bytes</b><span>Memory moves in chunks this size, never a byte at a time.</span></div>
          <div class="fig"><small>RAM per server</small><b>8–512 GB</b><span>Typical sizes. The largest cloud machines have over 20 TB.</span></div>
        </div>

        <h2>The memory hierarchy</h2>
        <table class="data">
          <thead><tr><th>Where</th><th>Size</th><th class="num">Time to read</th></tr></thead>
          <tbody>
            <tr><td>L1 cache</td><td>~32–64 KB per core</td><td class="num">~1 ns</td></tr>
            <tr><td>L2 cache</td><td>~1–2 MB per core</td><td class="num">~4 ns</td></tr>
            <tr><td>L3 cache</td><td>tens to hundreds of MB, shared</td><td class="num">~10–20 ns</td></tr>
            <tr><td>RAM</td><td>GBs to TBs</td><td class="num">~100 ns</td></tr>
            <tr><td>SSD</td><td>TBs</td><td class="num">~100 µs</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li>The CPU looks in L1 first, then L2, then L3, then RAM.</li>
          <li>Finding data near the top costs a nanosecond; going all the way down costs a hundred.</li>
        </ol>

        <h2>Locality: why the same work can run ten times faster</h2>
        <ol class="points">
          <li>When the CPU reads one byte, it fetches the whole 64-byte line around it.</li>
          <li>When it sees you walking through memory in order, it fetches the next lines before you ask.</li>
          <li>So walking an array in order is fast, while chasing pointers around memory (a linked list, a tree of small objects) misses the cache again and again.</li>
          <li>The same idea returns at every scale: databases read whole 8–16 KB pages, disks prefer sequential reads, and column stores keep each column together.</li>
          <li>Keep data that is used together, together.</li>
        </ol>

        <h2>Virtual memory</h2>
        <ol class="points">
          <li>Each process sees its own private address space, as if it had the machine to itself.</li>
          <li>The OS maps it onto real RAM in 4 KB pages, and only pages that are actually touched use RAM.</li>
          <li>Two numbers in <code>top</code> follow from this:</li>
        </ol>
        <dl class="terms">
          <div><dt>VIRT (VSZ)</dt><dd>Address space the process has reserved. Often huge and mostly meaningless: a Java
          process can show 30 GB here.</dd></div>
          <div><dt>RES (RSS)</dt><dd>Pages actually in RAM right now. This is the number that runs out.</dd></div>
        </dl>
        <ol class="points" start="4">
          <li>Big multi-socket servers have RAM attached to each CPU socket, and reaching the other socket’s memory is roughly 1.5–2 times slower. This is called NUMA.</li>
          <li>Databases on large machines care about NUMA; most web apps don’t.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> lscpu | grep -E 'L1d|L1i|L2|L3'
<span class="o">  L1d:                   192 KiB (4 instances)
  L1i:                   128 KiB (4 instances)
  L2:                    5 MiB (4 instances)
  L3:                    54 MiB (1 instance)</span>
<span class="p">$</span> ps -o pid,vsz,rss,cmd -p 4121
<span class="o">    PID      VSZ     RSS CMD
   4121 31204420 2614208 java -Xmx2g -jar orders.jar</span></pre>
          <ol class="points term-note">
            <li>Four cores, each with 48 KB of L1 data cache and 1.25 MB of L2, sharing 54 MB of L3.</li>
            <li>A Java process that has reserved 30 GB of address space but is really using 2.5 GB (<code>ps</code> shows KB).</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>RAM is where fast systems keep their data.</strong> Redis, Memcached, a database’s buffer pool and
            a CDN’s hot set are all ways of keeping the working set in RAM instead of on disk or across the network.</li>
            <li><strong>Memory bandwidth is shared.</strong> Hundreds of GB/s sounds endless, but 64 cores streaming data
            at once can use it all, and then extra cores add nothing.</li>
            <li><strong>Layout often beats cleverness.</strong> Batching, arrays of plain values instead of objects, and
            fewer pointer hops often speed up hot code more than a better algorithm on paper.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Fast code touches little memory, and touches it in order.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Memory',
      slug: 'memory-in-practice',
      title: 'Memory in practice',
      sub: 'Working sets, the page cache, swapping, the OOM killer and garbage collection.',
      html: `
        <ol class="points lede">
          <li>Memory almost never runs out gracefully.</li>
          <li>A CPU that runs out makes things slower; memory that runs out makes things stop.</li>
          <li>So it’s worth knowing exactly where it goes.</li>
        </ol>

        <h2>Where the memory goes</h2>
        <ol class="points">
          <li><strong>Your app’s processes.</strong> A Python or Node worker often takes 50–300 MB. A JVM takes its heap
          plus a few hundred MB more.</li>
          <li><strong>The database.</strong> Its cache of table and index pages (PostgreSQL’s <code>shared_buffers</code>,
          MySQL’s InnoDB buffer pool), plus memory for every connection and every sort.</li>
          <li><strong>The OS page cache.</strong> Linux fills spare RAM with recently read files. That’s a good thing, and
          it’s why a healthy server shows almost no “free” memory.</li>
          <li><strong>The kernel.</strong> Socket buffers, connection tracking, its own bookkeeping: small per connection,
          large with a million of them.</li>
        </ol>

        <h2>The working set</h2>
        <ol class="points">
          <li>The working set is the data your requests touch again and again: hot rows, indexes, sessions.</li>
          <li>It’s usually a small fraction of all your data.</li>
          <li>If it fits in RAM, almost every read is a memory read.</li>
          <li>If it doesn’t, reads start falling through to disk, each about a thousand times slower, and latency goes over a cliff rather than rising gently.</li>
          <li>That’s why a database that was fast for a year can turn slow one Tuesday: the data grew past the RAM, not the traffic.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> free -h
<span class="o">               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       3.1Gi       312Mi        41Mi       4.3Gi       4.3Gi
Swap:          2.0Gi          0B       2.0Gi</span>
<span class="p">$</span> vmstat 1        <span class="c"># si / so: swapped in and out per second</span>
<span class="o"> r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 2  0      0 319488  82112 4413920    0    0     4    96 2210 4105 22  4 74  0  0</span>
<span class="p">$</span> sudo dmesg -T | grep -i "killed process"
<span class="o">[Tue Oct 13 02:47:13 2026] Out of memory: Killed process 3112 (postgres) total-vm:8453612kB, anon-rss:6120448kB</span></pre>
          <ol class="points term-note">
            <li>Read <code>available</code>, not <code>free</code>. The 4.3 GB of <code>buff/cache</code> is the page cache, and Linux hands it back the moment an app needs it.</li>
            <li>No swapping right now: <code>si</code> and <code>so</code> are 0.</li>
            <li>But at 2:47 on Tuesday, the kernel killed PostgreSQL to free 6 GB.</li>
          </ol>
        </figure>

        <aside class="note runs-out">
          <h3>When it runs out</h3>
          <ol class="points">
            <li><strong>Swapping.</strong> The OS moves memory pages to disk. Every access to them becomes about 1,000
            times slower, and the server seems to freeze without crashing.</li>
            <li><strong>The OOM killer.</strong> With nothing left, Linux kills a process, usually the biggest, which is
            often your database. In a container the limit hits first: the process is killed with exit code 137
            (<code>OOMKilled</code>), often with nothing in the app’s own logs.</li>
            <li><strong>Garbage-collection pressure.</strong> Java, Go, .NET and Node free memory in the background, but a
            heap that’s nearly full collects constantly. p99 latency suffers long before anything crashes.</li>
            <li><strong>Leaks.</strong> Memory grows a little every hour until one of the above happens. A restart
            “fixes” it, which is why leaks survive for so long.</li>
          </ol>
        </aside>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Size for the working set, then add headroom.</strong> Leave room for the page cache too: a database
            server whose processes use 95% of RAM has nothing left to cache its files.</li>
            <li><strong>Pick the instance type by what runs out.</strong> Cloud families mostly differ in memory per vCPU:
            about 2 GB (compute-optimised, AWS c), 4 GB (general purpose, m) and 8 GB (memory-optimised, r). Caches and
            databases usually want the last; stateless APIs the first two.</li>
            <li><strong>Tell the runtime about container limits.</strong> By default a JVM in a container gives its heap
            only 25% of the container’s memory (<code>MaxRAMPercentage</code>). Set it on purpose, and leave room outside
            the heap for threads, buffers and metaspace.</li>
            <li><strong>Caching is trading memory for everything else.</strong> Every cache spends RAM to save CPU, disk
            or network. Chapter 5 builds on this.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Memory doesn’t degrade gracefully, so alert at 80–85% of RAM (or of the container limit), not at 100%.</p>
        </aside>`
    },

    /* ================================================================= Disk */
    {
      group: 'Disk',
      slug: 'disk',
      title: 'How disks work',
      sub: 'Spinning disks, SSDs, cloud volumes and object storage: where data survives a restart.',
      html: `
        <ol class="points lede">
          <li>Disk is where data lives when the power goes off.</li>
          <li>It’s also by far the slowest thing inside the server.</li>
          <li>The particular way each kind of disk is slow decides how databases are built.</li>
        </ol>

        <h2>Spinning disks: limited by physics</h2>
        <ol class="points">
          <li>A hard disk is a stack of platters spinning at 7,200 rpm, read by a head on a moving arm.</li>
          <li>To read a random block, the arm swings to the right track (a few ms), then waits for the spot to come round (about 4 ms, half a turn).</li>
          <li>That’s roughly 10 ms per random read, so about 100 random reads a second. No software can change it.</li>
          <li>Read in order, with no seeking, the same disk streams 150–250 MB/s.</li>
        </ol>

        <h2>SSDs: no moving parts, new quirks</h2>
        <ol class="points">
          <li>An SSD stores data in flash chips, so a random read is as quick as a sequential one: around 20–100 µs.</li>
          <li>Flash writes in pages of a few KB, can only erase much larger blocks, and wears out after enough rewrites.</li>
          <li>The drive’s controller hides this by constantly moving data around. That’s why SSDs slow down when nearly full, and why heavy writes wear them out.</li>
          <li>An SSD’s big IOPS numbers come from parallelism: many flash chips working at once.</li>
          <li>A program that reads one block at a time (queue depth 1) gets perhaps 10,000–20,000 reads a second from a drive rated at a million.</li>
        </ol>

        <h2>Three numbers describe a disk</h2>
        <table class="data">
          <thead><tr><th>Kind of disk</th><th class="num">Random IOPS</th><th class="num">Throughput</th><th class="num">Latency per read</th></tr></thead>
          <tbody>
            <tr><td>Spinning hard disk (HDD)</td><td class="num">100–200</td><td class="num">150–250 MB/s</td><td class="num">5–10 ms</td></tr>
            <tr><td>SATA SSD</td><td class="num">~50K–100K</td><td class="num">~550 MB/s</td><td class="num">~100 µs</td></tr>
            <tr><td>NVMe SSD</td><td class="num">500K–1M+</td><td class="num">3–14 GB/s</td><td class="num">20–100 µs</td></tr>
            <tr class="hl"><td>Cloud disk, AWS gp3 default</td><td class="num">3,000</td><td class="num">125 MB/s</td><td class="num">~1 ms</td></tr>
          </tbody>
        </table>
        <ol class="points">
          <li><strong>IOPS</strong> is how many separate reads and writes per second, <strong>throughput</strong> is bytes per second, and <strong>latency</strong> is the time for one operation.</li>
          <li>The highlighted row is what many production databases run on: network-attached storage.</li>
          <li>Its default limits are more than 100 times below the NVMe drive in your laptop.</li>
        </ol>

        <h2>Where data can live</h2>
        <table class="data">
          <thead><tr><th>Tier</th><th class="num">Latency</th><th>Survives</th><th>Typical use</th></tr></thead>
          <tbody>
            <tr><td>RAM</td><td class="num">~100 ns</td><td>Nothing: gone on restart</td><td>Caches, the working set</td></tr>
            <tr><td>Local NVMe (instance store)</td><td class="num">~0.1 ms</td><td>A reboot, but not the instance stopping or failing</td><td>Scratch space, caches, databases that replicate themselves</td></tr>
            <tr><td>Network block storage (EBS, Persistent Disk)</td><td class="num">~1 ms</td><td>The server dying; copied within one zone</td><td>Database disks, boot disks</td></tr>
            <tr><td>Object storage (S3, GCS)</td><td class="num">10–100 ms</td><td>Almost anything: designed for 11 nines</td><td>Images, backups, logs, data lakes</td></tr>
          </tbody>
        </table>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> lsblk -d -o NAME,ROTA,SIZE,MODEL           <span class="c"># ROTA 1 = spinning disk</span>
<span class="o">NAME    ROTA  SIZE MODEL
nvme0n1    0    8G Amazon Elastic Block Store
nvme1n1    0  500G Amazon Elastic Block Store
nvme2n1    0  1.7T Amazon EC2 NVMe Instance Storage</span>
<span class="p">$</span> sudo fio --name=qd1 --filename=/dev/nvme1n1 --readonly --direct=1 --ioengine=libaio --rw=randread --bs=4k --iodepth=1 --runtime=10 --time_based
<span class="o">  read: IOPS=1702, BW=6808KiB/s (6971kB/s)
     lat (usec): min=380, max=4210, avg=586.51</span></pre>
          <ol class="points term-note">
            <li>One EBS volume, read one block at a time: about 0.6 ms per read.</li>
            <li>That’s only 1,700 reads a second from a single thread, well under the volume’s 3,000 IOPS.</li>
            <li>Run it again with <code>--iodepth=32</code> and it hits the limit.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>In the cloud, durability comes from copies, not from a better disk.</strong> EBS copies a volume
            within one zone, S3 spreads objects across zones, and databases replicate to other machines. Assume any single
            disk can vanish.</li>
            <li><strong>Your laptop flatters you.</strong> A query that’s instant on a laptop NVMe can crawl on a default
            cloud volume. Instance size caps disk bandwidth too: a small instance can’t use a fast volume’s full speed.</li>
            <li><strong>Parallel reads unlock SSDs.</strong> Many outstanding reads (more threads, async I/O, prefetching)
            can get tens of times more IOPS from the same SSD than one-at-a-time reads.</li>
            <li><strong>Objects for blobs, databases for rows.</strong> Put images, PDFs and backups in object storage and
            keep only their keys in the database.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Disk is for keeping data safe; RAM is for speed. Design so the hot path rarely touches disk.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Disk',
      slug: 'writing-safely',
      title: 'Writing data safely',
      sub: 'What really happens when you save something, and what it costs not to lose it.',
      html: `
        <ol class="points lede">
          <li>When your code writes to a file and the call returns, the data is usually not on the disk yet.</li>
          <li>The gap between “written” and “safe” is the difference between a fast system and one that loses orders in a power cut.</li>
        </ol>

        <h2>The write path</h2>
        <ol class="steps">
          <li>Your code calls <code>write()</code>. The kernel copies the data into the page cache in RAM and returns at once. Fast, but not safe.</li>
          <li>Some time later, by default within about 30 seconds, the kernel flushes those changed pages to the disk.</li>
          <li>If you call <code>fsync()</code>, your code waits until the disk confirms the data is stored. Slow, but safe.</li>
          <li>Even then, the drive may hold it in its own cache. Enterprise SSDs carry capacitors to finish the write if power fails; cheap ones may not.</li>
        </ol>
        <p>A crash between step 1 and step 2 loses the data, even though <code>write()</code> reported success.</p>

        <div class="figures">
          <div class="fig"><small>fsync, enterprise NVMe</small><b>Tens of µs</b><span>Drives with power-loss protection can confirm writes almost at once.</span></div>
          <div class="fig"><small>fsync, cloud volume</small><b>~1 ms</b><span>About the same on a consumer SSD.</span></div>
          <div class="fig"><small>Write-back delay</small><b>~30 s</b><span>How long Linux may keep a written page in RAM before flushing it to disk.</span></div>
        </div>

        <h2>How databases make commits fast and safe</h2>
        <ol class="points">
          <li>Writing every change straight into its place in the table would mean random writes on every commit.</li>
          <li>So databases first append the change to a log, the <strong>write-ahead log</strong> (WAL), and fsync only that.</li>
          <li>Appending is sequential and quick. The tables themselves are updated later, in the background.</li>
          <li>After a crash, the database replays the log.</li>
          <li>Because fsync is the expensive part, databases share it: when 50 transactions commit at the same moment, one fsync can cover all of them.</li>
          <li>This <strong>group commit</strong> is why a database can commit far more transactions a second than its disk can do fsyncs.</li>
        </ol>

        <h2>Two ways to organise data on disk</h2>
        <table class="data">
          <thead><tr><th></th><th>B-tree</th><th>LSM tree</th></tr></thead>
          <tbody>
            <tr><td>Used by</td><td>PostgreSQL, MySQL (InnoDB), SQL Server: most relational databases</td><td>RocksDB, Cassandra, ScyllaDB, many time-series stores</td></tr>
            <tr><td>How it writes</td><td>Updates pages in place, after logging the change</td><td>Appends to memory and a log, writes sorted files, merges them later</td></tr>
            <tr><td>Good at</td><td>Fast reads and range queries</td><td>Very high write rates</td></tr>
            <tr><td>Pays with</td><td>Random writes as tables grow</td><td>Background merging (compaction), and reads that may check several files</td></tr>
          </tbody>
        </table>

        <aside class="note runs-out">
          <h3>When it runs out</h3>
          <ol class="points">
            <li><strong>The disk fills up.</strong> Databases stop accepting writes; unrotated logs are the usual cause.
            Check inodes too (<code>df -i</code>): millions of tiny files can fill a disk that still has free space.</li>
            <li><strong>fsync gets slow.</strong> Every commit waits on it, so write latency rises across the whole app at once.</li>
            <li><strong>Write amplification.</strong> One row you insert becomes a WAL entry, a table page, a page in every
            index and a copy on each replica. Ten indexes means roughly ten extra writes per insert.</li>
          </ol>
        </aside>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> iostat -xz 1
<span class="o">Device      r/s     w/s    rkB/s    wkB/s  r_await  w_await  aqu-sz  %util
nvme1n1  2610.0   390.0  10440.0   6240.0     8.41     3.10   23.1   99.6</span>
<span class="p">$</span> df -h /var/lib/postgresql
<span class="o">Filesystem      Size  Used Avail Use% Mounted on
/dev/nvme1n1    492G  431G   61G  88% /var/lib/postgresql</span>
<span class="p">$</span> df -i /
<span class="o">Filesystem      Inodes   IUsed IFree IUse% Mounted on
/dev/nvme0n1p1  524288  524288     0  100% /</span></pre>
          <ol class="points term-note">
            <li>2,610 reads plus 390 writes is exactly 3,000 operations a second, with reads taking 8 ms and 23 waiting in line: a default gp3 volume at its limit.</li>
            <li>The data disk is 88% full.</li>
            <li>The root disk has no inodes left, so no new file can be created, whatever <code>df -h</code> says.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Decide what you can afford to lose.</strong> Orders and payments must be fsynced on commit. View
            counts and analytics events can lose a second in a crash in exchange for much higher throughput. PostgreSQL’s
            <code>synchronous_commit = off</code> makes exactly that trade, without risking corruption.</li>
            <li><strong>Batch writes.</strong> Inserting 1,000 rows in one transaction costs one commit; 1,000 separate
            inserts cost 1,000. Batching is the cheapest write optimisation there is.</li>
            <li><strong>Append-only logs are everywhere.</strong> The WAL, Kafka, event sourcing and database replication
            all build on the same idea: appending is cheap, and a log can be replayed. You’ll meet it again in chapters 6 and 7.</li>
            <li><strong>A write isn’t really safe until it’s on another machine.</strong> fsync protects you from a power
            cut, not from losing the server. That takes replication.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>For every kind of data you store, know what happens if the power goes one millisecond after you save it.</p>
        </aside>`
    },

    /* ============================================================== Network */
    {
      group: 'Network',
      slug: 'network',
      title: 'How networks work',
      sub: 'Packets, addresses, TCP and the speed of light.',
      html: `
        <ol class="points lede">
          <li>Every request your system handles arrives as packets and leaves as packets.</li>
          <li>Packets take time to travel, and distance sets a floor that no code can beat.</li>
          <li>Packets sometimes get lost, and recovering from that costs time.</li>
          <li>Setting up a reliable conversation costs extra round trips before any work starts.</li>
        </ol>

        <h2>From packets to connections</h2>
        <dl class="terms">
          <div><dt>Packet</dt><dd>A chunk of data stamped with where it came from and where it’s going: up to about 1,500
          bytes on the internet, up to 9,000 inside some cloud networks. A 1 MB response is around 700 internet-sized packets.</dd></div>
          <div><dt>IP address and port</dt><dd>The IP address finds the machine; the port finds the program on it. A TCP
          connection is identified by four values: source IP and port, destination IP and port.</dd></div>
          <div><dt>TCP</dt><dd>Turns unreliable packets into a reliable, ordered stream. It numbers every byte, waits for
          acknowledgements and resends anything lost. HTTP/1.1, HTTP/2 and most database protocols run on it.</dd></div>
          <div><dt>UDP</dt><dd>Just sends packets: no setup, no ordering, no retries. Used where speed beats completeness
          (DNS, video, games), and by QUIC, which HTTP/3 is built on.</dd></div>
        </dl>

        <h2>Bandwidth and latency</h2>
        <ol class="points">
          <li><strong>Bandwidth</strong> is how much a link carries per second, like the width of a pipe.</li>
          <li><strong>Latency</strong> is how long one message takes to arrive, like the length of the pipe.</li>
          <li>Most web requests are small, so for them latency matters far more than bandwidth.</li>
        </ol>
        <div class="figures">
          <div class="fig"><small>Speed of light in fibre</small><b>~5 µs per km</b><span>1,000 km means at least 10 ms there and back, whatever your code does.</span></div>
          <div class="fig"><small>Bits and bytes</small><b>1 Gbps = 125 MB/s</b><span>Networks count bits, disks count bytes. Divide by 8.</span></div>
          <div class="fig"><small>India to US east coast</small><b>~200 ms</b><span>One round trip, there and back.</span></div>
        </div>

        <h2>TCP starts slowly</h2>
        <ol class="points">
          <li>A new TCP connection doesn’t know how fast the path is, so it starts carefully: about 14 KB in the first round trip.</li>
          <li>It then doubles the amount every round trip until something gets lost. This is <strong>slow start</strong>.</li>
          <li>On a long path, the number of round trips, not the bandwidth, decides how long a download takes.</li>
        </ol>
        <div class="widget" data-widget="slow-start"></div>
        <ol class="points" start="4">
          <li>That’s why big sites keep connections open and reuse them: a warm connection has already grown its window.</li>
          <li>It’s why the first 14 KB of a page matter.</li>
          <li>And it’s why moving content closer to users helps even when bandwidth is plentiful.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> ping -c 3 10.0.2.14             <span class="c"># the database server, same datacenter</span>
<span class="o">64 bytes from 10.0.2.14: icmp_seq=1 ttl=64 time=0.214 ms
64 bytes from 10.0.2.14: icmp_seq=2 ttl=64 time=0.198 ms
64 bytes from 10.0.2.14: icmp_seq=3 ttl=64 time=0.221 ms</span>
<span class="p">$</span> ss -ti dst 10.0.2.14             <span class="c"># TCP's own view of each connection</span>
<span class="o">ESTAB  0  0  10.0.1.17:51544  10.0.2.14:5432
	 cubic wscale:7,7 rto:204 rtt:0.211/0.05 mss:8949 cwnd:10</span></pre>
          <ol class="points term-note">
            <li>The database is 0.2 ms away.</li>
            <li>But look at <code>rto:204</code>: if TCP has to fall back on its timer to notice a lost packet, it waits 204 ms before resending, a thousand times the round trip.</li>
            <li>Lost packets are a big source of slow outliers.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Bandwidth is cheap; latency is physics.</strong> You can buy a wider pipe. You can’t buy a shorter
            one, except by moving the server closer to the user.</li>
            <li><strong>One connection has its own speed limit.</strong> Throughput ≤ window size ÷ round-trip time.
            Copying a big file across the world over one connection can be far slower than the link; parallel connections
            or larger buffers fix it.</li>
            <li><strong>Every network call can fail in new ways.</strong> A function call returns or throws. A network call
            can also time out, succeed without you hearing back, or arrive twice. Designing for that is most of chapter 8.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Count round trips, not bytes. Most slow pages are slow because of how many times they cross the network,
          not how much they send.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Network',
      slug: 'network-in-practice',
      title: 'Networks in practice',
      sub: 'What connections cost, where the hidden limits are, and why the slowest requests are often network ones.',
      html: `
        <ol class="points lede">
          <li>Inside one server, everything happens in nanoseconds and microseconds.</li>
          <li>The moment a request crosses the network, it’s milliseconds.</li>
          <li>Every new connection pays several round trips before any useful work starts.</li>
        </ol>

        <h2>A new connection costs several round trips</h2>
        <p>Pick a distance and compare a fresh connection, which must set up TCP and then TLS, with a reused one.</p>
        <div class="widget" data-widget="connection-waterfall"></div>

        <ol class="points">
          <li><strong>Reuse connections.</strong> Keep-alive between browser and server, connection pools between your app and the database.</li>
          <li><strong>Move closer to users.</strong> A server or CDN in the user’s region beats any code optimisation.</li>
          <li><strong>Make fewer round trips.</strong> One request that returns 20 items beats 20 requests that return one each.</li>
        </ol>

        <h2>The limits nobody tells you about</h2>
        <table class="data">
          <thead><tr><th>Limit</th><th>Typical default</th><th>What you see when you hit it</th></tr></thead>
          <tbody>
            <tr><td>Open files per process</td><td>1,024 (<code>ulimit -n</code>)</td><td>“Too many open files”. Every socket is a file.</td></tr>
            <tr><td>Local ports for outgoing connections</td><td>~28,000 (32768–60999)</td><td>Connection errors to one busy destination</td></tr>
            <tr><td>TIME_WAIT after a close</td><td>60 s per connection</td><td>Without reuse, about 470 new connections a second to one destination use up every port</td></tr>
            <tr><td>Connection tracking table</td><td>Sized from RAM</td><td>“nf_conntrack: table full, dropping packet” in <code>dmesg</code>, and random timeouts</td></tr>
            <tr><td>Cloud instance bandwidth</td><td>“Up to 10 Gbps” is often a burst</td><td>Throughput drops after a few minutes on smaller instances</td></tr>
          </tbody>
        </table>

        <h2>Where the slowest requests come from</h2>
        <p>Most requests take a few milliseconds. The slow outliers often hit one of these:</p>
        <ol class="points">
          <li><strong>A lost packet.</strong> When TCP can only notice the loss by timeout, it waits at least 200 ms before resending, even on a 0.2 ms link.</li>
          <li><strong>A lost connection request.</strong> The first retry of a SYN comes after 1 second, the next 2 seconds
          later. Latency graphs with spikes at exactly 1 s and 3 s are almost always this.</li>
          <li><strong>A DNS lookup</strong> that isn’t cached, or a resolver that’s slow or overloaded.</li>
          <li><strong>A new TLS connection</strong> where a reused one was expected, because a pool was too small or kept closing connections.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it from your laptop, then on a server</figcaption>
<pre><span class="p">$</span> curl -so /dev/null https://example.com \\
    -w 'dns %{time_namelookup}  connect %{time_connect}  tls %{time_appconnect}  first byte %{time_starttransfer}\\n'
<span class="o">dns 0.012  connect 0.235  tls 0.459  first byte 0.702</span>
<span class="p">$</span> cat /proc/sys/net/ipv4/ip_local_port_range
<span class="o">32768	60999</span>
<span class="p">$</span> ss -tan state time-wait | wc -l
<span class="o">27904</span></pre>
          <ol class="points term-note">
            <li>curl’s timings add up as it goes: each step costs about 223 ms, one round trip.</li>
            <li>The server spent about 20 ms producing the answer.</li>
            <li>On the server, 27,904 connections in TIME_WAIT against 28,232 local ports: this app is about to run out.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Pool and reuse every connection.</strong> It removes handshakes, avoids port exhaustion, and keeps
            TCP windows warm.</li>
            <li><strong>Network traffic has a price.</strong> In AWS, traffic between zones costs about $0.01 per GB each
            way, and traffic out to the internet about $0.09 per GB. A chatty service spread across zones can cost more than
            its servers.</li>
            <li><strong>Big files don’t belong on app servers.</strong> 2 MB images to 100 users a second is 200 MB/s,
            1.6 Gbps: more than a 1 Gbps link. That’s work for a CDN and object storage (chapter 5).</li>
            <li><strong>Retries need timeouts, and timeouts need budgets.</strong> Retrying on top of a 1 s SYN timeout
            can turn a blip into a pile-up. Chapter 8 covers doing it safely.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Treat every network call as slow, expensive and unreliable, because sooner or later it will be.</p>
        </aside>`
    },

    /* =================================================== Putting it together */
    {
      group: 'Putting it together',
      slug: 'inside-a-server',
      title: 'What’s inside a server',
      sub: 'All the parts at once: how far apart they are, and the path one request takes through them.',
      html: `
        <ol class="points lede">
          <li>We’ve looked at each part on its own. Here they are together, the way a request sees them.</li>
          <li>Your code sits on top, and the operating system shares the hardware out.</li>
          <li>Underneath are four pieces of hardware with very different speeds.</li>
        </ol>

        <div class="stack" role="group" aria-label="The layers of a server">
          <div class="stack-layer"><b>Your application</b><span>FastAPI, Spring, Express, Rails, your code</span></div>
          <div class="stack-layer os"><b>Operating system</b><span>processes, threads, the page cache, sockets, file descriptors</span></div>
          <div class="stack-hw">
            <a class="hw" href="#/1/cpu" style="--m:6%"><b>CPU</b><span class="hw-what">runs the code</span><span class="hw-time">~1 ns</span><span class="hw-unit">from its own cache</span></a>
            <a class="hw" href="#/1/memory" style="--m:28%"><b>Memory</b><span class="hw-what">holds what’s in use</span><span class="hw-time">~100 ns</span><span class="hw-unit">per read</span></a>
            <a class="hw" href="#/1/disk" style="--m:61%"><b>Disk</b><span class="hw-what">keeps data for good</span><span class="hw-time">~100 µs</span><span class="hw-unit">per SSD read</span></a>
            <a class="hw" href="#/1/network" style="--m:90%"><b>Network</b><span class="hw-what">talks to the world</span><span class="hw-time">0.5–200 ms</span><span class="hw-unit">per round trip</span></a>
          </div>
        </div>
        <p class="caption">The bars show how long each part takes to answer, on a log scale: nanoseconds for the CPU and
        memory, microseconds for disk, milliseconds for the network.</p>

        <h2>One request, start to finish</h2>
        <ol class="steps">
          <li>Packets arrive at the network card, and the kernel reassembles them into the TCP stream. <span class="uses">Network</span></li>
          <li>The kernel wakes the thread waiting on that socket, and the thread waits in line for a core. <span class="uses">OS, CPU</span></li>
          <li>Your code parses the request and checks the login. <span class="uses">CPU, memory</span></li>
          <li>It queries the database over another TCP connection, and the thread sleeps until the answer comes back. <span class="uses">Network</span></li>
          <li>On the database server, the rows come from the buffer cache in RAM, or from disk if they aren’t there. <span class="uses">Memory, disk</span></li>
          <li>Your code builds the response, and the kernel sends it back out as packets. <span class="uses">CPU, network</span></li>
        </ol>

        <h2>If a server were a restaurant kitchen</h2>
        <table class="data">
          <thead><tr><th>Part</th><th>In the kitchen</th><th>Runs out when</th></tr></thead>
          <tbody>
            <tr><td>CPU</td><td>The cooks</td><td>More dishes need cooking than there are cooks</td></tr>
            <tr><td>Threads</td><td>The orders being worked on</td><td>Too many orders are open at once and cooks keep switching between them</td></tr>
            <tr><td>Memory</td><td>Counter space</td><td>Too many dishes are in progress at once</td></tr>
            <tr><td>Disk</td><td>The storeroom</td><td>Every dish needs a walk to the storeroom</td></tr>
            <tr><td>Network</td><td>The serving hatch and waiters</td><td>Orders can’t get in, or food can’t get out</td></tr>
            <tr><td>Operating system</td><td>The head chef handing out work</td><td>Its house rules (limits) start turning orders away</td></tr>
          </tbody>
        </table>

        <aside class="note rule">
          <h3>The one idea of this chapter</h3>
          <ol class="points">
            <li>A system is only as fast as its busiest part.</li>
            <li>Hiring more cooks does nothing when the problem is counter space.</li>
            <li>Before you scale anything, find out which part is full.</li>
          </ol>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Putting it together',
      slug: 'latency-numbers',
      title: 'Latency numbers to know',
      sub: 'The most useful table in system design.',
      html: `
        <ol class="points lede">
          <li>You don’t need exact values; you need the orders of magnitude.</li>
          <li>Memory is nanoseconds, SSDs are microseconds, networks and spinning disks are milliseconds.</li>
          <li>Switch to the human scale to feel the gaps.</li>
        </ol>

        <div class="widget" data-widget="latency-ladder"></div>
        <p class="caption">After the classic table by Jeff Dean and Peter Norvig, rounded for current hardware. Your
        machines will differ by 2–3 times; the gaps between rows will not.</p>

        <h2>What this means in practice</h2>
        <ol class="points">
          <li>A request that does one RAM lookup and one round trip inside the datacenter spends 99.98% of its time on the network.</li>
          <li>Caching works because RAM is about 1,000 times faster than an SSD and 5,000 times faster than a round trip to another server.</li>
          <li>A database in another region adds 100 ms or more to every query, and a page often runs dozens of queries.</li>
        </ol>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Putting it together',
      slug: 'measuring',
      title: 'Measuring performance',
      sub: 'Latency, throughput, percentiles, and why busy isn’t the same as full.',
      html: `
        <dl class="terms">
          <div><dt>Latency</dt><dd>How long one request takes, in milliseconds.</dd></div>
          <div><dt>Throughput</dt><dd>How many requests the system finishes per second (RPS).</dd></div>
          <div><dt>Utilisation</dt><dd>The share of time a resource is busy.</dd></div>
          <div><dt>Concurrency</dt><dd>How many requests are in progress right now. Little’s Law ties the three
          together: <strong>in progress = throughput × latency</strong>. 200 RPS at 50 ms each means 10 requests in
          progress on average, so you need at least 10 workers.</dd></div>
        </dl>

        <h2>Averages hide the slow requests</h2>
        <ol class="points">
          <li>Take 100 requests: 98 take 50 ms and 2 take 3 seconds.</li>
          <li>The average is 109 ms, which looks fine.</li>
          <li>The median (p50) is 50 ms, and the p99 is 3 seconds.</li>
          <li>Percentiles show the slow tail, and the slow tail is where your unhappy users are.</li>
          <li>It gets worse when one page calls many services: the page is as slow as its slowest call.</li>
        </ol>
        <div class="widget" data-widget="fan-out"></div>

        <h2>Why 80% busy is already full</h2>
        <ol class="points">
          <li>When a resource is busy, new work waits in a queue.</li>
          <li>The busier it gets, the longer the queue, and the queue grows much faster than the load.</li>
          <li>Drag the slider to see it.</li>
        </ol>
        <div class="widget" data-widget="utilisation"></div>
        <p class="caption">This curve is the simplest queueing model (one server, random arrivals). Servers with many
        cores bend later and more sharply, but every real system has this shape: flat, then a bend, then a wall.</p>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <ol class="points">
            <li>Plan capacity so your busiest hour runs at about 60–70% utilisation.</li>
            <li>The rest is not waste: it keeps response times flat when traffic spikes or a server fails.</li>
          </ol>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Putting it together',
      slug: 'one-server-capacity',
      title: 'How much can one server handle?',
      sub: 'Back-of-the-envelope maths you can do in a meeting.',
      html: `
        <ol class="points lede">
          <li>Before buying servers, estimate.</li>
          <li>The answer only needs to be right to within two or three times.</li>
          <li>It often says something surprising: one good machine goes a very long way.</li>
        </ol>

        <h2>A worked example</h2>
        <ol class="steps">
          <li><strong>Users to requests.</strong> 1 million daily users × 20 requests each = 20 million requests a day.</li>
          <li><strong>Per day to per second.</strong> A day is 86,400 seconds; call it 100,000. 20 million ÷ 100,000 = 200 requests a second on average.</li>
          <li><strong>Plan for the peak.</strong> Traffic isn’t flat; the busiest hour is often 2–5 times the average. At 3 times, that’s 600 a second.</li>
          <li><strong>Requests to CPU.</strong> At 10 ms of CPU per request, one core handles 100 a second. 600 a second keeps 6 cores busy.</li>
          <li><strong>Add headroom.</strong> To peak at 70%, you need 6 ÷ 0.7, about 9 cores. That is two 8-core servers, plus one spare in case one fails.</li>
          <li><strong>Requests in flight.</strong> If each request takes 100 ms end to end, 600 a second × 0.1 s = 60 in flight (Little’s Law). That’s how many workers or connections you need at the peak.</li>
        </ol>
        <p>Now try your own numbers. The database is a separate story, covered in chapters 3 and 5.</p>

        <div class="widget" data-widget="capacity"></div>

        <h2>Other quick estimates</h2>
        <ol class="points">
          <li><strong>Storage.</strong> 1 million users × 10 orders a year × 2 KB per order = 20 GB a year. That fits on one disk.</li>
          <li><strong>Bandwidth.</strong> 600 requests a second × 50 KB responses = 30 MB/s, or 240 Mbps. Fine on a 1 Gbps link, as long as the images live on a CDN.</li>
          <li><strong>Memory for workers.</strong> 60 requests in flight with sync workers at about 150 MB each is 9 GB of RAM just for workers. One async process per core could do it in far less.</li>
        </ol>

        <aside class="note rule">
          <h3>Numbers worth remembering</h3>
          <ol class="points">
            <li>A day is about 100,000 seconds.</li>
            <li>A million requests a day is about 12 a second.</li>
            <li>A billion requests a day is about 12,000 a second.</li>
          </ol>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'Putting it together',
      slug: 'recap',
      title: 'Recap: find what runs out first',
      sub: 'A checklist for any slow system, and what to take into chapter 2.',
      html: `
        <ol class="points lede">
          <li>When something is slow, check every resource for three things, in this order.</li>
          <li><strong>Utilisation:</strong> how busy is it?</li>
          <li><strong>Saturation:</strong> is work queuing for it?</li>
          <li><strong>Errors:</strong> is it reporting any?</li>
          <li>Brendan Gregg calls this the USE method.</li>
        </ol>

        <table class="data use">
          <thead><tr><th>Resource</th><th>Utilisation: how busy?</th><th>Saturation: is work waiting?</th><th>Errors</th></tr></thead>
          <tbody>
            <tr><td>CPU</td><td><code>top</code> or <code>htop</code>: us + sy, per core</td><td>Load above core count; <code>r</code> in <code>vmstat 1</code>; <code>nr_throttled</code> in containers</td><td>High <code>st</code> (steal) on cloud VMs</td></tr>
            <tr><td>Memory</td><td><code>free -h</code>: used vs available</td><td>Swapping: <code>si</code>/<code>so</code> in <code>vmstat 1</code>; GC time</td><td>OOM kills in <code>dmesg</code>, exit code 137</td></tr>
            <tr><td>Disk</td><td><code>iostat -xz 1</code>: %util</td><td><code>aqu-sz</code> and <code>await</code> rising</td><td>Disk or inodes full (<code>df -h</code>, <code>df -i</code>)</td></tr>
            <tr><td>Network</td><td><code>sar -n DEV 1</code>: bytes per second</td><td>Retransmits (<code>nstat</code>), TIME_WAIT piling up</td><td>“Too many open files”, connection resets</td></tr>
            <tr><td>Workers and pools</td><td>Busy workers vs total</td><td>Listen queue (<code>ss -ltn</code> Recv-Q), requests waiting for a DB connection</td><td>Timeouts</td></tr>
          </tbody>
        </table>

        <h2>Take these into chapter 2</h2>
        <ol class="points">
          <li>A server is CPU, memory, disk and network, shared out by the OS as processes and threads. Every bottleneck is one of them, or a queue in front of one.</li>
          <li>Clock speeds stopped growing, so scale comes from parallelism, and the part that can’t run in parallel limits it.</li>
          <li>Memory is nanoseconds, SSDs are microseconds, networks are milliseconds.</li>
          <li>Most web requests spend their time waiting, so concurrency matters more than cores.</li>
          <li>“Written” is not “safe”. Durability costs an fsync, and real durability needs a second machine.</li>
          <li>Every network call costs round trips and can fail in ways a function call can’t.</li>
          <li>Response time explodes as utilisation nears 100%. Plan for about 70%.</li>
          <li>Estimate first. One server goes further than you think.</li>
        </ol>`
    }
  ]
};
