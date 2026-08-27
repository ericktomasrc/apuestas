-- =====================================================================
--  ESQUEMA COMPLETO — v3, consolidado
--  App de salas de apuestas P2P
--  Especificación funcional v1.4
--
--  Reemplaza las migraciones 001 a 008 en un solo archivo, con todos
--  los bugs que encontraron las pruebas ya corregidos. Es el ÚNICO
--  archivo que hay que ejecutar en una base nueva.
--
--  Incluye: multi-moneda por país, roles y permisos configurables,
--  textos traducibles, y verificación de ubicación por IP.
--
--  Tres reglas que gobiernan TODO este archivo:
--
--  1. BORRADO LÓGICO SIEMPRE. Ninguna fila se elimina físicamente.
--     Los triggers bloquean DELETE en todas las tablas.
--
--  2. AUDITORÍA EN TODAS LAS TABLAS. Quién creó, quién modificó, cuándo.
--
--  3. HISTORIAL DE CAMBIOS. Toda modificación queda registrada con el
--     valor anterior y el nuevo.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()


-- =====================================================================
--  1. INFRAESTRUCTURA DE AUDITORÍA
-- =====================================================================

-- ---------------------------------------------------------------------
-- Usuario de sesión. La aplicación lo fija al inicio de cada request:
--   SET LOCAL app.usuario_id = '<uuid>';
-- Los triggers lo leen para saber quién hizo cada cambio.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION usuario_actual()
RETURNS UUID AS $$
BEGIN
    RETURN NULLIF(current_setting('app.usuario_id', TRUE), '')::UUID;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;    -- procesos automáticos no tienen usuario
END;
$$ LANGUAGE plpgsql STABLE;


-- ---------------------------------------------------------------------
-- Historial genérico. Una sola tabla para todas las entidades.
--
-- Se eligió tabla única en vez de una por entidad: con 15 tablas,
-- 15 historiales paralelos se vuelven inmanejables y cada cambio de
-- esquema obliga a tocar dos sitios.
-- ---------------------------------------------------------------------
CREATE TABLE historial (
    id              BIGSERIAL PRIMARY KEY,
    tabla           TEXT        NOT NULL,
    registro_id     TEXT        NOT NULL,
    operacion       TEXT        NOT NULL,
    datos_antes     JSONB,
    datos_despues   JSONB,
    campos_cambiados TEXT[],
    usuario_id      UUID,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT operacion_valida
        CHECK (operacion IN ('INSERT','UPDATE','BORRADO_LOGICO','RESTAURACION'))
);

CREATE INDEX idx_hist_registro ON historial (tabla, registro_id, creado_en DESC);
CREATE INDEX idx_hist_usuario  ON historial (usuario_id, creado_en DESC);
CREATE INDEX idx_hist_fecha    ON historial (creado_en DESC);

