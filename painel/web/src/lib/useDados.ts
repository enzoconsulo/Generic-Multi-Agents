import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi } from "./api";

/**
 * Requisições EM VOO, por caminho (T-042). Vários componentes da mesma página pedem o
 * mesmo dado — `/api/fabrica` era buscado 4× e `/api/acoes-projeto` 2× a cada abertura da
 * página do projeto, porque cada um abria a própria requisição.
 *
 * Deduplica só o que está NO AR: nada de cache com validade. Um cache serviria dado velho
 * depois de uma gravação (a equipe editada, o `ci.json` salvo), e trocar 4 requisições
 * locais por uma tela que mente é um péssimo negócio. Assim que a resposta chega, a
 * entrada some — a próxima busca é uma busca de verdade.
 */
const emVoo = new Map<string, Promise<unknown>>();

/** Exportada só para teste: as duas propriedades que importam aqui (uma requisição para
 *  chamadas simultâneas; nenhum cache depois que resolve) não dão para exercitar pelo
 *  hook, porque os testes da web rodam sem DOM. */
export function buscarDeduplicado<T>(caminho: string): Promise<T> {
  const existente = emVoo.get(caminho);
  if (existente !== undefined) return existente as Promise<T>;
  const promessa = api<T>(caminho).finally(() => emVoo.delete(caminho));
  emVoo.set(caminho, promessa);
  return promessa;
}

interface EstadoDados<T> {
  carregando: boolean;
  dados: T | null;
  erro: string | null;
}

/**
 * Hook de leitura da API: dispara um GET em `caminho`, expõe carregando/dados/erro e
 * cancela atualização de estado se o componente desmontar (evita warning de setState
 * em componente fora da árvore). `recarregar()` força uma nova busca.
 *
 * RECARGA PRESERVA OS DADOS NA TELA: só a troca de `caminho` zera `dados`. Zerar também
 * na recarga fazia a página inteira piscar "Carregando…" a cada job que termina (o
 * refetch automático da T-016/T-018) e — pior — desmontava os filhos, perdendo o estado
 * local deles (ex.: editor de `ci.json` aberto com alterações não salvas).
 */
export function useDados<T>(caminho: string): EstadoDados<T> & { recarregar: () => void } {
  const [estado, setEstado] = useState<EstadoDados<T>>({
    carregando: true,
    dados: null,
    erro: null,
  });
  const [gatilho, setGatilho] = useState(0);
  const caminhoAnterior = useRef(caminho);

  useEffect(() => {
    let ativo = true;
    const trocouCaminho = caminhoAnterior.current !== caminho;
    caminhoAnterior.current = caminho;
    setEstado((atual) =>
      trocouCaminho
        ? { carregando: true, dados: null, erro: null }
        : { ...atual, carregando: true, erro: null },
    );

    buscarDeduplicado<T>(caminho)
      .then((dados) => {
        if (ativo) setEstado({ carregando: false, dados, erro: null });
      })
      .catch((e: unknown) => {
        if (!ativo) return;
        const erro =
          e instanceof ErroApi || e instanceof Error ? e.message : "Falha ao carregar dados";
        setEstado({ carregando: false, dados: null, erro });
      });

    return () => {
      ativo = false;
    };
  }, [caminho, gatilho]);

  // Identidade estável: `recarregar` entra em array de dependências de efeito nos
  // consumidores (T-016/T-018); recriada a cada render, fazia esses efeitos rodarem
  // em toda renderização (a cada evento SSE), em vez de só quando os jobs mudam.
  const recarregar = useCallback(() => setGatilho((g) => g + 1), []);

  return { ...estado, recarregar };
}
