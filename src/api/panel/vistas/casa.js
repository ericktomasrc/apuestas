'use strict';

/* ---------- Casa ----------
   Financiar, encender, apagar y auditar la casa de la plataforma.

   La pantalla está ordenada por lo que hay que mirar, no por lo que
   hay que hacer: primero el balance real, después el libro. Si la casa
   lleva perdiendo, eso es lo primero que debe verse. */

VISTAS.casa = async () => {
  const r = await api('/casa');
  const b = r.balance ?? {};
  const cuentas = r.cuentas ?? [];
  const financiamientos = r.financiamientos ?? [];
  const cuentaOficial = cuentas.find(c => c.es_casa_oficial && c.activa);

  const resultado = Number(b.resultado_acumulado ?? 0);
  const jugadas = Number(b.liquidadas ?? 0);
  const gano = Number(b.veces_gano ?? 0);
  const perdio = Number(b.veces_perdio ?? 0);

  render(cab('Casa de la plataforma',
    'Cuentas autorizadas, financiamientos y auditoría de la casa',
    puede('casa.exportar')
      ? `<button class="btn-plano" onclick="exportarCasa()">Descargar</button>` : '') + `

    ${!r.config.oficialActiva ? `
      <div class="banda" style="margin-bottom:18px">
        <p><strong>La casa está apagada</strong>
        No inicia nuevas operaciones automáticas. Lo que ya estaba abierto
        conserva su historial y sigue su curso.</p>
        ${puede('casa.gestionar')
          ? `<button class="btn" onclick="interruptorCasa(true)">Encender</button>` : ''}
      </div>` : ''}

    <div class="fichas-dato">
      <span class="ficha-dato">
        Resultado
        <b style="color:${resultado > 0 ? 'var(--bien)'
          : resultado < 0 ? 'var(--mal)' : 'var(--tinta)'}">
          ${resultado > 0 ? '+' : ''}${plata(resultado)}</b>
        <small>${jugadas} liquidada(s)</small>
      </span>
      <span class="ficha-dato">
        Ganó / perdió
        <b>${gano} · ${perdio}</b>
        <small>${jugadas > 0 ? `${Math.round(gano / jugadas * 100)}% de acierto` : 'sin datos'}</small>
      </span>
      <span class="ficha-dato">
        Disponible
        <b>${cuentaOficial ? plata(cuentaOficial.disponible_centavos) : '—'}</b>
        <small>${cuentaOficial ? `${plata(cuentaOficial.retenido_centavos)} comprometidos` : 'sin cuenta oficial activa'}</small>
      </span>
      <span class="ficha-dato">
        Comisión pagada
        <b>${plata(b.comision_pagada ?? 0)}</b>
        <small>registrada en el historial</small>
      </span>
    </div>

    ${puede('casa.gestionar') ? `
      <h2 style="margin-top:22px">Acciones</h2>
      <div class="marco" style="padding:16px;display:flex;gap:9px;flex-wrap:wrap;align-items:center">
        <button class="btn" onclick="financiarCasa()">Financiar</button>
        <button class="btn-plano" onclick="declararCuenta()">Declarar una cuenta</button>
        <button class="btn-plano" onclick="generarOfertasCasaDemo()"
          title="La generación automática no se conecta a ejecución real desde este paquete">
          Generar ofertas ahora
        </button>
        ${r.config.oficialActiva
          ? `<button class="btn-plano" onclick="interruptorCasa(false)">Apagar la casa</button>`
          : ''}
      </div>
      <p class="pista">
        Las cuentas pueden operar con fondos propios, de plataforma o mixtos.
        Desactivar conserva todo el historial contable.</p>` : ''}

    <h2 style="margin-top:26px">Cuentas declaradas</h2>
    <p class="pista" style="margin:-6px 0 12px">
      Declarar autoriza una cuenta para operar la casa. No significa necesariamente financiarla.
    </p>

    ${cuentas.length ? `<div class="marco"><table>
      <thead><tr>
        <th>Correo</th><th>Alias</th><th>Tipo</th><th>Origen de fondos</th>
        <th class="der">Casas creadas</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>${cuentas.map(c => `
        <tr${c.activa ? '' : ' style="opacity:.62"'}>
          <td><strong>${esc(c.email)}</strong></td>
          <td>${esc(c.alias)}</td>
          <td>${c.es_casa_oficial
            ? '<span class="etiqueta et-bien">Casa oficial</span>'
            : '<span class="etiqueta et-gris">Operador</span>'}</td>
          <td>${etiquetaOrigenFondos(c.origen_fondos)}</td>
          <td class="der num">${Number(c.casas_creadas ?? 0)}</td>
          <td>${c.activa
            ? '<span class="etiqueta et-bien">Activa</span>'
            : '<span class="etiqueta et-gris">Inactiva</span>'}</td>
          <td class="der">${puede('casa.gestionar')
            ? `<button class="btn-plano btn-chico"
                 onclick="cambiarEstadoCuentaCasa('${c.id}',${!c.activa},'${escJs(c.email)}')">
                 ${c.activa ? 'Desactivar' : 'Activar'}
               </button>`
            : ''}</td>
        </tr>`).join('')}</tbody>
    </table></div>` : vacio('No hay cuentas declaradas.')}

    <h2 style="margin-top:26px">Historial de financiamientos</h2>
    <p class="pista" style="margin:-6px 0 12px">
      Cada aporte de la plataforma conserva la cuenta destinataria, correo, monto,
      motivo y quién lo autorizó.
    </p>

    ${financiamientos.length ? `<div class="marco"><table>
      <thead><tr>
        <th>Cuándo</th><th>Cuenta (correo)</th><th>Alias</th>
        <th class="der">Monto</th><th>Motivo</th><th>Autorizó</th>
      </tr></thead>
      <tbody>${financiamientos.map(f => `<tr>
        <td class="num" style="font-size:12px">${fecha(f.momento)}</td>
        <td><strong>${esc(f.email ?? '—')}</strong></td>
        <td>${esc(f.alias ?? '—')}</td>
        <td class="der num">${f.monto_centavos == null ? '—' : plata(f.monto_centavos, f.moneda ?? 'PEN')}</td>
        <td>${esc(f.motivo)}</td>
        <td style="color:var(--tenue)">${esc(f.autorizo ?? 'sistema')}</td>
      </tr>`).join('')}</tbody>
    </table></div>` : vacio('Todavía no hay financiamientos.')}

    <h2 style="margin-top:26px">Libro de la casa (auditoría)</h2>
    <p class="pista" style="margin:-6px 0 12px">
      Historial general de decisiones y movimientos. Las cuentas inactivas y los
      eventos anteriores permanecen registrados.
    </p>

    ${r.libro.length ? `<div class="marco"><table>
      <thead><tr><th>Cuándo</th><th>Qué</th><th>Cuenta (correo)</th>
        <th class="der">Monto</th><th>Motivo</th><th>Autorizó</th></tr></thead>
      <tbody>${r.libro.map(l => `<tr>
        <td class="num" style="font-size:12px">${fecha(l.momento)}</td>
        <td><span class="etiqueta ${etiquetaLibro(l.tipo)}">${esc(nombreLibro(l.tipo))}</span>
          ${l.codigo ? `<br><span class="num" style="font-size:11.5px;color:var(--tenue)">${esc(l.codigo)}</span>` : ''}</td>
        <td style="font-size:12px">${esc(l.email ?? '—')}</td>
        <td class="der num">${l.monto_centavos === null ? '—' : plata(l.monto_centavos, l.moneda ?? 'PEN')}</td>
        <td style="font-size:13px">${esc(l.motivo)}</td>
        <td style="font-size:12.5px;color:var(--tenue)">${esc(l.autorizo ?? 'sistema')}</td>
      </tr>`).join('')}</tbody></table></div>`
      : vacio('Todavía no hay nada anotado.')}
  `);
};