-- El historial tampoco se toca.
CREATE OR REPLACE FUNCTION bloquear_mutacion()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION '% no está permitido en %. Esta tabla es de solo inserción.',
        TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER no_update_historial BEFORE UPDATE ON historial
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_historial BEFORE DELETE ON historial
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- ---------------------------------------------------------------------
-- Trigger de auditoría. Se aplica a cualquier tabla que tenga las
-- columnas estándar. Rellena los campos y escribe el historial.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditoria()
RETURNS TRIGGER AS $$
DECLARE
    v_operacion TEXT;
    v_cambios   TEXT[];
    v_clave     TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.usuario_crea := COALESCE(NEW.usuario_crea, usuario_actual());
        NEW.fecha_crea   := COALESCE(NEW.fecha_crea, now());
        v_operacion := 'INSERT';

    ELSIF TG_OP = 'UPDATE' THEN
        NEW.usuario_modifica := usuario_actual();
        NEW.fecha_modifica   := now();

        -- Distinguir un borrado lógico de una edición normal
        IF OLD.eliminado_en IS NULL AND NEW.eliminado_en IS NOT NULL THEN
            v_operacion := 'BORRADO_LOGICO';
            NEW.eliminado_por := COALESCE(NEW.eliminado_por, usuario_actual());
        ELSIF OLD.eliminado_en IS NOT NULL AND NEW.eliminado_en IS NULL THEN
            v_operacion := 'RESTAURACION';
            NEW.eliminado_por := NULL;
        ELSE
            v_operacion := 'UPDATE';
        END IF;

        -- Qué columnas cambiaron realmente
        SELECT array_agg(clave) INTO v_cambios
        FROM jsonb_each(to_jsonb(OLD)) AS o(clave, valor)
        WHERE o.valor IS DISTINCT FROM (to_jsonb(NEW) -> o.clave)
          AND o.clave NOT IN ('fecha_modifica','usuario_modifica');

        -- Un UPDATE que no cambió nada no merece una fila de historial
        IF v_operacion = 'UPDATE' AND (v_cambios IS NULL OR array_length(v_cambios,1) IS NULL) THEN
            RETURN NEW;
        END IF;
    END IF;

    v_clave := to_jsonb(NEW) ->> 'id';

    INSERT INTO historial (
        tabla, registro_id, operacion,
        datos_antes, datos_despues, campos_cambiados, usuario_id
    ) VALUES (
        TG_TABLE_NAME,
        v_clave,
        v_operacion,
        CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
        to_jsonb(NEW),
        v_cambios,
        usuario_actual()
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- Bloqueo de DELETE físico. Se aplica a TODAS las tablas.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_bloquear_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'DELETE físico prohibido en %. Usa borrado lógico: UPDATE % SET eliminado_en = now() WHERE id = ...',
        TG_TABLE_NAME, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;


-- ---------------------------------------------------------------------
-- Aplicador: agrega columnas de auditoría y triggers a una tabla.
-- Evita repetir 15 veces el mismo bloque.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aplicar_auditoria(p_tabla TEXT)
RETURNS VOID AS $$
BEGIN
    EXECUTE format($f$
        ALTER TABLE %I
            ADD COLUMN IF NOT EXISTS usuario_crea     UUID,
            ADD COLUMN IF NOT EXISTS usuario_modifica UUID,
            ADD COLUMN IF NOT EXISTS fecha_crea       TIMESTAMPTZ NOT NULL DEFAULT now(),
            ADD COLUMN IF NOT EXISTS fecha_modifica   TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS eliminado_en     TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS eliminado_por    UUID;
    $f$, p_tabla);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_auditoria ON %I', p_tabla);
    EXECUTE format($f$
        CREATE TRIGGER trg_auditoria
            BEFORE INSERT OR UPDATE ON %I
            FOR EACH ROW EXECUTE FUNCTION fn_auditoria();
    $f$, p_tabla);

    EXECUTE format('DROP TRIGGER IF EXISTS trg_no_delete ON %I', p_tabla);
    EXECUTE format($f$
        CREATE TRIGGER trg_no_delete
            BEFORE DELETE ON %I
            FOR EACH ROW EXECUTE FUNCTION fn_bloquear_delete();
    $f$, p_tabla);

    -- Índice para que los filtros de "solo vivos" no hagan scan completo
    EXECUTE format($f$
        CREATE INDEX IF NOT EXISTS idx_%s_vivos ON %I (id) WHERE eliminado_en IS NULL;
    $f$, p_tabla, p_tabla);
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
--  2. CATÁLOGOS Y CONFIGURACIÓN
-- =====================================================================

-- Una sala NUNCA mezcla monedas.
--
-- Si uno pone S/20 y otro USD 20, no hay forma limpia de decidir si el
-- mercado está balanceado sin fijar un tipo de cambio y un momento de
-- conversión. Se perdería la regla más simple del sistema: los dos
-- lados suman lo mismo.
--
-- "Multi-moneda" significa: cada país tiene la suya, y las salas viven
-- dentro de un país. Nunca conversión entre ellas.
CREATE TABLE paises_habilitados (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo      CHAR(2) NOT NULL,
    nombre      TEXT    NOT NULL,
    moneda      CHAR(3) NOT NULL,
    simbolo     TEXT    NOT NULL,

    -- No todas las monedas usan 2 decimales: el peso chileno y el yen
    -- no tienen subdivisión, el dinar kuwaití usa 3. El monto siempre
    -- se guarda en la unidad mínima entera; lo que cambia es cómo se
    -- muestra.
    decimales   SMALLINT NOT NULL DEFAULT 2,

    -- Convención de cada país. El formato del dinero no puede depender
    -- de los datos de idioma del servidor: Perú usa S/1,234.56 y Chile
    -- $1.234, y `toLocaleString` devuelve cosas distintas según la
    -- máquina donde corra.
    separador_miles   CHAR(1) NOT NULL DEFAULT ',',
    separador_decimal CHAR(1) NOT NULL DEFAULT '.',

    -- Los límites son POR PAÍS: un mínimo global no tiene sentido
    -- cuando las monedas son distintas. S/5 y $5 no son lo mismo.
    minimo_apuesta BIGINT NOT NULL DEFAULT 500,
    maximo_apuesta BIGINT NOT NULL DEFAULT 100000,
    zona_horaria   TEXT   NOT NULL DEFAULT 'America/Lima',

    CONSTRAINT decimales_validos    CHECK (decimales BETWEEN 0 AND 4),
    CONSTRAINT minimo_positivo      CHECK (minimo_apuesta > 0),
    CONSTRAINT maximo_mayor         CHECK (maximo_apuesta > minimo_apuesta),
    CONSTRAINT separadores_distintos CHECK (separador_miles <> separador_decimal)
);

CREATE TABLE planes (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo                  TEXT NOT NULL,
    nombre                  TEXT NOT NULL,
    precio_centavos         BIGINT NOT NULL DEFAULT 0,
    tasa_comision           NUMERIC(5,4) NOT NULL,
    destacados_incluidos    BOOLEAN NOT NULL DEFAULT FALSE,
    estadisticas_avanzadas  BOOLEAN NOT NULL DEFAULT FALSE,

    -- A la venta o no. Ocultar una membresía NO afecta a quien ya la
    -- tiene: conserva su plan y su comisión. Quitarle el beneficio a
    -- alguien que pagó es la peor forma de perder un suscriptor.
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,

    -- Piso de comisión (sec. 3.5): ningún plan puede llegar a 0%.
    CONSTRAINT piso_comision  CHECK (tasa_comision >= 0.03),
    CONSTRAINT techo_comision CHECK (tasa_comision <= 0.20),
    CONSTRAINT precio_no_negativo CHECK (precio_centavos >= 0)
);

CREATE TABLE deportes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave           TEXT NOT NULL,
    nombre          TEXT NOT NULL,
    cuenta_prorroga BOOLEAN NOT NULL DEFAULT FALSE,
    tiene_empate    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE ligas (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deporte_id  UUID NOT NULL REFERENCES deportes(id),
    api_id      TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    pais        CHAR(2)
);

-- Toda línea debe terminar en .5 — es el anti-empate (sec. 10.2).
-- Una línea entera (2.0) permitiría que nadie gane.
CREATE OR REPLACE FUNCTION son_medio_punto(lineas NUMERIC[])
RETURNS BOOLEAN AS $$
    SELECT lineas IS NULL
        OR NOT EXISTS (SELECT 1 FROM unnest(lineas) x WHERE x = floor(x));
$$ LANGUAGE sql IMMUTABLE;

CREATE TABLE mercados_por_deporte (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deporte_id          UUID NOT NULL REFERENCES deportes(id),
    tipo_mercado        TEXT NOT NULL,
    lineas_permitidas   NUMERIC(6,1)[],
    campo_api           TEXT NOT NULL,
    etiqueta_favor      TEXT NOT NULL,
    etiqueta_contra     TEXT NOT NULL,
    tasa_comision       NUMERIC(5,4),   -- NULL = usa la del plan del usuario

    -- PostgreSQL prohíbe subconsultas dentro de un CHECK, así que la
    -- validación va en una función IMMUTABLE (definida arriba).
    CONSTRAINT lineas_medio_punto CHECK (son_medio_punto(lineas_permitidas))
);

-- Habilitación por liga: un mercado solo corre donde el proveedor
-- garantiza el dato (sec. 10.9).
CREATE TABLE mercados_por_liga (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    liga_id         UUID NOT NULL REFERENCES ligas(id),
    tipo_mercado    TEXT NOT NULL,
    verificado_en   TIMESTAMPTZ
);


-- =====================================================================
--  3. USUARIOS
-- =====================================================================

CREATE TYPE estado_usuario AS ENUM ('ACTIVO','SUSPENDIDO','AUTOEXCLUIDO');

CREATE TABLE usuarios (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alias           TEXT NOT NULL,
    email           TEXT NOT NULL,
    hash_password   TEXT NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    pais            CHAR(2) NOT NULL DEFAULT 'PE',
    estado          estado_usuario NOT NULL DEFAULT 'ACTIVO',
    plan_id         UUID REFERENCES planes(id),
    plan_vence_en   TIMESTAMPTZ,
    autoexcluido_hasta TIMESTAMPTZ,

    -- Producción (KYC)
    tipo_documento  TEXT,
    numero_documento TEXT,
    verificado_en   TIMESTAMPTZ,

    -- Verificación de país por IP.
    --
    -- La licencia autoriza a operar en un país concreto: aceptar
    -- jugadores de otra jurisdicción es operar sin licencia allá,
    -- aunque el servidor esté en Lima.
    --
    -- ⚠️ La IP NO es prueba: una VPN la cambia en un clic. Es la
    -- primera capa; el KYC es la que verifica de verdad.
    ip_registro          INET,
    pais_detectado       CHAR(2),
    ubicacion_sospechosa BOOLEAN NOT NULL DEFAULT FALSE,
    pais_verificado_en   TIMESTAMPTZ,

    -- Contraseña temporal.
    --
    -- Cuando el admin crea una cuenta del equipo, la clave se envía por
    -- correo y NADIE más la ve. Al entrar, la persona está obligada a
    -- cambiarla antes de poder hacer cualquier cosa.
    password_temporal    BOOLEAN NOT NULL DEFAULT FALSE,
    -- Una invitación olvidada en un correo no puede servir para siempre.
    password_expira_en   TIMESTAMPTZ,
    password_cambiada_en TIMESTAMPTZ,

    -- Segundo factor. Obligatorio para quien tenga acceso al panel:
    -- una contraseña robada no puede bastar para tocar la configuración
    -- de un sistema que maneja dinero.
    totp_secreto         TEXT,
    totp_activado_en     TIMESTAMPTZ,
    totp_codigos_respaldo TEXT[],

    -- Bloqueo por intentos fallidos
    intentos_fallidos    SMALLINT NOT NULL DEFAULT 0,
    bloqueado_hasta      TIMESTAMPTZ,

    CONSTRAINT mayor_de_edad CHECK (fecha_nacimiento <= CURRENT_DATE - INTERVAL '18 years')
);

CREATE TABLE suscripciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    plan_id             UUID NOT NULL REFERENCES planes(id),
    estado              TEXT NOT NULL DEFAULT 'ACTIVA',
    inicia_en           TIMESTAMPTZ NOT NULL,
    vence_en            TIMESTAMPTZ NOT NULL,
    cancelada_en        TIMESTAMPTZ,
    intento_pago_id     UUID,

    CONSTRAINT estado_susc CHECK (estado IN ('ACTIVA','VENCIDA','CANCELADA')),
    CONSTRAINT vigencia_coherente CHECK (vence_en > inicia_en)
);


-- =====================================================================
--  4. DEPORTES Y PARTIDOS
-- =====================================================================

CREATE TYPE estado_partido AS ENUM (
    'PROGRAMADO','EN_JUEGO','FINALIZADO',
    'SUSPENDIDO','POSTERGADO','CANCELADO'
);

CREATE TABLE partidos (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_id              TEXT NOT NULL,
    deporte_id          UUID NOT NULL REFERENCES deportes(id),
    liga_id             UUID NOT NULL REFERENCES ligas(id),
    equipo_local        TEXT NOT NULL,
    equipo_visitante    TEXT NOT NULL,
    inicia_en           TIMESTAMPTZ NOT NULL,
    inicia_en_original  TIMESTAMPTZ NOT NULL,   -- para la ventana de 48h
    estado              estado_partido NOT NULL DEFAULT 'PROGRAMADO',

    -- Estadísticas de resultado
    goles_local         INT,
    goles_visitante     INT,
    corners_local       INT,
    corners_visitante   INT,
    tarjetas_local      INT,
    tarjetas_visitante  INT,
    puntos_local        INT,
    puntos_visitante    INT,

    -- Evidencia ante reclamos (sec. 10.8)
    payload_crudo       JSONB,
    payload_recibido_en TIMESTAMPTZ
);



-- =====================================================================
--  5. SALAS, MERCADOS Y POSICIONES
-- =====================================================================

CREATE TYPE estado_sala AS ENUM (
    'ABIERTA','CUENTA_REGRESIVA','CERRADA',
    'EN_JUEGO','LIQUIDADA','ANULADA','EXPIRADA'
);

CREATE TYPE estado_mercado AS ENUM (
    'PROPUESTO','BALANCEADO','CONFIRMADO',
    'ESPERANDO_DATO','LIQUIDADO','ANULADO'
);

CREATE TYPE lado_mercado AS ENUM ('A_FAVOR','EN_CONTRA');

CREATE TYPE motivo_anulacion AS ENUM (
    'SIN_CONTRAPARTE','SALA_VACIA','PARTIDO_CANCELADO',
    'PARTIDO_POSTERGADO','PARTIDO_ABANDONADO',
    'DATO_NO_DISPONIBLE','ERROR_OPERATIVO'
);

