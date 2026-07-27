import { agenteAtivo, atividadePorAgente } from "../../lib/atividade";
import type { EquipeProjeto, Job, LinhaLog, TarefaCompleta } from "../../lib/tipos";

/**
 * Equipe ao vivo (T-023): quem está trabalhando AGORA e o que cada especialista fez.
 *
 * Junta três fontes que antes só existiam separadas e em texto:
 *  - `_gestao/equipe.json` (os especialistas que o planejador sintetizou p/ este projeto);
 *  - o campo `agente:` das tarefas (quem é dono de quê);
 *  - o log ao vivo, de onde sai o despacho real (`Agent → domain`).
 *
 * Testador e revisor NÃO estão no equipe.json (são fixos da fábrica), mas APARECEM no log
 * — então entram como membros fixos, senão a visão mentiria sobre quem trabalhou.
 */

/** Papéis fixos da fábrica: existem em todo projeto, fora do equipe.json. */
const FIXOS: Record<string, { nome: string; descricao: string }> = {
  executor: {
    nome: "Executor",
    descricao: "Construtor genérico — pega as tarefas sem especialista designado.",
  },
  testador: {
    nome: "Testador",
    descricao: "Roda os critérios de aceite de verdade, executando o software.",
  },
  revisor: {
    nome: "Revisor",
    descricao: "Caça bugs no diff da tarefa antes de dar por concluída.",
  },
  planejador: {
    nome: "Planejador",
    descricao: "Transforma o pedido em especificação, plano e tarefas.",
  },
  documentador: { nome: "Documentador", descricao: "Mantém README e docs em dia." },
  pesquisador: { nome: "Pesquisador", descricao: "Pesquisa técnica antes de decisões." },
};

interface Membro {
  id: string;
  nome: string;
  descricao: string;
  especialista: boolean;
  tarefas: TarefaCompleta[];
  vezes: number;
  ultimoEm: string | null;
  ativo: boolean;
}

export function EquipeAoVivo({
  equipe,
  tarefas,
  logs,
  jobAtivo,
}: {
  equipe: EquipeProjeto;
  tarefas: TarefaCompleta[];
  /** Log do job ativo deste projeto (vazio quando nada roda). */
  logs: LinhaLog[];
  jobAtivo: Job | null;
}) {
  const atividade = atividadePorAgente(logs);
  const ativo = jobAtivo !== null ? agenteAtivo(logs) : null;
  const porId = new Map(atividade.map((a) => [a.id, a]));

  const membros: Membro[] = [];
  const vistos = new Set<string>();

  // 1. Especialistas do projeto (o que torna esta fábrica "sob demanda").
  for (const a of equipe.agentes) {
    if (a.erros.length > 0) continue;
    vistos.add(a.id);
    membros.push({
      id: a.id,
      nome: a.nome,
      descricao: a.descricao,
      especialista: true,
      tarefas: tarefas.filter((t) => t.agente === a.id),
      vezes: porId.get(a.id)?.vezes ?? 0,
      ultimoEm: porId.get(a.id)?.ultimoEm ?? null,
      ativo: ativo === a.id,
    });
  }

  // 2. Papéis fixos que APARECERAM no log (não poluir com quem nunca atuou).
  for (const a of atividade) {
    if (vistos.has(a.id)) continue;
    vistos.add(a.id);
    const fixo = FIXOS[a.id];
    membros.push({
      id: a.id,
      nome: fixo?.nome ?? a.id,
      descricao: fixo?.descricao ?? "Agente despachado neste fluxo.",
      especialista: false,
      tarefas: [],
      vezes: a.vezes,
      ultimoEm: a.ultimoEm,
      ativo: ativo === a.id,
    });
  }

  // Trabalhando primeiro; depois quem atuou; por último os ociosos.
  membros.sort((a, b) => {
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return b.vezes - a.vezes;
  });

  const semEquipe = equipe.agentes.filter((a) => a.erros.length === 0).length === 0;

  return (
    <section className="secao">
      <h3 className="secao-titulo">Equipe</h3>

      {equipe.erros.length > 0 && (
        <div className="aviso aviso-erro aviso-compacto">{equipe.erros.join(" · ")}</div>
      )}

      {semEquipe && membros.length === 0 ? (
        <div className="vazio-orientado">
          <p className="vazio-titulo">Este projeto ainda não tem equipe de especialistas.</p>
          <p className="texto-suave">
            A equipe é criada pelo <strong>planejador</strong> junto com o plano: ele lê a
            ideia e sintetiza 2–5 especialistas sob medida (ex.: <em>domínio</em>,{" "}
            <em>api</em>, <em>frontend</em>). Use <strong>Pedir funcionalidade</strong> acima
            para planejar — enquanto não houver equipe, as tarefas caem no executor genérico.
          </p>
        </div>
      ) : (
        <div className="grade-equipe">
          {membros.map((m) => (
            <CartaoMembro key={m.id} membro={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function CartaoMembro({ membro }: { membro: Membro }) {
  const feitas = membro.tarefas.filter((t) => t.status === "concluida").length;
  return (
    <article className={`membro ${membro.ativo ? "membro-ativo" : ""}`}>
      <div className="membro-cab">
        <span className="membro-avatar" aria-hidden="true">
          {membro.nome.slice(0, 2).toUpperCase()}
        </span>
        <div className="membro-id">
          <strong className="membro-nome">{membro.nome}</strong>
          <span className="membro-papel">
            {membro.especialista ? "especialista do projeto" : "papel fixo da fábrica"}
          </span>
        </div>
        {membro.ativo ? (
          <span className="badge membro-estado membro-trabalhando">
            <span className="pulso" aria-hidden="true" /> trabalhando
          </span>
        ) : membro.vezes > 0 ? (
          <span className="badge badge-suave membro-estado">{membro.vezes}× nesta execução</span>
        ) : (
          <span className="badge badge-suave membro-estado">ocioso</span>
        )}
      </div>

      {membro.descricao !== "" && <p className="membro-desc">{membro.descricao}</p>}

      {membro.especialista && (
        <div className="membro-tarefas">
          {membro.tarefas.length === 0 ? (
            <span className="texto-suave">Nenhuma tarefa designada a ele.</span>
          ) : (
            <>
              <span className="membro-tarefas-rot">
                {feitas}/{membro.tarefas.length} tarefa(s) concluída(s)
              </span>
              <div className="membro-chips">
                {membro.tarefas.map((t) => (
                  <span key={t.arquivo} className={`chip-tarefa st-${t.status}`} title={t.titulo}>
                    {t.id}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </article>
  );
}
