# ================================================================ COVER
p("Multi-Agent Software Factory", tam=22, cor=AZUL, negrito=True,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=1, espaco=1.0)
p("Complete architecture documentation", tam=12.5, cor=CINZA,
  alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=4, espaco=1.0)

reg = doc.add_paragraph()
reg.paragraph_format.space_after = Pt(7)
borda = OxmlElement("w:pBdr")
bot = OxmlElement("w:bottom")
bot.set(qn("w:val"), "single")
bot.set(qn("w:sz"), "12")
bot.set(qn("w:color"), "2A78D6")
borda.append(bot)
reg._p.get_or_add_pPr().append(borda)

p("Undergraduate Final Project   ·   Enzo Consulo   ·   August 2026", tam=9,
  cor=CINZA, alinhamento=WD_ALIGN_PARAGRAPH.LEFT, depois=7)

caixa("WHAT THIS SYSTEM IS",
      "A system that takes the description of a project in natural language and builds it end to "
      "end. It is not an assistant that answers questions about code: it is a production line in "
      "which specialised agents plan, implement, verify, review and document — each with a defined "
      "role and limited authority. Mandatory human intervention happens exactly once, in the initial "
      "request.")

caixa("HOW TO READ THIS DOCUMENT",
      "It was written to be read from beginning to end by someone who knows none of the technologies "
      "involved. Each part uses only what the previous ones have already explained: the vocabulary "
      "comes before the pieces, the pieces come before the platform, and the subjects usually treated "
      "as advanced — cost, semantic memory, concurrency — only appear once everything they presuppose "
      "has been introduced. Anyone in a hurry can read just the coloured band that opens each part "
      "and the figures: together they tell the whole story.",
      cor="1BAF7A", fundo="E7F7F1", cor_titulo=VERDE)

doc.add_heading("Roadmap", level=1)

tabela(["Part", "What it answers", "Where it lands"],
       [["*I — The problem", "why long work with a language model breaks down",
         "the idea of treating construction as a production line"],
        ["*II — The vocabulary", "what an agent, a tool, a loop, context and a token are",
         "how an agent works, from first step to last"],
        ["*III — The pieces", "what a task is, what the gates are, what happens on failure",
         "the full life of a task, from backlog to delivery"],
        ["*IV — The platform", "why Elixir, which tools, and what each one does",
         "the process tree and what the database keeps"],
        ["*V — The economics", "where the money is spent and how the design cuts the bill",
         "the five cost levers and per-role context"],
        ["*VI — The memory", "how an agent that starts blank knows what was already decided",
         "the two indexes, and when not to use each"],
        ["*VII — Operation", "what happens outside software, and how all of it is watched",
         "a whole project, from request to delivery"],
        ["*VIII — The project", "in what order to build, what is out of scope, what can go wrong",
         "the six phases, the scope and the known limits"]],
       [3.5, 7.4, 6.5])

quebra()

# ================================================================ PART I
parte("I", "The problem, and the idea that answers it",
      "Before any technology: what exactly breaks when you ask a language model to build a whole "
      "system.")

doc.add_heading("1.  Where a language model breaks down", level=1)

p("A language model writes code well when the request is short and everything it needs to know fits "
  "in one conversation. Ask for a function, a query fragment, a fix for an error — the result is "
  "usually good.")

p("Asking it to “build this system” is a different matter. The work runs for hours, spans dozens of "
  "files and depends on decisions made at the start that must still hold at the end. That is the "
  "regime in which it fails — and the point that matters is this: ", depois=2)

rico([("the failures are not failures of writing, they are failures of process", True),
      (". The model keeps writing each isolated fragment well; what is lost is the coherence of the "
       "whole. Four failure modes show up every time, and none of them is solved by a better model:",
       False)], depois=2)

marcador("Context loss. ", "The conversation grows, the beginning drifts out of view, and the model "
         "starts contradicting what it itself decided two hours earlier: the start of the "
         "conversation competes for room with everything that came after it.")
marcador("Decisions without a trace. ", "The reason behind a choice — “we use this because that "
         "does not work here” — stayed in the dialogue, and goes with it when the session ends. "
         "A week later the same decision is made again, sometimes the opposite way.")
