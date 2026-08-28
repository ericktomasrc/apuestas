/* ---------- Deportes ---------- */

/**
 * Sin ligas cargadas no hay partidos, y sin partidos no hay salas.
 * Esta es la pantalla que pone en marcha todo lo demás.
 */
VISTAS.deportes = async () => {
  // Los filtros viven en S para sobrevivir al redibujado: cambiar un
  // mercado no debe devolverte a la página 1 de mil ligas.
  S.f = S.f ?? {};
  S.f.liga = S.f.liga ?? {
    pais: '', deporte: '', buscar: '', soloActivas: false, desde: 0,
  };
  const f = S.f.liga;
  const q = new URLSearchParams({ limite: '25', desde: String(f.desde) });
  if (f.pais) q.set('pais', f.pais);
  if (f.deporte) q.set('deporte', f.deporte);
  if (f.buscar) q.set('buscar', f.buscar);
  if (f.soloActivas) q.set('soloActivas', 'true');

  const r = await api('/deportes?' + q);
  S.datos.catalogo = r;

  const sinMercados = r.ligas.filter(l => l.mercados.length === 0).length;

  const prov = await api('/deportes/estado-proveedor').catch(() => null);

  render(cab('Deportes', 'Qué ligas están cargadas y qué se puede apostar en cada una',
    puede('deportes.gestionar')
      ? `<button class="btn-plano" onclick="sincronizarAhora()">Traer partidos</button>
         ${r.total > 50
           // Con el catálogo del proveedor importado, agregar una liga
           // a mano casi siempre es un error: el identificador tiene
           // que coincidir con el suyo o no llegan partidos. Se deja
           // accesible pero sin destacar.
           ? `<button class="btn-plano" onclick="nuevaLiga()">Agregar a mano</button>`
           : `<button class="btn" onclick="nuevaLiga()">Agregar liga</button>`}`
      : '') + `

    ${prov ? bloqueProveedor(prov) : ''}

    <!-- Fichas, no tarjetas.
         Con dos deportes las tarjetas grandes ya ocupaban media
         pantalla; con seis serían inusables. Aquí lo que importa es
         cuántas ligas hay en cada uno, no destacar el número. -->
    <div class="fichas-dato">
      ${r.deportes.map(d => `
        <span class="ficha-dato">
          ${esc(d.nombre)}
          <b>${d.ligas}</b>
          <small>${d.activas > 0 ? `${d.activas} activa(s)` : 'sin activar'}</small>
        </span>`).join('')}
    </div>

    ${sinMercados > 0 ? `<div class="banda">
      <p><strong>${sinMercados} liga(s) sin mercados habilitados</strong>
      Sus partidos aparecen, pero no se puede apostar sobre ellos.</p>
    </div>` : ''}

    <h2>Ligas <span style="font-weight:400;color:var(--tenue);font-size:14px">
      ${r.activas} activa(s) de ${r.total}</span></h2>

    ${barraDeportes(r.deportes, f.deporte)}

    <div class="marco" style="padding:12px 14px;margin-bottom:12px;display:flex;
      gap:9px;flex-wrap:wrap;align-items:flex-end;overflow:visible">
      <div class="campo" style="margin:0;flex:1;min-width:180px">
        <label for="f_buscar">Buscar</label>
        <input id="f_buscar" value="${esc(f.buscar)}"
          placeholder="liga o país — «Peru», «Libertadores», «PE»"
          onchange="S.f.liga.buscar=this.value;S.f.liga.desde=0;VISTAS.deportes()">
      </div>
      <!-- Campo con lista, no desplegable.
           Con 90 países, desplegar la lista entera obliga a
           desplazarse buscando el que se quiere. Escribiendo tres
           letras aparece. -->
      <div class="campo buscador-pais" style="margin:0;min-width:190px">
        <label for="f_pais">País</label>
        <input id="f_pais" autocomplete="off" role="combobox"
          placeholder="todos — escribe o elige"
          value="${f.pais ? esc(nombrePais(f.pais)) : ''}"
          oninput="filtrarPaises(this.value)"
          onfocus="filtrarPaises('')"
          onclick="filtrarPaises('')"
          onkeydown="teclaPais(event)">
        <button class="flecha-pais" onclick="alternarPaises(event)"
          aria-label="Ver todos los países">▾</button>
        ${f.pais ? `
          <button class="limpia-pais" onclick="elegirPais('')"
            aria-label="Quitar filtro">×</button>` : ''}
        <div class="lista-paises" id="lista-paises"></div>
      </div>
      <div class="permiso" style="margin:0 0 6px">
        <input type="checkbox" id="f_activas" ${f.soloActivas ? 'checked' : ''}
          onchange="S.f.liga.soloActivas=this.checked;S.f.liga.desde=0;VISTAS.deportes()">
        <label for="f_activas" style="margin:0">Solo con mercados</label>
      </div>
      ${(f.buscar || f.pais || f.soloActivas) ? `
        <button class="btn-plano btn-chico" onclick="limpiarFiltroLigas()">Limpiar</button>` : ''}
    </div>

    ${r.ligas.length ? `<div class="marco"><table>
      <thead><tr><th>Liga</th><th>Deporte</th><th>Se puede apostar a</th>
        <th class="der">Partidos</th><th></th></tr></thead>
      <tbody>${r.ligas.map(l => `<tr>
        <td><strong>${esc(l.nombre)}</strong>
          ${l.pais ? `<span class="etiqueta et-gris">${esc(l.pais)}</span>` : ''}
          <br><span class="num" style="color:var(--tenue);font-size:11.5px">${esc(l.api_id)}</span></td>
        <td>${esc(l.deporte)}</td>
        <td>${l.mercados.length
          ? l.mercados.map(m => `<span class="etiqueta ${m.verificadoEn ? 'et-bien' : 'et-aviso'}"
              title="${m.verificadoEn ? 'Verificado con un partido real' : 'Sin verificar: puede anularse por falta de dato'}"
              style="margin:1px">${esc(nombreMercado(m.tipo))}</span>`).join(' ')
          : '<span style="color:var(--tenue);font-size:12.5px">Nada todavía</span>'}</td>
        <td class="der num">${l.partidos}</td>
        <td class="der"><div class="fila-acciones">
          ${puede('deportes.gestionar')
            ? `<button class="btn-plano btn-chico"
                 onclick='editarMercados(${JSON.stringify({
                   id: l.id, nombre: l.nombre, deporte: l.deporte,
                   mercados: l.mercados,
                 }).replace(/'/g, "&#39;")})'>Mercados</button>
               ${l.partidos === 0
                 ? `<button class="btn-plano btn-chico" onclick="borrarLiga('${l.id}','${esc(l.nombre)}')">Quitar</button>`
                 : `<span class="pista-boton" title="Espera a que se resuelvan sus partidos">En juego</span>`}`
            : ''}
          <button class="btn-plano btn-chico" onclick="verPartidos('${l.id}','${esc(l.nombre)}')">Partidos</button>
        </div></td>
      </tr>`).join('')}</tbody></table></div>

      ${paginador(r)}`
      : vacio('Todavía no hay ligas. Sin ellas no llegan partidos y no se pueden crear salas.',
          puede('deportes.gestionar')
            ? '<button class="btn" onclick="nuevaLiga()">Agregar la primera</button>' : '')}

    <p class="pista">Un mercado <strong>verificado</strong> es uno que ya se
    comprobó con un partido real: el proveedor entregó el dato. Habilitar sin
    verificar produce anulaciones por falta de dato, y cada anulación es
    comisión que se pierde.</p>
  `);
};