CREATE TABLE salas (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo              TEXT NOT NULL,          -- visible: "A17"
    partido_id          UUID NOT NULL REFERENCES partidos(id),
    anfitrion_id        UUID REFERENCES usuarios(id),
    es_del_sistema      BOOLEAN NOT NULL DEFAULT FALSE,

    descripcion         TEXT,
    tope_participantes  INT NOT NULL,
    monto_minimo_centavos BIGINT NOT NULL,
    destacada_hasta     TIMESTAMPTZ,

    -- Impide mezclar monedas: al entrar se verifica que el país del
    -- usuario coincida con el de la sala.
    pais                CHAR(2) NOT NULL DEFAULT 'PE',

    estado              estado_sala NOT NULL DEFAULT 'ABIERTA',
    regresiva_termina_en TIMESTAMPTZ,
    cerrada_en          TIMESTAMPTZ,
    motivo_anulacion    motivo_anulacion,

    CONSTRAINT tope_valido CHECK (tope_participantes BETWEEN 2 AND 20),
    CONSTRAINT minimo_positivo CHECK (monto_minimo_centavos > 0),
    CONSTRAINT descripcion_corta CHECK (descripcion IS NULL OR length(descripcion) <= 140),
    -- Sala del sistema no tiene anfitrión; sala de usuario sí
    CONSTRAINT anfitrion_coherente CHECK (
        (es_del_sistema = TRUE  AND anfitrion_id IS NULL) OR
        (es_del_sistema = FALSE AND anfitrion_id IS NOT NULL)
    )
);


CREATE TABLE mercados (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sala_id             UUID NOT NULL REFERENCES salas(id),
    tipo_mercado        TEXT NOT NULL,
    linea               NUMERIC(6,1),
    equipo_referencia   TEXT,                   -- para DOBLE_OPORTUNIDAD, GOLES_EQUIPO

    etiqueta_favor      TEXT NOT NULL,
    etiqueta_contra     TEXT NOT NULL,

    estado              estado_mercado NOT NULL DEFAULT 'PROPUESTO',
    -- Caché derivada de posiciones. La fuente de verdad son las posiciones.
    total_favor_centavos    BIGINT NOT NULL DEFAULT 0,
    total_contra_centavos   BIGINT NOT NULL DEFAULT 0,

    lado_ganador        lado_mercado,
    motivo_anulacion    motivo_anulacion,
    liquidado_en        TIMESTAMPTZ,

    -- La línea siempre en .5: es el anti-empate (sec. 10.2)
    CONSTRAINT linea_medio_punto CHECK (
        linea IS NULL OR (linea <> floor(linea))
    ),
    CONSTRAINT totales_no_negativos CHECK (
        total_favor_centavos >= 0 AND total_contra_centavos >= 0
    ),
    CONSTRAINT resultado_o_anulacion CHECK (
        NOT (lado_ganador IS NOT NULL AND motivo_anulacion IS NOT NULL)
    )
);


CREATE TABLE posiciones (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mercado_id          UUID NOT NULL REFERENCES mercados(id),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    lado                lado_mercado NOT NULL,
    monto_centavos      BIGINT NOT NULL,
    -- La tasa que se le mostró al apostar, y LA QUE SE COBRA al
    -- liquidar.
    --
    -- Entre apostar y liquidar pasan horas o días: el plan puede
    -- vencer o alguien puede cambiar la comisión desde Membresías. Si
    -- se leyera la vigente al liquidar, la persona vería 4% al
    -- confirmar y pagaría 7% al ganar — justo lo que el desglose
    -- previo existe para evitar.
    --
    -- Lleva el mismo rango que `planes.tasa_comision` porque ahora es
    -- la fuente del dinero, no un dato informativo.
    tasa_mostrada       NUMERIC(5,4) NOT NULL,

    CONSTRAINT monto_positivo CHECK (monto_centavos > 0),
    CONSTRAINT tasa_mostrada_piso  CHECK (tasa_mostrada >= 0.03),
    CONSTRAINT tasa_mostrada_techo CHECK (tasa_mostrada <= 0.20)
);



-- =====================================================================
--  6. LEDGER
-- =====================================================================

CREATE TYPE tipo_movimiento AS ENUM (
    'DEPOSITO','RETIRO','RETENCION','LIBERACION',
    'PREMIO','PERDIDA','DEVOLUCION','COMISION',
    'SUSCRIPCION','AJUSTE','BONO'
);

-- ⚠️ EXCEPCIÓN DELIBERADA:
-- movimientos NO lleva las columnas de modificación ni de borrado lógico.
-- Es append-only por naturaleza: una fila nunca cambia ni se anula.
-- Un error se corrige insertando un AJUSTE, jamás editando.
-- Poner "eliminado_en" aquí sugeriría que se puede borrar un movimiento,
-- y eso es exactamente lo que no debe poder hacerse.
CREATE TABLE movimientos (
    id                  BIGSERIAL PRIMARY KEY,
    usuario_id          UUID REFERENCES usuarios(id),
    es_casa             BOOLEAN NOT NULL DEFAULT FALSE,
    tipo                tipo_movimiento NOT NULL,
    monto_centavos      BIGINT NOT NULL,
    -- Los saldos NUNCA se suman entre monedas distintas.
    moneda              CHAR(3) NOT NULL DEFAULT 'PEN',

    mercado_id          UUID REFERENCES mercados(id),
    sala_id             UUID REFERENCES salas(id),
    clave_idempotencia  TEXT NOT NULL,

    motivo              TEXT,
    operador_id         UUID,
    -- NULL = lo hizo un proceso automático (liquidar, anular, conciliar).
    -- No puede ser NOT NULL: esos procesos no actúan en nombre de nadie.
    usuario_crea        UUID DEFAULT usuario_actual(),
    fecha_crea          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT monto_no_cero CHECK (monto_centavos <> 0),
    CONSTRAINT titular_definido CHECK (
        (usuario_id IS NOT NULL AND es_casa = FALSE) OR
        (usuario_id IS NULL     AND es_casa = TRUE)
    ),
    CONSTRAINT ajuste_justificado CHECK (
        tipo <> 'AJUSTE' OR (motivo IS NOT NULL AND operador_id IS NOT NULL)
    ),
    CONSTRAINT signo_coherente CHECK (
        (tipo IN ('DEPOSITO','LIBERACION','PREMIO','DEVOLUCION','COMISION','BONO')
            AND monto_centavos > 0) OR
        (tipo IN ('RETIRO','RETENCION','PERDIDA','SUSCRIPCION')
            AND monto_centavos < 0) OR
        (tipo = 'AJUSTE')
    ),
    CONSTRAINT idempotencia_unica UNIQUE (clave_idempotencia)
);

CREATE INDEX idx_mov_usuario ON movimientos (usuario_id, fecha_crea DESC);
CREATE INDEX idx_mov_mercado ON movimientos (mercado_id);
CREATE INDEX idx_mov_retenciones ON movimientos (usuario_id, mercado_id)
    WHERE tipo = 'RETENCION';

CREATE TRIGGER no_update_movimientos BEFORE UPDATE ON movimientos
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_movimientos BEFORE DELETE ON movimientos
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


CREATE TABLE liquidaciones (
    mercado_id          UUID PRIMARY KEY REFERENCES mercados(id),
    sala_id             UUID NOT NULL REFERENCES salas(id),
    lado_ganador        lado_mercado,
    motivo_anulacion    motivo_anulacion,
    bote_centavos       BIGINT NOT NULL,
    comision_centavos   BIGINT NOT NULL,
    payload_resultado   JSONB,
    liquidado_en        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT resultado_o_anulacion CHECK (
        (lado_ganador IS NOT NULL AND motivo_anulacion IS NULL) OR
        (lado_ganador IS NULL     AND motivo_anulacion IS NOT NULL)
    ),
    -- En anulación la casa no cobra, sin excepciones (sec. 7.2)
    CONSTRAINT anulacion_sin_comision CHECK (
        motivo_anulacion IS NULL OR comision_centavos = 0
    ),
    CONSTRAINT comision_no_negativa CHECK (comision_centavos >= 0)
);

CREATE TRIGGER no_update_liquidaciones BEFORE UPDATE ON liquidaciones
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_liquidaciones BEFORE DELETE ON liquidaciones
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- =====================================================================
--  7. PAGOS
-- =====================================================================

CREATE TYPE estado_pago AS ENUM (
    'INICIADO','PENDIENTE','CONFIRMADO',
    'RECHAZADO','EXPIRADO','REVERTIDO'
);

CREATE TABLE intentos_pago (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id          UUID NOT NULL REFERENCES usuarios(id),
    tipo                TEXT NOT NULL,          -- DEPOSITO | RETIRO | SUSCRIPCION
    monto_centavos      BIGINT NOT NULL,
    estado              estado_pago NOT NULL DEFAULT 'INICIADO',
    proveedor           TEXT NOT NULL,
    referencia_proveedor TEXT,
    clave_idempotencia  TEXT NOT NULL,
    payload_crudo       JSONB,
    resuelto_en         TIMESTAMPTZ,

    CONSTRAINT tipo_pago CHECK (tipo IN ('DEPOSITO','RETIRO','SUSCRIPCION')),
    CONSTRAINT monto_pago_positivo CHECK (monto_centavos > 0)
);


