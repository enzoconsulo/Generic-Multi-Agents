# GUIA — <nome do projeto>

Como este projeto é organizado e como se faz cada coisa nele. Escrito à mão; o índice
exaustivo de símbolos é o `MAPA.md` ao lado, que é GERADO — ver
`_sistema/PADRAO_DE_PROJETO.md` para a divisão de trabalho entre os dois.

> Preencha as quatro seções e apague estas instruções. Seção vazia é pior que seção ausente:
> promete resposta e não dá.

## 1. Em uma tela

- **O que é:** <uma frase>
- **Stack:** <linguagem, framework, versão que importa>
- **Rodar:** `<comando>`
- **Testar:** `<comando>` — é ele que a fábrica roda em toda verificação.

## 2. Onde fica o quê

Uma linha por MÓDULO (não por arquivo). A terceira coluna é a que mais vale.

| módulo | responsabilidade | quando mexer aqui |
|---|---|---|
| `<pasta/>` | <o que ele resolve> | <o tipo de mudança que cai aqui> |

## 3. Receitas

Os caminhos que se repetem. Cite os arquivos na ORDEM em que se toca neles.

### Para <fazer a coisa mais comum do projeto>
1. `<arquivo>` — <o que muda>
2. `<arquivo>` — <o que muda>
3. Teste em `<arquivo>`.

## 4. Já existe — não reinvente

O helper canônico de cada necessidade recorrente. **Ao criar um helper que outra tarefa vai
querer, acrescente-o aqui na mesma tarefa** — é o que evita a segunda cópia.

| preciso de… | use | onde |
|---|---|---|
| <formatar data> | `<funcao()>` | `<caminho>` |

## Armadilhas conhecidas

Coisas que já custaram tempo aqui. Uma linha cada, com o sintoma antes da causa — é pelo
sintoma que a próxima pessoa vai procurar.
