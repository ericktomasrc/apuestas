-- TandaBet · Histórico deportivo · cobertura por liga/temporada
-- Migración incremental. No modifica saldos, salas ni liquidaciones.

CREATE TABLE IF NOT EXISTS cobertura_liga_temporada (
  liga_api_id               varchar(40) NOT NULL,
  temporada                 integer NOT NULL,
  fixtures_eventos          boolean NOT NULL DEFAULT false,
  fixtures_alineaciones     boolean NOT NULL DEFAULT false,
  fixtures_estadisticas     boolean NOT NULL DEFAULT false,
  jugadores_estadisticas    boolean NOT NULL DEFAULT false,
  standings                 boolean NOT NULL DEFAULT false,
  jugadores                 boolean NOT NULL DEFAULT false,
  top_scorers               boolean NOT NULL DEFAULT false,
  top_assists               boolean NOT NULL DEFAULT false,
  top_cards                 boolean NOT NULL DEFAULT false,
  lesiones                  boolean NOT NULL DEFAULT false,
  predicciones              boolean NOT NULL DEFAULT false,
  cuotas                    boolean NOT NULL DEFAULT false,
  payload                    jsonb NOT NULL DEFAULT '{}'::jsonb,
  consultado_en             timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (liga_api_id, temporada)
);

CREATE INDEX IF NOT EXISTS idx_cobertura_liga_temporada_stats
  ON cobertura_liga_temporada (fixtures_estadisticas, temporada);
