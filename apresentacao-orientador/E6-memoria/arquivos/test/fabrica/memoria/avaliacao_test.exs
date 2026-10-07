defmodule Fabrica.Memoria.AvaliacaoTest do
  @moduledoc """
  Trava os tres criterios de codigo da T-047: o gabarito tem entre 15 e 25 pares extraidos da
  historia REAL desta fabrica-v2, o recall@8 (e a linha de base so-por-palavra) sao calculaveis
  contra o corpus de verdade, e a recuperacao abaixo da linha de base DESLIGA o bloco de
  contexto (`Fabrica.Memoria.Avaliacao.montar_contexto_seguro/3`), em vez de so relatar.

  `Fabrica.Memoria.Avaliacao` mora em `priv/avaliacao/perguntas.exs` (fora de `lib/`, de
  proposito — ver o `@moduledoc` la: e o unico arquivo de codigo dentro das `areas` desta
  tarefa) e precisa ser carregado explicitamente antes de qualquer teste.
  """

  use Fabrica.DataCase, async: false

  alias Fabrica.Memoria.Avaliacao
  alias Fabrica.Memoria.Ingestao
  alias Fabrica.Memoria.Trecho
  alias Fabrica.Projetos.Projeto

  # Carregado no CORPO do modulo (nao dentro de `setup_all`) para que o compilador ja conheca
  # `Fabrica.Memoria.Avaliacao` ao checar as chamadas dos testes abaixo — sem isso, o `mix test`
  # avisa "is undefined" para cada chamada (falso positivo: o modulo existe em tempo de teste).
  Code.require_file(Path.expand("../../../priv/avaliacao/perguntas.exs", __DIR__))

  defp projeto! do
    %Projeto{}
    |> Projeto.changeset(%{
      nome: "projeto-avaliacao-#{System.unique_integer([:positive])}",
      caminho: "C:/tmp/avaliacao"
    })
    |> Repo.insert!()
  end

  # Ingesta a historia REAL desta propria fabrica-v2 (`_gestao/tarefas/*.md`, `DECISOES.md`,
  # `GUIA.md`, `PROGRESSO.md`) — o mesmo corpus que a D-004 mediu e a D-007 confirmou como
  # corpus valido ("a fabrica v1 e este repositorio"). Le do disco, nunca escreve nele.
  defp ingerir_historia_real!(projeto_id) do
    raiz = File.cwd!()

    caminhos =
      Path.wildcard(Path.join(raiz, "_gestao/tarefas/*.md")) ++
        Enum.map(~w[GUIA.md DECISOES.md PROGRESSO.md], &Path.join(raiz, "_gestao/#{&1}"))

    fontes =
      Enum.map(caminhos, fn caminho ->
        %{caminho: Path.relative_to(caminho, raiz), conteudo: File.read!(caminho)}
      end)

    Ingestao.processar(projeto_id, fontes)
  end

  describe "gabarito/0" do
    test "tem entre 15 e 25 pares, cada um com pergunta e frase-alvo nao vazias" do
      gabarito = Avaliacao.gabarito()

      assert length(gabarito) in 15..25

      for {pergunta, frase_alvo} <- gabarito do
        assert is_binary(pergunta) and String.trim(pergunta) != ""
        assert is_binary(frase_alvo) and String.trim(frase_alvo) != ""
      end
    end
  end

  describe "medir_todos_modos/2 — os tres modos, cada um com recall@8, recall@1 e MRR" do
    test "roda os tres modos de Busca e grava as tres metricas em cada um" do
      projeto = projeto!()

      fontes = [
        %{
          caminho: "doc.md",
          conteudo: "# Titulo\nconfinamento de ferramentas usado nesta fabrica-v2.\n"
        }
      ]

      assert %{inseridos: inseridos} = Ingestao.processar(projeto.id, fontes)
      assert inseridos > 0

      gabarito = [{"confinamento de ferramentas", "confinamento de ferramentas"}]

      metricas = Avaliacao.medir_todos_modos(projeto.id, gabarito: gabarito)

      for modo <- [:hibrido, :vetor, :textual] do
        m = Map.fetch!(metricas, modo)
        assert m.perguntas == 1

        for chave <- [:recall_at_8, :recall_at_1, :mrr] do
          valor = Map.fetch!(m, chave)

          assert is_float(valor) and valor >= 0.0 and valor <= 1.0,
                 "#{modo}.#{chave} = #{inspect(valor)} fora de [0,1]"
        end
      end
    end
  end

  describe "medir/2 e linha_de_base/2 — contra o corpus REAL desta fabrica" do
    setup do
      projeto = projeto!()
      resultado = ingerir_historia_real!(projeto.id)

      assert resultado.inseridos > 0,
             "a ingestao nao gravou nenhum trecho — o corpus de _gestao/ esta vazio?"

      %{projeto: projeto}
    end

    test "recall@8 e calculado sobre todo o gabarito, e a linha de base tambem",
         %{projeto: projeto} do
      atuais = Avaliacao.medir(projeto.id)
      piso = Avaliacao.linha_de_base(projeto.id)

      assert atuais.perguntas == length(Avaliacao.gabarito())
      assert atuais.recall_at_8 >= 0.0 and atuais.recall_at_8 <= 1.0
      assert piso.perguntas == atuais.perguntas
      assert piso.recall_at_8 >= 0.0 and piso.recall_at_8 <= 1.0
    end

    test "a linha de base (so palavra) acha pelo menos uma resposta certa no corpus real",
         %{projeto: projeto} do
      # Sem isso o teste do atuador (abaixo) provaria pouco: se o PISO tambem fosse zero, um
      # buscador que nunca acha nada empataria com ele em vez de ficar abaixo.
      piso = Avaliacao.linha_de_base(projeto.id)

      assert piso.recall_at_8 > 0.0,
             "a busca por PALAVRA nao achou nenhuma resposta certa no corpus real — " <>
               "confira se o gabarito ainda bate com o texto atual de _gestao/"
    end

    test "o atuador DESLIGA o bloco de contexto quando a recuperacao fica abaixo da linha de base",
         %{projeto: projeto} do
      {pergunta, _frase_alvo} = hd(Avaliacao.gabarito())

      # Um buscador que nunca acha nada fica, por construcao, abaixo de qualquer linha de base
      # que ache pelo menos uma resposta certa (provado no teste acima) — o cenario mais claro
      # de degradacao, medido contra o MESMO corpus real, sem depender de o vetor de teste
      # (`Embedder.Falso`, sem semantica) empatar ou nao com o piso numa medicao especifica.
      buscador_ruim = fn _projeto_id, _termo -> [] end

      assert Avaliacao.montar_contexto_seguro(projeto.id, pergunta, buscador: buscador_ruim) ==
               nil
    end
  end

  describe "medir/2 e montar_contexto_seguro/3 — buscador que devolve {:erro, motivo}" do
    # `Fabrica.Memoria.Busca.buscar/3` documenta que devolve `{:erro, {:vetorizacao_da_consulta,
    # motivo}}` (nunca deixa o `MatchError` subir) quando o embedder falha — ex.: Ollama fora do
    # ar. `medir/2` precisa tratar essa tupla como "pergunta nao encontrada", nao repassar para
    # `Enum.find_index/2` (que levantaria `Protocol.UndefinedError`, achado do revisor no Ciclo 1).
    test "medir/2 trata {:erro, motivo} como pergunta nao encontrada, sem quebrar" do
      projeto = projeto!()

      buscador_com_erro = fn _projeto_id, _termo ->
        {:erro, {:vetorizacao_da_consulta, :servico_fora_do_ar}}
      end

      resultado = Avaliacao.medir(projeto.id, buscador: buscador_com_erro)

      assert resultado.recall_at_8 == 0.0
      assert resultado.posicao_media == nil
    end

    test "montar_contexto_seguro/3 DESLIGA o bloco quando o buscador devolve erro, em vez de quebrar" do
      projeto = projeto!()
      resultado = ingerir_historia_real!(projeto.id)

      assert resultado.inseridos > 0,
             "a ingestao nao gravou nenhum trecho — o corpus de _gestao/ esta vazio?"

      buscador_com_erro = fn _projeto_id, _termo ->
        {:erro, {:vetorizacao_da_consulta, :servico_fora_do_ar}}
      end

      assert Avaliacao.montar_contexto_seguro(projeto.id, "qualquer pergunta",
               buscador: buscador_com_erro
             ) == nil
    end

    test "montar_contexto_seguro/3 nao quebra quando o buscador erra E a linha de base tambem e zero" do
      # O buraco que a correcao do Ciclo 2 deixou aberto: ela tratou o erro DENTRO de `medir/2`,
      # mas o atuador so devolve `nil` pela via `abaixo_da_linha_de_base?/2`. Num projeto sem
      # corpus, o piso textual tambem e 0.0, entao `0.0 < 0.0` e falso e o atuador cai no ramo
      # `else`, chamando `Contexto.montar/3` com o MESMO buscador que erra — e `Contexto.formatar/1`
      # roda `Enum.take({:erro, _}, 8)`, levantando `Protocol.UndefinedError` no processo chamador.
      # E exatamente o cenario que o revisor apontou ("Ollama cai, buscador padrao"): a fabrica
      # tem que rodar SEM o bloco, nunca quebrar quem chamou.
      projeto = projeto!()

      buscador_com_erro = fn _projeto_id, _termo ->
        {:erro, {:vetorizacao_da_consulta, :servico_fora_do_ar}}
      end

      assert Avaliacao.montar_contexto_seguro(projeto.id, "qualquer pergunta",
               buscador: buscador_com_erro
             ) == nil
    end
  end

  describe "abaixo_da_linha_de_base?/2 — a comparacao, isolada" do
    test "recall maior nao fica abaixo da linha de base" do
      refute Avaliacao.abaixo_da_linha_de_base?(%{recall_at_8: 0.7}, %{recall_at_8: 0.6})
    end

    test "recall menor fica abaixo da linha de base" do
      assert Avaliacao.abaixo_da_linha_de_base?(%{recall_at_8: 0.5}, %{recall_at_8: 0.6})
    end

    test "recall igual nao fica abaixo (empate nao desliga)" do
      refute Avaliacao.abaixo_da_linha_de_base?(%{recall_at_8: 0.6}, %{recall_at_8: 0.6})
    end
  end

  describe "montar_contexto_seguro/3 — o bloco continua entrando quando a recuperacao e boa" do
    test "com uma recuperacao PERFEITA (acima do piso, que fica em zero num projeto vazio), o bloco entra" do
      projeto = projeto!()

      gabarito_de_teste = [{"pergunta de teste", "resposta-certa-unica"}]

      buscador_perfeito = fn _projeto_id, pergunta ->
        [
          %Trecho{
            id: 1,
            projeto_id: projeto.id,
            fonte: "teste",
            corpo: pergunta <> " resposta-certa-unica"
          }
        ]
      end

      resultado =
        Avaliacao.montar_contexto_seguro(projeto.id, "pergunta de teste",
          buscador: buscador_perfeito,
          gabarito: gabarito_de_teste
        )

      refute is_nil(resultado)
      assert resultado =~ "resposta-certa-unica"
    end
  end
end
