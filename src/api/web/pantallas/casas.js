'use strict';

/**
 * Casas abiertas.
 *
 * Alguien puso dinero por adelantado y ofrece varias opciones. Tú
 * eliges una y apuestas contra ella.
 *
 * La diferencia con una sala: aquí no esperas a que llegue alguien del
 * otro lado. El dinero ya está puesto — apuestas y listo.
 */
PANTALLAS.casas = async () => {
  const r = await api('/casas');
  const casas = r.casas ?? [];

  // Abrir una casa y apostar contra una son cosas distintas. Al
  // arrancar solo la plataforma opera casas, así que mostrar el botón
  // a quien no puede usarlo es prometer algo que va a fallar.
  const llamada = !S.modulos?.casaPuedeCrear ? '' : `
    <button class="llamada" onclick="elegirPartidoCasa()">
      <div class="punto gano">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>
      </div>
      <div class="llamada-texto">
        <strong>Abrir mi propia casa</strong>
        <small>Pones un presupuesto y los demás apuestan contra él.
        Lo que nadie tome vuelve entero.</small>
      </div>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--tenue)"
        stroke-width="2" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
    </button>`;

  if (casas.length === 0) {
    return pintar(armazon(`
      <h1 class="titulo">Casas abiertas</h1>
      <p class="sub">Alguien pone el dinero y tú eliges contra qué apostar.</p>
      ${llamada}
      <div class="vacio">
        <h3>No hay casas abiertas</h3>
        <p>${S.modulos?.casaPuedeCrear
          ? 'Cuando alguien abra una, aparece aquí.'
          : 'Cuando la plataforma abra una, aparece aquí y podrás apostar contra ella.'}</p>
        <button class="btn btn-plano" onclick="ir('muro')">Ver salas</button>
      </div>`));
  }

  pintar(armazon(`
    <h1 class="titulo">Casas abiertas</h1>
    <p class="sub">Alguien pone el dinero y tú eliges contra qué apostar.
    No hay que esperar contraparte.</p>

    ${llamada}
    <div class="rejilla-salas">${casas.map(tarjetaCasa).join('')}</div>
  `));
};

// ---------------------------------------------------------------------
//  Crear una casa
// ---------------------------------------------------------------------

/**
 * Paso 1: el partido.
 *
 * Se reusa la lista de partidos disponibles, la misma que las salas:
 * si un partido no sirve para una sala, tampoco sirve para una casa.
 */
async function elegirPartidoCasa() {
  const r = await api('/partidos?limite=30');
  const partidos = r.partidos ?? [];
  S.datos.partidosCasa = partidos;

  if (partidos.length === 0) {
    return hoja('Abrir una casa', 'No hay partidos disponibles', `
      <p class="pista">Todavía no hay eventos cargados sobre los que apostar,
      o los que hay empiezan muy pronto.</p>
      <div class="hoja-pie">
        <button class="btn btn-plano btn-ancho" onclick="cerrarHoja()">Entendido</button>
      </div>`);
  }

  const porLiga = {};
  for (const p of partidos) (porLiga[p.liga] ||= []).push(p);

  hoja('Abrir una casa', 'Elige el partido', `
    ${Object.entries(porLiga).map(([liga, lista]) => `
      <div class="rotulo">${esc(liga)} <span>${lista.length}</span></div>
      ${lista.map(p => `
        <div class="sala" onclick="armarCasa('${p.id}')" role="button" tabindex="0"
             onkeydown="if(event.key==='Enter')armarCasa('${p.id}')">
          <div class="sala-cab">
            <div style="min-width:0;display:flex;align-items:center;gap:8px">
              ${escudosPartido(p)}
              <div style="min-width:0">
              <div class="partido">${esc(p.equipo_local)}
                <span style="color:var(--tenue);font-weight:500">vs</span>
                ${esc(p.equipo_visitante)}</div>
              </div>
            </div>
            <div class="cuando">${cuando(p.inicia_en)}</div>
          </div>

          <div id="ctxc-${p.id}"></div>

          <div class="sala-pie">
            <span>${p.mercados.length} tipo(s)</span>
            <span>${p.salas_abiertas > 0
              ? `${p.salas_abiertas} sala(s)` : 'Sé el primero'}</span>
          </div>
        </div>`).join('')}
    `).join('')}`);

  // Quien pone dinero por adelantado necesita el dato ANTES de elegir
  // sobre qué partido lo pone. Después ya es tarde.
  for (const p of partidos) {
    bloqueContexto(p.id, p.equipo_local, p.equipo_visitante, true)
      .then(html => {
        const caja = document.getElementById('ctxc-' + p.id);
        if (caja) caja.innerHTML = html;
      });
  }
}