function etiquetaOrigenFondos(origen) {
  if (origen === 'PLATAFORMA') return '<span class="etiqueta et-bien">Plataforma</span>';
  if (origen === 'MIXTO') return '<span class="etiqueta et-aviso">Mixto</span>';
  return '<span class="etiqueta et-gris">Fondos propios</span>';
}

function generarOfertasCasaDemo() {
  aviso('La generación de ofertas queda visible como acción administrativa, pero no está conectada a ejecución automática en este paquete.', '');
}

function nombreLibro(tipo) {
  return {
    FINANCIAMIENTO: 'Financiamiento',
    RETIRO_FONDOS: 'Retiro',
    CASA_CREADA: 'Casa creada',
    CASA_CERRADA: 'Casa cerrada',
    CASA_LIQUIDADA: 'Liquidada',
    CASA_ANULADA: 'Anulada',
    CASA_ACTIVADA: 'Encendida',
    CASA_DESACTIVADA: 'Apagada',
    CUENTA_MARCADA: 'Cuenta declarada',
    PARAMETRO_CAMBIADO: 'Parámetro',
  }[tipo] ?? tipo;
}

function etiquetaLibro(tipo) {
  if (['FINANCIAMIENTO', 'CASA_ACTIVADA'].includes(tipo)) return 'et-bien';
  if (['CASA_ANULADA', 'CASA_DESACTIVADA', 'RETIRO_FONDOS'].includes(tipo)) return 'et-aviso';
  return 'et-gris';
}

