import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useDados } from "../../lib/useDados";
import type { Ajustes as DadosAjustes, ContaClaude, ContaGitHub } from "../../lib/tipos";
import { Carregando, MensagemErro } from "../../componentes/Estados";

/**
 * Ajustes (T-032): estado das duas contas de que a fábrica depende — Claude, que
 * EXECUTA os fluxos, e GitHub, que RECEBE o que é publicado.
 *
 * Limite honesto: não há "conectar conta" aqui. Os dois logins são fluxos interativos
 * que vivem fora de uma página local (o do Claude é o CLI + navegador; o do GitHub é o
 * Credential Manager, uma chave SSH ou o `gh`). Um botão "Conectar" que só abrisse
 * instruções seria teatro. O que esta tela faz é dizer com precisão o que está ligado,
 * por qual meio, e qual comando exato resolve o que falta — e editar a única coisa que
 * o painel realmente escreve: a identidade dos commits.
 */
export function Ajustes() {
  const { carregando, dados, erro, recarregar } = useDados<DadosAjustes>("/api/ajustes");

  return (
    <div className="pagina">
      <section className="intro">
        <h2 className="intro-titulo">Ajustes</h2>
        <p className="intro-sub">
          As contas de que a fábrica depende e a configuração efetiva deste painel. Nada
          aqui mostra conteúdo de credencial ou de chave — só o que está ligado e por qual
          meio.
        </p>
      </section>

      {carregando && dados === null && <Carregando texto="Conferindo as contas…" />}
      {erro !== null && <MensagemErro erro={erro} />}

      {dados !== null && (
        <>
          <CartaoClaude conta={dados.claude} />
          <CartaoGitHub conta={dados.github} aoMudar={recarregar} />
          <CartaoPainel painel={dados.painel} />
        </>
      )}
    </div>
  );
}

function Selo({ ligado, texto }: { ligado: boolean; texto: string }) {
  return (
    <span className={`repo-selo ${ligado ? "selo-ok" : "selo-atencao"}`}>{texto}</span>
  );
}

/* ---------------------------------- Claude ---------------------------------- */

function CartaoClaude({ conta }: { conta: ContaClaude }) {
  return (
    <section className="repo-cartao">
      <div className="repo-cab">
        <div className="repo-identidade">
          <h3 className="repo-nome">Conta do Claude</h3>
          <span className="badge badge-suave">executa os fluxos</span>
        </div>
        <Selo ligado={conta.conectado} texto={conta.conectado ? "conectada" : "não conectada"} />
      </div>

      <dl className="ajustes-campos">
        <Campo rotulo="Login (credenciais locais)" valor={conta.temCredenciais ? "presente" : "ausente"} />
        <Campo
          rotulo="CLI do Claude Code"
          valor={
            conta.cliInstalado
              ? (conta.versao ?? "instalado")
              : "não encontrado (o painel não depende dele para executar)"
          }
        />
      </dl>

      <p className="texto-suave ajustes-nota">
        O painel executa os fluxos pelo Agent SDK, que usa{" "}
        <strong>o mesmo login do CLI</strong> — não há login separado do painel, e o CLI
        não precisa estar no PATH para isso funcionar. Por isso não existe botão de
        conectar aqui: quem autentica é o <code>claude</code>, pelo navegador.
      </p>

      {conta.comoResolver !== null && (
        <p className="ajustes-resolver">{conta.comoResolver}</p>
      )}
    </section>
  );
}

/* ---------------------------------- GitHub ---------------------------------- */

