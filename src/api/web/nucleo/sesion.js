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
