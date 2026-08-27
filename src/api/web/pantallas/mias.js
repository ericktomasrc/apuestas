'use strict';

/**
 * Mis salas.
 *
 * Ordenadas por urgencia: primero lo que necesita atención —salas que
 * cierran pronto, apuestas sin contraparte—, después lo que ya está
 * resuelto. Quien abre esta pantalla viene a ver si tiene que hacer
 * algo, no a repasar su historial.
 */
PANTALLAS.mias = async () => {
  const r = await api('/yo/salas');
  const salas = r.salas ?? [];

  if (salas.length === 0) {
    return pintar(armazon(`
      <h1 class="titulo">Mis salas</h1>
      <div class="vacio">
        <h3>Todavía no tienes salas</h3>
        <p>Aquí van las que abras y aquellas donde apuestes.
        Busca una que necesite tu lado, o crea la tuya y compártela.</p>
        <button class="btn btn-favor" onclick="ir('muro')">Ver salas abiertas</button>
        <button class="btn btn-plano" style="margin-top:9px"
          onclick="ir('crear')">Crear una sala</button>
      </div>`));
  }

  const activas = salas.filter(s =>
    ['ABIERTA','CUENTA_REGRESIVA','CERRADA','EN_JUEGO'].includes(s.estado));
  const cerradas = salas.filter(s => !activas.includes(s));

  const sinApostar = activas.filter(s =>
    s.soy_anfitrion && (s.misPosiciones ?? []).length === 0);

  pintar(armazon(`
    <h1 class="titulo">Mis salas</h1>
    <p class="sub">${activas.length} activa(s) · ${plata(S.saldo.retenidoCentavos)} en juego</p>

    ${sinApostar.length ? `
      <p class="pista" style="margin:-8px 0 16px">
        Tienes ${sinApostar.length} sala(s) tuya(s) donde todavía no apostaste.
        No hace falta, pero una sala con su anfitrión adentro se llena antes.</p>` : ''}

    <div class="rejilla-salas">${activas.map(tarjetaMia).join('')}</div>

    ${cerradas.length ? `
      <h2 style="margin:20px 0 9px;color:var(--tenue)">Terminadas</h2>
      <div class="rejilla-salas">${cerradas.map(tarjetaMia).join('')}</div>` : ''}
  `));
};

function tarjetaMia(s) {
  const mias = s.misPosiciones ?? [];
  const comprometido = mias.reduce((t, p) => t + Number(p.montoCentavos ?? 0), 0);

  const estados = {
    ABIERTA:          ['et-favor',  'Abierta'],
    CUENTA_REGRESIVA: ['et-espera', 'Cerrando'],
    CERRADA:          ['et-gris',   'Esperando el partido'],
    EN_JUEGO:         ['et-espera', 'En juego'],
    LIQUIDADA:        ['et-favor',  'Resuelta'],
    ANULADA:          ['et-gris',   'Anulada'],
    EXPIRADA:         ['et-gris',   'Expirada'],
  };
  const [clase, texto] = estados[s.estado] ?? ['et-gris', s.estado];

  // El resultado propio: lo primero que se quiere saber al volver.
  const resultado = s.miResultadoCentavos;
  const hayResultado = resultado !== undefined && resultado !== null;

  return `
  <div class="sala" onclick="ir('sala','${s.id}')" role="button" tabindex="0">
    <div class="sala-cab">
      <div style="min-width:0">
        <div class="partido">${esc(s.equipo_local)} vs ${esc(s.equipo_visitante)}</div>
        <div class="liga">
          ${esc(s.liga ?? '')}
          ${s.soy_anfitrion ? ' · <strong style="color:var(--favor)">tu sala</strong>' : ''}
        </div>
      </div>
      <span class="etiqueta ${clase}">${esc(texto)}</span>
    </div>

    ${mias.length
      ? mias.map(p => `
          <div class="mercado-nombre" style="display:flex;justify-content:space-between;gap:10px">
            <span>${esc(p.etiqueta ?? '')}</span>
            <span class="num" style="color:var(--tinta);font-weight:600">
              ${plata(p.montoCentavos)}</span>
          </div>`).join('')
      : `<div class="mercado-nombre" style="color:var(--tenue)">
           Todavía no apostaste en tu propia sala
         </div>`}

    <div class="sala-pie">
      <span>${s.estado === 'ABIERTA'
        ? `Empieza ${cuando(s.inicia_en)}`
        : fechaCorta(s.inicia_en)}</span>
      ${hayResultado
        ? `<span class="num" style="font-weight:600;color:${
            resultado > 0 ? 'var(--favor)' : resultado < 0 ? 'var(--mal)' : 'var(--tenue)'}">
             ${resultado > 0 ? '+' : ''}${plata(resultado)}
           </span>`
        : comprometido > 0
          ? `<span>${plata(comprometido)} comprometidos</span>`
          : `<span>${s.participantes ?? 0} de ${s.tope_participantes}</span>`}
    </div>
  </div>`;
}
