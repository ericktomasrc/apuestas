 'use strict';

/**
 * Detalle de sala — TandaBet.
 *
 * Cambio únicamente visual: conserva endpoints, posiciones, montos,
 * apertura de apuesta y reglas de la sala.
 */
PANTALLAS.sala = async (id) => {
  const r = await api('/salas/' + id);
  const s = r.sala;
  const mercados = r.mercados ?? [];

  const miPosicion = {};
  for (const m of (r.misPosiciones ?? [])) miPosicion[m.mercado_id] = m;

  const mercadosPorId = {};
  for (const m of mercados) mercadosPorId[m.mercado_id] = m;
  S.datos.mercadosPorId = mercadosPorId;

  const misPosicionesLista = Object.values(miPosicion);
  const totalMiApuesta = misPosicionesLista.reduce(
    (total, p) => total + Number(p.monto_centavos ?? 0), 0);

  S.datos.posiciones = r.posiciones ?? [];
  S.datos.minimoSala = s.monto_minimo_centavos;

  const abierta = s.estado === 'ABIERTA' || s.estado === 'CUENTA_REGRESIVA';
  const topeVisual = Math.min(Number(s.tope_participantes ?? 10), Number(S.limites?.maxParticipantesSala ?? 10));
  const inicialLocal = inicialEquipoSala(s.equipo_local);
  const inicialVisita = inicialEquipoSala(s.equipo_visitante);
  S.datos.salaActual = s;

  pintar(armazon(`
    <div class="sala-detalle">

      <section class="sala-hero">
        <button class="sala-volver" onclick="ir('muro')">← <span>Volver a salas</span></button>

        <div class="sala-hero-centro">
          <div class="sala-deporte">⚽ FÚTBOL</div>
          <div class="sala-liga">${esc(s.liga ?? 'Fútbol')}</div>

          <div class="sala-enfrentamiento">
            <div class="sala-equipo">
              <div class="sala-escudo">${escudoEquipoSala(s.logo_local, inicialLocal, s.equipo_local)}</div>
              <strong>${esc(s.equipo_local)}</strong>
              <span>Local</span>
            </div>

            <div class="sala-vs">
              <div class="sala-vs-linea"><i></i><b>VS</b><i></i></div>
              <strong>${cuando(s.inicia_en)}</strong>
              <small>${esc(s.inicia_en ? new Date(s.inicia_en).toLocaleString('es-PE', {
                hour: '2-digit', minute: '2-digit'
              }) : '')}</small>
            </div>

            <div class="sala-equipo">
              <div class="sala-escudo">${escudoEquipoSala(s.logo_visitante, inicialVisita, s.equipo_visitante)}</div>
              <strong>${esc(s.equipo_visitante)}</strong>
              <span>Visitante</span>
            </div>
          </div>
        </div>

        <div class="sala-resumen">
          <div class="sala-resumen-item">
            <span class="sala-avatar">${esc((s.anfitrion ?? '??').slice(0, 2))}</span>
            <div><small>Sala creada por</small><strong>${esc(s.anfitrion ?? 'alguien')}</strong></div>
          </div>
          <div class="sala-resumen-item">
            <span>◫</span>
            <div><small>Tipo de sala</small><strong>Pública</strong></div>
          </div>
          <div class="sala-resumen-item">
            <span>◷</span>
            <div><small>Inicio</small><strong>${cuando(s.inicia_en)}</strong></div>
          </div>
          <div class="sala-resumen-item">
            <span>#</span>
            <div><small>Código de sala</small><strong class="num">${esc(s.codigo)}</strong></div>
          </div>
          <div class="sala-resumen-item">
            <span>♙</span>
            <div><small>Cupos</small><strong>${s.participantes ?? 0} / ${topeVisual}</strong></div>
          </div>
        </div>
      </section>

      <div class="sala-layout">
        <main class="sala-principal">
          ${estadoSala(s)}

          ${s.soy_anfitrion && Object.keys(miPosicion).length === 0 && abierta ? `
            <div class="sala-aviso">
              Crear la sala no te obliga a apostar. Puedes entrar a un lado como cualquiera
              o dejarla correr sin ti.
            </div>` : ''}

          <div class="sala-mercados-cab">
            <div class="sala-mercados-titulo-wrap">
              <div class="sala-mercados-titulo-linea">
                <div class="sala-mercados-titulo">¿En qué quieres participar?</div>
                ${s.soy_anfitrion && abierta ? `
                  <button class="sala-btn-agregar-compacto" onclick="abrirNuevoMercado()" title="Agregar mercado">
                    <span>＋</span><b>Agregar mercado</b>
                  </button>` : ''}
              </div>
              <small>${mercados.length} ${mercados.length === 1 ? 'mercado' : 'mercados'} disponibles</small>
            </div>
          </div>

          <div class="sala-mercados-grid">
            ${mercados.map(m => bloqueMercado(m, s, abierta, miPosicion[m.mercado_id])).join('')}
          </div>

          <div class="sala-acciones">
            ${abierta ? `
              <button class="sala-btn-secundario" onclick="compartir('${s.codigo}')">
                <span>↗</span> Compartir sala
              </button>` : ''}

            ${s.soy_anfitrion && abierta ? `
              <button class="sala-btn-peligro" onclick="confirmarEliminarSala('${s.id}','${esc(s.codigo)}')">
                <span>⌫</span> Eliminar sala
              </button>` : ''}

            ${!s.soy_anfitrion && Object.keys(miPosicion).length > 0 && abierta ? `
              <button class="sala-btn-secundario" onclick="salirDeSala('${s.id}')">
                Salir de esta sala
              </button>` : ''}
          </div>
        </main>

        <aside class="sala-lateral">
          <div class="sala-panel sala-total-apostado sala-total-compacto">
            <div>
              <span>TOTAL DE TUS APUESTAS</span>
              <small>${misPosicionesLista.length} ${misPosicionesLista.length === 1 ? 'selección' : 'selecciones'}</small>
            </div>
            <b>${plata(totalMiApuesta)}</b>
          </div>

          <div class="sala-panel sala-panel-apuesta">
            <h3>TU SELECCIÓN</h3>

            ${misPosicionesLista.length ? `
              <div class="sala-seleccion-lista">
                ${misPosicionesLista.map(p => {
                  const mercado = mercadosPorId[p.mercado_id] ?? {};
                  const etiqueta = p.lado === 'A_FAVOR'
                    ? (mercado.etiqueta_favor ?? 'A favor')
                    : (mercado.etiqueta_contra ?? 'En contra');
                  const tipo = mercado.tipo_mercado
                    ? String(mercado.tipo_mercado).replaceAll('_', ' ')
                    : 'Apuesta';

                  return `
                    <div class="sala-seleccion-item">
                      <div>
                        <small>${esc(tipo)}</small>
                        <strong>${esc(etiqueta)}</strong>
                      </div>
                      <b>${plata(p.monto_centavos ?? 0)}</b>
                    </div>`;
                }).join('')}
              </div>
            ` : `
              <div class="sala-vacia-icono">▤</div>
              <strong>Aún no has seleccionado ninguna opción</strong>
              <p>Cuando participes, tus selecciones aparecerán aquí.</p>
            `}
          </div>
        </aside>
      </div>
    </div>
  `));
};