function nombreMercado(clave) {
  for (const lista of Object.values(S.datos.catalogo?.mercadosDisponibles ?? {})) {
    const m = lista.find(x => x.clave === clave);
    if (m) return m.nombre;
  }
  return clave;
}

function nuevaLiga() {
  const deportes = S.datos.catalogo?.deportes ?? [];
  // Solo los deportes que el sistema sabe liquidar. Uno sin reglas de
  // resolución dejaría sus salas sin poder cerrarse.
  // Todos los deportes que el sistema sabe liquidar. Los que no tienen
  // ligas se muestran igual: esconderlos haría pensar que no existen.

  modal('Agregar liga', `
    <p class="pista" style="margin-bottom:14px">
      Normalmente no hace falta: el catálogo del proveedor ya trae más
      de mil ligas con su identificador correcto. Usa esto solo si la
      que buscas no está.</p>

    <div class="campo"><label for="lg_deporte">Deporte</label>
      <select id="lg_deporte">${deportes.map(d =>
        `<option value="${d.id}">${esc(d.nombre)}${
          d.ligas === 0 ? ' · sin ligas todavía' : ` · ${d.ligas} liga(s)`
        }</option>`).join('')}</select>
      <p class="pista">Solo aparecen los deportes que el sistema sabe
      liquidar. Agregar otro requiere escribir sus reglas de resolución.</p></div>
    <div class="campo"><label for="lg_nombre">Nombre</label>
      <input id="lg_nombre" placeholder="Liga 1 Perú"></div>
    <div class="campo"><label for="lg_api">Identificador del proveedor</label>
      <input id="lg_api" class="num" inputmode="numeric" placeholder="281"
        oninput="this.value=this.value.replace(/\D/g,'')">
      <p class="pista">Tiene que ser el número que usa el proveedor para esta
      liga. Con cualquier otra cosa no llegan partidos, y además rompe la
      sincronización de las demás.</p></div>
    <div class="campo"><label for="lg_pais">País</label>
      <input id="lg_pais" class="num" maxlength="2" placeholder="PE"
        oninput="this.value=this.value.toUpperCase().replace(/[^A-Z]/g,'')">
      <p class="pista">Opcional. Es el país de la liga, no el de los apostadores:
      un peruano puede apostar sobre un partido brasileño.</p></div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarLiga()">Agregar</button>`);
}

