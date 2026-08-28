---
id: T-053
titulo: Varredura de segredos antes de publicar
projeto: fabrica-v2
versao: v1.0
status: backlog
prioridade: alta
dependencias: [T-031]
areas: [lib/fabrica/seguranca.ex, test/fabrica/seguranca_test.exs]
tentativas: 0
criada: 2026-08-28
atualizada: 2026-08-28
---

## Objetivo
Varrer o repositorio por segredos antes de qualquer publicacao, e recusar quando encontrar.

## Contexto
Porte de `fabrica/seguranca.ts` da v1. A fabrica commita sozinha e pode publicar; um segredo
que escapa e irreversivel na pratica, porque fica no historico.

Padroes: chaves de API conhecidas (incluindo `sk-ant-`), tokens de nuvem, chaves privadas
(`-----BEGIN ... PRIVATE KEY-----`), `.env` versionado, e strings de conexao com senha.

RECUSA, nao avisa. E o inverso da guarda de ferramental (T-014), e a diferenca e a mesma:
reversibilidade. Reinventar uma roda e caro e recuperavel; publicar um segredo, nao.

Falso positivo tem de ser CONTORNAVEL de forma explicita e registrada (uma lista de exclusao
versionada), nunca por desligar a varredura.

## Criterios de aceite
- [ ] Cada padrao de segredo e detectado (um teste por padrao).
      `verificar: mix test test/fabrica/seguranca_test.exs`
- [ ] Segredo encontrado RECUSA a publicacao, nao apenas avisa.
      `verificar: mix test test/fabrica/seguranca_test.exs`
- [ ] Falso positivo e contornavel por lista de exclusao versionada, com o motivo registrado.
      `verificar: mix test test/fabrica/seguranca_test.exs`
- [ ] `mix verificar` continua passando.
      `verificar: mix verificar`

## Notas de execucao


## Verificacao


## Conformidade


## Revisao