/**
 * Paso 2: repartir el presupuesto.
 *
 * Cada opción lleva su propio monto, y ese monto es el tope de pérdida
 * en esa opción. La suma es lo que se retiene al publicar.
 */
function armarCasa(partidoId) {
  const p = S.datos.partidosCasa.find(x => x.id === partidoId);
  S.datos.nuevaCasa = { partido: p, opciones: [] };
  dibujarArmadoCasa();
}

function dibujarArmadoCasa() {
  const n = S.datos.nuevaCasa;
  const p = n.partido;
  const dec = S.pais?.decimales ?? 2;
  const total = n.opciones.reduce((t, o) => t + o.presupuestoCentavos, 0);
  const disponibles = p.mercados.filter(m => !n.opciones.some(o => o.tipo === m.tipo));
  const maxOpc = 8;
  const lleno = n.opciones.length >= maxOpc;
  const topePresupuesto = 300000;

  hoja('Arma tu casa', `${p.equipo_local} vs ${p.equipo_visitante}`, `

    ${n.opciones.length ? `
      <div class="rotulo" style="margin-top:4px">
        Lo que ofreces <span>${n.opciones.length} de ${maxOpc}</span>
      </div>
      ${n.opciones.map((o, i) => `
        <div class="elegido">
          <div class="elegido-texto">
            <strong>${esc(o.etiqueta)}</strong>
            <small>arriesgas ${plata(o.presupuestoCentavos)}</small>
          </div>
          <button class="quitar" onclick="quitarOpcionCasa(${i})" aria-label="Quitar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              stroke-width="1.8" stroke-linecap="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
          </button>
        </div>`).join('')}

      <div class="desglose" style="margin:10px 0 4px">
        <div class="desglose-fila">
          <span>Se retiene al publicar</span><b>${plata(total)}</b>
        </div>
        <div class="desglose-fila">
          <span>Tienes disponible</span><b>${plata(S.saldo.disponibleCentavos)}</b>
        </div>
      </div>
      ${total > S.saldo.disponibleCentavos
        ? avisoTope(`No te alcanza: necesitas ${plata(total)} y tienes ${plata(S.saldo.disponibleCentavos)}.`)
        : ''}
      ${total > topePresupuesto
        ? avisoTope(`El máximo por casa es ${plata(topePresupuesto)}.`)
        : ''}
      ${lleno ? avisoTope(`Llegaste al máximo de ${maxOpc} opciones por casa.`) : ''}
    ` : ''}

    <div class="rotulo">
      ${n.opciones.length ? 'Agregar otra' : 'Qué vas a ofrecer'}
      ${n.opciones.length < 2 ? '<span>mínimo 2</span>' : ''}
    </div>
    <div class="selector-lista" style="padding:0;max-height:none">
      ${disponibles.map(m => {
        const abierto = S.datos.configurandoCasa === m.tipo;
        return `
        <div>
          <button class="tipo ${abierto ? 'abierto' : ''}" ${lleno ? 'disabled' : ''}
            onclick="abrirTipoCasa('${m.tipo}')">
            <span class="tipo-marca">${abierto ? '−' : '+'}</span>
            <span class="tipo-texto">
              <strong>${esc(m.nombre)}</strong>
              <small>${m.necesitaLinea ? 'tú eliges el número'
                : m.necesitaEquipo ? 'local o visita' : 'sí o no'}</small>
            </span>
          </button>
          ${abierto ? panelOpcionCasa(m) : ''}
        </div>`;
      }).join('')
        || '<span class="pista">Ya agregaste todos los tipos disponibles.</span>'}
    </div>

    ${n.opciones.length >= 2 ? `
      <div class="hoja-pie">
        <button class="btn btn-favor btn-ancho" onclick="publicarCasa()">
          Abrir la casa con ${plata(total)}</button>
        <p class="pista" style="text-align:center;margin-top:8px">
          Ese dinero se retiene ahora. Lo que nadie tome vuelve entero.</p>
      </div>
    ` : `
      ${n.opciones.length === 1
        ? avisoTope('Necesitas al menos 2 opciones: con una sola no habría nada que elegir.')
        : '<p class="pista" style="margin-top:14px">Elige al menos 2 opciones para abrir la casa.</p>'}`}
  `);
}

