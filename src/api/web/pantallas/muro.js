'use strict';

/**
 * El muro.
 *
 * Lo que la gente viene a hacer es encontrar una sala que necesite su
 * lado. Por eso el filtro por defecto es "les falta gente": una sala
 * completa no se puede tomar, y mostrarla arriba es hacerle perder el
 * tiempo a quien busca dónde entrar.
 *
 * En pantalla ancha, la columna lateral muestra qué está pasando y en
 * qué ligas hay partidos. Son las dos cosas que ayudan a decidir sin
 * salir de aquí.
 */
PANTALLAS.muro = async () => {
  const filtro = S.datos.filtroMuro ?? 'faltan';
  const consulta = filtro === 'faltan' ? '?soloNecesitanGente=true' : '';

  // En paralelo: la lista es lo que importa, lo demás acompaña. Si la
  // actividad o las ligas fallan, el muro se muestra igual.
  const [r, act, lig] = await Promise.all([
    api('/salas' + consulta),
    api('/actividad?limite=12').catch(() => ({ actividad: [] })),
    api('/ligas').catch(() => ({ ligas: [] })),
  ]);

  const salas = r.salas ?? [];
  S.datos.actividad = act.actividad ?? [];
  S.datos.ligas = lig.ligas ?? [];

  pintar(armazon(`
    <h1 class="titulo">Salas abiertas</h1>
    <p class="sub">Entra al lado que quieras. El que acierta se lleva todo.</p>

    <button class="llamada" onclick="ir('crear')">
      <div class="punto creada">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </div>
      <div class="llamada-texto">
        <strong>Abrir mi propia sala</strong>
        <small>Eliges el partido y la apuesta. Crearla no cuesta nada.</small>
      </div>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--tenue)"
        stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>

    <div class="filtros">
      ${[['faltan','Les falta gente'], ['todas','Todas']]
        .map(([id, nombre]) => `
          <button class="filtro ${filtro === id ? 'activo' : ''}"
            onclick="S.datos.filtroMuro='${id}';ir('muro')">${nombre}</button>`).join('')}
    </div>

    ${salas.length === 0
      ? vacioMuro(filtro)
      : `<div class="rejilla-salas">${salas.map(tarjetaSala).join('')}</div>`}

    <div class="solo-angosto" style="margin-top:22px">
      ${bloqueActividad(act.actividad ?? [], 4)}
    </div>
  `,
  `
    ${bloqueActividad(act.actividad, 5)}
    ${bloqueLigas(lig.ligas, 5)}
  `));
};

/**
 * Los bloques laterales siempre aparecen, tengan datos o no.
 *
 * Un hueco donde antes había algo se lee como un error. Y una columna
 * que aparece y desaparece hace saltar el resto de la página.
 */
function bloqueActividad(lista, tope) {
  const hay = lista.length > 0;
  return `
  <div class="bloque">
    <h3>Qué está pasando ${hay ? `<span>${lista.length}</span>` : ''}</h3>
    ${hay
      ? lista.slice(0, tope).map(filaActividad).join('')
      : `<div class="bloque-vacio">
           Cuando alguien abra una sala o gane una apuesta, aparece aquí.
         </div>`}
    ${lista.length > tope
      ? `<button class="bloque-mas" onclick="verTodaActividad()">
           Ver las ${lista.length}
         </button>` : ''}
  </div>`;
}

function bloqueLigas(lista, tope) {
  const hay = lista.length > 0;
  const partidos = lista.reduce((t, l) => t + l.partidos, 0);
  return `
  <div class="bloque">
    <h3>Dónde hay partidos ${hay ? `<span>${partidos}</span>` : ''}</h3>
    ${hay
      ? lista.slice(0, tope).map(filaLiga).join('')
      : `<div class="bloque-vacio">
           Todavía no hay ligas con partidos por jugarse.
         </div>`}
    ${lista.length > tope
      ? `<button class="bloque-mas" onclick="verTodasLigas()">
           Ver las ${lista.length} ligas
         </button>` : ''}
  </div>`;
}

