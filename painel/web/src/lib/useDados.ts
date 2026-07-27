import { useCallback, useEffect, useRef, useState } from "react";
import { api, ErroApi } from "./api";

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

    api<T>(caminho)
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
