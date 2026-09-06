'use strict';

/**
 * Resultados — dashboard de actividad personal.
 *
 * El dinero mostrado como resultado sale del libro contable que entrega
 * `/yo/resultados`. No se reconstruye desde posiciones.
 *
 * La API actual entrega:
 * - resumen económico del período;
 * - neto por día;
 * - hasta 60 eventos con equipo, código, estado, fecha y neto.
 *
 * Por eso esta pantalla NO inventa cuota, mercado ni monto apostado: esos
 * campos requieren datos adicionales en el endpoint.
 */
PANTALLAS.resultados = async () => {
  const dias = S.datos.diasResultados ?? 1;
  const r = await api('/yo/resultados?dias=' + dias);
  S.datos.resultadosActuales = r;

  const s = r.resumen ?? {};
  const eventos = (r.eventos ?? []).map(normalizarEventoResultado);
  const porDia = (r.porDia ?? []).map(d => ({
    dia: d.dia,
    neto: Number(d.neto ?? 0),
  }));

  const resumen = resumenResultados(s, eventos);

  pintar(armazon(`
    <section class="resultados-pagina">
      ${cabeceraResultados(dias, resumen)}
      ${eventos.length === 0
        ? vacioResultados()
        : cuerpoResultados({ dias, resumen, eventos, porDia })}
    </section>
  `));

  if (eventos.length) {
    prepararFiltrosResultados();
    pintarVistaResultados('historial');
  }
};

function normalizarEventoResultado(e) {
  const neto = Number(e.neto ?? 0);
  const pendiente = ['ABIERTA', 'CUENTA_REGRESIVA', 'CERRADA', 'EN_JUEGO'].includes(e.estado);
  const estadoResultado = pendiente
    ? 'EN_JUEGO'
    : neto > 0
      ? 'GANADO'
      : neto < 0
        ? 'PERDIDO'
        : 'DEVUELTO';

  return {
    ...e,
    neto,
    pendiente,
    estadoResultado,
    buscable: [e.equipo_local, e.equipo_visitante, e.codigo]
      .filter(Boolean).join(' ').toLowerCase(),
  };
}

function resumenResultados(s, eventos) {
  // IMPORTANTE:
  // El libro contable descuenta la retención al entrar a una apuesta.
  // Mientras el evento sigue abierto, ese movimiento NO es una pérdida:
  // simplemente es dinero retenido/en juego.
  //
  // Por eso la UI calcula ganados/perdidos/resultado solo con eventos
  // cerrados. Los pendientes se muestran exclusivamente como "En juego".
  const pendientesEventos = eventos.filter(e => e.pendiente);
  const cerradosEventos = eventos.filter(e => !e.pendiente);

  const ganadosEventos = cerradosEventos.filter(e => e.neto > 0);
  const perdidosEventos = cerradosEventos.filter(e => e.neto < 0);
  const devueltosEventos = cerradosEventos.filter(e => e.neto === 0);

  const resultadoCerrado = cerradosEventos.reduce((t, e) => t + e.neto, 0);
  const ganadoCerrado = ganadosEventos.reduce((t, e) => t + e.neto, 0);
  const perdidoCerrado = -perdidosEventos.reduce((t, e) => t + e.neto, 0);

  return {
    total: eventos.length,
    ganados: ganadosEventos.length,
    perdidos: perdidosEventos.length,
    devueltos: devueltosEventos.length,
    pendientes: pendientesEventos.length,
    cerrados: cerradosEventos.length,
    resultado: resultadoCerrado,
    ganado: ganadoCerrado,
    perdido: perdidoCerrado,
    comision: Number(s.comision ?? 0),
    enJuego: Number(S.saldo?.retenidoCentavos ?? 0),
  };
}

function cabeceraResultados(dias, r) {
  return `
    <div class="resultados-encabezado">
      <div>
        <div class="resultados-kicker">TU ACTIVIDAD</div>
        <h1>Mis resultados</h1>
        <p>Revisa tus resultados, lo que está en juego y el detalle de cada evento.</p>
      </div>
      <div class="resultados-mini-resumen">
        <div><strong>${r.total}</strong><span>RESULTADOS</span></div>
        <div><strong>${r.pendientes}</strong><span>EN JUEGO</span></div>
        <div><strong>${r.cerrados}</strong><span>CERRADOS</span></div>
      </div>
    </div>

    <div class="resultados-periodos" role="group" aria-label="Período de resultados">
      ${[[1,'Hoy'], [7,'7 días'], [30,'30 días'], [90,'3 meses'], [365,'Un año']]
        .map(([d, nombre]) => `
          <button class="resultado-periodo ${dias === d ? 'activo' : ''}"
            onclick="S.datos.diasResultados=${d};ir('resultados')">${nombre}</button>`).join('')}
    </div>`;
}

