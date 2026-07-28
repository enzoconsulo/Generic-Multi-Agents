import { useState } from "react";
import { api, ErroApi } from "../../lib/api";
import type { AgenteEspecialista, EquipeProjeto, Job } from "../../lib/tipos";
import { AcoesDoGrupo } from "./EspecialistasProjeto";

/**
 * Equipe de especialistas do projeto (T-035) — `_gestao/equipe.json`.
 *
 * Diferente de `EquipeAoVivo`, que mostra quem está trabalhando AGORA: aqui é o elenco
 * parado. Sem esta seção, a equipe só era visível durante uma execução, e um agente com
 * `prompt` vazio — que o injetor carrega e IGNORA — não aparecia em lugar nenhum.
 */

/** Linha de edição: o mesmo agente, com `ferramentas` como texto separado por vírgula. */
interface AgenteEdicao {
  id: string;
  nome: string;
  descricao: string;
  prompt: string;
  ferramentas: string;
}

function paraEdicao(a: AgenteEspecialista): AgenteEdicao {
  return {
    id: a.id,
    nome: a.nome,
    descricao: a.descricao,
    prompt: a.prompt,
    ferramentas: (a.ferramentas ?? []).join(", "),
  };
}

export function SecaoEquipe({
  projeto,
  equipe,
  jobAtivo,
  aoGravar,
}: {
  projeto: string;
  equipe: EquipeProjeto;
  jobAtivo: Job | null;
  /** Recarrega o detalhe do projeto — a equipe gravada precisa refletir na tela. */
  aoGravar: () => void;
}) {
  const [editando, setEditando] = useState(false);

  return (
    <section className="secao">
      <h3 className="secao-titulo">Equipe de especialistas</h3>
      <p className="texto-suave secao-desc">
        Quem o <strong>Trabalhar</strong> injeta como especialista neste projeto. As tarefas
        apontam para eles pelo campo <code>agente:</code>. Executor, testador e revisor são
        papéis fixos da fábrica e não moram aqui.
      </p>

      {equipe.erros.length > 0 && (
        <div className="aviso aviso-erro aviso-compacto">
          {equipe.erros.map((e) => (
            <div key={e}>{e}</div>
          ))}
        </div>
      )}

      {editando ? (
        <EditorEquipe
          projeto={projeto}
          inicial={equipe.agentes.map(paraEdicao)}
          aoFechar={() => setEditando(false)}
          aoGravar={() => {
            setEditando(false);
            aoGravar();
          }}
        />
      ) : (
        <>
          {equipe.agentes.length === 0 ? (
            <p className="vazio">
              Sem equipe própria — este projeto usa o <strong>executor genérico</strong>, que dá
              conta de projeto pequeno. Não é erro nem pendência.
            </p>
          ) : (
            <ul className="lista-equipe">
              {equipe.agentes.map((a) => (
                <MembroEquipe key={a.id} agente={a} />
              ))}
            </ul>
          )}

          <div className="form-acoes">
            <button type="button" className="botao botao-secundario" onClick={() => setEditando(true)}>
              {equipe.agentes.length === 0 ? "Montar equipe à mão" : "Editar equipe"}
            </button>
          </div>
        </>
      )}

      <AcoesDoGrupo grupo="equipe" projeto={projeto} jobAtivo={jobAtivo} />
    </section>
  );
}

function MembroEquipe({ agente }: { agente: AgenteEspecialista }) {
  const quebrado = agente.erros.length > 0;
  return (
    <li className={`membro-equipe ${quebrado ? "membro-quebrado" : ""}`}>
      <div className="membro-cab">
        <strong className="membro-nome">{agente.nome}</strong>
        <code className="membro-id">{agente.id}</code>
      </div>
      {agente.descricao !== "" && <p className="membro-desc">{agente.descricao}</p>}
      {agente.ferramentas !== null && agente.ferramentas.length > 0 && (
        <p className="membro-ferramentas">
          <span className="card-args-rot">Ferramentas</span> {agente.ferramentas.join(", ")}
        </p>
      )}
      {quebrado && (
        // Antes desta seção, um agente inválido simplesmente não era injetado, sem nada
        // na tela dizendo por quê.
        <div className="aviso aviso-erro aviso-compacto">
          Ignorado na execução: {agente.erros.join("; ")}
        </div>
      )}
    </li>
  );
}

