'use strict';

/**
 * Crear una sala.
 *
 * Dos decisiones distintas, dos pasos: primero sobre qué partido,
 * después qué se apuesta. Se pueden agregar varias apuestas al mismo
 * partido —hasta el tope que fija el sistema— porque cada una corre y
 * se liquida por su cuenta: que una quede sin contraparte no arrastra
 * a las demás.
 *
 * El anfitrión NO elige su ventaja: la cuota es la misma para los dos
 * lados y la línea termina siempre en `.5`. Y crear la sala **no
 * compromete dinero**: apuesta después, como todos, o no apuesta.
 */
PANTALLAS.crear = async () => {
  const r = await api('/partidos?limite=30');
  const partidos = r.partidos ?? [];
  S.datos.partidos = partidos;

  if (partidos.length === 0) {
    return pintar(armazon(`
      <h1 class="titulo">Crear una sala</h1>
      <div class="vacio">
        <h3>No hay partidos disponibles</h3>
        <p>Todavía no hay eventos cargados sobre los que apostar,
        o los que hay empiezan muy pronto.</p>
        <button class="btn btn-plano" onclick="ir('muro')">Ver salas abiertas</button>
      </div>`));
  }

  // Agrupados por liga: al elegir partido, la liga es lo primero que
  // se busca.
  const porLiga = {};
  for (const p of partidos) (porLiga[p.liga] ||= []).push(p);

  pintar(armazon(`
    <h1 class="titulo">Crear una sala</h1>
    <p class="sub">Elige el partido. Después defines las apuestas.</p>

    ${Object.entries(porLiga).map(([liga, lista]) => `
      <div class="rotulo" style="margin-top:22px">
        ${esc(liga)} <span>${lista.length} partido(s)</span>
      </div>

      <div class="rejilla-partidos">
        ${lista.map(p => `
          <div class="sala" onclick="elegirPartido('${p.id}')" role="button" tabindex="0"
               onkeydown="if(event.key==='Enter')elegirPartido('${p.id}')">
            <div class="sala-cab">
              <div style="min-width:0">
                <div class="partido">${esc(p.equipo_local)}
                  <span style="color:var(--tenue);font-weight:500">vs</span>
                  ${esc(p.equipo_visitante)}</div>
              </div>
              <div class="cuando">${cuando(p.inicia_en)}</div>
            </div>

            <div id="ctx-${p.id}"></div>

            <div class="sala-pie">
              <span>${p.mercados.length} tipo(s)</span>
              <span>${p.salas_abiertas > 0
                ? `${p.salas_abiertas} sala(s)`
                : 'Sé el primero'}</span>
            </div>
          </div>`).join('')}
      </div>
    `).join('')}
  `));

  // Las estadísticas van en cada tarjeta: se miran al ELEGIR el
  // partido, que es cuando ayudan a decidir. Dentro del panel de
  // apuestas llegan tarde — ahí ya se eligió.
  //
  // Se cargan después de pintar para que la lista aparezca de
  // inmediato aunque el proveedor tarde.
  for (const p of partidos) {
    bloqueContexto(p.id, p.equipo_local, p.equipo_visitante, true)
      .then(html => {
        const caja = document.getElementById('ctx-' + p.id);
        if (caja) caja.innerHTML = html;
      });
  }
};

// ---------------------------------------------------------------------
//  Paso 2: definir las apuestas
// ---------------------------------------------------------------------

/**
 * Categorías del selector.
 *
 * «Populares» va primero porque el 90% de las salas usan uno de esos
 * tres. El resto existe para quien lo busca, no para estorbar.
 */
const CATEGORIAS = [
  // «Todas» primero: con cinco o seis tipos, filtrar es un paso de más.
  // Cuando el catálogo crezca, las categorías serán el atajo.
  { id: 'todas',     nombre: 'Todas',     tipos: null },
  { id: 'populares', nombre: 'Populares',
    tipos: ['TOTAL_GOLES', 'AMBOS_ANOTAN', 'DOBLE_OPORTUNIDAD'] },
  { id: 'goles',     nombre: 'Goles',     tipos: ['TOTAL_GOLES', 'AMBOS_ANOTAN'] },
  { id: 'resultado', nombre: 'Resultado', tipos: ['DOBLE_OPORTUNIDAD', 'GANADOR_DIRECTO'] },
  { id: 'corners',   nombre: 'Córners',   tipos: ['TOTAL_CORNERS'] },
  { id: 'tarjetas',  nombre: 'Tarjetas',  tipos: ['TOTAL_TARJETAS'] },
  { id: 'puntos',    nombre: 'Puntos',    tipos: ['TOTAL_PUNTOS'] },
];