function inicialEquipoSala(nombre) {
  const partes = String(nombre ?? '?').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return esc((partes.length === 1
    ? partes[0].slice(0, 2)
    : partes.slice(0, 2).map(x => x[0]).join('')).toUpperCase());
}

function escudoEquipoSala(url, iniciales, nombre) {
  if (url) {
    return `<img src="${esc(url)}" alt="${esc(nombre ?? 'Equipo')}"
      onerror="this.remove();this.parentElement.textContent='${iniciales}'">`;
  }
  return iniciales;
}

function avatarSala(alias) {
  const texto = String(alias ?? '?').trim();
  const partes = texto.split(/\s+/).filter(Boolean);
  const iniciales = (partes.length > 1
    ? partes.slice(0, 2).map(x => x[0]).join('')
    : texto.slice(0, 2)).toUpperCase();
  return `<span class="sala-chip-avatar">${esc(iniciales || '?')}</span>`;
}

function estadoSala(s) {
  if (s.estado === 'ABIERTA') return '';

  const textos = {
    CUENTA_REGRESIVA: ['et-espera', 'Cerrando', 'La sala está completa. Últimos minutos para salir.'],
    CERRADA:   ['et-gris', 'Cerrada', 'Ya no admite cambios. Esperando el resultado.'],
    EN_JUEGO:  ['et-espera', 'En juego', 'El partido está corriendo.'],
    LIQUIDADA: ['et-favor', 'Resuelta', 'Ya se pagó a los ganadores.'],
    ANULADA:   ['et-gris', 'Anulada', 'No hubo resultado, así que se devolvió todo. Sin comisión.'],
    EXPIRADA:  ['et-gris', 'Expirada', 'No entró suficiente gente. Se devolvió todo.'],
  };
  const [clase, titulo, nota] = textos[s.estado] ?? ['et-gris', s.estado, ''];

  return `<div class="caja">
    <span class="etiqueta ${clase}">${esc(titulo)}</span>
    <p class="pista" style="margin-top:8px">${esc(nota)}</p>
  </div>`;
}


function esUsuarioConectadoSala(p) {
  return p?.soy_yo === true || p?.soy_yo === 1 || String(p?.soy_yo ?? '').toLowerCase() === 'true';
}

