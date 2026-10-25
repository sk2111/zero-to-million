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
      <li>Every system you will ever design and scale, from a side project to a production application, runs on the same few parts: CPU, memory, disk and network.</li>
      <li>The operating system shares those parts out between all the programs on the machine.</li>
      <li>For each part we start with how it works, then how it behaves under load, then what it means when you design a system.</li>
    </ol>
    <div class="outcomes">
      <h2>By the end of this chapter you can</h2>
      <ul>
        <li>Explain what clock speed, cores, processes and threads mean for how fast your code can run.</li>
        <li>Read <code>top</code>, <code>htop</code>, <code>free</code> and <code>iostat</code> and say which resource is the bottleneck.</li>
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
<pre class="cp-code"><span class="cp-dim">RESUME        0</span>
<span data-k="load">LOAD_FAST     0 (price)</span>
<span data-k="const">LOAD_CONST    1 (1.18)</span>
<span data-k="mul">BINARY_OP     5 (*)</span>
<span data-k="ret">RETURN_VALUE</span></pre>
          </div>
          <div class="cp-panel cp-dark cp-wide">
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
        <p class="caption">Point at a piece of the code to see where it goes. The bytecode is real output from
        <code>python -m dis</code> on Python 3.13; the machine instructions are simplified x86-64.</p>
        <ol class="points">
          <li>One line of Python became 4 bytecode steps. (<code>RESUME</code> is a marker Python puts at the start of every function. The numbers are slots: <code>price</code> is local variable 0, <code>1.18</code> is constant 1, and 5 is the code for multiply.)</li>
          <li>Each bytecode step becomes dozens to hundreds of machine instructions, depending on the types involved.</li>
        </ol>

        <aside class="note tip">
          <h3>Tip: why compiled languages run this 10–100 times faster</h3>
          <ol class="points">
            <li>By default, Python’s bytecode is never turned into machine code. Standard Python (CPython) is an <strong>interpreter</strong>: a program written in C, already compiled, that reads your bytecode one step at a time and runs its own general-purpose machine code for each step.</li>
            <li>So every time <code>price * 1.18</code> runs, the CPU also does the interpreter’s work: fetch the next step, check what type <code>price</code> is, find the right multiply, create a new object for the answer, update reference counts.</li>
            <li>Go, Rust and C <strong>compile ahead of time</strong>: once, before the program runs. The compiler already knows <code>price</code> is a 64-bit float, so it emits just the multiply, on a value that sits in a CPU register.</li>
          </ol>
          <div class="compile">
            <div class="cp-panel">
              <p class="cp-head"><b>Go</b><span>the same function</span></p>
<pre class="cp-code">func addGST(price float64) float64 {
    return price * 1.18
}</pre>
            </div>
            <div class="cp-arrow" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 12h15M13 6l6 6-6 6"/></svg></div>
            <div class="cp-panel cp-dark">
              <p class="cp-head"><b>What the CPU runs</b><span>2 instructions</span></p>
<pre class="cp-code">mulsd   xmm0, [1.18]  <span class="cp-dim">; price × 1.18</span>
ret                   <span class="cp-dim">; answer is ready</span></pre>
            </div>
          </div>
          <table class="data">
            <thead><tr><th></th><th>Python (CPython)</th><th>Go</th></tr></thead>
            <tbody>
              <tr><td>Becomes machine code</td><td>Not by default: the interpreter runs the bytecode</td><td>Once, before the program runs</td></tr>
              <tr><td>Knows the types</td><td>Only while running, checked on every operation</td><td>At compile time</td></tr>
              <tr><td>Where <code>price</code> lives</td><td>A 24-byte object in memory</td><td>A CPU register</td></tr>
              <tr><td>Instructions for <code>price * 1.18</code></td><td>Dozens to hundreds</td><td>1 or 2</td></tr>
            </tbody>
          </table>
          <ol class="points" start="4">
            <li>Java and C# sit in between: they start as bytecode, and a <strong>JIT</strong> (just-in-time compiler) turns the hot parts into machine code while the program runs, which is why they speed up after a warm-up.</li>
            <li>Python is catching up the same way: PyPy uses a JIT and is often several times faster than CPython, and since 3.13 CPython has an experimental JIT of its own, switched off by default.</li>
          </ol>
        </aside>

        <h2>How a CPU processes instructions</h2>
        <ol class="points">
          <li>Every CPU has a <strong>clock</strong>: a tiny circuit that sends out an electrical pulse, on and off, billions of times a second. Each pulse is one <strong>tick</strong>.</li>
          <li>Each tick is the signal for every part of the core to move its work one stage forward. An instruction goes through four stages: <strong>fetch</strong> it from memory, <strong>decode</strong> what it means, <strong>execute</strong> it, <strong>store</strong> the result.</li>
          <li><strong>Clock speed</strong> is the number of ticks per second, measured in gigahertz (GHz). 3 GHz means 3 billion ticks a second, so one tick lasts a third of a nanosecond.</li>
        </ol>
        <p>Run the clock and watch four instructions like the ones above move through a core:</p>
        <div class="widget" data-widget="clock-pipeline"></div>
        <ol class="points" start="4">
          <li>The stages overlap. While instruction 1 executes, instruction 2 is being decoded and instruction 3 fetched. This is a <strong>pipeline</strong>, like an assembly line.</li>
          <li>Once the pipeline is full, one instruction finishes every tick. Modern cores have several pipelines side by side, so at best they finish 4 or more per tick.</li>
          <li>Real server code averages around 1 per tick, because the pipeline often stalls while it waits for data from memory.</li>
          <li>Put together: instructions per second ≈ clock speed × instructions per tick × number of cores. 3 GHz × 1 × 8 cores is about 24 billion instructions a second.</li>
        </ol>

        <h2>Clock speed stopped growing, so cores multiplied</h2>
        <ol class="points">
          <li>Until about 2005, every new CPU had a faster clock, and old code simply got quicker.</li>
          <li>Then clock speeds hit a wall at around 3–5 GHz: going faster made the chips too hot to cool.</li>
          <li>Chip makers spent their extra transistors on more cores instead.</li>
          <li>One core isn’t getting much faster, so the only way to do more work is in parallel: first more cores, then more machines.</li>
        </ol>

        <h2>A core spends most of its life waiting</h2>
        <ol class="points">
          <li>The core itself is fast: at 3 GHz it can finish an instruction every third of a nanosecond.</li>
          <li>But every instruction works on data, and most of that data isn’t in the core. It sits in a cache, in RAM, on a disk or on another machine, and each step further away takes far longer to reach.</li>
          <li>Until the data arrives, the core can’t carry on. So a CPU is rarely held back by how fast it computes. It is held back by how long it waits.</li>
          <li>When a core waits for RAM, it simply stalls, and that stall still counts as “CPU busy”.</li>
        </ol>
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

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> sudo perf stat -a sleep 5        <span class="c"># count what the whole machine did for 5 seconds</span>
<span class="o">    21,034,551,201      cycles
    14,302,694,817      instructions       #    0.68  insn per cycle</span></pre>
          <ol class="points term-note">
            <li>A cycle is one tick. In 5 seconds this machine’s cores ticked 21 billion times while busy, and finished 14 billion instructions.</li>
            <li>That’s 0.68 instructions per tick: the cores spend much of their “busy” time waiting for memory.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>CPU % is not how much work you’re doing.</strong> A core stalled on memory shows as 100% busy.
            <code>perf stat</code> shows instructions per cycle; well below 1 usually means memory stalls, not heavy computation.</li>
            <li><strong>Language choice is a capacity decision.</strong> The same CPU-heavy endpoint can need ten times
            the servers in an interpreted language as in a compiled one. For I/O-bound work, the difference mostly disappears.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Clock speeds aren’t getting much faster. To get more out of a CPU:</p>
          <ol class="points">
            <li><strong>Run fewer instructions</strong> per request: do less work, or use a compiled language for CPU-heavy code.</li>
            <li><strong>Make fewer trips to memory</strong>: keep hot data small and close together.</li>
            <li><strong>Use more cores</strong> to serve more requests at once.</li>
          </ol>
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
          <li>So far we have followed one stream of instructions through one core. But a server with 8 cores is usually running hundreds of programs at once: the web server, the database, a log shipper, the OS’s own services.</li>
          <li>Each running program is a <strong>process</strong>. The work inside it is done by one or more <strong>threads</strong>, and each thread is one stream of instructions, like the one we just followed.</li>
          <li>There are far more threads than cores, so they take turns. The OS gives each thread a core for a few milliseconds, then hands the core to the next one.</li>
          <li>To reason about any server, you need to know what processes and threads are, how they take turns, and why more threads don’t always mean more speed.</li>
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
            <tr><td>You’ll see it in</td><td>PostgreSQL connections, gunicorn workers, Chrome tabs</td><td>Java servers, and Go (with lightweight goroutines)</td></tr>
          </tbody>
        </table>

        <h2>Taking turns on a core</h2>
        <p>When you run an application, each of its threads is always in one of three states, and only the first one uses the CPU:</p>
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
          <li><strong>Load average</strong> counts the threads running on a core plus those waiting in that queue. On Linux it also counts threads stuck waiting on disk.</li>
          <li>A load of 12 on 8 cores means that, on average, 4 threads are waiting for a turn.</li>
          <li>Moving a core from one thread to another is a <strong>context switch</strong>. The kernel saves where the old thread was, loads the new one, and the new thread starts with the caches full of the old thread’s data.</li>
          <li>One switch costs only a few microseconds, but servers switch thousands of times a second, so it adds up. Say each switch costs 3 µs:</li>
        </ol>
        <table class="data">
          <thead><tr><th class="num">Switches per second</th><th class="num">CPU time spent switching, every second</th><th>Verdict</th></tr></thead>
          <tbody>
            <tr><td class="num">1,000</td><td class="num">3 ms, 0.3% of one core</td><td>Nothing to see</td></tr>
            <tr><td class="num">10,000</td><td class="num">30 ms, 3% of one core</td><td>Normal for a busy server</td></tr>
            <tr><td class="num">100,000</td><td class="num">0.3 s, 30% of one core</td><td>Worth a look</td></tr>
            <tr><td class="num">300,000</td><td class="num">0.9 s, almost a whole core</td><td>A core lost to switching instead of working</td></tr>
          </tbody>
        </table>

        <h2>How they fit together</h2>
        <p>One server with two processes and two cores. Step through a few time slices:</p>
        <div class="widget" data-widget="process-thread"></div>

        <h2>Why more threads isn’t always faster</h2>
        <ol class="points">
          <li>Threads that share data need locks so they don’t trip over each other.</li>
          <li>While one thread holds a lock, the others wait, however many cores you have.</li>
        </ol>
        <p>A busy service, with enough traffic to keep every thread busy. Add threads and watch what happens:</p>
        <div class="widget" data-widget="thread-sweet-spot"></div>
        <ol class="points" start="3">
          <li><strong>So there is always a sweet spot.</strong> Throughput rises as you add threads, levels off, then falls. Past the peak, every extra thread makes the whole system slower, not faster. Where the sweet spot sits depends on the kind of work, which the next page covers.</li>
          <li><strong>Find it by measuring, not guessing.</strong> Add workers step by step under realistic load, and stop where throughput stops rising or the slowest requests start to get slower.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> ps -o pid,nlwp,rss,cmd -C postgres | head -4     <span class="c"># nlwp = threads in the process</span>
