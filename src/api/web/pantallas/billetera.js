'use strict';

/**
 * Billetera.
 *
 * El saldo se parte en dos cifras porque son dos cosas distintas:
 * lo disponible es lo que se puede apostar ahora; lo retenido está
 * comprometido en salas abiertas y volverá, gane o pierda. Mostrar un
 * solo número haría que alguien creyera tener menos de lo que tiene.
 */
PANTALLAS.billetera = async () => {
  const [saldo, movimientos] = await Promise.all([
    api('/yo/saldo'),
    api('/yo/movimientos?limite=40'),
  ]);
  S.saldo = saldo;

  const lista = movimientos.movimientos ?? [];

  pintar(armazon(`
    <h1 class="titulo">Billetera</h1>
    <p class="sub">Tu dinero y a dónde fue.</p>

    ${S.usuario?.plan_vencido ? avisoTope(
      `Tu plan venció, así que ahora pagas ${
        ((S.usuario.tasa_comision ?? 0.07) * 100).toFixed(1)}% de comisión.`
    ) : ''}

    <div class="metricas" style="grid-template-columns:1fr 1fr">
      <div class="caja">
        <div class="dato-rotulo">Disponible</div>
        <div class="num" style="font-size:24px;font-weight:600">
          ${plata(saldo.disponibleCentavos)}</div>
        <div class="pista" style="margin-top:2px">para apostar ahora</div>
      </div>
      <div class="caja">
        <div class="dato-rotulo">En juego</div>
        <div class="num" style="font-size:24px;font-weight:600;color:${
          saldo.retenidoCentavos > 0 ? 'var(--contra)' : 'var(--linea-fuerte)'}">
          ${plata(saldo.retenidoCentavos)}</div>
        <div class="pista" style="margin-top:2px">vuelve al resolverse</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-bottom:18px">
      <button class="btn btn-favor" onclick="abrirDeposito()">Recargar</button>
      <button class="btn btn-plano" onclick="abrirRetiro()"
        ${saldo.disponibleCentavos === 0 ? 'disabled' : ''}>Retirar</button>
    </div>

    <h2 style="margin-bottom:9px">Movimientos</h2>
    ${lista.length === 0
      ? `<div class="vacio"><p>Todavía no hay movimientos.</p></div>`
      : `<div class="caja" style="padding:0">
           ${lista.map(filaMovimiento).join('')}
         </div>`}
  `));
};

/**
 * Una fila del historial.
 *
 * Los perdedores NO llevan movimiento propio: su retención ya descontó
 * el dinero al entrar. Por eso una derrota se ve como la retención que
 * nunca volvió, no como un cargo aparte.
 */
function filaMovimiento(m) {
  const monto = Number(m.montoCentavos ?? m.monto_centavos ?? 0);
  const positivo = monto > 0;

  const nombres = {
    DEPOSITO:   'Recarga',
    RETIRO:     'Retiro',
    RETENCION:  'Entraste a una sala',
    LIBERACION: 'Saliste de una sala',
    PREMIO:     'Ganaste',
    DEVOLUCION: 'Te devolvimos',
    BONO:       'Bono',
    AJUSTE:     'Corrección',
    COMISION:   'Comisión',
  };

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;
    padding:9px 13px;border-bottom:1px solid var(--linea)">
    <div style="min-width:0">
      <div style="font-size:13px;font-weight:500">
        ${esc(nombres[m.tipo] ?? m.tipo)}</div>
      <div style="font-size:11px;color:var(--tenue);margin-top:1px">
        ${fechaCorta(m.creadoEn ?? m.creado_en)}
        ${m.motivo ? ` · ${esc(m.motivo)}` : ''}
      </div>
    </div>
    <div class="num" style="font-weight:600;white-space:nowrap;
      color:${positivo ? 'var(--favor)' : 'var(--tinta)'}">
      ${positivo ? '+' : ''}${plata(monto)}
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
//  Recargar y retirar — pendientes de la pasarela
// ---------------------------------------------------------------------

/**
 * La pasarela de pagos todavía no existe.
 *
 * Se muestra el estado real en vez de un botón que no hace nada: un
 * control que parece funcionar y no funciona erosiona más la confianza
 * que uno que dice honestamente que falta.
 */
function abrirDeposito() {
  hoja('Recargar', 'Todavía no disponible', `
    <div class="caja" style="margin-bottom:16px">
      <p style="font-size:14px;line-height:1.6">
        Estamos conectando los medios de pago. Mientras tanto,
        el saldo se carga desde el panel de administración.</p>
    </div>
    <p class="pista">
      Cuando esté listo vas a poder recargar con Yape, Plin,
      tarjeta y transferencia. El dinero se acredita solo cuando el
      pago está confirmado, nunca antes.</p>
    <button class="btn btn-plano btn-ancho" style="margin-top:16px"
      onclick="cerrarHoja()">Entendido</button>`);
}

function abrirRetiro() {
  hoja('Retirar', 'Todavía no disponible', `
    <div class="caja" style="margin-bottom:16px">
      <p style="font-size:14px;line-height:1.6">
        Los retiros se habilitan junto con las recargas.</p>
    </div>
    <p class="pista">
      Al pedir un retiro, el monto se retiene de inmediato para que no
      se pueda gastar dos veces. Se libera solo si el retiro se rechaza.</p>
    <button class="btn btn-plano btn-ancho" style="margin-top:16px"
      onclick="cerrarHoja()">Entendido</button>`);
}
