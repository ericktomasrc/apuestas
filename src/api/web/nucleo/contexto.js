'use strict';

/**
 * CÓMO LLEGAN LOS DOS EQUIPOS.
 *
 * Forma reciente, goles y enfrentamientos directos. Datos crudos, sin
 * veredicto.
 *
 * ⚠️ Deliberadamente NO se muestra una probabilidad. Si la app dijera
 * «Botafogo 62%» con todo pagando 2.0x, estaría publicando que un lado
 * es matemáticamente mejor. La consecuencia no es gente mejor
 * informada: es que todos van al mismo lado y las salas dejan de
 * llenarse. El producto depende de que la gente no esté de acuerdo.
 *
 * Los mismos datos, sin número oficial encima, informan igual y dejan
 * que cada quien saque su conclusión.
 */
async function bloqueContexto(partidoId, local, visitante, compacto = false) {
  let r;
  try {
    r = await api('/partidos/' + partidoId + '/contexto');
  } catch {
    return '';   // sin datos, no se muestra nada. Inventar sería peor.
  }
  if (!r.contexto) return '';

  const c = r.contexto;
  const h = c.historial;

  const racha = f => f.ultimos.map(x => `
    <span class="marca-${x === 'G' ? 'g' : x === 'E' ? 'e' : 'p'}">${x}</span>`).join('');

  /**
   * Versión para tarjetas: las dos rachas enfrentadas y el promedio
   * de goles debajo.
   *
   * Se muestra al ELEGIR el partido, que es cuando el dato sirve.
   * Dentro del panel de apuestas llegaría tarde: ahí ya se eligió.
   */
  if (compacto) {
    return `
    <div class="contexto-mini">
      <div>
        <div class="racha">${racha(c.local)}</div>
        <div class="contexto-goles num">${c.local.golesFavor} · ${c.local.golesContra}</div>
      </div>
      <div style="text-align:right">
        <div class="racha" style="justify-content:flex-end">${racha(c.visitante)}</div>
        <div class="contexto-goles num">${c.visitante.golesFavor} · ${c.visitante.golesContra}</div>
      </div>
    </div>
    ${h ? `<div class="contexto-h2h">${h.jugados} ${h.jugados === 1 ? 'duelo' : 'duelos'}:
      ${h.ganoLocal}-${h.empates}-${h.ganoVisitante}</div>` : ''}`;
  }

  return `
  <div class="contexto">
    <div class="contexto-lados">
      <div>
        <div class="contexto-equipo">${esc(local)}</div>
        <div class="racha">${racha(c.local)}</div>
        <div class="contexto-goles num">
          ${c.local.golesFavor} marcados · ${c.local.golesContra} recibidos
        </div>
      </div>
      <div style="text-align:right">
        <div class="contexto-equipo">${esc(visitante)}</div>
        <div class="racha" style="justify-content:flex-end">${racha(c.visitante)}</div>
        <div class="contexto-goles num">
          ${c.visitante.golesFavor} marcados · ${c.visitante.golesContra} recibidos
        </div>
      </div>
    </div>

    ${h ? `
      <div class="contexto-historial">
        Se vieron ${h.jugados} ${h.jugados === 1 ? 'vez' : 'veces'}:
        ${[
          h.ganoLocal > 0 ? `${h.ganoLocal} ganó ${esc(local)}` : null,
          h.ganoVisitante > 0 ? `${h.ganoVisitante} ganó ${esc(visitante)}` : null,
          h.empates > 0 ? `${h.empates} ${h.empates === 1 ? 'empate' : 'empates'}` : null,
        ].filter(Boolean).join(', ')}
      </div>` : ''}

    <div class="contexto-nota">
      Últimos ${c.local.partidos} partidos y promedio por partido.
      No decimos quién va a ganar: eso lo decides tú.
    </div>
  </div>`;
}
