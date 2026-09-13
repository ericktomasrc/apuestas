/* ===== Registro de vistas =====

   Cada archivo de vistas/ se cuelga de este objeto. Se carga antes
   que ellos para que exista cuando se registren. */

const VISTAS = {};
/* ===== Opciones de juego — catálogo visual =====
 * Primera etapa: interfaz del catálogo. No crea endpoints ni cambia reglas del backend.
 */
const OPCIONES_DEMO = [
 {id:1,nombre:'Ganador del partido',cat:'Resultado',ejemplo:'Equipo A gana',cantidad:false,sala:true,casa:true,activa:true},
 {id:2,nombre:'Empate',cat:'Resultado',ejemplo:'El partido termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:3,nombre:'Gana o empata',cat:'Resultado',ejemplo:'Equipo A gana o empata',cantidad:false,sala:true,casa:true,activa:true},
 {id:4,nombre:'No empatan',cat:'Resultado',ejemplo:'El partido no termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:5,nombre:'Equipo no pierde',cat:'Resultado',ejemplo:'Equipo A no pierde',cantidad:false,sala:true,casa:true,activa:true},
 {id:6,nombre:'Marcador exacto',cat:'Resultado',ejemplo:'Equipo A gana 2 a 1',cantidad:true,sala:true,casa:true,activa:true},
 {id:7,nombre:'Equipo marca o más',cat:'Goles de equipo',ejemplo:'Equipo A marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:8,nombre:'Equipo marca exactamente',cat:'Goles de equipo',ejemplo:'Equipo A marca exactamente 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:9,nombre:'Equipo marca o menos',cat:'Goles de equipo',ejemplo:'Equipo A marca 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:10,nombre:'Equipo no marca',cat:'Goles de equipo',ejemplo:'Equipo A no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:11,nombre:'Equipo marca',cat:'Goles de equipo',ejemplo:'Equipo A marca al menos 1 gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:12,nombre:'Equipo marca más que el rival',cat:'Goles de equipo',ejemplo:'Equipo A marca más goles que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:13,nombre:'Equipo marca igual que el rival',cat:'Goles de equipo',ejemplo:'Los dos equipos marcan la misma cantidad',cantidad:false,sala:true,casa:true,activa:true},
 {id:14,nombre:'Hay o más goles',cat:'Total de goles',ejemplo:'Hay 4 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:15,nombre:'Hay exactamente goles',cat:'Total de goles',ejemplo:'Hay exactamente 3 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:16,nombre:'Hay goles o menos',cat:'Total de goles',ejemplo:'Hay 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:17,nombre:'Hay entre dos cantidades',cat:'Total de goles',ejemplo:'Hay entre 2 y 4 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:18,nombre:'No hay goles',cat:'Total de goles',ejemplo:'No hay goles',cantidad:false,sala:true,casa:true,activa:true},
 {id:19,nombre:'Hay al menos un gol',cat:'Total de goles',ejemplo:'Hay al menos 1 gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:20,nombre:'Los dos equipos marcan',cat:'Ambos equipos',ejemplo:'Los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:21,nombre:'Los dos equipos marcan al menos',cat:'Ambos equipos',ejemplo:'Los dos equipos marcan al menos 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:22,nombre:'Solo un equipo marca',cat:'Ambos equipos',ejemplo:'Solo un equipo marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:23,nombre:'Ningún equipo marca',cat:'Ambos equipos',ejemplo:'Ningún equipo marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:24,nombre:'Al menos un equipo no marca',cat:'Ambos equipos',ejemplo:'Al menos un equipo no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:25,nombre:'Gana por o más goles',cat:'Diferencia',ejemplo:'Equipo A gana por 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:26,nombre:'Gana exactamente por',cat:'Diferencia',ejemplo:'Equipo A gana exactamente por 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:27,nombre:'Gana por o menos',cat:'Diferencia',ejemplo:'Equipo A gana por 2 goles o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:28,nombre:'Diferencia exacta de goles',cat:'Diferencia',ejemplo:'La diferencia final es exactamente 2 goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:29,nombre:'Hay diferencia o más',cat:'Diferencia',ejemplo:'Hay 3 o más goles de diferencia',cantidad:true,sala:true,casa:true,activa:true},
 {id:30,nombre:'Gana y hay goles',cat:'Combinadas',ejemplo:'Equipo A gana y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:31,nombre:'Gana y los dos marcan',cat:'Combinadas',ejemplo:'Equipo A gana y los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:32,nombre:'Gana y rival no marca',cat:'Combinadas',ejemplo:'Equipo A gana sin recibir goles',cantidad:false,sala:true,casa:true,activa:true},
 {id:33,nombre:'Gana y marca cantidad',cat:'Combinadas',ejemplo:'Equipo A gana y marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:34,nombre:'No pierde y marca cantidad',cat:'Combinadas',ejemplo:'Equipo A no pierde y marca 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:35,nombre:'Empate y los dos marcan',cat:'Combinadas',ejemplo:'Empatan y los dos equipos marcan',cantidad:false,sala:true,casa:true,activa:true},
 {id:36,nombre:'Empate y hay goles',cat:'Combinadas',ejemplo:'Empatan y hay 2 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:37,nombre:'Los dos marcan y hay goles',cat:'Combinadas',ejemplo:'Los dos equipos marcan y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:38,nombre:'Gana por diferencia y hay goles',cat:'Combinadas',ejemplo:'Equipo A gana por 2 o más y hay 3 o más goles',cantidad:true,sala:true,casa:true,activa:true},
 {id:39,nombre:'Equipo marca y rival no marca',cat:'Combinadas',ejemplo:'Equipo A marca y Equipo B no marca',cantidad:false,sala:true,casa:true,activa:true},
 {id:40,nombre:'Gana el primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A gana el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:41,nombre:'Empate al descanso',cat:'Primer tiempo',ejemplo:'El primer tiempo termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:42,nombre:'Hay goles en el primer tiempo',cat:'Primer tiempo',ejemplo:'Hay 2 o más goles en el primer tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:43,nombre:'Equipo marca en el primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A marca en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:44,nombre:'Equipo marca cantidad en primer tiempo',cat:'Primer tiempo',ejemplo:'Equipo A marca 2 o más goles en el primer tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:45,nombre:'Los dos marcan en el primer tiempo',cat:'Primer tiempo',ejemplo:'Los dos equipos marcan en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:46,nombre:'No hay goles en primer tiempo',cat:'Primer tiempo',ejemplo:'No hay goles en el primer tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:47,nombre:'Gana el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Equipo A gana el segundo tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:48,nombre:'Empate en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'El segundo tiempo termina empatado',cantidad:false,sala:true,casa:true,activa:true},
 {id:49,nombre:'Hay goles en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Hay 2 o más goles en el segundo tiempo',cantidad:true,sala:true,casa:true,activa:true},
 {id:50,nombre:'Equipo marca en el segundo tiempo',cat:'Segundo tiempo',ejemplo:'Equipo A marca en el segundo tiempo',cantidad:false,sala:true,casa:true,activa:true},
 {id:51,nombre:'Marca en los dos tiempos',cat:'Segundo tiempo',ejemplo:'Equipo A marca en los dos tiempos',cantidad:false,sala:true,casa:true,activa:true},
 {id:52,nombre:'Hay goles en los dos tiempos',cat:'Segundo tiempo',ejemplo:'Hay goles en los dos tiempos',cantidad:false,sala:true,casa:true,activa:true},
 {id:53,nombre:'Marca primero',cat:'Eventos',ejemplo:'Equipo A marca primero',cantidad:false,sala:true,casa:true,activa:true},
 {id:54,nombre:'Marca último',cat:'Eventos',ejemplo:'Equipo A marca el último gol',cantidad:false,sala:true,casa:true,activa:true},
 {id:55,nombre:'Gol antes del minuto',cat:'Eventos',ejemplo:'Hay un gol antes del minuto 30',cantidad:true,sala:true,casa:true,activa:true},
 {id:56,nombre:'Gol después del minuto',cat:'Eventos',ejemplo:'Hay un gol después del minuto 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:57,nombre:'Gol entre minutos',cat:'Eventos',ejemplo:'Hay un gol entre el minuto 60 y 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:58,nombre:'Equipo marca antes del minuto',cat:'Eventos',ejemplo:'Equipo A marca antes del minuto 30',cantidad:true,sala:true,casa:true,activa:true},
 {id:59,nombre:'Equipo marca después del minuto',cat:'Eventos',ejemplo:'Equipo A marca después del minuto 75',cantidad:true,sala:true,casa:true,activa:true},
 {id:60,nombre:'Equipo remonta',cat:'Eventos',ejemplo:'Equipo A va perdiendo y termina ganando',cantidad:false,sala:true,casa:true,activa:true},
 {id:61,nombre:'Equipo recibe tarjeta',cat:'Tarjetas',ejemplo:'Equipo A recibe al menos 1 tarjeta',cantidad:false,sala:true,casa:true,activa:true},
 {id:62,nombre:'Equipo recibe o más tarjetas',cat:'Tarjetas',ejemplo:'Equipo A recibe 3 o más tarjetas',cantidad:true,sala:true,casa:true,activa:true},
 {id:63,nombre:'Hay o más tarjetas',cat:'Tarjetas',ejemplo:'Hay 5 o más tarjetas',cantidad:true,sala:true,casa:true,activa:true},
 {id:64,nombre:'Equipo recibe más tarjetas',cat:'Tarjetas',ejemplo:'Equipo A recibe más tarjetas que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:65,nombre:'Los dos reciben tarjeta',cat:'Tarjetas',ejemplo:'Los dos equipos reciben al menos 1 tarjeta',cantidad:false,sala:true,casa:true,activa:true},
 {id:66,nombre:'Hay tarjeta roja',cat:'Tarjetas',ejemplo:'Hay al menos 1 tarjeta roja',cantidad:false,sala:true,casa:true,activa:true},
 {id:67,nombre:'Equipo recibe roja',cat:'Tarjetas',ejemplo:'Equipo A recibe una tarjeta roja',cantidad:false,sala:true,casa:true,activa:true},
 {id:68,nombre:'Hay o más córners',cat:'Córners',ejemplo:'Hay 9 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:69,nombre:'Hay córners o menos',cat:'Córners',ejemplo:'Hay 8 córners o menos',cantidad:true,sala:true,casa:true,activa:true},
 {id:70,nombre:'Equipo consigue o más córners',cat:'Córners',ejemplo:'Equipo A consigue 5 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:71,nombre:'Equipo consigue más córners',cat:'Córners',ejemplo:'Equipo A consigue más córners que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:72,nombre:'Hay exactamente córners',cat:'Córners',ejemplo:'Hay exactamente 10 córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:73,nombre:'Los dos consiguen córners',cat:'Córners',ejemplo:'Los dos equipos consiguen 3 o más córners',cantidad:true,sala:true,casa:true,activa:true},
 {id:74,nombre:'Equipo tiene o más tiros',cat:'Estadísticas',ejemplo:'Equipo A tiene 10 o más tiros',cantidad:true,sala:true,casa:true,activa:true},
 {id:75,nombre:'Equipo tiene o más tiros al arco',cat:'Estadísticas',ejemplo:'Equipo A tiene 5 o más tiros al arco',cantidad:true,sala:true,casa:true,activa:true},
 {id:76,nombre:'Equipo tiene más tiros',cat:'Estadísticas',ejemplo:'Equipo A tiene más tiros que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:77,nombre:'Equipo tiene más posesión',cat:'Estadísticas',ejemplo:'Equipo A tiene más posesión que Equipo B',cantidad:false,sala:true,casa:true,activa:true},
 {id:78,nombre:'Equipo comete o más faltas',cat:'Estadísticas',ejemplo:'Equipo A comete 10 o más faltas',cantidad:true,sala:true,casa:true,activa:true},
 {id:79,nombre:'Equipo tiene o más fuera de juego',cat:'Estadísticas',ejemplo:'Equipo A tiene 3 o más fuera de juego',cantidad:true,sala:true,casa:true,activa:true}
];

S.opcionesJuego = S.opcionesJuego || {categoria:'Todas', buscar:'', estado:'todas', destino:'todos'};
let OPCIONES_CACHE = [];

function opjColor(cat){ if(['Resultado','Diferencia'].includes(cat))return 'azul'; if(['Ambos equipos','Combinadas'].includes(cat))return 'morado'; return 'verde'; }
function opjFiltradas(){const f=S.opcionesJuego;return OPCIONES_CACHE.filter(o=>(f.categoria==='Todas'||o.cat===f.categoria)&&(!f.buscar||(`${o.nombre} ${o.ejemplo}`).toLowerCase().includes(f.buscar.toLowerCase()))&&(f.estado==='todas'||(f.estado==='activas'?o.activa:!o.activa))&&(f.destino==='todos'||(f.destino==='sala'?o.sala:o.casa)));}
function opjDestinos(o){return `<div class="opj-destinos">${o.sala?'<span class="opj-chip verde">Crear sala</span>':''}${o.casa?'<span class="opj-chip azul">Casa</span>':''}</div>`;}
function opjEditar(id){const o=OPCIONES_CACHE.find(x=>x.id===id);abrirOpcion(o);}
function opjCambiarCategoria(cat){S.opcionesJuego.categoria=cat;dibujarOpciones();}
function opjBuscar(v){S.opcionesJuego.buscar=v;dibujarOpciones();}
function opjFiltro(k,v){S.opcionesJuego[k]=v;dibujarOpciones();}
function opjVistaPrevia(){const n=document.getElementById('opj-min')?.value||'2';const modo=document.querySelector('input[name=opj_modo]:checked')?.value||'o más';const p=document.getElementById('opj-preview-texto');if(p)p.textContent=`Equipo A marca ${n} ${modo} goles`;}

function abrirOpcion(o=null){
 const edit=!!o, cats=['Resultado','Goles de equipo','Total de goles','Ambos equipos','Diferencia','Combinadas','Primer tiempo','Segundo tiempo','Eventos','Tarjetas','Córners','Estadísticas'];
 modal(edit?'Editar opción':'Nueva opción', `
  <input id="opj-id" type="hidden" value="${esc(o?.id||'')}">
  <div class="opj-form-grid">
   <div class="campo ancho"><label>Nombre sencillo</label><input id="opj-nombre" value="${esc(o?.nombre||'')}" placeholder="Ej. Goles de un equipo"></div>
   <div class="campo"><label>Categoría</label><select id="opj-cat">${cats.map(c=>`<option ${o?.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
   <div class="campo"><label>Ejemplo que verá el usuario</label><input id="opj-ejemplo" value="${esc(o?.ejemplo||'Equipo A marca 2 o más goles')}"></div>
   <div class="campo ancho"><label>¿El usuario elige una cantidad?</label><div class="opj-checks"><label class="opj-check"><input id="opj-cantidad" type="checkbox" ${o?.cantidad?'checked':''}> Sí, puede elegir cantidad</label></div></div>
   <div class="campo"><label>Cantidad mínima</label><input id="opj-min" type="number" min="0" max="999" value="${o?.cantidadMin??1}" oninput="opjVistaPrevia()"></div>
   <div class="campo"><label>Cantidad máxima</label><input id="opj-max" type="number" min="0" max="999" value="${o?.cantidadMax??10}"></div>
   <div class="campo ancho"><label>Formas permitidas</label><div class="opj-checks"><label class="opj-check"><input id="opj-exacto" type="checkbox" ${o?.exactamente===false?'':'checked'}> Exactamente</label><label class="opj-check"><input id="opj-mas" type="checkbox" ${o?.mas===false?'':'checked'}> O más</label><label class="opj-check"><input id="opj-menos" type="checkbox" ${o?.menos===false?'':'checked'}> O menos</label></div></div>
   <div class="campo"><label>Fuente para comprobar</label><select id="opj-fuente"><option value="RESULTADO" ${o?.fuenteValidacion==='RESULTADO'?'selected':''}>Resultado</option><option value="EVENTOS" ${o?.fuenteValidacion==='EVENTOS'?'selected':''}>Eventos</option><option value="ESTADISTICAS" ${o?.fuenteValidacion==='ESTADISTICAS'?'selected':''}>Estadísticas</option></select></div>
   <div class="campo ancho"><label>Dónde se mostrará</label><div class="opj-checks"><label class="opj-check"><input id="opj-sala" type="checkbox" ${o?.sala===false?'':'checked'}> Crear Sala</label><label class="opj-check"><input id="opj-casa" type="checkbox" ${o?.casa===false?'':'checked'}> Casa</label><label class="opj-check"><input id="opj-activa" type="checkbox" ${o?.activa===false?'':'checked'}> Activa</label></div></div>
  </div>
  <div class="opj-preview"><small>Así lo verán los usuarios</small><strong id="opj-preview-texto">${esc(o?.ejemplo||'Equipo A marca 2 o más goles')}</strong></div>`,
  `<button class="btn-plano" onclick="cerrarModal()">Cancelar</button><button class="btn" onclick="opjGuardar()">Guardar opción</button>`);
}

async function opjGuardar(){
 const id=document.getElementById('opj-id').value; const usaCantidad=document.getElementById('opj-cantidad').checked;
 const body={nombre:document.getElementById('opj-nombre').value.trim(),categoria:document.getElementById('opj-cat').value,ejemplo:document.getElementById('opj-ejemplo').value.trim(),usaCantidad,cantidadMin:usaCantidad?Number(document.getElementById('opj-min').value):null,cantidadMax:usaCantidad?Number(document.getElementById('opj-max').value):null,permiteExactamente:document.getElementById('opj-exacto').checked,permiteMas:document.getElementById('opj-mas').checked,permiteMenos:document.getElementById('opj-menos').checked,mostrarSala:document.getElementById('opj-sala').checked,mostrarCasa:document.getElementById('opj-casa').checked,activa:document.getElementById('opj-activa').checked,fuenteValidacion:document.getElementById('opj-fuente').value,configuracion:{}};
 await accion(async()=>{await api('/opciones-juego'+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(body)});cerrarModal();await VISTAS.opciones();},id?'Opción actualizada':'Opción creada','Guardando opción');
}

function dibujarOpciones(){
 const cats=['Todas','Resultado','Goles de equipo','Total de goles','Ambos equipos','Diferencia','Combinadas','Primer tiempo','Segundo tiempo','Eventos','Tarjetas','Córners','Estadísticas'];const f=S.opcionesJuego,rows=opjFiltradas();const conteo=c=>c==='Todas'?OPCIONES_CACHE.length:OPCIONES_CACHE.filter(o=>o.cat===c).length;
 document.getElementById('contenido').innerHTML=`<div class="opj-cab"><div><h1>Opciones de juego</h1><p>Catálogo guardado en la base de datos para Crear Sala y Casa.</p></div><button class="btn" onclick="abrirOpcion()">+ Nueva opción</button></div><div class="opj-ayuda"><strong>Textos fáciles de entender.</strong> Las pantallas consultan este catálogo; aquí decides qué reglas están activas y dónde aparecen.</div><div class="opj-tabs">${cats.map(c=>`<button class="opj-tab ${f.categoria===c?'activo':''}" onclick="opjCambiarCategoria('${c}')">${c}<b>${conteo(c)}</b></button>`).join('')}</div><div class="opj-barra"><input class="opj-buscar" placeholder="Buscar opción…" value="${esc(f.buscar)}" oninput="opjBuscar(this.value)"><select onchange="opjFiltro('estado',this.value)"><option value="todas">Todos los estados</option><option value="activas">Activas</option><option value="inactivas">Inactivas</option></select><select onchange="opjFiltro('destino',this.value)"><option value="todos">Mostrar en: Todos</option><option value="sala">Crear Sala</option><option value="casa">Casa</option></select></div><div class="opj-panel"><table class="opj-tabla"><thead><tr><th>#</th><th>Nombre</th><th>Categoría</th><th>Ejemplo</th><th>Cantidad</th><th>Mostrar en</th><th>Estado</th><th></th></tr></thead><tbody>${rows.map((o,i)=>`<tr><td>${i+1}</td><td class="opj-nombre">${esc(o.nombre)}</td><td><span class="opj-chip ${opjColor(o.cat)}">${esc(o.cat)}</span></td><td class="opj-ejemplo">${esc(o.ejemplo)}</td><td>${o.cantidad?'La elige el usuario':'No necesita'}</td><td>${opjDestinos(o)}</td><td><span class="opj-estado ${o.activa?'':'inactiva'}">${o.activa?'Activa':'Inactiva'}</span></td><td><button class="opj-iconbtn" title="Editar" onclick="opjEditar('${o.id}')">✎</button></td></tr>`).join('')}</tbody></table><div class="opj-cards">${rows.map(o=>`<article class="opj-card"><div class="opj-card-top"><div><h3>${esc(o.nombre)}</h3><span class="opj-chip ${opjColor(o.cat)}">${esc(o.cat)}</span></div><button class="opj-iconbtn" onclick="opjEditar('${o.id}')">✎</button></div><p>${esc(o.ejemplo)}</p><div>${o.cantidad?'Cantidad: la elige el usuario':'No necesita cantidad'}</div><div class="opj-card-pie">${opjDestinos(o)}<span class="opj-estado ${o.activa?'':'inactiva'}">${o.activa?'Activa':'Inactiva'}</span></div></article>`).join('')}</div></div>`;
}

VISTAS.opciones=async function(){
 document.getElementById('contenido').innerHTML='<div class="cargando">Cargando opciones…</div>';
 try{const r=await api('/opciones-juego');OPCIONES_CACHE=r.reglas||[];dibujarOpciones();}
 catch(e){document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudo cargar Opciones de juego</strong><p>${esc(e.message)}</p><p>Ejecuta primero la migración <code>sql/016_reglas_juego.sql</code>.</p></div>`;}
};


/* ===== PROCESOS AUTOMÁTICOS — Deportes ===== */
S.procesosAutomaticos = S.procesosAutomaticos || {
  partidos: null,
  historico: null,
  cargando: false,
  guardandoPartidos: false,
  guardandoHistorico: false,
  ejecutandoPartidos: false,
  ejecutandoHistorico: false,
  error: '',
};

function paEsc(v){
  return String(v ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
function paFecha(v){
  if(!v)return '—';
  const d=new Date(v);
  return Number.isNaN(d.getTime()) ? paEsc(v) : d.toLocaleString('es-PE');
}
function paDuracion(v){
  const n=Number(v);
  if(!Number.isFinite(n))return '—';
  return n < 1000 ? `${Math.round(n)} ms` : `${(n/1000).toFixed(1)} s`;
}
function paConfig(x, defecto){
  const c=x?.configuracion || x || {};
  return {
    activo: c.activo ?? defecto.activo,
    hora: c.hora || defecto.hora,
    vecesPorDia: Number(c.vecesPorDia || defecto.vecesPorDia),
    horarios: Array.isArray(c.horarios) ? c.horarios : [],
  };
}
function paEstadoHistorico(){
  return S.procesosAutomaticos.historico?.mantenimiento || {};
}
function paTelemetriaPartidos(){
  const p=S.procesosAutomaticos.partidos || {};
  return p.estado || p.telemetria || {};
}
function paResultadoTexto(v){
  if(v===null||v===undefined||v==='')return '—';
  if(typeof v==='string')return v;
  if(typeof v==='boolean'||typeof v==='number')return String(v);
  if(typeof v==='object'){
    if(v.mensaje)return String(v.mensaje);
    if(v.error)return String(v.error);
    if(v.ok===true)return 'Correcto';
    try{return JSON.stringify(v);}
    catch(_e){return 'Resultado disponible';}
  }
  return String(v);
}

async function paCargar(){
  const s=S.procesosAutomaticos;
  s.cargando=true;s.error='';
  paDibujar();
  try{
    const [partidos,historico]=await Promise.all([
      api('/deportes/procesos-automaticos/partidos'),
      api('/analisis-historico/mantenimiento-programado'),
    ]);
    s.partidos=partidos;
    s.historico=historico;
  }catch(e){
    s.error=e.message||'No se pudo cargar la configuración de procesos automáticos.';
  }finally{
    s.cargando=false;paDibujar();
  }
}

function paActualizarCard(tipo){
  const id=tipo==='partidos'?'pa-card-partidos':'pa-card-historico';
  const actual=document.getElementById(id);
  if(!actual)return;
  actual.outerHTML=tipo==='partidos'
    ? paCard('partidos','Carga automática de partidos','Sincroniza los partidos de las ligas activas del panel.',{activo:true,hora:'04:00',vecesPorDia:1})
    : paCard('historico','Actualización automática del histórico','Mantiene y completa los datos históricos utilizados por el análisis deportivo.',{activo:false,hora:'05:00',vecesPorDia:1});
}

async function paRecargarCard(tipo){
  const s=S.procesosAutomaticos;
  if(tipo==='partidos'){
    s.partidos=await api('/deportes/procesos-automaticos/partidos');
  }else{
    s.historico=await api('/analisis-historico/mantenimiento-programado');
  }
  paActualizarCard(tipo);
}

async function paGuardar(tipo){
  const s=S.procesosAutomaticos;
  const pref=tipo==='partidos'?'pa-p':'pa-h';
  const body={
    activo:!!document.getElementById(pref+'-activo')?.checked,
    hora:String(document.getElementById(pref+'-hora')?.value||''),
    vecesPorDia:Number(document.getElementById(pref+'-veces')?.value||1),
  };

  if(tipo==='partidos')s.guardandoPartidos=true;else s.guardandoHistorico=true;
  paActualizarCard(tipo);

  try{
    if(tipo==='partidos'){
      s.partidos=await api('/deportes/procesos-automaticos/partidos',{
        method:'PUT',body:JSON.stringify(body)
      });
    }else{
      s.historico=await api('/analisis-historico/mantenimiento-programado',{
        method:'PUT',body:JSON.stringify(body)
      });
    }
    if(typeof avisar==='function')avisar('Configuración guardada.','ok');
  }catch(e){
    if(typeof avisar==='function')avisar(e.message||'No se pudo guardar.','error');
    else s.error=e.message||'No se pudo guardar.';
  }finally{
    if(tipo==='partidos')s.guardandoPartidos=false;else s.guardandoHistorico=false;
    try{await paRecargarCard(tipo);}
    catch(_e){paActualizarCard(tipo);}
  }
}

async function paEjecutar(tipo){
  const s=S.procesosAutomaticos;
  if(tipo==='partidos')s.ejecutandoPartidos=true;else s.ejecutandoHistorico=true;
  paActualizarCard(tipo);

  try{
    if(tipo==='partidos'){
      await api('/deportes/procesos-automaticos/partidos/ejecutar',{method:'POST'});
    }else{
      await api('/analisis-historico/mantenimiento-programado/ejecutar',{method:'POST'});
    }
    if(typeof avisar==='function')avisar('Proceso ejecutado.','ok');
  }catch(e){
    if(typeof avisar==='function')avisar(e.message||'No se pudo ejecutar el proceso.','error');
    else s.error=e.message||'No se pudo ejecutar el proceso.';
  }finally{
    if(tipo==='partidos')s.ejecutandoPartidos=false;else s.ejecutandoHistorico=false;
    try{await paRecargarCard(tipo);}
    catch(_e){paActualizarCard(tipo);}
  }
}

function paCard(tipo,titulo,descripcion,defecto){
  const s=S.procesosAutomaticos;
  const raw=tipo==='partidos'?s.partidos:s.historico;
  const c=paConfig(raw,defecto);
  const estado=tipo==='partidos'?paTelemetriaPartidos():paEstadoHistorico();
  const pref=tipo==='partidos'?'pa-p':'pa-h';
  const guardando=tipo==='partidos'?s.guardandoPartidos:s.guardandoHistorico;
  const ejecutando=tipo==='partidos'?s.ejecutandoPartidos:s.ejecutandoHistorico;
  const ultima=estado.ultimaFinalizacion || estado.ultimaEjecucion || estado.ultimoIntento || null;
  const proxima=estado.proximaEjecucion || estado.proxima || null;
  const duracion=estado.ultimaDuracionMs ?? estado.duracionMs ?? null;
  const resultado=estado.ultimoMensaje || estado.ultimoResultado || estado.mensaje || null;

  return `<section id="${tipo==='partidos'?'pa-card-partidos':'pa-card-historico'}" class="pa-card">
    <div class="pa-card-head">
      <div><h2>${paEsc(titulo)}</h2><p>${paEsc(descripcion)}</p></div>
      <label class="pa-switch">
        <input id="${pref}-activo" type="checkbox" ${c.activo?'checked':''}>
        <span></span><b>${c.activo?'ON':'OFF'}</b>
      </label>
    </div>

    <div class="pa-form">
      <label><span>Hora inicial</span><input id="${pref}-hora" type="time" value="${paEsc(c.hora)}"></label>
      <label><span>Veces por día</span><select id="${pref}-veces">
        ${[1,2,3,4,6].map(n=>`<option value="${n}" ${c.vecesPorDia===n?'selected':''}>${n}</option>`).join('')}
      </select></label>
      <div class="pa-horarios"><span>Horarios calculados</span><div>${c.horarios.length?c.horarios.map(h=>`<em>${paEsc(h)}</em>`).join(''):'<small>Se calcularán al guardar.</small>'}</div></div>
    </div>

    <div class="pa-metricas">
      <div><small>Última ejecución</small><strong>${paFecha(ultima)}</strong></div>
      <div><small>Próxima ejecución</small><strong>${paFecha(proxima)}</strong></div>
      <div><small>Duración</small><strong>${paDuracion(duracion)}</strong></div>
      <div><small>Último resultado</small><strong title="${paEsc(paResultadoTexto(resultado))}">${paEsc(paResultadoTexto(resultado))}</strong></div>
    </div>

    <div class="pa-actions">
      <button class="btn-plano" ${guardando?'disabled':''} onclick="paGuardar('${tipo}')">${guardando?'Guardando…':'Guardar configuración'}</button>
      <button class="btn" ${ejecutando?'disabled':''} onclick="paEjecutar('${tipo}')">${ejecutando?'Ejecutando…':'Ejecutar ahora'}</button>
    </div>
  </section>`;
}

function paDibujar(){
  const el=document.getElementById('contenido');
  if(!el)return;
  const s=S.procesosAutomaticos;
  el.innerHTML=`<style>
    .pa-wrap{max-width:1180px;margin:0 auto}.pa-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}
    .pa-head h1{margin:0 0 5px}.pa-head p{margin:0;color:#64748b}.pa-note{background:#f8faf9;border:1px solid #e3ebe7;border-radius:12px;padding:11px 13px;margin-bottom:14px;color:#53635d;font-size:12px}
    .pa-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.pa-card{background:#fff;border:1px solid #e3e8e5;border-radius:14px;padding:16px;min-width:0}
    .pa-card-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.pa-card h2{font-size:16px;margin:0 0 4px}.pa-card p{font-size:12px;color:#64748b;margin:0;max-width:520px}
    .pa-switch{display:flex;align-items:center;gap:7px;cursor:pointer;white-space:nowrap}.pa-switch input{display:none}.pa-switch span{width:38px;height:21px;border-radius:999px;background:#cbd5e1;position:relative;transition:.2s}
    .pa-switch span:after{content:'';position:absolute;width:17px;height:17px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px #0002;transition:.2s}.pa-switch input:checked+span{background:#3f8f70}.pa-switch input:checked+span:after{transform:translateX(17px)}.pa-switch b{font-size:11px;color:#52645d}
    .pa-form{display:grid;grid-template-columns:140px 140px 1fr;gap:10px;margin:18px 0}.pa-form label>span,.pa-horarios>span{display:block;font-size:10px;font-weight:700;color:#64748b;margin-bottom:5px;text-transform:uppercase;letter-spacing:.03em}
    .pa-form input,.pa-form select{width:100%;box-sizing:border-box;border:1px solid #dbe3df;border-radius:9px;background:#fff;padding:9px}.pa-horarios div{display:flex;gap:5px;flex-wrap:wrap}.pa-horarios em{font-style:normal;font-size:11px;padding:7px 8px;border-radius:8px;background:#eef7f2;color:#28684f}.pa-horarios small{color:#94a3b8;padding:7px 0}
    .pa-metricas{display:grid;grid-template-columns:1fr 1fr;gap:7px}.pa-metricas div{background:#f8faf9;border-radius:9px;padding:9px;min-width:0}.pa-metricas small{display:block;color:#7b8794;font-size:10px;margin-bottom:3px}.pa-metricas strong{display:block;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .pa-actions{display:flex;justify-content:flex-end;gap:8px;border-top:1px solid #edf1ef;margin-top:14px;padding-top:12px}.pa-error{border:1px solid #f1c8c8;background:#fff7f7;color:#9b3c3c;border-radius:10px;padding:10px;margin-bottom:12px}
    @media(max-width:900px){.pa-grid{grid-template-columns:1fr}.pa-form{grid-template-columns:1fr 1fr}.pa-horarios{grid-column:1/-1}}
    @media(max-width:560px){.pa-card-head{flex-direction:column}.pa-form,.pa-metricas{grid-template-columns:1fr}.pa-horarios{grid-column:auto}.pa-actions{flex-direction:column}.pa-actions button{width:100%}}
  </style>
  <div class="pa-wrap">
    <div class="pa-head"><div><h1>Procesos automáticos</h1><p>Controla la carga programada de partidos y el mantenimiento del histórico deportivo.</p></div><button class="btn-plano" onclick="paCargar()" ${s.cargando?'disabled':''}>${s.cargando?'Actualizando…':'Actualizar estado'}</button></div>
    <div class="pa-note"><strong>El interruptor solo controla la ejecución automática.</strong> “Ejecutar ahora” permanece disponible aunque el proceso esté en OFF.</div>
    ${s.error?`<div class="pa-error">${paEsc(s.error)}</div>`:''}
    ${s.cargando&&!s.partidos&&!s.historico?'<div class="cargando">Cargando procesos automáticos…</div>':`<div class="pa-grid">
      ${paCard('partidos','Carga automática de partidos','Sincroniza los partidos de las ligas activas del panel.',{activo:true,hora:'04:00',vecesPorDia:1})}
      ${paCard('historico','Actualización automática del histórico','Mantiene y completa los datos históricos utilizados por el análisis deportivo.',{activo:false,hora:'05:00',vecesPorDia:1})}
    </div>`}
  </div>`;
}

VISTAS.procesosAutomaticos=async function(){
  document.getElementById('contenido').innerHTML='<div class="cargando">Cargando procesos automáticos…</div>';
  await paCargar();
};


/* ===== PASO 9 — selección múltiple + métricas de las 79 reglas ===== */
S.analisisDeportivo = S.analisisDeportivo || {
  fecha: '', fechaInicio: '', fechaFin: '',
  ligaApiId: '', ligaApiIds: new Set(), ligaApiIdsBorrador: new Set(),
  ligaDropdownAbierto: false, ligaBuscar: '', ligasActivas: [],
  buscar: '', muestra: 20,
  partidos: [], seleccionados: new Set(), resultados: [], cargando: false,
  metricasPorFixture: {}, metricasCargando: new Set(),
  filtroCategoriaReglas: 'Todas', filtroEstadoReglas: 'TODOS',
  rendimiento: null, rendimientoCargando: false, rendimientoAbierto: false, limiteRendimiento: 40,
};
// Compatibilidad si el estado ya existía antes de este paso.
S.analisisDeportivo.ligaApiIds = S.analisisDeportivo.ligaApiIds instanceof Set ? S.analisisDeportivo.ligaApiIds : new Set(S.analisisDeportivo.ligaApiIds || []);
S.analisisDeportivo.ligaApiIdsBorrador = S.analisisDeportivo.ligaApiIdsBorrador instanceof Set ? S.analisisDeportivo.ligaApiIdsBorrador : new Set(S.analisisDeportivo.ligaApiIdsBorrador || []);
S.analisisDeportivo.ligasActivas = S.analisisDeportivo.ligasActivas || [];
S.analisisDeportivo.ligaDropdownAbierto = !!S.analisisDeportivo.ligaDropdownAbierto;
S.analisisDeportivo.ligaBuscar = S.analisisDeportivo.ligaBuscar || '';
S.analisisDeportivo.configuracionFiltroCargada = !!S.analisisDeportivo.configuracionFiltroCargada;
S.analisisDeportivo.metricasPorFixture = S.analisisDeportivo.metricasPorFixture || {};
S.analisisDeportivo.metricasCargando = S.analisisDeportivo.metricasCargando || new Set();
S.analisisDeportivo.filtroCategoriaReglas = S.analisisDeportivo.filtroCategoriaReglas || 'Todas';
S.analisisDeportivo.filtroEstadoReglas = S.analisisDeportivo.filtroEstadoReglas || 'TODOS';
S.analisisDeportivo.rendimiento = S.analisisDeportivo.rendimiento || null;
S.analisisDeportivo.rendimientoCargando = false;
S.analisisDeportivo.rendimientoAbierto = S.analisisDeportivo.rendimientoAbierto || false;
S.analisisDeportivo.limiteRendimiento = S.analisisDeportivo.limiteRendimiento || 40;
S.analisisDeportivo.diagnosticoDataset = S.analisisDeportivo.diagnosticoDataset || null;
S.analisisDeportivo.diagnosticoCargando = false;
S.analisisDeportivo.diagnosticoAbierto = S.analisisDeportivo.diagnosticoAbierto || false;
S.analisisDeportivo.diagnosticoSeleccionados = S.analisisDeportivo.diagnosticoSeleccionados || new Set();
S.analisisDeportivo.importacionTrabajo = S.analisisDeportivo.importacionTrabajo || null;
S.analisisDeportivo.importacionCargando = false;
S.analisisDeportivo.historialImportaciones = S.analisisDeportivo.historialImportaciones || [];
S.analisisDeportivo.historialImportacionesAbierto = S.analisisDeportivo.historialImportacionesAbierto || false;
S.analisisDeportivo.historialImportacionesCargando = false;
S.analisisDeportivo.reintentoTrabajoId = S.analisisDeportivo.reintentoTrabajoId || null;
S.analisisDeportivo.consumoApi = S.analisisDeportivo.consumoApi || null;
S.analisisDeportivo.consumoApiCargando = false;
S.analisisDeportivo.consumoApiAbierto = S.analisisDeportivo.consumoApiAbierto || false;
S.analisisDeportivo.consumoApiDias = S.analisisDeportivo.consumoApiDias || 7;
S.analisisDeportivo.estimacionImportacion = S.analisisDeportivo.estimacionImportacion || null;
S.analisisDeportivo.estimacionImportacionCargando = false;
S.analisisDeportivo.planImportacion = S.analisisDeportivo.planImportacion || null;
S.analisisDeportivo.planImportacionCargando = false;
S.analisisDeportivo.mantenimientoProgramado = S.analisisDeportivo.mantenimientoProgramado || null;
S.analisisDeportivo.mantenimientoProgramadoAbierto = S.analisisDeportivo.mantenimientoProgramadoAbierto || false;
S.analisisDeportivo.mantenimientoProgramadoCargando = false;
S.analisisDeportivo.mantenimientoProgramadoEjecutando = false;
S.analisisDeportivo.saludGeneral = S.analisisDeportivo.saludGeneral || null;
S.analisisDeportivo.saludGeneralAbierto = S.analisisDeportivo.saludGeneralAbierto || false;
S.analisisDeportivo.saludGeneralCargando = false;
S.analisisDeportivo.coberturaReglas = S.analisisDeportivo.coberturaReglas || null;
S.analisisDeportivo.coberturaReglasAbierto = S.analisisDeportivo.coberturaReglasAbierto || false;
S.analisisDeportivo.coberturaReglasCargando = false;
S.analisisDeportivo.coberturaReglasCategoria = S.analisisDeportivo.coberturaReglasCategoria || 'Todas';
S.analisisDeportivo.coberturaReglasEstado = S.analisisDeportivo.coberturaReglasEstado || 'TODOS';
S.analisisDeportivo.coberturaCampos = S.analisisDeportivo.coberturaCampos || null;
S.analisisDeportivo.coberturaCamposAbierto = S.analisisDeportivo.coberturaCamposAbierto || false;
S.analisisDeportivo.coberturaCamposCargando = false;
S.analisisDeportivo.coberturaCamposCategoria = S.analisisDeportivo.coberturaCamposCategoria || 'Todas';
S.analisisDeportivo.coberturaCamposEstado = S.analisisDeportivo.coberturaCamposEstado || 'TODOS';
S.analisisDeportivo.normalizacionEquipos = S.analisisDeportivo.normalizacionEquipos || null;
S.analisisDeportivo.normalizacionEquiposAbierto = S.analisisDeportivo.normalizacionEquiposAbierto || false;
S.analisisDeportivo.normalizacionEquiposCargando = false;
S.analisisDeportivo.normalizacionEquiposBuscar = S.analisisDeportivo.normalizacionEquiposBuscar || '';
S.analisisDeportivo.datasetsEspecializados = S.analisisDeportivo.datasetsEspecializados || {};
S.analisisDeportivo.datasetsEspecializadosCargando = S.analisisDeportivo.datasetsEspecializadosCargando || new Set();
S.analisisDeportivo.datasetFamiliaPorFixture = S.analisisDeportivo.datasetFamiliaPorFixture || {};

function adEsc(v){ return esc(v ?? ''); }

function adSaludBadge(v){const cls=v==='LISTO'?'ok':v==='PARCIAL'?'lim':'bad';return `<span class="ad-badge ${cls}">${adEsc(String(v||'—').replaceAll('_',' '))}</span>`;}
function adBloqueSaludGeneral(){
  const a=S.analisisDeportivo;if(!a.saludGeneralAbierto)return '';
  if(a.saludGeneralCargando)return `<section class="ad-rend"><div class="cargando">Calculando estado general…</div></section>`;
  const x=a.saludGeneral;if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa actualizar para calcular el estado general.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const d=x.dataset||{},r=x.analisis||{},q=x.api||{},im=x.importaciones||{},m=x.mantenimiento||{};
  return `<section class="ad-rend ad-salud"><div class="ad-rend-head"><div><h3>Estado general del sistema histórico</h3><p>Resumen conjunto de dataset, motor, API, importaciones y mantenimiento.</p></div><div>${adSaludBadge(x.estado)} <button class="btn-plano btn-chico" onclick="adCargarSaludGeneral(true)">Actualizar</button></div></div>
  <div class="ad-salud-kpis"><span><small>Cobertura histórica</small><b>${Number(r.coberturaPromedioPct||0).toFixed(0)}%</b></span><span><small>Reglas utilizables</small><b>${Number(r.utilizablesPct||0).toFixed(0)}%</b></span><span><small>Stats pendientes</small><b>${d.estadisticasPendientes||0}</b></span><span><small>Eventos pendientes</small><b>${d.eventosPendientes||0}</b></span><span><small>Cuota API</small><b>${adEsc(q.estadoCuota||'—')}</b></span><span><small>Trabajos activos</small><b>${im.activas||0}</b></span></div>
  <div class="ad-salud-grid"><div><h4>Diagnóstico</h4><div class="ad-salud-motivos">${(x.motivos||[]).map(v=>`<span>• ${adEsc(v)}</span>`).join('')}</div></div><div><h4>Servicios</h4><div class="ad-salud-motivos"><span>API: ${q.restantes==null?'cuota no informada':`${q.restantes} restantes de ${q.limite??'—'}`}</span><span>Errores API (7d): ${q.errores7d||0} · 429: ${q.rateLimit7d||0}</span><span>Mantenimiento: ${m.habilitado?'activo':'desactivado'} · ${adEsc(m.ultimoResultado||'SIN_EJECUTAR')}</span><span>Incidencias recientes: ${im.incidenciasRecientes||0}</span></div></div></div>
  <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')}</div></section>`;
}
async function adCargarSaludGeneral(forzar=false){const a=S.analisisDeportivo;a.saludGeneralAbierto=true;if(a.saludGeneral&&!forzar){adRedibujar();return;}a.saludGeneralCargando=true;adRedibujar();try{const r=await api('/analisis-historico/salud-general');a.saludGeneral=r.salud||{error:'Sin respuesta de salud.'};}catch(e){a.saludGeneral={error:e.message||'No se pudo calcular el estado general.'};}finally{a.saludGeneralCargando=false;adRedibujar();}}
function adCerrarSaludGeneral(){S.analisisDeportivo.saludGeneralAbierto=false;adRedibujar();}

function adCobReglaBadge(v){const c=v==='LISTA'?'ok':v==='PARCIAL'?'lim':'bad';return `<span class="ad-badge ${c}">${adEsc(String(v||'—').replaceAll('_',' '))}</span>`;}
function adBloqueCoberturaReglas(){
  const a=S.analisisDeportivo;if(!a.coberturaReglasAbierto)return '';
  if(a.coberturaReglasCargando)return `<section class="ad-rend"><div class="cargando">Calculando cobertura de las reglas…</div></section>`;
  const x=a.coberturaReglas;if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa actualizar para calcular la cobertura de las 79 reglas.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, cats=x.categorias||[], reglas=x.reglas||[];
  const categorias=['Todas',...new Set(reglas.map(q=>q.categoria).filter(Boolean))];
  const filtradas=reglas.filter(q=>(a.coberturaReglasCategoria==='Todas'||q.categoria===a.coberturaReglasCategoria)&&(a.coberturaReglasEstado==='TODOS'||q.estado===a.coberturaReglasEstado));
  return `<section class="ad-rend ad-cob79"><div class="ad-rend-head"><div><h3>Cobertura de las 79 reglas</h3><p>Qué reglas tienen datos históricos suficientes y cuáles necesitan mejorar su dataset.</p></div><button class="btn-plano btn-chico" onclick="adCargarCoberturaReglas(true)">Actualizar</button></div>
  <div class="ad-cob-kpis"><span><small>Reglas evaluadas</small><b>${r.reglas||0}</b></span><span><small>Listas</small><b>${r.listas||0}</b></span><span><small>Parciales</small><b>${r.parciales||0}</b></span><span><small>Necesitan datos</small><b>${r.necesitanDatos||0}</b></span><span><small>Cobertura promedio</small><b>${Number(r.coberturaPromedioPct||0).toFixed(0)}%</b></span></div>
  <div class="ad-cob-cat">${cats.map(c=>`<span><b>${adEsc(c.categoria)}</b><small>${c.listas}/${c.reglas} listas · ${Number(c.coberturaPromedioPct||0).toFixed(0)}% cobertura</small></span>`).join('')}</div>
  <div class="ad-reglas-filtros"><select onchange="adCoberturaCategoria(this.value)">${categorias.map(c=>`<option value="${adEsc(c)}" ${a.coberturaReglasCategoria===c?'selected':''}>${adEsc(c)}</option>`).join('')}</select><select onchange="adCoberturaEstado(this.value)"><option value="TODOS">Todos los estados</option>${['LISTA','PARCIAL','NECESITA_DATOS','SIN_MUESTRA'].map(e=>`<option value="${e}" ${a.coberturaReglasEstado===e?'selected':''}>${e.replaceAll('_',' ')}</option>`).join('')}</select><span>${filtradas.length} regla(s)</span></div>
  <div class="ad-cob-table"><div class="ad-cob-row ad-cob-head"><span>Regla</span><span>Categoría</span><span>Estado</span><span>Usable</span><span>Cobertura</span></div>${filtradas.map(q=>`<div class="ad-cob-row"><span><b>${adEsc(q.codigo)}</b><small>${adEsc(q.nombre)}</small></span><span>${adEsc(q.categoria)}</span><span>${adCobReglaBadge(q.estado)}</span><span>${Number(q.utilizablesPct||0).toFixed(0)}%</span><span><b>${Number(q.coberturaPromedioPct||0).toFixed(0)}%</b><small>${Number(q.coberturaMinPct||0).toFixed(0)}–${Number(q.coberturaMaxPct||0).toFixed(0)}%</small></span></div>`).join('')||'<div class="ad-empty ad-empty-mini">No hay reglas para este filtro.</div>'}</div>
  <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')}</div></section>`;
}
async function adCargarCoberturaReglas(forzar=false){const a=S.analisisDeportivo;a.coberturaReglasAbierto=true;if(a.coberturaReglas&&!forzar){adRedibujar();return;}a.coberturaReglasCargando=true;adRedibujar();try{const qs=new URLSearchParams();if(a.ligaApiId)qs.set('ligaApiId',a.ligaApiId);qs.set('muestra',String(a.muestra||20));qs.set('limite','40');const r=await api('/analisis-historico/cobertura-reglas?'+qs.toString());a.coberturaReglas=r.cobertura||{error:'Sin respuesta de cobertura.'};}catch(e){a.coberturaReglas={error:e.message||'No se pudo calcular la cobertura de reglas.'};}finally{a.coberturaReglasCargando=false;adRedibujar();}}
function adCerrarCoberturaReglas(){S.analisisDeportivo.coberturaReglasAbierto=false;adRedibujar();}
function adCoberturaCategoria(v){S.analisisDeportivo.coberturaReglasCategoria=v;adRedibujar();}
function adCoberturaEstado(v){S.analisisDeportivo.coberturaReglasEstado=v;adRedibujar();}


function adBloqueNormalizacionEquipos(){
  const a=S.analisisDeportivo;if(!a.normalizacionEquiposAbierto)return '';
  if(a.normalizacionEquiposCargando)return `<section class="ad-rend"><div class="cargando">Revisando normalización de equipos…</div></section>`;
  const x=a.normalizacionEquipos;if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa actualizar para revisar el catálogo histórico de equipos.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, equipos=x.equipos||[];
  return `<section class="ad-rend ad-equipos"><div class="ad-rend-head"><div><h3>Normalización histórica de equipos</h3><p>Relaciona nombres y variantes con el identificador estable de API-Football.</p></div><div><button class="btn-plano btn-chico" onclick="adCargarNormalizacionEquipos(true)">Actualizar</button> <button class="btn btn-chico" onclick="adSincronizarNormalizacionEquipos()">Sincronizar historial</button></div></div>
  <div class="ad-cob-kpis"><span><small>Equipos</small><b>${r.equipos||0}</b></span><span><small>Alias registrados</small><b>${r.aliases||0}</b></span><span><small>Alias ambiguos</small><b>${r.aliasesAmbiguos||0}</b></span><span><small>Programados sin resolver</small><b>${r.programadosSinResolver||0}</b></span><span><small>Última actualización</small><b class="ad-eq-date">${r.actualizadoEn?adFechaLocal(r.actualizadoEn):'—'}</b></span></div>
  <div class="ad-eq-toolbar"><input type="search" placeholder="Buscar equipo o alias…" value="${adEsc(a.normalizacionEquiposBuscar)}" onkeydown="if(event.key==='Enter')adBuscarEquipoNormalizado(this.value)"><button class="btn-plano btn-chico" onclick="adBuscarEquipoNormalizado(this.previousElementSibling.value)">Buscar</button></div>
  <div class="ad-cob-table"><div class="ad-eq-row ad-cob-head"><span>Equipo</span><span>API ID</span><span>Partidos</span><span>Alias conocidos</span></div>${equipos.map(e=>`<div class="ad-eq-row"><span><b>${adEsc(e.nombreCanonico)}</b><small>${e.ultimaFecha?'Último registro '+adFechaLocal(e.ultimaFecha):''}</small></span><span>${adEsc(e.equipoApiId)}</span><span>${e.partidos||0}</span><span>${(e.aliases||[]).slice(0,4).map(v=>`<em>${adEsc(v)}</em>`).join('')||'—'}${(e.aliases||[]).length>4?`<small>+${e.aliases.length-4} alias</small>`:''}</span></div>`).join('')||'<div class="ad-empty ad-empty-mini">No hay equipos para este filtro.</div>'}</div>
  <div class="ad-note ad-rend-note">El análisis de partidos programados usa primero estos identificadores estables. Si un nombre coincide con más de un equipo y no puede desambiguarse por liga/histórico, se rechaza en vez de adivinar.</div></section>`;
}
async function adCargarNormalizacionEquipos(forzar=false){const a=S.analisisDeportivo;a.normalizacionEquiposAbierto=true;if(a.normalizacionEquipos&&!forzar){adRedibujar();return;}a.normalizacionEquiposCargando=true;adRedibujar();try{const qs=new URLSearchParams();if(a.normalizacionEquiposBuscar)qs.set('buscar',a.normalizacionEquiposBuscar);qs.set('limite','100');const r=await api('/analisis-historico/equipos-normalizados?'+qs.toString());a.normalizacionEquipos=r;}catch(e){a.normalizacionEquipos={error:e.message||'No se pudo cargar la normalización de equipos.'};}finally{a.normalizacionEquiposCargando=false;adRedibujar();}}
function adCerrarNormalizacionEquipos(){S.analisisDeportivo.normalizacionEquiposAbierto=false;adRedibujar();}
function adBuscarEquipoNormalizado(v){S.analisisDeportivo.normalizacionEquiposBuscar=String(v||'').trim();S.analisisDeportivo.normalizacionEquipos=null;adCargarNormalizacionEquipos(true);}
async function adSincronizarNormalizacionEquipos(){const a=S.analisisDeportivo;a.normalizacionEquiposCargando=true;adRedibujar();try{await api('/analisis-historico/equipos-normalizados/sincronizar',{method:'POST'});a.normalizacionEquipos=null;await adCargarNormalizacionEquipos(true);}catch(e){a.normalizacionEquipos={error:e.message||'No se pudo sincronizar la normalización de equipos.'};a.normalizacionEquiposCargando=false;adRedibujar();}}

function adCampoBadge(v){const c=v==='LISTO'?'ok':v==='PARCIAL'?'lim':'bad';return `<span class="ad-badge ${c}">${adEsc(String(v||'—').replaceAll('_',' '))}</span>`;}
function adBloqueCoberturaCampos(){
  const a=S.analisisDeportivo;if(!a.coberturaCamposAbierto)return '';
  if(a.coberturaCamposCargando)return `<section class="ad-rend"><div class="cargando">Calculando cobertura por campo…</div></section>`;
  const x=a.coberturaCampos;if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa actualizar para revisar la presencia real de cada campo histórico.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, cats=x.categorias||[], campos=x.campos||[];
  const categorias=['Todas',...new Set(campos.map(q=>q.categoria).filter(Boolean))];
  const filtrados=campos.filter(q=>(a.coberturaCamposCategoria==='Todas'||q.categoria===a.coberturaCamposCategoria)&&(a.coberturaCamposEstado==='TODOS'||q.estado===a.coberturaCamposEstado));
  return `<section class="ad-rend ad-campos"><div class="ad-rend-head"><div><h3>Cobertura por campo</h3><p>Comprueba cada dato por separado; una fila de estadísticas puede existir aunque un campo concreto venga vacío.</p></div><button class="btn-plano btn-chico" onclick="adCargarCoberturaCampos(true)">Actualizar</button></div>
  <div class="ad-cob-kpis"><span><small>Partidos</small><b>${r.partidos||0}</b></span><span><small>Campos revisados</small><b>${r.campos||0}</b></span><span><small>Listos</small><b>${r.listos||0}</b></span><span><small>Parciales / bajos</small><b>${(r.parciales||0)+(r.bajos||0)}</b></span><span><small>Cobertura promedio</small><b>${Number(r.coberturaPromedioPct||0).toFixed(0)}%</b></span></div>
  <div class="ad-cob-cat">${cats.map(c=>`<span><b>${adEsc(c.categoria)}</b><small>${c.listos}/${c.campos} listos · ${Number(c.coberturaPromedioPct||0).toFixed(0)}% cobertura</small></span>`).join('')}</div>
  <div class="ad-reglas-filtros"><select onchange="adCoberturaCamposCategoriaCambiar(this.value)">${categorias.map(c=>`<option value="${adEsc(c)}" ${a.coberturaCamposCategoria===c?'selected':''}>${adEsc(c)}</option>`).join('')}</select><select onchange="adCoberturaCamposEstadoCambiar(this.value)"><option value="TODOS">Todos los estados</option>${['LISTO','PARCIAL','BAJO','SIN_DATOS'].map(e=>`<option value="${e}" ${a.coberturaCamposEstado===e?'selected':''}>${e.replaceAll('_',' ')}</option>`).join('')}</select><span>${filtrados.length} campo(s)</span></div>
  <div class="ad-cob-table"><div class="ad-campo-row ad-cob-head"><span>Campo</span><span>Nivel</span><span>Estado</span><span>Disponibles</span><span>Faltantes</span><span>Cobertura</span></div>${filtrados.map(q=>`<div class="ad-campo-row"><span><b>${adEsc(q.nombre)}</b><small>${adEsc(q.categoria)} · ${adEsc(q.clave)}</small></span><span>${adEsc(q.nivel)}</span><span>${adCampoBadge(q.estado)}</span><span>${q.disponibles||0} / ${q.esperados||0}</span><span>${q.faltantes||0}</span><span><b>${Number(q.coberturaPct||0).toFixed(1)}%</b></span></div>`).join('')||'<div class="ad-empty ad-empty-mini">No hay campos para este filtro.</div>'}</div>
  <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')}</div></section>`;
}
async function adCargarCoberturaCampos(forzar=false){const a=S.analisisDeportivo;a.coberturaCamposAbierto=true;if(a.coberturaCampos&&!forzar){adRedibujar();return;}a.coberturaCamposCargando=true;adRedibujar();try{const qs=new URLSearchParams();if(a.ligaApiId)qs.set('ligaApiId',a.ligaApiId);qs.set('limite','1000');const r=await api('/analisis-historico/cobertura-campos?'+qs.toString());a.coberturaCampos=r.cobertura||{error:'Sin respuesta de cobertura por campo.'};}catch(e){a.coberturaCampos={error:e.message||'No se pudo calcular la cobertura por campo.'};}finally{a.coberturaCamposCargando=false;adRedibujar();}}
function adCerrarCoberturaCampos(){S.analisisDeportivo.coberturaCamposAbierto=false;adRedibujar();}
function adCoberturaCamposCategoriaCambiar(v){S.analisisDeportivo.coberturaCamposCategoria=v;adRedibujar();}
function adCoberturaCamposEstadoCambiar(v){S.analisisDeportivo.coberturaCamposEstado=v;adRedibujar();}


function adFechaLocal(iso){
  try { return new Intl.DateTimeFormat('es-PE',{dateStyle:'medium',timeStyle:'short'}).format(new Date(iso)); }
  catch { return iso || '—'; }
}
function adFechaYmdLocal(d=new Date()){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dia=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${dia}`;
}
function adFinMesYmd(ymd){
  const [y,m]=String(ymd||adFechaYmdLocal()).split('-').map(Number);
  const d=new Date(y,m,0);
  return adFechaYmdLocal(d);
}
function adInicializarRangoFechas(){
  const a=S.analisisDeportivo, hoy=adFechaYmdLocal();
  if(!a.fechaInicio)a.fechaInicio=hoy;
  if(!a.fechaFin)a.fechaFin=adFinMesYmd(a.fechaInicio);
  if(a.fechaFin<a.fechaInicio)a.fechaFin=a.fechaInicio;
  a.fecha=a.fechaInicio;
}
function adPartidosFiltrados(){
  const a=S.analisisDeportivo, q=(a.buscar||'').trim().toLowerCase(), sel=a.ligaApiIds;
  if(!sel?.size)return [];
  return a.partidos.filter(p =>
    sel.has(String(p.ligaApiId)) &&
    (!q || `${p.local} ${p.visitante} ${p.liga}`.toLowerCase().includes(q))
  );
}
function adLigas(){
  const m=new Map();
  for(const l of (S.analisisDeportivo.ligasActivas||[])){
    const id=String(l.api_id??l.apiId??'').trim();
    const nombre=String(l.nombre??l.liga??'').trim();
    if(id&&nombre&&!m.has(id))m.set(id,nombre);
  }
  return [...m.entries()].sort((a,b)=>a[1].localeCompare(b[1]));
}
function adDepurarSeleccionPorLigas(){
  const a=S.analisisDeportivo, sel=a.ligaApiIds;
  if(!sel?.size){
    a.seleccionados.clear();
    return;
  }
  const permitidos=new Set(
    a.partidos
      .filter(p=>sel.has(String(p.ligaApiId)))
      .map(p=>String(p.fixtureId))
  );
  for(const id of [...a.seleccionados]) if(!permitidos.has(String(id))) a.seleccionados.delete(String(id));
}
function adSeleccionar(id,checked){
  const s=S.analisisDeportivo.seleccionados;
  checked?s.add(String(id)):s.delete(String(id));
  adActualizarContador();
}
function adSeleccionarTodos(){
  const a=S.analisisDeportivo, visibles=adPartidosFiltrados();
  const todosMarcados=visibles.length>0&&visibles.every(p=>a.seleccionados.has(String(p.fixtureId)));
  for(const p of visibles){
    const id=String(p.fixtureId);
    todosMarcados?a.seleccionados.delete(id):a.seleccionados.add(id);
  }
  adRedibujar();
}
function adLimpiarSeleccion(){ S.analisisDeportivo.seleccionados.clear(); adRedibujar(); }
function adActualizarContador(){
  const n=S.analisisDeportivo.seleccionados.size;
  document.querySelectorAll('[data-ad-count]').forEach(x=>x.textContent=String(n));
  const b=document.getElementById('ad-analizar'); if(b)b.disabled=n===0||S.analisisDeportivo.cargando;
}
function adAbrirLigas(){
  const a=S.analisisDeportivo;
  if(a.ligaDropdownAbierto){
    adCerrarLigas();
    return;
  }
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
  a.ligaDropdownAbierto=true;
  a.ligaBuscar='';
  adRedibujar();
  setTimeout(()=>document.getElementById('ad-liga-buscar')?.focus(),0);
}
function adCerrarLigas(){
  const a=S.analisisDeportivo;
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
  a.ligaDropdownAbierto=false;
  a.ligaBuscar='';
  adRedibujar();
}
function adToggleLiga(id,checked){
  const a=S.analisisDeportivo;
  checked?a.ligaApiIdsBorrador.add(String(id)):a.ligaApiIdsBorrador.delete(String(id));
  adRedibujar();
}
function adSeleccionarTodasLigas(){
  const a=S.analisisDeportivo, ligas=adLigas();
  const todasMarcadas=ligas.length>0&&ligas.every(([id])=>a.ligaApiIdsBorrador.has(String(id)));
  a.ligaApiIdsBorrador=todasMarcadas
    ? new Set()
    : new Set(ligas.map(([id])=>String(id)));
  adRedibujar();
}
function adLimpiarLigasBorrador(){
  S.analisisDeportivo.ligaApiIdsBorrador.clear();
  adRedibujar();
}
async function adAplicarLigas(){
  const a=S.analisisDeportivo;
  a.ligaApiIds=new Set(a.ligaApiIdsBorrador);
  a.ligaApiId=a.ligaApiIds.size===1?[...a.ligaApiIds][0]:'';
  a.ligaDropdownAbierto=false;
  a.ligaBuscar='';
  a.rendimiento=null;a.coberturaReglas=null;a.coberturaCampos=null;a.normalizacionEquipos=null;
  adDepurarSeleccionPorLigas();
  adRedibujar();
  try{await adGuardarConfiguracionFiltro();}
  catch(e){avisar(e.message||'No se pudo guardar el filtro de ligas.','error');}
}
async function adQuitarLiga(id){
  const a=S.analisisDeportivo;
  a.ligaApiIds.delete(String(id));
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
  a.ligaApiId=a.ligaApiIds.size===1?[...a.ligaApiIds][0]:'';
  adDepurarSeleccionPorLigas();
  adRedibujar();
  try{await adGuardarConfiguracionFiltro();}
  catch(e){avisar(e.message||'No se pudo guardar el filtro de ligas.','error');}
}
function adLigaBuscar(v){
  const a=S.analisisDeportivo;
  a.ligaBuscar=String(v||'');
  const q=a.ligaBuscar.trim().toLowerCase();
  const cont=document.getElementById('ad-ligas-opciones');
  if(!cont)return;

  let visibles=0;
  cont.querySelectorAll('.ad-liga-opcion').forEach(row=>{
    const nombre=String(row.dataset.nombre||'').toLowerCase();
    const mostrar=!q||nombre.includes(q);
    row.hidden=!mostrar;
    row.style.display=mostrar?'':'none';
    if(mostrar)visibles++;
  });

  const vacio=document.getElementById('ad-liga-sin-resultados');
  if(vacio){
    vacio.hidden=visibles>0;
    vacio.style.display=visibles>0?'none':'';
  }
}
async function adCambiarFechaInicio(v){
  const a=S.analisisDeportivo;
  a.fechaInicio=v||adFechaYmdLocal();
  if(!a.fechaFin||a.fechaFin<a.fechaInicio)a.fechaFin=adFinMesYmd(a.fechaInicio);
  if(a.fechaFin<a.fechaInicio)a.fechaFin=a.fechaInicio;
  a.fecha=a.fechaInicio;
  document.getElementById('contenido').innerHTML='<div class="cargando">Cargando partidos…</div>';
  try{await adCargarPartidos();dibujarAnalisisDeportivo();}
  catch(e){document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudieron cargar los partidos</strong><p>${adEsc(e.message)}</p></div>`;}
}
async function adCambiarFechaFin(v){
  const a=S.analisisDeportivo;
  a.fechaFin=v||a.fechaInicio||adFechaYmdLocal();
  if(a.fechaFin<a.fechaInicio)a.fechaFin=a.fechaInicio;
  document.getElementById('contenido').innerHTML='<div class="cargando">Cargando partidos…</div>';
  try{await adCargarPartidos();dibujarAnalisisDeportivo();}
  catch(e){document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudieron cargar los partidos</strong><p>${adEsc(e.message)}</p></div>`;}
}
function adBuscar(v){
  const a=S.analisisDeportivo;
  a.buscar=String(v||'');
  const q=a.buscar.trim().toLowerCase();

  let visibles=0;
  let seleccionadosVisibles=0;

  document.querySelectorAll('.ad-row[data-buscar]').forEach(row=>{
    const mostrar=!q||String(row.dataset.buscar||'').includes(q);
    row.hidden=!mostrar;
    row.style.display=mostrar?'':'none';
    if(mostrar){
      visibles++;
      const cb=row.querySelector('input[type="checkbox"]');
      if(cb?.checked)seleccionadosVisibles++;
    }
  });

  const contador=document.querySelector('.ad-partidos-todos small');
  if(contador)contador.textContent=`${seleccionadosVisibles} de ${visibles} seleccionados`;

  const todos=document.querySelector('.ad-partidos-todos input[type="checkbox"]');
  if(todos){
    todos.checked=visibles>0&&seleccionadosVisibles===visibles;
    todos.indeterminate=seleccionadosVisibles>0&&seleccionadosVisibles<visibles;
  }

  // Si se limpió desde el botón, redibujamos una sola vez para
  // reconstruir la lista completa de las ligas aplicadas.
  if(!v){
    adRedibujar();
    setTimeout(()=>document.querySelector('.ad-partidos-buscar input')?.focus(),0);
  }
}
function adMuestra(v){ S.analisisDeportivo.muestra=Math.max(5,Math.min(50,Number(v)||20)); S.analisisDeportivo.rendimiento=null; S.analisisDeportivo.coberturaReglas=null; }
function adFiltroCategoriaReglas(v){ S.analisisDeportivo.filtroCategoriaReglas=v; adRedibujar(); }
function adFiltroEstadoReglas(v){ S.analisisDeportivo.filtroEstadoReglas=v; adRedibujar(); }

function adPrioridadBadge(v){
  const cls=v==='OK'?'ok':v==='MEDIA'?'lim':'bad';
  return `<span class="ad-badge ${cls}">${adEsc(v||'—')}</span>`;
}
function adDiagKey(i){return `${i.ligaApiId}:${i.temporada}`;}
function adDiagSeleccionar(key,checked){const a=S.analisisDeportivo,s=a.diagnosticoSeleccionados;checked?s.add(String(key)):s.delete(String(key));a.estimacionImportacion=null;a.planImportacion=null;adRedibujar();}
function adDiagSeleccionarPendientes(){const a=S.analisisDeportivo,x=a.diagnosticoDataset;for(const i of (x?.items||[])){if(i.prioridad&&i.prioridad!=='OK')a.diagnosticoSeleccionados.add(adDiagKey(i));}a.estimacionImportacion=null;a.planImportacion=null;adRedibujar();}
function adDiagLimpiar(){const a=S.analisisDeportivo;a.diagnosticoSeleccionados.clear();a.estimacionImportacion=null;a.planImportacion=null;adRedibujar();}
function adEstadoImportacionBadge(v){const cls=v==='COMPLETO'?'ok':(v==='EN_COLA'||v==='EN_PROCESO'||v==='PARCIAL')?'lim':'bad';return `<span class="ad-badge ${cls}">${adEsc(v||'—')}</span>`;}
function adDuracionImportacion(t){
  const ini=t?.iniciadoEn?new Date(t.iniciadoEn):null, fin=t?.finalizadoEn?new Date(t.finalizadoEn):null;
  if(!ini||Number.isNaN(ini.getTime()))return '—';
  const ms=(fin&&!Number.isNaN(fin.getTime())?fin:new Date())-ini;
  const seg=Math.max(0,Math.round(ms/1000)); if(seg<60)return seg+' s';
  const min=Math.floor(seg/60), rs=seg%60; if(min<60)return min+' min '+rs+' s';
  return Math.floor(min/60)+' h '+(min%60)+' min';
}
function adPuedeReintentar(t){
  return ['PARCIAL','ERROR','INTERRUMPIDO'].includes(String(t?.estado||'')) || (t?.objetivos||[]).some(o=>['PARCIAL','ERROR','INTERRUMPIDO'].includes(String(o.estado||'')));
}
function adBloqueHistorialImportaciones(){
  const a=S.analisisDeportivo;if(!a.historialImportacionesAbierto)return '';
  if(a.historialImportacionesCargando)return `<section class="ad-rend"><div class="cargando">Cargando historial de importaciones…</div></section>`;
  const lista=a.historialImportaciones||[];
  return `<section class="ad-rend"><div class="ad-rend-head"><div><h3>Historial de importaciones</h3><p>Registro persistente de quién ejecutó cada proceso y cuál fue su resultado.</p></div><button class="btn-plano btn-chico" onclick="adCargarHistorialImportaciones(true)">Actualizar</button></div>${lista.length?`<div class="ad-hist-list">${lista.map(t=>`<details class="ad-hist-item"><summary><span><b>${adFechaLocal(t.creadoEn)}</b><small>${adEsc(t.usuarioAlias||'Usuario')} · ${t.total||0} liga/temporada · ${adDuracionImportacion(t)}</small></span>${adEstadoImportacionBadge(t.estado)}</summary><div class="ad-hist-body"><div class="ad-hist-meta"><span><small>Inicio</small><b>${t.iniciadoEn?adFechaLocal(t.iniciadoEn):'—'}</b></span><span><small>Fin</small><b>${t.finalizadoEn?adFechaLocal(t.finalizadoEn):'—'}</b></span><span><small>Procesadas</small><b>${t.actual||0} / ${t.total||0}</b></span><span><small>Ejecutado por</small><b>${adEsc(t.usuarioAlias||'—')}</b></span></div><div class="ad-import-items">${(t.objetivos||[]).map(o=>`<span><b>${adEsc(o.liga||('Liga '+o.ligaApiId))}</b> ${o.temporada} ${adEstadoImportacionBadge(o.estado)}${o.error?`<small>${adEsc(o.error)}</small>`:''}</span>`).join('')}</div>${t.error?`<div class="ad-reglas-error">${adEsc(t.error)}</div>`:''}${adPuedeReintentar(t)?`<div class="ad-hist-retry"><button class="btn-plano btn-chico" ${a.reintentoTrabajoId?'disabled':''} onclick="adReintentarImportacion('${adEsc(t.id)}')">${a.reintentoTrabajoId===t.id?'Preparando reintento…':'Reintentar pendientes'}</button><small>Solo vuelve a procesar objetivos incompletos; los que ya estén COMPLETO se omiten.</small></div>`:''}</div></details>`).join('')}</div>`:'<div class="ad-empty ad-empty-mini">Todavía no hay importaciones registradas.</div>'}</section>`;
}
async function adCargarHistorialImportaciones(forzar=false){
  const a=S.analisisDeportivo;a.historialImportacionesAbierto=true;
  if(a.historialImportaciones.length&&!forzar){adRedibujar();return;}
  a.historialImportacionesCargando=true;adRedibujar();
  try{const r=await api('/analisis-historico/importacion-historica/historial?limite=30');a.historialImportaciones=r.trabajos||[];}
  catch(e){a.historialImportaciones=[];avisar(e.message||'No se pudo cargar el historial de importaciones.','error');}
  finally{a.historialImportacionesCargando=false;adRedibujar();}
}
function adCerrarHistorialImportaciones(){S.analisisDeportivo.historialImportacionesAbierto=false;adRedibujar();}
async function adReintentarImportacion(trabajoId){
  const a=S.analisisDeportivo;if(!trabajoId||a.reintentoTrabajoId)return;
  a.reintentoTrabajoId=trabajoId;adRedibujar();
  try{
    const r=await api('/analisis-historico/importacion-historica/'+encodeURIComponent(trabajoId)+'/reintentar',{method:'POST'});
    a.importacionTrabajo=r.trabajo||null;
    avisar(`Reintento iniciado: ${r.reintentados||0} pendiente(s)${r.omitidosCompletos?` · ${r.omitidosCompletos} ya completos omitidos`:''}.`,'ok');
    if(a.importacionTrabajo?.id)adVigilarImportacion();
    await adCargarHistorialImportaciones(true);
  }catch(e){avisar(e.message||'No se pudo iniciar el reintento.','error');}
  finally{a.reintentoTrabajoId=null;adRedibujar();}
}

function adBloqueTrabajoImportacion(){
  const t=S.analisisDeportivo.importacionTrabajo;if(!t)return '';
  const hechos=(t.objetivos||[]).filter(x=>x.estado==='COMPLETO').length;
  const pct=t.total?Math.round((Math.max(0,t.actual-(t.estado==='EN_PROCESO'?1:0))+hechos)/Math.max(1,t.total)*50):0;
  const progreso=t.estado==='COMPLETO'?100:Math.min(95,Math.max(0,Math.round((t.actual||0)/Math.max(1,t.total)*100)));
  return `<div class="ad-import-job"><div class="ad-import-job-head"><div><strong>Importación histórica</strong><small>${t.actual||0} de ${t.total||0} liga/temporada procesadas</small></div>${adEstadoImportacionBadge(t.estado)}</div><div class="ad-progress"><i style="width:${progreso}%"></i></div><div class="ad-import-items">${(t.objetivos||[]).map(o=>`<span><b>${adEsc(o.liga||('Liga '+o.ligaApiId))}</b> ${o.temporada} ${adEstadoImportacionBadge(o.estado)}${o.error?`<small>${adEsc(o.error)}</small>`:''}</span>`).join('')}</div>${t.error?`<div class="ad-reglas-error">${adEsc(t.error)}</div>`:''}</div>`;
}
function adObjetivosDiagnosticoSeleccionados(){
  const a=S.analisisDeportivo,x=a.diagnosticoDataset,sel=a.diagnosticoSeleccionados;
  if(!x||!sel.size)return [];
  return (x.items||[]).filter(i=>sel.has(adDiagKey(i))).slice(0,20).map(i=>({ligaApiId:String(i.ligaApiId),temporada:Number(i.temporada),liga:i.liga}));
}
async function adEstimarImportacion(){
  const a=S.analisisDeportivo,objetivos=adObjetivosDiagnosticoSeleccionados();if(!objetivos.length||a.estimacionImportacionCargando)return;
  a.estimacionImportacionCargando=true;a.estimacionImportacion=null;adRedibujar();
  try{const r=await api('/analisis-historico/estimacion-importacion',{method:'POST',body:JSON.stringify({objetivos})});a.estimacionImportacion=r.estimacion||{error:'Sin estimación.'};}
  catch(e){a.estimacionImportacion={error:e.message||'No se pudo estimar el consumo.'};}
  finally{a.estimacionImportacionCargando=false;adRedibujar();}
}
async function adPlanificarImportacion(){
  const a=S.analisisDeportivo,x=a.diagnosticoDataset;if(!x||a.planImportacionCargando)return;
  const todos=(x.items||[]).filter(i=>i.prioridad&&i.prioridad!=='OK');
  const seleccion=a.diagnosticoSeleccionados;
  const base=seleccion.size?todos.filter(i=>seleccion.has(adDiagKey(i))):todos;
  const objetivos=base.slice(0,100).map(i=>({ligaApiId:String(i.ligaApiId),temporada:Number(i.temporada),liga:i.liga}));
  if(!objetivos.length)return;
  a.planImportacionCargando=true;a.planImportacion=null;adRedibujar();
  try{const r=await api('/analisis-historico/planificacion-importacion',{method:'POST',body:JSON.stringify({objetivos,maxObjetivos:20})});a.planImportacion=r.plan||{error:'Sin plan.'};}
  catch(e){a.planImportacion={error:e.message||'No se pudo construir el plan.'};}
  finally{a.planImportacionCargando=false;adRedibujar();}
}
function adAplicarPlanImportacion(){
  const a=S.analisisDeportivo,p=a.planImportacion;if(!p?.seleccionados?.length)return;
  a.diagnosticoSeleccionados.clear();for(const i of p.seleccionados)a.diagnosticoSeleccionados.add(`${i.ligaApiId}:${i.temporada}`);
  a.estimacionImportacion=null;adRedibujar();
}
function adBloquePlanImportacion(){
  const a=S.analisisDeportivo;if(a.planImportacionCargando)return `<div class="ad-est-cuota"><div class="cargando">Construyendo plan automático…</div></div>`;
  const p=a.planImportacion;if(!p)return '';if(p.error)return `<div class="ad-reglas-error">${adEsc(p.error)}</div>`;
  const r=p.resumen||{},q=p.cuota||{},sel=p.seleccionados||[],pos=p.pospuestos||[];
  const cls=r.cuotaDesconocida?'lim':sel.length?'ok':'bad';
  const estado=r.cuotaDesconocida?'Cuota por confirmar':sel.length?'Plan listo':'Sin objetivos que quepan';
  return `<div class="ad-est-cuota ad-plan-auto"><div class="ad-est-cuota-head"><div><strong>Planificación automática</strong><small>Prioridad + llamadas estimadas + cuota disponible</small></div><span class="ad-badge ${cls}">${adEsc(estado)}</span></div><div class="ad-rend-kpis"><span><b>${r.candidatos??0}</b><small>candidatos</small></span><span><b>${r.seleccionados??0}</b><small>seleccionados</small></span><span><b>${r.pospuestos??0}</b><small>pospuestos</small></span><span><b>${r.llamadasPlanificadas??0}</b><small>llamadas planificadas</small></span><span><b>${r.cuotaLibreDespues??'—'}</b><small>cuota libre después</small></span></div>${sel.length?`<div class="ad-plan-actions"><button class="btn btn-chico" onclick="adAplicarPlanImportacion()">Aplicar plan (${sel.length})</button><small>Solo prepara la selección; la importación no empieza hasta que pulses “Completar seleccionadas”.</small></div><details open><summary>Seleccionadas por el plan</summary><div class="ad-import-items">${sel.map(i=>`<span><b>${adEsc(i.liga||('Liga '+i.ligaApiId))}</b> ${i.temporada} ${adPrioridadBadge(i.prioridad)}<small>${i.llamadas?.totalParaCompletar??0} llamadas · prioridad ${i.puntajePrioridad??0}/100</small></span>`).join('')}</div></details>`:''}${pos.length?`<details><summary>Pospuestas (${pos.length})</summary><div class="ad-import-items">${pos.map(i=>`<span><b>${adEsc(i.liga||('Liga '+i.ligaApiId))}</b> ${i.temporada}<small>${i.llamadas?.totalParaCompletar??0} llamadas · ${i.motivoPlan==='CUOTA_INSUFICIENTE'?'no cabe en la cuota disponible':'límite del plan'}</small></span>`).join('')}</div></details>`:''}<div class="ad-note">${adEsc(p.aviso||'')}</div></div>`;
}

function adBloqueEstimacionImportacion(){
  const a=S.analisisDeportivo;if(a.estimacionImportacionCargando)return `<div class="ad-est-cuota"><div class="cargando">Estimando llamadas de API-Football…</div></div>`;
  const x=a.estimacionImportacion;if(!x)return '';
  if(x.error)return `<div class="ad-reglas-error">${adEsc(x.error)}</div>`;
  const r=x.resumen||{},q=x.cuota||{},items=x.items||[];
  const estado=r.puedeCompletarTodo===null?'Cuota desconocida':r.puedeCompletarTodo?'Alcanza la cuota':'No alcanza para completar todo';
  const cls=r.puedeCompletarTodo===true?'ok':r.puedeCompletarTodo===false?'bad':'lim';
  return `<div class="ad-est-cuota"><div class="ad-est-cuota-head"><div><strong>Estimación antes de importar</strong><small>${items.length} liga/temporada seleccionadas</small></div><span class="ad-badge ${cls}">${adEsc(estado)}</span></div><div class="ad-rend-kpis"><span><b>${r.llamadasParaCompletar??0}</b><small>para completar</small></span><span><b>${r.llamadasPlanActual??0}</b><small>plan actual</small></span><span><b>${q.restantes??'—'}</b><small>cuota restante</small></span><span><b>${q.reserva??0}</b><small>reserva</small></span><span><b>${q.disponibles??'—'}</b><small>disponibles</small></span></div><details><summary>Ver detalle por liga/temporada</summary><div class="ad-import-items">${items.map(i=>`<span><b>${adEsc(i.liga||('Liga '+i.ligaApiId))}</b> ${i.temporada}<small>${i.llamadas?.totalParaCompletar??0} llamadas · cobertura ${i.llamadas?.cobertura??0} · fixtures ${i.llamadas?.fixtures??0} · stats ${i.llamadas?.estadisticas??0} · eventos ${i.llamadas?.eventos??0}</small></span>`).join('')}</div></details><div class="ad-note">${adEsc(x.aviso||'')}</div></div>`;
}
async function adIniciarImportacion(){
  const a=S.analisisDeportivo,x=a.diagnosticoDataset,sel=a.diagnosticoSeleccionados;if(!x||!sel.size||a.importacionCargando)return;
  const objetivos=adObjetivosDiagnosticoSeleccionados();
  if(!objetivos.length)return;
  a.importacionCargando=true;adRedibujar();
  try{const r=await api('/analisis-historico/importacion-historica',{method:'POST',body:JSON.stringify({objetivos})});a.importacionTrabajo=r.trabajo||null;a.diagnosticoSeleccionados.clear();adVigilarImportacion();}
  catch(e){a.importacionTrabajo={estado:'ERROR',actual:0,total:objetivos.length,objetivos:[],error:e.message||'No se pudo iniciar la importación.'};}
  finally{a.importacionCargando=false;adRedibujar();}
}
async function adVigilarImportacion(){
  const a=S.analisisDeportivo,t=a.importacionTrabajo;if(!t?.id||!['EN_COLA','EN_PROCESO'].includes(t.estado))return;
  try{const r=await api('/analisis-historico/importacion-historica/'+encodeURIComponent(t.id));a.importacionTrabajo=r.trabajo||t;adRedibujar();if(['EN_COLA','EN_PROCESO'].includes(a.importacionTrabajo?.estado))setTimeout(adVigilarImportacion,1800);else {adCargarDiagnostico(true);if(a.historialImportacionesAbierto)adCargarHistorialImportaciones(true);}}
  catch(e){a.importacionTrabajo={...t,estado:'ERROR',error:e.message||'No se pudo consultar el progreso.'};adRedibujar();}
}
function adBloqueDiagnostico(){
  const a=S.analisisDeportivo;if(!a.diagnosticoAbierto)return '';
  if(a.diagnosticoCargando)return `<section class="ad-rend"><div class="cargando">Revisando integridad del dataset…</div></section>`;
  const x=a.diagnosticoDataset;if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa “Actualizar diagnóstico” para detectar datos históricos faltantes.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, items=x.items||[],sel=a.diagnosticoSeleccionados;
  return `<section class="ad-rend"><div class="ad-rend-head"><div><h3>Datos que faltan completar</h3><p>Selecciona una o varias liga/temporada y completa solo esos datos históricos.</p></div><button class="btn-plano btn-chico" onclick="adCargarDiagnostico(true)">Actualizar diagnóstico</button></div>
  <div class="ad-rend-kpis"><span><b>${r.partidos||0}</b><small>partidos revisados</small></span><span><b>${r.estadisticasPorCompletar||0}</b><small>estadísticas pendientes</small></span><span><b>${r.eventosPorCompletar||0}</b><small>eventos pendientes</small></span><span><b>${r.prioridadCritica||0}</b><small>prioridad crítica</small></span><span><b>${r.prioridadAlta||0}</b><small>prioridad alta</small></span></div>
  <div class="ad-import-actions"><div><button class="btn-plano btn-chico" onclick="adDiagSeleccionarPendientes()">Seleccionar pendientes</button><button class="btn-plano btn-chico" onclick="adDiagLimpiar()">Limpiar</button><small>${sel.size} seleccionadas · máximo 20 por ejecución</small></div><div><button class="btn-plano btn-chico" ${a.planImportacionCargando?'disabled':''} onclick="adPlanificarImportacion()">${a.planImportacionCargando?'Planificando…':'Planificar automáticamente'}</button><button class="btn-plano btn-chico" ${!sel.size||a.estimacionImportacionCargando?'disabled':''} onclick="adEstimarImportacion()">${a.estimacionImportacionCargando?'Estimando…':'Estimar llamadas'}</button><button class="btn" ${!sel.size||a.importacionCargando?'disabled':''} onclick="adIniciarImportacion()">${a.importacionCargando?'Iniciando…':`Completar seleccionadas (${sel.size})`}</button></div></div>
  ${adBloquePlanImportacion()}
  ${adBloqueEstimacionImportacion()}
  ${adBloqueTrabajoImportacion()}
  <div class="ad-rend-table ad-import-table"><div class="ad-rend-tr ad-rend-th"><span></span><span>Liga / temporada</span><span>Prioridad</span><span>Stats</span><span>Eventos</span></div>${items.slice(0,100).map(i=>{const k=adDiagKey(i),pend=i.prioridad!=='OK';return `<label class="ad-rend-tr"><span><input type="checkbox" ${sel.has(k)?'checked':''} ${pend?'':'disabled'} onchange="adDiagSeleccionar('${adEsc(k)}',this.checked)"></span><span><b>${adEsc(i.liga)}</b><small>${i.temporada} · ${i.partidos} partidos · ${(i.faltantes||[]).join(' · ')||'Dataset completo'}</small></span><span>${adPrioridadBadge(i.prioridad)}</span><span>${i.coberturaApi?.estadisticas?i.estadisticasPendientes:'N/D'}</span><span>${i.coberturaApi?.eventos?i.eventosPendientes:'N/D'}</span></label>`}).join('')}</div>
  <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')} La importación se ejecuta en cola para no saturar API-Football.</div></section>`;
}
async function adCargarDiagnostico(forzar=false){
  const a=S.analisisDeportivo;a.diagnosticoAbierto=true;
  if(a.diagnosticoDataset&&!forzar){adRedibujar();return;}
  a.diagnosticoCargando=true;adRedibujar();
  try{const qs=new URLSearchParams();qs.set('limite','100');if(a.ligaApiId)qs.set('ligaApiId',a.ligaApiId);const r=await api('/analisis-historico/diagnostico-dataset?'+qs.toString());a.diagnosticoDataset=r.diagnostico||{error:'El servidor no devolvió diagnóstico.'};}
  catch(e){a.diagnosticoDataset={error:e.message||'No se pudo revisar el dataset.'};}
  finally{a.diagnosticoCargando=false;adRedibujar();}
}
function adCerrarDiagnostico(){S.analisisDeportivo.diagnosticoAbierto=false;adRedibujar();}

function adCuotaBadge(v){
  const cls=v==='NORMAL'?'ok':v==='CERCA_LIMITE'?'lim':'bad';
  return `<span class="ad-badge ${cls}">${adEsc(v||'DESCONOCIDA')}</span>`;
}
function adBloqueConsumoApi(){
  const a=S.analisisDeportivo;
  if(!a.consumoApiAbierto)return '';
  if(a.consumoApiCargando)return `<section class="ad-rend"><div class="cargando">Cargando consumo de API-Football…</div></section>`;
  const x=a.consumoApi;
  if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa “Actualizar consumo” para ver la telemetría.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, q=x.cuota||{}, rutas=x.porRuta||[], dias=x.porDia||[], errores=x.erroresRecientes||[];
  return `<section class="ad-rend"><div class="ad-rend-head"><div><h3>Consumo de API-Football</h3><p>Telemetría de llamadas HTTP reales. Las respuestas desde caché no consumen cuota.</p></div><div class="ad-api-actions"><select onchange="adCambiarDiasConsumo(this.value)"><option value="1" ${a.consumoApiDias==1?'selected':''}>Hoy</option><option value="7" ${a.consumoApiDias==7?'selected':''}>7 días</option><option value="30" ${a.consumoApiDias==30?'selected':''}>30 días</option><option value="90" ${a.consumoApiDias==90?'selected':''}>90 días</option></select><button class="btn-plano btn-chico" onclick="adCargarConsumoApi(true)">Actualizar</button></div></div>
  <div class="ad-rend-kpis"><span><b>${r.llamadas||0}</b><small>llamadas</small></span><span><b>${r.errores||0}</b><small>errores</small></span><span><b>${r.rateLimit||0}</b><small>HTTP 429</small></span><span><b>${q.restantes===null||q.restantes===undefined?'—':q.restantes}</b><small>cuota restante</small></span><span><b>${q.limite===null||q.limite===undefined?'—':q.limite}</b><small>límite informado</small></span></div>
  <div class="ad-api-cuota"><span>Estado ${adCuotaBadge(q.estado)}</span><small>Reserva del importador: ${x.reservaImportador??10} llamadas · duración media ${r.duracionMediaMs||0} ms</small></div>
  <div class="ad-rend-grid"><div><h4>Por endpoint</h4><div class="ad-rend-table"><div class="ad-rend-tr ad-rend-th"><span>Ruta</span><span>Llamadas</span><span>Errores</span><span>Media</span></div>${rutas.slice(0,12).map(i=>`<div class="ad-rend-tr"><span><b>${adEsc(i.ruta)}</b></span><span>${i.llamadas||0}</span><span>${i.errores||0}</span><span>${i.duracionMediaMs||0} ms</span></div>`).join('')||'<div class="ad-empty ad-empty-mini">Sin llamadas registradas.</div>'}</div></div><div><h4>Últimos días</h4><div class="ad-rend-table"><div class="ad-rend-tr ad-rend-th"><span>Fecha</span><span>Llamadas</span><span>Errores</span><span>429</span></div>${dias.slice(-12).reverse().map(i=>`<div class="ad-rend-tr"><span><b>${adEsc(i.fecha)}</b></span><span>${i.llamadas||0}</span><span>${i.errores||0}</span><span>${i.rateLimit||0}</span></div>`).join('')||'<div class="ad-empty ad-empty-mini">Sin actividad.</div>'}</div></div></div>
  ${errores.length?`<details class="ad-rend-ligas"><summary>Ver errores recientes (${errores.length})</summary><div class="ad-hist-list">${errores.map(e=>`<div class="ad-hist-item"><div class="ad-hist-body"><b>${adEsc(e.ruta)} · HTTP ${e.estadoHttp??'—'}</b><small>${adFechaLocal(e.solicitadoEn)} · ${adEsc(e.codigoError||'ERROR')}</small>${e.detalleError?`<div class="ad-reglas-error">${adEsc(e.detalleError)}</div>`:''}</div></div>`).join('')}</div></details>`:''}
  <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')}</div></section>`;
}
async function adCargarConsumoApi(forzar=false){
  const a=S.analisisDeportivo;a.consumoApiAbierto=true;
  if(a.consumoApi&&!forzar){adRedibujar();return;}
  a.consumoApiCargando=true;adRedibujar();
  try{const r=await api('/analisis-historico/consumo-api-football?dias='+encodeURIComponent(a.consumoApiDias||7));a.consumoApi=r.consumo||{error:'El servidor no devolvió telemetría.'};}
  catch(e){a.consumoApi={error:e.message||'No se pudo cargar el consumo de API-Football.'};}
  finally{a.consumoApiCargando=false;adRedibujar();}
}
function adCerrarConsumoApi(){S.analisisDeportivo.consumoApiAbierto=false;adRedibujar();}
function adCambiarDiasConsumo(v){const a=S.analisisDeportivo;a.consumoApiDias=Math.max(1,Math.min(90,Number(v)||7));a.consumoApi=null;void adCargarConsumoApi(true);}


function adMantenimientoResultadoBadge(v){
  const cls=v==='TRABAJO_CREADO'||v==='SIN_PENDIENTES'?'ok':(v==='TRABAJO_ACTIVO'||v==='CUOTA_DESCONOCIDA'||v==='SIN_EJECUTAR')?'lim':'bad';
  return `<span class="ad-badge ${cls}">${adEsc(v||'SIN_EJECUTAR')}</span>`;
}
function adBloqueMantenimientoProgramado(){
  const a=S.analisisDeportivo;if(!a.mantenimientoProgramadoAbierto)return '';
  if(a.mantenimientoProgramadoCargando)return `<section class="ad-rend"><div class="cargando">Consultando mantenimiento automático…</div></section>`;
  const m=a.mantenimientoProgramado;
  if(!m)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Sin información del programador.</div></section>`;
  return `<section class="ad-rend"><div class="ad-rend-head"><div><h3>Mantenimiento histórico automático</h3><p>Revisa faltantes, arma un plan conservador y crea un trabajo solo cuando corresponde.</p></div><button class="btn-plano btn-chico" onclick="adCargarMantenimientoProgramado(true)">Actualizar</button></div>
  <div class="ad-rend-kpis"><span><b>${m.habilitado?'ACTIVO':'APAGADO'}</b><small>programador</small></span><span><b>${m.cadaHoras||'—'} h</b><small>intervalo</small></span><span><b>${m.maxObjetivos||'—'}</b><small>máx. objetivos</small></span><span><b>${m.proximaEjecucionEn?adFechaLocal(m.proximaEjecucionEn):'—'}</b><small>próxima ejecución</small></span><span><b>${m.ejecutando?'Sí':'No'}</b><small>ejecutando ahora</small></span></div>
  <div class="ad-api-cuota"><span>Último resultado ${adMantenimientoResultadoBadge(m.ultimoResultado)}</span><small>${adEsc(m.ultimoMensaje||'Todavía no se ha ejecutado un ciclo.')}</small></div>
  <div class="ad-hist-meta"><span><small>Último intento</small><b>${m.ultimoIntentoEn?adFechaLocal(m.ultimoIntentoEn):'—'}</b></span><span><small>Última finalización</small><b>${m.ultimaFinalizacionEn?adFechaLocal(m.ultimaFinalizacionEn):'—'}</b></span><span><small>Último trabajo</small><b>${adEsc(m.ultimoTrabajoId||'—')}</b></span><span><small>Cuota desconocida</small><b>${m.ejecutarConCuotaDesconocida?'Permitida':'Bloqueada'}</b></span></div>
  <div class="ad-plan-actions"><button class="btn" ${a.mantenimientoProgramadoEjecutando?'disabled':''} onclick="adEjecutarMantenimientoAhora()">${a.mantenimientoProgramadoEjecutando?'Ejecutando…':'Ejecutar ciclo ahora'}</button><small>La ejecución manual respeta el mismo plan, la cuota y la cola de importaciones.</small></div>
  <div class="ad-note ad-rend-note">La activación automática se controla por variables de entorno del servidor. El Panel solo muestra estado y permite ejecutar un ciclo manual con permiso de gestión.</div></section>`;
}
async function adCargarMantenimientoProgramado(forzar=false){
  const a=S.analisisDeportivo;a.mantenimientoProgramadoAbierto=true;
  if(a.mantenimientoProgramado&&!forzar){adRedibujar();return;}
  a.mantenimientoProgramadoCargando=true;adRedibujar();
  try{const r=await api('/analisis-historico/mantenimiento-programado');a.mantenimientoProgramado=r.mantenimiento||null;}
  catch(e){a.mantenimientoProgramado={ultimoResultado:'ERROR',ultimoMensaje:e.message||'No se pudo consultar el mantenimiento programado.'};}
  finally{a.mantenimientoProgramadoCargando=false;adRedibujar();}
}
function adCerrarMantenimientoProgramado(){S.analisisDeportivo.mantenimientoProgramadoAbierto=false;adRedibujar();}
async function adEjecutarMantenimientoAhora(){
  const a=S.analisisDeportivo;if(a.mantenimientoProgramadoEjecutando)return;
  a.mantenimientoProgramadoEjecutando=true;adRedibujar();
  try{const r=await api('/analisis-historico/mantenimiento-programado/ejecutar',{method:'POST'});a.mantenimientoProgramado=r.mantenimiento||null;avisar(a.mantenimientoProgramado?.ultimoMensaje||'Ciclo de mantenimiento ejecutado.','ok');await adCargarHistorialImportaciones(true);}
  catch(e){avisar(e.message||'No se pudo ejecutar el mantenimiento.','error');}
  finally{a.mantenimientoProgramadoEjecutando=false;adRedibujar();}
}

function adSaludBadge(v){
  const cls=v==='ALTA'?'ok':v==='MEDIA'?'lim':'bad';
  return `<span class="ad-badge ${cls}">${adEsc(v||'—')}</span>`;
}
function adBloqueRendimiento(){
  const a=S.analisisDeportivo;
  if(!a.rendimientoAbierto)return '';
  if(a.rendimientoCargando)return `<section class="ad-rend"><div class="cargando">Calculando salud histórica…</div></section>`;
  const x=a.rendimiento;
  if(!x)return `<section class="ad-rend"><div class="ad-empty ad-empty-mini">Pulsa “Actualizar rendimiento” para revisar cobertura histórica.</div></section>`;
  if(x.error)return `<section class="ad-rend"><div class="ad-reglas-error">${adEsc(x.error)}</div></section>`;
  const r=x.resumen||{}, cats=x.categorias||[], reglas=x.reglas||[], ligas=x.ligas||[];
  const peores=reglas.slice(0,12);
  return `<section class="ad-rend">
    <div class="ad-rend-head"><div><h3>Rendimiento del análisis</h3><p>Salud de datos del motor por categoría y regla. Se revisaron ${r.partidosProcesados||0} partidos históricos.</p></div><button class="btn-plano btn-chico" onclick="adCargarRendimiento(true)">Actualizar</button></div>
    <div class="ad-rend-kpis"><span><b>${Number(r.coberturaPromedioPct||0).toFixed(0)}%</b><small>cobertura promedio</small></span><span><b>${Number(r.utilizablesPct||0).toFixed(0)}%</b><small>utilizable</small></span><span><b>${Number(r.limitadasPct||0).toFixed(0)}%</b><small>limitado</small></span><span><b>${Number(r.descartadasPct||0).toFixed(0)}%</b><small>descartado</small></span><span><b>${r.reglasEvaluadas||0}</b><small>reglas evaluadas</small></span></div>
    <div class="ad-rend-grid"><div><h4>Por categoría</h4><div class="ad-rend-table"><div class="ad-rend-tr ad-rend-th"><span>Categoría</span><span>Salud</span><span>Usable</span><span>Cobertura</span></div>${cats.map(c=>`<div class="ad-rend-tr"><span><b>${adEsc(c.categoria)}</b><small>${c.reglas} reglas · ${c.evaluaciones} evaluaciones</small></span><span>${adSaludBadge(c.salud)}</span><span>${Number(c.utilizablesPct||0).toFixed(0)}%</span><span>${Number(c.coberturaPromedioPct||0).toFixed(0)}%</span></div>`).join('')}</div></div>
    <div><h4>Reglas que necesitan más datos</h4><div class="ad-rend-table"><div class="ad-rend-tr ad-rend-th"><span>Regla</span><span>Salud</span><span>Usable</span><span>Cobertura</span></div>${peores.map(q=>`<div class="ad-rend-tr"><span><b>${adEsc(q.codigo)}</b><small>${adEsc(q.nombre)}</small></span><span>${adSaludBadge(q.salud)}</span><span>${Number(q.utilizablesPct||0).toFixed(0)}%</span><span>${Number(q.coberturaPromedioPct||0).toFixed(0)}%</span></div>`).join('')}</div></div></div>
    ${ligas.length>1?`<details class="ad-rend-ligas"><summary>Ver rendimiento por liga/temporada (${ligas.length})</summary><div class="ad-rend-table"><div class="ad-rend-tr ad-rend-th"><span>Liga</span><span>Temporada</span><span>Usable</span><span>Cobertura</span></div>${ligas.map(l=>`<div class="ad-rend-tr"><span><b>${adEsc(l.liga)}</b><small>${l.partidosProcesados} partidos</small></span><span>${l.temporada}</span><span>${Number(l.utilizablesPct||0).toFixed(0)}%</span><span>${Number(l.coberturaPromedioPct||0).toFixed(0)}%</span></div>`).join('')}</div></details>`:''}
    <div class="ad-note ad-rend-note">${adEsc(x.aviso||'')}</div>
  </section>`;
}
async function adCargarRendimiento(forzar=false){
  const a=S.analisisDeportivo;
  a.rendimientoAbierto=true;
  if(a.rendimiento&&!forzar){adRedibujar();return;}
  a.rendimientoCargando=true; adRedibujar();
  try{
    const qs=new URLSearchParams();
    qs.set('muestra',String(a.muestra)); qs.set('limite',String(a.limiteRendimiento||40));
    if(a.ligaApiId)qs.set('ligaApiId',a.ligaApiId);
    const r=await api('/analisis-historico/rendimiento/calidad?'+qs.toString());
    a.rendimiento=r.rendimiento||{error:'El servidor no devolvió el resumen de rendimiento.'};
  }catch(e){a.rendimiento={error:e.message||'No se pudo calcular el rendimiento.'};}
  finally{a.rendimientoCargando=false;adRedibujar();}
}
function adCerrarRendimiento(){S.analisisDeportivo.rendimientoAbierto=false;adRedibujar();}

async function adCargarConfiguracionFiltro(){
  const a=S.analisisDeportivo;
  const r=await api('/analisis-historico/configuracion-filtro');
  const ids=(r.configuracion?.ligaApiIds||[]).map(String);
  const activas=new Set((a.ligasActivas||[]).map(l=>String(l.api_id??l.apiId??'')).filter(Boolean));
  a.ligaApiIds=new Set(ids.filter(id=>activas.has(id)));
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
  a.ligaApiId=a.ligaApiIds.size===1?[...a.ligaApiIds][0]:'';
  a.configuracionFiltroCargada=true;
}
async function adGuardarConfiguracionFiltro(){
  const a=S.analisisDeportivo;
  const r=await api('/analisis-historico/configuracion-filtro',{
    method:'PUT',
    body:JSON.stringify({ligaApiIds:[...a.ligaApiIds]})
  });
  const ids=(r.configuracion?.ligaApiIds||[]).map(String);
  a.ligaApiIds=new Set(ids);
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
  a.ligaApiId=a.ligaApiIds.size===1?[...a.ligaApiIds][0]:'';
  a.configuracionFiltroCargada=true;
  return r.configuracion;
}
async function adLimpiarLigasAplicadas(){
  const a=S.analisisDeportivo;
  a.ligaApiIds.clear();
  a.ligaApiIdsBorrador.clear();
  a.ligaApiId='';
  a.ligaDropdownAbierto=false;
  a.ligaBuscar='';
  adDepurarSeleccionPorLigas();
  adRedibujar();
  try{await adGuardarConfiguracionFiltro();}
  catch(e){avisar(e.message||'No se pudo guardar el filtro de ligas.','error');}
}

async function adCargarLigasActivas(){
  const a=S.analisisDeportivo;
  const qs=new URLSearchParams({soloSeleccionadas:'true',limite:'100',desde:'0'});
  const r=await api('/deportes?'+qs.toString());
  a.ligasActivas=(r.ligas||[]).filter(l=>l&&l.seleccionada!==false);
  const validas=new Set(a.ligasActivas.map(l=>String(l.api_id??l.apiId??'')).filter(Boolean));
  a.ligaApiIds=new Set([...a.ligaApiIds].filter(id=>validas.has(String(id))));
  a.ligaApiIdsBorrador=new Set(a.ligaApiIds);
}
async function adCargarPartidos(){
  const a=S.analisisDeportivo;
  adInicializarRangoFechas();
  const qs=new URLSearchParams();
  qs.set('fechaDesde',a.fechaInicio);
  qs.set('fechaHasta',a.fechaFin);
  qs.set('limite','2000');
  const r=await api('/analisis-historico/partidos-disponibles?'+qs.toString());
  a.partidos=r.partidos||[];
  const validos=new Set(a.partidos.map(p=>String(p.fixtureId)));
  for(const id of [...a.seleccionados]) if(!validos.has(id)) a.seleccionados.delete(id);
}

function adEstadoBadge(x){
  const c=x==='UTILIZABLE'?'ok':x==='LIMITADO'?'lim':'bad';
  return `<span class="ad-badge ${c}">${adEsc(x)}</span>`;
}
function adDificultadBadge(x){
  const cls=x==='BAJA'?'ok':x==='MEDIA'?'lim':'bad';
  return `<span class="ad-badge ${cls}">${adEsc((x||'').replace('_',' '))}</span>`;
}
function adValorMetrica(v){
  if(v===null||v===undefined)return '—';
  if(typeof v==='number')return Number.isInteger(v)?String(v):v.toFixed(2);
  if(typeof v==='string'||typeof v==='boolean')return adEsc(String(v));
  if(Array.isArray(v))return adEsc(v.slice(0,4).join(' · '));
  if(typeof v==='object'){
    return Object.entries(v).filter(([,x])=>x!==null&&x!==undefined).slice(0,4)
      .map(([k,x])=>`${adEsc(k)}: ${adEsc(typeof x==='number'?Number(x).toFixed(2).replace(/\.00$/,''):String(x))}`).join(' · ') || '—';
  }
  return adEsc(String(v));
}
function adCategoriasMetricas(metricas){
  return ['Todas',...new Set((metricas||[]).map(x=>x.categoria).filter(Boolean))];
}
function adMetricasFiltradas(m){
  const a=S.analisisDeportivo;
  return (m.metricas||[]).filter(x =>
    (a.filtroCategoriaReglas==='Todas'||x.categoria===a.filtroCategoriaReglas) &&
    (a.filtroEstadoReglas==='TODOS'||x.estadoDatos===a.filtroEstadoReglas)
  );
}
function adBloqueMetricas(fixtureId){
  const a=S.analisisDeportivo, id=String(fixtureId);
  if(a.metricasCargando.has(id)) return `<div class="ad-reglas-loading"><span class="giro"></span> Cargando métricas de reglas…</div>`;
  const m=a.metricasPorFixture[id];
  if(!m) return `<div class="ad-reglas-accion"><button class="btn-plano btn-chico" onclick="adCargarMetricas('${adEsc(id)}')">Ver métricas de las 79 reglas</button><small>Se cargan bajo demanda para no ejecutar consultas innecesarias.</small></div>`;
  if(m.error) return `<div class="ad-reglas-error">${adEsc(m.error)} <button class="btn-plano btn-chico" onclick="adCargarMetricas('${adEsc(id)}',true)">Reintentar</button></div>`;

  const cats=adCategoriasMetricas(m), rows=adMetricasFiltradas(m), r=m.resumen||{};
  return `<div class="ad-reglas">
    <div class="ad-reglas-head"><div><strong>Métricas de reglas</strong><small>${r.reglas||m.metricas.length} reglas · ${r.conMetrica||0} con métrica técnica</small></div><div class="ad-reglas-resumen"><span class="ok">${r.utilizables||0} utilizables</span><span class="lim">${r.limitadas||0} limitadas</span><span class="bad">${r.descartadas||0} descartadas</span></div></div>
    <div class="ad-reglas-filtros"><select onchange="adFiltroCategoriaReglas(this.value)">${cats.map(c=>`<option value="${adEsc(c)}" ${a.filtroCategoriaReglas===c?'selected':''}>${adEsc(c)}</option>`).join('')}</select><select onchange="adFiltroEstadoReglas(this.value)"><option value="TODOS">Todos los estados</option><option value="UTILIZABLE" ${a.filtroEstadoReglas==='UTILIZABLE'?'selected':''}>Utilizable</option><option value="LIMITADO" ${a.filtroEstadoReglas==='LIMITADO'?'selected':''}>Limitado</option><option value="DESCARTADO" ${a.filtroEstadoReglas==='DESCARTADO'?'selected':''}>Descartado</option></select><span>${rows.length} visibles</span></div>
    <div class="ad-reglas-lista">${rows.length?rows.map(x=>`<div class="ad-regla-row"><div class="ad-regla-id"><b>${adEsc(x.codigo)}</b><small>${adEsc(x.categoria)}</small></div><div class="ad-regla-nombre"><strong>${adEsc(x.nombre)}</strong><small>${adEsc(x.tipoMetrica)} · ${adEsc(x.unidad)}</small><small>${adEsc(x.detalle)}</small></div><div>${adEstadoBadge(x.estadoDatos)}</div><div class="ad-regla-cob"><b>${Number(x.coberturaPct||0).toFixed(0)}%</b><small>cobertura</small></div><div class="ad-regla-datos"><small>Local</small>${adValorMetrica(x.contextoLocal??x.local)}<small>Visitante</small>${adValorMetrica(x.contextoVisitante??x.visitante)}</div></div>`).join(''):'<div class="ad-empty ad-empty-mini">No hay reglas para los filtros elegidos.</div>'}</div>
  </div>`;
}
async function adCargarMetricas(fixtureId,forzar=false){
  const a=S.analisisDeportivo, id=String(fixtureId);
  if(a.metricasCargando.has(id))return;
  if(a.metricasPorFixture[id]&&!forzar)return;
  a.metricasCargando.add(id); delete a.metricasPorFixture[id]; adRedibujar();
  try{
    const r=await api(`/analisis-historico/${encodeURIComponent(id)}/metricas-reglas?muestra=${a.muestra}`);
    a.metricasPorFixture[id]=r.metricas||{error:'El servidor no devolvió métricas.'};
  }catch(e){ a.metricasPorFixture[id]={error:e.message||'No se pudieron cargar las métricas.'}; }
  finally{ a.metricasCargando.delete(id); adRedibujar(); }
}


const AD_FAMILIAS_DATASET=['RESULTADO','GOLES','TIEMPOS','CORNERS','TARJETAS','TIROS','POSESION','DISCIPLINA','EVENTOS'];
function adDatasetFamilia(fixtureId){return S.analisisDeportivo.datasetFamiliaPorFixture[String(fixtureId)]||'GOLES';}
function adCambiarFamiliaDataset(fixtureId,v){
  const a=S.analisisDeportivo,id=String(fixtureId);a.datasetFamiliaPorFixture[id]=String(v||'GOLES');delete a.datasetsEspecializados[id];adRedibujar();
}
function adFormatoMetrica(v){if(v===null||v===undefined)return '—';if(typeof v==='number')return Number.isInteger(v)?String(v):Number(v).toFixed(2);return adEsc(v);}
function adSerieDataset(nombre,x){
  const m=x?.metricas||{}, entradas=Object.entries(m).slice(0,8);
  return `<div class="ad-ds-serie"><div class="ad-ds-serie-head"><b>${adEsc(nombre)}</b><span>${Number(x?.coberturaPct||0).toFixed(0)}% cobertura</span></div><small>${x?.muestraReal||0}/${x?.muestraSolicitada||0} partidos · ${x?.observacionesUtiles||0} útiles</small><div class="ad-ds-metricas">${entradas.length?entradas.map(([k,v])=>`<span><small>${adEsc(k.replaceAll('_',' '))}</small><b>${adFormatoMetrica(v)}</b></span>`).join(''):'<em>Sin métricas suficientes.</em>'}</div></div>`;
}
function adBloqueDatasetEspecializado(fixtureId){
  const a=S.analisisDeportivo,id=String(fixtureId),familia=adDatasetFamilia(id),d=a.datasetsEspecializados[id],cargando=a.datasetsEspecializadosCargando.has(id);
  return `<div class="ad-dataset"><div class="ad-dataset-head"><div><strong>Dataset especializado</strong><small>Usa únicamente los campos necesarios para cada familia estadística.</small></div><div><select onchange="adCambiarFamiliaDataset('${adEsc(id)}',this.value)">${AD_FAMILIAS_DATASET.map(f=>`<option value="${f}" ${familia===f?'selected':''}>${f}</option>`).join('')}</select><button class="btn-plano btn-chico" ${cargando?'disabled':''} onclick="adCargarDatasetEspecializado('${adEsc(id)}')">${cargando?'Cargando…':d?'Actualizar':'Ver dataset'}</button>${d?`<button class="btn-plano btn-chico" onclick="adCerrarDatasetEspecializado('${adEsc(id)}')">Ocultar</button>`:''}</div></div>${cargando?'<div class="ad-reglas-loading">Construyendo dataset especializado…</div>':d?.error?`<div class="ad-reglas-error">${adEsc(d.error)}</div>`:d?`<div class="ad-ds-resumen"><span><small>Familia</small><b>${adEsc(d.familia)}</b></span><span><small>Cobertura general</small><b>${Number(d.coberturaGeneralPct||0).toFixed(0)}%</b></span><span><small>Datos requeridos</small><b>${adEsc((d.datosRequeridos||[]).join(', '))}</b></span></div><div class="ad-ds-grid">${adSerieDataset('Local · general',d.series?.local)}${adSerieDataset('Visitante · general',d.series?.visitante)}${adSerieDataset('Local · en casa',d.series?.localEnCasa)}${adSerieDataset('Visitante · fuera',d.series?.visitanteFuera)}</div><div class="ad-note ad-ds-note">${adEsc(d.aviso||'')}</div>`:''}</div>`;
}
async function adCargarDatasetEspecializado(fixtureId){
  const a=S.analisisDeportivo,id=String(fixtureId),familia=adDatasetFamilia(id);a.datasetsEspecializadosCargando.add(id);adRedibujar();
  try{const r=await api('/analisis-historico/'+encodeURIComponent(id)+'/dataset-especializado?familia='+encodeURIComponent(familia)+'&muestra='+encodeURIComponent(a.muestra||20));a.datasetsEspecializados[id]=r.dataset||{error:'El servidor no devolvió el dataset.'};}
  catch(e){a.datasetsEspecializados[id]={error:e.message||'No se pudo construir el dataset especializado.'};}
  finally{a.datasetsEspecializadosCargando.delete(id);adRedibujar();}
}
function adCerrarDatasetEspecializado(fixtureId){delete S.analisisDeportivo.datasetsEspecializados[String(fixtureId)];adRedibujar();}

function adResultadoCard(r){
  if(!r.ok) return `<article class="ad-result error"><div><strong>Fixture ${adEsc(r.fixtureId)}</strong><p>${adEsc(r.error||'No se pudo analizar')}</p></div></article>`;
  const a=r.analisis, p=a.partido, c=a.condiciones||[];
  return `<article class="ad-result">
    <div class="ad-result-head"><div><strong>${adEsc(p.local.nombre)} <span>vs</span> ${adEsc(p.visitante.nombre)}</strong><small>Fixture ${adEsc(a.fixtureId)} · corte ${adFechaLocal(a.fechaCorte)}</small></div><div class="ad-conf"><b>${Number(a.resumen.confianzaDatosGeneral||0).toFixed(0)}%</b><small>calidad de datos</small></div></div>
    <div class="ad-metrics"><span><b>${a.resumen.utilizables}</b> utilizables</span><span><b>${a.resumen.limitadas}</b> limitadas</span><span><b>${a.resumen.descartadas}</b> descartadas</span><span><b>${Number(a.calidadGeneral.coberturaEstadisticasPct||0).toFixed(0)}%</b> cobertura stats</span></div>
    <details class="ad-diagnostico"><summary>Diagnóstico general (${c.length})</summary><div class="ad-condiciones">${c.map(x=>`<div class="ad-cond"><div><strong>${adEsc(x.nombre)}</strong><small>${adEsc(x.categoria)} · muestra ${x.muestra}</small></div><div>${adDificultadBadge(x.nivel)} ${adEstadoBadge(x.estadoDato)}</div><div class="ad-num"><b>${Number(x.confianzaDatos||0).toFixed(0)}%</b><small>calidad</small></div></div>`).join('')}</div></details>
    ${adBloqueMetricas(a.fixtureId)}
    ${adBloqueDatasetEspecializado(a.fixtureId)}
  </article>`;
}

function dibujarAnalisisDeportivo(){
  const a=S.analisisDeportivo, rows=adPartidosFiltrados(), ligas=adLigas();
  adInicializarRangoFechas();

  const seleccionadas=[...a.ligaApiIds];
  const chips=seleccionadas.map(id=>{
    const n=ligas.find(([x])=>x===id)?.[1]||id;
    return `<span class="ad-liga-chip">${adEsc(n)} <button type="button" onclick="event.stopPropagation();adQuitarLiga('${adEsc(id)}')" title="Quitar">×</button></span>`;
  }).join('');

  const qLiga=(a.ligaBuscar||'').trim().toLowerCase();
  const ligasDropdown=ligas.filter(([,n])=>!qLiga||n.toLowerCase().includes(qLiga));
  const dropdown=a.ligaDropdownAbierto?`
    <div class="ad-liga-dropdown" onclick="event.stopPropagation()">
      <div class="ad-liga-search-row">
        <input id="ad-liga-buscar" type="search" placeholder="Buscar liga..." value="${adEsc(a.ligaBuscar)}" oninput="adLigaBuscar(this.value)">
        <span>${ligas.length} ligas disponibles</span>
      </div>
      <label class="ad-liga-todos">
        <input type="checkbox" ${ligas.length>0&&ligas.every(([id])=>a.ligaApiIdsBorrador.has(String(id)))?'checked':''} onchange="adSeleccionarTodasLigas()">
        <span>Seleccionar todas</span>
      </label>
      <div class="ad-ligas-opciones" id="ad-ligas-opciones">
        ${ligas.map(([id,n])=>{
          const marcado=a.ligaApiIdsBorrador.has(id);
          const cantidad=a.partidos.filter(p=>String(p.ligaApiId)===id).length;
          return `<label class="ad-liga-opcion ${marcado?'sel':''}" data-nombre="${adEsc(n)}">
            <input type="checkbox" ${marcado?'checked':''} onchange="adToggleLiga('${adEsc(id)}',this.checked)">
            <span>${adEsc(n)}</span><small>${cantidad}</small>
          </label>`;
        }).join('')}
        <div id="ad-liga-sin-resultados" class="ad-liga-sin" hidden>No hay ligas que coincidan con la búsqueda.</div>
      </div>
      <div class="ad-liga-pie">
        <strong>${a.ligaApiIdsBorrador.size} liga${a.ligaApiIdsBorrador.size===1?'':'s'} seleccionada${a.ligaApiIdsBorrador.size===1?'':'s'}</strong>
        <div><button class="ad-link" type="button" onclick="adLimpiarLigasBorrador()">Limpiar</button><button class="btn-plano" type="button" onclick="adCerrarLigas()">Cancelar</button><button class="btn" type="button" onclick="adAplicarLigas()">Aplicar</button></div>
      </div>
    </div>`:'';

  document.getElementById('contenido').innerHTML=`
  <style id="ad-estilos">
    .ad-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:16px}.ad-head h1{margin:0 0 4px}.ad-head p{margin:0;color:#64748b}
    .ad-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 18px}.ad-step{padding:10px 12px;border:1px solid #e2e8f0;border-radius:10px;background:#fff;font-size:12px;color:#64748b}.ad-step.act{border-color:#86c7aa;background:#f1fbf6;color:#17664b;font-weight:700}
    .ad-filtros-card{position:relative;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin-bottom:12px;overflow:visible;z-index:20}
    .ad-filtros-grid{display:grid;grid-template-columns:minmax(390px,.9fr) minmax(360px,1.1fr);gap:18px;align-items:end}.ad-filtro-label{display:block;font-size:12px;font-weight:700;color:#24352f;margin:0 0 7px}
    .ad-rango{display:grid;grid-template-columns:1fr 28px 1fr;gap:8px;align-items:center}.ad-rango i{text-align:center;font-style:normal;color:#64748b;font-size:18px}
    .ad-fecha-box{position:relative}.ad-fecha-box input{width:100%;box-sizing:border-box;border:1px solid #dbe3e8;border-radius:10px;padding:10px 10px 10px;background:#fff;font-size:13px}.ad-fecha-box small{display:block;color:#7b8794;font-size:9px;margin-top:4px}
    .ad-liga-wrap{position:relative}.ad-liga-control{min-height:42px;border:1px solid #86c7aa;border-radius:10px;background:#fff;display:flex;align-items:center;padding:6px 48px 6px 10px;cursor:pointer;box-shadow:0 0 0 3px rgba(33,163,102,.06)}.ad-liga-control .placeholder{color:#7b8794;font-size:12px}.ad-liga-caret{position:absolute;right:12px;bottom:7px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;color:#17664b;background:#f4faf7;pointer-events:none;transition:transform .18s ease,background .18s ease}.ad-liga-caret.abierto{transform:rotate(180deg);background:#eaf8f1}.ad-liga-caret svg{display:block}
    .ad-ligas-seleccionadas{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;margin-top:10px;padding-top:9px;border-top:1px solid #eef2f1}.ad-ligas-scroll{display:flex;align-items:center;gap:7px;overflow-x:auto;overflow-y:hidden;white-space:nowrap;min-width:0;padding:2px 2px 5px;scrollbar-width:thin}.ad-ligas-vacio{font-size:10px;color:#94a3b8}.ad-ligas-limpiar{white-space:nowrap}
    .ad-liga-chip{display:inline-flex;flex:0 0 auto;align-items:center;gap:5px;background:#eaf8f1;color:#17664b;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:700;max-width:220px}.ad-liga-chip button{border:0;background:transparent;color:#17664b;cursor:pointer;font-size:14px;line-height:1;padding:0}
    .ad-dropdown-ancla{position:relative;height:0;z-index:1000;margin:0}.ad-liga-dropdown{position:absolute;right:0;left:auto;top:1px;width:min(760px,60vw);background:#fff;border:1px solid #dfe7e3;border-radius:10px;box-shadow:0 14px 36px rgba(15,23,42,.16);z-index:1000;overflow:hidden}.ad-liga-search-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px;border-bottom:1px solid #eef2f1}.ad-liga-search-row input{width:100%;border:1px solid #dbe3e8;border-radius:9px;padding:9px 10px}.ad-liga-search-row span{font-size:10px;color:#64748b;white-space:nowrap}
    .ad-liga-todos{display:grid;grid-template-columns:24px 1fr;gap:8px;align-items:center;padding:9px 14px;background:#eef8f4;border-bottom:1px solid #dfeee7;cursor:pointer;color:#17664b;font-size:11px;font-weight:800}.ad-liga-todos input{width:16px;height:16px}
    .ad-ligas-opciones{max-height:310px;overflow-y:auto;padding:5px}.ad-liga-opcion{display:grid;grid-template-columns:22px 1fr auto;gap:7px;align-items:center;padding:6px 9px;border-radius:7px;cursor:pointer}.ad-liga-opcion:hover{background:#f8faf9}.ad-liga-opcion.sel{background:#eef8f4}.ad-liga-opcion input{width:15px;height:15px}.ad-liga-opcion span{font-size:10px;line-height:1.2}.ad-liga-opcion small{font-size:8px;color:#64748b}.ad-liga-sin{padding:24px;text-align:center;color:#64748b;font-size:11px}
    .ad-liga-pie{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px;border-top:1px solid #eef2f1;background:#fff}.ad-liga-pie strong{font-size:10px}.ad-liga-pie>div{display:flex;gap:7px;align-items:center}.ad-link{border:0;background:transparent;color:#17664b;text-decoration:underline;cursor:pointer;font-size:10px}
    .ad-filtro-actions{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:12px;padding-top:10px;border-top:1px solid #eef2f1}.ad-filtro-actions>div{display:flex;gap:8px}.ad-filtro-actions .ad-buscar{min-width:260px;border:1px solid #dbe3e8;border-radius:9px;padding:9px 10px}
    .ad-grid{display:grid;grid-template-columns:minmax(0,.9fr) minmax(520px,1.1fr);gap:16px}.ad-panel{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:14px;min-width:0}
    .ad-partidos-buscar{display:flex;gap:7px;align-items:center;margin-bottom:8px}.ad-partidos-buscar input{width:100%;min-width:0;border:1px solid #dbe3e8;border-radius:9px;padding:8px 10px;background:#fff;font-size:11px}
    .ad-partidos-todos{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:7px 10px;margin-bottom:6px;border:1px solid #dfeee7;border-radius:8px;background:#f2faf6}.ad-partidos-todos label{display:flex;align-items:center;gap:8px;color:#17664b;font-size:10px;font-weight:800;cursor:pointer}.ad-partidos-todos input{width:15px;height:15px}.ad-partidos-todos small{font-size:8px;color:#64748b}
    .ad-list{border:1px solid #edf0f2;border-radius:9px;overflow-x:hidden;overflow-y:auto;max-height:520px;scrollbar-width:thin}.ad-row{display:grid;grid-template-columns:28px 1fr 128px;gap:8px;align-items:center;padding:7px 9px;border-bottom:1px solid #eef2f3}.ad-row:last-child{border-bottom:0}.ad-row:hover{background:#fafdfb}.ad-row>input{width:14px;height:14px}.ad-match strong{display:block;font-size:11px;line-height:1.25}.ad-match small,.ad-time small{display:block;color:#7b8794;margin-top:2px;font-size:8px}.ad-time{text-align:right;font-size:10px;line-height:1.25}.ad-empty{padding:30px;text-align:center;color:#64748b}.ad-empty-mini{padding:18px}
    .ad-run{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #edf0f2;margin-top:12px;padding-top:12px;gap:12px}.ad-run-left{display:flex;align-items:center;gap:8px}.ad-run input{width:68px;border:1px solid #dbe3e8;border-radius:8px;padding:8px}
    .ad-results{display:flex;flex-direction:column;gap:10px;max-height:760px;overflow:auto;padding-right:3px}.ad-result{border:1px solid #e6ece9;border-radius:11px;padding:11px;background:#fff}.ad-result.error{border-color:#f3caca;background:#fffafa}.ad-result-head{display:flex;justify-content:space-between;gap:10px}.ad-result-head strong{font-size:13px}.ad-result-head strong span{color:#94a3b8;font-weight:500;margin:0 3px}.ad-result-head small{display:block;color:#64748b;margin-top:4px}.ad-conf{text-align:right}.ad-conf b{display:block;font-size:18px;color:#17664b}.ad-conf small{font-size:10px;color:#64748b}
    .ad-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.ad-metrics span{background:#f8faf9;border-radius:7px;padding:7px;font-size:10px;color:#64748b}.ad-metrics b{display:block;font-size:13px;color:#24352f}.ad-note{font-size:11px;color:#64748b;background:#f8faf9;padding:9px;border-radius:8px;margin-bottom:10px}
    .ad-badge{display:inline-block;padding:3px 5px;border-radius:6px;font-size:8px;font-weight:700}.ad-badge.ok{background:#e9f7ef;color:#17704d}.ad-badge.lim{background:#fff4d8;color:#8a6410}.ad-badge.bad{background:#fdebec;color:#a43b44}
    .ad-diagnostico{border-top:1px solid #edf0f2;padding-top:8px}.ad-diagnostico summary{cursor:pointer;font-size:11px;font-weight:700;color:#52645d}.ad-condiciones{display:flex;flex-direction:column;gap:6px;margin-top:8px}.ad-cond{display:grid;grid-template-columns:1fr auto 52px;gap:8px;align-items:center;border-top:1px solid #f0f2f1;padding-top:7px}.ad-cond strong{display:block;font-size:11px}.ad-cond small{display:block;color:#7b8794;font-size:9px;margin-top:2px}.ad-num{text-align:right}.ad-num b{display:block;font-size:12px}
    .ad-reglas{margin-top:10px;border-top:1px solid #e8edeb;padding-top:10px}.ad-reglas-accion{display:flex;align-items:center;gap:10px;margin-top:10px;padding:9px;background:#f8faf9;border-radius:8px}.ad-reglas-accion small{color:#64748b}.ad-reglas-loading,.ad-reglas-error{margin-top:10px;padding:10px;border-radius:8px;background:#f8faf9;color:#64748b}.ad-reglas-error{background:#fff5f5;color:#a43b44}
    .ad-reglas-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ad-reglas-head small{display:block;color:#64748b;margin-top:3px}.ad-reglas-resumen{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.ad-reglas-resumen span{font-size:9px;font-weight:700;padding:4px 6px;border-radius:6px}.ad-reglas-resumen .ok{background:#e9f7ef;color:#17704d}.ad-reglas-resumen .lim{background:#fff4d8;color:#8a6410}.ad-reglas-resumen .bad{background:#fdebec;color:#a43b44}
    .ad-reglas-filtros{display:grid;grid-template-columns:1fr 150px auto;gap:7px;align-items:center;margin:9px 0}.ad-reglas-filtros select{width:100%;border:1px solid #dbe3e8;border-radius:9px;padding:7px 8px;background:#fff;font-size:11px}.ad-reglas-filtros span{font-size:10px;color:#64748b;white-space:nowrap}.ad-reglas-lista{border:1px solid #edf1ef;border-radius:9px;overflow:hidden;max-height:420px;overflow-y:auto}
    .ad-regla-row{display:grid;grid-template-columns:90px minmax(170px,1fr) 76px 55px minmax(150px,.8fr);gap:8px;align-items:center;padding:8px;border-bottom:1px solid #f0f2f1}.ad-regla-row:last-child{border-bottom:0}.ad-regla-id b,.ad-regla-nombre strong{display:block;font-size:10px}.ad-regla-id small,.ad-regla-nombre small,.ad-regla-cob small,.ad-regla-datos small{display:block;font-size:8px;color:#7b8794;margin-top:2px}.ad-regla-cob{text-align:right}.ad-regla-cob b{font-size:11px}.ad-regla-datos{font-size:9px;color:#34483f;line-height:1.35;overflow-wrap:anywhere}
    .ad-dataset{margin-top:10px;border-top:1px solid #e8edeb;padding-top:10px}.ad-dataset-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.ad-dataset-head strong{display:block;font-size:11px}.ad-dataset-head small{display:block;font-size:9px;color:#64748b;margin-top:2px}.ad-dataset-head>div:last-child{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.ad-dataset-head select{border:1px solid #dbe3e8;border-radius:8px;padding:6px 8px;background:#fff;font-size:10px}.ad-ds-resumen{display:grid;grid-template-columns:120px 120px 1fr;gap:7px;margin:9px 0}.ad-ds-resumen span{background:#f8faf9;border-radius:8px;padding:7px}.ad-ds-resumen small{display:block;color:#64748b;font-size:8px}.ad-ds-resumen b{display:block;font-size:10px;margin-top:2px}.ad-ds-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.ad-ds-serie{border:1px solid #edf1ef;border-radius:8px;padding:8px}.ad-ds-serie-head{display:flex;justify-content:space-between;gap:8px;font-size:10px}.ad-ds-serie-head span{color:#17664b;font-weight:700}.ad-ds-serie>small{display:block;color:#64748b;font-size:8px;margin-top:3px}.ad-ds-metricas{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:7px}.ad-ds-metricas span{background:#fafcfb;border-radius:6px;padding:5px}.ad-ds-metricas small{display:block;color:#7b8794;font-size:7px;overflow-wrap:anywhere}.ad-ds-metricas b{font-size:9px}.ad-ds-note{margin:8px 0 0}
    @media(max-width:1000px){.ad-filtros-grid,.ad-grid{grid-template-columns:1fr}.ad-filtro-actions{align-items:stretch;flex-direction:column}.ad-filtro-actions .ad-buscar{min-width:0;width:100%;box-sizing:border-box}.ad-liga-dropdown{width:100%;left:0;right:0}.ad-ligas-seleccionadas{grid-template-columns:minmax(0,1fr) auto}}
    @media(max-width:700px){.ad-flow{grid-template-columns:1fr 1fr}.ad-rango{grid-template-columns:1fr}.ad-rango i{transform:rotate(90deg)}.ad-row{grid-template-columns:28px 1fr}.ad-time{grid-column:2;text-align:left}.ad-liga-pie{align-items:flex-start;flex-direction:column}.ad-liga-pie>div{width:100%;justify-content:flex-end}}
  </style>
  <div class="ad-head"><div><h1>Análisis deportivo</h1><p>Selecciona uno o varios partidos y consulta únicamente el análisis técnico de cada encuentro.</p></div></div>
  <div class="ad-flow"><div class="ad-step act">1 · Seleccionar partidos</div><div class="ad-step ${a.resultados.length?'act':''}">2 · Analizar</div><div class="ad-step ${a.resultados.length?'act':''}">3 · Ver resultados</div><div class="ad-step ${Object.keys(a.metricasPorFixture).length?'act':''}">4 · Revisar reglas</div></div>

  <section class="ad-filtros-card">
    <div class="ad-filtros-grid">
      <div>
        <label class="ad-filtro-label">Rango de fechas</label>
        <div class="ad-rango">
          <div class="ad-fecha-box"><input type="date" value="${adEsc(a.fechaInicio)}" onchange="adCambiarFechaInicio(this.value)"><small>Fecha inicial${a.fechaInicio===adFechaYmdLocal()?' (hoy)':''}</small></div>
          <i>→</i>
          <div class="ad-fecha-box"><input type="date" min="${adEsc(a.fechaInicio)}" value="${adEsc(a.fechaFin)}" onchange="adCambiarFechaFin(this.value)"><small>Fecha final${a.fechaFin===adFinMesYmd(a.fechaInicio)?' (fin de mes)':''}</small></div>
        </div>
      </div>
      <div class="ad-liga-wrap">
        <label class="ad-filtro-label">Ligas (selecciona una o varias)</label>
        <div class="ad-liga-control" onclick="adAbrirLigas()">
          <span class="placeholder">Buscar y seleccionar ligas...</span>
          <span class="ad-liga-caret ${a.ligaDropdownAbierto?'abierto':''}" aria-hidden="true">
            <svg viewBox="0 0 20 20" width="18" height="18">
              <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
        </div>
      </div>
    </div>

    <div class="ad-ligas-seleccionadas">
      <div class="ad-ligas-scroll">
        ${chips||'<span class="ad-ligas-vacio">Ninguna liga seleccionada</span>'}
      </div>
      ${seleccionadas.length?'<button class="btn-plano ad-ligas-limpiar" type="button" onclick="event.stopPropagation();adLimpiarLigasAplicadas()">Limpiar selección</button>':''}
    </div>

    <div class="ad-dropdown-ancla">
      ${dropdown}
    </div>

  </section>

  <div class="ad-grid"><section class="ad-panel">
    <div class="ad-partidos-buscar">
      <input type="search" placeholder="Buscar equipo o liga..." value="${adEsc(a.buscar)}" oninput="adBuscar(this.value)">
      ${a.buscar?'<button class="btn-plano btn-chico" type="button" onclick="adBuscar(\'\')">Limpiar</button>':''}
    </div>
    <div class="ad-partidos-todos">
      <label><input type="checkbox" ${rows.length>0&&rows.every(p=>a.seleccionados.has(String(p.fixtureId)))?'checked':''} onchange="adSeleccionarTodos()"><span>Seleccionar todos</span></label>
      <small>${rows.filter(p=>a.seleccionados.has(String(p.fixtureId))).length} de ${rows.length} seleccionados</small>
    </div>
    <div class="ad-list">${rows.length?rows.map(p=>`<label class="ad-row" data-buscar="${adEsc(`${p.local} ${p.visitante} ${p.liga}`.toLowerCase())}"><input type="checkbox" ${a.seleccionados.has(String(p.fixtureId))?'checked':''} onchange="adSeleccionar('${adEsc(p.fixtureId)}',this.checked)"><div class="ad-match"><strong>${adEsc(p.local)} vs ${adEsc(p.visitante)}</strong><small>${adEsc(p.liga)} · Fixture ${adEsc(p.fixtureId)}</small></div><div class="ad-time">${adFechaLocal(p.iniciaEn)}<small>${adEsc(p.estado)}</small></div></label>`).join(''):'<div class="ad-empty">No hay partidos programados para el rango y filtros seleccionados.</div>'}</div>
    <div class="ad-run"><div class="ad-run-left"><label>Muestra</label><input type="number" min="5" max="50" value="${a.muestra}" onchange="adMuestra(this.value)"><small>partidos por equipo</small></div><button id="ad-analizar" class="btn" ${a.seleccionados.size?'':'disabled'} onclick="adAnalizarSeleccionados()">Analizar seleccionados (<span data-ad-count>${a.seleccionados.size}</span>)</button></div>
  </section>
  <section class="ad-panel"><div class="ad-note"><strong>Calidad ≠ probabilidad.</strong> La pantalla resume cobertura, consistencia y suficiencia de datos históricos. Las métricas de reglas son descriptivas y no generan cuotas, montos ni recomendaciones.</div><div class="ad-results">${a.cargando?'<div class="cargando">Analizando selección…</div>':a.resultados.length?a.resultados.map(adResultadoCard).join(''):'<div class="ad-empty">Selecciona partidos y pulsa “Analizar seleccionados”.</div>'}</div></section></div>`;
  adActualizarContador();
}

function adRedibujar(){
  if(S.seccion==='historicoDeportivo') dibujarHistoricoDeportivo();
  else dibujarAnalisisDeportivo();
}

function hdEstado(){
  const a=S.analisisDeportivo;
  if(!a.historicoTab)a.historicoTab='resumen';
  if(!Array.isArray(a.hdLigas))a.hdLigas=[];
  if(!Array.isArray(a.hdTemporadas))a.hdTemporadas=[];
  if(!Array.isArray(a.hdPartidos))a.hdPartidos=[];
  if(!a.hdLigaApiId)a.hdLigaApiId='';
  if(!a.hdTemporada)a.hdTemporada='';
  if(!a.hdBuscar)a.hdBuscar='';
  if(!a.hdBuscarLiga)a.hdBuscarLiga='';
  return a;
}
function hdPct(a,b){return Number(b)>0?Math.round((Number(a||0)/Number(b))*100):0}
function hdFecha(v){return v?adFechaLocal(v):'—'}
function hdEstilo(){
  let s=document.getElementById('hd-estilos');
  if(!s){s=document.createElement('style');s.id='hd-estilos';document.head.appendChild(s);}
  s.textContent=`
  .hd-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0 16px;padding:5px;background:#eef4f1;border-radius:12px}
  .hd-tab{border:0;background:transparent;padding:10px 16px;border-radius:9px;font-weight:700;color:#52636d;cursor:pointer;transition:.15s ease}
  .hd-tab:hover{background:#f8fbf9;color:#17664b}.hd-tab.activo{background:#fff;color:#087a43;box-shadow:0 1px 5px #00000014}
  .hd-contenido{display:grid;gap:14px}.hd-card{background:#fff;border:1px solid #dfe7e3;border-radius:14px;padding:16px;min-width:0}
  .hd-card-solo>.ad-rend{margin:0;padding:0;border:0;box-shadow:none}.hd-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
  .hd-card-head h3{margin:0 0 5px;font-size:17px;color:#17251f}.hd-card-head p{margin:0;color:#667782;font-size:13px;line-height:1.45}
  .hd-kpis{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr));gap:10px}.hd-kpi{border:1px solid #e3eae7;border-radius:11px;padding:14px;background:#fbfdfc}
  .hd-kpi b{display:block;font-size:22px;line-height:1.1;color:#17664b;margin-bottom:6px}.hd-kpi small{display:block;color:#687a72;font-size:11px}
  .hd-toolbar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:12px}.hd-toolbar input,.hd-toolbar select{border:1px solid #dbe4e0;border-radius:9px;padding:9px 10px;background:#fff;min-width:180px}
  .hd-table-wrap{overflow:auto;border:1px solid #e7ece9;border-radius:10px}.hd-table{width:100%;border-collapse:collapse;background:#fff}
  .hd-table th{text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#718078;padding:10px;background:#f7faf8;border-bottom:1px solid #e5ebe8;white-space:nowrap}
  .hd-table td{padding:11px 10px;border-bottom:1px solid #edf1ef;font-size:12px;vertical-align:middle}.hd-table tr:last-child td{border-bottom:0}.hd-table tbody tr:hover{background:#fafcfb}
  .hd-link{border:0;background:transparent;color:#087a43;font-weight:700;cursor:pointer;padding:0;text-align:left}.hd-link:hover{text-decoration:underline}.hd-muted{color:#73827b;font-size:10px;margin-top:2px}
  .hd-badge{display:inline-flex;padding:4px 8px;border-radius:999px;font-size:10px;font-weight:800}.hd-ok{background:#e8f7ef;color:#087a43}.hd-parcial{background:#fff4df;color:#966100}
  .hd-volver{border:1px solid #dbe4e0;background:#fff;border-radius:8px;padding:7px 10px;cursor:pointer}.hd-empty{padding:34px;text-align:center;color:#74827c}
  .hd-detalle-grid{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:12px 0}.hd-detalle-grid div{background:#f7faf8;border:1px solid #edf1ef;border-radius:10px;padding:10px}.hd-detalle-grid small{display:block;color:#74827c;margin-bottom:3px}
  .hd-subtabs{display:flex;gap:7px;flex-wrap:wrap;margin:4px 0 16px;padding-bottom:13px;border-bottom:1px solid #e9eeec}
  .hd-subtabs button{border:1px solid #dce5e1;background:#fff;border-radius:8px;padding:8px 11px;cursor:pointer;color:#42544d;font-weight:600}
  .hd-subtabs button:hover{border-color:#8ac9a8;color:#087a43;background:#fbfefc}.hd-subtabs button.activo{border-color:#8ac9a8;background:#eaf8f1;color:#087a43}
  .hd-subcontenido{min-width:0}.hd-subcontenido>.ad-rend{border:0;padding:0;margin:0;box-shadow:none}

  /* Componentes técnicos del histórico que antes no tenían CSS activo */
  .hd-contenido .ad-rend{background:#fff;border:1px solid #e5eae8;border-radius:12px;padding:14px;margin:0 0 14px;min-width:0}
  .hd-contenido .ad-rend-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
  .hd-contenido .ad-rend-head h3{margin:0 0 4px;font-size:16px;color:#17251f}.hd-contenido .ad-rend-head p{margin:0;color:#64748b;font-size:11px;line-height:1.45}
  .hd-contenido .ad-rend-head>div:last-child{display:flex;gap:7px;align-items:center;flex-wrap:wrap}
  .hd-contenido .btn-plano.btn-chico{border:1px solid #dce5e1;background:#fff;border-radius:7px;padding:6px 9px;font-size:10px;cursor:pointer;color:#34483f}
  .hd-contenido .btn-plano.btn-chico:hover{border-color:#8ac9a8;background:#f6fbf8;color:#087a43}
  .hd-contenido .ad-badge{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:800;white-space:nowrap}
  .hd-contenido .ad-badge.ok{background:#e9f7ef;color:#17704d}.hd-contenido .ad-badge.lim{background:#fff4d8;color:#8a6410}.hd-contenido .ad-badge.bad{background:#fdebec;color:#a43b44}
  .hd-contenido .ad-note{font-size:10px;color:#64748b;background:#f8faf9;padding:9px 10px;border-radius:8px;line-height:1.45}
  .hd-contenido .ad-rend-note{margin:10px 0 0}.hd-contenido .ad-empty-mini{padding:22px;text-align:center;color:#64748b}
  .hd-contenido .ad-reglas-error{padding:10px;border-radius:8px;background:#fff5f5;color:#a43b44;font-size:11px}

  .hd-contenido .ad-salud-kpis,.hd-contenido .ad-rend-kpis,.hd-contenido .ad-cob-kpis{display:grid;gap:8px;margin:12px 0}
  .hd-contenido .ad-salud-kpis{grid-template-columns:repeat(6,minmax(0,1fr))}.hd-contenido .ad-rend-kpis,.hd-contenido .ad-cob-kpis{grid-template-columns:repeat(5,minmax(0,1fr))}
  .hd-contenido .ad-salud-kpis span,.hd-contenido .ad-rend-kpis span,.hd-contenido .ad-cob-kpis span{display:block;background:#f8faf9;border:1px solid #e7edea;border-radius:9px;padding:10px;min-width:0}
  .hd-contenido .ad-salud-kpis small,.hd-contenido .ad-rend-kpis small,.hd-contenido .ad-cob-kpis small{display:block;color:#6e7e77;font-size:8px;line-height:1.25}
  .hd-contenido .ad-salud-kpis b,.hd-contenido .ad-rend-kpis b,.hd-contenido .ad-cob-kpis b{display:block;margin-top:4px;font-size:16px;line-height:1.15;color:#17664b;overflow-wrap:anywhere}
  .hd-contenido .ad-salud-grid,.hd-contenido .ad-rend-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  .hd-contenido .ad-salud-grid>div,.hd-contenido .ad-rend-grid>div{min-width:0}
  .hd-contenido .ad-salud-grid h4,.hd-contenido .ad-rend-grid h4{margin:4px 0 7px;font-size:11px;color:#24352f}
  .hd-contenido .ad-salud-motivos{display:flex;flex-direction:column;gap:5px;padding:10px;background:#fafcfb;border:1px solid #edf1ef;border-radius:8px;font-size:10px;color:#42544d;line-height:1.4}

  .hd-contenido .ad-rend-table,.hd-contenido .ad-cob-table{border:1px solid #e7ece9;border-radius:9px;overflow:hidden;background:#fff}
  .hd-contenido .ad-rend-tr{display:grid;grid-template-columns:minmax(150px,1fr) 72px 62px 76px;gap:8px;align-items:center;padding:8px 9px;border-bottom:1px solid #edf1ef;font-size:10px}
  .hd-contenido .ad-rend-tr:last-child{border-bottom:0}.hd-contenido .ad-rend-tr small{display:block;color:#7b8794;font-size:8px;margin-top:2px;line-height:1.35}
  .hd-contenido .ad-rend-th{background:#f8faf9;color:#64748b;font-weight:700}
  .hd-contenido .ad-rend-ligas{margin-top:10px}.hd-contenido .ad-rend-ligas summary{cursor:pointer;font-size:10px;font-weight:700;color:#52645d;margin-bottom:7px}

  .hd-contenido .ad-cob-cat{display:flex;gap:7px;overflow-x:auto;padding:2px 0 7px;margin-bottom:8px;scrollbar-width:thin}
  .hd-contenido .ad-cob-cat>span{min-width:145px;padding:9px;border:1px solid #e6ece9;border-radius:8px;background:#fff}
  .hd-contenido .ad-cob-cat b,.hd-contenido .ad-cob-cat small{display:block}.hd-contenido .ad-cob-cat b{font-size:10px}.hd-contenido .ad-cob-cat small{font-size:8px;color:#64748b;margin-top:2px}
  .hd-contenido .ad-reglas-filtros{display:grid;grid-template-columns:1fr 170px auto;gap:8px;align-items:center;margin:10px 0}
  .hd-contenido .ad-reglas-filtros select{width:100%;border:1px solid #dbe3e8;border-radius:8px;padding:8px 9px;background:#fff;font-size:10px}.hd-contenido .ad-reglas-filtros>span{font-size:9px;color:#64748b;white-space:nowrap}
  .hd-contenido .ad-cob-row{display:grid;grid-template-columns:minmax(210px,1.5fr) minmax(110px,.8fr) 110px 70px 90px;gap:8px;align-items:center;padding:8px 9px;border-bottom:1px solid #edf1ef;font-size:10px}
  .hd-contenido .ad-cob-row:last-child{border-bottom:0}.hd-contenido .ad-cob-row small{display:block;color:#7b8794;font-size:8px;margin-top:2px}.hd-contenido .ad-cob-head{background:#f8faf9;color:#64748b;font-weight:700}
  .hd-contenido .ad-campo-row{display:grid;grid-template-columns:minmax(200px,1.4fr) 70px 110px 90px 75px 85px;gap:8px;align-items:center;padding:8px 9px;border-bottom:1px solid #edf1ef;font-size:10px}
  .hd-contenido .ad-campo-row:last-child{border-bottom:0}.hd-contenido .ad-campo-row small{display:block;color:#7b8794;font-size:8px;margin-top:2px}

  .hd-contenido .ad-eq-toolbar{display:flex;gap:8px;align-items:center;margin:10px 0}.hd-contenido .ad-eq-toolbar input{min-width:260px;max-width:460px;border:1px solid #dbe3e8;border-radius:8px;padding:8px 9px}
  .hd-contenido .ad-eq-row{display:grid;grid-template-columns:minmax(190px,1.3fr) 80px 70px minmax(200px,1.4fr);gap:8px;align-items:center;padding:8px 9px;border-bottom:1px solid #edf1ef;font-size:10px}
  .hd-contenido .ad-eq-row:last-child{border-bottom:0}.hd-contenido .ad-eq-row small{display:block;color:#7b8794;font-size:8px;margin-top:2px}.hd-contenido .ad-eq-row em{display:inline-block;font-style:normal;background:#f3f7f5;border:1px solid #e4ebe7;border-radius:999px;padding:2px 6px;margin:1px 3px 1px 0;font-size:8px}

  .hd-contenido .ad-import-actions{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:11px 0}
  .hd-contenido .ad-import-actions>div{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.hd-contenido .ad-import-actions small{font-size:9px;color:#64748b}
  .hd-contenido .ad-import-table .ad-rend-tr{grid-template-columns:28px minmax(220px,1fr) 80px 65px 70px}.hd-contenido .ad-import-table label.ad-rend-tr{cursor:pointer}
  .hd-contenido .ad-import-table input{width:15px;height:15px}.hd-contenido .ad-import-job{border:1px solid #dceae3;background:#fbfefc;border-radius:10px;padding:10px;margin:10px 0}
  .hd-contenido .ad-import-job-head{display:flex;justify-content:space-between;gap:10px;align-items:center}.hd-contenido .ad-import-job-head strong{display:block;font-size:11px}.hd-contenido .ad-import-job-head small{display:block;font-size:8px;color:#64748b;margin-top:2px}
  .hd-contenido .ad-progress{height:7px;background:#e8eeeb;border-radius:999px;overflow:hidden;margin:9px 0}.hd-contenido .ad-progress i{display:block;height:100%;background:#4ca87d;border-radius:999px}
  .hd-contenido .ad-import-items{display:flex;gap:5px;flex-wrap:wrap}.hd-contenido .ad-import-items>span{border:1px solid #e4ebe7;background:white;border-radius:7px;padding:5px 6px;font-size:9px}

  .hd-contenido .ad-api-actions{display:flex;gap:7px;align-items:center}.hd-contenido .ad-api-actions select{border:1px solid #dfe6e2;border-radius:7px;padding:7px 8px;background:#fff;font-size:10px}
  .hd-contenido .ad-api-cuota{display:flex;justify-content:space-between;gap:10px;align-items:center;margin:8px 0 12px;padding:9px 10px;background:#f8faf9;border:1px solid #edf1ef;border-radius:8px;font-size:10px}.hd-contenido .ad-api-cuota small{color:#64748b}
  .hd-contenido .ad-hist-list{display:flex;flex-direction:column;gap:7px;margin-top:12px}.hd-contenido .ad-hist-item{border:1px solid #e7ece9;border-radius:9px;background:#fff;overflow:hidden}
  .hd-contenido .ad-hist-item summary{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;cursor:pointer;list-style:none}.hd-contenido .ad-hist-item summary b{display:block;font-size:10px}.hd-contenido .ad-hist-item summary small{display:block;color:#64748b;font-size:8px;margin-top:2px}
  .hd-contenido .ad-hist-body{border-top:1px solid #edf1ef;padding:10px}.hd-contenido .ad-hist-meta{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin:9px 0}
  .hd-contenido .ad-hist-meta span{background:#f8faf9;border:1px solid #edf1ef;border-radius:7px;padding:8px;min-width:0}.hd-contenido .ad-hist-meta small{display:block;color:#64748b;font-size:8px}.hd-contenido .ad-hist-meta b{display:block;font-size:10px;margin-top:2px;overflow-wrap:anywhere}
  .hd-contenido .ad-plan-actions{display:flex;align-items:center;gap:9px;margin:10px 0}.hd-contenido .ad-plan-actions small{font-size:9px;color:#64748b;line-height:1.4}
  .hd-contenido .ad-est-cuota{margin:12px 0;padding:12px;border:1px solid #dfe7e2;border-radius:10px;background:#fff}.hd-contenido .ad-est-cuota-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}

  @media(max-width:1200px){
    .hd-contenido .ad-salud-kpis{grid-template-columns:repeat(3,1fr)}
    .hd-contenido .ad-rend-kpis,.hd-contenido .ad-cob-kpis{grid-template-columns:repeat(3,1fr)}
  }
  @media(max-width:900px){
    .hd-kpis,.hd-detalle-grid{grid-template-columns:repeat(2,1fr)}
    .hd-table{min-width:720px}.hd-table-wrap{overflow:auto}
    .hd-contenido .ad-salud-grid,.hd-contenido .ad-rend-grid{grid-template-columns:1fr}
    .hd-contenido .ad-import-actions{align-items:stretch;flex-direction:column}
    .hd-contenido .ad-hist-meta{grid-template-columns:1fr 1fr}
    .hd-contenido .ad-cob-row{grid-template-columns:minmax(180px,1fr) 100px 80px}
    .hd-contenido .ad-cob-row>span:nth-child(2),.hd-contenido .ad-cob-row>span:nth-child(4){display:none}
    .hd-contenido .ad-campo-row{grid-template-columns:minmax(180px,1fr) 90px 80px}
    .hd-contenido .ad-campo-row>span:nth-child(2),.hd-contenido .ad-campo-row>span:nth-child(4),.hd-contenido .ad-campo-row>span:nth-child(5){display:none}
  }
  @media(max-width:700px){
    .hd-tabs{overflow:auto;flex-wrap:nowrap}.hd-tab{white-space:nowrap}
    .hd-kpis,.hd-detalle-grid{grid-template-columns:1fr}
    .hd-contenido .ad-salud-kpis,.hd-contenido .ad-rend-kpis,.hd-contenido .ad-cob-kpis{grid-template-columns:1fr 1fr}
    .hd-contenido .ad-rend-head{flex-direction:column}.hd-contenido .ad-reglas-filtros{grid-template-columns:1fr}
    .hd-contenido .ad-eq-toolbar{flex-direction:column;align-items:stretch}.hd-contenido .ad-eq-toolbar input{min-width:0;max-width:none;width:100%}
    .hd-contenido .ad-eq-row{grid-template-columns:1fr 70px}.hd-contenido .ad-eq-row>span:nth-child(3),.hd-contenido .ad-eq-row>span:nth-child(4){display:none}
    .hd-contenido .ad-import-table{overflow-x:auto}.hd-contenido .ad-import-table .ad-rend-tr{min-width:620px}
  }`;
}
function hdTabs(){
  const a=hdEstado(),tabs=[['resumen','Resumen'],['datos','Datos históricos'],['faltantes','Faltantes'],['calidad','Calidad'],['mantenimiento','Mantenimiento']];
  return `<div class="hd-tabs">${tabs.map(([id,n])=>`<button class="hd-tab ${a.historicoTab===id?'activo':''}" onclick="hdCambiarTab('${id}')">${n}</button>`).join('')}</div>`;
}
async function hdCambiarTab(tab){
  const a=hdEstado();a.historicoTab=tab;
  if(tab==='resumen'&&!a.saludGeneral)await adCargarSaludGeneral(false);
  else if(tab==='datos'&&!a.hdLigas.length)await hdCargarLigas();
  else if(tab==='faltantes'&&!a.diagnosticoDataset)await adCargarDiagnostico(false);
  else if(tab==='calidad'){
    if(!a.hdCalidadSeccion)a.hdCalidadSeccion='reglas';
    await hdAbrirCalidad(a.hdCalidadSeccion);
    return;
  }else if(tab==='mantenimiento'){
    if(!a.hdMantenimientoSeccion)a.hdMantenimientoSeccion='historial';
    await hdAbrirMantenimiento(a.hdMantenimientoSeccion);
    return;
  }
  dibujarHistoricoDeportivo();
}
function hdResumen(){
  const a=hdEstado(),s=a.saludGeneral;
  if(a.saludGeneralCargando)return `<div class="hd-card"><div class="cargando">Consultando estado general…</div></div>`;
  if(!s)return `<div class="hd-card"><div class="hd-card-head"><div><h3>Resumen del histórico</h3><p>Estado general de cobertura y datos disponibles.</p></div><button class="btn-plano btn-chico" onclick="adCargarSaludGeneral(true)">Actualizar</button></div><div class="hd-empty">Pulsa Actualizar para consultar el estado.</div></div>`;
  const d=s.dataset||{},r=s.analisis||{};
  const cobertura=Number(r.coberturaPromedioPct||0);
  const reglas=Number(r.utilizablesPct||0);
  return `<div class="hd-card"><div class="hd-card-head"><div><h3>Resumen del histórico</h3><p>Una lectura rápida del estado técnico de los datos.</p></div><button class="btn-plano btn-chico" onclick="adCargarSaludGeneral(true)">Actualizar</button></div>
    <div class="hd-kpis">
      <div class="hd-kpi"><b>${cobertura.toFixed(0)}%</b><small>Cobertura histórica</small></div>
      <div class="hd-kpi"><b>${reglas.toFixed(0)}%</b><small>Reglas utilizables</small></div>
      <div class="hd-kpi"><b>${Number(d.estadisticasPendientes||0).toLocaleString()}</b><small>Stats pendientes</small></div>
      <div class="hd-kpi"><b>${Number(d.eventosPendientes||0).toLocaleString()}</b><small>Eventos pendientes</small></div>
    </div></div>
    ${adBloqueSaludGeneral()}`;
}
async function hdCargarLigas(forzar=false){
  const a=hdEstado();if(a.hdLigasCargando)return;if(a.hdLigas.length&&!forzar){dibujarHistoricoDeportivo();return}
  a.hdLigasCargando=true;dibujarHistoricoDeportivo();
  try{const r=await api('/historico-deportivo/ligas');a.hdLigas=r.ligas||[];}
  catch(e){a.hdError=e.message||'No se pudieron cargar los datos históricos.';}
  finally{a.hdLigasCargando=false;dibujarHistoricoDeportivo();}
}
async function hdAbrirLiga(id){
  const a=hdEstado();a.hdLigaApiId=String(id);a.hdTemporada='';a.hdPartidos=[];a.hdDetalle=null;a.hdTemporadasCargando=true;dibujarHistoricoDeportivo();
  try{const r=await api('/historico-deportivo/temporadas?ligaApiId='+encodeURIComponent(id));a.hdTemporadas=r.temporadas||[];}
  catch(e){a.hdError=e.message||'No se pudieron cargar las temporadas.';}
  finally{a.hdTemporadasCargando=false;dibujarHistoricoDeportivo();}
}
async function hdAbrirTemporada(t){
  const a=hdEstado();a.hdTemporada=String(t);a.hdDetalle=null;await hdCargarPartidos();
}
async function hdCargarPartidos(){
  const a=hdEstado();if(!a.hdLigaApiId||!a.hdTemporada)return;
  a.hdPartidosCargando=true;dibujarHistoricoDeportivo();
  try{const qs=new URLSearchParams({ligaApiId:a.hdLigaApiId,temporada:a.hdTemporada,limite:'300'});if(a.hdBuscar.trim())qs.set('buscar',a.hdBuscar.trim());const r=await api('/historico-deportivo/partidos?'+qs);a.hdPartidos=r.partidos||[];}
  catch(e){a.hdError=e.message||'No se pudieron cargar los partidos históricos.';}
  finally{a.hdPartidosCargando=false;dibujarHistoricoDeportivo();}
}
function hdBuscar(v){const a=hdEstado();a.hdBuscar=String(v||'');clearTimeout(a.hdBuscarTimer);a.hdBuscarTimer=setTimeout(()=>void hdCargarPartidos(),250)}
async function hdVerPartido(id){
  const a=hdEstado();a.hdDetalleCargando=true;dibujarHistoricoDeportivo();
  try{const r=await api('/historico-deportivo/partidos/'+encodeURIComponent(id));a.hdDetalle=r;}
  catch(e){a.hdError=e.message||'No se pudo cargar el partido.';}
  finally{a.hdDetalleCargando=false;dibujarHistoricoDeportivo();}
}
function hdDatos(){
  const a=hdEstado();
  if(a.hdLigasCargando)return `<div class="hd-card"><div class="cargando">Cargando ligas con histórico…</div></div>`;
  if(a.hdError){const e=a.hdError;a.hdError='';return `<div class="hd-card"><div class="ad-reglas-error">${adEsc(e)}</div></div>`}
  if(a.hdDetalleCargando)return `<div class="hd-card"><div class="cargando">Cargando detalle del partido…</div></div>`;
  if(a.hdDetalle){
    const p=a.hdDetalle.partido||{},st=a.hdDetalle.estadisticas||[];
    return `<div class="hd-card"><div class="hd-card-head"><div><button class="hd-volver" onclick="hdEstado().hdDetalle=null;dibujarHistoricoDeportivo()">← Volver a partidos</button><h3 style="margin-top:12px">${adEsc(p.equipo_local||'Local')} vs ${adEsc(p.equipo_visitante||'Visitante')}</h3><p>Fixture ${adEsc(p.fixture_api_id||'—')} · ${hdFecha(p.fecha)}</p></div><span class="hd-badge ${p.estadisticas_completas?'hd-ok':'hd-parcial'}">${p.estadisticas_completas?'Stats completas':'Stats parciales'}</span></div>
      <div class="hd-detalle-grid"><div><small>Resultado</small><b>${p.goles_local??'—'} - ${p.goles_visitante??'—'}</b></div><div><small>Temporada</small><b>${p.temporada??'—'}</b></div><div><small>Ronda</small><b>${adEsc(p.ronda||'—')}</b></div><div><small>Estado</small><b>${adEsc(p.estado||'—')}</b></div></div>
      <h4>Estadísticas guardadas</h4><div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Equipo</th><th>Tiros</th><th>Arco</th><th>Posesión</th><th>Córners</th><th>Faltas</th><th>Amarillas</th><th>Rojas</th></tr></thead><tbody>${st.length?st.map(x=>`<tr><td><b>${adEsc(x.equipo||'—')}</b></td><td>${x.tiros??'—'}</td><td>${x.tiros_arco??'—'}</td><td>${x.posesion??'—'}</td><td>${x.corners??'—'}</td><td>${x.faltas??'—'}</td><td>${x.amarillas??'—'}</td><td>${x.rojas??'—'}</td></tr>`).join(''):`<tr><td colspan="8" class="hd-muted">No hay estadísticas guardadas para este partido.</td></tr>`}</tbody></table></div></div>`;
  }
  if(a.hdLigaApiId&&a.hdTemporada){
    const liga=a.hdLigas.find(x=>String(x.liga_api_id)===a.hdLigaApiId);
    return `<div class="hd-card"><div class="hd-card-head"><div><button class="hd-volver" onclick="hdEstado().hdTemporada='';hdEstado().hdPartidos=[];dibujarHistoricoDeportivo()">← Temporadas</button><h3 style="margin-top:12px">${adEsc(liga?.liga||a.hdLigaApiId)} · ${adEsc(a.hdTemporada)}</h3><p>Partidos históricos almacenados.</p></div></div>
      <div class="hd-toolbar"><input type="search" placeholder="Buscar equipo o ronda..." value="${adEsc(a.hdBuscar)}" oninput="hdBuscar(this.value)"><button class="btn-plano btn-chico" onclick="hdCargarPartidos()">Actualizar</button></div>
      ${a.hdPartidosCargando?'<div class="cargando">Cargando partidos…</div>':`<div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Fecha</th><th>Partido</th><th>Resultado</th><th>Ronda</th><th>Stats</th><th></th></tr></thead><tbody>${a.hdPartidos.length?a.hdPartidos.map(p=>`<tr><td>${hdFecha(p.fecha)}</td><td><b>${adEsc(p.equipo_local)} vs ${adEsc(p.equipo_visitante)}</b><div class="hd-muted">Fixture ${adEsc(p.fixture_api_id)}</div></td><td>${p.goles_local??'—'} - ${p.goles_visitante??'—'}</td><td>${adEsc(p.ronda||'—')}</td><td><span class="hd-badge ${p.estadisticas_completas?'hd-ok':'hd-parcial'}">${p.estadisticas_completas?'Completa':'Pendiente'}</span></td><td><button class="hd-link" onclick="hdVerPartido('${adEsc(p.fixture_api_id)}')">Ver detalle</button></td></tr>`).join(''):`<tr><td colspan="6"><div class="hd-empty">No hay partidos para este filtro.</div></td></tr>`}</tbody></table></div>`}</div>`;
  }
  if(a.hdLigaApiId){
    const liga=a.hdLigas.find(x=>String(x.liga_api_id)===a.hdLigaApiId);
    return `<div class="hd-card"><div class="hd-card-head"><div><button class="hd-volver" onclick="hdEstado().hdLigaApiId='';hdEstado().hdTemporadas=[];dibujarHistoricoDeportivo()">← Ligas</button><h3 style="margin-top:12px">${adEsc(liga?.liga||a.hdLigaApiId)}</h3><p>Selecciona una temporada para ver sus partidos.</p></div></div>
      ${a.hdTemporadasCargando?'<div class="cargando">Cargando temporadas…</div>':`<div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Temporada</th><th>Partidos</th><th>Con estadísticas</th><th>Cobertura</th><th>Última actualización</th><th></th></tr></thead><tbody>${a.hdTemporadas.map(t=>`<tr><td><b>${t.temporada}</b></td><td>${t.partidos}</td><td>${t.con_estadisticas}</td><td>${hdPct(t.con_estadisticas,t.partidos)}%</td><td>${hdFecha(t.ultima_actualizacion)}</td><td><button class="hd-link" onclick="hdAbrirTemporada('${t.temporada}')">Ver partidos</button></td></tr>`).join('')}</tbody></table></div>`}</div>`;
  }
  const q=String(a.hdBuscarLiga||'').trim().toLowerCase();
  return `<div class="hd-card"><div class="hd-card-head"><div><h3>Datos históricos cargados</h3><p>Consulta las ligas que realmente tienen información almacenada en PostgreSQL.</p></div><button class="btn-plano btn-chico" onclick="hdCargarLigas(true)">Actualizar</button></div>
    <div class="hd-toolbar"><input type="search" placeholder="Buscar liga por nombre o API ID..." value="${adEsc(a.hdBuscarLiga||'')}" oninput="hdFiltrarLigasHistoricas(this.value)"></div>
    <div class="hd-table-wrap"><table class="hd-table"><thead><tr><th>Liga</th><th>Temporadas</th><th>Partidos</th><th>Con estadísticas</th><th>Cobertura stats</th><th>Última actualización</th><th></th></tr></thead><tbody>${a.hdLigas.length?a.hdLigas.map(l=>{const buscar=`${l.liga||''} ${l.liga_api_id||''} API ${l.liga_api_id||''}`.toLowerCase();const ocultar=q&&!buscar.includes(q);return `<tr data-hd-liga-row data-hd-buscar="${adEsc(buscar)}" style="${ocultar?'display:none':''}"><td><b>${adEsc(l.liga)}</b><div class="hd-muted">API ${adEsc(l.liga_api_id)}</div></td><td>${l.temporada_desde??'—'}${l.temporada_hasta&&l.temporada_hasta!==l.temporada_desde?' – '+l.temporada_hasta:''}</td><td>${Number(l.partidos||0).toLocaleString()}</td><td>${Number(l.con_estadisticas||0).toLocaleString()}</td><td><span class="hd-badge ${hdPct(l.con_estadisticas,l.partidos)>=90?'hd-ok':'hd-parcial'}">${hdPct(l.con_estadisticas,l.partidos)}%</span></td><td>${hdFecha(l.ultima_actualizacion)}</td><td><button class="hd-link" onclick="hdAbrirLiga('${adEsc(l.liga_api_id)}')">Ver temporadas</button></td></tr>`}).join(''):`<tr><td colspan="7"><div class="hd-empty">Todavía no hay ligas con histórico almacenado.</div></td></tr>`}<tr id="hd-ligas-sin-resultados" style="${q&&!a.hdLigas.some(l=>`${l.liga||''} ${l.liga_api_id||''} API ${l.liga_api_id||''}`.toLowerCase().includes(q))?'':'display:none'}"><td colspan="7"><div class="hd-empty">No hay ligas que coincidan con la búsqueda.</div></td></tr></tbody></table></div></div>`;
}
function hdFiltrarLigasHistoricas(valor){
  const a=hdEstado(),q=String(valor||'').trim().toLowerCase();
  a.hdBuscarLiga=valor||'';
  document.querySelectorAll('[data-hd-liga-row]').forEach(f=>{
    const s=String(f.getAttribute('data-hd-buscar')||'').toLowerCase();
    f.style.display=!q||s.includes(q)?'':'none';
  });
  const vacio=document.getElementById('hd-ligas-sin-resultados');
  if(vacio){
    const visibles=[...document.querySelectorAll('[data-hd-liga-row]')].some(f=>f.style.display!=='none');
    vacio.style.display=q&&!visibles?'':'none';
  }
}
function hdFiltrarFaltantes(valor){
  const a=hdEstado(),q=String(valor||'').trim().toLowerCase();
  a.hdBuscarFaltantes=valor||'';
  document.querySelectorAll('#hd-faltantes-contenido .ad-import-table .ad-rend-tr:not(.ad-rend-th)').forEach(f=>{
    const s=String(f.textContent||'').toLowerCase();
    f.style.display=!q||s.includes(q)?'':'none';
  });
  const vacio=document.getElementById('hd-faltantes-sin-resultados');
  if(vacio){
    const filas=[...document.querySelectorAll('#hd-faltantes-contenido .ad-import-table .ad-rend-tr:not(.ad-rend-th)')];
    const visibles=filas.some(f=>f.style.display!=='none');
    vacio.style.display=q&&filas.length&&!visibles?'':'none';
  }
}
function hdFaltantes(){
  const a=hdEstado();
  if(!a.diagnosticoAbierto)a.diagnosticoAbierto=true;
  if(a.hdBuscarFaltantes===undefined)a.hdBuscarFaltantes='';
  return `<div class="hd-card hd-card-solo">
    <div class="hd-toolbar"><input type="search" placeholder="Buscar liga, temporada o faltante..." value="${adEsc(a.hdBuscarFaltantes)}" oninput="hdFiltrarFaltantes(this.value)"></div>
    <div id="hd-faltantes-contenido">${adBloqueDiagnostico()}<div id="hd-faltantes-sin-resultados" class="hd-empty" style="display:none">No hay faltantes que coincidan con la búsqueda.</div></div>
  </div>`;
}
async function hdAbrirCalidad(seccion){
  const a=hdEstado();a.hdCalidadSeccion=seccion;
  a.coberturaReglasAbierto=seccion==='reglas';
  a.coberturaCamposAbierto=seccion==='campos';
  a.normalizacionEquiposAbierto=seccion==='equipos';
  a.rendimientoAbierto=seccion==='rendimiento';
  if(seccion==='reglas')await adCargarCoberturaReglas(false);
  else if(seccion==='campos')await adCargarCoberturaCampos(false);
  else if(seccion==='equipos')await adCargarNormalizacionEquipos(false);
  else if(seccion==='rendimiento')await adCargarRendimiento(false);
  dibujarHistoricoDeportivo();
}
function hdCalidad(){
  const a=hdEstado();
  if(!a.hdCalidadSeccion)a.hdCalidadSeccion='reglas';
  const seccion=a.hdCalidadSeccion;
  return `<div class="hd-card"><div class="hd-card-head"><div><h3>Calidad del histórico</h3><p>Comprueba si los datos son suficientes y consistentes para el motor de análisis.</p></div></div>
    <div class="hd-subtabs">
      <button class="${seccion==='reglas'?'activo':''}" onclick="hdAbrirCalidad('reglas')">Cobertura 79 reglas</button>
      <button class="${seccion==='campos'?'activo':''}" onclick="hdAbrirCalidad('campos')">Cobertura por campo</button>
      <button class="${seccion==='equipos'?'activo':''}" onclick="hdAbrirCalidad('equipos')">Normalización de equipos</button>
      <button class="${seccion==='rendimiento'?'activo':''}" onclick="hdAbrirCalidad('rendimiento')">Rendimiento histórico</button>
    </div>
    <div class="hd-subcontenido">${
      seccion==='campos'?adBloqueCoberturaCampos():
      seccion==='equipos'?adBloqueNormalizacionEquipos():
      seccion==='rendimiento'?adBloqueRendimiento():
      adBloqueCoberturaReglas()
    }</div></div>`;
}
async function hdAbrirMantenimiento(seccion){
  const a=hdEstado();a.hdMantenimientoSeccion=seccion;
  a.historialImportacionesAbierto=seccion==='historial';
  a.consumoApiAbierto=seccion==='api';
  a.mantenimientoProgramadoAbierto=seccion==='auto';
  if(seccion==='historial')await adCargarHistorialImportaciones(false);
  else if(seccion==='api')await adCargarConsumoApi(false);
  else if(seccion==='auto')await adCargarMantenimientoProgramado(false);
  dibujarHistoricoDeportivo();
}
function hdMantenimiento(){
  const a=hdEstado();
  if(!a.hdMantenimientoSeccion)a.hdMantenimientoSeccion='historial';
  const seccion=a.hdMantenimientoSeccion;
  return `<div class="hd-card"><div class="hd-card-head"><div><h3>Mantenimiento e importaciones</h3><p>Controla consumo de API-Football, trabajos de importación y mantenimiento automático.</p></div></div>
    <div class="hd-subtabs">
      <button class="${seccion==='historial'?'activo':''}" onclick="hdAbrirMantenimiento('historial')">Historial de importaciones</button>
      <button class="${seccion==='api'?'activo':''}" onclick="hdAbrirMantenimiento('api')">Consumo API-Football</button>
      <button class="${seccion==='auto'?'activo':''}" onclick="hdAbrirMantenimiento('auto')">Mantenimiento automático</button>
    </div>
    <div class="hd-subcontenido">${
      seccion==='api'?adBloqueConsumoApi():
      seccion==='auto'?adBloqueMantenimientoProgramado():
      adBloqueHistorialImportaciones()
    }</div></div>`;
}
function dibujarHistoricoDeportivo(){
  dibujarAnalisisDeportivo();
  hdEstilo();
  const contenido=document.getElementById('contenido');if(!contenido)return;
  const a=hdEstado();
  const titulo=contenido.querySelector('.ad-head h1'),descripcion=contenido.querySelector('.ad-head p');
  if(titulo)titulo.textContent='Histórico deportivo';
  if(descripcion)descripcion.textContent='Consulta los datos históricos cargados, completa faltantes y controla la calidad y el mantenimiento.';
  contenido.querySelector('.ad-flow')?.remove();
  contenido.querySelector('.ad-filtros-card')?.remove();
  contenido.querySelector('.ad-grid')?.remove();
  contenido.querySelector('.ad-actions')?.remove();
  const cab=contenido.querySelector('.ad-head');if(!cab)return;
  cab.insertAdjacentHTML('afterend',`${hdTabs()}<div class="hd-contenido">${
    a.historicoTab==='datos'?hdDatos():
    a.historicoTab==='faltantes'?hdFaltantes():
    a.historicoTab==='calidad'?hdCalidad():
    a.historicoTab==='mantenimiento'?hdMantenimiento():hdResumen()
  }</div>`);
}
VISTAS.historicoDeportivo=async function(){
  document.getElementById('contenido').innerHTML='<div class="cargando">Cargando histórico deportivo…</div>';
  try{
    const a=hdEstado();
    if(a.historicoTab==='resumen'&&!a.saludGeneral){
      try{await adCargarSaludGeneral(false);}catch(_e){}
    }
    dibujarHistoricoDeportivo();
  }catch(e){
    document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudo abrir Histórico deportivo</strong><p>${adEsc(e.message)}</p></div>`;
  }
};

async function adAnalizarSeleccionados(){
  const a=S.analisisDeportivo, ids=[...a.seleccionados]; if(!ids.length)return;
  a.cargando=true; a.resultados=[]; a.metricasPorFixture={}; a.metricasCargando=new Set(); a.datasetsEspecializados={}; a.datasetsEspecializadosCargando=new Set(); adRedibujar();
  try{
    const r=await api('/analisis-historico/lote',{method:'POST',body:JSON.stringify({fixtureIds:ids,muestra:a.muestra})});
    a.resultados=r.resultados||[];
  }catch(e){
    a.resultados=[{fixtureId:'—',ok:false,error:e.message||'No se pudo ejecutar el análisis'}];
  }finally{a.cargando=false;adRedibujar();}
}

VISTAS.analisisDeportivo=async function(){
  document.getElementById('contenido').innerHTML='<div class="cargando">Cargando análisis deportivo…</div>';
  try{
    adInicializarRangoFechas();
    await adCargarLigasActivas();
    await adCargarConfiguracionFiltro();
    await adCargarPartidos();
    dibujarAnalisisDeportivo();
  }catch(e){document.getElementById('contenido').innerHTML=`<div class="vacio"><strong>No se pudo abrir Análisis deportivo</strong><p>${adEsc(e.message)}</p></div>`;}
};

/* Paso 15 */