<span class="o">    PID NLWP   RSS CMD
    812    1 27144 postgres: checkpointer
    815    1 11380 postgres: walwriter
   2290    1 14012 postgres: app orders 10.0.1.17(51544) idle</span>
<span class="p">$</span> vmstat 1                                         <span class="c"># cs = context switches per second, whole machine</span>
<span class="o">procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 3  0      0 319488  82112 4413920    0    0     4    96 2210 9840 22  4 74  0  0</span>
<span class="p">$</span> pidstat -w -p 2290 1                             <span class="c"># context switches per second, one process</span>
<span class="o">14:02:11      UID       PID   cswch/s nvcswch/s  Command
14:02:12      113      2290    412.00      3.00  postgres</span></pre>
          <ol class="points term-note">
            <li>Every PostgreSQL connection is its own process with a single thread.</li>
            <li>The whole machine switches about 9,800 times a second (<code>cs</code>): normal for a busy server, going by the table above. <code>r</code> shows 3 threads ready to run.</li>
            <li>The connection process gives up its core voluntarily 412 times a second (<code>cswch</code>): it’s waiting on disk and network.</li>
            <li>It is almost never pushed off its core (<code>nvcswch</code>), so the CPU is not its problem.</li>
          </ol>
        </figure>

        <h3 class="read-head">How to read these columns</h3>
        <table class="data cols">
          <thead><tr><th>Column</th><th>What it means</th><th>In this example</th></tr></thead>
          <tbody>
            <tr class="group"><td colspan="3"><code>ps -o pid,nlwp,rss,cmd</code>: one line per process</td></tr>
            <tr><td><code>PID</code></td><td>Process ID: the number the OS uses to identify the process</td><td>2290 is one database connection</td></tr>
            <tr><td><code>NLWP</code></td><td>Number of threads in the process (“light-weight processes”)</td><td>1: each has a single thread</td></tr>
            <tr><td><code>RSS</code></td><td>Memory the process is really using in RAM, in KB</td><td>14,012 KB, about 14 MB</td></tr>
            <tr><td><code>CMD</code></td><td>What the process is. PostgreSQL writes each connection’s details here.</td><td>User <code>app</code>, database <code>orders</code>, connected from 10.0.1.17, currently idle</td></tr>

            <tr class="group"><td colspan="3"><code>vmstat 1</code>: one line every second for the whole machine. When you run it, ignore the very first line: it’s the average since boot.</td></tr>
            <tr><td><code>r</code></td><td>Threads ready to run: running now or waiting for a core</td><td>3 on this machine</td></tr>
            <tr><td><code>b</code></td><td>Threads blocked, waiting for the disk</td><td>0</td></tr>
            <tr><td><code>in</code></td><td>Interrupts per second: network cards, disks and timers asking the CPU for attention</td><td>2,210</td></tr>
            <tr><td><code>cs</code></td><td>Context switches per second</td><td>9,840: normal for a busy server</td></tr>
            <tr><td><code>us sy id wa st</code></td><td>How CPU time is split, as in <code>top</code>: your code, the kernel, idle, waiting for disk, taken by the hypervisor</td><td>22% your code, 4% kernel, 74% idle</td></tr>
            <tr><td><code>swpd free buff cache</code>, <code>si so</code>, <code>bi bo</code></td><td>Memory, swapping, and blocks read from and written to disk per second</td><td>Covered on the memory and disk pages</td></tr>

            <tr class="group"><td colspan="3"><code>pidstat -w -p 2290 1</code>: one line every second for process 2290</td></tr>
            <tr><td><code>UID</code></td><td>The user the process runs as</td><td>113, the <code>postgres</code> user</td></tr>
            <tr><td><code>cswch/s</code></td><td>Voluntary switches: the thread gave up its core because it had to wait for disk, network or a lock</td><td>412: it waits a lot</td></tr>
            <tr><td><code>nvcswch/s</code></td><td>Involuntary switches: the kernel took the core away because its time slice ran out and others were waiting</td><td>3: almost never</td></tr>
          </tbody>
        </table>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Isolation costs memory; sharing costs safety.</strong> Separate processes mean one bad request
            can’t corrupt another’s data, but 100 worker processes hold 100 copies of your app in memory. Threads share
            one copy, and a bug in one can break them all.</li>
            <li><strong>Standard Python runs one thread at a time.</strong> The GIL lets only one thread execute Python
            code at once (a thread waiting on I/O lets go of it). Python 3.13 and later also come in an optional free-threaded build
            without the GIL, but most libraries and servers still run the standard one. For CPU-heavy Python, run several processes, not more threads.</li>
            <li><strong>Involuntary context switches mean CPU shortage.</strong> In <code>pidstat</code>, a high
            <code>cswch/s</code> means threads are waiting on I/O; a high <code>nvcswch/s</code> means they were pushed
            off a core that someone else needed.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <ol class="points">
            <li><strong>Count ready threads, not threads.</strong> 2,000 sleeping threads cost almost no CPU; 50 ready threads on 8 cores are queuing.</li>
            <li><strong>Grow thread and connection pools only while throughput keeps rising.</strong> Past the sweet spot, more threads make things slower.</li>
          </ol>
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
          <li>Every request is a mix of computing and waiting for data.</li>
          <li>Which one dominates decides how to scale it: more cores, or more requests in flight at once.</li>
        </ol>

        <h2>Most web requests barely use the CPU</h2>
        <p>A typical 50 ms API call, broken down: the CPU is busy for only 4 ms of it.</p>
        <div class="widget" data-widget="request-timeline"></div>

        <div class="split">
          <div>
            <h3>CPU-bound work</h3>
            <ol class="points">
              <li>Time goes into computing: resizing images, hashing passwords, compressing files, generating PDFs, encryption, ML inference, parsing huge JSON.</li>
              <li>The CPU is the limit, so throughput = cores ÷ CPU time per request.</li>
              <li>Example: each request needs 10 ms of CPU, so one core finishes 100 requests a second, and 8 cores finish 800. That is the ceiling, however many threads you add.</li>
              <li>So the best setup is about one busy thread per core. 50 threads on 8 cores just take turns on the same 8 cores: more context switches, no extra work done.</li>
            </ol>
          </div>
          <div>
            <h3>I/O-bound work</h3>
            <ol class="points">
              <li>Time goes into waiting for something outside the CPU: a database query, a network call to another service or API (a payment gateway, an internal microservice), a cache such as Redis, the disk, or an upload to S3.</li>
              <li>While a request waits, its worker can’t do anything else, so throughput is set by how many requests are in flight at once.</li>
              <li>Example: each request takes 50 ms, but only 4 ms of that is CPU. One worker finishes 20 requests a second, so 8 workers finish 160, and the CPU is only 8% busy. The limit is the number of workers, not the CPU.</li>
              <li>So add workers, many more than cores. Throughput keeps rising until something else fills up: the CPU (see the table below), or whatever the requests wait on, such as the database.</li>
            </ol>
          </div>
        </div>

        <p>Adding workers to the I/O-bound example (8 cores, 50 ms per request, 4 ms of it CPU):</p>
        <table class="data">
          <thead><tr><th class="num">Workers</th><th class="num">Requests a second</th><th class="num">CPU busy</th><th>What limits it</th></tr></thead>
          <tbody>
            <tr><td class="num">8</td><td class="num">160</td><td class="num">8%</td><td>Too few workers</td></tr>
            <tr><td class="num">40</td><td class="num">800</td><td class="num">40%</td><td>Still too few workers</td></tr>
            <tr><td class="num">100</td><td class="num">2,000</td><td class="num">100%</td><td>The CPU: the service has become CPU-bound</td></tr>
            <tr><td class="num">200</td><td class="num">About 2,000</td><td class="num">100%</td><td>The CPU. Extra workers just queue for a core, so each request gets slower.</td></tr>
          </tbody>
        </table>
        <p class="caption">Simplified: this assumes the database keeps up. In real systems it often fills up before the CPU does.</p>

        <h2>How to tell which kind you have</h2>
        <ol class="points">
          <li>Run <code>top</code> on the server while it’s under real load, and look at one line: the CPU line, which starts with <code>%Cpu(s)</code>.</li>
        </ol>
        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> top
