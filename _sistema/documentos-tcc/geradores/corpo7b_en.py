# ================================================================ PART IV
parte("IV", "The platform",
      "Why Elixir, which tools make up the system, what each one does here, and how all of it is "
      "organised at run time.", cor="1BAF7A")

doc.add_heading("11.  Why Elixir", level=1)

p("The choice of language is not an aesthetic preference: it is the answer to a list of demands the "
  "problem imposes. And the first thing to notice is that ", depois=2)

rico([("the bottleneck of this system is not computation — it is waiting", True),
      (". Each agent spends most of its time awaiting the response of a remote service that may take "
       "minutes, fail midway, or need to be interrupted for exceeding a spending cap. There is no "
       "heavy local computation to do; there are many slow jobs to keep standing at once.", False)])

figura("fig14-beam.png", "Figure 8 — The BEAM is the virtual machine Elixir runs on. Isolation "
       "between processes is the property this system exploits, not an implementation detail.",
       largura=13.8)

p("The figure shows the difference that settles the choice. In an application without isolation the "
  "jobs share one operating-system process: an unhandled error in any of them brings down all of "
  "them. On the BEAM each job is its own process — and “process” here is not the operating system’s: "
  "it weighs a few kilobytes, and keeping thousands of them is routine.", antes=2, depois=3)

tabela(["What the system demands", "What the BEAM delivers"],
       [["dozens of slow jobs at the same time",
         "lightweight processes: keeping thousands of them is routine, not a feat"],
        ["one job failing must not bring down the others",
         "memory isolation: each process falls on its own"],
        ["someone has to notice the failure and react",
         "a supervisor: restarts or returns the task to the queue, unprompted"],
        ["cutting a job off midway, safely",
         "ending a process is a normal operation, not an emergency measure"],
        ["watching all of it live on a screen",
         "the dashboard runs on the same runtime, with no second application"]],
       [7.6, 9.8])

rico([("The decisive argument is a mapping, not a benchmark: ", False),
      ("an agent becomes a supervised process", True),
      (". An agent stops being a loose run that nobody watches and gains an identifier, an owner, "
       "someone who can terminate it and — most importantly — someone who notices when it dies. Rules "
       "that previously had to be requested in writing become properties of the structure.", False)],
     antes=2)

