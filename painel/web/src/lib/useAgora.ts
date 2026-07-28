import { useEffect, useState } from "react";

/**
 * Relógio que avança de segundo em segundo — é o que faz o tempo decorrido de uma execução
 * ANDAR na tela, em vez de congelar no valor do último evento SSE.
 *
 * `ativo: false` para o timer: job terminado tem duração fixa, e um `setInterval` por
 * cartão de job encerrado seria puro desperdício.
 */
export function useAgora(ativo: boolean, intervaloMs = 1000): number {
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!ativo) return;
    // Atualiza já ao ligar: senão o primeiro segundo mostra o valor do render anterior.
    setAgora(Date.now());
    const timer = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(timer);
  }, [ativo, intervaloMs]);

  return agora;
}
