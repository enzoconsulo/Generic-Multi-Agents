# ================================================================ COVER
p("Multi-Agent Software Factory", tam=20, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Architecture of a system that builds software using language agents",
  tam=11, cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=4, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(6)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Undergraduate Final Project   ·   Enzo Consulo   ·   August 2026", tam=8.8,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=6)

caixa("WHAT THIS DOCUMENT PRESENTS",
      "The architecture of a system that takes the description of a project in natural language and "
      "builds it end to end, coordinating specialised agents that plan, implement, verify, review and "
      "document — with human intervention only in the initial request. The text starts from the "
      "minimum vocabulary, explains why the chosen language is Elixir, details the tools involved and "
      "ends with the execution plan. A prototype of this architecture has already been built and has "
      "run real projects; what is described here is the system itself, and every section can be read "
      "with no prior knowledge of it.")

# ================================================================ 1
doc.add_heading("1.  The problem", level=1)

p("A language model writes code well when the request is short and everything it needs to know fits "
  "in one conversation. Asking it to “build this system” is a different matter: the work runs for "
  "hours, spans dozens of files and depends on decisions made at the start that must still hold at "
  "the end. That is the regime in which it fails — and the failures are not failures of writing, "
  "they are failures of process.")

marcador("Context loss. ", "The conversation grows, the beginning drifts out of view, and the model "
         "starts contradicting what it decided itself.")
marcador("Decisions without a trace. ", "The reason behind a choice stayed in the middle of the "
         "dialogue; when the session ends, it vanishes with it.")
marcador("Self-approval. ", "Whoever wrote the code is the one declaring it finished — and rarely "
         "rejects their own work.")
marcador("Unbounded retrying. ", "One hard point consumes attempt after attempt and blocks "
         "everything queued behind it.")

p("The proposal of this work is to treat software construction as a production line: split the "
  "request into small, named tasks, give each an explicit state, and put every delivery through "
  "reviewers that did not build it. The model remains the worker; the system decides what it does, "
  "when, and with what authority.", antes=2)

figura("fig1-fluxo.png", "Figure 1 — From request to delivery. The only mandatory human intervention "
       "is the first box; from there on the system decides on its own.")

passos([
    ("1", "Request", "The user describes what they want, once, in natural language."),
    ("2", "Planning", "An agent produces the specification, a phased plan and 8 to 20 tasks with "
                      "dependencies."),
    ("3", "Building", "Each task is implemented by an agent specialised in that area."),
    ("4", "Two gates", "One verifies that it works; the other reviews whether it is what was asked. "
                       "Neither may fix anything."),
    ("5", "Delivery", "A finished task becomes its own commit, and the system moves to the next."),
])

# ================================================================ 2
doc.add_heading("2.  The minimum vocabulary", level=1)

p("Nine terms carry the rest of this document: the first three say who works, the next three explain "
  "how the work is billed, and the last three only reappear in sections 8 and 9 — but they are "
  "defined here so that those pages depend on no new word.", depois=3)

tabela(["Term", "What it means here"],
       [["*Language model",
         "the worker: it takes text and returns text or requests for action; it remembers nothing "
         "between one run and the next"],
        ["*Tool",
         "an action the model can ask to have performed: read a file, run a test, write code"],
        ["*Agent",
         "a role — the text defining what it does, the tools it may use and the model that runs it"],
        ["*Tool-use loop",
         "the cycle question → tool request → result, repeated until the model says it is done"],
        ["*Context",
         "everything that goes into one request to the model; it is resent in full on every turn of "
         "the loop"],
        ["*Token",
         "the unit the model is billed in, both for what goes in and for what comes out"],
        ["*Prefix",
         "the beginning of the request — the part that repeats identically from one turn to the next"],
        ["*Reuse",
         "a provider feature: storing the already-processed prefix and charging a tenth to reuse it "
         "(section 8)"],
        ["*Vector (embedding)",
         "a list of numbers representing the meaning of a text: similar texts get similar numbers "
         "(section 9)"]],
       [3.4, 14.0])

figura("fig13-agente.png", "Figure 2 — The anatomy of an agent. Changing the role text changes the "
       "behaviour; removing a tool removes the capability.", largura=13.6)

rico([("The roles above are generic — the planner, the builder, the verifier, the reviewer — and "
       "serve any project. There is a second kind of agent, and it is probably the system’s most "
       "distinctive part: ", False),
      ("while planning, the system synthesises two to five specialists from the request itself", True),
      (" — one for the database, one for the interface, one for the business rules —, each with its "
       "own domain, its own files and the decisions it may not reinvent. Every task is born pointing "
       "at the specialist for the area it touches, so execution is guided from the start rather than "
       "improvised the moment work begins.", False)])

# ================================================================ 3
doc.add_heading("3.  How an agent works", level=1)

p("A running agent is a loop. It assembles the request, calls the model API and looks at why it "
  "stopped: if the model asked for tools, the system runs them and returns the results; if it "
  "finished, the loop ends. Every turn is a paid request — and since the context is resent in full, "
  "a late turn costs more than an early one.")

figura("fig4-laco.png", "Figure 3 — The tool-use loop. Results always come back in a single message, "
       "and the tools requested in the same turn are executed in parallel.", largura=13.6)

rico([("From that comes a property that drives the entire design: ", False),
      ("cost is not proportional to the amount of code, but to the number of round trips to the "
       "model", True),
      (". An agent that solves the task in eight turns costs far less than one that takes twenty — "
       "even if it writes exactly the same file at the end. That is why the system invests in giving "
       "the agent a good starting point instead of letting it discover the project on its own.",
       False)])

# ================================================================ 4
doc.add_heading("4.  Why Elixir", level=1)

p("The bottleneck of this system is not computation: it is waiting. Each agent spends most of its "
  "time awaiting the response of a remote service that may take minutes, fail midway, or need to be "
  "cut off for exceeding a spending cap. The language therefore has to keep dozens of such jobs in "
  "flight at once, isolate the failure of each, and allow any of them to be terminated safely.")

figura("fig14-beam.png", "Figure 4 — The BEAM is the virtual machine Elixir runs on. Isolation "
       "between processes is the property this system exploits, not an implementation detail.",
       largura=13.8)

tabela(["What the system demands", "What the BEAM delivers"],
       [["dozens of slow jobs at the same time",
         "lightweight processes: keeping thousands of them is routine"],
        ["one job failing must not bring down the others",
         "memory isolation: each process falls on its own"],
        ["someone has to notice the failure and react",
         "a supervisor: restarts or returns the task to the queue, unprompted"],
        ["cutting a job off midway, safely",
         "ending a process is a normal operation, not an emergency measure"],
        ["watching all of it live on a screen",
         "the dashboard runs on the same runtime, with no second application"]],
       [7.6, 9.8])

caixa("WHAT THE CHOICE DOES NOT SOLVE",
      "Elixir does not make the model cheaper: the price per token belongs to the provider, and no "
      "supervision tree changes that. And the language’s AI ecosystem is smaller than Python’s — "
      "which weighs little here, because the heavy part of the system is waiting on the network, and "
      "the only genuinely numerical step (turning text into vectors) has a mature library, described "
      "in section 5.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

# ================================================================ 5
doc.add_heading("5.  The tools, and what each one does", level=1)

p("The system is organised in five layers, and each one knows only the layer immediately below: "
  "whoever triggers does not know which agent will run; whoever decides the order does not write "
  "code; whoever writes code does not decide what comes next.")

figura("fig3-camadas.png", "Figure 5 — The five layers and the technology behind each. The state "
       "layer at the bottom is the single source of truth: everything above it can be restarted with "
       "nothing lost.", largura=14.0)

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
         "the meaning-based search over the project history (section 9)"],
        ["*ExUnit / Mox", "the testing library and its mocking companion",
         "the suite runs against a fake API client: no network and no cost"]],
       [3.2, 6.4, 7.8])