marcador("Self-approval. ", "Whoever wrote the code is the one declaring it finished. And whoever "
         "wrote it rarely rejects it: the same reasoning that produced the mistake is the one sent "
         "to look for it.")
marcador("Unbounded retrying. ", "One hard point consumes attempt after attempt. With no explicit "
         "limit it blocks everything queued behind it — and the cost grows while nothing advances.")

doc.add_heading("2.  The proposal: construction as a production line", level=1)

p("The answer taken by this work is not to ask for the whole system at once. Instead: split the "
  "request into small, named tasks, give each an explicit state that is recorded outside the "
  "conversation, and put every delivery through reviewers that did not build it.")

p("The model remains the worker — it is the one writing the code. The system around it decides what "
  "it does, when it does it, with what information and with what authority.", depois=3)

figura("fig1-fluxo.png", "Figure 1 — From request to delivery. The only mandatory human intervention "
       "is the first box; from there on the system decides on its own. The two grey bands at the "
       "bottom are what holds it all up, and they appear in detail in Part IV.")

passos([
    ("1", "Request", "The user describes what they want, once, in natural language."),
    ("2", "Planning", "An agent produces the specification, a phased plan and 8 to 20 tasks with "
                      "declared dependencies."),
    ("3", "Building", "Each task is implemented by an agent specialised in that area of the "
                      "project."),
    ("4", "Two gates", "One verifies that it works; the other reviews whether it is what was asked. "
                       "Neither may fix anything."),
    ("5", "Delivery", "A finished task becomes its own commit, and the system moves to the next."),
])

doc.add_heading("3.  The three rules that govern everything", level=1)

p("All the rest of this document follows from three decisions. They reappear in every part, applied "
  "to a different problem each time.", depois=2)

marcador("Whoever implements is never whoever approves. ", "Verifier and reviewer have no permission "
         "to fix: they reject and send back. This is not a recommendation about conduct — in Part II "
         "we will see that the tool to write does not even exist for them.")
marcador("State outside the conversation. ", "Every decision, every result and every cost is "
         "recorded the moment it happens. If everything crashes now, the next run rebuilds the world "
         "by reading the database and the version history — never by rereading a dialogue.")
marcador("Bounded failure. ", "Three cycles per task. Beyond that, the system tries to resize the "
         "task once; if it still fails, the task is blocked and reported, and the queue moves on. A "
         "hard task never blocks the whole line.")

caixa("THE THESIS, IN ONE SENTENCE",
      "The bottleneck of a system like this is not text generation, it is governance. A capable model "
      "produces good code; what decides whether the whole thing works is who commands it, within "
      "what limits, and what happens when something goes wrong. This work is about that layer.")

quebra()

# ================================================================ PART II
parte("II", "The vocabulary, and how an agent works",
      "Six terms and one mechanism. After this part you can follow every technical decision in the "
      "rest of the document.", cor="4A3AA7")

doc.add_heading("4.  The terms the rest of this document uses", level=1)

p("None of this is jargon for its own sake: every term below comes back, and three of them decide "
  "the cost of the entire system.", depois=3)

tabela(["Term", "What it means in this document"],
       [["*Language model",
         "the worker: it takes text and returns text or requests for action. It keeps no memory "
         "between one run and the next"],
        ["*Tool",
         "an action the model can ask to have performed: read a file, run a test, write code, search "
         "the web"],
        ["*Agent",
         "a role: the text defining what it does, the list of tools it may use and the model that "
         "runs it"],
        ["*Tool-use loop",
         "the cycle question → tool request → result, repeated until the model says it is done"],
        ["*Context",
         "everything that goes into one request to the model. It is resent in full on every turn of "
         "the loop"],
        ["*Token",
         "the unit the model is billed in, for input and output alike. Roughly a piece of a word"],
        ["*Prefix",
         "the beginning of the request — the part that repeats identically from turn to turn "
         "(Part V)"],
        ["*Reuse",
         "a provider feature: storing the already-processed prefix and charging a tenth to reuse it "
         "(Part V)"],
        ["*Vector (embedding)",
         "a list of numbers representing the meaning of a text: similar texts get similar numbers "
         "(Part VI)"]],
       [3.4, 14.0])