-- Los webhooks son evidencia: append-only.
CREATE TABLE eventos_webhook (
    id                  BIGSERIAL PRIMARY KEY,
    proveedor           TEXT NOT NULL,
    referencia_proveedor TEXT,
    tipo_evento         TEXT,
    firma_valida        BOOLEAN NOT NULL,
    payload_crudo       JSONB NOT NULL,
    procesado_en        TIMESTAMPTZ,
    recibido_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_ref ON eventos_webhook (proveedor, referencia_proveedor);

CREATE TRIGGER no_delete_webhook BEFORE DELETE ON eventos_webhook
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- =====================================================================
--  8. SOCIAL
-- =====================================================================

CREATE TABLE mensajes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sala_id     UUID NOT NULL REFERENCES salas(id),
    usuario_id  UUID REFERENCES usuarios(id),   -- NULL = evento del sistema
    texto       TEXT NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'USUARIO',
    reportado   BOOLEAN NOT NULL DEFAULT FALSE,

    CONSTRAINT tipo_mensaje CHECK (tipo IN ('USUARIO','SISTEMA')),
    CONSTRAINT texto_no_vacio CHECK (length(trim(texto)) > 0)
);


-- Muro de actividad: publicaciones generadas por el sistema (sec. 13.2)
CREATE TABLE publicaciones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo        TEXT NOT NULL,
    usuario_id  UUID REFERENCES usuarios(id),
    sala_id     UUID REFERENCES salas(id),
    mercado_id  UUID REFERENCES mercados(id),
    datos       JSONB NOT NULL,

    -- Las derrotas NO se publican: exponer pérdidas ajenas es humillante
    CONSTRAINT tipo_publicacion CHECK (tipo IN (
        'SALA_CREADA','SALA_BALANCEADA','RESULTADO_GANADOR',
        'RACHA','RESUMEN_DIARIO'
    ))
);



-- =====================================================================
--  9. OPERACIÓN
-- =====================================================================

CREATE TABLE incidentes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo        TEXT NOT NULL,
    severidad   TEXT NOT NULL DEFAULT 'MEDIA',
    mercado_id  UUID REFERENCES mercados(id),
    usuario_id  UUID REFERENCES usuarios(id),
    detalle     JSONB NOT NULL,
    resuelto_en TIMESTAMPTZ,
    resuelto_por UUID,

    CONSTRAINT severidad_valida CHECK (severidad IN ('BAJA','MEDIA','ALTA','CRITICA'))
);

CREATE TABLE configuracion (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave   TEXT NOT NULL,
    valor   TEXT NOT NULL,
    tipo    TEXT NOT NULL DEFAULT 'TEXTO',
    descripcion TEXT
);


-- =====================================================================
--  9b. PERMISOS, ROLES E IDIOMAS
--
--  La idea: **los permisos son código, los roles son configuración.**
--
--  Cada permiso protege un endpoint concreto, así que existe en el
--  código. Pero un rol es solo una combinación de permisos, y esas se
--  crean desde el panel. El día que haga falta un "usuario de soporte
--  que solo ve reportes y anula salas atascadas", se crea marcando
--  casillas — sin desplegar nada.
-- =====================================================================

