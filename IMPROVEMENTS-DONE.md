# Zero to a Million Users: improvements done

Items from [IMPROVEMENTS.md](IMPROVEMENTS.md) move here once they're fixed and live. Newest last.

| ID | Priority | What was wrong | What changed | Where to see it | Commit |
|---|---|---|---|---|---|
| K1 | P1 | A stray "00" on all five code panels, because the cheat sheet's pattern counter used the same class, `.cp-head` | The cheat sheet's three `.cp-head` rules now start with `.cs-patterns` ([style.css](zero-to-million/css/style.css)) | [Page 1.1](https://sk2111.github.io/zero-to-million/#/1/cpu), under "From one line of Python to CPU instructions" | `fd186c5` |
| 3-3 | P1 | `round(mean_exec_time, 2)` fails in PostgreSQL: there is no `round(double precision, integer)` | Both queries use `round(mean_exec_time::numeric, 2)` | [Page 3.3](https://sk2111.github.io/zero-to-million/#/3/round-trips) and [page 5.1](https://sk2111.github.io/zero-to-million/#/5/database-runs-hot): the `tomazon=> SELECT` line | `dd9534d` |
| S7 | P1 | "The scripts weren't what slowed Europe down": no chapter mentions scripts | "Faster servers wouldn't have fixed Europe", which chapter 11 shows | [Page 14.2](https://sk2111.github.io/zero-to-million/#/14/takeaways), the takeaway "Don't optimise blindly" | `bf69f21` |
| 3-2 | P1 | "Twenty small queries add about 10–20 ms", but 20 × 0.2–0.5 ms is 4–10 ms | Page 3.3 says 4–10 ms; the cheat sheet says "up to 10 ms" (part of C3) | [Page 3.3](https://sk2111.github.io/zero-to-million/#/3/round-trips), first bullets; the [cheat sheet](https://sk2111.github.io/zero-to-million/#/cheatsheet), "Numbers to do it with" | `4c3cdd8` |
| 5-1 | P1 | The primary's URL used port 5432, bypassing PgBouncer; since 4.4 the security group allows only 6432 | `app@10.0.2.14:6432`. The replica line is unchanged (that's 5-2) | [Page 5.2](https://sk2111.github.io/zero-to-million/#/5/read-replicas): `primary = create_engine(…)` | `a9bceb4` |
| UX1 | P1 | In dark mode, the grey and empty memory-bar labels were dark on dark (1.9:1 and 1.0:1) | `.b-os` and `.b-free` labels use `--ink`: now 8.7:1 and 16:1; light mode unchanged | Dark mode, [page 2.5](https://sk2111.github.io/zero-to-million/#/2/first-architecture) "Will it fit in 512 MB?" and [page 3.1](https://sk2111.github.io/zero-to-million/#/3/one-thousand-users) | `60060a0` |