function abrirTipoCasa(tipo) {
  S.datos.configurandoCasa = S.datos.configurandoCasa === tipo ? null : tipo;
  S.datos.lineaCasa = null;
  S.datos.equipoCasa = null;
  dibujarArmadoCasa();
}

/**
 * Panel de la opción, desplegado dentro de la lista.
 *
 * Aquí hay un campo más que en las salas: cuánto arriesga la casa en
 * esta opción. Ese número es su tope de pérdida y también el máximo
 * que pueden apostarle.
 */
function panelOpcionCasa(m) {
  const p = S.datos.nuevaCasa.partido;
  const dec = S.pais?.decimales ?? 2;
  const minimo = S.pais?.minimoApuesta ?? 500;

  const lineas = m.tipo === 'TOTAL_CORNERS' ? [6.5, 7.5, 8.5, 9.5, 10.5, 11.5]
    : m.tipo === 'TOTAL_TARJETAS' ? [1.5, 2.5, 3.5, 4.5, 5.5]
    : m.tipo === 'TOTAL_PUNTOS' ? [150.5, 160.5, 170.5, 180.5, 190.5]
    : [0.5, 1.5, 2.5, 3.5, 4.5, 5.5];

  const elegida = S.datos.lineaCasa ?? (m.tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5);
  const equipo = S.datos.equipoCasa ?? p.equipo_local;

  return `
  <div class="panel-tipo">
    ${m.necesitaLinea ? `
      <div class="mini-rotulo">A partir de cuántos</div>
      <div class="lineas">
        ${lineas.map(v => `
          <button class="linea ${v === elegida ? 'activa' : ''}"
            onclick="S.datos.lineaCasa=${v};dibujarArmadoCasa()">${v}</button>`).join('')}
      </div>` : ''}

    ${m.necesitaEquipo ? `
      <div class="mini-rotulo">Sobre qué equipo</div>
      <div class="lineas">
        ${[p.equipo_local, p.equipo_visitante].map(e => `
          <button class="linea ${e === equipo ? 'activa' : ''}"
            onclick="S.datos.equipoCasa='${esc(e)}';dibujarArmadoCasa()">${esc(e)}</button>`).join('')}
      </div>` : ''}

    <div class="mini-rotulo" style="margin-top:8px">Cuánto arriesgas aquí</div>
    <input id="oc_monto" inputmode="decimal"
      value="${(minimo / (10 ** dec)).toFixed(dec)}"
      style="padding:6px 10px;font-size:15px">
    <p class="pista">Es tu tope de pérdida y también lo máximo que pueden
    apostarte. Si nadie lo toma, vuelve entero.</p>

    <button class="btn btn-favor btn-chico btn-ancho" style="margin-top:6px"
      onclick="agregarOpcionCasa('${m.tipo}')">Agregar</button>
  </div>`;
}