CREATE TABLE permisos (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave       TEXT NOT NULL,
    area        TEXT NOT NULL,
    descripcion TEXT NOT NULL,

    CONSTRAINT clave_formato CHECK (clave ~ '^[a-z_]+\.[a-z_]+$')
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave       TEXT NOT NULL,
    nombre      TEXT NOT NULL,
    descripcion TEXT,
    -- Un rol de sistema no se puede borrar ni mutilar: si alguien
    -- eliminara SUPER_ADMIN por error, nadie podría volver a entrar.
    es_sistema  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE roles_permisos (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rol_id     UUID NOT NULL REFERENCES roles(id),
    permiso_id UUID NOT NULL REFERENCES permisos(id)
);

CREATE TABLE usuarios_roles (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id   UUID NOT NULL REFERENCES usuarios(id),
    rol_id       UUID NOT NULL REFERENCES roles(id),
    otorgado_por UUID REFERENCES usuarios(id)
);

CREATE TABLE idiomas (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo  CHAR(2) NOT NULL,
    nombre  TEXT NOT NULL,
    activo  BOOLEAN NOT NULL DEFAULT TRUE
);

-- Los textos que lee el usuario viven aquí, no en el código.
--
-- Agregar portugués pasa a ser insertar filas. Es la diferencia entre
-- configurar y programar cuando se abre un país nuevo. Y afinar el
-- texto de un error —de las cosas que más se retocan— no exige
-- desplegar.
CREATE TABLE textos (
    id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clave    TEXT NOT NULL,
    idioma   CHAR(2) NOT NULL,
    valor    TEXT NOT NULL,
    contexto TEXT,

    CONSTRAINT valor_no_vacio CHECK (length(trim(valor)) > 0)
);


-- =====================================================================
--  9b-bis. SEGURIDAD DE CUENTAS
-- =====================================================================

-- Enlaces de un solo uso: invitación al equipo y recuperación de clave.
CREATE TABLE tokens_acceso (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID NOT NULL REFERENCES usuarios(id),
    tipo        TEXT NOT NULL,
    -- Se guarda el HASH, no el token. Si alguien lee la base, no puede
    -- usar los enlaces pendientes.
    token_hash  TEXT NOT NULL,
    expira_en   TIMESTAMPTZ NOT NULL,
    usado_en    TIMESTAMPTZ,
    ip_solicitud INET,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT tipo_token CHECK (tipo IN ('INVITACION','RECUPERACION','CAMBIO_CORREO'))
);

CREATE INDEX idx_tokens_hash ON tokens_acceso (token_hash);
CREATE INDEX idx_tokens_usuario ON tokens_acceso (usuario_id, tipo, creado_en DESC);


-- Cada intento de ingreso. Append-only: es la evidencia de un ataque.
CREATE TABLE intentos_ingreso (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    usuario_id  UUID REFERENCES usuarios(id),
    ip          INET,
    exitoso     BOOLEAN NOT NULL,
    motivo      TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_intentos_email ON intentos_ingreso (lower(email), creado_en DESC);
CREATE INDEX idx_intentos_ip    ON intentos_ingreso (ip, creado_en DESC);

CREATE TRIGGER no_update_intentos BEFORE UPDATE ON intentos_ingreso
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_intentos BEFORE DELETE ON intentos_ingreso
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- Correos enviados. Sirve para responder "¿le llegó la invitación?"
-- sin depender de que el proveedor conserve el registro.
CREATE TABLE correos_enviados (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  UUID REFERENCES usuarios(id),
    destinatario TEXT NOT NULL,
    plantilla   TEXT NOT NULL,
    asunto      TEXT NOT NULL,
    estado      TEXT NOT NULL,
    error       TEXT,
    proveedor   TEXT,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT estado_correo CHECK (estado IN ('ENVIADO','FALLIDO','SIMULADO'))
);

CREATE INDEX idx_correos_usuario ON correos_enviados (usuario_id, creado_en DESC);
CREATE INDEX idx_correos_fallidos ON correos_enviados (creado_en DESC)
    WHERE estado = 'FALLIDO';


-- =====================================================================
--  9c. VERIFICACIÓN DE UBICACIÓN
--
--  Append-only: es evidencia. Si mañana hay que responderle a un
--  regulador desde dónde se conectó alguien, la respuesta está aquí y
--  nadie pudo editarla.
-- =====================================================================

CREATE TABLE verificaciones_ubicacion (
    id              BIGSERIAL PRIMARY KEY,
    usuario_id      UUID REFERENCES usuarios(id),
    momento         TEXT NOT NULL,
    ip              INET,
    pais_declarado  CHAR(2),
    pais_detectado  CHAR(2),
    coinciden       BOOLEAN,
    sospechosa      BOOLEAN NOT NULL DEFAULT FALSE,
    resultado       TEXT NOT NULL,
    proveedor       TEXT,
    creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT momento_valido   CHECK (momento IN ('REGISTRO','INGRESO','APUESTA')),
    CONSTRAINT resultado_valido CHECK (resultado IN
        ('PERMITIDO','BLOQUEADO','ADVERTIDO','SIN_DATO','PROVEEDOR_CAIDO'))
);

CREATE INDEX idx_verif_usuario  ON verificaciones_ubicacion (usuario_id, creado_en DESC);
CREATE INDEX idx_verif_bloqueos ON verificaciones_ubicacion (creado_en DESC)
    WHERE resultado = 'BLOQUEADO';

CREATE TRIGGER no_update_verificaciones BEFORE UPDATE ON verificaciones_ubicacion
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();
CREATE TRIGGER no_delete_verificaciones BEFORE DELETE ON verificaciones_ubicacion
    FOR EACH ROW EXECUTE FUNCTION bloquear_mutacion();


-- =====================================================================
--  10. APLICAR AUDITORÍA A TODAS LAS TABLAS
--  (movimientos, liquidaciones, historial y eventos_webhook quedan
--   fuera: son append-only y ya tienen su propio blindaje)
-- =====================================================================

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'paises_habilitados','planes','deportes','ligas',
        'mercados_por_deporte','mercados_por_liga',
        'usuarios','suscripciones','partidos',
        'salas','mercados','posiciones',
        'intentos_pago','mensajes','publicaciones',
        'incidentes','configuracion',
        'permisos','roles','roles_permisos','usuarios_roles','idiomas','textos',
        'tokens_acceso'
    ] LOOP
        PERFORM aplicar_auditoria(t);
    END LOOP;
END $$;


-- =====================================================================
--  11. ÍNDICES ÚNICOS PARCIALES
--
--  El borrado lógico rompe las claves únicas normales: si se borra
--  el alias "juan", el registro sigue existiendo y nadie más podría
--  usarlo jamás. Los índices parciales solo miran las filas vivas.
-- =====================================================================

-- Índices parciales de consulta. Van AQUÍ y no junto a cada CREATE TABLE
-- porque la columna eliminado_en la agrega aplicar_auditoria() en la
-- sección 10: antes de ese punto la columna todavía no existe.
CREATE INDEX idx_partidos_inicio  ON partidos (inicia_en)        WHERE eliminado_en IS NULL;
CREATE INDEX idx_salas_muro       ON salas (estado, partido_id)  WHERE eliminado_en IS NULL;
CREATE INDEX idx_mercados_sala    ON mercados (sala_id)          WHERE eliminado_en IS NULL;
CREATE INDEX idx_posiciones_mercado ON posiciones (mercado_id)   WHERE eliminado_en IS NULL;
CREATE INDEX idx_posiciones_usuario ON posiciones (usuario_id)   WHERE eliminado_en IS NULL;
CREATE INDEX idx_mensajes_sala    ON mensajes (sala_id, fecha_crea) WHERE eliminado_en IS NULL;
CREATE INDEX idx_publicaciones    ON publicaciones (fecha_crea DESC) WHERE eliminado_en IS NULL;

-- Un usuario, UNA posición viva por mercado. Parcial: una posición
-- borrada lógicamente (salió de la sala) no le impide volver a entrar.
CREATE UNIQUE INDEX idx_posicion_unica ON posiciones (mercado_id, usuario_id)
    WHERE eliminado_en IS NULL;

CREATE UNIQUE INDEX idx_pago_idem ON intentos_pago (clave_idempotencia)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX idx_pago_referencia ON intentos_pago (proveedor, referencia_proveedor)
    WHERE referencia_proveedor IS NOT NULL AND eliminado_en IS NULL;

CREATE UNIQUE INDEX uq_usuarios_alias ON usuarios (lower(alias))
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_usuarios_email ON usuarios (lower(email))
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_planes_codigo ON planes (codigo)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_paises_codigo ON paises_habilitados (codigo)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_deportes_clave ON deportes (clave)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_ligas_api ON ligas (api_id)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_partidos_api ON partidos (api_id)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_salas_codigo ON salas (codigo)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_config_clave ON configuracion (clave)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_permisos_clave ON permisos (clave)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_roles_clave ON roles (clave)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_rol_permiso ON roles_permisos (rol_id, permiso_id)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_usuario_rol ON usuarios_roles (usuario_id, rol_id)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_idiomas_codigo ON idiomas (codigo)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_texto_clave_idioma ON textos (clave, idioma)
    WHERE eliminado_en IS NULL;
CREATE INDEX idx_usuarios_roles ON usuarios_roles (usuario_id)
    WHERE eliminado_en IS NULL;
CREATE INDEX idx_textos_idioma ON textos (idioma)
    WHERE eliminado_en IS NULL;
CREATE INDEX idx_salas_pais ON salas (pais, estado)
    WHERE eliminado_en IS NULL;
CREATE INDEX idx_mov_moneda ON movimientos (moneda, tipo);
CREATE INDEX idx_usuarios_discrepancia ON usuarios (pais, pais_detectado)
    WHERE pais_detectado IS NOT NULL AND pais <> pais_detectado;
CREATE UNIQUE INDEX uq_mercado_por_deporte ON mercados_por_deporte (deporte_id, tipo_mercado)
    WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX uq_mercado_por_liga ON mercados_por_liga (liga_id, tipo_mercado)
    WHERE eliminado_en IS NULL;
-- Un solo mercado del mismo tipo y línea por sala
CREATE UNIQUE INDEX uq_mercado_sala ON mercados (sala_id, tipo_mercado, COALESCE(linea, -1))
    WHERE eliminado_en IS NULL;


-- =====================================================================
--  12. VISTAS DE SOLO-VIVOS
--
--  El código de la aplicación consulta SIEMPRE estas vistas, nunca las
--  tablas directas. Así es imposible olvidar el filtro de borrados.
-- =====================================================================

CREATE VIEW v_usuarios   AS SELECT * FROM usuarios   WHERE eliminado_en IS NULL;
CREATE VIEW v_planes     AS SELECT * FROM planes     WHERE eliminado_en IS NULL;
CREATE VIEW v_salas      AS SELECT * FROM salas      WHERE eliminado_en IS NULL;
CREATE VIEW v_mercados   AS SELECT * FROM mercados   WHERE eliminado_en IS NULL;
CREATE VIEW v_posiciones AS SELECT * FROM posiciones WHERE eliminado_en IS NULL;
CREATE VIEW v_partidos   AS SELECT * FROM partidos   WHERE eliminado_en IS NULL;
CREATE VIEW v_mensajes   AS SELECT * FROM mensajes   WHERE eliminado_en IS NULL;
CREATE VIEW v_deportes   AS SELECT * FROM deportes   WHERE eliminado_en IS NULL;
CREATE VIEW v_ligas      AS SELECT * FROM ligas      WHERE eliminado_en IS NULL;
CREATE VIEW v_intentos_pago AS SELECT * FROM intentos_pago WHERE eliminado_en IS NULL;
CREATE VIEW v_publicaciones AS SELECT * FROM publicaciones WHERE eliminado_en IS NULL;
CREATE VIEW v_paises     AS SELECT * FROM paises_habilitados WHERE eliminado_en IS NULL;
CREATE VIEW v_permisos   AS SELECT * FROM permisos   WHERE eliminado_en IS NULL;
CREATE VIEW v_roles      AS SELECT * FROM roles      WHERE eliminado_en IS NULL;
CREATE VIEW v_textos     AS SELECT * FROM textos     WHERE eliminado_en IS NULL;
CREATE VIEW v_idiomas    AS SELECT * FROM idiomas    WHERE eliminado_en IS NULL;


-- =====================================================================
--  13. VISTAS DE SALDO Y CONCILIACIÓN
-- =====================================================================

-- La RETENCION es un movimiento NEGATIVO: al entrar a un mercado el
-- dinero YA salió del disponible. Por eso SUM(monto) ES el disponible,
-- y el total se obtiene sumándole lo retenido, no restándolo.
--
-- Los cast a BIGINT no son cosméticos: SUM(bigint) devuelve NUMERIC y
-- el driver de Node entrega NUMERIC como texto, así que sin el cast
-- las comparaciones fallan en silencio ("5000" !== 5000).
CREATE VIEW v_saldos AS
WITH retenciones AS (
    -- Comprometido en mercados que todavía NO se liquidaron.
    -- RETENCION negativa + LIBERACION positiva: si el usuario salió de
    -- la sala, se anulan entre sí y el neto es 0.
    SELECT m.usuario_id, m.moneda, -SUM(m.monto_centavos) AS retenido
      FROM movimientos m
     WHERE m.tipo IN ('RETENCION','LIBERACION')
       AND m.mercado_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM liquidaciones l
                        WHERE l.mercado_id = m.mercado_id)
     GROUP BY m.usuario_id, m.moneda
),
totales AS (
    SELECT usuario_id, moneda, SUM(monto_centavos) AS total
      FROM movimientos GROUP BY usuario_id, moneda
)
SELECT
    u.id        AS usuario_id,
    u.alias,
    COALESCE(t.moneda, p.moneda, 'PEN')             AS moneda,
    COALESCE(p.simbolo, 'S/')                       AS simbolo,
    COALESCE(p.decimales, 2)                        AS decimales,
    COALESCE(t.total, 0)::BIGINT                    AS disponible_centavos,
    COALESCE(r.retenido, 0)::BIGINT                 AS retenido_centavos,
    (COALESCE(t.total, 0) + COALESCE(r.retenido, 0))::BIGINT AS total_centavos
FROM usuarios u
LEFT JOIN totales t     ON t.usuario_id = u.id
LEFT JOIN retenciones r ON r.usuario_id = u.id AND r.moneda = t.moneda
LEFT JOIN paises_habilitados p
       ON p.codigo = u.pais AND p.eliminado_en IS NULL
