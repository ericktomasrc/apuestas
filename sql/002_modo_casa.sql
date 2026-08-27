-- =====================================================================
--  Migración 002 — MODO CASA
--
--  Alguien pone dinero por adelantado, ofrece varias opciones sobre un
--  partido, y los demás apuestan contra ellas. Sin cuotas: todo paga
--  1 a 1.
--
--  La diferencia de fondo con el modo sala: allá, si al cerrar los dos
--  lados no suman lo mismo, se anula todo. Aquí eso sería una trampa
--  —la casa no controla cuánta gente entra—, así que la regla es
--  **corre con lo que se llenó y devuelve el resto**.
--
--  ⚠️ SOBRE LA CASA OFICIAL
--
--  Que la plataforma opere su propia casa resuelve el arranque: un
--  mercado vacío no despega, y alguien tiene que poner la primera
--  contraparte.
--
--  Pero crea un problema asimétrico: cuando la casa pierde nadie dice
--  nada, y cuando gana tres veces seguidas alguien va a decir que está
--  arreglado. Como la plataforma controla el sistema, no podría
--  demostrar lo contrario.
--
--  Por eso todo lo que hace la casa oficial queda registrado aquí, es
--  público, e inmutable. No es burocracia: es lo único que permite
--  responder esa acusación con datos.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. Cuentas marcadas
-- ---------------------------------------------------------------------

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS es_casa_oficial BOOLEAN NOT NULL DEFAULT FALSE,
    -- Una cuenta financiada por la plataforma que NO se declara como
    -- tal es la casa disfrazada. Marcarlas es lo que hace que el
    -- registro sirva de algo.
    ADD COLUMN IF NOT EXISTS financiada_por_plataforma BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS nota_transparencia TEXT;

COMMENT ON COLUMN usuarios.es_casa_oficial IS
    'Opera la casa de la plataforma. Aparece marcada y no puede anular sus propias salas.';
COMMENT ON COLUMN usuarios.financiada_por_plataforma IS
    'Su saldo no salió de su bolsillo. Debe declararse: es lo primero que audita un regulador.';

CREATE INDEX IF NOT EXISTS idx_usuarios_casa ON usuarios (es_casa_oficial)
    WHERE es_casa_oficial AND eliminado_en IS NULL;

-- ⚠️ Recrear v_usuarios: es OBLIGATORIO tras cada ALTER TABLE.
--
-- PostgreSQL expande el `*` al crear la vista y congela la lista de
-- columnas. Las que se agreguen después NO aparecen, y cualquier
-- consulta que las pida falla con «column does not exist».
--
-- Es la misma trampa que ya apareció con `salas.pais`.
DROP VIEW IF EXISTS v_usuarios CASCADE;
CREATE VIEW v_usuarios AS SELECT * FROM usuarios WHERE eliminado_en IS NULL;


-- ---------------------------------------------------------------------
-- 1b. Los movimientos pueden pertenecer a una casa
--
--  Una casa vive fuera de la estructura de salas y mercados, así que
--  necesita su propia referencia. Sin ella, el dinero de una casa
--  quedaría sin poder rastrearse hasta su origen.
-- ---------------------------------------------------------------------

ALTER TABLE movimientos ADD COLUMN IF NOT EXISTS casa_id UUID;

CREATE INDEX IF NOT EXISTS idx_mov_casa ON movimientos (casa_id)
    WHERE casa_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2. Casas
-- ---------------------------------------------------------------------

DO $enum$ BEGIN
    CREATE TYPE estado_casa AS ENUM (
    'ABIERTA',      -- admite apuestas
    'CERRADA',      -- ya no admite, esperando el resultado
    'LIQUIDADA',    -- pagada
    'ANULADA'       -- devolución del 100%, sin comisión
);
EXCEPTION WHEN duplicate_object THEN NULL;
END $enum$;