async function guardarLiga() {
  const nombre = document.getElementById('lg_nombre').value.trim();
  const apiId = document.getElementById('lg_api').value.trim();
  if (nombre.length < 2) return aviso('Escribe el nombre de la liga.', 'mal');
  if (!apiId) return aviso('Falta el identificador del proveedor.', 'mal');

  await accion(async () => {
    await api('/ligas', { method:'POST', body: JSON.stringify({
      deporteId: document.getElementById('lg_deporte').value,
      nombre, apiId,
      pais: document.getElementById('lg_pais').value || undefined,
    })});
    cerrarModal();
    VISTAS.deportes();
  }, 'Liga agregada', 'Agregando');
}

function editarMercados(liga) {
  const disponibles = S.datos.catalogo?.mercadosDisponibles?.[liga.deporte] ?? [];
  const activos = new Set(liga.mercados.map(m => m.tipo));

  modal(`Mercados de ${liga.nombre}`, `
    <p class="pista" style="margin-bottom:16px">
      Solo aparecen los que el sistema sabe liquidar. Cada uno tiene su regla:
      la API entrega números y el mercado es la comparación que hacemos.</p>

    ${disponibles.map(m => `<div class="permiso">
      <input type="checkbox" id="mk_${m.clave}" value="${m.clave}"
        ${activos.has(m.clave) ? 'checked' : ''}>
      <label for="mk_${m.clave}">${esc(m.nombre)}
        <small>${m.usaLinea
          ? 'El anfitrión elige la línea, siempre en .5 para que no haya empate'
          : 'Sin línea: dos lados fijos'} · <span class="num">${esc(m.clave)}</span></small></label>
    </div>`).join('')}

    <div class="permiso" style="margin-top:14px;border-top:1px solid var(--linea);padding-top:14px">
      <input type="checkbox" id="mk_verificado">
      <label for="mk_verificado">Ya lo comprobé con un partido real
        <small>El proveedor entregó estos datos. Sin marcar, quedan como
        pendientes de verificar.</small></label>
    </div>`,
    `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button>
     <button class="btn" onclick="guardarMercados('${liga.id}')">Guardar</button>`);
}