<span class="o">top - 14:02:11 up 12 days,  3:14,  3 users,  load average: 3.92, 3.10, 2.45
Tasks: 112 total,   5 running, 107 sleeping,   0 stopped,   0 zombie</span>
%Cpu(s): 88.1 us,  4.0 sy,  0.0 ni,  6.9 id,  0.6 wa,  0.0 hi,  0.4 si,  0.0 st
<span class="o">MiB Mem :   7884.8 total,    412.5 free,   3174.8 used,   4297.5 buff/cache
MiB Swap:   2048.0 total,   2048.0 free,      0.0 used.   4452.3 avail Mem

    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND
   2214 app       20   0  812344 196520  14200 R  98.7   2.4  41:12.07 python
   2215 app       20   0  809116 192884  14188 R  97.3   2.4  40:58.33 python
   2216 app       20   0  811020 194112  14196 R  96.0   2.4  41:03.81 python
   2217 app       20   0  807452 190240  14176 R  70.2   2.4  39:47.15 python
   2301 postgres  20   0  226488  27144  24860 S   3.1   0.3   6:02.44 postgres
    655 www-data  20   0   55732   9120   5340 S   1.2   0.1   1:15.90 nginx</span></pre>
          <ol class="points term-note">
            <li>The third line, <code>%Cpu(s)</code>, is the one to read. This server spends 88% of its time running your code and 4% in the kernel, and is idle only 7% of the time.</li>
            <li>The list underneath shows which processes use the CPU. <code>%CPU</code> counts one core as 100%, so on this 4-core server the column can add up to 400%. Four <code>python</code> workers are using almost all of it.</li>
            <li>Press <code>1</code> to see one CPU line per core instead of the average, <code>P</code> to sort by CPU, and <code>M</code> to sort by memory.</li>
          </ol>
        </figure>
        <ol class="points" start="2">
          <li>The CPU line shows how the CPU spent the last few seconds, in percent. The five parts that matter:</li>
        </ol>
        <div class="cpu-line">
          <div><code>us</code><span>running your code</span></div>
          <div><code>sy</code><span>the kernel working for your code: network, files</span></div>
          <div><code>id</code><span>idle: nothing to do</span></div>
          <div><code>wa</code><span>idle, but waiting for the disk</span></div>
          <div><code>st</code><span>taken by other virtual machines on the same host</span></div>
        </div>
        <p class="caption">The line also shows <code>ni</code>, <code>hi</code> and <code>si</code>. They’re rarely important, so you can ignore them for now.</p>

        <h3 class="read-head">Three servers, three answers</h3>
        <p>Three servers under load, each slow in its own way:</p>
        <div class="legend"><span><i class="sw cpu"></i>CPU working (us + sy)</span><span><i class="sw disk"></i>Waiting for disk (wa)</span><span><i class="sw idle"></i>Idle (id)</span></div>
        <div class="cases">
          <div class="case">
            <h4>Server 1: busy computing</h4>
<div class="cnums" aria-label="CPU line from top, in percent"><span class="hot"><b>88.1</b>us</span><span><b>4.0</b>sy</span><span><b>6.9</b>id</span><span><b>0.6</b>wa</span></div>
            <span class="cbar" role="img" aria-label="92% working, 1% waiting for disk, 7% idle"><i class="w" style="flex-grow:92.1"></i><i class="d" style="flex-grow:0.6"></i><i class="i" style="flex-grow:6.9"></i></span>
            <dl>
              <dt>What it means</dt><dd><strong>CPU-bound.</strong> The cores are almost always running your code.</dd>
              <dt>What helps</dt><dd>Faster code, or more or faster cores.</dd>
            </dl>
          </div>
          <div class="case">
            <h4>Server 2: waiting for the disk</h4>
<div class="cnums" aria-label="CPU line from top, in percent"><span><b>9.5</b>us</span><span><b>3.1</b>sy</span><span><b>42.0</b>id</span><span class="hot"><b>45.2</b>wa</span></div>
            <span class="cbar" role="img" aria-label="13% working, 45% waiting for disk, 42% idle"><i class="w" style="flex-grow:12.6"></i><i class="d" style="flex-grow:45.2"></i><i class="i" style="flex-grow:42"></i></span>
            <dl>
              <dt>What it means</dt><dd><strong>I/O-bound on disk.</strong> The CPU is free, but threads are stuck on reads and writes.</dd>
              <dt>What helps</dt><dd>More RAM to cache data, fewer or better-indexed queries, a faster disk. More CPU won’t help.</dd>
            </dl>
          </div>
          <div class="case">
            <h4>Server 3: waiting on the network</h4>
<div class="cnums" aria-label="CPU line from top, in percent"><span><b>7.8</b>us</span><span><b>2.2</b>sy</span><span class="hot"><b>89.6</b>id</span><span><b>0.2</b>wa</span></div>
            <span class="cbar" role="img" aria-label="10% working, under 1% waiting for disk, 90% idle"><i class="w" style="flex-grow:10"></i><i class="d" style="flex-grow:0.2"></i><i class="i" style="flex-grow:89.6"></i></span>
            <dl>
              <dt>What it means</dt><dd><strong>I/O-bound on the network.</strong> Requests take 800 ms, but the CPU looks idle: they’re waiting for the database or another service, and <code>top</code> can’t see that kind of waiting.</dd>
              <dt>What helps</dt><dd>More requests in flight, faster or cached dependencies. More CPU won’t help.</dd>
            </dl>
          </div>
        </div>
        <ol class="points">
          <li>Only on Server 1 does more CPU help. Servers 2 and 3 have plenty of idle CPU; the fix is in what they’re waiting for.</li>
          <li>Server 3 is the most common case for web APIs, and the easiest to miss: an idle CPU looks healthy. Always look at response times as well as CPU.</li>
        </ol>

        <h3 class="read-head">Is the CPU full? Compare the load with the cores</h3>
        <ol class="points">
          <li><code>nproc</code> prints how many cores the server has. <code>uptime</code> prints the <strong>load average</strong>: how many threads, on average, were running or waiting for a core.</li>
          <li>A load below the number of cores means there’s spare CPU. At or above it, threads are queuing for the CPU.</li>
          <li>You get three numbers: the averages over the last 1, 5 and 15 minutes. If the first is higher than the others, the load is rising.</li>
        </ol>
        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> nproc