WHERE u.eliminado_en IS NULL;


-- Cada mercado liquidado debe cuadrar: lo que entró == lo que salió.
--
-- Se cuentan AJUSTE y LIBERACION además de PREMIO y DEVOLUCION.
-- Omitirlos marcaba como descuadrados mercados perfectamente sanos, y
-- una vista de control con falsos positivos es peor que no tenerla:
-- enseña a ignorar la alarma.
--
-- Los PERDEDORES no llevan movimiento. Su RETENCION ya descontó el
-- dinero al entrar; cuando el mercado entra en `liquidaciones` la vista
-- deja de contarlo como retenido y simplemente no vuelve. Eso ES la
-- pérdida.
CREATE VIEW v_conciliacion_mercados AS
SELECT
    l.mercado_id,
    l.bote_centavos,
    COALESCE(-SUM(m.monto_centavos) FILTER (
        WHERE m.tipo IN ('RETENCION','LIBERACION')), 0)::BIGINT AS retenido,
    COALESCE(SUM(m.monto_centavos) FILTER (
        WHERE m.tipo IN ('PREMIO','DEVOLUCION','AJUSTE')), 0)::BIGINT AS pagado,
    COALESCE(SUM(m.monto_centavos) FILTER (WHERE m.tipo = 'COMISION'), 0)::BIGINT
        AS comision,
    (COALESCE(-SUM(m.monto_centavos) FILTER (
        WHERE m.tipo IN ('RETENCION','LIBERACION')), 0)
     - COALESCE(SUM(m.monto_centavos) FILTER (
        WHERE m.tipo IN ('PREMIO','DEVOLUCION','AJUSTE','COMISION')), 0))::BIGINT
        AS descuadre
FROM liquidaciones l
JOIN movimientos m ON m.mercado_id = l.mercado_id
GROUP BY l.mercado_id, l.bote_centavos;


-- Debe estar SIEMPRE vacía. Cualquier fila aquí es un bug con dinero.
CREATE VIEW v_descuadres AS
SELECT * FROM v_conciliacion_mercados WHERE descuadre <> 0;


-- ---------------------------------------------------------------------
-- Invariante global: el dinero no se crea ni se destruye.
--
-- Vive en TRES sitios, no en dos:
--   1. saldo disponible de los usuarios
--   2. caja de la casa (comisiones)
--   3. retenciones de mercados abiertos
--
--   depositado - retirado + bonos
--       == saldo_usuarios + caja_casa + retenido_abierto
--
-- Y se calcula POR MONEDA: sumar soles con pesos daría un número sin
-- significado. El invariante debe cumplirse dentro de cada una.
--
-- La columna `descuadre` debe ser SIEMPRE 0.
-- ---------------------------------------------------------------------
CREATE VIEW v_conciliacion_global AS
WITH base AS (
    SELECT
        moneda,
        COALESCE(SUM(monto_centavos) FILTER (WHERE tipo = 'DEPOSITO'), 0)  AS depositado,
        COALESCE(-SUM(monto_centavos) FILTER (WHERE tipo = 'RETIRO'), 0)   AS retirado,
        COALESCE(SUM(monto_centavos) FILTER (WHERE tipo = 'BONO'), 0)      AS bonos,
        COALESCE(SUM(monto_centavos) FILTER (WHERE es_casa), 0)            AS caja_casa,
        COALESCE(SUM(monto_centavos) FILTER (WHERE NOT es_casa), 0)        AS saldo_usuarios
      FROM movimientos GROUP BY moneda
),
abierto AS (
    SELECT m.moneda, COALESCE(-SUM(m.monto_centavos), 0) AS retenido_abierto
      FROM movimientos m
     WHERE m.tipo IN ('RETENCION','LIBERACION')
       AND m.mercado_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM liquidaciones l
                        WHERE l.mercado_id = m.mercado_id)
     GROUP BY m.moneda
)
SELECT
    b.moneda,
    b.depositado::BIGINT,
    b.retirado::BIGINT,
    b.bonos::BIGINT,
    b.saldo_usuarios::BIGINT,
    b.caja_casa::BIGINT,
    COALESCE(a.retenido_abierto, 0)::BIGINT AS retenido_abierto,
    (b.depositado - b.retirado + b.bonos)::BIGINT AS entrada_neta,
    (b.saldo_usuarios + b.caja_casa + COALESCE(a.retenido_abierto, 0))::BIGINT
        AS ubicacion_total,
    ((b.depositado - b.retirado + b.bonos)
     - (b.saldo_usuarios + b.caja_casa + COALESCE(a.retenido_abierto, 0)))::BIGINT
        AS descuadre
FROM base b LEFT JOIN abierto a ON a.moneda = b.moneda;


-- Balance de cada mercado, calculado desde las posiciones (fuente de verdad)
CREATE VIEW v_balance_mercados AS
SELECT
    m.id AS mercado_id,
    m.sala_id,
    m.estado,
    COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'A_FAVOR'), 0)   AS total_favor,
    COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'EN_CONTRA'), 0) AS total_contra,
    COUNT(p.id) AS participantes,
    (COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'A_FAVOR'), 0) > 0
     AND COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'EN_CONTRA'), 0) > 0
     AND COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'A_FAVOR'), 0)
       = COALESCE(SUM(p.monto_centavos) FILTER (WHERE p.lado = 'EN_CONTRA'), 0)
    ) AS balanceado
FROM mercados m
LEFT JOIN posiciones p ON p.mercado_id = m.id AND p.eliminado_en IS NULL
WHERE m.eliminado_en IS NULL
GROUP BY m.id, m.sala_id, m.estado;


-- Historial legible de un registro cualquiera
CREATE VIEW v_historial_legible AS
SELECT
    h.id, h.tabla, h.registro_id, h.operacion,
    h.campos_cambiados,
    u.alias AS modificado_por,
    h.creado_en
FROM historial h
LEFT JOIN usuarios u ON u.id = h.usuario_id
ORDER BY h.creado_en DESC;


-- ---------------------------------------------------------------------
-- Retenciones sin posición ni devolución.
--
-- ⚠️ Un PERDEDOR también tiene retención sin pago: su dinero no vuelve,
-- y eso ES la pérdida. Lo que las separa es la POSICIÓN:
--
--     Perdedor:  retención sin pago, PERO tiene posición
--     Huérfana:  retención sin pago, y SIN posición — nadie la reclama
--
-- Confundirlos haría devolverle la apuesta a todo el que perdió.
--
-- Las peligrosas son las de mercados ya LIQUIDADOS: ahí el dinero
-- entró, el mercado cerró, y nadie lo recibió de vuelta.
-- ---------------------------------------------------------------------
CREATE VIEW v_retenciones_huerfanas AS
SELECT
    m.mercado_id,
    m.usuario_id,
    u.alias,
    m.moneda,
    -SUM(m.monto_centavos)::BIGINT AS comprometido,
    EXISTS (SELECT 1 FROM liquidaciones l WHERE l.mercado_id = m.mercado_id)
        AS mercado_liquidado
FROM movimientos m
JOIN usuarios u ON u.id = m.usuario_id
WHERE m.mercado_id IS NOT NULL
  AND m.tipo IN ('RETENCION','LIBERACION')
  AND NOT EXISTS (
      SELECT 1 FROM posiciones p
       WHERE p.mercado_id = m.mercado_id AND p.usuario_id = m.usuario_id
         AND p.eliminado_en IS NULL)
  AND NOT EXISTS (
      SELECT 1 FROM movimientos d
       WHERE d.mercado_id = m.mercado_id AND d.usuario_id = m.usuario_id
         AND d.tipo IN ('PREMIO','DEVOLUCION','AJUSTE'))
GROUP BY m.mercado_id, m.usuario_id, u.alias, m.moneda
HAVING -SUM(m.monto_centavos) > 0;


-- Permisos efectivos de cada persona. Se consulta en cada petición.
CREATE VIEW v_permisos_usuario AS
SELECT DISTINCT ur.usuario_id, p.clave AS permiso, p.area
FROM usuarios_roles ur
JOIN roles r           ON r.id = ur.rol_id       AND r.eliminado_en IS NULL
JOIN roles_permisos rp ON rp.rol_id = r.id       AND rp.eliminado_en IS NULL
JOIN permisos p        ON p.id = rp.permiso_id   AND p.eliminado_en IS NULL
WHERE ur.eliminado_en IS NULL;

CREATE VIEW v_roles_detalle AS
SELECT r.id, r.clave, r.nombre, r.descripcion, r.es_sistema,
       (SELECT count(*) FROM roles_permisos rp
         WHERE rp.rol_id = r.id AND rp.eliminado_en IS NULL)::int AS total_permisos,
       (SELECT count(*) FROM usuarios_roles ur
         WHERE ur.rol_id = r.id AND ur.eliminado_en IS NULL)::int AS total_usuarios
FROM roles r WHERE r.eliminado_en IS NULL;