async function guardarMercados(ligaId) {
  const mercados = [...document.querySelectorAll('[id^=mk_]:checked')]
    .filter(i => i.id !== 'mk_verificado').map(i => i.value);

  await accion(async () => {
    await api('/ligas/' + ligaId + '/mercados', { method:'PUT', body: JSON.stringify({
      mercados,
      verificado: document.getElementById('mk_verificado').checked,
    })});
    cerrarModal();
    VISTAS.deportes();
  }, mercados.length ? 'Mercados actualizados' : 'Liga sin mercados', 'Guardando');
}

function borrarLiga(id, nombre) {
  confirmar({
    titulo: 'Quitar liga',
    mensaje: `Se va a quitar «${nombre}».`,
    consecuencia: 'Sus partidos dejan de llegar. Los ya jugados y sus salas no se tocan.',
    textoBoton: 'Quitar',
    peligroso: true,
    alAceptar: async () => {
      await accion(async () => {
        await api('/ligas/' + id, { method:'DELETE' });
        cerrarModal();
        VISTAS.deportes();
      }, 'Liga quitada', 'Quitando');
    },
  });
}

async function verPartidos(ligaId, nombre) {
  const r = await api('/partidos?limite=30&ligaId=' + ligaId);

  const clase = {
    PROGRAMADO:'et-gris', EN_JUEGO:'et-aviso', FINALIZADO:'et-bien',
    SUSPENDIDO:'et-mal', POSTERGADO:'et-aviso', CANCELADO:'et-mal',
  };

  S.datos.ligaActual = { id: ligaId, nombre };

  const sinProveedor = r.partidos.filter(p => String(p.api_id ?? '').startsWith('manual:'));

  modal(`Partidos de ${nombre}`, `
    <button class="btn btn-chico" style="margin-bottom:14px"
      onclick="nuevoPartido('${ligaId}','${esc(nombre)}')">Cargar un partido</button>

    ${sinProveedor.length ? `
      <div class="banda" style="margin-bottom:14px">
        <p><strong>${sinProveedor.length} partido(s) sin identificador del proveedor</strong>
        No van a recibir resultado solos. Hay que resolverlos a mano o sus
        salas se anularán a las 72 horas.</p>
      </div>` : ''}
  ` + (r.partidos.length ? `
    <div class="marco"><table>
      <thead><tr><th>Partido</th><th>Cuándo</th><th>Estado</th>
        <th class="der">Salas</th><th></th></tr></thead>
      <tbody>${r.partidos.map(p => `<tr>
        <td>${esc(p.equipo_local)} vs ${esc(p.equipo_visitante)}
          ${p.goles_local !== null
            ? `<br><span class="num" style="font-size:12px;color:var(--tenue)">${p.goles_local} - ${p.goles_visitante}</span>`
            : ''}</td>
        <td class="num" style="font-size:12px">${fecha(p.inicia_en)}</td>
        <td><span class="etiqueta ${clase[p.estado] || 'et-gris'}">${esc(p.estado)}</span></td>
        <td class="der num">${p.salas}</td>
        <td class="der">${p.salas === 0
          ? `<button class="btn-plano btn-chico"
               onclick="borrarPartido('${p.id}','${ligaId}','${esc(nombre)}')">Quitar</button>`
          : '<span class="pista-boton" title="Anula sus salas primero">En uso</span>'}</td>
      </tr>`).join('')}</tbody></table></div>

      ${paginador(r)}`
    : `<p class="pista">Todavía no hay partidos en esta liga. Sin ellos nadie
       puede crear una sala.<br><br>
       Cuando el proveedor de datos esté conectado llegan solos, una vez al
       día. Mientras tanto se cargan a mano.</p>`),
    `<button class="btn-plano" onclick="cerrarModal()">Cerrar</button>`);
}

