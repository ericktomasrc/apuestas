'use strict';

/**
 * Billetera.
 *
 * Esta pantalla organiza saldo e historial. Las acciones de recarga y retiro
 * siguen siendo informativas porque la pasarela todavía no está conectada.
 */
PANTALLAS.billetera = async () => {
  const [saldo, movimientos, resultados] = await Promise.all([
    api('/yo/saldo'),
    api('/yo/movimientos?limite=100'),
    api('/yo/resultados?dias=365').catch(() => ({ resumen:{}, eventos:[] })),
  ]);

  S.saldo = saldo;

  const lista = (movimientos.movimientos ?? []).map(normalizarMovimientoBilletera);
  const eventos = (resultados.eventos ?? []).map(normalizarEventoBilletera);
  const mapaEventos = new Map(eventos.map(e => [String(e.eventoId), e]));

  // Enriquece cada movimiento cuando hay una sala asociada.
  for (const m of lista) {
    const clave = String(m.salaId ?? m.casaId ?? '');
    m.evento = clave ? mapaEventos.get(clave) ?? null : null;
  }

  S.datos.billetera = {
    lista,
    eventos,
    filtro: S.datos.billetera?.filtro ?? 'todos',
    texto: S.datos.billetera?.texto ?? '',
    dias: S.datos.billetera?.dias ?? 30,
  };

  const cerrados = eventos.filter(e => !e.pendiente);
  const positivos = cerrados.filter(e => e.neto > 0);
  const negativos = cerrados.filter(e => e.neto < 0);
  const ganado = positivos.reduce((t,e) => t + e.neto, 0);
  const perdido = -negativos.reduce((t,e) => t + e.neto, 0);

  pintar(armazon(`
    <div class="billetera-pagina">
      <section class="billetera-encabezado">
        <div>
          <div class="billetera-kicker">TU CUENTA</div>
          <h1>Billetera</h1>
          <p>Tu saldo y el detalle de todos tus movimientos.</p>
        </div>
      </section>

      ${S.usuario?.plan_vencido ? avisoTope(
        `Tu plan venció, así que ahora pagas ${
          ((S.usuario.tasa_comision ?? 0.07) * 100).toFixed(1)}% de comisión.`
      ) : ''}

      <div class="billetera-layout">
        <div class="billetera-principal">

          <section class="billetera-metricas">
            ${tarjetaSaldoBilletera('disponible','Disponible',
              plata(saldo.disponibleCentavos),'Saldo libre de la cuenta','▣')}
            ${tarjetaSaldoBilletera('juego','En juego',
              plata(saldo.retenidoCentavos),
              saldo.retenidoCentavos > 0 ? 'Saldo retenido temporalmente' : 'Nada retenido ahora','◷')}
            ${tarjetaSaldoBilletera('positivo','Resultados +',
              plata(ganado),`${positivos.length} resultado(s) cerrado(s)`,'↑')}
            ${tarjetaSaldoBilletera('negativo','Resultados −',
              plata(perdido),`${negativos.length} resultado(s) cerrado(s)`,'↓')}
          </section>

          <div class="billetera-acciones-principales">
            <button class="billetera-accion primaria" onclick="abrirDeposito()">
              <span>＋</span> Recarga no disponible
            </button>
            <button class="billetera-accion" onclick="abrirRetiro()">
              <span>↑</span> Retiro no disponible
            </button>
            <button class="billetera-accion" onclick="document.getElementById('movimientos-billetera')?.scrollIntoView({behavior:'smooth'})">
              <span>▤</span> Historial
            </button>
          </div>

          <section class="billetera-card billetera-movimientos" id="movimientos-billetera">
            <div class="billetera-filtros">
              <div class="billetera-tabs">
                ${[
                  ['todos','Todos'],
                  ['billetera-en-juego','En juego'],
                  ['resultados','Resultados'],
                  ['devueltos','Devueltos'],
                  ['entradas','Entradas'],
                ].map(([id,txt]) => `
                  <button class="${S.datos.billetera.filtro === id ? 'activo' : ''}"
                    onclick="filtrarBilletera('${id}')">${txt}</button>`).join('')}
              </div>

              <div class="billetera-filtros-derecha">
                <label class="billetera-buscar">
                  <span>⌕</span>
                  <input type="search" placeholder="Buscar movimiento..."
                    value="${esc(S.datos.billetera.texto)}"
                    oninput="buscarBilletera(this.value)">
                </label>

                <select class="billetera-periodo" onchange="periodoBilletera(this.value)">
                  ${[[7,'7 días'],[30,'30 días'],[90,'3 meses'],[365,'1 año']]
                    .map(([d,t]) => `<option value="${d}" ${S.datos.billetera.dias === d ? 'selected' : ''}>${t}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="billetera-tabla-cab">
              <span>Fecha</span>
              <span>Concepto</span>
              <span>Detalle</span>
              <span>Estado</span>
              <span>Importe</span>
            </div>

            <div id="billetera-lista">
              ${pintarMovimientosBilletera()}
            </div>
          </section>

          <div class="billetera-nota">
            <div class="billetera-nota-icono">✓</div>
            <div>
              <strong>Historial basado en movimientos de cuenta</strong>
              <span>Los estados pendientes se separan de los resultados ya cerrados.</span>
            </div>
          </div>
        </div>

        <aside class="billetera-lateral">
          <section class="billetera-card billetera-rapidas">
            <h3>ACCIONES RÁPIDAS</h3>
            ${accionRapidaBilletera('▣','Recarga','Todavía no disponible','abrirDeposito()')}
            ${accionRapidaBilletera('↑','Retiro','Todavía no disponible','abrirRetiro()')}
            ${accionRapidaBilletera('▤','Movimientos','Ir al historial',
              "document.getElementById('movimientos-billetera')?.scrollIntoView({behavior:'smooth'})")}
          </section>

          <section class="billetera-card">
            <div class="billetera-card-cab">
              <h3>RESUMEN DEL PERÍODO</h3>
              <span>${S.datos.billetera.dias} días</span>
            </div>
            <div id="billetera-resumen-periodo">
              ${resumenPeriodoBilletera()}
            </div>
          </section>

          <section class="billetera-card billetera-metodos">
            <h3>MÉTODOS DE SALDO</h3>
            <div class="billetera-metodo-vacio">
              <span>◇</span>
              <div>
                <strong>No disponibles todavía</strong>
                <small>La interfaz queda lista sin conectar una pasarela.</small>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  `));
};

function normalizarMovimientoBilletera(m) {
  return {
    ...m,
    tipo: String(m.tipo ?? ''),
    monto: Number(m.montoCentavos ?? m.monto_centavos ?? 0),
    fecha: m.creadoEn ?? m.creado_en ?? m.fecha_crea ?? null,
    salaId: m.salaId ?? m.sala_id ?? null,
    casaId: m.casaId ?? m.casa_id ?? null,
    motivo: m.motivo ?? '',
  };
}

function normalizarEventoBilletera(e) {
  const estado = String(e.estado ?? '');
  return {
    eventoId: e.evento_id ?? e.eventoId ?? '',
    estado,
    neto: Number(e.neto ?? 0),
    equipoLocal: e.equipo_local ?? '',
    equipoVisitante: e.equipo_visitante ?? '',
    codigo: e.codigo ?? '',
    cuando: e.cuando ?? null,
    pendiente: ['ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO'].includes(estado),
  };
}

function tarjetaSaldoBilletera(clase, titulo, valor, ayuda, icono) {
  return `
    <div class="billetera-metrica ${clase}">
      <div class="billetera-metrica-icono">${icono}</div>
      <div>
        <span>${titulo}</span>
        <strong>${valor}</strong>
        <small>${ayuda}</small>
      </div>
    </div>`;
}

function accionRapidaBilletera(icono, titulo, ayuda, accion) {
  return `
    <button class="billetera-rapida" onclick="${accion}">
      <i>${icono}</i>
      <span><strong>${titulo}</strong><small>${ayuda}</small></span>
      <b>›</b>
    </button>`;
}

function estadoMovimientoBilletera(m) {
  if (m.tipo === 'DEPOSITO') return ['billetera-entrada','Entrada'];
  if (m.tipo === 'DEVOLUCION' || m.tipo === 'LIBERACION') return ['billetera-devuelto','Devuelto'];
  if (m.tipo === 'PREMIO') return ['billetera-ganado','Resultado +'];

  if (m.tipo === 'RETENCION') {
    if (m.evento?.pendiente) return ['billetera-en-juego','En juego'];
    if (m.evento && !m.evento.pendiente) {
      if (m.evento.neto > 0) return ['billetera-ganado','Cerrado +'];
      if (m.evento.neto < 0) return ['billetera-perdido','Cerrado −'];
      return ['billetera-devuelto','Cerrado'];
    }
    return ['billetera-neutro','Movimiento'];
  }

  if (m.tipo === 'RETIRO') return ['billetera-salida','Salida'];
  return ['billetera-neutro','Movimiento'];
}

function detalleMovimientoBilletera(m) {
  if (m.evento) {
    const partido = [m.evento.equipoLocal, m.evento.equipoVisitante].filter(Boolean).join(' vs ');
    const codigo = m.evento.codigo ? `Sala ${esc(m.evento.codigo)}` : '';
    return {
      titulo: partido || codigo || 'Movimiento de sala',
      sub: codigo,
    };
  }

  const nombres = {
    DEPOSITO: 'Movimiento de entrada',
    RETIRO: 'Movimiento de salida',
    RETENCION: 'Saldo retenido',
    LIBERACION: 'Saldo liberado',
    PREMIO: 'Resultado positivo',
    DEVOLUCION: 'Devolución',
    BONO: 'Bono',
    AJUSTE: 'Corrección',
    COMISION: 'Comisión',
  };

  return {
    titulo: nombres[m.tipo] ?? m.tipo,
    sub: m.motivo ? esc(m.motivo) : '',
  };
}

function nombreMovimientoBilletera(m) {
  const nombres = {
    DEPOSITO: 'Recarga',
    RETIRO: 'Retiro',
    RETENCION: 'Entraste a una sala',
    LIBERACION: 'Saldo liberado',
    PREMIO: 'Resultado',
    DEVOLUCION: 'Devolución',
    BONO: 'Bono',
    AJUSTE: 'Corrección',
    COMISION: 'Comisión',
  };
  return nombres[m.tipo] ?? m.tipo;
}

function filaMovimientoBilletera(m) {
  const [claseEstado, textoEstado] = estadoMovimientoBilletera(m);
  const detalle = detalleMovimientoBilletera(m);
  const positivo = m.monto > 0;

  return `
    <div class="billetera-fila">
      <div class="billetera-fecha">${fechaCorta(m.fecha)}</div>
      <div class="billetera-concepto">
        <i class="${claseEstado}"></i>
        <strong>${esc(nombreMovimientoBilletera(m))}</strong>
      </div>
      <div class="billetera-detalle">
        <strong>${detalle.titulo}</strong>
        ${detalle.sub ? `<small>${detalle.sub}</small>` : ''}
      </div>
      <div><span class="billetera-estado ${claseEstado}">${textoEstado}</span></div>
      <div class="billetera-importe ${positivo ? 'positivo' : m.monto < 0 ? 'negativo' : ''}">
        ${positivo ? '+' : ''}${plata(m.monto)}
      </div>
    </div>`;
}

function cumpleFiltroBilletera(m) {
  const estado = estadoMovimientoBilletera(m)[0];
  const filtro = S.datos.billetera?.filtro ?? 'todos';

  if (filtro === 'en-juego' && estado !== 'billetera-en-juego') return false;
  if (filtro === 'resultados' && !['billetera-ganado','billetera-perdido'].includes(estado)) return false;
  if (filtro === 'devueltos' && estado !== 'billetera-devuelto') return false;
  if (filtro === 'entradas' && m.tipo !== 'DEPOSITO') return false;

  const dias = Number(S.datos.billetera?.dias ?? 30);
  if (m.fecha) {
    const f = new Date(m.fecha);
    if (!Number.isNaN(f.getTime())) {
      const desde = Date.now() - dias * 86400_000;
      if (f.getTime() < desde) return false;
    }
  }

  const q = String(S.datos.billetera?.texto ?? '').trim().toLowerCase();
  if (q) {
    const d = detalleMovimientoBilletera(m);
    const texto = [
      nombreMovimientoBilletera(m), d.titulo, d.sub, estadoMovimientoBilletera(m)[1],
      m.motivo
    ].join(' ').toLowerCase();
    if (!texto.includes(q)) return false;
  }

  return true;
}

function pintarMovimientosBilletera() {
  const lista = (S.datos.billetera?.lista ?? []).filter(cumpleFiltroBilletera);
  if (!lista.length) {
    return `<div class="billetera-sin-movimientos">No hay movimientos para este filtro.</div>`;
  }
  return lista.map(filaMovimientoBilletera).join('');
}

function refrescarListaBilletera() {
  const cont = document.getElementById('billetera-lista');
  if (cont) cont.innerHTML = pintarMovimientosBilletera();

  const resumen = document.getElementById('billetera-resumen-periodo');
  if (resumen) resumen.innerHTML = resumenPeriodoBilletera();
}

function filtrarBilletera(filtro) {
  S.datos.billetera.filtro = filtro;
  document.querySelectorAll('.billetera-tabs button').forEach(b =>
    b.classList.toggle('activo', b.textContent.trim().toLowerCase().replace(' ','-') === filtro));
  // La comparación del texto no cubre "Resultados"; se sincroniza por orden.
  const orden = ['todos','en-juego','resultados','devueltos','entradas'];
  document.querySelectorAll('.billetera-tabs button').forEach((b,i) =>
    b.classList.toggle('activo', orden[i] === filtro));
  refrescarListaBilletera();
}

function buscarBilletera(texto) {
  S.datos.billetera.texto = texto;
  refrescarListaBilletera();
}

function periodoBilletera(valor) {
  S.datos.billetera.dias = Number(valor);
  refrescarListaBilletera();
}

function resumenPeriodoBilletera() {
  const lista = (S.datos.billetera?.lista ?? []).filter(m => {
    const dias = Number(S.datos.billetera?.dias ?? 30);
    if (!m.fecha) return true;
    const f = new Date(m.fecha);
    return Number.isNaN(f.getTime()) || f.getTime() >= Date.now() - dias * 86400_000;
  });

  const entradas = lista.filter(m => m.tipo === 'DEPOSITO').reduce((t,m) => t + Math.max(m.monto,0),0);
  const devueltos = lista.filter(m => ['DEVOLUCION','LIBERACION'].includes(m.tipo))
    .reduce((t,m) => t + Math.max(m.monto,0),0);

  const eventos = S.datos.billetera?.eventos ?? [];
  const dias = Number(S.datos.billetera?.dias ?? 30);
  const desde = Date.now() - dias * 86400_000;
  const cerrados = eventos.filter(e => {
    if (e.pendiente) return false;
    const f = new Date(e.cuando);
    return Number.isNaN(f.getTime()) || f.getTime() >= desde;
  });
  const positivos = cerrados.filter(e => e.neto > 0).reduce((t,e) => t + e.neto,0);
  const negativos = -cerrados.filter(e => e.neto < 0).reduce((t,e) => t + e.neto,0);

  return `
    <div class="billetera-resumen-lista">
      <div><span>Entradas</span><strong class="positivo">${plata(entradas)}</strong></div>
      <div><span>Devueltos</span><strong class="positivo">${plata(devueltos)}</strong></div>
      <div><span>Resultados +</span><strong class="positivo">${plata(positivos)}</strong></div>
      <div><span>Resultados −</span><strong class="negativo">${plata(negativos)}</strong></div>
      <div><span>En juego ahora</span><strong class="en-juego">${plata(S.saldo?.retenidoCentavos ?? 0)}</strong></div>
      <div class="total"><span>Disponible actual</span><strong>${plata(S.saldo?.disponibleCentavos ?? 0)}</strong></div>
    </div>`;
}

// ---------------------------------------------------------------------
// Recargar y retirar — siguen pendientes de la pasarela.
// ---------------------------------------------------------------------
function abrirDeposito() {
  hoja('Recarga', 'Todavía no disponible', `
    <div class="caja" style="margin-bottom:16px">
      <p style="font-size:14px;line-height:1.6">
        La pasarela todavía no está conectada en esta versión.</p>
    </div>
    <button class="btn btn-plano btn-ancho" onclick="cerrarHoja()">Entendido</button>`);
}

function abrirRetiro() {
  hoja('Retiro', 'Todavía no disponible', `
    <div class="caja" style="margin-bottom:16px">
      <p style="font-size:14px;line-height:1.6">
        Los retiros todavía no están habilitados en esta versión.</p>
    </div>
    <button class="btn btn-plano btn-ancho" onclick="cerrarHoja()">Entendido</button>`);
}