function bloqueMercado(m, sala, abierta, mia) {
  const falta = loQueFalta(m);
  const esAnfitrion = !!sala.soy_anfitrion;
  const ladoPermitido = esAnfitrion ? 'A_FAVOR' : 'EN_CONTRA';

  const puedeFavor = abierta && esAnfitrion && !mia;
  const puedeContra = abierta && !esAnfitrion && !mia;

  const posicionesMercado = (S.datos.posiciones ?? [])
    .filter(p => p.mercado_id === m.mercado_id);
  const enFavor = posicionesMercado.filter(p => p.lado === 'A_FAVOR');
  const enContra = posicionesMercado.filter(p => p.lado === 'EN_CONTRA');

  const totalFavor = Number(m.total_favor ?? m.total_favor_centavos ?? 0);
  const totalContra = Number(m.total_contra ?? m.total_contra_centavos ?? 0);
  const restanteContra = Math.max(0, totalFavor - totalContra);

  const titulo = m.tipo_mercado
    ? String(m.tipo_mercado).replaceAll('_', ' ')
    : `${m.etiqueta_favor} / ${m.etiqueta_contra}`;

  // El anfitrión se representa únicamente debajo de su lado. Los apostadores
  // se representan únicamente debajo del lado contrario. En apostadores,
  // el usuario conectado siempre va primero y solo se muestran 2; el resto
  // queda disponible mediante “+N”.
  const anfitrionPos = enFavor.find(p => p.es_anfitrion) ?? enFavor[0] ?? null;
  const apostadoresOrdenados = [...enContra].sort((a, b) => {
    if (esUsuarioConectadoSala(a) !== esUsuarioConectadoSala(b)) return esUsuarioConectadoSala(a) ? -1 : 1;
    return String(a.alias ?? '').localeCompare(String(b.alias ?? ''));
  });
  const apostadoresVisibles = apostadoresOrdenados.slice(0, 1);
  const apostadoresRestantes = Math.max(0, apostadoresOrdenados.length - apostadoresVisibles.length);

  const chipPersona = (p, extraClase = '') => p ? `
    <span class="sala-chip ${extraClase} ${esUsuarioConectadoSala(p) ? 'yo' : ''} ${p.es_anfitrion ? 'anfitrion' : ''}"
      title="${esc(p.alias)} · ${plata(p.monto_centavos)}">
      ${avatarSala(p.alias)}
      <span class="sala-chip-texto">
        <strong>${esc(p.alias)}${esUsuarioConectadoSala(p) ? ' · Tú' : ''}</strong>
        <small>${plata(p.monto_centavos)}</small>
      </span>
    </span>` : '';

  const chipsApostadores = apostadoresVisibles.length
    ? apostadoresVisibles.map(p => chipPersona(p, 'apostador')).join('')
    : '<span class="sala-sin-gente">Nadie todavía</span>';

  const minimoBase = Math.max(
    Number(S.datos.minimoSala ?? 0),
    Number(S.pais?.minimoApuesta ?? 0),
  );
  const minimoEditar = esAnfitrion ? Math.max(minimoBase, totalContra) : minimoBase;
  const maximoEditar = !mia ? 0 : (esAnfitrion
    ? Math.min(
        Number(S.pais?.maximoApuesta ?? Number.MAX_SAFE_INTEGER),
        Number(mia.monto_centavos ?? 0) + Number(S.saldo?.disponibleCentavos ?? 0),
      )
    : Number(mia.monto_centavos ?? 0) + restanteContra);
  const puedeEditar = !!mia && abierta && maximoEditar >= minimoEditar;

  return `
    <article class="sala-mercado">
      <div class="sala-mercado-head">
        <h3>${esc(titulo)}</h3>
        <div class="sala-mercado-head-acciones">
          ${puedeEditar ? `
            <button class="sala-icon-btn" title="Modificar monto"
              onclick="editarMontoMercado('${m.mercado_id}',${Number(mia.monto_centavos ?? 0)},${minimoEditar},${maximoEditar},${esAnfitrion})">✎</button>` : ''}
          ${esAnfitrion && abierta ? `
            <button class="sala-icon-btn peligro" title="Eliminar mercado"
              onclick="confirmarEliminarMercado('${m.mercado_id}','${esc(titulo)}')">⌫</button>` : ''}
          <span class="sala-estrella">☆</span>
        </div>
      </div>

      <div class="sala-opciones">
        <button class="sala-opcion sala-opcion-favor ${puedeFavor ? 'habilitada' : 'bloqueada'}"
          ${puedeFavor
            ? `onclick="abrirApuesta('${m.mercado_id}','A_FAVOR')"`
            : 'disabled aria-disabled="true"'}>
          <span>${esc(m.etiqueta_favor)}</span>
          <b>${plata(totalFavor)}</b>
          ${esAnfitrion && mia
            ? '<small class="sala-bloqueo">Tu propuesta</small>'
            : (!puedeFavor ? '<small class="sala-bloqueo">Bloqueado para ti</small>' : '')}
        </button>

        <button class="sala-opcion sala-opcion-contra ${puedeContra && restanteContra > 0 ? 'habilitada' : 'bloqueada'}"
          ${puedeContra && restanteContra > 0
            ? `onclick="abrirApuesta('${m.mercado_id}','EN_CONTRA',null,${restanteContra})"`
            : 'disabled aria-disabled="true"'}>
          <span>${esc(m.etiqueta_contra)}</span>
          <b>${plata(totalContra)}</b>
          ${!esAnfitrion && restanteContra > 0 && !mia
            ? `<small class="sala-restante">Disponible ${plata(restanteContra)}</small>`
            : ''}
          ${!esAnfitrion && restanteContra <= 0
            ? '<small class="sala-bloqueo">Cupo monetario completo</small>'
            : ''}
          ${esAnfitrion ? '<small class="sala-bloqueo">Bloqueado para ti</small>' : ''}
        </button>
      </div>

      <div class="sala-participantes-compactos">
        <div class="sala-grupo-personas sala-grupo-anfitrion">
          <span class="sala-grupo-etiqueta">Anfitrión</span>
          <div class="sala-grupo-contenido">
            ${anfitrionPos ? chipPersona(anfitrionPos, 'anfitrion-principal') : '<span class="sala-sin-gente">Sin propuesta</span>'}
          </div>
        </div>
        <div class="sala-grupo-personas sala-grupo-apostadores">
          <span class="sala-grupo-etiqueta">Apostadores</span>
          <div class="sala-grupo-contenido sala-participantes-apostadores">
            ${chipsApostadores}
            ${apostadoresRestantes > 0 ? `<button class="sala-mas-participantes" onclick="verParticipantesMercado('${m.mercado_id}')">+${apostadoresRestantes}</button>` : ''}
          </div>
        </div>
      </div>

      ${mia ? `
        <div class="sala-mi-posicion">
          Tu apuesta individual: <b>${mia.lado === 'A_FAVOR'
            ? esc(m.etiqueta_favor) : esc(m.etiqueta_contra)}</b>
          · ${plata(mia.monto_centavos)}
        </div>` : ''}

      ${falta && falta.lado === ladoPermitido && abierta && !mia ? `
        <button class="sala-completar"
          onclick="abrirApuesta('${m.mercado_id}','${falta.lado}',${falta.monto},${falta.lado === 'EN_CONTRA' ? restanteContra : 'undefined'})">
          Completar con ${plata(falta.monto)}
        </button>` : ''}

      ${m.lado_ganador ? `
        <div class="sala-ganador">
          Ganó: <b>${esc(m.lado_ganador === 'A_FAVOR'
            ? m.etiqueta_favor : m.etiqueta_contra)}</b>
        </div>` : ''}
    </article>`;
}

