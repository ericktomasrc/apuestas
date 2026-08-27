/**
 * Envío de correo.
 *
 * Dos implementaciones detrás de la misma interfaz:
 *   - CorreoSmtp     real, por SMTP (Gmail, o cualquier otro)
 *   - CorreoSimulado  para las pruebas
 *
 * ⚠️ El simulado NO es un atajo: sin él, correr las pruebas enviaría
 * cientos de correos de verdad a direcciones inventadas, y el
 * proveedor terminaría marcando la cuenta como spam.
 *
 * Las credenciales van SIEMPRE en variables de entorno. Una contraseña
 * de aplicación en el código termina en el repositorio, y de ahí no
 * se saca nunca.
 */

import nodemailer from 'nodemailer';

export interface Correo {
  para: string;
  asunto: string;
  html: string;
  /** Versión de solo texto, para clientes que no muestran HTML. */
  texto: string;
}

export interface ResultadoEnvio {
  enviado: boolean;
  proveedor: string;
  error?: string;
}

export interface ProveedorCorreo {
  nombre: string;
  enviar(correo: Correo): Promise<ResultadoEnvio>;
}

// =====================================================================
//  Real — SMTP
// =====================================================================

export interface ConfigSmtp {
  host: string;
  puerto: number;
  usuario: string;
  password: string;
  remitente: string;
  nombreRemitente: string;
}

export class CorreoSmtp implements ProveedorCorreo {
  nombre = 'SMTP';
  private transporte: nodemailer.Transporter;