-- Quiénes declararon un país distinto al de su IP.
-- Es la lista que hay que mirar antes de decidir si se bloquea.
CREATE VIEW v_discrepancias_ubicacion AS
SELECT u.id AS usuario_id, u.alias, u.email,
       u.pais AS pais_declarado, u.pais_detectado,
       u.ubicacion_sospechosa, u.ip_registro,
       u.fecha_crea AS registrado_en,
       (SELECT count(*) FROM verificaciones_ubicacion v
         WHERE v.usuario_id = u.id AND v.resultado = 'BLOQUEADO')::int AS bloqueos
FROM usuarios u
WHERE u.eliminado_en IS NULL
  AND u.pais_detectado IS NOT NULL
  AND u.pais <> u.pais_detectado
ORDER BY u.fecha_crea DESC;


-- ---------------------------------------------------------------------
-- Quiénes tienen acceso al panel.
--
-- Se usa para dos cosas: exigirles segundo factor, e impedirles
-- apostar. Quien puede anular una sala no puede tener dinero en juego.
-- ---------------------------------------------------------------------
CREATE VIEW v_personal AS
SELECT DISTINCT
    u.id AS usuario_id,
    u.alias,
    u.email,
    u.totp_activado_en IS NOT NULL AS tiene_segundo_factor,
    (SELECT count(*) FROM v_permisos_usuario pu
      WHERE pu.usuario_id = u.id)::int AS permisos
FROM usuarios u
JOIN usuarios_roles ur ON ur.usuario_id = u.id AND ur.eliminado_en IS NULL
WHERE u.eliminado_en IS NULL;


-- Intentos fallidos recientes. Un pico aquí es un ataque en curso.
CREATE VIEW v_intentos_sospechosos AS
SELECT
    lower(email) AS email,
    ip,
    count(*)::int AS intentos,
    max(creado_en) AS ultimo
FROM intentos_ingreso
WHERE NOT exitoso
  AND creado_en > now() - interval '1 hour'
GROUP BY lower(email), ip
HAVING count(*) >= 3
ORDER BY count(*) DESC;


-- =====================================================================
--  13b. UNA SALA NUNCA MEZCLA MONEDAS
--
--  La validación también está en el código, pero conviene que la base
--  lo impida: es la clase de regla que no puede depender de que
--  alguien se acuerde de comprobarla.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_verificar_pais_sala()
RETURNS TRIGGER AS $$
DECLARE
    v_pais_sala    CHAR(2);
    v_pais_usuario CHAR(2);
BEGIN
    SELECT s.pais INTO v_pais_sala
      FROM mercados m JOIN salas s ON s.id = m.sala_id
     WHERE m.id = NEW.mercado_id;

    SELECT pais INTO v_pais_usuario FROM usuarios WHERE id = NEW.usuario_id;

    IF v_pais_sala IS DISTINCT FROM v_pais_usuario THEN
        RAISE EXCEPTION
            'El usuario es de % y la sala es de %. Una sala nunca mezcla monedas.',
            v_pais_usuario, v_pais_sala;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pais_sala
    BEFORE INSERT ON posiciones
    FOR EACH ROW EXECUTE FUNCTION fn_verificar_pais_sala();


-- =====================================================================
--  14. DATOS INICIALES
-- =====================================================================

INSERT INTO paises_habilitados
  (codigo, nombre, moneda, simbolo, decimales,
   separador_miles, separador_decimal, minimo_apuesta, maximo_apuesta, zona_horaria)
VALUES ('PE', 'Perú', 'PEN', 'S/', 2, ',', '.', 500, 100000, 'America/Lima');

-- ---------------------------------------------------------------------
-- Membresías.
--
-- La comisión baja con el plan, pero NUNCA llega a 0 (el CHECK de la
-- tabla lo impide). Un plan sin comisión dejaría el ingreso capado
-- justo en los usuarios de mayor volumen: pagan una cuota fija y
-- pueden mover cualquier cantidad sin aportar un sol más.
--
-- La diferencia entre planes se cubre con beneficios que NO cuestan
-- porcentaje: destacados y estadísticas.
--
-- ⚠️ Cuatro planes son muchos para arrancar. Aquí están cargados para
-- que existan, pero conviene lanzar con GRATIS y uno solo, medir, y
-- recién entonces abrir los escalones. Desactivar un plan es cambiar
-- `activo`; quitarlo después molesta a quien ya pagó.
-- ---------------------------------------------------------------------
INSERT INTO planes (codigo, nombre, precio_centavos, tasa_comision,
                    destacados_incluidos, estadisticas_avanzadas, activo) VALUES
    ('GRATIS', 'Gratis',    0, 0.0700, FALSE, FALSE, TRUE),
    ('BASICO', 'Básico', 1000, 0.0550, FALSE, FALSE, FALSE),
    ('PRO',    'Pro',    2000, 0.0400, TRUE,  TRUE,  TRUE),
    ('ELITE',  'Élite',  3500, 0.0300, TRUE,  TRUE,  FALSE);

INSERT INTO deportes (clave, nombre, cuenta_prorroga, tiene_empate) VALUES
    ('FUTBOL',  'Fútbol',  FALSE, TRUE),
    ('BASQUET', 'Básquet', TRUE,  FALSE);

INSERT INTO configuracion (clave, valor, tipo, descripcion) VALUES
    ('tasa_comision_anulacion', '0.00', 'NUMERO',
     'Comisión en anulaciones. Se queda en 0 (sec. 7.2)'),
    ('minutos_cierre_antes',    '15',   'NUMERO',
     'Minutos antes del partido en que se cierra la sala'),
    ('minutos_regresiva',       '5',    'NUMERO',
     'Duración de la cuenta regresiva al balancearse'),
    ('horas_ventana_reprogramacion', '48', 'NUMERO',
     'Más allá de esto, el partido reprogramado se anula'),
    ('max_salas_simultaneas',   '10',   'NUMERO',
     'Tope de salas activas por usuario'),
    ('max_mercados_por_sala',   '3',    'NUMERO',
     'Tope de mercados que puede proponer un anfitrión'),
    ('moneda_simbolo',          'S/',   'TEXTO',
     'Etiqueta de moneda. "fichas" en beta público sin licencia'),
    ('comision_activa',         'false','BOOLEAN',
     'En beta se calcula y muestra, pero no se cobra'),
    ('minimo_plataforma_centavos', '500', 'NUMERO',
     'OBSOLETO: usar paises_habilitados.minimo_apuesta'),
    ('ubicacion_politica', 'ADVERTIR', 'TEXTO',
     'Qué hacer si la IP no coincide con el país declarado: PERMITIR, ADVERTIR o BLOQUEAR'),
    ('ubicacion_verificar_ingreso', 'false', 'BOOLEAN',
     'Verificar también al iniciar sesión, no solo al registrarse'),
    ('ubicacion_bloquear_vpn', 'false', 'BOOLEAN',
     'Rechazar conexiones marcadas como VPN o proxy'),
    ('max_intentos_ingreso', '5', 'NUMERO',
     'Intentos fallidos antes de bloquear la cuenta'),
    ('minutos_bloqueo_cuenta', '15', 'NUMERO',
     'Cuánto dura el bloqueo tras superar los intentos'),
    ('horas_validez_invitacion', '72', 'NUMERO',
     'Vigencia del enlace de invitación al equipo'),
    ('minutos_validez_recuperacion', '30', 'NUMERO',
     'Vigencia del enlace para recuperar la contraseña'),
    ('minutos_inactividad_panel', '30', 'NUMERO',
     'Sesión del panel expira tras este tiempo sin actividad'),
    ('minutos_confirmacion_identidad', '10', 'NUMERO',
     'Tras confirmar la contraseña, cuánto dura la confianza antes de volver a pedirla'),
    ('totp_obligatorio_admin', 'true', 'BOOLEAN',
     'Exigir segundo factor a quien tenga acceso al panel'),
    ('admin_puede_apostar', 'false', 'BOOLEAN',
     'Si un empleado puede apostar. Debe quedarse en false: quien anula salas no puede tener dinero en juego');


