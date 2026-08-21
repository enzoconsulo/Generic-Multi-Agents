# ================================================================ PART VII
parte("VII", "Beyond software, and operating it",
      "The same system building artefacts that are not code — and how an operator watches all of "
      "this happen.", cor="2A78D6")

doc.add_heading("21.  The two tracks", level=1)

p("The factory builds any artefact: a presentation, a manual, an analysis of numbers. The axis "
  "separating the two cases is not “is it code?”, but ", depois=2)

rico([("how you prove it is finished", True),
      (". In software the proof comes for free: the program runs, and it either passes or breaks. "
       "Outside software it does not — and that is where the design could degenerate. A verifier "
       "with nothing to execute becomes a second reviewer, and two subjective judgements of the same "
       "artefact are not two gates: they are double the cost.", False)])

figura("fig10-trilhas.png", "Figure 17 — A single field declared in the project picks the entire "
       "cast. Everything in the green band is identical across both tracks.", largura=13.2)

doc.add_heading("22.  The proof ladder", level=1)

p("The non-software track solves the gate problem with three pieces. The first is the ladder below: "
  "every acceptance criterion sits on one of three rungs, and whoever verifies is required to "
  "declare which rung it landed on.")

figura("fig18-escada.png", "Figure 18 — The three rungs. Climbing is always preferable; stepping "
       "down is a recorded decision, not a convenience.", largura=13.8)

p("The other two pieces complete the design:", antes=2, depois=2)

marcador("The first task installs the verifier. ", "Before producing any part of the artefact, the "
         "project delivers a program that knows how to open the generated file and assert facts "
         "about it. Without that, every criterion collapses onto the third rung and the middle gate "
         "stops being worth what it costs.")
marcador("The artefact is generated; the source is versioned. ", "A binary file — presentation, "
         "spreadsheet, image — is never the source of truth. The source is versioned text, and the "
         "binary comes out of a command. Committing the binary as the source would erase the review "
         "gate, because nobody can review the changes inside a binary file.")

