/**
 * Documentación OpenAPI (Swagger).
 *
 * Los esquemas salen de los MISMOS objetos zod que validan la entrada.
 * Es la única forma de que la documentación no mienta: si alguien
 * cambia una validación y olvida actualizar el doc, no puede pasar,
 * porque son el mismo objeto.
 *
 * Ver en:  http://localhost:3000/docs
 */

import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z, type ZodType } from 'zod';

/** Convierte un esquema zod a JSON Schema y le quita el `$schema`,
 *  que OpenAPI 3 no acepta dentro de un `requestBody`. */
export function jsonSchema(esquema: ZodType): Record<string, unknown> {
  const { $schema, ...resto } = z.toJSONSchema(esquema) as Record<string, unknown>;
  return resto;
}

/** Forma estándar de todos los errores de la API. */
export const ESQUEMA_ERROR = {
  type: 'object',
  properties: {
    error: {
      type: 'object',
      properties: {
        codigo: {
          type: 'string',
          description: 'Para que la app reaccione, no para mostrar al usuario',
        },
        mensaje: {
          type: 'string',
          description: 'Texto listo para mostrar en pantalla',
        },
        accion: {
          type: 'string',
          enum: ['RECARGAR', 'REFRESCAR', 'REINTENTAR', 'CONTACTAR_SOPORTE'],
          description: 'Qué debería hacer la app a continuación',
        },
        // Sin declararlo aquí, Fastify lo BORRA al serializar: el
        // esquema de respuesta descarta toda propiedad que no figure.
        // El formulario se quedaría sin saber qué campo corregir.
        detalle: {
          type: 'string',
          description: 'Descripción técnica del rechazo, cuando no hay detalle por campo.',
        },
        detalles: {
          type: 'array',
          description: 'Qué campos fallaron. Solo en errores de validación.',
          items: {
            type: 'object',
            properties: {
              campo: { type: 'string' },
              problema: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

export const ESQUEMA_SALDO = {
  type: 'object',
  properties: {
    disponibleCentavos: {
      type: 'integer',
      description: 'Lo que puede usar o retirar, en la unidad mínima entera',
    },
    retenidoCentavos: {
      type: 'integer',
      description: 'Comprometido en salas sin resolver. Intocable.',
    },
    totalCentavos: { type: 'integer', description: 'disponible + retenido' },
    moneda: { type: 'string', examples: ['PEN'] },
    simbolo: { type: 'string', examples: ['S/'] },
    decimales: {
      type: 'integer',
      description:
        'Cuántos decimales tiene la moneda. 2 para PEN/USD, 0 para CLP/JPY. Divide el entero entre 10^decimales para mostrarlo.',
    },
  },
} as const;

export const ESQUEMA_BALANCE = {
  type: 'object',
  properties: {
    mercadoId: { type: 'string', format: 'uuid' },
    totalFavor: { type: 'integer' },
    totalContra: { type: 'integer' },
    participantes: { type: 'integer' },
    balanceado: { type: 'boolean' },
    falta: {
      type: ['object', 'null'],
      description:
        'Cuánto y de qué lado falta para que el mercado corra. Es lo que alimenta el botón Completar.',
      properties: {
        lado: { type: 'string', enum: ['A_FAVOR', 'EN_CONTRA'] },
        centavos: { type: 'integer' },
      },
    },
    moneda: { type: 'string' },
    simbolo: { type: 'string' },
  },
} as const;

/** Cabecera obligatoria en todo lo que mueve dinero. */
export const CABECERA_IDEMPOTENCIA = {
  type: 'object',
  properties: {
    'idempotency-key': {
      type: 'string',
      minLength: 8,
      maxLength: 200,
      description:
        'Identificador único de ESTA acción. Reintentar la misma petición debe reusar la clave; una acción nueva lleva clave nueva. Sin ella, un reintento por timeout cobraría dos veces.',
    },
  },
  required: ['idempotency-key'],
} as const;

export async function registrarSwagger(app: FastifyInstance): Promise<void> {
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Salas de apuestas P2P',
        description: [
          'API de una plataforma donde los usuarios apuestan **entre ellos**, no contra la casa.',
          '',
          '**Cómo funciona el dinero:**',
          '- Todos los montos son enteros en **centavos**. `2000` = S/20.00',
          '- Al entrar a un mercado el dinero se *retiene*: baja el disponible, sube el retenido.',
          '- Los dos lados de un mercado deben sumar **lo mismo** para que corra.',
          '- Si no hay resultado (partido suspendido, sala incompleta), se devuelve el **100%** y la casa no cobra.',
          '',
          '**Idempotencia:** toda operación con dinero exige la cabecera `Idempotency-Key`.',
          '',
          '**Monedas:** cada país tiene la suya. Una sala **nunca mezcla monedas** — si uno pusiera S/20 y otro USD 20, no habría forma de decidir si el mercado está balanceado. Los montos vienen en la unidad mínima entera; usa `decimales` para mostrarlos.',
        ].join('\n'),
        version: '1.0.0',
      },
      servers: [{ url: 'http://localhost:3000', description: 'Desarrollo local' }],
      tags: [
        { name: 'auth', description: 'Registro e ingreso' },
        { name: 'salas', description: 'Muro y detalle de salas' },
        { name: 'apuestas', description: 'Entrar y salir de un mercado' },
        { name: 'cuenta', description: 'Perfil, saldo y movimientos' },
        { name: 'sistema', description: 'Estado del servicio' },
        { name: 'paises', description: 'Países habilitados y sus monedas' },
      ],
      components: {
        securitySchemes: {
          bearer: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'El token que devuelve /auth/registro o /auth/ingreso',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });
}