function verParticipantesMercado(mercadoId) {
  const m = S.datos.mercadosPorId?.[mercadoId] ?? {};
  const posiciones = (S.datos.posiciones ?? [])
    .filter(p => p.mercado_id === mercadoId);

  // Orden visual del modal:
  // 1) anfitrión siempre primero;
  // 2) entre los apostadores, el usuario conectado primero;
  // 3) después el resto por alias.
  const anfitrion = posiciones.find(p => p.es_anfitrion) ?? null;
  const apostadores = posiciones
    .filter(p => !p.es_anfitrion)
    .sort((a, b) => {
      if (esUsuarioConectadoSala(a) !== esUsuarioConectadoSala(b)) return esUsuarioConectadoSala(a) ? -1 : 1;
      return String(a.alias ?? '').localeCompare(String(b.alias ?? ''));
    });

  const fila = (p, subtitulo) => `
    <div class="sala-participante-modal ${p.es_anfitrion ? 'anfitrion' : ''} ${esUsuarioConectadoSala(p) ? 'yo' : ''}">
      ${avatarSala(p.alias)}
      <div class="sala-participante-modal-texto">
        <strong title="${esc(p.alias)}">${esc(p.alias)}${esUsuarioConectadoSala(p) ? ' · Tú' : ''}</strong>
        <small>${esc(subtitulo)}</small>
      </div>
      <b>${plata(p.monto_centavos)}</b>
    </div>`;

  const etiquetaLado = p => p.lado === 'A_FAVOR'
    ? (m.etiqueta_favor ?? 'A favor')
    : (m.etiqueta_contra ?? 'En contra');

  hoja('Participantes', `${posiciones.length} en este mercado`, `
    <div class="sala-participantes-modal-grupos">
      <section class="sala-participantes-modal-grupo anfitrion">
        <div class="sala-participantes-modal-cab">
          <span>Anfitrión</span>
          <small>1</small>
        </div>
        ${anfitrion
          ? fila(anfitrion, etiquetaLado(anfitrion))
          : '<p class="sala-participantes-vacio">Sin anfitrión registrado.</p>'}
      </section>

      <section class="sala-participantes-modal-grupo apostadores">
        <div class="sala-participantes-modal-cab">
          <span>Apostadores</span>
          <small>${apostadores.length}</small>
        </div>
        <div class="sala-lista-participantes-modal">
          ${apostadores.length
            ? apostadores.map(p => fila(p, esUsuarioConectadoSala(p) ? `Conectado · ${etiquetaLado(p)}` : etiquetaLado(p))).join('')
            : '<p class="sala-participantes-vacio">Todavía no hay apostadores.</p>'}
        </div>
      </section>
    </div>`);
}

// ---------------------------------------------------------------------
//  Gestión de mercados: "Define tu apuesta"
// ---------------------------------------------------------------------

function categoriaMercado(tipo) {
  const t = String(tipo ?? '');
  if (t.includes('CORNERS')) return 'CORNERS';
  if (t.includes('TARJETAS')) return 'TARJETAS';
  if (t.includes('GOLES') || t === 'AMBOS_ANOTAN') return 'GOLES';
  if (t.includes('GANADOR') || t.includes('OPORTUNIDAD')) return 'RESULTADO';
  return 'OTROS';
}

function etiquetaCategoria(cat) {
  return ({
    TODAS: 'Todas',
    POPULARES: 'Populares',
    GOLES: 'Goles',
    RESULTADO: 'Resultado',
    CORNERS: 'Córners',
    TARJETAS: 'Tarjetas',
  })[cat] ?? cat;
}

function mercadoActualDeTipo(tipo) {
  return (S.datos.editorMercados?.originales ?? []).find(x => x.tipo === tipo) ?? null;
}

function mismoMercadoDraft(a, b) {
  if (!a || !b || a.tipo !== b.tipo) return false;
  const lineaA = a.necesitaLinea ? Number(a.linea) : null;
  const lineaB = b.necesitaLinea ? Number(b.linea) : null;
  const equipoA = a.necesitaEquipo ? String(a.equipo ?? '') : '';
  const equipoB = b.necesitaEquipo ? String(b.equipo ?? '') : '';
  return lineaA === lineaB && equipoA === equipoB;
}

async function abrirNuevoMercado() {
  if (!exigeCuenta('Necesitas tu cuenta para administrar la sala.')) return;

  const r = await api(`/mercados/catalogo?salaId=${encodeURIComponent(S.datos.parametro)}`);
  const catalogo = r.mercados ?? [];
  const s = S.datos.salaActual ?? {};
  if (!catalogo.length) return aviso('Esta liga no tiene mercados habilitados.', 'mal');

  // Reutiliza EXACTAMENTE el selector de "Define la apuesta" de crear.js.
  // Solo cargamos como seleccionados los mercados que ya tiene la sala.
  const actuales = Object.values(S.datos.mercadosPorId ?? {});
  const mercados = actuales.map(m => {
    const def = catalogo.find(x => x.tipo === m.tipo_mercado) ?? {};
    const linea = m.linea ?? null;
    const equipo = m.equipo_referencia ?? null;
    const resumenes = {
      TOTAL_GOLES: `Más / menos de ${linea}`,
      TOTAL_CORNERS: `Más / menos de ${linea}`,
      TOTAL_TARJETAS: `Más / menos de ${linea}`,
      TOTAL_PUNTOS: `Más / menos de ${linea}`,
      AMBOS_ANOTAN: 'Sí / no',
      DOBLE_OPORTUNIDAD: `${equipo ?? s.equipo_local ?? ''} sí / no`,
      GANADOR_DIRECTO: `${equipo ?? s.equipo_local ?? ''} sí / no`,
    };
    return {
      mercadoId: m.mercado_id,
      tipo: m.tipo_mercado,
      linea,
      equipo,
      nombre: def.nombre ?? String(m.tipo_mercado ?? '').replaceAll('_', ' '),
      resumen: resumenes[m.tipo_mercado] ?? '',
      etiquetaFavor: m.etiqueta_favor,
      etiquetaContra: m.etiqueta_contra,
    };
  });

  S.datos.editorMercadosOriginales = mercados.map(x => ({ ...x }));
  S.datos.modoEditorSala = true;
  S.datos.nueva = {
    partido: {
      id: s.partido_id,
      equipo_local: s.equipo_local,
      equipo_visitante: s.equipo_visitante,
      inicia_en: s.inicia_en,
      mercados: catalogo,
    },
    mercados: mercados.map(x => ({ ...x })),
  };

  // Esta función ya existe en crear.js y dibuja la pantalla original que
  // el usuario ya conoce: buscador, categorías, fichas y jugadas elegidas.
  dibujarCreacion();
  document.querySelector('.hoja')?.classList.add('selector-original-sala');
}