<span class="o">4</span>
<span class="p">$</span> uptime
<span class="o"> 14:02:11 up 12 days,  3 users,  load average: 3.92, 3.10, 2.45</span></pre>
          <ol class="points term-note">
            <li>4 cores, and a load of 3.92 over the last minute: the CPU is just about full, like Server 1.</li>
            <li>3.92, then 3.10, then 2.45 going back in time: the load is rising, so the server is getting busier.</li>
          </ol>
        </figure>

        <h2>htop: the same numbers, easier to read</h2>
        <ol class="points">
          <li><code>htop</code> draws one bar per core, so a single maxed-out core stands out at a glance. <code>top</code>’s summary line averages it away.</li>
          <li>CPU bar colours: <strong>green</strong> is your code, <strong>red</strong> is the kernel, <strong>blue</strong> is low-priority work, and <strong>cyan</strong> is time taken by the hypervisor (steal).</li>
          <li>Memory bar: <strong>green</strong> is used by programs, <strong>blue</strong> is buffers, and <strong>yellow</strong> is page cache, which Linux gives back when programs need it.</li>
          <li>Useful keys: <kbd>F6</kbd> to sort by CPU or memory, <kbd>t</kbd> for a tree of processes, <kbd>H</kbd> to hide threads, and <kbd>F2</kbd>, then Display options, to turn on “Detailed CPU time”, which shows iowait and steal separately.</li>
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

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Know which kind each endpoint is, and keep heavy work apart.</strong> Picture one server with
            8 workers and two endpoints: product pages (50 ms, mostly waiting on the database) and PDF invoices (2 seconds
            of pure CPU each). If 8 people download an invoice at the same moment, all 8 workers are busy for 2 seconds,
            and every product page waits behind them, even though it needs only 50 ms. The fix is to give heavy work its
            own pool of workers, so cheap requests always find a free one, or to hand it to a background queue
            and let the user collect the PDF when it’s ready.</li>
            <li><strong>I/O-bound services scale with concurrency.</strong> If CPU is low and throughput is capped, you
            need more requests in flight (more workers, async I/O), not more cores.</li>
            <li><strong>Parallelism buys throughput, not speed.</strong> More cores let you serve more requests at once.
            A request that needs 200 ms of CPU still takes 200 ms, however many cores you buy.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Before adding CPU, prove the CPU is the bottleneck: high <code>us</code>, low <code>wa</code>, and load above the core count.</p>
        </aside>`
    },

    /* ------------------------------------------------------------------ */
    {
      group: 'CPU',
      slug: 'choosing-a-cpu',
      title: 'What to look for in a CPU',
      sub: 'The numbers on a spec sheet or a cloud instance type, and which ones matter for your work.',
      html: `
        <ol class="points lede">
          <li>Every CPU, and every cloud instance type, comes with a list of numbers. Only a few of them matter for a server.</li>
          <li>Which ones matter depends on the work. CPU-bound work cares about speed per core and the number of cores. I/O-bound work cares far more about memory and network than about the CPU.</li>
        </ol>

        <table class="data">
          <thead><tr><th>Parameter</th><th>Typical server value</th><th>What it tells you</th><th>Matters most for</th></tr></thead>
          <tbody>
            <tr><td>Clock speed</td><td>2–3.5 GHz base, up to about 4 GHz boost</td><td>How fast one core runs. 3 GHz means 3 billion ticks a second, and each tick moves the work one step forward. Boost is a faster speed the chip can keep up for a while when only some cores are busy and it isn’t too hot.</td><td>How long one CPU-heavy request takes</td></tr>
            <tr><td>Physical cores</td><td>8 to over 100 per chip</td><td>How many threads the chip can really run at the same moment. With 8 cores, 8 threads run at once and the rest wait their turn.</td><td>Throughput: requests served in parallel</td></tr>
            <tr><td>Threads per core</td><td>1 or 2</td><td>Whether one core can hold two threads at once (hyper-threading). When one thread stops to wait for memory, the core works on the other. The OS sees two CPUs, but they share one core.</td><td>About 10–30% more throughput, not twice as much</td></tr>
            <tr><td>vCPUs</td><td>1 to 192+ per cloud instance</td><td>How many CPUs the cloud gives you, and charges you for. On most Intel instances, and AMD before the 7th generation, one vCPU is one of a core’s two threads, so 8 vCPUs are 4 real cores. On AWS Graviton, and on AMD from the 7th generation (such as c7a), one vCPU is a whole core.</td><td>Comparing instance sizes and prices</td></tr>
            <tr><td>Generation</td><td>e.g. AMD EPYC Zen 5, Intel Xeon 6, AWS Graviton4</td><td>How new the chip’s design is. Newer cores get more done in each tick, so a new 3 GHz core can be about 1.5 times faster than a 3 GHz core from ten years ago.</td><td>Getting more for the same money. Don’t compare GHz across generations; benchmark.</td></tr>
            <tr><td>Cache (L2 and L3)</td><td>1–2 MB L2 per core, tens to hundreds of MB L3</td><td>How much small, fast memory sits on the chip itself. Data found there arrives many times sooner than from RAM, so a bigger cache means fewer slow trips to RAM.</td><td>Databases, caches, anything with a big working set</td></tr>
            <tr><td>Instruction set</td><td>x86-64 (Intel, AMD) or ARM64 (Graviton, Ampere)</td><td>Which kind of machine code the chip runs. A program built for x86-64 won’t run on ARM64, or the other way round, until it’s rebuilt.</td><td>Your binaries and Docker images must be built for it. ARM is often cheaper for the same work.</td></tr>
            <tr><td>Sockets</td><td>1 or 2 CPU chips per server</td><td>How many separate CPU chips the server has (a socket is the slot one chip sits in). Each chip has its own RAM, and reading the other chip’s RAM takes about 1.5–2 times longer. This is called NUMA.</td><td>Only very large machines. A big database on a two-chip server runs fastest when its threads stay near their own memory. Most cloud servers sit on one chip; only the largest sizes span two.</td></tr>
          </tbody>
        </table>
        <h2>Reading a cloud instance type</h2>
        <p>Cloud providers pack these choices into the instance name. On AWS, <code>c7g.2xlarge</code> reads like this:</p>
        <table class="data">
          <thead><tr><th>Part</th><th>Here</th><th>What it means</th></tr></thead>
          <tbody>
            <tr><td>Family</td><td><code>c</code></td><td>Compute-optimised: about 2 GB of RAM per vCPU. <code>m</code> is general purpose (4 GB), <code>r</code> is memory-optimised (8 GB), <code>t</code> is burstable.</td></tr>
            <tr><td>Generation</td><td><code>7</code></td><td>Higher is newer: usually faster per vCPU and cheaper for the same work.</td></tr>
            <tr><td>Processor</td><td><code>g</code></td><td>AWS Graviton (ARM). <code>i</code> is Intel, <code>a</code> is AMD.</td></tr>
            <tr><td>Extras</td><td>none here</td><td><code>d</code> adds a local NVMe disk, <code>n</code> adds network bandwidth.</td></tr>
            <tr><td>Size</td><td><code>2xlarge</code></td><td>8 vCPUs and 16 GB. Each size up doubles both: <code>large</code> has 2 vCPUs, <code>xlarge</code> 4, <code>2xlarge</code> 8, <code>4xlarge</code> 16.</td></tr>
          </tbody>
        </table>
        <p class="caption">Google Cloud and Azure name things differently, but encode the same choices: family, generation, processor and size.</p>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> lscpu | grep -E 'Architecture|^CPU\\(s\\)|Model name|per core|per socket|Socket\\(s\\)'
