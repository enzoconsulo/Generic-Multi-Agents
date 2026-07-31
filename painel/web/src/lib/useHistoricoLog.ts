import { useEffect, useState } from "react";
import { api } from "./api";
import type { LinhaLog } from "./tipos";

/**
 * Log de um job que a sessão atual do navegador NÃO acompanhou (T-048).
 *
 * As linhas de log só chegam pelo SSE, ao vivo. Abrir um job de ontem — ou qualquer job
 * que já tenha rolado para fora do buffer de replay, que guarda 500 eventos para a fábrica
 * inteira — mostrava um console vazio. Justamente nos jobs que a gente vai olhar depois,
 * porque algo pareceu errado, não havia nada para ver.
 *
 * Só busca quando não há linhas ao vivo: job em execução continua servido pelo SSE, sem
 * requisição nenhuma.
 */
export interface HistoricoLog {
  linhas: LinhaLog[];
  /** Linhas omitidas no meio pelo teto de histórico (0 = registro completo). */
  descartadas: number;
}

export function useHistoricoLog(jobId: string | null, linhasAoVivo: LinhaLog[]): HistoricoLog {
  const [historico, setHistorico] = useState<HistoricoLog>({ linhas: [], descartadas: 0 });
  const temAoVivo = linhasAoVivo.length > 0;

  useEffect(() => {
    if (jobId === null || temAoVivo) {
      setHistorico({ linhas: [], descartadas: 0 });
      return;
    }
    let ativo = true;
    api<HistoricoLog>(`/api/jobs/${encodeURIComponent(jobId)}/logs`)
      .then((dados) => {
        if (!ativo) return;
        setHistorico({
          linhas: Array.isArray(dados.linhas) ? dados.linhas : [],
          descartadas: typeof dados.descartadas === "number" ? dados.descartadas : 0,
        });
      })
      .catch(() => {
        // Falhar aqui é degradação aceitável: o console fica como estava antes desta
        // funcionalidade (vazio), e o resumo do job continua na tela.
        if (ativo) setHistorico({ linhas: [], descartadas: 0 });
      });
    return () => {
      ativo = false;
    };
  }, [jobId, temAoVivo]);

  return temAoVivo ? { linhas: linhasAoVivo, descartadas: 0 } : historico;
}