function filaLiga(l) {
  return `
  <button class="bloque-fila" style="width:100%" onclick="ir('crear')">
    <span style="text-align:left;min-width:0">
      ${esc(l.nombre)}
      <small>${esc(l.deporte)}${l.pais ? ' · ' + esc(l.pais) : ''}</small>
    </span>
    <span style="text-align:right;flex-shrink:0">
      <b>${l.partidos}</b>
      <small>${l.salas_abiertas} sala(s)</small>
    </span>
  </button>`;
}

/**
 * Lista completa de actividad, con filtro por tipo.
 *
 * El filtro por tipo es el útil: quien busca dónde entrar quiere ver
 * salas nuevas, no quién ganó ayer.
 */
function verTodaActividad(filtro = 'todo') {
  const lista = S.datos.actividad ?? [];
  const filtrada = filtro === 'todo' ? lista : lista.filter(a => a.tipo === filtro);

  const tipos = [
    ['todo', 'Todo'],
    ['SALA_CREADA', 'Salas nuevas'],
    ['SALA_BALANCEADA', 'Completas'],
    ['RESULTADO_GANADOR', 'Ganadores'],
  ].filter(([id]) => id === 'todo' || lista.some(a => a.tipo === id));

  hoja('Qué está pasando', `${lista.length} en las últimas horas`, `
    <div class="filtros">
      ${tipos.map(([id, nombre]) => `
        <button class="filtro ${filtro === id ? 'activo' : ''}"
          onclick="verTodaActividad('${id}')">${nombre}</button>`).join('')}
    </div>
    <div class="bloque" style="margin:0">
      ${filtrada.length
        ? filtrada.map(filaActividad).join('')
        : '<div class="bloque-vacio">Nada de este tipo por ahora.</div>'}
    </div>`);
}

/** Lista completa de ligas, con filtro por deporte. */
function verTodasLigas(filtro = 'todo') {
  const lista = S.datos.ligas ?? [];
  const filtrada = filtro === 'todo'
    ? lista : lista.filter(l => l.deporte_clave === filtro);

  const deportes = [...new Set(lista.map(l => l.deporte_clave))];

  hoja('Dónde hay partidos', `${lista.length} liga(s) con partidos por jugarse`, `
    ${deportes.length > 1 ? `
      <div class="filtros">
        <button class="filtro ${filtro === 'todo' ? 'activo' : ''}"
          onclick="verTodasLigas('todo')">Todos</button>
        ${deportes.map(d => {
          const nombre = lista.find(l => l.deporte_clave === d)?.deporte ?? d;
          return `<button class="filtro ${filtro === d ? 'activo' : ''}"
            onclick="verTodasLigas('${d}')">${esc(nombre)}</button>`;
        }).join('')}
      </div>` : ''}
    <div class="bloque" style="margin:0">
      ${filtrada.length
        ? filtrada.map(filaLiga).join('')
        : '<div class="bloque-vacio">Nada de este deporte por ahora.</div>'}
    </div>
    <p class="pista" style="margin-top:14px">
      El número grande son los partidos disponibles; abajo, cuántas salas
      hay abiertas para ellos.</p>`);
}

/**
 * Una línea del muro de actividad.
 *
 * Las derrotas NO aparecen: exponer las pérdidas de alguien es
 * humillante y lo empuja a irse. Hay un `CHECK` en la tabla que impide
 * siquiera insertarlas.
 */