function CartaoGitHub({ conta, aoMudar }: { conta: ContaGitHub; aoMudar: () => void }) {
  const meio =
    conta.meio === "https"
      ? `HTTPS (guardado por "${conta.credentialHelper ?? "credential helper"}")`
      : conta.meio === "ssh"
        ? `SSH (${conta.chavesSsh.join(", ")})`
        : "nenhum";

  return (
    <section className="repo-cartao">
      <div className="repo-cab">
        <div className="repo-identidade">
          <h3 className="repo-nome">Conta do GitHub</h3>
          <span className="badge badge-suave">recebe o que é publicado</span>
        </div>
        <Selo ligado={conta.conectado} texto={conta.conectado ? "conectada" : "não conectada"} />
      </div>

      <dl className="ajustes-campos">
        <Campo rotulo="Meio de autenticação" valor={meio} />
        <Campo
          rotulo="Chaves SSH encontradas"
          valor={conta.chavesSsh.length === 0 ? "nenhuma" : conta.chavesSsh.join(", ")}
        />
        <Campo
          rotulo="CLI gh"
          valor={
            conta.ghInstalado
              ? (conta.ghConta !== null ? `autenticado como ${conta.ghConta}` : "instalado, sem login")
              : "não instalado (opcional)"
          }
        />
      </dl>

      <Identidade conta={conta} aoMudar={aoMudar} />

      {conta.comoResolver !== null && (
        <p className="ajustes-resolver">{conta.comoResolver}</p>
      )}

      <p className="texto-suave ajustes-nota">
        O endereço na nuvem é <strong>por repositório</strong> — cada projeto tem o seu.
        Configure na <Link to="/git">aba Git</Link> ou na página do próprio projeto.
      </p>
    </section>
  );
}

/** A única coisa desta tela que o painel realmente grava. */
function Identidade({ conta, aoMudar }: { conta: ContaGitHub; aoMudar: () => void }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(conta.identidadeNome ?? "");
  const [email, setEmail] = useState(conta.identidadeEmail ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await api("/api/ajustes/identidade", {
        method: "PUT",
        body: JSON.stringify({ nome, email }),
      });
      setEditando(false);
      aoMudar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao gravar");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="repo-remoto">
      <div className="repo-remoto-linha">
        <span className="repo-rotulo">Identidade dos commits</span>
        {conta.identidadeNome === null ? (
          <span className="texto-suave">não configurada</span>
        ) : (
          <code className="repo-url">
            {conta.identidadeNome} &lt;{conta.identidadeEmail}&gt;
          </code>
        )}
        <button
          type="button"
          className="botao botao-secundario botao-compacto"
          onClick={() => {
            setNome(conta.identidadeNome ?? "");
            setEmail(conta.identidadeEmail ?? "");
            setErro(null);
            setEditando((e) => !e);
          }}
        >
          {editando ? "Cancelar" : "Alterar…"}
        </button>
      </div>

      {editando && (
        <div className="repo-remoto-form">
          <input
            className="commit-entrada"
            value={nome}
            placeholder="Seu Nome"
            onChange={(e) => setNome(e.target.value)}
          />
          <input
            className="commit-entrada mono"
            value={email}
            spellCheck={false}
            placeholder="voce@exemplo.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <p className="texto-suave commit-aviso">
            É o autor que assina os commits (<code>git config --global</code>) e fica
            visível em todo commit publicado.
          </p>
          {erro !== null && <MensagemErro erro={erro} />}
          <button
            type="button"
            className="botao"
            disabled={salvando || nome.trim() === "" || email.trim() === ""}
            onClick={() => void salvar()}
          >
            {salvando ? "Gravando…" : "Salvar identidade"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------- Painel ---------------------------------- */

function CartaoPainel({ painel }: { painel: DadosAjustes["painel"] }) {
  return (
    <section className="repo-cartao">
      <div className="repo-cab">
        <div className="repo-identidade">
          <h3 className="repo-nome">Este painel</h3>
        </div>
      </div>
      <dl className="ajustes-campos">
        <Campo rotulo="Endereço" valor={`127.0.0.1:${painel.porta} (somente esta máquina)`} />
        <Campo rotulo="Raiz da fábrica" valor={painel.fabricaRaiz} />
        <Campo rotulo="Dados operacionais" valor={painel.dirDados} />
        <Campo rotulo="Jobs Claude simultâneos" valor={String(painel.tetoJobsClaude)} />
        <Campo rotulo="Estratégias de modelo" valor={painel.estrategias.join(", ")} />
      </dl>
      <p className="texto-suave ajustes-nota">
        Estes valores vêm de variáveis de ambiente (<code>PORTA</code>,{" "}
        <code>FABRICA_RAIZ</code>, <code>DADOS_DIR</code>, <code>TETO_JOBS_CLAUDE</code>) e
        são lidos na subida do servidor.
      </p>
    </section>
  );
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <>
      <dt>{rotulo}</dt>
      <dd>{valor}</dd>
    </>
  );
}