function elegirPartido(id) {
  const p = S.datos.partidos.find(x => x.id === id);
  S.datos.nueva = { partido: p, mercados: [] };
  dibujarCreacion();
}

function dibujarCreacion() {
  const n = S.datos.nueva;
  const p = n.partido;
  const tope = S.limites?.maxMercadosPorSala ?? 3;
  const dec = S.pais?.decimales ?? 2;
  const minimo = S.pais?.minimoApuesta ?? 500;

  hoja('Define la apuesta',
    `${p.equipo_local} vs ${p.equipo_visitante} · empieza ${cuando(p.inicia_en)}`, `

    <div class="selector">
      <div class="buscador" style="grid-column:1/-1">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--tenue)"
          stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
        <input id="buscar_tipo" placeholder="Buscar: goles, córners, tarjetas…"
          oninput="filtrarTipos()" autocomplete="off">
      </div>

      <div class="selector-cats" id="cats"></div>
      <div class="selector-lista" id="lista"></div>
    </div>

    <div id="jugadas"></div>
    <div id="paso-dos"></div>
  `);

  S.datos.categoria = 'todas';
  pintarSelector();
}

/**
 * Dibuja categorías, lista y fichas.
 *
 * Se redibuja solo el interior, no la hoja entera: reabrir el panel
 * en cada clic perdería el texto del buscador y la posición del
 * desplazamiento.
 */
function pintarSelector() {
  const n = S.datos.nueva;
  const p = n.partido;
  const tope = S.limites?.maxMercadosPorSala ?? 3;
  const busca = (document.getElementById('buscar_tipo')?.value ?? '').trim().toLowerCase();
  const cat = S.datos.categoria ?? 'todas';

  const disponibles = CATEGORIAS.filter(c =>
    c.tipos === null || p.mercados.some(m => c.tipos.includes(m.tipo)));

  document.getElementById('cats').innerHTML = disponibles.map(c => {
    const cuantos = c.tipos === null
      ? p.mercados.length
      : p.mercados.filter(m => c.tipos.includes(m.tipo)).length;
    return `<button class="cat ${cat === c.id ? 'activa' : ''}"
      onclick="S.datos.categoria='${c.id}';pintarSelector()">
      ${esc(c.nombre)}${c.id === 'todas' ? ` <small>· ${cuantos}</small>` : ''}
    </button>`;
  }).join('');

  const def = CATEGORIAS.find(c => c.id === cat);
  let lista = def?.tipos === null
    ? p.mercados
    : p.mercados.filter(m => def.tipos.includes(m.tipo));

  // Buscar ignora la categoría: quien escribe «córner» quiere ese
  // mercado, no que le digan que está en otra pestaña.
  if (busca) {
    lista = p.mercados.filter(m => m.nombre.toLowerCase().includes(busca));
  }

  document.getElementById('lista').innerHTML = lista.length
    ? lista.map(m => {
        const puesta = n.mercados.find(x => x.tipo === m.tipo);
        const lleno = !puesta && n.mercados.length >= tope;
        const abierto = S.datos.configurando === m.tipo;
        return `
        <div>
          <button class="tipo ${puesta ? 'puesto' : ''} ${abierto ? 'abierto' : ''}"
            ${lleno ? 'disabled' : ''}
            onclick="${puesta ? `quitarPorTipo('${m.tipo}')` : `abrirTipo('${m.tipo}')`}">
            <span class="tipo-marca">${puesta ? '✓' : abierto ? '−' : '+'}</span>
            <span class="tipo-texto">
              <strong>${esc(m.nombre)}</strong>
              <small>${puesta ? esc(puesta.resumen) : m.necesitaLinea
                ? 'tú eliges el número'
                : m.necesitaEquipo ? 'local o visita' : 'sí o no'}</small>
            </span>
          </button>
          ${abierto ? panelTipo(m) : ''}
        </div>`;
      }).join('')
    : `<p class="pista" style="padding:10px">
         Nada coincide con «${esc(busca)}».</p>`;

  const vacio = n.mercados.length === 0;

  document.getElementById('jugadas').innerHTML = `
    <div class="caja-jugadas ${vacio ? 'vacia' : ''}">
      <div class="jugadas-cab">
        <span style="font-weight:600;letter-spacing:.05em;text-transform:uppercase;
          color:var(--tenue)">Jugadas seleccionadas</span>
        ${vacio ? '' : `<span>${n.mercados.length} de ${tope}</span>`}
      </div>
      ${vacio
        ? '<div class="jugadas-vacio">Todavía no elegiste ninguna</div>'
        : `<div class="puestas">${n.mercados.map((m, i) => `
            <span class="puesta">${esc(m.nombre)}
              <button onclick="quitarMercado(${i})" aria-label="Quitar">×</button>
            </span>`).join('')}</div>`}

      ${n.mercados.length >= tope ? avisoTope(
        `Llegaste al máximo de ${tope} apuestas por sala. Quita una para cambiarla.`)
        : ''}
    </div>`;

  // «Quién puede entrar» aparece con la primera jugada: un botón
  // intermedio para llegar a dos campos es un paso de más.
  document.getElementById('paso-dos').innerHTML = vacio ? '' : bloqueQuienEntra();
}