caixa("WHAT THE CHOICE DOES NOT SOLVE",
      "Elixir does not make the model cheaper: the price per token belongs to the provider, and no "
      "supervision tree changes that. And the language’s AI ecosystem is smaller than Python’s — "
      "which weighs little here, because the heavy part of the system is waiting on the network, and "
      "the only genuinely numerical step (turning text into vectors) has a mature library, described "
      "in the next section. Claiming otherwise would be selling the choice for more than it is worth.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

doc.add_heading("12.  The tools, and what each one does", level=1)

p("The system is organised in five layers, and the rule separating them is simple: each one knows "
  "only the layer immediately below. Whoever triggers does not know which agent will run; whoever "
  "decides the order does not write code; whoever writes code does not decide what comes next.")

figura("fig3-camadas.png", "Figure 9 — The five layers and the technology behind each. The state "
       "layer at the bottom is the single source of truth: everything above it can be restarted from "
       "scratch with nothing lost.", largura=14.0)

tabela(["Tool", "What it is", "What it does in this application"],
       [["*Elixir / BEAM", "a functional language and the virtual machine that runs it",
         "runs everything; each in-flight agent is one of its processes"],
        ["*OTP", "the supervised-process library that ships with the language",
         "provides the supervisor, the process registry and each agent’s lifetime cap"],
        ["*Phoenix / LiveView", "a web framework where the screen is updated by the server",
         "the dashboard: task board and live console, with no JavaScript to write"],
        ["*PostgreSQL / Ecto", "a relational database and the library that talks to it",
         "stores tasks, cycles, costs and decisions; every transition is a transaction"],
        ["*Oban", "a job queue that lives inside the database itself",
         "queues what must be done and returns whatever was interrupted"],
        ["*Req", "an HTTP client",
         "talks to the model API, with full control over the request body"],
        ["*Nx / Bumblebee", "numerical computing and ready-made models running on this machine",
         "turns text into vectors, in batches, without calling a paid service"],
        ["*pgvector", "a PostgreSQL extension that stores and compares vectors",
         "the meaning-based search over the project history (Part VI)"],
        ["*ExUnit / Mox", "the testing library and its mocking companion",
         "the suite runs against a fake API client: no network and no cost"]],
       [3.2, 6.4, 7.8])

doc.add_heading("The four choices that need justification", level=2)

p("For the others, the obvious alternative is the one that was chosen. For these four it is not — "
  "so it is worth stating why.", depois=2)

marcador("Oban, and not an in-memory queue. ", "A job held in memory disappears when the program "
         "restarts. Because the queue lives in the same database as the tasks, enqueuing a job and "
         "changing the task state happen in the same transaction: either both hold, or neither does. "
         "That is what prevents the classic state “the task says in progress, but nobody is running "
         "it”.")
marcador("Req, and not a ready-made agent library. ", "High-level libraries for talking to models do "
         "exist, including in Elixir. The core does not use them because it needs to decide, request "
         "by request, exactly which spans of text the provider may reuse — the subject of Part V. "
         "Convenience layers tend to hide precisely that control, and without it the design’s biggest "
         "saving is out of reach.")
marcador("Bumblebee locally, and not an embedding service. ", "Turning text into vectors happens on "
         "every commit, over the project’s entire history. Running on this machine it is CPU work — "
         "which is abundant. Bought per call it would be a recurring cost, and it would send the "
         "project’s content outside.")
marcador("A fake API client in the tests. ", "If the suite calls the real model, every run costs "
         "money and depends on the network. Such a suite stops being run within weeks — and a system "
         "whose suite is not run cannot be changed safely. That is why the double is delivered in the "
         "first phase of the project, not later.")

doc.add_heading("13.  The architecture at run time", level=1)

p("With the vocabulary and the tools in place, the architecture fits in one sentence: every "
  "in-flight task is a supervised process, and its state does not live inside that process — it "
  "lives in the database. The process may die at any instant with nothing lost.")

figura("fig2-supervisao.png", "Figure 10 — The application’s supervision tree. Each box in the "
       "bottom row is a task being worked on right now; the green band lists what the structure "
       "guarantees without relying on anyone’s discipline.", largura=14.0)

p("The loop from figure 3 — the tool-use loop — is what runs inside each of those boxes in the "
  "bottom row. Written as an Elixir process, it looks like this:", antes=2, depois=2)

codigo([
    "def handle_info(:work, state) do",
    "  case Factory.Claude.messages(state.body) do",
    "    {:ok, %{stop_reason: \"tool_use\"} = r} ->",
    "      # tools requested in the same turn are independent: they run in parallel,",
    "      # each in its own process, with its own deadline",
    "      results =",
    "        r.content",
    "        |> Enum.filter(&(&1.type == \"tool_use\"))",
    "        |> Task.async_stream(&Tools.run(&1, state.sandbox),",
    "             max_concurrency: 4, timeout: :timer.minutes(2), on_timeout: :kill_task)",
    "        |> Enum.map(&result_or_error/1)",
    "",
    "      state",
    "      |> append_turn(r.content, results)   # ALL results in a single turn",
    "      |> account_for(r.usage)              # cost and tokens recorded per turn",
    "      |> continue_or_stop()                # turn cap and spending cap",
    "",
    "    {:ok, %{stop_reason: \"end_turn\"} = r} ->",
    "      {:stop, :normal, finish(state, r)}",
    "  end",
    "end",
], "The core of the system. Notice what is NOT here: the turn cap, the spending cap, the deadline "
   "and the restart are not asked of the model — they are the supervisor’s and the process state’s "
   "responsibility. The agent has no way to ignore them.")

doc.add_heading("14.  What the system records", level=1)

p("State has to survive everything: an agent crashing, a session ending, the machine restarting. And "
  "it has to answer questions nobody wants to answer by rereading a conversation.")

figura("fig17-banco.png", "Figure 11 — The main tables. Every row is born inside a transaction: "
       "either all of it lands, or none of it does.", largura=14.0)

p("Two modelling choices deserve highlighting, because they are not obvious:", antes=2, depois=2)

marcador("Cycles are new rows, not overwrites. ", "When a task is reworked, the previous cycle stays "
         "in the database. That makes it possible to ask afterwards how much each cycle cost "
         "separately — and that is how one discovers, in practice, that the cost of a hard task is "
         "concentrated in the rework, not in the first attempt.")
marcador("Cost is recorded per run, not per task. ", "Every turn of the loop records the model, "
         "input tokens, stored tokens, reused tokens, output tokens, cost and duration. A per-task "
         "total is a sum; the other way round — deriving the detail from the total — would be "
         "impossible.")

doc.add_heading("15.  Concurrency: three tasks at once", level=1)

p("With isolated processes and state in the database, running several tasks in parallel stops being "
  "risky. The limit is not technical but about the safety of the work: two tasks in the same project "
  "only run together if the areas they declare do not overlap.")

figura("fig9-paralelismo.png", "Figure 12 — Three independent tasks running at the same time, each "
       "in its own process and at its own pace. The blue band records a catch that naive parallelism "
       "ignores — explained in the next part.", largura=13.8)

caixa("A PARALLELISM RULE THAT LOOKS LIKE A DETAIL AND IS NOT",
      "The verifier needs a quiet project: the full test suite is never run while another agent is "
      "editing the same file tree. The reason is economic, not aesthetic — a false rejection caused "
      "by interference burns one of the three cycles, and makes the system answer failure with a more "
      "expensive model to fix a problem that never existed.")

quebra()

# ================================================================ PART V
parte("V", "The economics of the system",
      "Where the money is actually spent, why intuition gets this wrong, and the five levers the "
      "design uses.", cor="C24E1E")

doc.add_heading("16.  How the money is spent", level=1)

p("Three linked facts explain the cost — and the third is what provides the lever.", depois=2)

marcador("The API has no memory. ", "Every request is independent. If the agent has already "
         "exchanged ten messages, the eleventh has to resend all ten — otherwise the model has no "
         "idea what this is about.")
marcador("So the opening text is re-charged on every turn. ", "The permanent instructions and the "
         "project index always travel with it. In a fifteen-turn dispatch the same text is paid for "
         "fifteen times, without a single comma having changed.")
marcador("The provider lets you store that beginning. ", "If the next request starts with exactly "
         "the same characters, it reuses what it already processed and charges roughly a tenth for "
         "that span.")

p("For the third fact to be usable, the request has to be assembled in a specific order: from the "
  "content that never changes towards the content that always changes.", antes=2)

figura("fig5-cache-v6.png", "Figure 13 — The first four blocks can be stored and reused; the last "
       "one cannot, because it changes on every turn. One altered character in a block invalidates "
       "every block that follows it.", largura=14.0)

caixa("THE ARITHMETIC, IN ROUND NUMBERS",
      "Suppose a fixed opening of 20 thousand tokens (the instructions plus the project index) and a "
      "fifteen-turn dispatch. Without reuse that is 15 × 20 thousand = 300 thousand tokens charged at "
      "full price. With reuse: 20 thousand paid once with a 25% surcharge, plus fourteen turns at a "
      "tenth of the price — the equivalent of about 53 thousand. Roughly one sixth of the bill, for "
      "the same work and with no loss of quality.")

doc.add_heading("17.  The five levers", level=1)

tabela(["Cost lever", "What it is", "Effect"],
       [["*The request always starts identically",
         "instructions, tools and project index identical across dispatches",
         "the repeated span drops to a tenth of the price"],
        ["*Each role gets only what it uses",
         "the builder gets the task’s files; the reviewer gets only the changes",
         "unused context is worse than missing: it is reread every turn"],
        ["*Command checks before the model",
         "criteria that are executable commands run for free, before the dispatch",
         "what fails goes back without paying an agent to confirm the obvious"],
        ["*Model matched to the role",
         "verifying is mechanical and uses the cheap model; rework escalates",
         "the gap between tiers is fivefold on the input price"],
        ["*Batch work",
         "reindexing and documentation do not need an immediate answer",
         "the provider’s asynchronous path charges half for the same work"]],
       [4.0, 6.7, 6.7])

caixa("THE TRAP THAT SILENTLY CANCELS ALL OF THIS",
      "Reuse requires the beginning of the request to be identical character by character from one "
      "time to the next. A date, a counter or a commit hash inside it invalidates everything that "
      "follows — with no error and no warning, only with the saving that never materialises. That is "
      "why the system ships a test that assembles that beginning twice, at different moments, and "
      "fails if the two results diverge.",
      cor="E34948", fundo="FDEDED", cor_titulo=VERMELHO)

doc.add_heading("18.  The context each role receives", level=1)

p("The second lever deserves its own section, because it is the one that most contradicts intuition. "
  "The natural impulse is to give each agent as much information as possible — after all, extra "
  "information does not hurt. Here it does, and the reason is the loop.")

figura("fig20-contexto.png", "Figure 14 — The same beginning for everyone, and after that only what "
       "each role actually uses.", largura=13.8)

rico([("A file the reviewer will never open is not wasted once: ", False),
      ("it is wasted once for every turn of that dispatch", True),
      (". Since the reviewer judges what changed, it receives the changes and not the whole codebase; "
       "since the verifier has to run commands, it receives the criteria and the result of the "
       "mechanical pass already prepared. The information that is surplus in one role is precisely "
       "what is missing in another.", False)])

quebra()

# ================================================================ PART VI
parte("VI", "The project’s memory",
      "How an agent that starts knowing nothing finds out what already exists — and what was "
      "decided, months ago.", cor="4A3AA7")

doc.add_heading("19.  The problem of starting blank", level=1)

p("Every agent starts with no memory of what happened before. That is a property of the tool, not a "
  "limitation to be worked around: each dispatch opens a fresh run.")

p("Letting it discover the project by opening file after file would be the worst possible path, "
  "because every read is a turn of the loop — and turns are exactly what costs. So the system hands "
  "the knowledge over ready-made, in layers.", depois=3)

figura("fig8-memoria.png", "Figure 15 — The system’s five memories, what each one holds and what it "
       "costs to read. None of them is the conversation.", largura=14.0)

doc.add_heading("20.  The two indexes", level=1)

p("The first two rows of that table deserve detail, because they answer different questions — and "
  "confusing them is the most common mistake when people talk about memory for agents.", depois=2)

marcador("“What exists and what is it called?” ", "Answered by a script-generated index: the file "
         "tree with the signature of every function and one line saying what it is for. No model "
         "involved, zero cost, always up to date. It is the project’s table of contents, and it goes "
         "into the prompt in full.")
marcador("“Has this been solved here before, and what was decided then?” ", "That one is not "
         "answered by function name — it is answered by meaning. And that is what the vectors are "
         "for.")

caixa("WHAT A VECTOR IS, IN ONE SENTENCE",
      "A list of numbers representing the meaning of a text, such that texts with close meanings get "
      "close numbers. That is what allows searching by sense instead of by word: searching for “how "
      "do we handle a declined payment” finds a decision written as “when the card network refuses "
      "the transaction”, without a single word in common. The indexed material is not the code — the "
      "generated index already covers that — but the project’s history: decisions with their recorded "
      "rationale, review findings and finished tasks.")

figura("fig7-rag-v6.png", "Figure 16 — Indexing runs on commit, off the working path; retrieval runs "
       "at the start of the dispatch, before spending the first model turn.", largura=14.0)

rico([("Why two searches at once, and not just the meaning-based one? ", True),
      ("Because the vector loses proper nouns: if the question mentions a flag called ", False),
      ("--require", False),
      (", it has no way of knowing what that is — the exact-term search finds it. And the exact-term "
       "search loses synonyms, which the vector finds. Each covers the other’s blind spot; the next "
       "step merges both lists and keeps the best snippets, which enter the prompt with their source "
       "cited.", False)])

p("The concrete gain is that the agent starts the work already knowing “this was decided this way, "
  "for this reason” — instead of deciding again, possibly the opposite of what is already in the "
  "code. It is the direct answer to the second failure mode of Part I: decisions without a trace.",
  antes=2)

caixa("WHEN NOT TO USE IT",
      "Meaning-based search is approximate and returns snippets, not truths. It does not replace the "
      "generated index, which is exact, complete and free, nor does it answer what an ordinary query "
      "answers better: “which tasks are blocked” is a database query, not a natural-language "
      "question. It comes in when the question is about precedent and the exact vocabulary is "
      "unknown. Outside that, it is cost wearing the face of sophistication.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

quebra()