-- ---------------------------------------------------------------------
-- Permisos. Estos SÍ son código: cada uno protege un endpoint.
-- ---------------------------------------------------------------------
INSERT INTO permisos (clave, area, descripcion) VALUES
    ('paises.ver',          'Países',   'Ver los países habilitados'),
    ('paises.gestionar',    'Países',   'Agregar países, cambiar moneda y límites'),
    ('deportes.ver',        'Deportes', 'Ver deportes, ligas y mercados'),
    ('deportes.gestionar',  'Deportes', 'Habilitar ligas y mercados'),
    ('comisiones.ver',      'Dinero',   'Ver tasas y planes'),
    ('comisiones.gestionar','Dinero',   'Cambiar tasas de comisión y planes'),
    ('ajustes.crear',       'Dinero',   'Insertar ajustes contables manuales'),
    ('usuarios.ver',        'Usuarios', 'Buscar y ver cuentas'),
    ('usuarios.crear',      'Usuarios', 'Crear cuentas del equipo'),
    ('seguridad.ver',       'Sistema',  'Ver intentos de ingreso y alertas'),
    ('usuarios.suspender',  'Usuarios', 'Suspender o reactivar cuentas'),
    ('usuarios.roles',      'Usuarios', 'Asignar roles a otras personas'),
    ('reportes.ver',        'Reportes', 'Ver ingresos, volumen y actividad'),
    ('reportes.exportar',   'Reportes', 'Descargar los reportes'),
    ('salas.ver',           'Operación','Ver cualquier sala y su detalle'),
    ('salas.anular',        'Operación','Anular salas atascadas'),
    ('incidentes.ver',      'Operación','Ver incidentes del sistema'),
    ('incidentes.resolver', 'Operación','Marcar incidentes como resueltos'),
    ('config.ver',          'Sistema',  'Ver los parámetros del sistema'),
    ('config.gestionar',    'Sistema',  'Cambiar parámetros del sistema'),
    ('textos.gestionar',    'Sistema',  'Editar textos y traducciones'),
    ('roles.gestionar',     'Sistema',  'Crear roles y asignarles permisos');

-- ---------------------------------------------------------------------
-- Roles de arranque. Son ejemplos: se editan y se crean otros desde el
-- panel. Solo SUPER_ADMIN está protegido.
-- ---------------------------------------------------------------------
INSERT INTO roles (clave, nombre, descripcion, es_sistema) VALUES
    ('SUPER_ADMIN', 'Administrador general',
     'Todos los permisos. No se puede borrar.', TRUE),
    ('OPERACIONES', 'Operaciones',
     'Resuelve el día a día: salas atascadas e incidentes.', FALSE),
    ('FINANZAS', 'Finanzas',
     'Ve los reportes y gestiona comisiones y planes.', FALSE),
    ('SOPORTE', 'Soporte',
     'Atiende usuarios. Ve cuentas y salas, no toca dinero.', FALSE),
    ('ANALISTA', 'Analista',
     'Solo lectura de reportes. No puede cambiar nada.', FALSE);

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permisos p WHERE r.clave = 'SUPER_ADMIN';

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave IN (
    'salas.ver','salas.anular','incidentes.ver','incidentes.resolver',
    'usuarios.ver','deportes.ver','deportes.gestionar','reportes.ver')
 WHERE r.clave = 'OPERACIONES';

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave IN (
    'reportes.ver','reportes.exportar','comisiones.ver','comisiones.gestionar',
    'paises.ver','usuarios.ver')
 WHERE r.clave = 'FINANZAS';

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave IN (
    'usuarios.ver','usuarios.suspender','salas.ver','incidentes.ver')
 WHERE r.clave = 'SOPORTE';

INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id FROM roles r JOIN permisos p ON p.clave IN (
    'reportes.ver','paises.ver','deportes.ver','comisiones.ver','config.ver')
 WHERE r.clave = 'ANALISTA';

INSERT INTO idiomas (codigo, nombre) VALUES ('es', 'Español');

-- ---------------------------------------------------------------------
-- Textos que ve el usuario. Se editan desde el panel: afinar el
-- mensaje de un error es de las cosas que más se retocan, y no debería
-- exigir un despliegue.
-- ---------------------------------------------------------------------
INSERT INTO textos (clave, idioma, valor, contexto) VALUES
    ('error.SALDO_INSUFICIENTE', 'es', 'No te alcanza para esta apuesta.', 'Error al apostar'),
    ('error.SALA_CERRADA',       'es', 'La sala ya cerró.', 'Error al apostar'),
    ('error.SALA_LLENA',         'es', 'La sala se llenó mientras decidías.', 'Error al apostar'),
    ('error.CIERRE_INMINENTE',   'es', 'Ya no se puede: falta muy poco para el partido.', 'Error al apostar'),
    ('error.POSICION_CONTRADICTORIA','es','Ya estás en el otro lado de esta apuesta.', 'Error al apostar'),
    ('error.POSICION_DUPLICADA', 'es', 'Ya tienes una apuesta aquí.', 'Error al apostar'),
    ('error.MONTO_FUERA_DE_RANGO','es','El monto está fuera del rango permitido.', 'Error al apostar'),
    ('error.LIMITE_SALAS',       'es', 'Ya estás en demasiadas salas. Espera a que alguna se resuelva.', 'Error al apostar'),
    ('error.PAIS_NO_HABILITADO', 'es', 'Por ahora no operamos en tu país.', 'Error de cuenta'),
    ('error.PAIS_DISTINTO',      'es', 'Esta sala es de otro país y usa otra moneda.', 'Error al apostar'),
    ('error.CREDENCIALES',       'es', 'Correo o contraseña incorrectos.', 'Error de ingreso'),
    ('error.ALIAS_EN_USO',       'es', 'Ese alias ya está en uso.', 'Error de registro'),
    ('error.EMAIL_EN_USO',       'es', 'Ese correo ya está registrado.', 'Error de registro'),
    ('error.MENOR_DE_EDAD',      'es', 'Debes ser mayor de 18 años.', 'Error de registro'),
    ('error.GENERICO',           'es', 'Algo falló de nuestro lado. Ya lo estamos viendo.', 'Error inesperado'),
    ('sala.falta_lado',          'es', 'Faltan {monto} {lado}', 'Muro de salas'),
    ('sala.balanceada',          'es', 'Sala completa. Se cierra en {tiempo}.', 'Detalle de sala'),
    ('sala.aviso_cierre',        'es', 'Se cierra al llenarse o {minutos} min antes del partido. Después no puedes retirarte.', 'Detalle de sala'),
    ('sala.sin_resultado',       'es', 'No hubo resultado, así que te devolvimos todo. No cobramos comisión.', 'Anulación'),
    ('mercado.TOTAL_GOLES',      'es', 'Más de {linea} goles', 'Etiqueta de mercado'),
    ('mercado.TOTAL_CORNERS',    'es', 'Más de {linea} córners', 'Etiqueta de mercado'),
    ('mercado.TOTAL_TARJETAS',   'es', 'Más de {linea} tarjetas', 'Etiqueta de mercado'),
    ('mercado.AMBOS_ANOTAN',     'es', 'Ambos anotan', 'Etiqueta de mercado'),
    ('mercado.DOBLE_OPORTUNIDAD','es', 'Gana {equipo}', 'Etiqueta de mercado'),
    ('mercado.GANADOR_DIRECTO',  'es', 'Gana {equipo}', 'Etiqueta de mercado'),
    ('correo.invitacion.asunto', 'es', 'Te crearon una cuenta en {app}', 'Correo'),
    ('correo.recuperacion.asunto','es','Recupera tu contraseña', 'Correo'),
    ('correo.alerta.asunto',     'es', 'Cambio en tu cuenta', 'Correo'),
    ('error.PASSWORD_TEMPORAL',  'es', 'Tienes que cambiar tu contraseña antes de continuar.', 'Error de ingreso'),
    ('error.CUENTA_BLOQUEADA',   'es', 'Demasiados intentos. Vuelve a probar en unos minutos.', 'Error de ingreso'),
    ('error.TOTP_REQUERIDO',     'es', 'Ingresa el código de tu aplicación de autenticación.', 'Error de ingreso'),
    ('error.TOTP_INVALIDO',      'es', 'Ese código no es válido o ya venció.', 'Error de ingreso'),
    ('error.PERSONAL_NO_APUESTA','es', 'Las cuentas del equipo no pueden apostar.', 'Error al apostar');


-- ---------------------------------------------------------------------
-- Comprobación final: el esquema se revierte entero si algo quedó mal.
-- ---------------------------------------------------------------------
DO $$
DECLARE n INT;
BEGIN
    SELECT count(*) INTO n FROM permisos WHERE eliminado_en IS NULL;
    IF n <> 22 THEN RAISE EXCEPTION 'Se esperaban 22 permisos, hay %', n; END IF;

    SELECT total_permisos INTO n FROM v_roles_detalle WHERE clave = 'SUPER_ADMIN';
    IF n <> 22 THEN
        RAISE EXCEPTION 'SUPER_ADMIN tiene % permisos en vez de 22', n;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'v_salas' AND column_name = 'pais') THEN
        RAISE EXCEPTION 'v_salas no expone la columna pais';
    END IF;

    SELECT count(*) INTO n FROM v_conciliacion_global WHERE descuadre <> 0;
    IF n > 0 THEN RAISE EXCEPTION 'La base arranca descuadrada'; END IF;
END $$;

COMMIT;


-- =====================================================================
--  PERMISOS (ejecutar al crear el rol de la aplicación)
-- =====================================================================
-- CREATE ROLE app_user LOGIN PASSWORD '...';
-- GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO app_user;
--
-- Sin DELETE en ninguna tabla: el borrado es siempre lógico.
-- REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM app_user;
--
-- Y sin UPDATE en las append-only:
-- REVOKE UPDATE ON movimientos, liquidaciones, historial, eventos_webhook
--     FROM app_user;