// ---------------------------------------------------------------------
//  Financiar
// ---------------------------------------------------------------------

async function financiarCasa() {
  // Se leen de /admin/casa, que trae las declaradas con su correo e
  // identificador. La vista pública no lleva correo —es dato
  // personal— y el alias solo no basta para acreditar dinero.
  const r = await api('/casa');
  const declaradas = (r.cuentas ?? []).filter(u =>
    u.activa && ['PLATAFORMA','MIXTO'].includes(u.origen_fondos));

  if (declaradas.length === 0) {
    return modal('Financiar', `
      <p class="pista">
        No hay ninguna cuenta declarada como financiada por la plataforma.<br><br>
        Hay que declararla primero: acreditar dinero a una cuenta sin
        declararla es la casa disfrazada, y es lo primero que audita un
        regulador.</p>`,
      `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>
       <button class="btn" onclick="cerrarModal();declararCuenta()">Declarar una</button>`);
  }

  modal('Financiar la casa', `
    <div class="campo"><label for="f_cuenta">Cuenta</label>
      <select id="f_cuenta">
        ${declaradas.map(u => `<option value="${u.id}">
          ${esc(u.email)} · ${esc(u.alias)}${
            u.es_casa_oficial ? ' · casa oficial' : ' · financiada'}
        </option>`).join('')}
      </select>
      <p class="pista">Solo aparecen las cuentas ya declaradas: acreditar
      dinero a una sin declarar es la casa disfrazada.</p></div>

    <div class="campo"><label for="f_monto">Cuánto</label>
      <input id="f_monto" class="num" inputmode="decimal" placeholder="3000.00">
      <p class="pista">En la moneda del país de la cuenta.</p></div>

    <div class="campo"><label for="f_motivo">Por qué</label>
      <textarea id="f_motivo" rows="2"
        placeholder="Capital de arranque para dar contraparte"></textarea>
      <p class="pista">Obligatorio. Queda en el libro: un auditor pregunta
      por qué, no solo cuánto.</p></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarFinanciamiento()">Acreditar</button>`);
}

