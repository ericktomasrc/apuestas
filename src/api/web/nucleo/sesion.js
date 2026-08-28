'use strict';

async function cargarSesion() {
  const yo = await api('/yo');
  S.usuario = yo.usuario;
  S.saldo = yo.saldo;
  S.pais = yo.pais;
  S.limites = yo.limites;
  S.modulos = yo.modulos ?? {};
  return yo;
}

async function refrescarSaldo() {
  S.saldo = await api('/yo/saldo');
  const chip = document.getElementById('saldo-chip');
  if (chip) chip.innerHTML = textoSaldo();
}

function textoSaldo() {
  if (!S.saldo) return '';
  const retenido = S.saldo.retenidoCentavos > 0
    ? `<small>+${plata(S.saldo.retenidoCentavos)} en juego</small>` : '';
  return `<strong>${plata(S.saldo.disponibleCentavos)}</strong>${retenido}`;
}

function salir() {
  localStorage.removeItem('token');
  S.token = null;
  S.usuario = null;
  location.hash = '';
  location.reload();
}

// ---------------------------------------------------------------------
//  Visitantes
// ---------------------------------------------------------------------

/**
 * ¿Hay alguien con cuenta detrás de esta pantalla?
 *
 * Se mira `S.usuario` y no `S.token`: un token guardado que ya no vale
 * deja la app sin usuario, y ahí la persona es un visitante aunque el
 * navegador tenga algo escrito en localStorage.
 */
const haySesion = () => S.usuario !== null && S.usuario !== undefined;

/**
 * Pide la cuenta antes de una acción que la necesita.
 *
 * Se explica QUÉ se estaba intentando hacer, no un genérico «inicia
 * sesión». Quien acaba de tocar un lado de una apuesta ya sabe que
 * quiere apostar; lo que no sabe es por qué se le interrumpe.
 *
 * Se guarda a dónde volver: registrarse y terminar en el muro, lejos
 * de la sala que se estaba mirando, es la forma más rápida de perder a
 * alguien que ya había decidido.
 */
function pedirCuenta(queIbaAHacer) {
  // No hace falta guardar a dónde volver: la pantalla de entrada no
  // toca el hash, y al terminar el registro el arranque lee esa misma
  // dirección. Quien estaba en `#sala/abc` vuelve a `#sala/abc`.
  hoja('Necesitas una cuenta', queIbaAHacer, `
    <div class="caja" style="margin-bottom:16px">
      <p style="font-size:14px;line-height:1.65;margin:0">
        Crearla toma menos de un minuto y no cuesta nada. Se apuesta
        entre personas, sin casa de por medio: el que acierta se lleva
        todo.</p>
    </div>
    <button class="btn btn-favor btn-ancho"
      onclick="cerrarHoja();pantallaEntrar('registro')">Crear mi cuenta</button>
    <button class="btn btn-plano btn-ancho" style="margin-top:9px"
      onclick="cerrarHoja();pantallaEntrar('ingreso')">Ya tengo cuenta</button>
    <p class="pista" style="text-align:center;margin-top:12px">
      Puedes seguir mirando sin cuenta. Solo hace falta para apostar.</p>`);
}

/**
 * Envuelve una acción que exige cuenta.
 *
 * Devuelve `true` si se puede seguir. Así cada llamador queda en una
 * línea y ninguno se olvida de comprobar.
 */
function exigeCuenta(queIbaAHacer) {
  if (haySesion()) return true;
  pedirCuenta(queIbaAHacer);
  return false;
}