/**
 * Cargar un partido a mano.
 *
 * Existe porque el proveedor de datos todavía no está conectado, y sin
 * partidos nadie puede abrir una sala. Al conectarlo, los que lleguen
 * con el mismo identificador se actualizan en vez de duplicarse.
 */
function nuevoPartido(ligaId, nombre) {
  // Por defecto, mañana a las 8 de la noche: la hora típica de un
  // partido y con margen de sobra para llenar la sala.
  const manana = new Date(Date.now() + 24 * 3600_000);
  manana.setHours(20, 0, 0, 0);
  const valor = new Date(manana.getTime() - manana.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);

  modal(`Cargar partido en ${nombre}`, `
    <div class="rejilla rejilla-2" style="margin:0">
      <div class="campo"><label for="pt_local">Equipo local</label>
        <input id="pt_local" placeholder="Cienciano"></div>
      <div class="campo"><label for="pt_visita">Equipo visitante</label>
        <input id="pt_visita" placeholder="Botafogo"></div>
    </div>
    <div class="campo"><label for="pt_fecha">Cuándo empieza</label>
      <input id="pt_fecha" type="datetime-local" value="${valor}">
      <p class="pista">Tiene que ser dentro de al menos 20 minutos. Las salas
      se cierran solas 15 minutos antes del inicio.</p></div>
    <div class="campo"><label for="pt_api">Identificador del proveedor</label>
      <input id="pt_api" class="num" placeholder="opcional">
      <p class="pista">Es lo que evita duplicados al sincronizar. Si lo dejas
      vacío se genera uno y el partido queda marcado como manual.</p></div>`,
    `<button class="btn-plano" onclick="verPartidos('${ligaId}','${esc(nombre)}')">Volver</button>
     <button class="btn" onclick="guardarPartido('${ligaId}','${esc(nombre)}')">Cargar</button>`);
}

async function guardarPartido(ligaId, nombre) {
  const local = document.getElementById('pt_local').value.trim();
  const visita = document.getElementById('pt_visita').value.trim();
  const fechaTexto = document.getElementById('pt_fecha').value;
  const apiId = document.getElementById('pt_api').value.trim();

  if (local.length < 2 || visita.length < 2) {
    return aviso('Escribe los dos equipos.', 'mal');
  }
  if (!fechaTexto) return aviso('Elige cuándo empieza.', 'mal');

  await accion(async () => {
    const r = await api('/partidos', { method:'POST', body: JSON.stringify({
      ligaId,
      equipoLocal: local,
      equipoVisitante: visita,
      iniciaEn: new Date(fechaTexto).toISOString(),
      ...(apiId ? { apiId } : {}),
    })});
    verPartidos(ligaId, nombre);
    VISTAS.deportes();
    // El aviso va después del éxito, no como error: el partido se
    // cargó bien, pero hay algo que la persona tiene que saber.
    if (r.aviso) setTimeout(() => aviso(r.aviso, 'aviso'), 400);
  }, 'Partido cargado', 'Cargando');
}

async function borrarPartido(id, ligaId, nombre) {
  confirmar({
    titulo: 'Quitar partido',
    mensaje: 'Se va a quitar de la lista.',
    consecuencia: 'Nadie podrá crear salas para él.',
    textoBoton: 'Quitar',
    peligroso: true,
    alAceptar: async () => {
      await accion(async () => {
        await api('/partidos/' + id, { method:'DELETE' });
        verPartidos(ligaId, nombre);
        VISTAS.deportes();
      }, 'Partido quitado', 'Quitando');
    },
  });
}

/**
 * Estado del proveedor de datos.
 *
 * Se muestra arriba porque de él depende que los partidos lleguen y
 * que las salas se liquiden. Si la cuota se agota, los mercados se
 * quedan esperando y a las 72 horas se anulan solos.
 */