function agregarOpcionCasa(tipo) {
  const n = S.datos.nuevaCasa;
  const def = n.partido.mercados.find(m => m.tipo === tipo);
  const monto = aUnidades(document.getElementById('oc_monto').value);
  const minimo = S.pais?.minimoApuesta ?? 500;

  if (monto < minimo) {
    return aviso(`Cada opción necesita al menos ${plata(minimo)}.`, 'mal');
  }

  const l = def.necesitaLinea
    ? (S.datos.lineaCasa ?? (tipo === 'TOTAL_CORNERS' ? 8.5 : 2.5)) : null;
  const e = def.necesitaEquipo ? (S.datos.equipoCasa ?? n.partido.equipo_local) : null;

  S.datos.configurandoCasa = null;
  S.datos.lineaCasa = null;
  S.datos.equipoCasa = null;

  // La etiqueta es la que verá el apostador. El servidor la vuelve a
  // generar al crear la casa: si difirieran, mostraría una cosa y
  // pagaría otra.
  const etiquetas = {
    TOTAL_GOLES:       `Más de ${l} goles`,
    TOTAL_CORNERS:     `Más de ${l} córners`,
    TOTAL_TARJETAS:    `Más de ${l} tarjetas`,
    TOTAL_PUNTOS:      `Más de ${l} puntos`,
    AMBOS_ANOTAN:      'Ambos anotan',
    DOBLE_OPORTUNIDAD: `Gana ${e}`,
    GANADOR_DIRECTO:   `Gana ${e}`,
  };

  n.opciones.push({
    tipo, linea: l, equipo: e,
    etiqueta: etiquetas[tipo] ?? def.nombre,
    presupuestoCentavos: monto,
  });
  dibujarArmadoCasa();
}

function quitarOpcionCasa(i) {
  S.datos.nuevaCasa.opciones.splice(i, 1);
  dibujarArmadoCasa();
}

async function publicarCasa() {
  const n = S.datos.nuevaCasa;
  const total = n.opciones.reduce((t, o) => t + o.presupuestoCentavos, 0);

  if (total > S.saldo.disponibleCentavos) {
    return aviso('No te alcanza para ese presupuesto.', 'mal');
  }

  await accion(async () => {
    const r = await api('/casas', {
      method: 'POST',
      body: JSON.stringify({
        partidoId: n.partido.id,
        opciones: n.opciones.map(o => ({
          tipoMercado: o.tipo,
          ...(o.linea !== null ? { linea: o.linea } : {}),
          ...(o.equipo ? { equipo: o.equipo } : {}),
          etiqueta: o.etiqueta,
          presupuestoCentavos: o.presupuestoCentavos,
        })),
      }),
    });
    await refrescarSaldo();
    cerrarHoja();
    aviso(`Casa ${r.codigo} publicada`, 'bien');
    ir('casa', r.id);
  }, null, 'Publicando');
}