function bloqueQuienEntra() {
  const dec = S.pais?.decimales ?? 2;
  const minimo = S.pais?.minimoApuesta ?? 500;

  return `
  <div class="caja-jugadas">
    <div class="jugadas-cab">
      <span style="font-weight:600;letter-spacing:.05em;text-transform:uppercase;
        color:var(--tenue)">Quién puede entrar</span>
    </div>
    <div class="par">
      <div class="campo">
        <label for="minimo">Apuesta mínima</label>
        <input id="minimo" inputmode="decimal"
          value="${(minimo / (10 ** dec)).toFixed(dec)}"
          oninput="limpiarMinimo(this)" onblur="corregirMinimo(this)">
      </div>
      <div class="campo">
        <label for="tope">Cupos</label>
        <input id="tope" inputmode="numeric" value="10"
          oninput="limpiarCupos(this)" onblur="corregirCupos(this)">
      </div>
    </div>
    <p class="pista" id="aviso-entrada">
      Cada persona pone ${plata(minimo)} o más. Caben hasta 10.</p>

    <div class="pie-fijo">
      <button class="btn btn-favor btn-ancho" onclick="publicarSala()">
        Publicar la sala</button>
      <p class="pista" style="text-align:center">
        No compromete dinero: apuestas después si quieres.</p>
    </div>
  </div>`;
}

/**
 * Se impide escribir el valor inválido, no solo se avisa después.
 *
 * Dejar teclear un cero y luego decir «no puede ser cero» es hacerle
 * perder el tiempo a alguien por algo que la app podía evitar.
 */
function limpiarMinimo(campo) {
  // Solo dígitos y un separador decimal, y nunca empezando en 0.
  let v = campo.value.replace(/[^\d.,]/g, '').replace(',', '.');
  const partes = v.split('.');
  if (partes.length > 2) v = partes[0] + '.' + partes.slice(1).join('');
  v = v.replace(/^0+(?=\d)/, '');
  if (v === '0') v = '';
  campo.value = v;
  validarEntrada();
}

/** Al salir del campo se repone el mínimo del país si quedó vacío o
 *  por debajo: un campo en blanco no puede publicarse. */
function corregirMinimo(campo) {
  const piso = S.pais?.minimoApuesta ?? 500;
  const dec = S.pais?.decimales ?? 2;
  if (aUnidades(campo.value) < piso) {
    campo.value = (piso / (10 ** dec)).toFixed(dec);
  }
  validarEntrada();
}

function limpiarCupos(campo) {
  let v = campo.value.replace(/\D/g, '').replace(/^0+/, '');
  if (Number(v) > 20) v = '20';
  campo.value = v;
  validarEntrada();
}