p("Four of these choices deserve justification, because the obvious alternative would be a different "
  "one:", antes=2, depois=2)

marcador("Oban, and not an in-memory queue. ", "A job held in memory disappears when the program "
         "restarts. Because the queue lives in the same database as the tasks, enqueuing a job and "
         "changing the task state happen in the same transaction — either both hold, or neither does.")
marcador("Req, and not a ready-made agent library. ", "The system needs to decide, request by "
         "request, which spans of text the provider may reuse (section 8). Convenience layers tend to "
         "hide exactly that control.")
marcador("Bumblebee locally, and not an embedding service. ", "Turning text into vectors happens on "
         "every commit, over the whole project. Running on this machine it is CPU work; bought per "
         "call it would be a recurring cost — and it would send the project’s content outside.")
marcador("A fake API client in the tests. ", "If the suite calls the real model, every run costs "
         "money and depends on the network. Such a suite stops being run, and a system whose suite is "
         "not run cannot be changed safely.")

# ================================================================ 6
doc.add_heading("6.  The architecture at run time", level=1)

p("With the vocabulary and the tools in place, the architecture fits in one sentence: every "
  "in-flight task is a supervised process, and its state does not live inside that process — it "
  "lives in the database. The process may die at any instant with nothing lost.")

figura("fig2-supervisao.png", "Figure 6 — The application’s supervision tree. Each box in the bottom "
       "row is a task being worked on right now; the green band lists what the structure guarantees "
       "without relying on anyone’s discipline.", largura=14.0)