<span class="o">Architecture:            x86_64
CPU(s):                  8
  Model name:            Intel(R) Xeon(R) Platinum 8375C CPU @ 2.90GHz
    Thread(s) per core:  2
    Core(s) per socket:  4
    Socket(s):           1</span></pre>
          <ol class="points term-note">
            <li><code>x86_64</code>: an Intel or AMD chip, so binaries and Docker images must be built for amd64.</li>
            <li>8 vCPUs, but 2 threads per core: really 4 physical cores.</li>
            <li><code>Socket(s): 1</code>: a single CPU chip, so all memory is equally close and NUMA doesn’t apply.</li>
            <li>The model name gives the generation (the 8375C is a 2021 Intel Xeon, code-named Ice Lake) and the base clock, 2.9 GHz.</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Match the CPU to the bottleneck.</strong> CPU-bound services want the newest generation and a
            compute-optimised family. For I/O-bound services you’re mostly buying memory and network; more vCPUs won’t help.</li>
            <li><strong>Compare price per unit of work, not price per vCPU.</strong> Run your own service on two or three
            instance types. Generation and architecture often matter more than GHz.</li>
            <li><strong>With hyper-threads, 50% is not half full.</strong> 16 vCPUs at 50% can mean the 8 physical cores
            are already close to busy. The remaining “half” adds only 10–30% more throughput.</li>
            <li><strong>Try ARM.</strong> Graviton instances are often cheaper for the same throughput, but every binary,
            base image and native library you use needs an ARM64 build.</li>
            <li><strong>Be careful with burstable types.</strong> The <code>t</code> family is fine for development and low,
            spiky traffic. Steady production load spends the CPU credits, and then the server either slows down or, in unlimited mode (the default for t3 and t4g), keeps going and adds to the bill.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Spec sheets tell you where to start. Benchmarking your own workload tells you what to buy.</p>
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
          <li>It’s fast compared with disk, but slow compared with the CPU cache.</li>
          <li>That gap shapes how fast code really runs.</li>
        </ol>

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
            <li><code>L1d</code> is the L1 cache for <strong>data</strong>, <code>L1i</code> the one for <strong>instructions</strong>: each core keeps the code it’s about to run apart from the values it’s working on, so it can fetch both in the same tick.</li>
            <li>“Instances” is how many separate caches there are, and the size is the total. 4 instances means one per core, so each core has 48 KiB of L1d, 32 KiB of L1i and 1.25 MiB of L2.</li>
            <li>L3 has 1 instance: one 54 MiB cache shared by all the cores. On a cloud VM it’s usually the whole chip’s L3, shared with other customers’ VMs on the same machine.</li>
            <li>KiB and MiB are binary units: 1 KiB is 1,024 bytes.</li>
            <li>A Java process that has reserved 30 GB of address space but is really using 2.5 GB (<code>ps</code> shows KB).</li>
          </ol>
        </figure>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>RAM is where fast systems keep their data.</strong> Redis, Memcached, a database’s buffer pool and
            a CDN’s hot set (the files a content delivery network keeps near its users) are all ways of keeping the working set in RAM instead of on disk or across the network.</li>
            <li><strong>Memory bandwidth is shared.</strong> Hundreds of GB/s sounds endless, but 64 cores streaming data
            at once can use it all, and then extra cores add nothing.</li>
          </ol>
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
          <li>Memory behaves differently from the CPU. When the CPU runs out, everything gets slower. When memory runs out, things stop.</li>
          <li>This page answers three questions: where does the memory go, how much is really free, and what happens when it runs out.</li>
        </ol>

        <h2>Where the memory goes</h2>
        <ol class="points">
          <li><strong>Your app’s processes.</strong> A Python or Node worker often takes 50–300 MB. A JVM takes its heap
          plus a few hundred MB more.</li>
          <li><strong>The database.</strong> Its cache of table and index pages (PostgreSQL’s <code>shared_buffers</code>,
          MySQL’s InnoDB buffer pool), plus memory for every connection and every sort.</li>
          <li><strong>The OS page cache.</strong> Linux fills spare RAM with recently read files, so reading them again is
          fast. That’s a good thing, and it’s why a healthy server shows almost no “free” memory.</li>
          <li><strong>The kernel.</strong> Socket buffers, connection tracking, its own bookkeeping: small per connection,
          large with a million of them.</li>
        </ol>

        <h2>How much is really free?</h2>
        <p><code>free -h</code> answers it. The number to read is <code>available</code>, not <code>free</code>:</p>
        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> free -h
<span class="o">               total        used        free      shared  buff/cache   available
Mem:           7.7Gi       3.1Gi       312Mi        41Mi       4.3Gi       4.3Gi
Swap:          2.0Gi          0B       2.0Gi</span></pre>
          <ol class="points term-note">
            <li><code>total</code> is 7.7 GB of RAM, and <code>used</code> shows programs are using 3.1 GB of it.</li>
            <li>Only 312 MB is <code>free</code>, and that’s fine: 4.3 GB is page cache (<code>buff/cache</code>), which Linux hands back the moment a program needs it.</li>
            <li><code>available</code> is the real answer: about 4.3 GB can still be given to programs.</li>
            <li><code>shared</code> is memory several processes use together; it’s usually small. <code>Swap</code> 0B used means nothing has been pushed out to disk.</li>
          </ol>
        </figure>

        <h2>The working set</h2>
        <ol class="points">
          <li>The working set is the data your requests touch again and again: hot rows, indexes, sessions.</li>
          <li>It’s usually a small fraction of all your data.</li>
          <li>If it fits in RAM, almost every read is a memory read.</li>
          <li>If it doesn’t, reads start falling through to disk, each about a thousand times slower, and latency goes over a cliff rather than rising gently.</li>
          <li>That’s why a database that was fast for a year can suddenly turn slow: the data grew past the RAM, not the traffic.</li>
        </ol>

        <h2>What happens when it runs out</h2>
        <p>When programs need more memory than the RAM has, Linux tries three things, in this order:</p>
        <ol class="steps">
          <li><strong>It shrinks the page cache.</strong> Files that were cached in RAM have to be read from disk again, so things get slower, but nothing breaks yet.</li>
          <li><strong>It swaps.</strong> If the server has swap space, Linux moves memory that hasn’t been used lately out to disk. Touching it again is about 1,000 times slower, and the server seems to freeze without crashing.</li>
          <li><strong>It kills a process.</strong> With nothing left to free, the kernel’s <strong>OOM killer</strong> (out of memory) picks a process, usually the biggest, and kills it. That is often your database.</li>
        </ol>
        <p>In a container the same thing happens at the container’s memory limit: the process is killed with exit code 137 (<code>OOMKilled</code>), often with nothing in the app’s own logs.</p>

        <figure class="term">
          <figcaption>How each stage shows up</figcaption>
<pre><span class="p">$</span> vmstat 1                 <span class="c"># on a server that's running out of memory</span>
<span class="o">procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----
 r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st
 1  6 1843200  51200   2048  98304 2840 3912  3100  4120 2210 4105  9 14 22 55  0</span>
<span class="p">$</span> sudo dmesg -T | grep -i "killed process"
<span class="o wrap">[Tue Oct 13 02:47:13 2026] Out of memory: Killed process 3112 (postgres) total-vm:8453612kB, anon-rss:6120448kB</span></pre>
          <ol class="points term-note">
            <li>Stage 1: <code>cache</code> has shrunk to 96 MB (the healthy server above had 4.3 GB), so files are being read from disk again.</li>
            <li>Stage 2: <code>swpd</code> shows 1.8 GB already swapped out, and <code>si</code> and <code>so</code> (KB swapped in and out per second) are in the thousands. The CPU spends 55% of its time waiting for the disk (<code>wa</code>).</li>
            <li>Stage 3: the <code>dmesg</code> line is the kernel’s log of an OOM kill. It killed process 3112, PostgreSQL, which was using about 6 GB (<code>anon-rss</code>).</li>
          </ol>
        </figure>

        <h3 class="read-head">Two problems that build up slowly</h3>
        <ol class="points">
          <li><strong>Leaks.</strong> Memory grows a little every hour until the stages above begin. A restart “fixes” it, which is why leaks survive for so long. Watch for memory that only ever goes up.</li>
          <li><strong>Garbage-collection pressure.</strong> In Java, Go, .NET and Node you never free memory yourself. A garbage collector (GC) runs from time to time, finds the objects your code no longer uses, and frees them. Each run takes CPU time, and some runs pause your code for a moment. When the heap (the memory your program keeps its objects in) is nearly full, the GC has to run again and again to make room. Requests get stuck behind those pauses, so your slowest requests get much slower long before the program runs out of memory and crashes.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Size for the working set, then add headroom.</strong> Leave room for the page cache too: a database
            server whose processes use 95% of RAM has nothing left to cache its files.</li>
            <li><strong>Pick the instance type by what runs out.</strong> Cloud families mostly differ in memory per vCPU:
            about 2 GB (compute-optimised, AWS c), 4 GB (general purpose, m) and 8 GB (memory-optimised, r). Caches and
            databases usually want the last; stateless APIs the first two.</li>
            <li><strong>Decide whether you want swap.</strong> Swap turns a memory shortage into a slow, frozen server
            instead of a crash. Many teams turn it off on production servers so the problem fails fast and visibly, and
            gets fixed.</li>
            <li><strong>Protect the process that matters most.</strong> You can tell the OOM killer to spare a process:
            <code>OOMScoreAdjust=-1000</code> in its systemd unit, for example for the database, so a runaway worker is
            killed instead.</li>
            <li><strong>A cache trades memory for speed.</strong> It keeps a copy of something that was slow to get, such as
            a database result, a rendered page or a file, in RAM. The next request reads that copy in microseconds instead of
            going back to the database, the disk or another server. You pay in RAM, and you save CPU, disk reads or network
            round trips. The page cache above is exactly this: Linux spends spare RAM so it doesn’t have to read the disk again.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Watch <code>available</code>, not <code>free</code>, and alert when it drops below about 15–20% of RAM (or of the container limit). By the time it reaches zero, the OOM killer is already choosing a victim.</p>
        </aside>`
    },

    /* ================================================================= Disk */
    {
      group: 'Disk',
      slug: 'disk',
      title: 'How disks work',
      sub: 'Spinning disks, SSDs and cloud volumes: where data survives a restart.',
      html: `
        <ol class="points lede">
          <li>Disk is where data lives when the power goes off.</li>
          <li>It’s also by far the slowest thing inside the server.</li>
          <li>Servers use four kinds of disk, and they differ in speed by a factor of a thousand or more:</li>
        </ol>

        <dl class="terms">
          <div><dt>Hard disk (HDD)</dt><dd>Spinning metal platters, read by a head on a moving arm. Cheap and large, but slow for anything except reading data in order.</dd></div>
          <div><dt>SATA SSD</dt><dd>Flash memory chips with no moving parts. It plugs into SATA, the same connection hard disks use, and that connection caps it at about 550 MB/s.</dd></div>
          <div><dt>NVMe SSD</dt><dd>The same kind of flash chips, connected over PCIe, the CPU’s fastest connection, instead of SATA. Several times faster than a SATA SSD; what modern laptops and servers use.</dd></div>
          <div><dt>Cloud disk</dt><dd>Not inside your server at all: storage on other machines, reached over the network, such as AWS EBS. Easy to resize, snapshot and move to another server, but every read and write crosses the network.</dd></div>
        </dl>

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
        </ol>

        <h2>Three numbers describe a disk</h2>
        <ol class="points">
          <li><strong>Latency: how long one read or write takes</strong>, from asking for it until it’s done. It decides how long a single request waits. A database commit waits for its write to reach the disk, so a commit can never be faster than the disk’s write latency.</li>
          <li><strong>IOPS: how many separate reads and writes the disk can do in a second</strong> (input/output operations per second). Each one counts once, however small: reading 4 KB from 3,000 different places is 3,000 operations. It decides how many small, scattered requests the disk can keep up with, such as a database fetching rows for many users at once.</li>
          <li><strong>Throughput: how many bytes the disk can move in a second</strong>, in MB/s. It matters when the data is big and read in order, such as a backup, a log file or a scan of a whole table.</li>
          <li>The three are linked. Throughput = IOPS × the size of each operation. 3,000 reads of 4 KB each move only 12 MB/s, so small operations hit the IOPS limit first. Reads of 1 MB each reach a 125 MB/s limit at about 125 a second, so big operations hit the throughput limit first.</li>
          <li>And latency grows when the disk is busy. Once requests arrive faster than the disk’s IOPS limit, they wait in line, and each one waits for every request ahead of it. You’ll see this in the <code>iostat</code> output below.</li>
        </ol>
        <p>The three numbers for common disks:</p>
        <table class="data">
          <thead><tr><th>Kind of disk</th><th class="num">Random IOPS</th><th class="num">Throughput</th><th class="num">Latency per read</th></tr></thead>
          <tbody>
            <tr><td>Spinning hard disk (HDD)</td><td class="num">100–200</td><td class="num">150–250 MB/s</td><td class="num">5–10 ms</td></tr>
            <tr><td>SATA SSD</td><td class="num">~50K–100K</td><td class="num">~550 MB/s</td><td class="num">~100 µs</td></tr>
            <tr><td>NVMe SSD</td><td class="num">500K–1M+</td><td class="num">3–14 GB/s</td><td class="num">20–100 µs</td></tr>
            <tr class="hl"><td>Cloud disk, AWS gp3 default</td><td class="num">3,000</td><td class="num">125 MB/s</td><td class="num">~1 ms</td></tr>
          </tbody>
        </table>
        <ol class="points" start="6">
          <li>The highlighted row is what many production databases run on: network-attached storage.</li>
        </ol>

        <figure class="term">
          <figcaption>Try it on a Linux server</figcaption>