function corregirCupos(campo) {
  const v = Number(campo.value);
  if (!(v >= 2)) campo.value = '2';
  validarEntrada();
}

function validarEntrada() {
  const piso = S.pais?.minimoApuesta ?? 500;
  const monto = aUnidades(document.getElementById('minimo').value);
  const cupos = Number(document.getElementById('tope').value.replace(/\D/g, ''));
  const nota = document.getElementById('aviso-entrada');
  const mal = t => `<span style="color:var(--mal)">${t}</span>`;

  // Los mensajes explican QUÉ pasa, no cómo se llama la regla.
  // «El mínimo permitido» era jerga mía: nadie sabe qué significa.
  if (monto <= 0) {
    nota.innerHTML = mal(`Escribe cuánto tiene que poner cada persona.`);
  } else if (monto < piso) {
    nota.innerHTML = mal(
      `${plata(monto)} es muy poco. En Perú la apuesta más baja permitida es ${plata(piso)}.`);
  } else if (cupos < 2) {
    nota.innerHTML = mal('Tienen que caber al menos 2: solo no hay contra quién apostar.');
  } else if (cupos > 20) {
    nota.innerHTML = mal('El máximo son 20 personas por sala.');
  } else {
    nota.innerHTML = `Cada persona pone ${plata(monto)} o más. Caben hasta ${cupos}.`;
  }
}


function filtrarTipos() { pintarSelector(); }

/**
 * Abre la configuración DENTRO de la lista.
 *
 * Antes se abría otra hoja encima, y con varias apiladas cerrar una
 * dejaba a la persona sin saber dónde estaba. Aquí el número o el
 * equipo se eligen sin salir del sitio.
 */
function abrirTipo(tipo) {
  const p = S.datos.nueva.partido;
  const def = p.mercados.find(m => m.tipo === tipo);

  // Los que no necesitan configuración entran directo: abrir un panel
  // para no preguntar nada sería un paso de más.
  if (!def.necesitaLinea && !def.necesitaEquipo) {
    return agregarMercado(tipo, null, null);
  }

  S.datos.configurando = S.datos.configurando === tipo ? null : tipo;
  pintarSelector();
}

/** El panel que se despliega bajo el tipo elegido. */
function panelTipo(m) {
  const p = S.datos.nueva.partido;

  const lineas = m.tipo === 'TOTAL_CORNERS' ? [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]
    : m.tipo === 'TOTAL_TARJETAS' ? [1.5, 2.5, 3.5, 4.5, 5.5]
    : m.tipo === 'TOTAL_PUNTOS' ? [150.5, 160.5, 170.5, 180.5, 190.5]
    : [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];

  const elegida = S.datos.lineaElegida ?? (m.tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5);
  const equipo = S.datos.equipoElegido ?? p.equipo_local;

  return `
  <div class="panel-tipo">
    ${m.necesitaLinea ? `
      <div class="mini-rotulo">A partir de cuántos</div>
      <div class="lineas">
        ${lineas.map(v => `
          <button class="linea ${v === elegida ? 'activa' : ''}"
            onclick="S.datos.lineaElegida=${v};pintarSelector()">${v}</button>`).join('')}
      </div>
      <p class="pista">Siempre en .5: así el marcador nunca cae justo encima
      y nadie se queda sin ganar.</p>` : ''}

    ${m.necesitaEquipo ? `
      <div class="mini-rotulo">Sobre qué equipo</div>
      <div class="lineas">
        ${[p.equipo_local, p.equipo_visitante].map(e => `
          <button class="linea ${e === equipo ? 'activa' : ''}"
            onclick="S.datos.equipoElegido='${esc(e)}';pintarSelector()">${esc(e)}</button>`).join('')}
      </div>
      <p class="pista">Los lados serán «gana» y «no gana». El empate cuenta
      como «no gana», así que nunca queda sin resolver.</p>` : ''}

    <button class="btn btn-favor btn-chico btn-ancho" style="margin-top:8px"
      onclick="confirmarTipo('${m.tipo}')">Agregar</button>
  </div>`;
}