async function guardarMercadosSalaDesdeSelector() {
  const originales = S.datos.editorMercadosOriginales ?? [];
  const seleccionados = S.datos.nueva?.mercados ?? [];
  const clave = x => `${x.tipo}|${x.linea ?? ''}|${x.equipo ?? ''}`;
  const nuevosKeys = new Set(seleccionados.map(clave));
  const originalesKeys = new Set(originales.map(clave));

  const eliminar = originales.filter(x => !nuevosKeys.has(clave(x)) && x.mercadoId);
  const crear = seleccionados.filter(x => !originalesKeys.has(clave(x))).map(x => ({
    tipo: x.tipo,
    ...(x.linea !== null && x.linea !== undefined ? { linea: Number(x.linea) } : {}),
    ...(x.equipo ? { equipo: x.equipo } : {}),
  }));

  await accion(async () => {
    for (const x of eliminar) await api(`/mercados/${x.mercadoId}`, { method: 'DELETE' });
    for (const body of crear) {
      await api(`/salas/${S.datos.parametro}/mercados`, {
        method: 'POST', body: JSON.stringify(body),
      });
    }
    S.datos.modoEditorSala = false;
    S.datos.editorMercadosOriginales = null;
    await refrescarSaldo();
    cerrarHoja();
    ir('sala', S.datos.parametro);
  }, 'Mercados actualizados', 'Guardando');
}

function pintarDefineMercados() {
  const editor = S.datos.editorMercados;
  const root = document.getElementById('define_mercados');
  if (!editor || !root) return;

  const q = String(editor.busqueda ?? '').trim().toLowerCase();
  const max = Number(S.limites?.maxMercadosPorSala ?? 99);
  const visibles = editor.catalogo.filter(m => {
    const cat = categoriaMercado(m.tipo);
    const pasaCategoria = editor.categoria === 'TODAS'
      || (editor.categoria === 'POPULARES' && ['AMBOS_ANOTAN', 'DOBLE_OPORTUNIDAD', 'GANADOR_DIRECTO', 'TOTAL_GOLES', 'TOTAL_CORNERS'].includes(m.tipo))
      || editor.categoria === cat;
    const pasaTexto = !q || `${m.nombre} ${m.tipo} ${(m.ejemplo ?? []).join(' ')}`.toLowerCase().includes(q);
    return pasaCategoria && pasaTexto;
  });

  const seleccion = Object.values(editor.seleccionados);
  const originalesPorTipo = Object.fromEntries(editor.originales.map(o => [o.tipo, o]));
  const eliminados = editor.originales.filter(o => !editor.seleccionados[o.tipo]);

  root.innerHTML = `
    <div class="define-apuesta">
      <div class="define-busqueda">
        <span>⌕</span>
        <input id="define_buscar" type="search" placeholder="Buscar: goles, córners, tarjetas..."
          value="${esc(editor.busqueda)}" oninput="buscarMercadoDefine(this.value)">
      </div>

      <div class="define-cuerpo">
        <nav class="define-categorias">
          ${['TODAS','POPULARES','GOLES','RESULTADO','CORNERS','TARJETAS'].map(cat => `
            <button class="${editor.categoria === cat ? 'activo' : ''}"
              onclick="filtrarMercadoDefine('${cat}')">${esc(etiquetaCategoria(cat))}</button>`).join('')}
        </nav>

        <div class="define-lista">
          ${visibles.length ? visibles.map(m => {
            const sel = editor.seleccionados[m.tipo];
            const ya = !!originalesPorTipo[m.tipo];
            return `
              <button class="define-opcion ${sel ? 'seleccionada' : ''}"
                onclick="alternarMercadoDefine('${m.tipo}')">
                <span class="define-marca">${sel ? '✓' : '+'}</span>
                <span>
                  <strong>${esc(m.nombre)}</strong>
                  <small>${esc((m.ejemplo ?? []).join(' / '))}</small>
                </span>
                ${ya ? '<em>En la sala</em>' : ''}
              </button>`;
          }).join('') : '<p class="define-vacio">No hay mercados con ese filtro.</p>'}
        </div>
      </div>

      <section class="define-seleccion">
        <div class="define-seleccion-cab">
          <div><strong>MERCADOS SELECCIONADOS</strong><small>${seleccion.length} / ${max}</small></div>
        </div>

        ${seleccion.length ? `<div class="define-seleccion-lista">
          ${seleccion.map(x => bloqueSeleccionMercado(x, originalesPorTipo[x.tipo])).join('')}
        </div>` : '<p class="define-vacio-seleccion">Todavía no elegiste ninguno.</p>'}

        ${eliminados.length ? `<div class="define-eliminados">
          <small>SE QUITARÁN AL GUARDAR</small>
          ${eliminados.map(x => `<span>${esc(x.nombre)}
            <button onclick="alternarMercadoDefine('${x.tipo}')">Deshacer</button></span>`).join('')}
        </div>` : ''}
      </section>

      <button class="sala-btn-primario sala-btn-ancho define-guardar"
        onclick="guardarMercadosDefinidos()">Guardar cambios</button>
    </div>`;
}

function bloqueSeleccionMercado(x, original) {
  const modificado = original && !mismoMercadoDraft(x, original);
  return `
    <div class="define-seleccion-item ${x.existente ? 'existente' : 'nuevo'}">
      <div class="define-seleccion-top">
        <div>
          <strong>${esc(x.nombre)}</strong>
          <small>${x.existente ? (modificado ? 'Se reemplazará' : 'Ya está en la sala') : 'Nuevo mercado'}</small>
        </div>
        <button title="Quitar" onclick="alternarMercadoDefine('${x.tipo}')">×</button>
      </div>
      ${x.necesitaLinea ? `<label>Línea
        <input type="text" inputmode="decimal" value="${esc(String(x.linea ?? '2.5'))}"
          oninput="actualizarLineaDefine('${x.tipo}',this)">
      </label>` : ''}
      ${x.necesitaEquipo ? `<label>Equipo
        <select onchange="actualizarEquipoDefine('${x.tipo}',this.value)">
          <option value="${esc(S.datos.editorMercados.equipoLocal)}"
            ${x.equipo === S.datos.editorMercados.equipoLocal ? 'selected' : ''}>${esc(S.datos.editorMercados.equipoLocal || 'Local')}</option>
          <option value="${esc(S.datos.editorMercados.equipoVisitante)}"
            ${x.equipo === S.datos.editorMercados.equipoVisitante ? 'selected' : ''}>${esc(S.datos.editorMercados.equipoVisitante || 'Visitante')}</option>
        </select>
      </label>` : ''}
    </div>`;
}

function buscarMercadoDefine(valor) {
  if (!S.datos.editorMercados) return;
  S.datos.editorMercados.busqueda = valor;
  pintarDefineMercados();
  requestAnimationFrame(() => {
    const input = document.getElementById('define_buscar');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  });
}