<pre><span class="p">$</span> iostat -xz 1        <span class="c"># one line per disk, every second</span>
<span class="o">Device      r/s     w/s    rkB/s    wkB/s  r_await  w_await  aqu-sz  %util
nvme1n1  2610.0   390.0  10440.0   6240.0     8.41     3.10   23.1   99.6</span></pre>
          <ol class="points term-note">
            <li><code>r/s</code> and <code>w/s</code>: reads and writes per second, the disk’s IOPS. 2,610 + 390 = 3,000.</li>
            <li><code>rkB/s</code> and <code>wkB/s</code>: KB read and written per second, its throughput. About 17 MB/s here.</li>
            <li><code>r_await</code> and <code>w_await</code>: average milliseconds per read and per write, including time spent waiting in line. Reads take 8 ms.</li>
            <li><code>aqu-sz</code>: how many operations are waiting in line on average. 23 here.</li>
            <li><code>%util</code>: how much of the time the disk was busy. SSDs and cloud disks serve many requests at once, so 100% doesn’t mean full: trust <code>aqu-sz</code> and the wait times.</li>
            <li>Put together: exactly 3,000 operations a second, a long queue and slow reads. This is a default cloud SSD (AWS gp3) at its IOPS limit. (On AWS, EBS volumes show up as <code>nvme</code> devices, even though they’re network disks.)</li>
          </ol>
        </figure>

        <h2>Picking a disk for your workload</h2>
        <ol class="points">
          <li>Every workload leans on one of the three numbers. Work out which one first: in the cloud you buy IOPS and throughput separately, and latency comes with the type of disk.</li>
        </ol>
        <table class="data">
          <thead><tr><th>Number</th><th>Matters most when</th><th>Typical workloads</th></tr></thead>
          <tbody>
            <tr><td>Latency</td><td>Operations happen one after another, and someone is waiting for each</td><td>Database commits (every commit waits for a write), cache misses on a busy database</td></tr>
            <tr><td>IOPS</td><td>There are many small, scattered reads and writes</td><td>Transactional databases (orders, users, payments), key-value stores</td></tr>
            <tr><td>Throughput</td><td>Big reads and writes happen in order</td><td>Analytics scans, backups and restores, log processing, video</td></tr>
          </tbody>
        </table>

        <h3 class="read-head">What to pick</h3>
        <table class="data">
          <thead><tr><th>Workload</th><th>Pick</th><th>Why</th></tr></thead>
          <tbody>
            <tr><td>App servers: code, logs, temporary files</td><td>The default cloud SSD (AWS gp3: 3,000 IOPS, 125 MB/s)</td><td>Plenty for this, and cheap</td></tr>
            <tr><td>Transactional database</td><td>A cloud SSD with extra IOPS bought, or a high-IOPS volume (AWS io2) for the busiest</td><td>Lots of small random reads and writes, and commit latency is felt by users</td></tr>
            <tr><td>A data store that copies itself to other servers (Cassandra, Kafka)</td><td>Local NVMe inside the server (instance store)</td><td>The fastest disk there is. Its data is lost if the server stops, but the copies on other servers cover that.</td></tr>
            <tr><td>Analytics, backups, big batch jobs</td><td>A cloud SSD with extra throughput, or a throughput-optimised hard disk (AWS st1) for big, rarely read data</td><td>MB per second matters here, not latency</td></tr>
            <tr><td>Caches and scratch space</td><td>Local NVMe</td><td>Fast, and losing it when the server stops doesn’t matter</td></tr>
          </tbody>
        </table>

        <h3 class="read-head">Worked example: reading the numbers above</h3>
        <ol class="steps">
          <li><strong>Measure at the busiest hour.</strong> The <code>iostat</code> output above shows 2,610 reads and 390 writes a second, with reads waiting 8 ms because 23 operations are queued.</li>
          <li><strong>IOPS:</strong> 2,610 + 390 = 3,000 operations a second. Add 50% headroom: 4,500.</li>
          <li><strong>Throughput:</strong> 10,440 + 6,240 KB/s is about 17 MB/s. With headroom, about 25 MB/s.</li>
          <li><strong>Compare with the disk.</strong> The default gp3 gives 3,000 IOPS and 125 MB/s. Throughput has plenty of room, but IOPS is exactly at the limit, which is why reads wait 8 ms. Buy about 4,500 IOPS on the same volume; there’s no need for a bigger or different disk.</li>
        </ol>

        <p>Try your own numbers:</p>
        <div class="widget" data-widget="disk-picker"></div>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>In the cloud, durability comes from copies, not from a better disk.</strong> EBS copies a volume
            within one availability zone (one or more datacenters with their own power and network), S3 spreads objects across zones, and databases replicate to other machines. Assume any single
            disk can vanish.</li>
            <li><strong>Your laptop flatters you.</strong> A query that’s instant on a laptop NVMe can crawl on a default
            cloud volume. Instance size caps disk bandwidth too: a small instance can’t use a fast volume’s full speed.</li>
            <li><strong>Objects for blobs, databases for rows.</strong> Put images, PDFs and backups in object storage (such as AWS S3: files kept by name, fetched over HTTP) and
            keep only their keys in the database.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Disk is for keeping data safe; RAM is for speed. Design so the hot path rarely touches disk.</p>
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

        <figure class="term">
          <figcaption>Try it: a server next door, then one across the world</figcaption>
<pre><span class="p">$</span> ping -c 3 10.0.2.14             <span class="c"># on a Linux server: the database server, same datacenter</span>
<span class="o">64 bytes from 10.0.2.14: icmp_seq=1 ttl=64 time=0.214 ms
64 bytes from 10.0.2.14: icmp_seq=2 ttl=64 time=0.198 ms
64 bytes from 10.0.2.14: icmp_seq=3 ttl=64 time=0.221 ms</span>
<span class="p">&gt;</span> ping 69.171.249.8               <span class="c"># on a Windows laptop in India: Facebook’s server in Ashburn, US east coast</span>
<span class="o">Reply from 69.171.249.8: bytes=32 time=338ms TTL=74
Reply from 69.171.249.8: bytes=32 time=440ms TTL=74
Reply from 69.171.249.8: bytes=32 time=283ms TTL=74
Reply from 69.171.249.8: bytes=32 time=283ms TTL=74