function tarjetaCasa(c) {
  return `
  <div class="sala ${c.es_oficial ? 'destacada' : ''}"
       onclick="ir('casa','${c.id}')" role="button" tabindex="0"
       onkeydown="if(event.key==='Enter')ir('casa','${c.id}')">

    ${c.es_oficial ? `
      <div class="marca-destacada">Casa de la plataforma</div>` : ''}

    <div class="sala-cab">
      <div style="min-width:0;display:flex;align-items:center;gap:8px">
        ${escudosPartido(c)}
        <div style="min-width:0">
          <div class="partido">${esc(c.equipo_local)} vs ${esc(c.equipo_visitante)}</div>
          <div class="liga">${esc(c.liga)} · casa de ${esc(c.operador)}</div>
        </div>
      </div>
      <div class="cuando">${cuando(c.inicia_en)}</div>
    </div>

    <div class="mercado-nombre">
      ${c.total_opciones} opción(es) para elegir
    </div>

    <div class="balance">
      <div class="balance-cifras">
        <div class="lado favor">
          <div class="lado-etiqueta">Puesto por la casa</div>
          <div class="lado-monto">${plata(c.presupuesto_centavos)}</div>
        </div>
        <div class="lado contra der">
          <div class="lado-etiqueta">Todavía disponible</div>
          <div class="lado-monto">${plata(c.disponible_centavos)}</div>
        </div>
      </div>
      <div class="barra">
        <i class="b-favor" style="width:${Math.round(
          (1 - c.disponible_centavos / Math.max(c.presupuesto_centavos, 1)) * 100)}%"></i>
        <i class="b-hueco" style="width:${Math.round(
          c.disponible_centavos / Math.max(c.presupuesto_centavos, 1) * 100)}%"></i>
      </div>
    </div>
  </div>`;
}

// ---------------------------------------------------------------------
//  Detalle
// ---------------------------------------------------------------------

PANTALLAS.casa = async (id) => {
  const r = await api('/casas/' + id);
  const c = r.casa;
  const abierta = c.estado === 'ABIERTA';

  S.datos.casaActual = r;
  const mias = new Set((r.misApuestas ?? []).map(a => a.opcion_id));

  pintar(armazon(`
    <button class="btn-plano btn-chico" onclick="ir('casas')" style="margin-bottom:16px">
      ← Volver</button>

    <h1 class="titulo" style="display:flex;align-items:center;gap:10px">
      ${escudosPartido(c)}
      <span>${esc(c.equipo_local)} vs ${esc(c.equipo_visitante)}</span>
    </h1>
    <p class="sub">${esc(c.liga ?? '')} · Empieza ${cuando(c.inicia_en)}</p>

    <div class="caja" style="display:flex;align-items:center;gap:11px;padding:13px 15px">
      <div class="punto ${c.es_casa_oficial ? 'gano' : 'creada'}"
        style="width:32px;height:32px;font-size:12px;font-weight:600;text-transform:uppercase">
        ${esc((c.operador ?? '??').slice(0, 2))}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:500">
          ${c.soy_operador ? 'Tu casa' :
            c.es_casa_oficial
              ? 'Casa de la plataforma'
              : `Casa de <strong>${esc(c.operador)}</strong>`}
        </div>
        <div style="font-size:12.5px;color:var(--tenue)">
          Puso ${plata(c.presupuesto_centavos)} ·
          código <span class="num">${esc(c.codigo)}</span>
        </div>
      </div>
    </div>

    ${c.es_casa_oficial ? `
      <p class="pista" style="margin:-4px 0 16px">
        Esta casa la opera la plataforma para que no falte contraparte al
        arrancar. <a href="/#transparencia">Puedes ver todo lo que ha hecho</a>,
        gane o pierda.</p>` : ''}

    ${!abierta ? estadoCasa(c) : ''}

    <div id="ctx-partido"></div>

    ${r.opciones.map(o => bloqueOpcion(o, abierta, mias.has(o.id), c)).join('')}

    <p class="pista">
      Solo se pierde lo que llegue a tener contraparte. Si apuestas más de lo
      que queda disponible, el resto no entra en juego.</p>
  `));

  bloqueContexto(c.partido_id, c.equipo_local, c.equipo_visitante)
    .then(html => {
      const caja = document.getElementById('ctx-partido');
      if (caja) caja.innerHTML = html;
    });
};

function estadoCasa(c) {
  const textos = {
    CERRADA:   ['et-gris',   'Cerrada', 'Esperando el resultado del partido.'],
    LIQUIDADA: ['et-favor',  'Resuelta', 'Ya se pagó.'],
    ANULADA:   ['et-gris',   'Anulada', `Se devolvió todo, sin comisión. ${c.motivo_anulacion ?? ''}`],
  };
  const [clase, titulo, nota] = textos[c.estado] ?? ['et-gris', c.estado, ''];
  return `<div class="caja">
    <span class="etiqueta ${clase}">${esc(titulo)}</span>
    <p class="pista" style="margin-top:8px">${esc(nota)}</p>
  </div>`;
}

