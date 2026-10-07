defmodule Fabrica.Repo.Migrations.AdicionarOban do
  use Ecto.Migration

  # `up`/`down` (nao `change`) porque as migracoes do Oban sao versionadas pela propria
  # biblioteca (T-037): `Oban.Migrations.up/1` sabe aplicar so o delta entre a versao ja
  # instalada e a pedida, o que `change/0` nao expressaria.
  def up, do: Oban.Migrations.up()

  def down, do: Oban.Migrations.down()
end