CREATE TABLE casas (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo            TEXT NOT NULL,
    partido_id        UUID NOT NULL REFERENCES partidos(id),
    operador_id       UUID NOT NULL REFERENCES usuarios(id),
    pais              CHAR(2) NOT NULL DEFAULT 'PE',

    descripcion       TEXT,
    estado            estado_casa NOT NULL DEFAULT 'ABIERTA',

    -- Lo que el operador comprometió en total. Se retiene al publicar.
    presupuesto_centavos BIGINT NOT NULL,
    -- Se copia al crear, no se lee del usuario al liquidar: si cambia
    -- de plan a mitad de camino, la regla del día debe ser la que
    -- aceptó al publicar.
    tasa_comision     NUMERIC(5,4) NOT NULL,

    -- Si la operó la plataforma. Se guarda en la casa además de en el
    -- usuario porque el usuario puede dejar de serlo, y el registro
    -- histórico no debe cambiar.
    es_oficial        BOOLEAN NOT NULL DEFAULT FALSE,

    liquidada_en      TIMESTAMPTZ,
    motivo_anulacion  TEXT,

    CONSTRAINT presupuesto_positivo CHECK (presupuesto_centavos > 0),
    CONSTRAINT tasa_con_piso  CHECK (tasa_comision >= 0.03),
    CONSTRAINT tasa_con_techo CHECK (tasa_comision <= 0.20)
);

-- ---------------------------------------------------------------------
-- 3. Opciones que la casa ofrece
-- ---------------------------------------------------------------------

CREATE TABLE opciones_casa (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    casa_id        UUID NOT NULL REFERENCES casas(id),

    -- TEXT, no un enumerado: es como lo guarda `mercados`, y agregar
    -- un tipo nuevo no debería exigir un ALTER TYPE.
    tipo_mercado   TEXT NOT NULL,
    linea          NUMERIC(5,1),
    equipo_referencia TEXT,
    etiqueta       TEXT NOT NULL,

    -- Lo que la casa arriesga en ESTA opción. Es su tope de pérdida.
    presupuesto_centavos BIGINT NOT NULL,

    -- Si ocurrió. NULL mientras no se sepa.
    ocurrio        BOOLEAN,

    CONSTRAINT presupuesto_opcion_positivo CHECK (presupuesto_centavos > 0),
    -- Igual que en el modo sala: una línea entera dejaría el marcador
    -- cayendo justo encima y nadie ganaría.
    CONSTRAINT linea_medio_punto CHECK (
        linea IS NULL OR (linea * 2) = floor(linea * 2)
    )
);

-- ---------------------------------------------------------------------
-- 4. Apuestas contra la casa
-- ---------------------------------------------------------------------

CREATE TABLE apuestas_casa (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opcion_id      UUID NOT NULL REFERENCES opciones_casa(id),
    usuario_id     UUID NOT NULL REFERENCES usuarios(id),

    monto_centavos BIGINT NOT NULL,
    -- La tasa que se le mostró al apostar, y la que se cobra al
    -- liquidar. Mismo criterio que en las salas.
    tasa_mostrada  NUMERIC(5,4) NOT NULL,

    -- Orden de llegada: si entra más dinero del que la casa puso, los
    -- primeros toman el cupo. Por llegada y no a prorrata porque es lo
    -- único que la gente puede verificar por su cuenta.
    orden          BIGSERIAL NOT NULL,

    -- Se calculan al liquidar y quedan como evidencia de lo que
    -- realmente corrió riesgo.
    cubierto_centavos BIGINT,
    sobrante_centavos BIGINT,

    CONSTRAINT monto_positivo CHECK (monto_centavos > 0),
    CONSTRAINT tasa_casa_piso  CHECK (tasa_mostrada >= 0.03),
    CONSTRAINT tasa_casa_techo CHECK (tasa_mostrada <= 0.20)
);

-- ---------------------------------------------------------------------
-- 5. Liquidaciones — append-only
-- ---------------------------------------------------------------------