function filaActividad(a) {
  const d = a.datos ?? {};
  const partido = a.equipo_local
    ? `${a.equipo_local} vs ${a.equipo_visitante}`
    : `${d.local ?? ''} vs ${d.visitante ?? ''}`;

  const textos = {
    SALA_CREADA: ['creada', '+',
      `<strong>${esc(a.alias ?? 'Alguien')}</strong> abrió una sala de ${esc(partido)}`],
    SALA_BALANCEADA: ['llena', '=',
      `La sala de ${esc(partido)} se completó`],
    RESULTADO_GANADOR: ['gano', '★',
      `<strong>${esc(a.alias ?? 'Alguien')}</strong> ganó en ${esc(partido)}`],
    RACHA: ['gano', '★',
      `<strong>${esc(a.alias ?? 'Alguien')}</strong> lleva ${esc(d.racha ?? '')} seguidas`],
    RESUMEN_DIARIO: ['llena', '·', esc(d.texto ?? 'Resumen del día')],
  };
  const [clase, simbolo, texto] = textos[a.tipo] ?? ['creada', '·', esc(a.tipo)];

  const clic = a.sala_id
    ? `onclick="ir('sala','${a.sala_id}')" style="cursor:pointer"` : '';

  return `
  <div class="actividad" ${clic}>
    <div class="punto ${clase}">${simbolo}</div>
    <div class="actividad-texto">
      ${texto}
      <time>${cuandoPaso(a.fecha_crea)}</time>
    </div>
  </div>`;
}

/** "hace 5 min" dice más que una hora exacta para algo que acaba de pasar. */
function cuandoPaso(fecha) {
  const min = Math.round((Date.now() - new Date(fecha)) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h}h`;
  const dias = Math.floor(h / 24);
  return dias === 1 ? 'ayer' : `hace ${dias} días`;
}

function vacioMuro(filtro) {
  return `
  <div class="vacio">
    <h3>${filtro === 'faltan' ? 'Todas están completas' : 'Todavía no hay salas'}</h3>
    <p>${filtro === 'faltan'
      ? 'Nadie necesita contraparte ahora mismo. Puedes abrir la tuya y esperar a que entren.'
      : 'Sé el primero: elige un partido y define la apuesta.'}</p>
    <button class="btn btn-favor" onclick="ir('crear')">Crear una sala</button>
  </div>`;
}

/**
 * Tarjeta de sala.
 *
 * Muestra un solo mercado —el que más lejos está de completarse— para
 * que la tarjeta quepa de un vistazo. El resto se ve al entrar.
 */
function tarjetaSala(s) {
  const mercados = s.mercados ?? [];
  const principal = [...mercados].sort((a, b) => {
    const da = Math.abs(Number(a.totalFavor) - Number(a.totalContra));
    const db = Math.abs(Number(b.totalFavor) - Number(b.totalContra));
    return db - da;
  })[0];

  const destacada = s.destacada_hasta && new Date(s.destacada_hasta) > new Date();

  return `
  <div class="sala ${destacada ? 'destacada' : ''}" onclick="ir('sala','${s.id}')"
       role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('sala','${s.id}')">
    ${destacada ? '<div class="marca-destacada">Destacada</div>' : ''}

    <div class="sala-cab">
      <div style="min-width:0">
        <div class="partido">${esc(s.equipo_local)} vs ${esc(s.equipo_visitante)}</div>
        <div class="liga">${esc(s.liga)}${s.anfitrion
          ? ` · sala de ${esc(s.anfitrion)}` : ''}</div>
      </div>
      <div class="cuando">${cuando(s.inicia_en)}</div>
    </div>

    ${principal ? `
      ${barraBalance({
        total_favor: principal.totalFavor,
        total_contra: principal.totalContra,
        etiqueta_favor: principal.etiquetaFavor,
        etiqueta_contra: principal.etiquetaContra,
      })}
    ` : ''}

    <div class="sala-pie">
      <span class="gente">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2"><circle cx="9" cy="8" r="3"/>
          <path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 8a3 3 0 100-6"/></svg>
        ${s.participantes} de ${s.tope_participantes}
      </span>
      <span>Desde ${plata(s.monto_minimo_centavos)}${
        mercados.length > 1 ? ` · ${mercados.length} apuestas` : ''}</span>
    </div>
  </div>`;
}