Ping statistics for 69.171.249.8:
    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss),
Approximate round trip times in milli-seconds:
    Minimum = 283ms, Maximum = 440ms, Average = 336ms</span></pre>
          <ol class="points term-note">
            <li><code>ping</code> measures the round trip. The database server is about 0.2 ms away: two servers in the same datacenter.</li>
            <li>From a laptop in India, Facebook’s server in Ashburn is at least 283 ms away: over 1,000 times longer than the trip to the database server.</li>
            <li>Most of that is distance. Ashburn is about 13,000 km away in a straight line, so 130 ms there and back is the floor (5 µs per km, above). The cables take a longer route, and home broadband and Wi-Fi add their own delay, which is why it’s above the ~200 ms between datacenters.</li>
            <li>The same trip took anywhere from 283 to 440 ms: the slower packets waited in queues at busy routers along the way. Use the minimum to judge distance; the spread shows how busy the path is.</li>
          </ol>
        </figure>

        <p>Bandwidth needed is the number of requests a second × the size of each response. Try your own numbers:</p>
        <div class="widget" data-widget="net-picker"></div>

        <h2>What a new connection costs</h2>
        <ol class="points">
          <li>Before a request can leave, a new HTTPS connection needs two round trips: one for TCP to agree to talk,
          and one for TLS to agree on the keys that encrypt the conversation (TLS 1.3; the older TLS 1.2 needs two).</li>
          <li>Then the request goes out and the answer comes back: a third round trip. From Bangalore to the US east
          coast, about 200 ms each, that’s 600 ms before the server’s own work counts at all. A reused connection pays only
          the last 200 ms.</li>
          <li>Inside one datacenter the same handshakes cost about a millisecond, so there your code is the slow part.</li>
        </ol>

        <p>Pick a place, and compare a new connection with one that’s already open:</p>
        <div class="widget" data-widget="connection-waterfall"></div>

        <ol class="points">
          <li><strong>Lost packets cost round trips too.</strong> TCP only finds out a packet is lost when its
          acknowledgement doesn’t come back, then sends it again: at least one more round trip, and up to a timeout of a
          few hundred milliseconds. Everything sent after it waits as well, because TCP hands over the data in order.</li>
          <li>Packets get lost mostly at busy routers: when a router’s queue overflows, it drops what doesn’t fit. The same
          queues are why one ping above took 283 ms and the next 440 ms.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Bandwidth is cheap; latency is physics.</strong> You can buy a wider pipe. You can’t buy a shorter
            one, except by moving the server closer to the user.</li>
            <li><strong>One connection has its own speed limit.</strong> Throughput ≤ window size ÷ round-trip time, where the window is how much data TCP sends before it
            waits for an acknowledgement. A 4 MB window to the US, 200 ms away, caps one connection at 20 MB/s.
            Copying a big file across the world over one connection can be far slower than the link; parallel connections
            or larger buffers fix it.</li>
            <li><strong>Pool and reuse every connection.</strong> Every new connection spends a few round trips on setup
            (TCP, then TLS, the encryption behind HTTPS) before any useful work. Keep-alive to browsers and connection pools to databases skip that.</li>
            <li><strong>Network traffic has a price.</strong> In AWS, traffic between zones costs about $0.01 per GB each
            way, and traffic out to the internet about $0.09 per GB. A chatty service spread across zones can cost more than
            its servers.</li>
            <li><strong>Big files don’t belong on app servers.</strong> Sending 2 MB images to 100 users a second is
            200 MB/s, or 1.6 Gbps. A c7g.large, a typical small app server, is sold as “up to 12.5 Gbps”, but
            that’s a burst: its steady baseline is 0.937 Gbps, and it can burst above that only for about 5 to 60 minutes
            before it drops back. The images alone need almost twice its steady bandwidth. Serve big files from object
            storage behind a CDN, and keep the app server for requests.</li>
          </ol>
        </aside>

        <aside class="note rule">
          <h3>Rule of thumb</h3>
          <p>Count round trips, not bytes. Most slow pages are slow because of how many times they cross the network,
          not how much they send.</p>
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
          <li>On the database server, the rows come from the buffer pool in RAM, or from disk if they aren’t there. <span class="uses">Memory, disk</span></li>
          <li>Your code builds the response, and the kernel sends it back out as packets. <span class="uses">CPU, network</span></li>
        </ol>

        <aside class="note rule">
          <h3>The chapter so far</h3>
          <ol class="points">
            <li><strong>CPU:</strong> a core is very fast, but it spends most of its time waiting for data.</li>
            <li><strong>Processes and threads:</strong> the OS shares a few cores by letting threads take turns. Past a sweet spot, more threads make things slower.</li>
            <li><strong>CPU-bound or I/O-bound:</strong> most web requests wait far more than they compute. Check <code>top</code> before you buy more CPU.</li>
            <li><strong>Memory:</strong> keep the working set in RAM. When it runs out, the server swaps, slows to a crawl, and the OOM killer kills processes.</li>
            <li><strong>Disk:</strong> the slowest part inside the server. Know whether you need low latency, more IOPS or more throughput; cloud disks sell IOPS and throughput separately.</li>
            <li><strong>Network:</strong> distance sets a floor on latency that no code can beat, so count the round trips.</li>
            <li><strong>A system is only as fast as its busiest part.</strong> Adding cores does nothing when the server is short of memory, and more RAM does nothing when the disk is the limit.</li>
            <li><strong>The network can be the limit when everything else is fine.</strong> CPU, RAM and disk can all have room to spare while large responses, such as images, files and exports, fill the server’s bandwidth (page 1.8).</li>
            <li><strong>Before you scale anything, find out which part is full.</strong></li>
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
        </ol>

        <div class="widget" data-widget="latency-ladder"></div>

        <h2>What this means in practice</h2>
        <ol class="points">
          <li>A request that does one RAM lookup and one round trip inside the datacenter spends 99.98% of its time on the network.</li>
          <li>Caching works because RAM is about 1,000 times faster than an SSD and 5,000 times faster than a round trip to another server.</li>
          <li>A database in another region (another part of the world, such as Mumbai and Virginia) adds tens to hundreds of milliseconds to every query, and a page often runs dozens of queries.</li>
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
          <li>Take 100 requests: 98 take 50 ms and 2 take 3 seconds (3,000 ms).</li>
          <li><strong>Average:</strong> add them all up and divide by 100. (98 × 50 + 2 × 3,000) ÷ 100 = (4,900 + 6,000) ÷ 100 = <strong>109 ms</strong>. That looks fine.</li>
          <li><strong>Percentiles:</strong> sort the 100 times from fastest to slowest. The <strong>p50</strong> (median) is the one in the middle, request 50: <strong>50 ms</strong>.</li>
          <li>The <strong>p99</strong> is request 99: 99 out of 100 requests are this fast or faster. Here it’s one of the two slow ones: <strong>3,000 ms</strong>.</li>
        </ol>
        <div class="widget" data-widget="percentile-strip"></div>
        <ol class="points" start="5">
          <li>The average says 109 ms, but 2 users in every 100 waited 3 seconds. Percentiles show that slow tail, and the slow tail is where your unhappy users are.</li>
        </ol>

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
      slug: 'concurrency',
      title: 'Serving many requests at once',
      sub: 'Worker processes, thread pools and event loops: the three ways servers juggle users.',
      html: `
        <ol class="points lede">
          <li>You now know the parts of a server (CPU, memory, disk and network), how fast each one is, and how to measure them. Now we can look underneath your web server, at how it actually uses those parts when many requests arrive at once.</li>
          <li>A web server’s job sounds simple: a request arrives, the server works out the answer, and sends it back.</li>
          <li>But most of that time is spent waiting: for the database, for another service, for the disk. While one request waits, hundreds more arrive.</li>
          <li>So the real question is how a server keeps many requests in flight at once. Every web server answers it with one of three patterns.</li>
        </ol>

        <h2>Three ways to serve many requests</h2>
        <ol class="points">
          <li><strong>A pool of worker processes.</strong> The server starts a fixed number of worker processes, and each one handles one request from start to finish. While its request waits for the database, the whole process waits too. Python’s gunicorn (with sync workers) and PHP-FPM work this way, and so does PostgreSQL, with one process per connection.</li>
          <li><strong>A thread per request.</strong> One process keeps a pool of threads, and each request gets a thread until it’s done. Threads are lighter than processes and share the same memory, but a waiting request still holds its thread. Java’s Tomcat (under Spring MVC) and Ruby’s Puma work this way.</li>
          <li><strong>An event loop.</strong> One thread handles thousands of requests. Whenever a request would wait, the thread sets it aside, works on another, and comes back when the answer arrives. Node.js, Nginx, Redis and Python’s asyncio (which FastAPI uses) work this way.</li>
        </ol>
        <p>Side by side:</p>
        <table class="data">
          <thead><tr><th>Model</th><th>How it works</th><th>You’ll see it in</th><th>Good at</th><th>Watch out for</th></tr></thead>
          <tbody>
            <tr><td>Worker processes</td><td>Each process handles one request at a time</td><td>gunicorn (sync), PHP-FPM, PostgreSQL</td><td>Isolation, simple code</td><td>Memory: 100 workers × 100 MB = 10 GB, for only 100 requests in flight</td></tr>
            <tr><td>Thread pool</td><td>Many threads in one process, one request per thread</td><td>Tomcat and Spring MVC, Puma, MySQL</td><td>Simple blocking code, shared caches</td><td>A fixed number of threads. With a pool of 200, request 201 waits for a free thread, even if the CPU is idle. And every thread, even one that’s just waiting, holds its own memory (about 1 MB each in Java).</td></tr>
            <tr><td>Event loop</td><td>One thread juggles thousands of requests, switching whenever one would wait</td><td>Node.js, Python asyncio and FastAPI, Nginx, Redis</td><td>Lots of requests that mostly wait. 10,000 users connected at once, such as a chat app or requests waiting on a slow API, need one thread instead of 10,000, because a waiting request costs almost nothing.</td><td>One CPU-heavy task or one blocking call freezes everyone</td></tr>
          </tbody>
        </table>

        <h2>The problem with processes and threads</h2>
        <ol class="points">
          <li>In both models, a request that is only waiting still holds a whole process or thread.</li>
          <li><strong>That costs memory.</strong> A Python worker process takes about 100 MB, so 100 workers need 10 GB to keep just 100 requests in flight. A thread is lighter, but a Java thread still reserves about 1 MB for its stack.</li>
          <li><strong>It costs CPU.</strong> Every time the OS moves a core to another thread, it pays for a context switch (page 1.2). With thousands of threads, the switching itself starts to use up the cores.</li>
          <li><strong>The pool sets a hard limit.</strong> With a pool of 200 threads, request 201 waits for a free thread, even while the CPU sits idle.</li>
        </ol>

        <h2>Why the event loop was invented</h2>
        <ol class="points">
          <li>In 1999, Dan Kegel put a number on the problem: how can one server handle 10,000 connections at once? It became known as the <strong>C10K problem</strong>.</li>
          <li>With a thread per connection, 10,000 connections meant 10,000 threads: gigabytes of stacks, and a scheduler drowning in context switches.</li>
          <li>The answer was the <strong>event loop</strong>: one thread that never sits and waits.</li>
        </ol>

        <h3 class="read-head">How an event loop works</h3>
        <ol class="points">
          <li>Every network connection is a <strong>socket</strong>. Think of it as an open phone line between two programs: when a user’s browser connects to your server, the OS sets up a socket for that connection. Your code reads the request from it and writes the response into it.</li>
          <li>A normal thread reads from one socket and waits until data arrives. An event-loop thread never does that. Instead it hands the kernel its whole list of sockets and says: “wake me when any of these has data”.</li>
          <li>On Linux that request is a system call named <code>epoll_wait</code> (<code>kqueue</code> on macOS and BSD). The kernel already handles every packet that arrives, so it knows which sockets have data and simply hands back that short list.</li>
          <li>The thread then works through the list: read a request here, send a response there, start a database query and move on without waiting for the answer. Then it asks the kernel again. That cycle is the event loop.</li>
          <li>A waiting connection costs only a small entry in the kernel’s list and a few KB of memory, not a whole thread. That’s how one thread can hold 10,000 connections.</li>
        </ol>
        <p>Step through one turn of the loop, with one thread and 8 connections:</p>
        <div class="widget" data-widget="event-loop"></div>
        <ol class="points" start="6">
          <li>Think of a waiter with 20 tables. They don’t stand at one table while the kitchen cooks; they take an order, pass it to the kitchen, and go to whichever table is waving. A thread per connection is one waiter per table, mostly standing still.</li>
          <li>Nginx, Node.js, Redis and Python’s asyncio (which FastAPI uses) all work this way.</li>
        </ol>

        <aside class="note design">
          <h3>For system design</h3>
          <ol class="points">
            <li><strong>Event loops hate surprises.</strong> In an <code>async def</code> FastAPI endpoint, one blocking call
            stalls every request on that event loop: <code>requests.get()</code> instead of <code>httpx.AsyncClient</code>,
            a sync database driver such as <code>psycopg2</code> instead of <code>asyncpg</code>, <code>time.sleep()</code>
            instead of <code>await asyncio.sleep()</code>, or a CPU-heavy job like parsing a huge JSON file. If the code has
            to block, declare the endpoint with plain <code>def</code>: FastAPI then runs it in a thread pool (40 threads
            by default) instead of on the loop. Send CPU-heavy work to a separate process.</li>
            <li><strong>Pools multiply.</strong> 20 app servers × 8 processes × a 10-connection database pool = 1,600
            database connections.</li>
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
        <p class="lede">Before buying servers, estimate.</p>

        <h2>A worked example</h2>
        <ol class="steps">
          <li><strong>Users to requests.</strong> 1 million daily users × 20 requests each = 20 million requests a day.</li>
          <li><strong>Per day to per second.</strong> A day is 86,400 seconds; call it 100,000. 20 million ÷ 100,000 = 200 requests a second on average.</li>
          <li><strong>Plan for the peak.</strong> Traffic isn’t flat; the busiest hour is often 2–5 times the average. At 3 times, that’s 600 a second.</li>
          <li><strong>Requests to CPU.</strong> At 10 ms of CPU per request, one core handles 100 a second. 600 a second keeps 6 cores busy.</li>
          <li><strong>Add headroom.</strong> To peak at 70%, you need 6 ÷ 0.7, about 9 cores. That is two 8-core servers, plus one spare in case one fails.</li>
          <li><strong>Requests in flight.</strong> If each request takes 100 ms end to end, 600 a second × 0.1 s = 60 in flight (Little’s Law). That’s how many workers or connections you need at the peak.</li>
        </ol>
        <p>Now try your own numbers. This counts the app servers’ CPU only; the database has limits of its own.</p>

        <div class="widget" data-widget="capacity"></div>

        <h2>Other quick estimates</h2>
        <ol class="points">
          <li><strong>Storage.</strong> 1 million users × 10 orders a year × 2 KB per order = 20 GB a year. That fits on one disk.</li>
          <li><strong>Bandwidth.</strong> 600 requests a second × 50 KB responses = 30 MB/s, or 240 Mbps. Fine on a 1 Gbps link, as long as the images live on a CDN.</li>
          <li><strong>Memory for workers.</strong> 60 requests in flight with sync workers at about 100 MB each is 6 GB of RAM just for workers. One async process per core could do it in far less.</li>
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
      sub: 'A checklist for any slow system, and what to take with you.',
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
            <tr><td>CPU</td><td><code>top</code> or <code>htop</code>: us + sy, per core</td><td>Load above core count; <code>r</code> in <code>vmstat 1</code>; high <code>st</code> (steal) on cloud VMs</td><td>Rare: machine-check errors in <code>dmesg</code></td></tr>
            <tr><td>Memory</td><td><code>free -h</code>: used vs available</td><td>Swapping: <code>si</code>/<code>so</code> in <code>vmstat 1</code>; GC time</td><td>OOM kills in <code>dmesg</code>, exit code 137</td></tr>
            <tr><td>Disk</td><td><code>iostat -xz 1</code>: %util</td><td><code>aqu-sz</code> and <code>await</code> rising</td><td>Disk full (<code>df -h</code>)</td></tr>
            <tr><td>Network</td><td><code>sar -n DEV 1</code>: bytes per second</td><td>Packets being resent (<code>TcpRetransSegs</code> in <code>nstat</code>)</td><td>Connection errors and timeouts</td></tr>          </tbody>
        </table>

        <h2>Take these with you</h2>
        <ol class="points">
          <li>A server is CPU, memory, disk and network, shared out by the OS as processes and threads. Every bottleneck is one of them, or a queue in front of one.</li>
          <li>Clock speeds stopped growing, so scale comes from parallelism, and whatever can’t run in parallel, such as work under a lock (page 1.2), limits it.</li>
          <li>Memory is nanoseconds, SSDs are microseconds, networks are milliseconds.</li>
          <li>Most web requests spend their time waiting, so concurrency matters more than cores.</li>
          <li>Every network call costs round trips and can fail in ways a function call can’t.</li>
          <li>Response time explodes as utilisation nears 100%. Plan for about 70%.</li>
          <li>Estimate first. One server goes further than you think.</li>
        </ol>`
    }
  ]
};