function confirmarTipo(tipo) {
  const p = S.datos.nueva.partido;
  const def = p.mercados.find(m => m.tipo === tipo);
  const linea = def.necesitaLinea
    ? (S.datos.lineaElegida ?? (tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5)) : null;
  const equipo = def.necesitaEquipo
    ? (S.datos.equipoElegido ?? p.equipo_local) : null;

  S.datos.configurando = null;
  S.datos.lineaElegida = null;
  S.datos.equipoElegido = null;
  agregarMercado(tipo, linea, equipo);
}

function quitarPorTipo(tipo) {
  const i = S.datos.nueva.mercados.findIndex(m => m.tipo === tipo);
  if (i >= 0) quitarMercado(i);
}

function agregarMercado(tipo, linea, equipo) {
  const n = S.datos.nueva;
  const def = n.partido.mercados.find(m => m.tipo === tipo);

  const etiquetas = {
    TOTAL_GOLES:       [`Más de ${linea} goles`,    `Menos de ${linea} goles`],
    TOTAL_CORNERS:     [`Más de ${linea} córners`,  `Menos de ${linea} córners`],
    TOTAL_TARJETAS:    [`Más de ${linea} tarjetas`, `Menos de ${linea} tarjetas`],
    TOTAL_PUNTOS:      [`Más de ${linea} puntos`,   `Menos de ${linea} puntos`],
    AMBOS_ANOTAN:      ['Ambos anotan', 'No anotan ambos'],
    DOBLE_OPORTUNIDAD: [`Gana ${equipo}`, `No gana ${equipo}`],
    GANADOR_DIRECTO:   [`Gana ${equipo}`, `No gana ${equipo}`],
  };
  const [favor, contra] = etiquetas[tipo] ?? [def.nombre, `No: ${def.nombre}`];

  // Se guarda un resumen corto además de las etiquetas: en la lista
  // de la sala en construcción interesa "Más / menos de 2.5", no la
  // frase completa de cada lado.
  const resumenes = {
    TOTAL_GOLES:       `Más / menos de ${linea}`,
    TOTAL_CORNERS:     `Más / menos de ${linea}`,
    TOTAL_TARJETAS:    `Más / menos de ${linea}`,
    TOTAL_PUNTOS:      `Más / menos de ${linea}`,
    AMBOS_ANOTAN:      'Sí / no',
    DOBLE_OPORTUNIDAD: `${equipo} sí / no`,
    GANADOR_DIRECTO:   `${equipo} sí / no`,
  };

  n.mercados.push({
    tipo, linea, equipo,
    nombre: def.nombre,
    resumen: resumenes[tipo] ?? '',
    etiquetaFavor: favor,
    etiquetaContra: contra,
  });
  if (document.getElementById('lista')) pintarSelector();
  else dibujarCreacion();
}

function quitarMercado(indice) {
  S.datos.nueva.mercados.splice(indice, 1);
  // Solo se redibuja el interior: rehacer la hoja perdería el texto
  // del buscador y la posición del desplazamiento.
  if (document.getElementById('lista')) pintarSelector();
  else dibujarCreacion();
}

async function publicarSala() {
  const n = S.datos.nueva;
  const minimo = aUnidades(document.getElementById('minimo').value);
  const cupos = Number(document.getElementById('tope').value.replace(/\D/g, ''));
  const piso = S.pais?.minimoApuesta ?? 500;

  if (minimo <= 0) return aviso('Escribe cuánto tiene que poner cada persona.', 'mal');
  if (minimo < piso) {
    return aviso(`La apuesta más baja permitida es ${plata(piso)}.`, 'mal');
  }
  if (!(cupos >= 2 && cupos <= 20)) {
    return aviso('Tienen que caber entre 2 y 20 personas.', 'mal');
  }

  await accion(async () => {
    const r = await api('/salas', {
      method: 'POST',
      body: JSON.stringify({
        partidoId: n.partido.id,
        topeParticipantes: cupos,
        montoMinimoCentavos: minimo,
        mercados: n.mercados.map(m => ({
          tipo: m.tipo,
          ...(m.linea !== null ? { linea: m.linea } : {}),
          ...(m.equipo ? { equipo: m.equipo } : {}),
        })),
      }),
    });
    cerrarHoja();
    aviso(`Sala ${r.codigo} publicada`, 'bien');
    ir('sala', r.id);
  }, null, 'Publicando');
}