codigo([
    "def handle_info(:work, state) do",
    "  case Factory.Claude.messages(state.body) do",
    "    {:ok, %{stop_reason: \"tool_use\"} = r} ->",
    "      # tools requested in the same turn are independent: they run in parallel",
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
], "The loop of figure 3, written as an Elixir process. What is not here — the turn cap, the "
   "spending cap, the deadline and the restart — is not asked of the model: it is the supervisor’s "
   "responsibility.")

# ================================================================ 7
doc.add_heading("7.  The life of a task", level=1)

figura("fig6-estados.png", "Figure 7 — The six states of a task. The two red arrows going back are "
       "the gates rejecting. Once the three cycles are exhausted there are two exits — and the first "
       "one is not giving up: the task is split into smaller ones and returns to the queue.",
       largura=13.8)

rico([("The verifier asks “does it work?”", True),
      (" and literally runs every acceptance criterion, recording the evidence. That is why criteria "
       "are written as command plus expected result, never as an evaluative sentence.", False)],
     depois=2)
rico([("The reviewer asks “is this what was asked, and is it correct?”", True),
      (" — two distinct checks. And here is the subtle point of the design: ", False),
      ("a delivery can pass every criterion, carry no defect at all and still not be the task", True),
      (". A badly written criterion is no licence to deliver something else.", False)])

p("Rejection is not the end of the line. The system answers failure in steps, and each step is only "
  "used after the previous one has genuinely failed — the trigger is always a recorded fact, never a "
  "guess about difficulty:", antes=2, depois=2)

marcador("1st rejection — escalate the model. ", "The task returns to the builder, now run by a more "
         "capable model. Insisting on the same model after a rejection pays for the whole cycle again "
         "and burns one of the three attempts.")
marcador("2nd rejection under the same specialist — swap the specialist. ", "It was chosen during "
         "planning, before anyone knew where the task would fail; repeating is betting twice on the "
         "same guess.")
marcador("3 cycles exhausted — replanning. ", "The planner re-examines the task and splits it into "
         "two or three smaller ones, which enter the queue as brand-new tasks. The original is "
         "cancelled, with a reference to its replacements. It is the acknowledgement that the problem "
         "may not be one of execution, but of sizing.")
marcador("Exhausted again — now it blocks. ", "A task that was already born from a replanning and "
         "fails once more is reported to the user. The system does not replan a replanning: if the "
         "problem survived two different readings, it needs a human decision.")

rico([("Every transition is a transaction", True),
      (": the new state, the stage report and the cost enter together, or not at all. That is what "
       "makes it possible to ask afterwards how much each cycle cost separately.", False)], antes=2)

p("The same structure builds presentations, documents and analyses. What separates the two cases is "
  "not “is it code?”, but how one proves it is finished: in software the proof comes for free — the "
  "program runs and passes or breaks. Outside it, the first task becomes installing a verifier, and "
  "each criterion is labelled with the level of proof that backed it: executed by a command, "
  "inspected by a script, or judged against objective items.")

# ================================================================ 8
doc.add_heading("8.  Cost, and how it is controlled", level=1)

p("Three linked facts explain the system’s cost — and the third is what provides the lever.",
  depois=2)

marcador("The API has no memory. ", "Every request is independent. If the agent has already "
         "exchanged ten messages, the eleventh has to resend all ten — otherwise the model has no "
         "idea what this is about.")
marcador("So the opening text is re-charged on every turn. ", "The system rules and the project "
         "index always travel with it. In a fifteen-turn dispatch, the same text is paid for fifteen "
         "times.")
marcador("The provider lets you store that beginning. ", "If the next request starts with exactly "
         "the same characters, it reuses what it already processed and charges roughly a tenth for "
         "that span.")

p("For that to work, the request is assembled from the content that never changes towards the "
  "content that always changes. That order is what the figure below shows.", antes=2)

figura("fig5-cache-v6.png", "Figure 8 — The first four blocks can be stored and reused; the last one "
       "cannot, because it changes on every turn. One altered character in a block invalidates every "
       "block that follows it.", largura=14.0)

