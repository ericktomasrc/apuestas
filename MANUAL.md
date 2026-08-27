# Manual de operación

**Proyecto:** App de salas de apuestas P2P
**Estado:** Fase 1 completa — núcleo económico verificado
**Fecha:** 24 de agosto de 2026

Este manual sirve para **levantar el proyecto desde cero** en cualquier máquina. Si se malogra la PC, con esto y los archivos del repositorio se reconstruye todo.

---

## 1. Reinstalar desde cero

### 1.1 Programas necesarios

| Programa | Dónde | Para qué |
|---|---|---|
| Node.js 22 LTS | https://nodejs.org | Ejecutar el código |
| Docker Desktop | https://docker.com/products/docker-desktop | PostgreSQL y Redis |
| VS Code | https://code.visualstudio.com | Editor |
| Git | https://git-scm.com | Control de versiones |
| DBeaver | https://dbeaver.io/download/ | Ver la base gráficamente (opcional) |

Verificar:

```powershell
node --version      # v22.x
docker --version
git --version
```

### 1.2 Terminal recomendada

En Windows, VS Code trae PowerShell por defecto. Funciona, pero **la redirección con `<` no sirve**, así que los comandos de migración usan `Get-Content`.

Para usar la sintaxis estándar: `Ctrl + Shift + P` → `Terminal: Select Default Profile` → **Git Bash**.

### 1.3 Estructura del proyecto

```
salas-apuestas/
├── .gitignore
├── docker-compose.yml
├── package.json
├── tsconfig.json
├── README.md
├── MANUAL.md                      ← este archivo
├── sql/
│   └── 001_esquema.sql            ← ÚNICO archivo de esquema
└── src/
    ├── db.ts                      Conexión y transacciones
    ├── liquidacion.ts             Motor de liquidación (puro)
    ├── liquidacion.test.ts        27 pruebas unitarias
    ├── repositorio.ts             Operaciones con la base
    └── integracion.test.ts        20 pruebas de integración
```

---

## 2. Arranque completo (los 6 comandos)

Con Docker Desktop **abierto** y la ballena fija junto al reloj:

```powershell
npm install
npm test
npm run db:up
Get-Content sql\001_esquema.sql | docker compose exec -T db psql -U postgres -d apuestas
npm run test:db
```

Resultado esperado:

- `npm test` → **27 pasadas, 0 fallidas**
- La migración → termina en **COMMIT**
- `npm run test:db` → **20 pasadas, 0 fallidas**

Si los tres salen bien, el sistema está sano.

### En Git Bash

El único comando que cambia es la migración:

```bash
docker compose exec -T db psql -U postgres -d apuestas < sql/001_esquema.sql
```

---

## 3. Comandos del día a día

| Comando | Qué hace |
|---|---|
| `npm test` | 27 pruebas del motor (no necesita base) |
| `npm run test:db` | 20 pruebas contra PostgreSQL |
| `npm run check` | Verifica tipos sin compilar |
| `npm run db:up` | Levanta Postgres y Redis |
| `npm run db:down` | Los apaga (conserva los datos) |
| `npm run db:shell` | Abre psql |
| `npm run db:reset` | **Borra la base entera** y la recrea vacía |
| `npm run crear-admin -- alias correo clave` | Crea el primer administrador |
| `npm run test:all` | Las 7 suites de pruebas seguidas |
| `npm run db:logs` | Ver el log de Postgres en vivo |

### Reiniciar la base por completo

```powershell
npm run db:reset
```

Esperar unos 10 segundos a que Postgres arranque, y luego:

```powershell
Get-Content sql\001_esquema.sql | docker compose exec -T db psql -U postgres -d apuestas
npm run test:db
```

---

## 4. Conectarse a la base

### Desde la terminal

```powershell
npm run db:shell
```

Comandos útiles dentro de psql:

```
\dt              listar tablas (28)
\dv              listar vistas (26)
\d nombre_tabla  ver la estructura de una tabla
\pset pager off  evitar el paginador
\q               salir
```

⚠️ Los comandos que empiezan con `\` son de psql. Todo lo demás es SQL y **necesita punto y coma** al final. Si el prompt cambia de `apuestas=#` a `apuestas-#`, psql cree que la sentencia sigue abierta: escribe `\r` para limpiarla.

### Desde DBeaver

```
Host:       localhost
Puerto:     5432
Base:       apuestas
Usuario:    postgres
Contraseña: local123
```