function filtrarMercadoDefine(cat) {
  if (!S.datos.editorMercados) return;
  S.datos.editorMercados.categoria = cat;
  pintarDefineMercados();
}

function alternarMercadoDefine(tipo) {
  const editor = S.datos.editorMercados;
  if (!editor) return;

  if (editor.seleccionados[tipo]) {
    delete editor.seleccionados[tipo];
    return pintarDefineMercados();
  }

  const max = Number(S.limites?.maxMercadosPorSala ?? 99);
  if (Object.keys(editor.seleccionados).length >= max) {
    return aviso(`Puedes tener como máximo ${max} mercados en esta sala.`, 'mal');
  }

  const original = mercadoActualDeTipo(tipo);
  if (original) editor.seleccionados[tipo] = { ...original };
  else {
    const def = editor.catalogo.find(x => x.tipo === tipo);
    if (!def) return;
    editor.seleccionados[tipo] = {
      tipo, nombre: def.nombre,
      necesitaLinea: !!def.necesitaLinea,
      necesitaEquipo: !!def.necesitaEquipo,
      linea: def.necesitaLinea ? 2.5 : null,
      equipo: def.necesitaEquipo ? editor.equipoLocal : '',
      existente: false,
    };
  }
  pintarDefineMercados();
}

function limpiarDecimalInput(campo, decimales = 2) {
  let v = String(campo?.value ?? '').replace(',', '.').replace(/[^\d.]/g, '');
  const punto = v.indexOf('.');
  if (punto >= 0) {
    v = v.slice(0, punto + 1) + v.slice(punto + 1).replace(/\./g, '');
    const [entero, dec = ''] = v.split('.');
    v = entero + '.' + dec.slice(0, Math.max(0, Number(decimales) || 0));
  }
  v = v.replace(/^0+(?=\d)/, '');
  if (campo) campo.value = v;
  return v;
}

function actualizarLineaDefine(tipo, campo) {
  const editor = S.datos.editorMercados;
  if (!editor?.seleccionados[tipo]) return;
  limpiarDecimalInput(campo, 1);
  editor.seleccionados[tipo].linea = campo.value;
}

function actualizarEquipoDefine(tipo, valor) {
  const editor = S.datos.editorMercados;
  if (editor?.seleccionados[tipo]) editor.seleccionados[tipo].equipo = valor;
}

function payloadMercadoDefine(x) {
  const body = { tipo: x.tipo };
  if (x.necesitaLinea) {
    const linea = Number(String(x.linea).replace(',', '.'));
    if (!Number.isFinite(linea) || Math.abs(linea - Math.floor(linea) - 0.5) > 1e-9) {
      throw new Error(`La línea de «${x.nombre}» debe terminar exactamente en .5.`);
    }
    body.linea = linea;
  }
  if (x.necesitaEquipo) {
    if (![S.datos.editorMercados.equipoLocal, S.datos.editorMercados.equipoVisitante].includes(x.equipo)) {
      throw new Error(`Elige un equipo válido para «${x.nombre}».`);
    }
    body.equipo = x.equipo;
  }
  return body;
}

async function guardarMercadosDefinidos() {
  const editor = S.datos.editorMercados;
  if (!editor) return;

  const seleccion = Object.values(editor.seleccionados);
  const max = Number(S.limites?.maxMercadosPorSala ?? 99);
  if (seleccion.length > max) return aviso(`El máximo es ${max} mercados por sala.`, 'mal');

  let payloads;
  try {
    payloads = Object.fromEntries(seleccion.map(x => [x.tipo, payloadMercadoDefine(x)]));
  } catch (e) {
    return aviso(e instanceof Error ? e.message : String(e), 'mal');
  }

  const originalesPorTipo = Object.fromEntries(editor.originales.map(o => [o.tipo, o]));
  const eliminar = [];
  const crear = [];

  for (const o of editor.originales) {
    const elegido = editor.seleccionados[o.tipo];
    if (!elegido || !mismoMercadoDraft(elegido, o)) eliminar.push(o);
  }
  for (const x of seleccion) {
    const original = originalesPorTipo[x.tipo];
    if (!original || !mismoMercadoDraft(x, original)) crear.push(payloads[x.tipo]);
  }

  if (!eliminar.length && !crear.length) {
    cerrarHoja();
    return aviso('No hay cambios que guardar.', 'bien');
  }

  await accion(async () => {
    for (const o of eliminar) await api(`/mercados/${o.mercadoId}`, { method: 'DELETE' });
    for (const body of crear) {
      await api(`/salas/${S.datos.parametro}/mercados`, {
        method: 'POST', body: JSON.stringify(body),
      });
    }
    await refrescarSaldo();
    cerrarHoja();
    ir('sala', S.datos.parametro);
  }, 'Mercados actualizados', 'Guardando');
}

// Compatibilidad con llamadas anteriores.
function actualizarFormularioMercado() {}
async function crearMercadoSala() { return guardarMercadosDefinidos(); }

function editarMontoMercado(mercadoId, actual, minimo, maximo, esAnfitrion = false) {
  const dec = S.pais?.decimales ?? 2;
  const min = Number(minimo ?? 0);
  const max = Number(maximo ?? actual);
  const esHost = esAnfitrion === true || esAnfitrion === 'true';

  hoja('Modificar apuesta',
    `Puedes ajustar tu monto entre ${plata(min)} y ${plata(max)}.`,
    `<div class="sala-form-gestion">
      <label>Nuevo monto</label>
      <div class="monto-grande sala-monto-editar">
        <span>${esc(S.pais?.simbolo ?? 'S/')}</span>
        <input id="monto_editar" type="text" inputmode="decimal"
          value="${(Number(actual) / (10 ** dec)).toFixed(dec)}"
          oninput="limpiarMontoMoneda(this);validarMontoEdicion(${min},${max},${esHost})"
          onfocus="this.select()">
      </div>
      <small id="monto_editar_nota" class="sala-form-nota">
        Puedes usar desde ${plata(min)} hasta ${plata(max)}.
      </small>
      <button id="guardar_monto_btn" class="sala-btn-primario sala-btn-ancho"
        onclick="guardarMontoMercado('${mercadoId}',${min},${max},${esHost})">Guardar monto</button>
    </div>`);
}

