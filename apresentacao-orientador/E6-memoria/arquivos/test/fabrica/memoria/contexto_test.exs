defmodule Fabrica.Memoria.ContextoTest do
  @moduledoc """
  Trava os quatro criterios da T-046: o bloco entra DEPOIS do prefixo sem tocar nos bytes
  dele, cada trecho vem com a fonte citada, o teto de 8 trechos e do limite de bytes e
  respeitado, e recuperacao vazia produz despacho normal (sem bloco), nao bloco vazio.
  """

  use ExUnit.Case, async: true

  alias Fabrica.Memoria.Contexto
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Prompt.Prefixo

  defp trecho(fonte, corpo), do: %Trecho{fonte: fonte, corpo: corpo}

  # Grande o bastante para passar do minimo cacheavel do Opus (512 tokens ~ 2 mil
  # caracteres) e nao disparar o aviso de "prefixo curto" — que aqui nao e o assunto do
  # teste. Mesmo recurso usado em `Fabrica.Prompt.PrefixoTest`.
  defp partes_do_prefixo do
    [
      ferramentas: "ler, escrever, editar",
      doutrina: String.duplicate("doutrina do papel construtor. ", 100),
      indice: "# MAPA\n- `lib/fabrica.ex`",
      tarefa: "T-046: montar o bloco de contexto"
    ]
  end

  describe "anexar/2 — o bloco entra DEPOIS do prefixo, sem tocar nos bytes dele" do
    test "o texto final comeca com os bytes exatos do prefixo, e o bloco vem depois" do
      prefixo = Prefixo.montar("opus-5", partes_do_prefixo())
      bloco = Contexto.formatar([trecho("_gestao/DECISOES.md#6.2", "o banco e a verdade")])

      final = Contexto.anexar(prefixo, bloco)

      assert String.starts_with?(final, prefixo.texto)
      assert final == prefixo.texto <> "\n\n" <> bloco
    end

    test "montar o mesmo prefixo de novo continua com bytes identicos, bloco presente ou nao" do
      partes = partes_do_prefixo()

      primeiro = Prefixo.montar("opus-5", partes)
      _ = Contexto.anexar(primeiro, Contexto.formatar([trecho("a#s", "corpo qualquer")]))
      segundo = Prefixo.montar("opus-5", partes)

      assert primeiro.texto == segundo.texto
      assert primeiro.pontos_de_cache == segundo.pontos_de_cache
    end

    test "recuperacao vazia produz despacho normal, sem bloco: anexar devolve o prefixo intacto" do
      prefixo = Prefixo.montar("opus-5", partes_do_prefixo())

      final = Contexto.anexar(prefixo, Contexto.formatar([]))

      assert final == prefixo.texto
    end
  end

  describe "formatar/1 — cada trecho vem com a fonte citada" do
    test "a fonte de cada trecho aparece no bloco, ao lado do corpo" do
      bloco =
        Contexto.formatar([
          trecho("_gestao/DECISOES.md#6.2 — o banco e a verdade", "decisao registrada aqui."),
          trecho("_gestao/tarefas/T-030.md#Notas", "outra decisao, outro motivo.")
        ])

      assert bloco =~ "_gestao/DECISOES.md#6.2 — o banco e a verdade"
      assert bloco =~ "decisao registrada aqui."
      assert bloco =~ "_gestao/tarefas/T-030.md#Notas"
      assert bloco =~ "outra decisao, outro motivo."
    end
  end

  describe "formatar/1 — recuperacao vazia produz despacho normal, sem bloco" do
    test "lista vazia devolve nil, e nao um bloco vazio" do
      assert Contexto.formatar([]) == nil
    end
  end

  describe "formatar/1 — teto de 8 trechos" do
    test "mais de 8 trechos recuperados: so os 8 primeiros (mais relevantes) entram" do
      trechos = for indice <- 1..12, do: trecho("fonte##{indice}", "corpo #{indice}")

      bloco = Contexto.formatar(trechos)

      for indice <- 1..8, do: assert(bloco =~ "fonte##{indice}")
      for indice <- 9..12, do: refute(bloco =~ "fonte##{indice}")
    end
  end

  describe "formatar/1 — limite de bytes" do
    test "trechos que juntos estourariam o limite de bytes: os excedentes ficam de fora" do
      grande = String.duplicate("x", 5_000)
      trechos = for indice <- 1..8, do: trecho("fonte##{indice}", grande)

      bloco = Contexto.formatar(trechos)

      assert byte_size(bloco) <= Contexto.limite_bytes()
      refute bloco =~ "fonte#8"
    end

    test "mesmo estourando sozinho o limite, o primeiro trecho (o mais relevante) sempre entra" do
      enorme = String.duplicate("y", Contexto.limite_bytes() * 2)

      bloco = Contexto.formatar([trecho("fonte#1", enorme)])

      assert bloco =~ "fonte#1"
    end
  end

  describe "montar/3 — busca injetavel" do
    test "usa opts[:buscador] no lugar de Fabrica.Memoria.Busca.buscar/2, com projeto_id e termo" do
      buscador = fn projeto_id, termo ->
        send(self(), {:chamado, projeto_id, termo})
        [trecho("fonte#1", "corpo encontrado para #{termo}")]
      end

      bloco = Contexto.montar(7, "confinamento de ferramentas", buscador: buscador)

      assert_received {:chamado, 7, "confinamento de ferramentas"}
      assert bloco =~ "corpo encontrado para confinamento de ferramentas"
      assert bloco =~ "fonte#1"
    end

    test "busca sem resultado produz nil, nao bloco vazio" do
      buscador = fn _projeto_id, _termo -> [] end

      assert Contexto.montar(7, "termo sem trecho", buscador: buscador) == nil
    end
  end
end
