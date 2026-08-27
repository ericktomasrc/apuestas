'use strict';

/**
 * LA BARRA DE BALANCE.
 *
 * Es el elemento central de la interfaz porque es el mecanismo central
 * del producto: un mercado tiene dos lados que deben sumar lo mismo, y
 * el hueco entre ellos es exactamente lo que invita a entrar.
 *
 * Por eso el hueco se dibuja rayado y no vacío: no es "espacio libre",
 * es "lo que falta". Y por eso los dos lados tienen colores propios —
 * verde a favor, azul en contra — en vez de ser dos tonos del mismo.
 *
 * La gente piensa en personas ("somos 3 contra 2"), pero el sistema
 * iguala DINERO. Mostrar los montos enfrentados enseña la regla real
 * sin tener que explicarla.
 */
function barraBalance(m, opciones = {}) {
  const favor = Number(m.total_favor ?? m.totalFavor ?? 0);
  const contra = Number(m.total_contra ?? m.totalContra ?? 0);
  const mayor = Math.max(favor, contra, 1);
  const total = mayor * 2;

  const hueco = Math.abs(favor - contra);
  const faltaEn = favor > contra ? 'contra' : 'favor';
  const balanceado = favor > 0 && contra > 0 && favor === contra;

  const pct = v => Math.round((v / total) * 100);

  return `
  <div class="balance">
    <div class="balance-cifras">
      <div class="lado favor">
        <div class="lado-etiqueta">${esc(m.etiqueta_favor ?? 'A favor')}</div>
        <div class="lado-monto">${plata(favor)}</div>
      </div>
      <div class="lado contra der">
        <div class="lado-etiqueta">${esc(m.etiqueta_contra ?? 'En contra')}</div>
        <div class="lado-monto">${plata(contra)}</div>
      </div>
    </div>

    <div class="barra">
      <i class="b-favor" style="width:${pct(favor)}%"></i>
      ${faltaEn === 'favor' ? `<i class="b-hueco" style="width:${pct(hueco)}%"></i>` : ''}
      ${faltaEn === 'contra' ? `<i class="b-hueco" style="width:${pct(hueco)}%"></i>` : ''}
      <i class="b-contra" style="width:${pct(contra)}%"></i>
    </div>

    ${balanceado
      ? `<div class="completa">Completa. Se cierra al empezar el partido.</div>`
      : favor === 0 && contra === 0
        ? `<div class="falta"><span style="color:var(--tenue)">Nadie ha entrado todavía</span></div>`
        : `<div class="falta">
             Faltan <b>${plata(hueco)}</b>
             <span class="pastilla ${faltaEn}">${esc(
               faltaEn === 'favor'
                 ? (m.etiqueta_favor ?? 'A favor')
                 : (m.etiqueta_contra ?? 'En contra'))}</span>
           </div>`}
  </div>`;
}

/**
 * Cuánto falta para completar un lado.
 *
 * Es lo que alimenta el botón "Completar": la gente no debería tener
 * que calcular la diferencia a mano.
 */
function loQueFalta(m) {
  const favor = Number(m.total_favor ?? m.totalFavor ?? 0);
  const contra = Number(m.total_contra ?? m.totalContra ?? 0);
  if (favor === contra) return null;
  return {
    lado: favor > contra ? 'EN_CONTRA' : 'A_FAVOR',
    monto: Math.abs(favor - contra),
  };
}