function bloqueProveedor(p) {
  const gratuito = String(p.plan ?? '').toLowerCase().includes('free');
  const poca = p.restantes !== null && p.restantes < 20;

  return `
  <div class="marco" style="padding:14px 16px;margin-bottom:18px;display:flex;
    justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap">
    <div>
      <div style="font-size:13px;font-weight:600">
        ${esc(p.proveedor)}
        ${p.ok
          ? '<span class="etiqueta et-bien">conectado</span>'
          : '<span class="etiqueta et-mal">sin conexión</span>'}
      </div>
      <div class="pista" style="margin-top:3px">
        ${p.ligasActivas.length} liga(s) activa(s) de ${p.ligasEnCatalogo} en el
        catálogo. Solo las activas se sincronizan y consumen cuota.
      </div>
    </div>
    ${p.restantes !== null ? `
      <div style="text-align:right">
        <div class="num" style="font-size:20px;font-weight:600;color:${
          poca ? 'var(--mal)' : 'var(--tinta)'}">${p.restantes}</div>
        <div class="pista">peticiones hoy${gratuito ? ' · plan gratuito' : ''}</div>
      </div>` : ''}
  </div>

  ${poca ? `
    <div class="banda" style="margin-bottom:18px">
      <p><strong>Quedan pocas peticiones</strong>
      Si se agotan, los resultados dejan de llegar y los mercados que estén
      esperando se anularán a las 72 horas. Cada anulación es comisión que
      no se cobra.</p>
    </div>` : ''}

  ${p.ligasActivas.length === 0 ? `
    <div class="banda" style="margin-bottom:18px">
      <p><strong>Ninguna liga está activa</strong>
      Una liga registrada no aparece en la app hasta que le habilites
      mercados. Usa el botón «Mercados» de la liga que quieras mostrar.</p>
    </div>` : ''}`;
}

/**
 * Sincroniza ahora, sin esperar al ciclo diario.
 *
 * Consume cuota: una petición por liga activa. Por eso se avisa antes
 * en vez de después.
 */
function sincronizarAhora() {
  confirmar({
    titulo: 'Traer partidos ahora',
    mensaje: 'Se van a pedir los partidos de las próximas dos semanas.',
    consecuencia: 'Consume una petición por liga activa. El sistema ya lo hace solo una vez al día.',
    textoBoton: 'Traer ahora',
    alAceptar: async () => {
      await accion(async () => {
        const r = await api('/deportes/sincronizar', { method: 'POST' });
        VISTAS.deportes();
        const partes = [
          `${r.nuevos} nuevo(s)`,
          r.actualizados ? `${r.actualizados} actualizado(s)` : null,
          r.reprogramados ? `${r.reprogramados} reprogramado(s)` : null,
          r.adoptados ? `${r.adoptados} adoptado(s)` : null,
        ].filter(Boolean);
        aviso(`${partes.join(', ')} en ${r.ligas} liga(s)`, 'bien');
        if (r.aviso) setTimeout(() => aviso(r.aviso, 'mal'), 500);
      }, null, 'Trayendo partidos');
    },
  });
}

/**
 * Paginador.
 *
 * Con más de mil ligas, mostrar «página 3 de 50» sin más obliga a
 * adivinar dónde está lo que se busca. Se dice qué rango se está
 * viendo y del total de qué.
 */
function paginador(r) {
  const hasta = Math.min(r.desde + r.limite, r.total);
  const hayAnterior = r.desde > 0;
  const haySiguiente = hasta < r.total;

  if (!hayAnterior && !haySiguiente) {
    return `<p class="pista">${r.total} liga(s).</p>`;
  }

  return `
  <div style="display:flex;justify-content:space-between;align-items:center;
    gap:12px;margin-top:12px;flex-wrap:wrap">
    <span class="pista" style="margin:0">
      ${r.desde + 1}–${hasta} de ${r.total}
    </span>
    <div style="display:flex;gap:7px">
      <button class="btn-plano btn-chico" ${hayAnterior ? '' : 'disabled'}
        onclick="paginaLigas(${Math.max(0, r.desde - r.limite)})">Anterior</button>
      <button class="btn-plano btn-chico" ${haySiguiente ? '' : 'disabled'}
        onclick="paginaLigas(${r.desde + r.limite})">Siguiente</button>
    </div>
  </div>`;
}