function bloqueOpcion(o, abierta, yaEstoy, casa) {
  const disponible = Number(o.disponible_centavos);
  const tomado = Number(o.tomado_centavos);
  const presupuesto = Number(o.presupuesto_centavos);
  const lleno = disponible <= 0;

  const gente = (S.datos.casaActual?.apuestas ?? [])
    .filter(a => a.opcion_id === o.id);

  return `
  <div class="caja">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
      <div style="min-width:0">
        <div style="font-size:15.5px;font-weight:600;letter-spacing:-.01em">
          ${esc(o.etiqueta)}</div>
        <div style="font-size:12.5px;color:var(--tenue);margin-top:2px">
          ${o.apostadores} apostador(es)
        </div>
      </div>
      ${o.ocurrio === true
        ? '<span class="etiqueta et-favor">Ocurrió</span>'
        : o.ocurrio === false
          ? '<span class="etiqueta et-gris">No ocurrió</span>'
          : lleno ? '<span class="etiqueta et-gris">Completa</span>' : ''}
    </div>

    <div class="balance">
      <div class="balance-cifras">
        <div class="lado favor">
          <div class="lado-etiqueta">Tomado</div>
          <div class="lado-monto">${plata(tomado)}</div>
        </div>
        <div class="lado contra der">
          <div class="lado-etiqueta">Queda</div>
          <div class="lado-monto">${plata(disponible)}</div>
        </div>
      </div>
      <div class="barra">
        <i class="b-favor" style="width:${Math.round(tomado / Math.max(presupuesto,1) * 100)}%"></i>
        <i class="b-hueco" style="width:${Math.round(disponible / Math.max(presupuesto,1) * 100)}%"></i>
      </div>
    </div>

    ${gente.length ? `
      <div style="padding-top:10px;border-top:1px solid var(--linea);font-size:12.5px">
        ${gente.map(a => `<span class="etiqueta ${a.soy_yo ? 'et-favor' : 'et-gris'}"
          style="margin:0 4px 4px 0">${esc(a.alias)} ${plata(a.monto_centavos)}</span>`).join('')}
      </div>` : ''}

    ${abierta && !yaEstoy && !lleno && !casa.soy_operador ? `
      <button class="btn btn-favor btn-ancho" style="margin-top:12px"
        onclick="abrirApuestaCasa('${o.id}','${esc(o.etiqueta)}',${disponible})">
        Apostar a que sí
      </button>` : ''}

    ${yaEstoy ? `
      <p class="pista" style="margin-top:10px;color:var(--favor)">
        Ya apostaste a esta opción.</p>` : ''}

    ${casa.soy_operador ? `
      <p class="pista" style="margin-top:10px">
        Es tu casa: no puedes apostar contra ti mismo.</p>` : ''}
  </div>`;
}

// ---------------------------------------------------------------------
//  Apostar
// ---------------------------------------------------------------------