Para ver el diagrama entidad-relación: click derecho en el esquema `public` → **View Diagram**.

---

## 5. Consultas de verificación

Pegar en psql o DBeaver cuando haga falta comprobar que todo está sano.

### ¿La base está bien?

```sql
-- Debe estar SIEMPRE vacía. Cualquier fila es un bug con dinero.
SELECT * FROM v_descuadres;

-- La columna descuadre debe ser 0.
SELECT * FROM v_conciliacion_global;
```

### Saldos

```sql
SELECT alias,
       disponible_centavos / 100.0 AS disponible,
       retenido_centavos   / 100.0 AS retenido,
       total_centavos      / 100.0 AS total
FROM v_saldos
ORDER BY total_centavos DESC;
```

### Movimientos de un usuario

```sql
SELECT tipo, monto_centavos / 100.0 AS monto, mercado_id, fecha_crea
FROM movimientos
WHERE usuario_id = (SELECT id FROM usuarios WHERE alias = 'juan')
ORDER BY id DESC;
```

### Balance de los mercados

```sql
SELECT mercado_id, estado,
       total_favor / 100.0  AS a_favor,
       total_contra / 100.0 AS en_contra,
       participantes, balanceado
FROM v_balance_mercados
WHERE estado NOT IN ('LIQUIDADO','ANULADO');
```

### Historial de cambios

```sql
SELECT tabla, operacion, campos_cambiados, modificado_por, creado_en
FROM v_historial_legible
LIMIT 30;
```

### Configuración

```sql
SELECT clave, valor, descripcion FROM configuracion ORDER BY clave;

-- Cambiar un parámetro (queda registrado en el historial)
UPDATE configuracion SET valor = '20' WHERE clave = 'minutos_cierre_antes';
```

---

## 6. Problemas frecuentes

### `failed to connect to the docker API`

Docker Desktop no está corriendo. Abrirlo desde el menú Inicio y esperar a que la ballena junto al reloj deje de animarse.

Si no arranca:

```powershell
wsl --list --verbose
```

`docker-desktop` debe decir **Running**. Si dice `Stopped`, es que la aplicación no está abierta. Si WSL no está instalado, en PowerShell **como administrador**:

```powershell
wsl --install
```

Y **reiniciar la PC** (obligatorio, no basta cerrar sesión).

También revisar que la virtualización esté activa: Ctrl+Shift+Esc → Rendimiento → CPU → "Virtualización: Habilitada". Si no, hay que activarla en la BIOS (Intel VT-x, AMD-V o SVM Mode).

### `Missing script: "test:db"`

El `package.json` está desactualizado. Debe contener:

```json
"test:db": "tsx src/integracion.test.ts"
```

### `mkdir : No se encuentra ningún parámetro de posición`

Es PowerShell, que no entiende la sintaxis de bash:

| Bash | PowerShell |
|---|---|
| `mkdir -p src sql` | `mkdir src, sql` |
| `cat archivo` | `Get-Content archivo` |
| `comando < archivo` | `Get-Content archivo \| comando` |

### `No se encuentra la ruta de acceso ...sql`

Falta el archivo. Verificar:

```powershell
ls sql
ls src
```

`sql` debe tener 1 archivo, `src` debe tener 5.

### Acentos que salen como `f??sico`

La consola de Windows no está en UTF-8. Solo afecta cómo se ven en pantalla, **no los datos**:

```powershell
chcp 65001
```

### `port is already allocated` al levantar Docker

Hay otro PostgreSQL usando el puerto 5432. O se apaga ese servicio, o se cambia el puerto en `docker-compose.yml`:

```yaml
ports:
  - "5433:5432"
```

Y entonces hay que conectarse al 5433.

### Las pruebas fallan después de cambiar código

```powershell
npm run check     # ver errores de tipos primero
```

Si el error viene de la base, revisar que la migración esté aplicada:

```powershell
npm run db:shell
```
```sql
\dt
```

Deben salir 28 tablas.

---

## 7. Guardar el trabajo

### Primera vez

```powershell
git init
git add .
git commit -m "Fase 1: nucleo economico"
```

### Cada vez que algo funciona

```powershell
git add .
git commit -m "descripcion breve de lo que se hizo"
```

### Copia de seguridad remota

Crear un repositorio **privado** en GitHub y luego:

```powershell
git remote add origin https://github.com/USUARIO/salas-apuestas.git
git push -u origin main
```

⚠️ **Privado, no público.** Aunque el código no tiene secretos hoy, mañana tendrá credenciales de pasarela y llaves de API.