caixa("THE ARITHMETIC, IN ROUND NUMBERS",
      "Suppose a fixed opening of 20 thousand tokens (the rules plus the project index) and a "
      "fifteen-turn dispatch. Without reuse that is 15 × 20 thousand = 300 thousand tokens charged at "
      "full price. With reuse: 20 thousand paid once with a 25% surcharge, plus fourteen turns at a "
      "tenth of the price — the equivalent of about 53 thousand. Roughly one sixth of the bill, for "
      "the same work.")

tabela(["Cost lever", "Effect"],
       [["The request always starts identically", "the repeated span drops to a tenth of the price"],
        ["Each role gets only what it uses", "the reviewer gets the changes, not the whole codebase"],
        ["Command checks before the model", "whatever fails goes back without spending an agent"],
        ["Model matched to the role", "verifying is mechanical and uses the cheapest model"],
        ["Batch work", "half price whenever the answer is not urgent"]],
       [6.2, 11.2])

caixa("THE TRAP THAT SILENTLY CANCELS ALL OF THIS",
      "Reuse requires the beginning of the request to be identical character by character from one "
      "time to the next. A date, a counter or a commit hash inside it invalidates everything that "
      "follows — with no error and no warning, only with the saving that never materialises. That is "
      "why the system ships a test that assembles that beginning twice and fails if the two results "
      "diverge.",
      cor="E34948", fundo="FDEDED", cor_titulo=VERMELHO)

# ================================================================ 9
doc.add_heading("9.  The project’s memory", level=1)

p("An agent always starts knowing nothing about the project. Letting it open file after file until "
  "it understands would be the worst possible path, because every read is a turn — and turns are "
  "exactly what costs. So the system hands the knowledge over ready-made, in two layers, because "
  "there are two different questions.")

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

figura("fig7-rag-v6.png", "Figure 9 — Indexing runs on commit, off the working path; retrieval runs "
       "at the start of the dispatch, before spending the first model turn.", largura=13.8)

rico([("Why two searches at once, and not just the meaning-based one? ", True),
      ("Because the vector loses proper nouns: if the question mentions a flag called ", False),
      ("--require", False),
      (", it has no way of knowing what that is — the exact-term search finds it. And the exact-term "
       "search loses synonyms, which the vector finds. Each covers the other’s blind spot; the next "
       "step merges both lists and keeps the best snippets, which enter the prompt with their source "
       "cited.", False)])

caixa("WHEN NOT TO USE IT",
      "Meaning-based search is approximate and returns snippets, not truths. It does not replace the "
      "generated index, which is exact and free, nor does it answer what an ordinary query answers "
      "better: “which tasks are blocked” is a database query, not a natural-language question. It "
      "comes in when the question is about precedent and the exact vocabulary is unknown.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

# ================================================================ 10
doc.add_heading("10.  Execution plan, scope and limits", level=1)

figura("fig12-fases.png", "Figure 10 — The six phases and the milestones that close them. A "
       "milestone is always an observable behaviour, never a percentage of completion.", largura=14.0)

p("The order is not arbitrary: each phase delivers something verifiable and unlocks the next. The "
  "first is the one you feel like skipping, and it is the most important — it is what makes all the "
  "others testable.", depois=3)

tabela(["In scope", "Out of scope, and why"],
       [["Planning, building, verifying, reviewing and documenting projects",
         "deploying to production: external cost and third-party credentials"],
        ["Running on a single machine, with concurrency and supervision",
         "distributing across machines: the bottleneck is waiting on the model"],
        ["Semantic index of the history, with retrieval evaluation",
         "training models: it would destroy vendor independence"],
        ["A local dashboard to follow and trigger the work",
         "multiple users and authentication: this is a single operator’s tool"]],
       [8.7, 8.7])

doc.add_heading("Known limits of the design", level=2)

tabela(["Limit", "How the design answers it"],
       [["The reuse gain may not materialise",
         "a test that assembles the prefix twice and compares it byte by byte"],
        ["Meaning-based search may return useless snippets",
         "a set of questions with known answers, measured on every change"],
        ["A single file tree per project",
         "the areas each task declares become mutual exclusion checked by the system"],
        ["The middle gate is fragile outside software",
         "a mandatory proof level, with the proportion visible on the dashboard"]],
       [6.2, 11.2])

rico([("What this work sets out to demonstrate: ", True),
      ("that the difference between a coding assistant and a production line lies entirely in the "
       "governance layer — roles with explicit authority, transactional state, gates operated by "
       "whoever did not build, and failure bounded by design. None of it depends on a specific model "
       "or a specific vendor.", False)])

doc.save(DESTINO)
print("gerado:", DESTINO)
