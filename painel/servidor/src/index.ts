import { criarApp } from "./app.js";
import { config, fabricaRaizExiste } from "./config.js";
import { inicializarPainel } from "./inicializar.js";

const app = await criarApp();

// Registra o runner Claude e liga o hub SSE ao motor de jobs (só em produção/execução
// real; os testes de rota controlam isso por conta própria).
inicializarPainel();

if (!fabricaRaizExiste()) {
  console.warn(
    `[config] Atenção: raiz da fábrica não encontrada em ${config.fabricaRaiz} — defina a env FABRICA_RAIZ se necessário.`,
  );
}

// Bind EXPLÍCITO em loopback: o painel nunca escuta fora de 127.0.0.1.
app.listen(config.porta, config.host, () => {
  console.log(`Painel da Fábrica escutando em http://${config.host}:${config.porta}`);
  console.log(`Raiz da fábrica: ${config.fabricaRaiz}`);
});
