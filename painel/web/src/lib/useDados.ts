import { useEffect, useState } from "react";
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
 */
export function useDados<T>(caminho: string): EstadoDados<T> & { recarregar: () => void } {
  const [estado, setEstado] = useState<EstadoDados<T>>({
    carregando: true,
    dados: null,
    erro: null,
  });
  const [gatilho, setGatilho] = useState(0);

  useEffect(() => {
    let ativo = true;
    setEstado({ carregando: true, dados: null, erro: null });

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

  return { ...estado, recarregar: () => setGatilho((g) => g + 1) };
}
