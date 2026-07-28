/** Erro lançado quando a API responde com status fora da faixa 2xx. */
export class ErroApi extends Error {
  constructor(
    public readonly status: number,
    mensagem: string,
    /**
     * Texto cru que o backend anexou ao erro (campo `detalhe`), quando existe — hoje é a
     * saída do git num push que falhou. Fica separado da mensagem porque a mensagem é
     * para o usuário e isto é para diagnóstico.
     */
    public readonly detalhe: string | null = null,
    /**
     * Corpo JSON inteiro da resposta de erro, para quando o backend anexa dado
     * estruturado (ex.: o relatório de segurança que barrou um push). Fica `unknown`
     * de propósito: quem usa sabe o formato que espera, o helper não.
     */
    public readonly corpo: unknown = null,
  ) {
    super(mensagem);
    this.name = "ErroApi";
  }
}

/** Corpos cujo Content-Type o próprio fetch define (forçar JSON quebraria, ex.: boundary do multipart). */
function corpoDefineProprioContentType(corpo: BodyInit | null | undefined): boolean {
  return (
    corpo instanceof FormData || corpo instanceof URLSearchParams || corpo instanceof Blob
  );
}

/**
 * Helper genérico de fetch para a API do painel.
 *
 * - Resposta 2xx: retorna o corpo JSON tipado como `T`.
 * - Resposta fora de 2xx: lança `ErroApi` com a mensagem do backend
 *   (campo `erro` do JSON) ou uma mensagem padrão em PT-BR.
 * - Falha de rede: o próprio `fetch` rejeita com `TypeError` (propaga).
 * - Headers do chamador são preservados em QUALQUER formato de HeadersInit
 *   (objeto simples, instância `Headers` ou array de pares) e vencem os defaults.
 * - `Content-Type: application/json` só é aplicado quando há body, o chamador não
 *   definiu o header e o body não define o próprio tipo (FormData/URLSearchParams/Blob).
 */
export async function api<T>(caminho: string, init?: RequestInit): Promise<T> {
  // new Headers() normaliza os três formatos de HeadersInit — spread de instância
  // Headers produziria {} e spread de array produziria chaves numéricas.
  const headers = new Headers(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (
    init?.body !== undefined &&
    !headers.has("Content-Type") &&
    !corpoDefineProprioContentType(init.body)
  ) {
    headers.set("Content-Type", "application/json");
  }

  const resposta = await fetch(caminho, { ...init, headers });

  if (!resposta.ok) {
    let mensagem = `Erro ${resposta.status} ao chamar ${caminho}`;
    let detalhe: string | null = null;
    let corpoJson: unknown = null;
    try {
      const corpo = (await resposta.json()) as { erro?: unknown; detalhe?: unknown };
      corpoJson = corpo;
      if (typeof corpo.erro === "string" && corpo.erro.length > 0) {
        mensagem = corpo.erro;
      }
      if (typeof corpo.detalhe === "string" && corpo.detalhe.length > 0) {
        detalhe = corpo.detalhe;
      }
    } catch {
      // Corpo não-JSON: mantém a mensagem padrão.
    }
    throw new ErroApi(resposta.status, mensagem, detalhe, corpoJson);
  }

  return (await resposta.json()) as T;
}