function limpiarMontoMoneda(campo) {
  return limpiarDecimalInput(campo, Number(S.pais?.decimales ?? 2));
}

function valorMonedaValido(campo) {
  const raw = String(campo?.value ?? '').trim().replace(',', '.');
  if (!raw || !/^\d+(?:\.\d+)?$/.test(raw)) return false;
  const dec = Number(S.pais?.decimales ?? 2);
  const fraccion = raw.includes('.') ? raw.split('.')[1].length : 0;
  return fraccion <= dec;
}

function validarMontoEdicion(minimo, maximo, esAnfitrion = false) {
  const campo = document.getElementById('monto_editar');
  const nota = document.getElementById('monto_editar_nota');
  const btn = document.getElementById('guardar_monto_btn');
  const validoTexto = valorMonedaValido(campo);
  const monto = validoTexto ? aUnidades(campo.value) : NaN;
  const ok = Number.isInteger(monto) && monto >= Number(minimo) && monto <= Number(maximo);

  if (btn) btn.disabled = !ok;
  if (!nota) return;
  if (!validoTexto) nota.textContent = 'Escribe solo números y decimales válidos.';
  else if (monto > Number(maximo)) nota.textContent =
    `En este mercado puedes llegar como máximo a ${plata(maximo)}.`;
  else if (monto < Number(minimo)) nota.textContent = `No puedes bajar de ${plata(minimo)}.`;
  else nota.textContent = `Nuevo monto: ${plata(monto)}.`;
}

async function guardarMontoMercado(mercadoId, minimo, maximo, esAnfitrion = false) {
  const campo = document.getElementById('monto_editar');
  if (!valorMonedaValido(campo)) return aviso('Escribe solo números o decimales válidos.', 'mal');

  const monto = aUnidades(campo.value);
  if (!Number.isInteger(monto) || monto <= 0) return aviso('El monto no es válido.', 'mal');
  if (monto < Number(minimo)) return aviso(`No puedes bajar de ${plata(minimo)}.`, 'mal');
  if (monto > Number(maximo)) return aviso(`El máximo disponible es ${plata(maximo)}.`, 'mal');

  await accion(async () => {
    await api(`/mercados/${mercadoId}/mi-apuesta`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': claveUnica('ajuste-monto') },
      body: JSON.stringify({ montoCentavos: monto }),
    });
    await refrescarSaldo();
    cerrarHoja();
    ir('sala', S.datos.parametro);
  }, 'Monto actualizado', 'Guardando');
}

function confirmarEliminarMercado(mercadoId, titulo) {
  hoja('Eliminar mercado', titulo, `
    <div class="sala-confirmacion-peligro">
      <div class="sala-confirmacion-icono">!</div>
      <p>Si ya hay dinero en este mercado, se devolverá completo antes de eliminarlo.</p>
      <div class="sala-confirmacion-acciones">
        <button class="sala-btn-secundario sala-btn-ancho" onclick="cerrarHoja()">Cancelar</button>
        <button class="sala-btn-peligro sala-btn-ancho" onclick="eliminarMercadoSala('${mercadoId}')">Eliminar mercado</button>
      </div>
    </div>`);
}

async function eliminarMercadoSala(mercadoId) {
  await accion(async () => {
    await api(`/mercados/${mercadoId}`, { method: 'DELETE' });
    await refrescarSaldo();
    cerrarHoja();
    ir('sala', S.datos.parametro);
  }, 'Mercado eliminado', 'Eliminando');
}

function confirmarEliminarSala(id, codigo) {
  hoja('Eliminar sala', `Sala ${codigo}`, `
    <div class="sala-confirmacion-peligro">
      <div class="sala-confirmacion-icono">!</div>
      <p>Se eliminará la sala completa. Si alguien ya participó, todo lo retenido se devolverá antes de ocultarla.</p>
      <div class="sala-confirmacion-acciones">
        <button class="sala-btn-secundario sala-btn-ancho" onclick="cerrarHoja()">Cancelar</button>
        <button class="sala-btn-peligro sala-btn-ancho" onclick="eliminarSalaCompleta('${id}')">Eliminar sala</button>
      </div>
    </div>`);
}

async function eliminarSalaCompleta(id) {
  await accion(async () => {
    await api(`/salas/${id}`, { method: 'DELETE' });
    await refrescarSaldo();
    cerrarHoja();
    ir('muro');
  }, 'Sala eliminada', 'Eliminando');
}

// ---------------------------------------------------------------------
//  Apostar
// ---------------------------------------------------------------------

/**
 * Hoja de apuesta.
 *
 * El desglose se muestra SIEMPRE antes de confirmar, con la comisión
 * a la vista. Enterarse del descuento después de ganar es la forma más
 * rápida de perder la confianza de alguien.
 */