function EditorEquipe({
  projeto,
  inicial,
  aoFechar,
  aoGravar,
}: {
  projeto: string;
  inicial: AgenteEdicao[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [agentes, setAgentes] = useState<AgenteEdicao[]>(inicial);
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);

  function alterar(i: number, campo: keyof AgenteEdicao, valor: string) {
    setAgentes((atual) => atual.map((a, j) => (i === j ? { ...a, [campo]: valor } : a)));
  }

  async function gravar(evento: React.FormEvent) {
    evento.preventDefault();
    setGravando(true);
    setErro(null);
    setProblemas([]);
    try {
      await api(`/api/equipe/${encodeURIComponent(projeto)}`, {
        method: "PUT",
        body: JSON.stringify({
          agentes: agentes.map((a) => ({
            id: a.id.trim(),
            nome: a.nome.trim(),
            descricao: a.descricao.trim(),
            prompt: a.prompt,
            ferramentas: a.ferramentas
              .split(",")
              .map((f) => f.trim())
              .filter((f) => f !== ""),
          })),
        }),
      });
      aoGravar();
    } catch (e) {
      // O servidor devolve a lista inteira de problemas — mostrar todos de uma vez evita
      // o vaivém de descobrir um erro por tentativa de salvar.
      if (e instanceof ErroApi && Array.isArray((e.corpo as { problemas?: unknown })?.problemas)) {
        setProblemas((e.corpo as { problemas: string[] }).problemas);
      }
      setErro(e instanceof Error ? e.message : "Falha ao gravar");
      setGravando(false);
    }
  }

  return (
    <form className="form-acao" onSubmit={gravar}>
      {agentes.map((a, i) => (
        <fieldset className="fieldset-agente" key={i}>
          <div className="membro-cab">
            <strong className="membro-nome">{a.nome.trim() !== "" ? a.nome : `Agente ${i + 1}`}</strong>
            <button
              type="button"
              className="botao botao-secundario botao-compacto"
              onClick={() => setAgentes((atual) => atual.filter((_, j) => j !== i))}
            >
              Remover
            </button>
          </div>

          <label className="campo-form">
            <span>Id (minúsculas, números e hífen)</span>
            <input value={a.id} onChange={(e) => alterar(i, "id", e.target.value)} placeholder="ex.: audio" />
            <span className="campo-ajuda">
              As tarefas apontam para este id. Trocá-lo órfã as tarefas que já o citam.
            </span>
          </label>

          <label className="campo-form">
            <span>Nome</span>
            <input value={a.nome} onChange={(e) => alterar(i, "nome", e.target.value)} />
          </label>

          <label className="campo-form">
            <span>Descrição</span>
            <input value={a.descricao} onChange={(e) => alterar(i, "descricao", e.target.value)} />
          </label>

          <label className="campo-form">
            <span>Prompt do especialista</span>
            <textarea value={a.prompt} onChange={(e) => alterar(i, "prompt", e.target.value)} rows={5} />
            <span className="campo-ajuda">
              Obrigatório. Agente sem prompt é carregado e silenciosamente ignorado.
            </span>
          </label>

          <label className="campo-form">
            <span>Ferramentas (separadas por vírgula, opcional)</span>
            <input
              value={a.ferramentas}
              onChange={(e) => alterar(i, "ferramentas", e.target.value)}
              placeholder="Read, Edit, Bash"
            />
          </label>
        </fieldset>
      ))}

      <button
        type="button"
        className="botao botao-secundario"
        onClick={() =>
          setAgentes((atual) => [...atual, { id: "", nome: "", descricao: "", prompt: "", ferramentas: "" }])
        }
      >
        + Adicionar especialista
      </button>

      {problemas.length > 0 && (
        <div className="aviso aviso-erro aviso-compacto">
          <strong>Corrija antes de gravar:</strong>
          <ul>
            {problemas.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {erro !== null && problemas.length === 0 && (
        <div className="aviso aviso-erro aviso-compacto">{erro}</div>
      )}

      <div className="form-acoes">
        <button type="submit" className="botao botao-acao" disabled={gravando}>
          {gravando ? "Gravando…" : "Gravar equipe"}
        </button>
        <button type="button" className="botao botao-secundario" onClick={aoFechar} disabled={gravando}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