function paginaLigas(desde) {
  S.f.liga.desde = desde;
  VISTAS.deportes();
  // Volver arriba: quedarse a mitad de la tabla anterior desorienta.
  document.getElementById('contenido')?.scrollIntoView({ behavior: 'smooth' });
}

function limpiarFiltroLigas() {
  S.f.liga = { pais: '', buscar: '', soloActivas: false, desde: 0 };
  VISTAS.deportes();
}

/**
 * Barra de deportes.
 *
 * Hoy solo hay fútbol —API-Football cubre eso— pero la barra se dibuja
 * sola con lo que haya en la base. Cuando se contrate la suscripción
 * de básquet o tenis, aparecen sin tocar esta pantalla.
 *
 * Los que no tienen ligas salen apagados en vez de ocultos: ver que
 * existen pero no están disponibles explica por qué no aparecen, y
 * ocultarlos haría pensar que el sistema no los soporta.
 */
function barraDeportes(deportes, elegido) {
  if (!deportes || deportes.length < 2) return '';

  const iconos = {
    FUTBOL:  '<circle cx="12" cy="12" r="9"/><path d="M12 7l3.5 2.5-1.3 4.1h-4.4L8.5 9.5z"/>',
    BASQUET: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.6 5.6c4 4 8.8 4 12.8 0M5.6 18.4c4-4 8.8-4 12.8 0"/>',
    TENIS:   '<circle cx="12" cy="12" r="9"/><path d="M4 6c3 3 3 9 0 12M20 6c-3 3-3 9 0 12"/>',
  };
  const generico = '<circle cx="12" cy="12" r="9"/>';

  return `
  <div class="deportes-barra">
    <button class="deporte ${!elegido ? 'activo' : ''}"
      onclick="S.f.liga.deporte='';S.f.liga.desde=0;VISTAS.deportes()">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/>
        <rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/>
        <rect x="14" y="14" width="7" height="7" rx="1"/></svg>
      Todos
    </button>

    ${deportes.map(d => `
      <button class="deporte ${elegido === d.clave ? 'activo' : ''}
        ${d.ligas === 0 ? 'apagado' : ''}"
        ${d.ligas === 0 ? 'disabled title="Sin ligas cargadas"' : ''}
        onclick="S.f.liga.deporte='${d.clave}';S.f.liga.desde=0;VISTAS.deportes()">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="1.6">${iconos[d.clave] ?? generico}</svg>
        ${esc(d.nombre)}
        ${d.activas > 0
          ? `<span class="deporte-cuenta">${d.activas}</span>`
          : d.ligas > 0 ? `<span class="deporte-cuenta apagada">${d.ligas}</span>` : ''}
      </button>`).join('')}
  </div>`;
}

/**
 * Nombre del país a partir de su código.
 *
 * El proveedor devuelve solo el código de dos letras. Un desplegable
 * con «AD», «FO», «KZ» obliga a adivinar; con el nombre al lado se
 * encuentra lo que se busca.
 *
 * Los que no están en la lista se muestran con su código, que es mejor
 * que nada.
 */
const PAISES = {
  PE:'Perú', BR:'Brasil', AR:'Argentina', CL:'Chile', CO:'Colombia',
  EC:'Ecuador', PY:'Paraguay', UY:'Uruguay', VE:'Venezuela', BO:'Bolivia',
  MX:'México', US:'Estados Unidos', CA:'Canadá', CR:'Costa Rica',
  GT:'Guatemala', HN:'Honduras', PA:'Panamá', SV:'El Salvador',
  ES:'España', GB:'Reino Unido', IT:'Italia', DE:'Alemania', FR:'Francia',
  PT:'Portugal', NL:'Países Bajos', BE:'Bélgica', CH:'Suiza', AT:'Austria',
  SE:'Suecia', NO:'Noruega', DK:'Dinamarca', FI:'Finlandia', IE:'Irlanda',
  PL:'Polonia', CZ:'Chequia', GR:'Grecia', TR:'Turquía', RU:'Rusia',
  UA:'Ucrania', RO:'Rumanía', HU:'Hungría', HR:'Croacia', RS:'Serbia',
  BG:'Bulgaria', SK:'Eslovaquia', SI:'Eslovenia', IS:'Islandia',
  JP:'Japón', KR:'Corea del Sur', CN:'China', IN:'India', AU:'Australia',
  NZ:'Nueva Zelanda', SA:'Arabia Saudí', AE:'Emiratos', QA:'Catar',
  EG:'Egipto', MA:'Marruecos', ZA:'Sudáfrica', NG:'Nigeria',
  XX:'Internacional',
};