doc.add_heading("5.  What an agent is", level=1)

p("An agent is neither a program nor a service. It is a role written in plain text, plus two things "
  "that bound it: the tools that exist for it and the model that runs it.")

figura("fig13-agente.png", "Figure 2 — The anatomy of an agent. Changing the role text changes the "
       "behaviour; removing a tool removes the capability, not merely the permission.", largura=13.8)

rico([("The third line of the figure is the one that usually goes unnoticed and matters most: ",
       False),
      ("the reviewer is not given the tool to write", True),
      (". The rule “the reviewer does not fix what it finds” stops being an instruction the model "
       "might misread and becomes an impossibility — it has no way to write, because the action is "
       "not on its list. It is the principle of least privilege applied to agents.", False)])

p("The generic roles — planner, builder, verifier, reviewer — serve any project. There is also a "
  "second kind of agent, tailored to each project; it appears in section 10.", antes=2)

doc.add_heading("6.  How an agent works: the loop", level=1)

p("A running agent is a loop, and understanding that loop is understanding the whole system — "
  "including the cost side of it. The cycle is always the same:")

marcador("The system assembles the request ", "and sends it: the available tools, the permanent "
         "instructions and the entire conversation history so far.")
marcador("The model answers ", "in one of two ways: asking for one or more tools to be used, or "
         "saying it is done.")
marcador("If it asked for tools, ", "the system actually runs them — reads the file, runs the test — "
         "and returns the results in a single message.")
marcador("The loop starts again, ", "now with one more turn of history. It ends only when the model "
         "says it is done, or when it hits a cap imposed from outside.")

figura("fig4-laco.png", "Figure 3 — The tool-use loop. The tools requested in the same turn run in "
       "parallel, and the results always return in a single message — splitting them teaches the "
       "model to stop requesting tools in parallel.", largura=13.6)

rico([("One property of this loop drives the entire design of the system: ", False),
      ("cost is not proportional to the amount of code, but to the number of round trips to the "
       "model", True),
      (". Because every turn resends the whole accumulated history, a late turn costs more than an "
       "early one. An agent that solves the task in eight turns costs far less than one that takes "
       "twenty — even writing exactly the same file at the end.", False)])

p("That is why the system invests so much in giving the agent a good starting point instead of "
  "letting it discover the project on its own, opening file after file. Part VI is entirely about "
  "that; Part V shows the arithmetic.", antes=2)

quebra()

# ================================================================ PART III
parte("III", "The pieces of the system",
      "The task, the two gates, what happens when something fails, and the team that is born with "
      "each project.", cor="EB6834")

doc.add_heading("7.  The task: the unit of work", level=1)

p("If the whole request were handed to one agent we would be back at the problem of Part I. That is "
  "why planning breaks the request into tasks — and the task is the central piece of the system, "
  "because it is what carries the state.")

figura("fig15-tarefa.png", "Figure 4 — The anatomy of a task. On the right, the problem each field "
       "solves: none of them is there as bureaucracy.", largura=13.8)

p("It is worth noting what the figure shows on the right. The fields do not describe the task for "
  "the sake of describing it — each one exists to make automatic a decision someone would otherwise "
  "have to make on the spot:", antes=2, depois=2)

marcador("Dependencies settle the order. ", "A task becomes available only when all of its "
         "dependencies are done. Nobody has to decide “what comes next”: the queue orders itself.")
marcador("Areas settle parallelism. ", "Two tasks in the same project may only run at the same time "
         "if the areas they declare do not overlap. That is what prevents two agents from editing the "
         "same file without knowing about each other.")
marcador("Attempts settle the response to failure. ", "How many times the task came back rejected is "
         "what decides the next step — and that is the subject of section 9.")
marcador("Separate sections settle the separation of roles. ", "The builder writes in the execution "
         "notes; the gates write in the verification and review sections. Nobody writes in anyone "
         "else’s section.")