caixa("THE LABEL IS WHAT STOPS THE FACTORY FROM LYING TO ITSELF",
      "When many of a project’s criteria fall on the judgement rung, the system is running with one "
      "and a half gates, not two. The mandatory label makes that visible — and visible early, on the "
      "dashboard, instead of discovered late, in a wrong delivery. But it fixes nothing on its own: "
      "an excess of judgement is a sign that planning has to be redone, not that the agent was "
      "careless.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

doc.add_heading("23.  The dashboard", level=1)

p("The dashboard is not decoration: it is the instrument that makes cost visible while it is "
  "happening, rather than afterwards. It runs on the same database and the same event bus the engine "
  "uses — it is not a separate application reading log files.")

figura("fig22-painel.png", "Figure 19 — The dashboard in operation: a task board by state, the "
       "agent’s live console, and the spend for the round.", largura=14.0)

marcador("Every dispatch emits events. ", "Start, end, model, turns, stored and reused tokens, cost "
         "and outcome. The dashboard subscribes to the bus and draws; the accounting does not depend "
         "on anyone remembering to write it down.")
marcador("The screen shows what is still in flight. ", "Because each agent is a process with an "
         "address, listing what is running is a query against the process registry — not an "
         "inference from a log file.")
marcador("Stopping costs one button. ", "Cutting an agent off is terminating a supervised process, "
         "and the supervisor returns the task to the queue. No half-finished work is left behind, and "
         "no file is left edited without an owner.")
marcador("Cost appears per task, not only per run. ", "A cap calibrated on the cost of a single step "
         "underestimates the whole task — and underestimating always pushes the system into starting "
         "work that does not fit the budget.")

doc.add_heading("24.  A project end to end", level=1)

p("It is worth putting everything together in a single pass. The figure below is a real project from "
  "beginning to end: the request, the planning, the first tasks, the parallelism, one rejection and "
  "the rework.")

figura("fig21-projeto.png", "Figure 20 — A project end to end. The green band answers the question "
       "that always comes up: what the user does during all that time.", largura=14.0)

quebra()

# ================================================================ PART VIII
parte("VIII", "The execution plan",
      "In what order to build, what is deliberately left out, what could go wrong, and what all of "
      "this sets out to demonstrate.", cor="184F95")

doc.add_heading("25.  The six phases", level=1)

p("The order is not arbitrary: each phase delivers something verifiable and unlocks the next. And "
  "the milestone that closes each one is always an observable behaviour — never a completion "
  "percentage.")

figura("fig12-fases.png", "Figure 21 — The six phases and the milestones that close them.",
       largura=14.0)

tabela(["Phase", "What it delivers", "Milestone — only passes when"],
       [["*P1  Foundation",
         "project skeleton, database schema, test suite, continuous checks and the fake API client",
         "the whole suite runs without touching the network and without spending a cent"],
        ["*P2  Agent loop",
         "the tool-use loop, sandboxed tool execution, prompt assembly and per-turn accounting",
         "an agent solves a real task, and its cost shows up broken down by turn"],
        ["*P3  State machine",
         "the six states, the two gates, the cycle limit, the failure ladder",
         "a task walks the six states, is rejected on purpose, is reworked and completes"],
        ["*P4  Concurrency",
         "supervision tree, durable queues, spending cap, recovery after a crash",
         "three tasks run in parallel; killing one midway does not affect the others, and it returns "
         "to the queue"],
        ["*P5  Semantic memory",
         "indexing on commit, hybrid search and the context block with its source cited",
         "in a project with history, the agent cites the earlier decision instead of deciding again"],
        ["*P6  Dashboard and generic track",
         "live screen, telemetry, the non-software track and the proof ladder with its mandatory "
         "label",
         "an entire project is planned, built and delivered without intervention"]],
       [2.9, 7.1, 7.4])

rico([("The first phase is the one you feel tempted to skip, and it is the most important. ", True),
      ("Without the fake API client, every run of the test suite costs money and depends on the "
       "network. A suite like that stops being run within weeks — and a system whose suite is not run "
       "cannot be changed safely. All the confidence of the next five phases depends on the first one "
       "having been done properly.", False)], antes=2)

doc.add_heading("26.  Scope", level=1)

p("Delimiting what is left out is part of the project, and it is what keeps a final-year work from "
  "turning into a list of intentions.", depois=3)

tabela(["In scope", "Out of scope, and why"],
       [["Planning, building, verifying, reviewing and documenting projects, with durable state and "
         "accounted cost",
         "publishing what was generated to production: it involves external cost and third-party "
         "credentials; it stays a manual action"],
        ["Execution on a single computer, with real concurrency and supervision",
         "distributing across several computers: possible on the platform, but nothing in the problem "
         "demands it — the bottleneck is waiting on the model"],
        ["A semantic index over the project history, with an evaluation of search quality",
         "training or fine-tuning models: the system is model-independent by design, and that would "
         "destroy the property"],
        ["Accounting per dispatch, task, project and day, with caps that prevent starting what does "
         "not fit",
         "cutting an in-flight agent off for exceeding cost: interrupting midway pays the same and "
         "delivers nothing"],
        ["A local dashboard to follow and trigger the work live",
         "multiple users, authentication and permissions: it is an operating tool for one operator"]],
       [8.4, 9.0])

doc.add_heading("27.  Known risks and limits", level=1)

tabela(["Risk or limit", "Why it exists", "How the design answers"],
       [["*The reuse saving failing to materialise",
         "it depends on the beginning of the request being identical character by character, and a "
         "single volatile character cancels it with no visible error",
         "a test that assembles that beginning twice and compares; the accounting separates what was "
         "stored from what was reused, so an absent saving shows up on day one"],
        ["*Meaning-based search returning a useless snippet",
         "approximate search returns snippets, and a snippet out of context makes the answer worse "
         "rather than better",
         "a set of questions with known answers, measured on every change to the indexing; if it does "
         "not match the baseline, retrieval does not enter the prompt"],
        ["*A single file tree per project",
         "parallel agents in the same project see each other’s uncommitted edits",
         "the declared areas act as mutual exclusion, checked by the system before dispatching — not "
         "entrusted to the text of the dispatch"],
        ["*The middle gate being fragile outside software",
         "with no program to execute, verifying tends to turn into opinion",
         "a mandatory proof-degree label, with the proportion visible on the dashboard; an excess of "
         "judgement is treated as a signal to replan"],
        ["*Elixir’s AI ecosystem being smaller",
         "fewer ready-made libraries and fewer published examples than in Python",
         "the core depends on HTTP and JSON, not on an AI library; the only point that needs the "
         "ecosystem is the embedding, which has a mature path and a service-based alternative"]],
       [3.6, 6.4, 7.4])

doc.add_heading("28.  What this work sets out to demonstrate", level=1)

p("That the difference between a programming assistant and a production line lies entirely in the "
  "governance layer: roles with explicit authority, externalised and transactional state, gates "
  "operated by whoever did not build the thing, failure bounded by design, and deterministic "
  "routing. None of these mechanisms depends on a specific model or on any single vendor’s exclusive "
  "feature — they are all software-architecture decisions applied to a new kind of worker.")

p("And, above all, that those decisions have to live somewhere other than a request written in plain "
  "prose inside a prompt. A rule the system asks for is an optional rule; a rule the structure "
  "guarantees is a property. Every chapter of this document is a version of that same trade: the "
  "separation between building and approving becomes an absent tool; the spending limit becomes a "
  "supervisor; the order of tasks becomes a database column; the project’s memory becomes a "
  "searchable index.", antes=2)

caixa("WHAT REMAINS IF EVERYTHING ELSE CHANGES",
      "Models will get better, get cheaper and change names. The part of this work that does not "
      "depend on that is the structure: small tasks with explicit state, two independent judgements "
      "made by whoever did not build the thing, bounded failure with one attempt at resizing before "
      "giving up, and everything recorded the instant it happens. If tomorrow’s model is ten times "
      "better, that structure remains what turns capability into reliable delivery.")

doc.save(DESTINO)
print("gerado:", DESTINO)