function nombrePais(codigo) {
  return PAISES[String(codigo ?? '').toUpperCase()] ?? codigo ?? '—';
}

/**
 * Buscador de países con lista desplegable.
 *
 * Se filtra por nombre Y por código: quien escribe «Perú» y quien
 * escribe «PE» buscan lo mismo, y el proveedor solo devuelve códigos.
 *
 * Sin tildes en la comparación: nadie escribe «Perú» con acento en un
 * campo de búsqueda.
 */
function sinTilde(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function filtrarPaises(texto) {
  const caja = document.getElementById('lista-paises');
  if (!caja) return;

  const paises = S.datos.catalogo?.paises ?? [];
  const q = sinTilde(texto).trim();

  const coinciden = paises.filter(p =>
    !q || sinTilde(nombrePais(p.pais)).includes(q) || sinTilde(p.pais).includes(q));

  // Índice del elemento resaltado, para poder moverse con el teclado.
  S.datos.paisMarcado = 0;

  caja.innerHTML = `
    <button class="opcion-pais" onclick="elegirPais('')">
      <span>Todos los países</span>
      <b>${paises.reduce((t, p) => t + p.ligas, 0)}</b>
    </button>
    ${coinciden.length
      ? coinciden.slice(0, 60).map(p => `
          <button class="opcion-pais" onclick="elegirPais('${esc(p.pais)}')">
            <span>${esc(nombrePais(p.pais))}
              <small>${esc(p.pais)}</small></span>
            <b>${p.ligas}${p.activas ? ` · ${p.activas} activa` : ''}</b>
          </button>`).join('')
      : `<div class="sin-paises">Ningún país coincide con «${esc(texto)}».</div>`}`;

  caja.classList.add('abierta');
}

function elegirPais(codigo) {
  S.f.liga.pais = codigo;
  S.f.liga.desde = 0;
  document.getElementById('lista-paises')?.classList.remove('abierta');
  VISTAS.deportes();
}

/**
 * Enter elige el primero de la lista; Escape la cierra.
 *
 * Sin esto habría que soltar el teclado y buscar el ratón para algo
 * que ya se estaba escribiendo.
 */
function teclaPais(ev) {
  const caja = document.getElementById('lista-paises');
  if (!caja) return;

  if (ev.key === 'Escape') {
    caja.classList.remove('abierta');
    ev.target.blur();
    return;
  }
  if (ev.key === 'Enter') {
    ev.preventDefault();
    // El primero es «Todos», así que se toma el segundo si existe.
    const opciones = caja.querySelectorAll('.opcion-pais');
    (opciones[1] ?? opciones[0])?.click();
  }
}

// Un clic fuera cierra la lista. Se registra una sola vez.
if (!window.__paisCierraRegistrado) {
  window.__paisCierraRegistrado = true;
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest?.('.buscador-pais')) {
      document.getElementById('lista-paises')?.classList.remove('abierta');
    }
  });
}

/** Abre o cierra la lista al pulsar la flecha. */
function alternarPaises(ev) {
  ev.stopPropagation();
  const caja = document.getElementById('lista-paises');
  if (caja?.classList.contains('abierta')) {
    caja.classList.remove('abierta');
  } else {
    // Sin texto: al pulsar la flecha se espera ver TODOS, no lo que
    // quedó filtrado de antes.
    const campo = document.getElementById('f_pais');
    if (campo) campo.value = '';
    filtrarPaises('');
    campo?.focus();
  }
}