function vacioResultados() {
  return `
    <div class="resultados-vacio">
      <div class="resultados-vacio-icono">↗</div>
      <h3>Todavía no hay resultados</h3>
      <p>Cuando tengas actividad cerrada o en juego, aparecerá aquí.</p>
      <button class="btn btn-favor" onclick="ir('muro')">Ver salas</button>
    </div>`;
}

function cuerpoResultados({ dias, resumen, eventos, porDia }) {
  const mejores = eventos
    .filter(e => e.estadoResultado === 'GANADO')
    .sort((a, b) => b.neto - a.neto)
    .slice(0, 3);

  return `
    <div class="resultados-layout">
      <div class="resultados-principal">
        ${tarjetasResumenResultados(dias, resumen)}
        ${graficaResultadosNueva(porDiaCerradoDesdeEventos(eventos))}
        ${navegacionDetalleResultados()}
        <div id="resultados-vista"></div>
      </div>

      <aside class="resultados-lateral">
        ${resumenCircularResultados(resumen)}
        ${mejoresResultados(mejores)}
        ${resumenRapidoResultados(resumen)}
      </aside>
    </div>`;
}

function tarjetasResumenResultados(dias, r) {
  const claseResultado = r.resultado > 0 ? 'positivo' : r.resultado < 0 ? 'negativo' : 'neutral';
  return `
    <div class="resultados-metricas">
      <article class="resultado-metrica ${claseResultado}">
        <div class="resultado-metrica-icono">↗</div>
        <div><span>RESULTADO NETO</span><strong>${r.resultado > 0 ? '+' : ''}${plata(r.resultado)}</strong><small>${etiquetaPeriodo(dias)}</small></div>
      </article>
      <article class="resultado-metrica en-juego">
        <div class="resultado-metrica-icono">◷</div>
        <div><span>EN JUEGO</span><strong>${plata(r.enJuego)}</strong><small>${r.pendientes} evento(s) pendientes</small></div>
      </article>
      <article class="resultado-metrica positivo">
        <div class="resultado-metrica-icono">✓</div>
        <div><span>GANADOS</span><strong>${plata(r.ganado)}</strong><small>${r.ganados} resultado(s)</small></div>
      </article>
      <article class="resultado-metrica negativo">
        <div class="resultado-metrica-icono">×</div>
        <div><span>PERDIDOS</span><strong>${plata(r.perdido)}</strong><small>${r.perdidos} resultado(s)</small></div>
      </article>
      <article class="resultado-metrica neutral">
        <div class="resultado-metrica-icono">%</div>
        <div><span>COMISIÓN</span><strong>${plata(r.comision)}</strong><small>Solo sobre ganancias</small></div>
      </article>
    </div>`;
}

function etiquetaPeriodo(dias) {
  if (dias === 1) return 'Hoy';
  if (dias === 7) return 'Últimos 7 días';
  if (dias === 30) return 'Últimos 30 días';
  if (dias === 90) return 'Últimos 3 meses';
  return 'Último año';
}