function abrirApuestaCasa(opcionId, etiqueta, disponible) {
  const minimo = S.pais?.minimoApuesta ?? 500;
  const inicial = Math.min(minimo, disponible);
  S.datos.apuestaCasa = { opcionId, monto: inicial, disponible };

  const atajos = [minimo, minimo * 2, minimo * 5]
    .filter((v, i, a) => a.indexOf(v) === i
      && v <= S.saldo.disponibleCentavos && v <= disponible);

  hoja(etiqueta, `Quedan ${plata(disponible)} · tienes ${plata(S.saldo.disponibleCentavos)}`, `
    <div class="monto-grande">
      <span>${esc(S.pais?.simbolo ?? 'S/')}</span>
      <input id="monto_casa" inputmode="decimal"
        value="${(inicial / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2)}"
        oninput="recalcularCasa()" onfocus="this.select()">
    </div>

    <div class="atajos">
      ${atajos.map(v => `<button class="atajo" onclick="fijarMontoCasa(${v})">${plata(v)}</button>`).join('')}
      ${disponible <= S.saldo.disponibleCentavos
        ? `<button class="atajo" onclick="fijarMontoCasa(${disponible})">Todo el cupo</button>`
        : ''}
    </div>

    <div id="desglose_casa"></div>

    <div class="hoja-pie">
      <button class="btn btn-favor btn-ancho" onclick="confirmarApuestaCasa()">
        Confirmar apuesta</button>
      <p class="pista" style="text-align:center;margin-top:8px">
        Si aciertas te llevas el doble menos la comisión.</p>
    </div>`);

  recalcularCasa();
}

function fijarMontoCasa(unidades) {
  document.getElementById('monto_casa').value =
    (unidades / (10 ** (S.pais?.decimales ?? 2))).toFixed(S.pais?.decimales ?? 2);
  recalcularCasa();
}

/**
 * El desglose se muestra ANTES de confirmar, con la comisión a la
 * vista y avisando cuánto entra realmente en juego.
 */
function recalcularCasa() {
  const monto = aUnidades(document.getElementById('monto_casa').value);
  const { disponible } = S.datos.apuestaCasa;
  S.datos.apuestaCasa.monto = monto;

  const tasa = Number(S.usuario?.tasa_comision ?? 0.07);
  const cubierto = Math.min(monto, disponible);
  const sobrante = monto - cubierto;
  const comision = Math.floor(cubierto * tasa);
  const siGana = monto + cubierto - comision;

  const alcanza = monto > 0 && cubierto <= S.saldo.disponibleCentavos;

  document.getElementById('desglose_casa').innerHTML = `
    <div class="desglose">
      <div class="desglose-fila gana">
        <span>Si ocurre, te llevas</span><b>${plata(siGana)}</b>
      </div>
      <div class="desglose-fila">
        <span>Comisión (${(tasa * 100).toFixed(1)}%)</span><b>−${plata(comision)}</b>
      </div>
      <div class="desglose-fila pierde">
        <span>Si no ocurre</span><b>−${plata(cubierto)}</b>
      </div>
    </div>

    ${sobrante > 0 ? `
      <p class="pista" style="color:var(--aviso);margin-top:10px">
        Solo entran ${plata(cubierto)}: es lo que queda del cupo.
        Los otros ${plata(sobrante)} no se van a aceptar.</p>` : ''}

    ${!alcanza && monto > 0 ? `
      <p class="pista" style="color:var(--mal);text-align:center;margin-top:10px">
        No te alcanza. Tienes ${plata(S.saldo.disponibleCentavos)}.</p>` : ''}`;
}

async function confirmarApuestaCasa() {
  const { opcionId, monto, disponible } = S.datos.apuestaCasa;
  const cubierto = Math.min(monto, disponible);

  if (monto <= 0) return aviso('Escribe cuánto quieres apostar.', 'mal');
  if (cubierto > S.saldo.disponibleCentavos) {
    return aviso('No te alcanza. Recarga o baja el monto.', 'mal');
  }

  await accion(async () => {
    const r = await api(`/casas/opciones/${opcionId}/apostar`, {
      method: 'POST',
      headers: { 'Idempotency-Key': claveUnica('casa') },
      body: JSON.stringify({ montoCentavos: monto }),
    });
    await refrescarSaldo();
    cerrarHoja();
    if (r.sobranteCentavos > 0) {
      aviso(`Entraron ${plata(r.cubiertoCentavos)}: era lo que quedaba del cupo.`);
    }
    ir('casa', S.datos.parametro);
  }, 'Apuesta confirmada', 'Confirmando');
}
