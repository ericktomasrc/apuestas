'use strict';

/**
 * Detalle de sala.
 *
 * El trabajo de esta pantalla es una sola cosa: elegir un lado y poner
 * un monto. Todo lo demás —quién es el anfitrión, cuántos hay— es
 * contexto que ayuda a decidir, no protagonista.
 */
PANTALLAS.sala = async (id) => {
  const r = await api('/salas/' + id);
  const s = r.sala;
  const mercados = r.mercados ?? [];

  const miPosicion = {};
  for (const m of (r.misPosiciones ?? [])) miPosicion[m.mercado_id] = m;
  S.datos.posiciones = r.posiciones ?? [];
  S.datos.minimoSala = s.monto_minimo_centavos;

  const abierta = s.estado === 'ABIERTA' || s.estado === 'CUENTA_REGRESIVA';

  pintar(armazon(`
    <button class="btn-plano btn-chico" onclick="ir('muro')" style="margin-bottom:16px">
      ← Volver</button>

    <h1 class="titulo">${esc(s.equipo_local)} vs ${esc(s.equipo_visitante)}</h1>
    <p class="sub">
      ${esc(s.liga ?? '')} · Empieza ${cuando(s.inicia_en)}
    </p>

    <div class="caja" style="display:flex;align-items:center;gap:11px;padding:13px 15px">
      <div class="punto creada" style="width:32px;height:32px;font-size:12px;
        font-weight:600;text-transform:uppercase">
        ${esc((s.anfitrion ?? '??').slice(0, 2))}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500">
          ${s.soy_anfitrion
            ? 'Tu sala'
            : `Sala de <strong>${esc(s.anfitrion ?? 'alguien')}</strong>`}
        </div>
        <div style="font-size:12.5px;color:var(--tenue)">
          ${s.participantes ?? 0} de ${s.tope_participantes} ·
          desde ${plata(s.monto_minimo_centavos)} ·
          código <span class="num">${esc(s.codigo)}</span>
        </div>
      </div>
    </div>

    ${s.soy_anfitrion && Object.keys(miPosicion).length === 0 && abierta ? `
      <p class="pista" style="margin:-4px 0 16px">
        Crear la sala no te obliga a apostar. Puedes entrar a un lado como
        cualquiera, o dejarla correr sin ti.</p>` : ''}

    ${estadoSala(s)}

    ${mercados.map(m => bloqueMercado(m, s, abierta, miPosicion[m.mercado_id])).join('')}

    ${abierta ? `
      <button class="btn btn-plano btn-ancho" style="margin-top:8px"
        onclick="compartir('${s.codigo}')">
        Invitar por WhatsApp
      </button>` : ''}

    ${Object.keys(miPosicion).length > 0 && abierta ? `
      <button class="btn-plano btn-chico btn-ancho" style="margin-top:10px"
        onclick="salirDeSala('${s.id}')">
        Salir de esta sala
      </button>
      <p class="pista" style="text-align:center">
        Sin ningún costo. Solo hasta que empiece el partido.</p>` : ''}
  `));
};

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

