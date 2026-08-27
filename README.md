# Salas de apuestas P2P — Fase 1: núcleo económico

Implementación de la sección 8 de la Especificación funcional v1.4.

Este es el único módulo que toca dinero. **Va antes que cualquier pantalla.** Si tiene un bug, todo lo demás se construye sobre arena.

---

## Archivos

```
salas-apuestas/
├── docker-compose.yml           PostgreSQL 16 + Redis 7
├── package.json
├── tsconfig.json
├── .gitignore
├── sql/
│   └── 001_esquema_inicial.sql  21 tablas, 8 enums, 16 vistas
└── src/
    ├── liquidacion.ts           Función de liquidación (pura)
    └── liquidacion.test.ts      27 pruebas
```

---

## Puesta en marcha

### Requisitos

- Node.js 22 LTS — https://nodejs.org
- Docker Desktop — https://docker.com/products/docker-desktop
- VS Code — https://code.visualstudio.com

### Windows: usa Git Bash

En VS Code: `Ctrl + Shift + P` → `Terminal: Select Default Profile` → **Git Bash**.

PowerShell no entiende la sintaxis de los comandos de abajo. Si insistes en usarlo, `mkdir -p src sql` se escribe `mkdir src, sql`, y la redirección con `<` del paso de migración **no funciona** — ahí sí necesitas Git Bash.

### Paso 1 — Instalar dependencias

```bash
npm install
```

### Paso 2 — Probar la lógica (sin base de datos)

```bash
npm test
```

Debe imprimir **27 pasadas, 0 fallidas**. Si esto funciona, el motor económico ya corre en tu máquina.

```bash
npm run check    # verificación de tipos en modo estricto
```

### Paso 3 — Levantar la base de datos

Con Docker Desktop abierto:

```bash
npm run db:up
docker compose ps        # ambos servicios en "running"
```

### Paso 4 — Aplicar el esquema

```bash
docker compose exec -T db psql -U postgres -d apuestas < sql/001_esquema_inicial.sql
```

Verificar que se crearon las tablas:

```bash
npm run db:shell
```

Y dentro de `psql`:

```sql
\dt              -- 21 tablas
\dv              -- 16 vistas
SELECT * FROM planes;
\q               -- salir
```

### Comandos útiles

| Comando | Qué hace |
|---|---|
| `npm test` | Corre las 27 pruebas |
| `npm run check` | Verifica tipos sin compilar |
| `npm run db:up` | Levanta Postgres y Redis |
| `npm run db:shell` | Abre psql |
| `npm run db:reset` | **Borra todo** y vuelve a empezar |
| `npm run db:down` | Apaga los contenedores |

---

## Las reglas que este código no negocia

**1. Todo en centavos enteros.** `20.00` no existe; existe `2000`. El punto flotante en dinero produce descuadres que aparecen meses después.

**2. El saldo no se guarda, se calcula.** Sumando movimientos inmutables. Si fuera un número editable, dos liquidaciones simultáneas leerían el mismo valor y la segunda pisaría a la primera: un pago desaparece sin rastro.

**3. La comisión sale de la ganancia.** Nunca del capital del ganador, nunca de una devolución. En una anulación la casa cobra **cero** — hay un `CHECK` que lo impide.

**4. La tasa se resuelve por usuario ganador, no por sala.** En un mismo mercado conviven 4% y 7%. Y el orden importa: primero se reparte la ganancia proporcionalmente, después se aplica la tasa de cada quien sobre su parte. Al revés, el usuario gratis subsidia al suscriptor.

**5. `suma(pagos) + comisión == bote`.** Al centavo, siempre. Se verifica en toda liquidación. Si falla, la transacción se revierte y se registra un incidente.

---

## Borrado lógico, impuesto por la base de datos

Ninguna fila se elimina físicamente. **No es una convención que se pueda olvidar:** cada tabla tiene un trigger que lanza excepción ante `DELETE`.

Para borrar:

```sql
UPDATE salas SET eliminado_en = now() WHERE id = '...';
```

Y al crear el rol de la aplicación:

```sql
REVOKE DELETE ON ALL TABLES IN SCHEMA public FROM app_user;
REVOKE UPDATE ON movimientos, liquidaciones, historial, eventos_webhook FROM app_user;
```

### Consulta siempre las vistas `v_*`

```sql
SELECT * FROM v_salas;      -- correcto
SELECT * FROM salas;        -- trae también los borrados
```

Las vistas ya traen `WHERE eliminado_en IS NULL`. Es la forma de que sea imposible olvidar el filtro y mostrarle a alguien una sala que ya no existe.

### Índices únicos parciales

Si `alias` fuera único a secas, borrar al usuario "juan" dejaría ese alias bloqueado para siempre — el registro sigue ahí. Por eso los índices únicos solo miran las filas vivas.

---

## Auditoría e historial

**Cada tabla** lleva `usuario_crea`, `usuario_modifica`, `fecha_crea`, `fecha_modifica`, `eliminado_en`, `eliminado_por`.

**Cada cambio** queda en la tabla `historial` con los datos antes, después y qué columnas cambiaron:

```sql
SELECT * FROM v_historial_legible WHERE tabla = 'salas' LIMIT 20;
```

La aplicación debe fijar el usuario al inicio de cada request para que los triggers sepan quién hizo el cambio:

```sql
SET LOCAL app.usuario_id = '<uuid del usuario>';
```

### La excepción: `movimientos`

No lleva `eliminado_en` ni `usuario_modifica`, **a propósito**. Es append-only por naturaleza: una fila nunca cambia ni se anula. ¿Hubo un error? Se inserta un `AJUSTE` con motivo y operador.

Poner columnas de borrado ahí sugeriría que un movimiento se puede borrar, y eso es exactamente lo que no debe poder hacerse. Esa tabla ya es su propio historial.

Lo mismo aplica a `liquidaciones`, `historial` y `eventos_webhook`.

---

## El residuo del redondeo

Al repartir proporcionalmente se trunca hacia abajo, así que casi siempre sobran uno o dos centavos. **Van a la casa.**

No es una decisión de negocio: es la única forma de que el invariante cierre exacto. Si se repartieran entre los ganadores habría que decidir a quién dárselos, y el reparto dejaría de ser determinista.

La prueba de 400 combinaciones aleatorias existe para confirmar que ningún reparto rompe el invariante — los casos de la spec son redondos y bonitos, pero los descuadres aparecen con montos primos y divisiones inexactas.

---

## Verificar que la base está sana

```sql
-- Debe estar SIEMPRE vacía. Cualquier fila aquí es un bug con dinero.
SELECT * FROM v_descuadres;

-- Saldos de todos los usuarios
SELECT alias, total_centavos, retenido_centavos, disponible_centavos
FROM v_saldos;

-- Balance de cada mercado, desde las posiciones (fuente de verdad)
SELECT * FROM v_balance_mercados;
```

---

## Qué falta

Esto es la lógica pura más el esquema. Falta la capa que los conecta:

- [ ] Repositorio que inserte los movimientos **en una sola transacción**
- [ ] Idempotencia real contra la tabla `liquidaciones`
- [ ] Pruebas de integración: verificar que los triggers de append-only **realmente** bloquean
- [ ] Prueba de concurrencia: dos liquidaciones simultáneas no deben pisarse
- [ ] Proceso de conciliación diaria consultando `v_descuadres`

Después de eso, recién el módulo `rooms`.
