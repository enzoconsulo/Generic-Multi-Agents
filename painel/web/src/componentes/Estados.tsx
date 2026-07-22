/** Blocos reutilizáveis de carregamento, erro e vazio. */

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <p className="texto-suave estado-mensagem" role="status">
      {texto}
    </p>
  );
}

export function MensagemErro({ erro, dica }: { erro: string; dica?: string }) {
  return (
    <div className="aviso aviso-erro" role="alert">
      <strong>Não foi possível carregar.</strong> {erro}
      {dica !== undefined && <div className="aviso-dica">{dica}</div>}
    </div>
  );
}

export function Vazio({ texto }: { texto: string }) {
  return <p className="texto-suave estado-mensagem">{texto}</p>;
}