### Respaldar la base

```powershell
docker compose exec -T db pg_dump -U postgres apuestas > respaldo.sql
```

Restaurar:

```powershell
Get-Content respaldo.sql | docker compose exec -T db psql -U postgres -d apuestas
```

---

## 8. Qué hay construido

### Motor de liquidación (`src/liquidacion.ts`)

Función pura, sin base de datos. Reparte el bote, aplica la comisión de cada usuario y verifica el invariante.

**Las cinco reglas que no se negocian:**

1. **Todo en centavos enteros.** `20.00` no existe, existe `2000`.
2. **El saldo no se guarda, se calcula** sumando movimientos inmutables.
3. **La comisión sale de la ganancia**, nunca del capital ni de una devolución.
4. **La tasa se resuelve por usuario ganador**, no por sala. Primero se reparte la ganancia, después se aplica la tasa de cada quien.
5. **`suma(pagos) + comisión == bote`**, al centavo, siempre.

### Base de datos (`sql/001_esquema.sql`)

21 tablas, 8 tipos enumerados, 17 vistas.

**Borrado lógico en todo**, impuesto por triggers: `DELETE` físico lanza excepción. Para borrar:

```sql
UPDATE salas SET eliminado_en = now() WHERE id = '...';
```

**Cuatro tablas son append-only** (`movimientos`, `liquidaciones`, `historial`, `eventos_webhook`): no admiten `UPDATE` ni `DELETE`. Un error se corrige insertando un `AJUSTE` con motivo y operador.

**Auditoría automática:** cada tabla lleva `usuario_crea`, `usuario_modifica`, `fecha_crea`, `fecha_modifica`, `eliminado_en`, `eliminado_por`, y cada cambio queda en `historial` con el antes, el después y qué columnas cambiaron.

**Consultar siempre las vistas `v_*`**, nunca las tablas directas: ya traen el filtro de borrados.

### Repositorio (`src/repositorio.ts`)

Conecta el motor con la base. Todo dentro de **una transacción**: al liquidar, o entran todos los movimientos o no entra ninguno.

Tres barreras contra el pago duplicado:

1. `FOR UPDATE` sobre la fila del mercado
2. La clave primaria de `liquidaciones` se inserta **antes** de pagar
3. `UNIQUE` de `clave_idempotencia` en cada movimiento

---

## 9. Bugs que encontraron las pruebas

Registro de lo que se corrigió, para no repetirlo.

| Bug | Síntoma | Corrección |
|---|---|---|
| **Doble descuento al perdedor** | Se insertaba `PERDIDA` además de la `RETENCION`, que ya había descontado. Desaparecían S/40 por sala 2v2 | Los perdedores no llevan movimiento: la retención ya hace el trabajo |
| **Vista de saldos** | Restaba la retención dos veces: mostraba S/10 disponibles teniendo S/30 | `SUM(monto)` ES el disponible; el total se obtiene sumando lo retenido |
| **`usuario_crea NOT NULL`** | Los procesos automáticos no tienen usuario y el INSERT reventaba | Permitir NULL = "lo hizo el sistema" |
| **Montos como texto** | `SUM(bigint)` devuelve `NUMERIC` y el driver lo entrega como string: `"5000" !== 5000` | Cast a `::BIGINT` en las vistas + `Number()` defensivo |
| **Invariante global incompleto** | Comparaba `depositado == saldos + caja`, olvidando las retenciones abiertas | El dinero vive en **tres** sitios, no en dos |
| **Índices antes de la columna** | Nueve índices usaban `eliminado_en` antes de que existiera | Moverlos después de `aplicar_auditoria()` |
| **`CHECK` con subconsulta** | PostgreSQL lo prohíbe; el parser lo acepta pero el motor lo rechaza | Función `IMMUTABLE` |
| **`CREATE OR REPLACE VIEW`** | No permite cambiar el tipo de una columna | `DROP` y recrear, respetando dependencias |

Ninguno se veía leyendo el código. Por eso las pruebas van antes que las pantallas.

---

## 10. Siguiente paso

Módulo `rooms`: estados de sala y mercado, transiciones, validaciones de la sección 9 de la especificación, y cálculo de balance leyendo la configuración en vez de números fijos.

Documentos de referencia:

- **Especificación funcional v1.4** — la lógica de negocio
- **Flujos de pantalla y guiones de prueba** — la interfaz y los casos
- **Este manual** — cómo levantar y operar