function abrirApuesta(mercadoId, lado, sugerido, maxPermitido) {
  if (!exigeCuenta('Estabas por entrar a una apuesta. El dinero necesita una cuenta detrás.')) return;

  const mercado = S.datos.mercadosPorId?.[mercadoId] ?? {};
  const etiqueta = lado === 'A_FAVOR'
    ? (mercado.etiqueta_favor ?? 'A favor')
    : (mercado.etiqueta_contra ?? 'En contra');
  const minimo = Math.max(S.datos.minimoSala ?? 0, S.pais?.minimoApuesta ?? 500);
  const limiteMercado = Number.isFinite(Number(maxPermitido)) ? Number(maxPermitido) : Infinity;
  const limiteReal = Math.min(S.saldo.disponibleCentavos, S.pais?.maximoApuesta ?? Infinity, limiteMercado);

  if (limiteReal < minimo) {
    return aviso(lado === 'EN_CONTRA'
      ? 'Este mercado ya no tiene monto suficiente disponible.'
      : `El mínimo es ${plata(minimo)}.`, 'mal');
  }

  const inicial = Math.min(sugerido ?? minimo, limiteReal);
  S.datos.apuesta = { mercadoId, lado, monto: inicial, maxPermitido: limiteReal, etiqueta };

  const candidatos = [minimo, minimo * 2, minimo * 5, limiteReal]
    .filter(v => Number.isFinite(v) && v >= minimo && v <= limiteReal)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 4);

  hoja(etiqueta,
    `${lado === 'A_FAVOR' ? 'Tu propuesta' : 'Monto disponible'} · ${plata(limiteReal)}`,
    `<div class="atajos sala-atajos-compactos">
      ${candidatos.map(v => `<button class="atajo" onclick="fijarMonto(${v})">${plata(v)}</button>`).join('')}
    </div>

    <div class="sala-otro-monto-wrap visible">
      <label>Tu monto</label>
      <div class="monto-grande sala-monto-compacto">
        <span>${esc(S.pais?.simbolo ?? 'S/')}</span>
        <input id="monto" type="text" inputmode="decimal"
          value="${(inicial / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2)}"
          oninput="limpiarMontoMoneda(this);recalcular()" onfocus="this.select()">
      </div>
    </div>

    <div id="desglose"></div>

    <button class="btn ${lado === 'A_FAVOR' ? 'btn-favor' : 'btn-contra'} btn-ancho sala-confirmar-apuesta"
      style="margin-top:14px" onclick="confirmarApuesta()">Confirmar ${esc(etiqueta)}</button>
    <p class="pista" style="text-align:center">Los límites se validan nuevamente en el servidor.</p>`);

  recalcular();
}

function fijarMonto(unidades) {
  document.getElementById('monto').value =
    (unidades / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2);
  recalcular();
}

function recalcular() {
  const campoMonto = document.getElementById('monto');
  const montoValido = valorMonedaValido(campoMonto);
  const monto = montoValido ? aUnidades(campoMonto.value) : 0;
  S.datos.apuesta.monto = monto;

  const tasa = Number(S.usuario?.tasa_comision ?? 0.07);
  const comision = Math.floor(monto * tasa);
  const siGana = monto * 2 - comision;

  const maxPermitido = S.datos.apuesta?.maxPermitido ?? S.saldo.disponibleCentavos;
  const alcanza = montoValido && monto > 0 && monto <= S.saldo.disponibleCentavos && monto <= maxPermitido;

  document.getElementById('desglose').innerHTML = `
    <div class="desglose">
      <div class="desglose-fila gana">
        <span>Si ganas te llevas</span><b>${plata(siGana)}</b>
      </div>
      <div class="desglose-fila">
        <span>Comisión (${(tasa * 100).toFixed(1)}%)${
          S.usuario?.plan_vencido ? ' · tu plan venció' : ''}</span>
        <b>−${plata(comision)}</b>
      </div>
      <div class="desglose-fila pierde">
        <span>Si pierdes</span><b>−${plata(monto)}</b>
      </div>
    </div>
    ${!montoValido ? avisoTope('Escribe solo números y decimales válidos.') : ''}
    ${montoValido && !alcanza && monto > 0
      ? avisoTope(`No te alcanza: tienes ${plata(S.saldo.disponibleCentavos)}.`)
      : ''}
    ${monto > 0 && monto < (S.datos.minimoSala ?? 0)
      ? avisoTope(`Esta sala pide al menos ${plata(S.datos.minimoSala)}.`)
      : ''}
    ${monto > (S.pais?.maximoApuesta ?? Infinity)
      ? avisoTope(`El máximo por apuesta es ${plata(S.pais.maximoApuesta)}.`)
      : ''}
    ${monto > maxPermitido
      ? avisoTope(`Solo quedan ${plata(maxPermitido)} disponibles en esta opción.`)
      : ''}`;
}

async function confirmarApuesta() {
  const campoMonto = document.getElementById('monto');
  if (!valorMonedaValido(campoMonto)) {
    return aviso('Escribe solo números o decimales válidos.', 'mal');
  }
  S.datos.apuesta.monto = aUnidades(campoMonto.value);
  const { mercadoId, lado, monto } = S.datos.apuesta;

  const minimo = Math.max(S.datos.minimoSala ?? 0, S.pais?.minimoApuesta ?? 0);
  const maxPermitido = S.datos.apuesta?.maxPermitido ?? Infinity;
  if (monto <= 0) return aviso('Escribe cuánto quieres apostar.', 'mal');
  if (monto < minimo) return aviso(`El mínimo es ${plata(minimo)}.`, 'mal');
  if (monto > maxPermitido) return aviso(`Solo quedan ${plata(maxPermitido)} disponibles.`, 'mal');
  if (monto > S.saldo.disponibleCentavos) {
    return aviso('No te alcanza. Recarga o baja el monto.', 'mal');
  }

  await accion(async () => {
    const r = await api(`/mercados/${mercadoId}/apostar`, {
      method: 'POST',
      // Clave única por acción: si la red falla y el cliente reintenta,
      // la misma clave impide que se cobre dos veces.
      headers: { 'Idempotency-Key': claveUnica('apuesta') },
      body: JSON.stringify({ lado, montoCentavos: monto }),
    });
    S.saldo = r.saldo;
    cerrarHoja();
    ir('sala', S.datos.parametro);
  }, 'Apuesta confirmada', 'Confirmando');
}

async function salirDeSala(id) {
  if (!exigeCuenta('Para salir de una sala hace falta la cuenta con la que entraste.')) return;

  await accion(async () => {
    await api(`/salas/${id}/salir`, { method: 'POST' });
    await refrescarSaldo();
    ir('sala', id);
  }, 'Saliste de la sala. Te devolvimos todo.', 'Saliendo');
}

/**
 * Invitar por WhatsApp.
 *
 * Es como se llenan las salas en la práctica: alguien la abre y la
 * manda al grupo. El enlace lleva directo a la sala, no al inicio.
 */
function compartir(codigo) {
  const url = `${location.origin}/#sala/${S.datos.parametro}`;
  const texto = `Armé una sala en TandaBet (${codigo}). Entra al lado que quieras: ${url}`;

  if (navigator.share) {
    navigator.share({ text: texto }).catch(() => {});
  } else {
    navigator.clipboard.writeText(texto);
    aviso('Enlace copiado', 'bien');
  }
}