function bloqueMercado(m, sala, abierta, mia) {
  const falta = loQueFalta(m);
  const puedeEntrar = abierta && !mia;

  // Quién está en cada lado. Ver los nombres es parte de la gracia:
  // se juega contra gente, no contra un sistema.
  const enFavor = (S.datos.posiciones ?? [])
    .filter(p => p.mercado_id === m.mercado_id && p.lado === 'A_FAVOR');
  const enContra = (S.datos.posiciones ?? [])
    .filter(p => p.mercado_id === m.mercado_id && p.lado === 'EN_CONTRA');

  const gente = lista => lista.length
    ? lista.map(p => `<span class="etiqueta ${p.soy_yo ? 'et-favor' : 'et-gris'}"
        style="margin:0 4px 4px 0">${esc(p.alias)} ${plata(p.monto_centavos)}</span>`).join('')
    : '<span style="color:var(--linea-fuerte);font-size:12.5px">Nadie todavía</span>';

  return `
  <div class="caja">
    ${barraBalance(m)}

    ${(enFavor.length || enContra.length) ? `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;
        padding-top:12px;border-top:1px solid var(--linea);font-size:12.5px">
        <div>${gente(enFavor)}</div>
        <div style="text-align:right">${gente(enContra)}</div>
      </div>` : ''}

    ${mia ? `
      <div class="desglose" style="margin-top:4px">
        <div class="desglose-fila">
          <span>Estás ${mia.lado === 'A_FAVOR'
            ? esc(m.etiqueta_favor) : esc(m.etiqueta_contra)}</span>
          <b>${plata(mia.monto_centavos)}</b>
        </div>
      </div>` : ''}

    ${puedeEntrar ? `
      <div class="dos-lados">
        <button class="opcion favor" onclick="abrirApuesta('${m.mercado_id}','A_FAVOR')">
          <div class="opcion-texto">${esc(m.etiqueta_favor)}</div>
          <div class="opcion-nota">Ganas 2x lo que pongas</div>
        </button>
        <button class="opcion contra" onclick="abrirApuesta('${m.mercado_id}','EN_CONTRA')">
          <div class="opcion-texto">${esc(m.etiqueta_contra)}</div>
          <div class="opcion-nota">Ganas 2x lo que pongas</div>
        </button>
      </div>

      ${falta ? `
        <button class="btn btn-plano btn-chico btn-ancho" style="margin-top:9px"
          onclick="abrirApuesta('${m.mercado_id}','${falta.lado}',${falta.monto})">
          Completar con ${plata(falta.monto)}
        </button>
        <p class="pista" style="text-align:center">
          Es justo lo que falta para que la sala corra.</p>` : ''}
    ` : ''}

    ${m.lado_ganador ? `
      <div class="desglose" style="margin-top:12px">
        <div class="desglose-fila gana">
          <span>Ganó</span>
          <b>${esc(m.lado_ganador === 'A_FAVOR'
            ? m.etiqueta_favor : m.etiqueta_contra)}</b>
        </div>
      </div>` : ''}
  </div>`;
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
function abrirApuesta(mercadoId, lado, sugerido) {
  const minimo = S.datos.minimoSala ?? (S.pais?.minimoApuesta ?? 500);
  const inicial = sugerido ?? minimo;

  S.datos.apuesta = { mercadoId, lado, monto: inicial };

  const atajos = [minimo, minimo * 2, minimo * 5, minimo * 10]
    .filter((v, i, a) => a.indexOf(v) === i && v <= S.saldo.disponibleCentavos);

  hoja(
    lado === 'A_FAVOR' ? 'Apuestas a que sí' : 'Apuestas a que no',
    `Tienes ${plata(S.saldo.disponibleCentavos)} disponibles`,
    `
    <div class="monto-grande">
      <span>${esc(S.pais?.simbolo ?? 'S/')}</span>
      <input id="monto" inputmode="decimal" value="${(inicial / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2)}"
        oninput="recalcular()" onfocus="this.select()">
    </div>

    <div class="atajos">
      ${atajos.map(v => `<button class="atajo" onclick="fijarMonto(${v})">${plata(v)}</button>`).join('')}
      ${S.saldo.disponibleCentavos > 0
        ? `<button class="atajo" onclick="fijarMonto(${S.saldo.disponibleCentavos})">Todo</button>` : ''}
    </div>

    <div id="desglose"></div>

    <button class="btn ${lado === 'A_FAVOR' ? 'btn-favor' : 'btn-contra'} btn-ancho"
      style="margin-top:16px" onclick="confirmarApuesta()">
      Confirmar apuesta
    </button>
    <p class="pista" style="text-align:center">
      Puedes salirte sin costo hasta que empiece el partido.</p>
    `);

  recalcular();
}

function fijarMonto(unidades) {
  document.getElementById('monto').value =
    (unidades / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2);
  recalcular();
}

function recalcular() {
  const monto = aUnidades(document.getElementById('monto').value);
  S.datos.apuesta.monto = monto;

  const tasa = Number(S.usuario?.tasa_comision ?? 0.07);
  const comision = Math.floor(monto * tasa);
  const siGana = monto * 2 - comision;

  const alcanza = monto > 0 && monto <= S.saldo.disponibleCentavos;

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
    ${!alcanza && monto > 0
      ? avisoTope(`No te alcanza: tienes ${plata(S.saldo.disponibleCentavos)}.`)
      : ''}
    ${monto > 0 && monto < (S.datos.minimoSala ?? 0)
      ? avisoTope(`Esta sala pide al menos ${plata(S.datos.minimoSala)}.`)
      : ''}
    ${monto > (S.pais?.maximoApuesta ?? Infinity)
      ? avisoTope(`El máximo por apuesta es ${plata(S.pais.maximoApuesta)}.`)
      : ''}`;
}

async function confirmarApuesta() {
  const { mercadoId, lado, monto } = S.datos.apuesta;

  if (monto <= 0) return aviso('Escribe cuánto quieres apostar.', 'mal');
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
  const texto = `Armé una sala de apuestas (${codigo}). Entra al lado que quieras: ${url}`;

  if (navigator.share) {
    navigator.share({ text: texto }).catch(() => {});
  } else {
    navigator.clipboard.writeText(texto);
    aviso('Enlace copiado', 'bien');
  }
}