function graficaResultadosNueva(porDia) {
  if (!porDia.length) return '';

  const puntos = [];
  let acumulado = 0;
  for (const d of porDia) {
    acumulado += Number(d.neto ?? 0);
    puntos.push({ dia: d.dia, valor: acumulado });
  }

  if (puntos.length === 1) {
    puntos.unshift({ dia: puntos[0].dia, valor: 0 });
  }

  const valores = puntos.map(p => p.valor);
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const rango = Math.max(max - min, 1);
  const alto = 150;
  const ancho = 1000;
  const padX = 18;
  const padY = 12;

  const coord = puntos.map((p, i) => {
    const x = padX + (i / Math.max(puntos.length - 1, 1)) * (ancho - padX * 2);
    const y = padY + (1 - (p.valor - min) / rango) * (alto - padY * 2);
    return { ...p, x, y };
  });

  const linea = coord.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${padX},${alto - padY} ${linea} ${ancho - padX},${alto - padY}`;
  const ceroY = padY + (1 - (0 - min) / rango) * (alto - padY * 2);
  const final = coord.at(-1)?.valor ?? 0;

  return `
    <section class="resultado-grafica-card">
      <div class="resultado-seccion-cab">
        <div>
          <span>RESULTADO ACUMULADO</span>
          <small>Evolución del neto dentro del período seleccionado</small>
        </div>
        <div class="resultado-grafica-final ${final >= 0 ? 'positivo' : 'negativo'}">
          ${final > 0 ? '+' : ''}${plata(final)}
        </div>
      </div>
      <div class="resultado-grafica-wrap">
        <svg viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" aria-label="Resultado acumulado">
          <line x1="${padX}" y1="${ceroY.toFixed(1)}" x2="${ancho-padX}" y2="${ceroY.toFixed(1)}" class="resultado-linea-cero" />
          <polygon points="${area}" class="resultado-area" />
          <polyline points="${linea}" class="resultado-linea ${final >= 0 ? 'positiva' : 'negativa'}" />
          ${coord.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" class="resultado-punto" />`).join('')}
        </svg>
      </div>
      <div class="resultado-grafica-pie">
        <span>${fechaResultadoCorta(puntos[0].dia)}</span>
        <span>${fechaResultadoCorta(puntos.at(-1).dia)}</span>
      </div>
    </section>`;
}

function resumenCircularResultados(r) {
  const cerrados = Math.max(r.ganados + r.perdidos + r.devueltos, 1);
  const pg = r.ganados / cerrados * 100;
  const pp = r.perdidos / cerrados * 100;
  const pd = r.devueltos / cerrados * 100;
  const efectividad = r.cerrados ? Math.round(r.ganados / r.cerrados * 100) : 0;

  return `
    <section class="resultado-aside-card">
      <div class="resultado-aside-titulo">RESUMEN DE RESULTADOS</div>
      <div class="resultado-donut-wrap">
        <div class="resultado-donut" style="--g:${pg}%;--p:${pg + pp}%">
          <div><strong>${r.cerrados}</strong><span>Cerrados</span></div>
        </div>
        <div class="resultado-leyenda">
          ${leyendaResultado('ganado', 'Ganados', r.ganados, pg)}
          ${leyendaResultado('perdido', 'Perdidos', r.perdidos, pp)}
          ${leyendaResultado('devuelto', 'Devueltos', r.devueltos, pd)}
        </div>
      </div>
      <div class="resultado-efectividad">
        Ganaste en <strong>${r.ganados}</strong> de <strong>${r.cerrados}</strong> resultados cerrados
        <span>${efectividad}% del total cerrado</span>
      </div>
    </section>`;
}

function leyendaResultado(clase, nombre, cantidad, porcentaje) {
  return `<div><i class="${clase}"></i><span>${nombre} (${cantidad})</span><strong>${porcentaje.toFixed(1)}%</strong></div>`;
}

function mejoresResultados(eventos) {
  return `
    <section class="resultado-aside-card">
      <div class="resultado-aside-titulo">RESULTADOS DESTACADOS DEL PERÍODO</div>
      ${eventos.length
        ? `<div class="resultado-mejores">${eventos.map((e, i) => `
            <button onclick="ir('${e.es_casa ? 'casa' : 'sala'}','${e.evento_id}')">
              <span class="resultado-posicion">${i + 1}</span>
              <span class="resultado-mejor-info">
                <strong>${esc(e.equipo_local ?? '')} vs ${esc(e.equipo_visitante ?? '')}</strong>
                <small>${e.es_casa ? 'Casa' : 'Sala'} ${esc(e.codigo ?? '')} · ${fechaResultadoCorta(e.cuando)}</small>
              </span>
              <b>+${plata(e.neto)}</b>
            </button>`).join('')}</div>`
        : `<div class="resultado-aside-vacio">Todavía no hay resultados positivos en este período.</div>`}
    </section>`;
}

function resumenRapidoResultados(r) {
  return `
    <section class="resultado-aside-card">
      <div class="resultado-aside-titulo">RESUMEN RÁPIDO</div>
      <div class="resultado-resumen-lista">
        <div><span>Resultado neto</span><strong class="${r.resultado >= 0 ? 'positivo' : 'negativo'}">${r.resultado > 0 ? '+' : ''}${plata(r.resultado)}</strong></div>
        <div><span>Total ganado</span><strong class="positivo">${plata(r.ganado)}</strong></div>
        <div><span>Total perdido</span><strong class="negativo">-${plata(r.perdido)}</strong></div>
        <div><span>Actualmente en juego</span><strong class="en-juego">${plata(r.enJuego)}</strong></div>
        <div><span>Comisión pagada</span><strong>${plata(r.comision)}</strong></div>
      </div>
    </section>`;
}

function navegacionDetalleResultados() {
  return `
    <section class="resultado-detalle-card">
      <div class="resultado-subtabs">
        <button class="activo" data-vista="historial" onclick="pintarVistaResultados('historial')">Historial</button>
        <button data-vista="dia" onclick="pintarVistaResultados('dia')">Por día</button>
        <button data-vista="semana" onclick="pintarVistaResultados('semana')">Semanal</button>
        <button data-vista="mes" onclick="pintarVistaResultados('mes')">Mensual</button>
      </div>
      <div id="resultado-filtros" class="resultado-filtros">
        <div class="resultado-estados" role="group" aria-label="Estado del resultado">
          ${[['TODOS','Todos'],['EN_JUEGO','En juego'],['GANADO','Ganados'],['PERDIDO','Perdidos'],['DEVUELTO','Devueltos']]
            .map(([v,n], i) => `<button class="${i === 0 ? 'activo' : ''}" data-estado="${v}" onclick="filtrarEstadoResultados('${v}')">${n}</button>`).join('')}
        </div>
        <label class="resultado-buscar">
          <span>⌕</span>
          <input id="resultado-busqueda" type="search" placeholder="Buscar por equipo o sala..." autocomplete="off">
        </label>
      </div>
    </section>`;
}

function prepararFiltrosResultados() {
  S.datos.filtroResultados = S.datos.filtroResultados ?? 'TODOS';
  S.datos.busquedaResultados = S.datos.busquedaResultados ?? '';
  const input = document.getElementById('resultado-busqueda');
  if (input) {
    input.value = S.datos.busquedaResultados;
    input.addEventListener('input', () => {
      S.datos.busquedaResultados = input.value.trim().toLowerCase();
      pintarHistorialResultados();
    });
  }
}

function filtrarEstadoResultados(estado) {
  S.datos.filtroResultados = estado;
  document.querySelectorAll('.resultado-estados button').forEach(b =>
    b.classList.toggle('activo', b.dataset.estado === estado));
  pintarHistorialResultados();
}

function pintarVistaResultados(vista) {
  S.datos.vistaResultados = vista;
  document.querySelectorAll('.resultado-subtabs button').forEach(b =>
    b.classList.toggle('activo', b.dataset.vista === vista));
  const filtros = document.getElementById('resultado-filtros');
  if (filtros) filtros.hidden = vista !== 'historial';

  if (vista === 'historial') return pintarHistorialResultados();
  return pintarResumenTemporalResultados(vista);
}

function pintarHistorialResultados() {
  const cont = document.getElementById('resultados-vista');
  if (!cont) return;

  const eventos = (S.datos.resultadosActuales?.eventos ?? []).map(normalizarEventoResultado);
  const estado = S.datos.filtroResultados ?? 'TODOS';
  const busqueda = S.datos.busquedaResultados ?? '';
  const filtrados = eventos.filter(e =>
    (estado === 'TODOS' || e.estadoResultado === estado) &&
    (!busqueda || e.buscable.includes(busqueda)));

  cont.innerHTML = filtrados.length
    ? `<div class="resultado-tabla">${filtrados.map(filaResultadoNueva).join('')}</div>`
    : `<div class="resultado-sin-coincidencias">No hay resultados que coincidan con esos filtros.</div>`;
}

function filaResultadoNueva(e) {
  const clase = e.estadoResultado.toLowerCase().replace('_', '-');
  const textoEstado = {
    EN_JUEGO: 'En juego', GANADO: 'Ganado', PERDIDO: 'Perdido', DEVUELTO: 'Devuelto',
  }[e.estadoResultado];

  return `
    <button class="resultado-fila" onclick="ir('${e.es_casa ? 'casa' : 'sala'}','${e.evento_id}')">
      <div class="resultado-fila-partido">
        <div class="resultado-mini-vs">
          <span>${inicialEquipoResultado(e.equipo_local)}</span><i>VS</i><span>${inicialEquipoResultado(e.equipo_visitante)}</span>
        </div>
        <div>
          <strong>${esc(e.equipo_local ?? '')} vs ${esc(e.equipo_visitante ?? '')}</strong>
          <small>${e.es_casa ? 'Casa' : 'Sala'} ${esc(e.codigo ?? '')}</small>
        </div>
      </div>
      <div class="resultado-fila-tipo"><span>TIPO</span><strong>${e.es_casa ? 'Casa' : 'Sala'}</strong></div>
      <div class="resultado-fila-neto"><span>RESULTADO</span><strong class="${clase}">${e.pendiente ? '—' : `${e.neto > 0 ? '+' : ''}${plata(e.neto)}`}</strong></div>
      <div class="resultado-fila-estado"><span class="resultado-estado ${clase}">${textoEstado}</span></div>
      <div class="resultado-fila-fecha"><span>FECHA</span><strong>${fechaResultadoCompleta(e.cuando)}</strong></div>
      <div class="resultado-fila-flecha">›</div>
    </button>`;
}

function pintarResumenTemporalResultados(tipo) {
  const cont = document.getElementById('resultados-vista');
  if (!cont) return;

  const eventos = (S.datos.resultadosActuales?.eventos ?? []).map(normalizarEventoResultado);
  const porDia = porDiaCerradoDesdeEventos(eventos);
  const agrupados = agruparResultadosTiempo(porDia, tipo);

  cont.innerHTML = agrupados.length
    ? `<div class="resultado-resumen-tiempo">
        ${agrupados.map(x => `
          <div>
            <span>${esc(x.etiqueta)}</span>
            <strong class="${x.neto > 0 ? 'positivo' : x.neto < 0 ? 'negativo' : ''}">${x.neto > 0 ? '+' : ''}${plata(x.neto)}</strong>
          </div>`).join('')}
       </div>`
    : `<div class="resultado-sin-coincidencias">No hay movimientos para este período.</div>`;
}

function porDiaCerradoDesdeEventos(eventos) {
  const mapa = new Map();

  for (const e of eventos) {
    if (e.pendiente || !e.cuando) continue;

    const d = new Date(e.cuando);
    if (Number.isNaN(d.getTime())) continue;

    const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    mapa.set(clave, (mapa.get(clave) ?? 0) + Number(e.neto ?? 0));
  }

  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dia, neto]) => ({ dia, neto }));
}

function agruparResultadosTiempo(porDia, tipo) {
  const mapa = new Map();
  for (const d of porDia) {
    const fecha = new Date(`${String(d.dia).slice(0,10)}T12:00:00`);
    let clave;
    let etiqueta;

    if (tipo === 'dia') {
      clave = String(d.dia).slice(0, 10);
      etiqueta = fecha.toLocaleDateString('es-PE', { day:'2-digit', month:'short', year:'numeric' });
    } else if (tipo === 'semana') {
      const inicio = new Date(fecha);
      const dia = (inicio.getDay() + 6) % 7;
      inicio.setDate(inicio.getDate() - dia);
      clave = inicio.toISOString().slice(0,10);
      const fin = new Date(inicio); fin.setDate(fin.getDate() + 6);
      etiqueta = `${inicio.toLocaleDateString('es-PE',{day:'2-digit',month:'short'})} – ${fin.toLocaleDateString('es-PE',{day:'2-digit',month:'short'})}`;
    } else {
      clave = `${fecha.getFullYear()}-${String(fecha.getMonth()+1).padStart(2,'0')}`;
      etiqueta = fecha.toLocaleDateString('es-PE', { month:'long', year:'numeric' });
    }

    const actual = mapa.get(clave) ?? { clave, etiqueta, neto:0 };
    actual.neto += d.neto;
    mapa.set(clave, actual);
  }
  return [...mapa.values()].sort((a,b) => b.clave.localeCompare(a.clave));
}

function inicialEquipoResultado(nombre) {
  const partes = String(nombre ?? '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  return partes.length === 1
    ? partes[0].slice(0, 2).toUpperCase()
    : (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function fechaResultadoCorta(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0,10);
  return d.toLocaleDateString('es-PE', { day:'2-digit', month:'short' });
}

function fechaResultadoCompleta(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor);
  return d.toLocaleString('es-PE', {
    day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit',
  });
}