CREATE TABLE liquidaciones_casa (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    casa_id            UUID NOT NULL REFERENCES casas(id),
    opcion_ganadora_id UUID REFERENCES opciones_casa(id),

    presupuesto_centavos     BIGINT NOT NULL,
    cubierto_centavos        BIGINT NOT NULL,
    liberado_centavos        BIGINT NOT NULL,
    resultado_casa_centavos  BIGINT NOT NULL,
    comision_casa_centavos   BIGINT NOT NULL,
    comision_apostadores_centavos BIGINT NOT NULL,
    pago_casa_centavos       BIGINT NOT NULL,

    motivo_anulacion   TEXT,

    -- LA FOTO.
    --
    -- El estado exacto del mercado en el momento del pago: cada
    -- apuesta, cada presupuesto, cada tasa. Congelado.
    --
    -- Sin esto, para auditar habría que reconstruir el pasado desde
    -- tablas que pudieron cambiar después. Con esto, la evidencia es
    -- literal: así estaba cuando se pagó.
    foto               JSONB NOT NULL,

    creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT anulacion_sin_comision CHECK (
        motivo_anulacion IS NULL
        OR (comision_casa_centavos = 0 AND comision_apostadores_centavos = 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_liquidacion_casa ON liquidaciones_casa (casa_id);

CREATE TRIGGER no_update_liq_casa BEFORE UPDATE ON liquidaciones_casa
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_liq_casa BEFORE DELETE ON liquidaciones_casa
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- ---------------------------------------------------------------------
-- 6. EL LIBRO DE LA CASA — append-only
--
--  Cada cosa que hace la casa oficial, con su motivo y quién la
--  autorizó. Es el registro que se entrega en una auditoría.
--
--  Los `movimientos` ya guardan el dinero. Esto guarda las DECISIONES:
--  cuándo se financió, cuándo se apagó, por qué se anuló una casa.
--  Un auditor pregunta por qué, no solo por cuánto.
-- ---------------------------------------------------------------------

CREATE TABLE libro_casa (
    id            BIGSERIAL PRIMARY KEY,
    momento       TIMESTAMPTZ NOT NULL DEFAULT now(),

    tipo          TEXT NOT NULL,
    casa_id       UUID REFERENCES casas(id),
    usuario_id    UUID REFERENCES usuarios(id),

    monto_centavos BIGINT,
    moneda        CHAR(3),

    -- Por qué. En texto libre y obligatorio: un registro sin motivo no
    -- sirve para auditar.
    motivo        TEXT NOT NULL,
    -- Quién lo autorizó y desde dónde.
    autorizado_por UUID REFERENCES usuarios(id),
    ip            INET,

    detalle       JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT tipo_libro CHECK (tipo IN (
        'FINANCIAMIENTO',    -- se acreditó dinero a la casa
        'RETIRO_FONDOS',     -- se sacó dinero de la casa
        'CASA_CREADA',
        'CASA_CERRADA',
        'CASA_LIQUIDADA',
        'CASA_ANULADA',
        'CASA_ACTIVADA',     -- se encendió el modo casa
        'CASA_DESACTIVADA',  -- se apagó
        'CUENTA_MARCADA',    -- una cuenta se declaró financiada
        'PARAMETRO_CAMBIADO'
    )),
    CONSTRAINT motivo_no_vacio CHECK (length(trim(motivo)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_libro_momento ON libro_casa (momento DESC);
CREATE INDEX IF NOT EXISTS idx_libro_tipo ON libro_casa (tipo, momento DESC);
CREATE INDEX IF NOT EXISTS idx_libro_casa ON libro_casa (casa_id) WHERE casa_id IS NOT NULL;

CREATE TRIGGER no_update_libro BEFORE UPDATE ON libro_casa
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_libro BEFORE DELETE ON libro_casa
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- ---------------------------------------------------------------------
-- 7. Auditoría e índices
-- ---------------------------------------------------------------------

ALTER TABLE movimientos DROP CONSTRAINT IF EXISTS fk_mov_casa;
ALTER TABLE movimientos
    ADD CONSTRAINT fk_mov_casa FOREIGN KEY (casa_id) REFERENCES casas(id);

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['casas','opciones_casa','apuestas_casa'] LOOP
        PERFORM aplicar_auditoria(t);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_casas_codigo ON casas (codigo) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_casas_estado ON casas (estado, pais) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_casas_partido ON casas (partido_id) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_casas_operador ON casas (operador_id) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_opciones_casa ON opciones_casa (casa_id) WHERE eliminado_en IS NULL;
CREATE INDEX IF NOT EXISTS idx_apuestas_opcion ON apuestas_casa (opcion_id, orden)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_apuesta_usuario_opcion
    ON apuestas_casa (opcion_id, usuario_id) WHERE eliminado_en IS NULL;

DROP VIEW IF EXISTS v_casas CASCADE;
CREATE VIEW v_casas          AS SELECT * FROM casas          WHERE eliminado_en IS NULL;
DROP VIEW IF EXISTS v_opciones_casa CASCADE;
CREATE VIEW v_opciones_casa  AS SELECT * FROM opciones_casa  WHERE eliminado_en IS NULL;
DROP VIEW IF EXISTS v_apuestas_casa CASCADE;
CREATE VIEW v_apuestas_casa  AS SELECT * FROM apuestas_casa  WHERE eliminado_en IS NULL;


-- ---------------------------------------------------------------------
-- 8. Cuánto lleva tomado cada opción
--
--  Es lo que la app necesita para decir "quedan S/150 de S/500", y lo
--  que impide que alguien apueste contra un cupo que ya se agotó.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_cupos_casa CASCADE;
CREATE VIEW v_cupos_casa AS
SELECT
    o.id                       AS opcion_id,
    o.casa_id,
    o.etiqueta,
    o.presupuesto_centavos,
    COALESCE(SUM(a.monto_centavos), 0)::BIGINT AS tomado_centavos,
    GREATEST(o.presupuesto_centavos - COALESCE(SUM(a.monto_centavos), 0), 0)::BIGINT
                               AS disponible_centavos,
    count(a.id)::int           AS apostadores
FROM v_opciones_casa o
LEFT JOIN v_apuestas_casa a ON a.opcion_id = o.id
GROUP BY o.id, o.casa_id, o.etiqueta, o.presupuesto_centavos;


-- ---------------------------------------------------------------------
-- 9. TRANSPARENCIA — vistas públicas
--
--  Cualquiera puede consultarlas. Es lo que permite responder «está
--  arreglado» con datos en vez de con palabra.
-- ---------------------------------------------------------------------

DROP VIEW IF EXISTS v_casa_oficial_publico CASCADE;
CREATE VIEW v_casa_oficial_publico AS
SELECT
    c.id             AS casa_id,
    c.codigo,
    c.estado,
    c.presupuesto_centavos,
    c.fecha_crea     AS creada_en,
    c.liquidada_en,
    p.equipo_local,
    p.equipo_visitante,
    p.inicia_en,
    l.presupuesto_centavos     AS liq_presupuesto,
    l.cubierto_centavos        AS liq_cubierto,
    l.resultado_casa_centavos  AS resultado,
    l.comision_casa_centavos   AS comision_pagada,
    (SELECT o.etiqueta FROM opciones_casa o WHERE o.id = l.opcion_ganadora_id)
                               AS opcion_que_ocurrio
FROM v_casas c
JOIN v_partidos p ON p.id = c.partido_id
LEFT JOIN liquidaciones_casa l ON l.casa_id = c.id
WHERE c.es_oficial
ORDER BY c.fecha_crea DESC;

COMMENT ON VIEW v_casa_oficial_publico IS
    'Todo lo que hizo la casa de la plataforma. Pensada para mostrarse a cualquier usuario.';

-- Cómo le va a la casa oficial, en números redondos.
DROP VIEW IF EXISTS v_balance_casa_oficial CASCADE;
CREATE VIEW v_balance_casa_oficial AS
SELECT
    count(*)::int                                        AS casas_operadas,
    count(*) FILTER (WHERE c.estado = 'LIQUIDADA')::int  AS liquidadas,
    COALESCE(SUM(l.presupuesto_centavos), 0)::BIGINT     AS comprometido_total,
    COALESCE(SUM(l.cubierto_centavos), 0)::BIGINT        AS realmente_en_juego,
    COALESCE(SUM(l.resultado_casa_centavos), 0)::BIGINT  AS resultado_acumulado,
    COALESCE(SUM(l.comision_casa_centavos), 0)::BIGINT   AS comision_pagada,
    count(*) FILTER (WHERE l.resultado_casa_centavos > 0)::int AS veces_gano,
    count(*) FILTER (WHERE l.resultado_casa_centavos < 0)::int AS veces_perdio
FROM v_casas c
LEFT JOIN liquidaciones_casa l ON l.casa_id = c.id
WHERE c.es_oficial;

-- Cuentas declaradas como financiadas por la plataforma.
-- Que exista esta lista es lo que hace creíble al resto.
DROP VIEW IF EXISTS v_cuentas_declaradas CASCADE;
CREATE VIEW v_cuentas_declaradas AS
SELECT
    u.id, u.alias, u.es_casa_oficial, u.financiada_por_plataforma,
    u.nota_transparencia, u.fecha_crea,
    (SELECT COALESCE(SUM(m.monto_centavos), 0)::bigint FROM movimientos m
      WHERE m.usuario_id = u.id AND m.tipo = 'DEPOSITO') AS depositado
FROM v_usuarios u
WHERE u.es_casa_oficial OR u.financiada_por_plataforma
ORDER BY u.es_casa_oficial DESC, u.alias;


-- ---------------------------------------------------------------------
-- 10. Parámetros
-- ---------------------------------------------------------------------

INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES
    ('casa_habilitada', 'false', 'BOOLEAN',
     'Si el modo casa está disponible para los usuarios'),
    ('casa_solo_declaradas', 'true', 'BOOLEAN',
     'Si solo las cuentas declaradas pueden abrir casas. Al arrancar conviene dejarlo en true: es dinero real y nadie tiene historial todavía.'),
    ('casa_oficial_activa', 'false', 'BOOLEAN',
     'Si la plataforma opera su propia casa. Apagarlo es el interruptor para retirarse cuando ya haya usuarios.'),
    ('casa_presupuesto_maximo', '300000', 'NUMERO',
     'Tope por casa, en la unidad mínima. Limita cuánto se puede perder de una vez.'),
    ('casa_min_opciones', '2', 'NUMERO',
     'Mínimo de opciones por casa. Con una sola no habría nada que elegir.'),
    ('casa_max_opciones', '8', 'NUMERO',
     'Máximo de opciones por casa')
ON CONFLICT DO NOTHING;

INSERT INTO permisos (clave, area, descripcion) VALUES
    ('casa.ver',       'Casa', 'Ver la actividad y el balance de la casa oficial'),
    ('casa.gestionar', 'Casa', 'Financiar la casa, encenderla y apagarla'),
    ('casa.exportar',  'Casa', 'Descargar el libro y las liquidaciones')
ON CONFLICT DO NOTHING;

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p
 WHERE r.clave = 'SUPER_ADMIN' AND p.clave IN ('casa.ver','casa.gestionar','casa.exportar')
ON CONFLICT DO NOTHING;

INSERT INTO textos (clave, idioma, valor, contexto) VALUES
    ('casa.oficial',       'es', 'Casa de la plataforma', 'Modo casa'),
    ('casa.sobrante',      'es', 'Se te devolvieron {monto} porque el cupo ya estaba tomado.', 'Modo casa'),
    ('casa.cupo_agotado',  'es', 'Esa opción ya está completa.', 'Modo casa'),
    ('error.CASA_NO_HABILITADA', 'es', 'El modo casa no está disponible por ahora.', 'Modo casa')
ON CONFLICT DO NOTHING;


-- ---------------------------------------------------------------------
-- Comprobación
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM permisos WHERE clave LIKE 'casa.%';
    IF n <> 3 THEN RAISE EXCEPTION 'Faltan permisos de casa: hay %', n; END IF;

    SELECT count(*) INTO n FROM information_schema.views
     WHERE table_name IN ('v_cupos_casa','v_casa_oficial_publico',
                          'v_balance_casa_oficial','v_cuentas_declaradas');
    IF n <> 4 THEN RAISE EXCEPTION 'Faltan vistas de casa: hay %', n; END IF;
END $$;

COMMIT;
