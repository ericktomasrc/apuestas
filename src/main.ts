import { config as cargarEntorno } from 'dotenv';
cargarEntorno();

/**
 * Punto de entrada. Levanta la API y el scheduler.
 *
 *   npm run dev     desarrollo, recarga al guardar
 *   npm start       arranque normal
 */

import { iniciar } from './api/app.js';
import { iniciarScheduler } from './servicios/procesos.servicio.js';
import { ProveedorSimulado } from './infraestructura/proveedores/deportes.proveedor.js';
import { ProveedorApiFootball } from './infraestructura/proveedores/apifootball.proveedor.js';

const PUERTO = Number(process.env.PUERTO ?? 3000);

// En local, el proveedor simulado. Al contratar uno real, se cambia
// solo esta línea: el resto del sistema no distingue la diferencia.
/**
 * El real si hay clave, el simulado si no.
 *
 * Así el proyecto arranca sin credenciales —para pruebas y para quien
 * lo reciba por primera vez— y usa datos de verdad en cuanto se
 * configure el `.env`. No hay que tocar código para cambiar.
 */
const proveedor = process.env.API_FOOTBALL_KEY
  ? new ProveedorApiFootball()
  : new ProveedorSimulado();

console.log(`  Proveedor deportivo: ${proveedor.nombre}`);
if (proveedor instanceof ProveedorApiFootball) {
  // Se comprueba al arrancar: descubrir que la clave no sirve cuando
  // falla la primera liquidación es tarde.
  void proveedor.estado().then((e) => {
    if (!e.ok) {
      console.error('  ⚠️  La clave de API-Football no funciona. Revisa API_FOOTBALL_KEY.');
    } else {
      console.log(`     plan ${e.plan ?? '—'} · ${e.restantes ?? '?'} peticiones disponibles hoy`);
    }
  });
}

// El mismo proveedor para la API y el scheduler: el panel necesita
// poder sincronizar a mano y ver cuánta cuota queda.
const app = await iniciar(PUERTO, proveedor);
const detener = iniciarScheduler(proveedor);

console.log(`API en http://localhost:${PUERTO}`);
console.log(`Panel:  http://localhost:${PUERTO}/panel`);
console.log(`Docs:   http://localhost:${PUERTO}/docs`);
console.log(`Salud:  http://localhost:${PUERTO}/salud`);

for (const senal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(senal, () => {
    console.log('\nCerrando...');
    detener();
    void app.close().then(() => process.exit(0));
  });
}