  constructor(private config: ConfigSmtp) {
    this.transporte = nodemailer.createTransport({
      host: config.host,
      port: config.puerto,
      // 587 usa STARTTLS: la conexión empieza en claro y se cifra
      // enseguida. 465 va cifrada desde el primer byte.
      secure: config.puerto === 465,
      auth: { user: config.usuario, pass: config.password },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }

  async enviar(correo: Correo): Promise<ResultadoEnvio> {
    try {
      await this.transporte.sendMail({
        from: `"${this.config.nombreRemitente}" <${this.config.remitente}>`,
        to: correo.para,
        subject: correo.asunto,
        text: correo.texto,
        html: correo.html,
      });
      return { enviado: true, proveedor: this.nombre };
    } catch (e) {
      return {
        enviado: false,
        proveedor: this.nombre,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /** Comprueba las credenciales sin enviar nada. */
  async verificar(): Promise<boolean> {
    try {
      await this.transporte.verify();
      return true;
    } catch {
      return false;
    }
  }
}

// =====================================================================
//  Simulado — pruebas
// =====================================================================

export class CorreoSimulado implements ProveedorCorreo {
  nombre = 'SIMULADO';
  public enviados: Correo[] = [];
  public fallar = false;
  /** Si es true, imprime el correo en consola. Útil en desarrollo. */
  public mostrar = false;

  async enviar(correo: Correo): Promise<ResultadoEnvio> {
    if (this.fallar) {
      return { enviado: false, proveedor: this.nombre, error: 'Fallo simulado' };
    }
    this.enviados.push(correo);
    if (this.mostrar) {
      console.log(`\n  ── Correo a ${correo.para}`);
      console.log(`     ${correo.asunto}`);
      console.log(`     ${correo.texto.split('\n').filter(Boolean).join('\n     ')}\n`);
    }
    return { enviado: true, proveedor: this.nombre };
  }

  ultimo(): Correo | undefined {
    return this.enviados[this.enviados.length - 1];
  }

  limpiar(): void {
    this.enviados = [];
    this.fallar = false;
  }
}

// =====================================================================
//  Construcción desde el entorno
// =====================================================================

export function proveedorDeEntorno(): ProveedorCorreo {
  const usuario = process.env.MAIL_USERNAME;
  const password = process.env.MAIL_PASSWORD;

  if (!usuario || !password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'MAIL_USERNAME y MAIL_PASSWORD son obligatorios en producción',
      );
    }
    // En desarrollo sin credenciales, el simulado imprime en consola:
    // así se puede seguir el flujo completo sin configurar nada.
    const simulado = new CorreoSimulado();
    simulado.mostrar = true;
    return simulado;
  }

  return new CorreoSmtp({
    host: process.env.MAIL_HOST ?? 'smtp.gmail.com',
    puerto: Number(process.env.MAIL_PORT ?? 587),
    usuario,
    password,
    remitente: process.env.MAIL_FROM ?? usuario,
    nombreRemitente: process.env.MAIL_FROM_NAME ?? 'Salas de apuestas',
  });
}

// =====================================================================
//  Plantillas
// =====================================================================

/**
 * El correo se ve en clientes que no soportan CSS moderno, así que
 * todo va en estilos por línea y sobre tablas. Es feo de escribir pero
 * es lo único que se ve igual en Gmail, Outlook y el móvil.
 */
const VERDE = '#10715A';
const TINTA = '#16211C';
const TENUE = '#5E6E67';
const LINEA = '#DCE5E1';
const PAPEL = '#F4F7F5';

interface DatosPlantilla {
  titulo: string;
  saludo: string;
  cuerpo: string[];
  boton?: { texto: string; url: string };
  recuadro?: { rotulo: string; valor: string; nota?: string };
  cierre?: string;
  aviso?: string;
}

function armar(d: DatosPlantilla, marca: string): { html: string; texto: string } {
  const html = `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${d.titulo}</title></head>
<body style="margin:0;padding:0;background:${PAPEL};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"
  style="background:${PAPEL};padding:32px 16px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
    style="max-width:520px;background:#FFFFFF;border:1px solid ${LINEA};border-radius:10px;overflow:hidden;">

    <tr><td style="background:${VERDE};padding:22px 32px;">
      <div style="font:600 17px/1.2 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;
        color:#FFFFFF;letter-spacing:-.3px;">${marca}</div>
    </td></tr>

    <tr><td style="padding:32px;">
      <h1 style="margin:0 0 6px;font:700 21px/1.25 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;
        color:${TINTA};letter-spacing:-.5px;">${d.titulo}</h1>
      <p style="margin:0 0 20px;font:400 15px/1.55 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;
        color:${TENUE};">${d.saludo}</p>

      ${d.cuerpo.map(p => `<p style="margin:0 0 14px;font:400 15px/1.6 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${TINTA};">${p}</p>`).join('')}

      ${d.recuadro ? `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
        style="margin:22px 0;background:${PAPEL};border:1px solid ${LINEA};border-radius:8px;">
        <tr><td style="padding:18px 20px;text-align:center;">
          <div style="font:700 10px/1 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;
            color:${TENUE};letter-spacing:1.2px;text-transform:uppercase;margin-bottom:10px;">
            ${d.recuadro.rotulo}</div>
          <div style="font:600 24px/1.2 'SF Mono',Menlo,Consolas,monospace;
            color:${TINTA};letter-spacing:1px;">${d.recuadro.valor}</div>
          ${d.recuadro.nota ? `<div style="margin-top:9px;font:400 12px/1.4 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${TENUE};">${d.recuadro.nota}</div>` : ''}
        </td></tr>
      </table>` : ''}

      ${d.boton ? `
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
        <tr><td style="background:${VERDE};border-radius:7px;">
          <a href="${d.boton.url}" style="display:inline-block;padding:12px 26px;
            font:600 15px/1 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;
            color:#FFFFFF;text-decoration:none;">${d.boton.texto}</a>
        </td></tr>
      </table>` : ''}

      ${d.cierre ? `<p style="margin:20px 0 0;font:400 14px/1.55 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${TENUE};">${d.cierre}</p>` : ''}
    </td></tr>

    ${d.aviso ? `
    <tr><td style="padding:16px 32px;background:${PAPEL};border-top:1px solid ${LINEA};">
      <p style="margin:0;font:400 12.5px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${TENUE};">
        ${d.aviso}</p>
    </td></tr>` : ''}

  </table>
  <p style="margin:18px 0 0;font:400 11.5px/1.5 -apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:${TENUE};">
    Este correo se envió automáticamente. No respondas a esta dirección.</p>
</td></tr></table></body></html>`;

  const texto = [
    d.titulo, '', d.saludo, '',
    ...d.cuerpo.map(p => p.replace(/<[^>]+>/g, '')),
    d.recuadro ? `\n${d.recuadro.rotulo}: ${d.recuadro.valor}` : '',
    d.recuadro?.nota ?? '',
    d.boton ? `\n${d.boton.texto}: ${d.boton.url}` : '',
    d.cierre ? `\n${d.cierre.replace(/<[^>]+>/g, '')}` : '',
    d.aviso ? `\n${d.aviso.replace(/<[^>]+>/g, '')}` : '',
  ].filter(Boolean).join('\n');

  return { html, texto };
}

export const MARCA = process.env.APP_NOMBRE ?? 'Salas de apuestas';

export function plantillaInvitacion(datos: {
  alias: string;
  password: string;
  url: string;
  horas: number;
  roles: string[];
}): Correo & { plantilla: string } {
  const { html, texto } = armar({
    titulo: 'Tu cuenta está lista',
    saludo: `Hola ${datos.alias}, te crearon una cuenta en el panel.`,
    cuerpo: [
      datos.roles.length
        ? `Vas a poder trabajar en: <strong>${datos.roles.join(', ')}</strong>.`
        : 'Ya puedes entrar con tus datos.',
      'Esta es tu contraseña temporal. Al entrar te vamos a pedir que elijas una propia.',
    ],
    recuadro: {
      rotulo: 'Contraseña temporal',
      valor: datos.password,
      nota: `Vence en ${datos.horas} horas`,
    },
    boton: { texto: 'Entrar al panel', url: datos.url },
    cierre: 'Si no esperabas este correo, avísale a quien administra el sistema.',
    aviso: 'Nunca compartas tu contraseña. Nadie del equipo va a pedírtela.',
  }, MARCA);

  return {
    para: '',
    asunto: `Tu cuenta en ${MARCA}`,
    html, texto,
    plantilla: 'INVITACION',
  };
}

export function plantillaRecuperacion(datos: {
  alias: string;
  url: string;
  minutos: number;
  ip?: string;
}): Correo & { plantilla: string } {
  const { html, texto } = armar({
    titulo: 'Recupera tu contraseña',
    saludo: `Hola ${datos.alias}, alguien pidió restablecer tu contraseña.`,
    cuerpo: [
      `El enlace funciona una sola vez y vence en <strong>${datos.minutos} minutos</strong>.`,
    ],
    boton: { texto: 'Elegir contraseña nueva', url: datos.url },
    cierre: datos.ip
      ? `La solicitud vino desde la dirección ${datos.ip}.`
      : undefined,
    aviso: 'Si no fuiste tú, ignora este correo: tu contraseña actual sigue funcionando.',
  }, MARCA);

  return {
    para: '',
    asunto: 'Recupera tu contraseña',
    html, texto,
    plantilla: 'RECUPERACION',
  };
}

export function plantillaAlerta(datos: {
  alias: string;
  que: string;
  cuando: string;
  ip?: string;
}): Correo & { plantilla: string } {
  const { html, texto } = armar({
    titulo: 'Cambio en tu cuenta',
    saludo: `Hola ${datos.alias}, te avisamos de un cambio importante.`,
    cuerpo: [`<strong>${datos.que}</strong>`, `Ocurrió el ${datos.cuando}.`],
    cierre: datos.ip ? `Desde la dirección ${datos.ip}.` : undefined,
    aviso: 'Si no fuiste tú, cambia tu contraseña ahora mismo y avisa al administrador.',
  }, MARCA);

  return {
    para: '',
    asunto: 'Cambio en tu cuenta',
    html, texto,
    plantilla: 'ALERTA',
  };
}

export function plantillaSegundoFactor(datos: {
  alias: string;
  codigos: string[];
}): Correo & { plantilla: string } {
  const { html, texto } = armar({
    titulo: 'Segundo factor activado',
    saludo: `Hola ${datos.alias}, ya tienes verificación en dos pasos.`,
    cuerpo: [
      'Guarda estos códigos de respaldo en un lugar seguro. Cada uno sirve una sola vez, y son la única forma de entrar si pierdes el teléfono.',
      `<span style="font-family:'SF Mono',Menlo,Consolas,monospace;font-size:15px;letter-spacing:1px;">${datos.codigos.join(' &nbsp; ')}</span>`,
    ],
    aviso: 'No los guardes en el mismo teléfono donde tienes la aplicación de códigos.',
  }, MARCA);

  return {
    para: '',
    asunto: 'Tus códigos de respaldo',
    html, texto,
    plantilla: 'SEGUNDO_FACTOR',
  };
}