async function guardarFinanciamiento() {
  const monto = Math.round(Number(document.getElementById('f_monto').value.replace(',', '.')) * 100);
  const motivo = document.getElementById('f_motivo').value.trim();

  if (!(monto > 0)) return aviso('Escribe cuánto acreditar.', 'mal');
  if (motivo.length < 5) return aviso('El motivo necesita al menos 5 caracteres.', 'mal');

  const datos = {
    usuarioId: document.getElementById('f_cuenta').value,
    montoCentavos: monto,
    motivo,
  };

  await intentar(
    cred => api('/casa/financiar', { method:'POST', body: JSON.stringify({ ...datos, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Acreditar dinero a la casa mueve capital real.',
      mensaje:'Financiamiento acreditado', ocupado:'Acreditando',
      despues: () => VISTAS.casa() });
}

// ---------------------------------------------------------------------
//  Declarar una cuenta
// ---------------------------------------------------------------------

async function declararCuenta() {
  modal('Declarar una cuenta', `
    <p class="pista" style="margin-bottom:16px">
      Una cuenta financiada por la plataforma que no se declara es la casa
      disfrazada. Que esta lista exista y esté completa es lo que hace
      creíble a todo el registro.</p>

    <div class="campo"><label for="d_buscar">Buscar por correo</label>
      <input id="d_buscar" type="email" placeholder="persona@correo.com"
        oninput="buscarCuentaDeclarar(this.value)">
      <p class="pista">El correo identifica sin ambigüedad. También sirve el
      alias, pero dos personas pueden elegir nombres parecidos.</p></div>
    <div id="d_resultados"></div>
    <input type="hidden" id="d_cuenta">

    <div class="permiso"><input type="checkbox" id="d_oficial">
      <label for="d_oficial">Es la casa de la plataforma
        <small>Aparece marcada en el muro y no puede anular sus propias casas.</small>
      </label></div>

    <div class="campo" style="margin-top:14px">
      <label for="d_origen">Origen de fondos</label>
      <select id="d_origen">
        <option value="PROPIOS">Fondos propios</option>
        <option value="PLATAFORMA">Plataforma</option>
        <option value="MIXTO">Mixto</option>
      </select>
      <p class="pista">
        Fondos propios: la plataforma no acredita saldo. Plataforma: puede recibir
        financiamientos desde este panel. Mixto: permite ambos orígenes.
      </p>
    </div>

    <div class="campo" style="margin-top:14px"><label for="d_nota">Nota pública</label>
      <input id="d_nota" placeholder="Cuenta de arranque, financiada por la plataforma">
      <p class="pista">Se muestra en la página de transparencia.</p></div>

    <div class="campo"><label for="d_motivo">Por qué</label>
      <textarea id="d_motivo" rows="2" placeholder="Se declara antes de financiarla"></textarea></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarDeclaracion()">Declarar</button>`);
}

/**
 * Busca cuentas mientras se escribe.
 *
 * Con muchas cuentas, un desplegable con todas deja de ser usable —y
 * además la ruta topa en 100. Buscar escala; listar no.
 */
let temporizadorBusqueda = null;

function buscarCuentaDeclarar(texto) {
  clearTimeout(temporizadorBusqueda);
  const caja = document.getElementById('d_resultados');

  if (texto.trim().length < 2) {
    caja.innerHTML = '';
    document.getElementById('d_cuenta').value = '';
    return;
  }

  // Se espera a que deje de escribir: una petición por tecla satura
  // el servidor sin mejorar nada.
  temporizadorBusqueda = setTimeout(async () => {
    const r = await api('/usuarios?limite=20&buscar=' + encodeURIComponent(texto.trim()));
    const lista = r.usuarios ?? [];

    caja.innerHTML = lista.length
      ? `<div class="marco" style="margin-bottom:14px">
          ${lista.map(u => `
            <button class="bloque-fila" style="width:100%;border-top:1px solid var(--linea)"
              onclick="elegirCuentaDeclarar('${u.id}','${esc(u.alias)}',
                ${u.es_casa_oficial}, ${u.financiada_por_plataforma},
                '${esc(u.email)}')">
              <span style="text-align:left;min-width:0">
                <strong>${esc(u.email)}</strong>
                <small>${esc(u.alias)} · ${esc(u.pais)} ·
                  se registró ${fecha(u.fecha_crea)}</small>
              </span>
              ${u.es_casa_oficial || u.financiada_por_plataforma
                ? '<span class="etiqueta et-bien">Ya declarada</span>' : ''}
            </button>`).join('')}
         </div>`
      : '<p class="pista">Ninguna cuenta con ese nombre.</p>';
  }, 250);
}

function elegirCuentaDeclarar(id, alias, esOficial, financiada, correo) {
  document.getElementById('d_cuenta').value = id;
  document.getElementById('d_buscar').value = correo;
  document.getElementById('d_oficial').checked = Boolean(esOficial);
  document.getElementById('d_origen').value = financiada ? 'PLATAFORMA' : 'PROPIOS';
  document.getElementById('d_resultados').innerHTML =
    `<div class="banda" style="margin-bottom:14px">
       <p><strong>${esc(correo)}</strong>${alias ? ` · ${esc(alias)}` : ''}</p>
     </div>`;
}

async function guardarDeclaracion() {
  const usuarioId = document.getElementById('d_cuenta').value;
  const motivo = document.getElementById('d_motivo').value.trim();

  if (!usuarioId) return aviso('Busca y elige una cuenta primero.', 'mal');
  if (motivo.length < 5) return aviso('El motivo necesita al menos 5 caracteres.', 'mal');

  const datos = {
    usuarioId,
    esCasaOficial: document.getElementById('d_oficial').checked,
    origenFondos: document.getElementById('d_origen').value,
    nota: document.getElementById('d_nota').value.trim() || undefined,
    motivo,
  };

  await intentar(
    cred => api('/casa/declarar', { method:'POST', body: JSON.stringify({ ...datos, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso:'Declarar una cuenta cambia lo que se muestra públicamente.',
      mensaje:'Cuenta declarada', ocupado:'Declarando',
      despues: () => VISTAS.casa() });
}

// ---------------------------------------------------------------------
//  Activar / desactivar cuenta declarada
// ---------------------------------------------------------------------

function cambiarEstadoCuentaCasa(usuarioId, activar, correo) {
  modal(activar ? 'Activar cuenta' : 'Desactivar cuenta', `
    <p class="pista" style="margin-bottom:16px">
      <strong>${esc(correo)}</strong><br><br>
      ${activar
        ? 'Volverá a quedar activa dentro de la administración de la casa.'
        : 'Se conserva todo su historial. Una cuenta inactiva deja de recibir nuevos financiamientos desde la plataforma.'}
    </p>
    <div class="campo">
      <label for="ec_motivo">Por qué</label>
      <textarea id="ec_motivo" rows="2"
        placeholder="${activar ? 'Se vuelve a utilizar esta cuenta' : 'Ya no se utilizará temporalmente'}"></textarea>
    </div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn${activar ? '' : ' btn-mal'}"
       onclick="guardarEstadoCuentaCasa('${usuarioId}',${activar})">
       ${activar ? 'Activar' : 'Desactivar'}
     </button>`);
}

async function guardarEstadoCuentaCasa(usuarioId, activa) {
  const motivo = document.getElementById('ec_motivo')?.value.trim() ?? '';
  if (motivo.length < 5) return aviso('El motivo necesita al menos 5 caracteres.', 'mal');

  await intentar(
    cred => api('/casa/cuentas/' + encodeURIComponent(usuarioId) + '/estado', {
      method:'PATCH',
      body: JSON.stringify({ activa, motivo, ...cred }),
    }),
    {
      titulo:'Confirma tu identidad',
      aviso: activa
        ? 'La cuenta volverá a quedar activa.'
        : 'La cuenta quedará inactiva, pero su historial no se elimina.',
      mensaje: activa ? 'Cuenta activada' : 'Cuenta desactivada',
      ocupado: activa ? 'Activando' : 'Desactivando',
      despues: () => VISTAS.casa(),
    },
  );
}

// ---------------------------------------------------------------------
//  Interruptor
// ---------------------------------------------------------------------

function interruptorCasa(activa) {
  modal(activa ? 'Encender la casa' : 'Apagar la casa', `
    <p class="pista" style="margin-bottom:16px">
      ${activa
        ? 'La casa de la plataforma podrá crear casas y dar contraparte.'
        : 'La casa dejará de crear casas nuevas. Las que ya están abiertas siguen su curso: apagar no anula lo que está corriendo.'}
    </p>
    <div class="campo"><label for="i_motivo">Por qué</label>
      <textarea id="i_motivo" rows="2" placeholder="${activa
        ? 'Arranque: hacen falta contrapartes'
        : 'Ya hay suficientes usuarios apostando entre ellos'}"></textarea>
      <p class="pista">Queda en el libro.</p></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarInterruptor(${activa})">
       ${activa ? 'Encender' : 'Apagar'}</button>`);
}

async function guardarInterruptor(activa) {
  const motivo = document.getElementById('i_motivo').value.trim();
  if (motivo.length < 5) return aviso('El motivo necesita al menos 5 caracteres.', 'mal');

  await intentar(
    cred => api('/casa/interruptor', {
      method:'POST', body: JSON.stringify({ activa, motivo, ...cred }) }),
    { titulo:'Confirma tu identidad',
      aviso: activa
        ? 'Encender la casa la deja operar con dinero real.'
        : 'Apagar la casa detiene su operación.',
      mensaje: activa ? 'Casa encendida' : 'Casa apagada',
      ocupado: activa ? 'Encendiendo' : 'Apagando',
      despues: () => VISTAS.casa() });
}

// ---------------------------------------------------------------------
//  Exportar
// ---------------------------------------------------------------------

function exportarCasa() {
  modal('Descargar', `
    <p class="pista" style="margin-bottom:16px">
      Genera un archivo que Excel abre directamente. Es lo que se entrega
      en una auditoría.</p>

    <div class="campo"><label for="e_que">Qué</label>
      <select id="e_que">
        <option value="libro">Libro de la casa — cada decisión con su motivo</option>
        <option value="liquidaciones">Liquidaciones — resultado de cada casa</option>
        <option value="apuestas">Apuestas contra la casa — quién apostó a qué</option>
      </select></div>

    <div class="rejilla rejilla-2" style="margin:0">
      <div class="campo"><label for="e_desde">Desde</label>
        <input id="e_desde" type="date"></div>
      <div class="campo"><label for="e_hasta">Hasta</label>
        <input id="e_hasta" type="date"></div>
    </div>
    <p class="pista">Sin fechas, trae los últimos 90 días.</p>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="descargarCasa()">Descargar</button>`);
}

/**
 * La descarga va por `fetch` y no por un enlace directo porque el
 * archivo exige el token de sesión, y un `<a href>` no lo manda.
 */
async function descargarCasa() {
  await accion(async () => {
    const params = new URLSearchParams({ que: document.getElementById('e_que').value });
    const desde = document.getElementById('e_desde').value;
    const hasta = document.getElementById('e_hasta').value;
    if (desde) params.set('desde', desde);
    if (hasta) params.set('hasta', hasta);

    const r = await fetch('/admin/casa/exportar?' + params, {
      headers: { authorization: 'Bearer ' + S.token },
    });
    if (!r.ok) throw new Error('No se pudo generar el archivo.');

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${params.get('que')}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    cerrarModal();
  }, 'Archivo descargado', 'Generando');
}