caixa("WHY TASKS OF THIRTY TO NINETY MINUTES",
      "It is the range where the two wastes balance out. Too large a task makes the agent lose the "
      "thread — and when it fails, it throws away a lot of work at once. Too small a task makes the "
      "cost of explaining the context (paid in full on every dispatch) dominate the cost of doing the "
      "work. The planner is instructed to split anything beyond that.")

doc.add_heading("8.  The two gates", level=1)

p("Every delivery goes through two independent judgements, made by agents that did not build it. "
  "They are not two levels of care: they are two different questions.")

figura("fig16-portoes.png", "Figure 5 — The two gates. The purple band explains why one more careful "
       "gate would not be enough.", largura=13.8)

rico([("The subtle point of the design is in the bottom band of the figure, and it bears repeating: ",
       False),
      ("a delivery can pass every criterion, carry no defect at all and still not be the task", True),
      (". That happens when the criterion was written badly — and a loose criterion is no licence to "
       "deliver something else. Rejecting for non-conformance requires finding no bug at all.",
       False)])

p("Hence the requirement about how acceptance criteria are written: they take the form “command + "
  "expected result”, never the form of an evaluative sentence. “The API works” is not a criterion; "
  "“calling /users returns 200 with a JSON list” is. The difference shows up in Part VII, when the "
  "system has to do this outside software.", antes=2)

doc.add_heading("9.  What happens when a task fails", level=1)

p("Rejection is not the end of the line. The system answers failure in steps, and each step is only "
  "used after the previous one has genuinely failed — the trigger is always a recorded fact, never a "
  "guess about difficulty.")

figura("fig6-estados.png", "Figure 6 — The six states of a task. The two red arrows going back are "
       "the gates rejecting. Once the three cycles are exhausted there are two exits — and the first "
       "one is not giving up.", largura=13.8)

marcador("1st rejection — escalate the model. ", "The task goes back to the builder, now run by a "
         "more capable model. Insisting on the same model after a rejection pays for the whole cycle "
         "again and burns one of the three attempts.")
marcador("2nd rejection under the same specialist — swap the specialist. ", "It was chosen during "
         "planning, before anyone knew where the task would fail; repeating is betting twice on the "
         "same guess.")
marcador("3 cycles exhausted — replanning. ", "The planner re-examines the task and splits it into "
         "two or three smaller ones, which enter the queue as brand-new tasks. The original is "
         "cancelled, with a reference to its replacements. It is the acknowledgement that the problem "
         "may not be one of execution, but of sizing.")
marcador("Exhausted again — now it blocks. ", "A task already born from a replanning that fails once "
         "more is reported to the user. The system does not replan a replanning: if the problem "
         "survived two different readings, it needs a human decision.")

rico([("Every state transition is a transaction", True),
      (": the new state, the stage report and the cost of that dispatch enter together, or not at "
       "all. There is no task that changed state without recording why, nor money spent that is not "
       "tied to a result.", False)], antes=2)

doc.add_heading("10.  The team born with the project", level=1)

p("Here lies what is probably the system’s most distinctive piece. The factory has no generic "
  "programmer waiting for tasks in the queue: while planning, it synthesises a team from the request "
  "itself.")

figura("fig19-equipe.png", "Figure 7 — From request to team. Every task is born pointing at the "
       "specialist for the area it touches.", largura=13.8)

p("Each specialist’s prompt is deliberately short. It does not repeat the execution discipline — "
  "read the whole task, fix first what was flagged, record what you did, commit — because that "
  "already comes from the generic builder role. It carries only the domain: which files are its own, "
  "which decisions are already settled, and which traps in that area have already cost dearly.",
  antes=2)

caixa("THE ONE DELIBERATE RENUNCIATION",
      "Specialisation is abandoned in exactly one case, and it is planned: when the same task is "
      "rejected twice under the same specialist, the system switches to a more capable generic "
      "builder and records the switch. The specialist was chosen during planning, before anyone knew "
      "where the task would fail — two consecutive rejections under the same domain prompt are "
      "evidence that the specialisation is biasing the attack on the problem.",
      cor="4A3AA7", fundo="EDEDF8", cor_titulo=ROXO)

quebra()
