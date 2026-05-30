import { type FastifyPluginAsync } from 'fastify';
import { SettingsService } from '@/services/settings.service';
import { EmailService, RECEIPT_PLACEHOLDERS } from '@/services/email.service';
import { ValidationError } from '@/core';
import type { SettingsDto, ReceiptTemplate } from '@/types';

const settingsRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  const service = new SettingsService();
  const emailService = new EmailService();

  fastify.get('/', { onRequest: [fastify.authenticate] }, async () => {
    return service.get();
  });

  fastify.put<{
    Body: {
      demo_payments?: boolean;
      delivery_method?: string;
      rcon_config?: { host?: string; port?: number; password?: string };
      plugin_config?: { token?: string };
      base_currency?: 'RUB' | 'USD' | 'EUR';
      currency_rates?: Record<string, number>;
      telemetry_enabled?: boolean;
      smtp_config?: {
        enabled?: boolean;
        host?: string;
        port?: number;
        secure?: boolean;
        user?: string;
        password?: string;
        fromEmail?: string;
        fromName?: string;
      };
      receipt_template?: { subject?: string; html?: string };
    };
  }>('/', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          demo_payments: { type: 'boolean' as const },
          delivery_method: { type: 'string' as const, enum: ['rcon', 'plugin'] },
          rcon_config: {
            type: 'object' as const,
            properties: {
              host: { type: 'string' as const, maxLength: 256 },
              port: { type: 'integer' as const, minimum: 1, maximum: 65535 },
              password: { type: 'string' as const, maxLength: 256 },
            },
          },
          plugin_config: {
            type: 'object' as const,
            properties: {
              token: { type: 'string' as const, maxLength: 64 },
            },
          },
          base_currency: { type: 'string' as const, enum: ['RUB', 'USD', 'EUR'] },
          currency_rates: {
            type: 'object' as const,
            additionalProperties: { type: 'number' as const, minimum: 0, maximum: 100000 },
          },
          telemetry_enabled: { type: 'boolean' as const },
          smtp_config: {
            type: 'object' as const,
            properties: {
              enabled: { type: 'boolean' as const },
              host: { type: 'string' as const, maxLength: 256 },
              port: { type: 'integer' as const, minimum: 1, maximum: 65535 },
              secure: { type: 'boolean' as const },
              user: { type: 'string' as const, maxLength: 256 },
              password: { type: 'string' as const, maxLength: 512 },
              fromEmail: { type: 'string' as const, maxLength: 256 },
              fromName: { type: 'string' as const, maxLength: 128 },
            },
          },
          receipt_template: {
            type: 'object' as const,
            properties: {
              subject: { type: 'string' as const, maxLength: 512 },
              html: { type: 'string' as const, maxLength: 100000 },
            },
          },
        },
      },
    },
  }, async (request) => {
    const before = await service.get();
    const after = await service.update(request.body as Partial<SettingsDto>);

    if (before.telemetry_enabled !== after.telemetry_enabled) {
      await fastify.telemetry?.onToggle(after.telemetry_enabled);
    }

    return after;
  });

  fastify.get('/receipt/placeholders', { onRequest: [fastify.authenticate] }, async () => {
    return { placeholders: RECEIPT_PLACEHOLDERS };
  });

  fastify.post<{
    Body: {
      template?: { subject?: string; html?: string };
    };
  }>('/receipt/preview', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        properties: {
          template: {
            type: 'object' as const,
            properties: {
              subject: { type: 'string' as const, maxLength: 512 },
              html: { type: 'string' as const, maxLength: 100000 },
            },
          },
        },
      },
    },
  }, async (request) => {
    const settings = await service.get();
    const template: ReceiptTemplate = {
      subject: request.body.template?.subject ?? settings.receipt_template.subject,
      html: request.body.template?.html ?? settings.receipt_template.html,
    };
    return emailService.renderPreview(template);
  });

  fastify.post<{ Body: { to: string } }>('/smtp/test', {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: 'object' as const,
        required: ['to'],
        properties: {
          to: { type: 'string' as const, format: 'email', maxLength: 256 },
        },
      },
    },
  }, async (request, reply) => {
    try {
      await emailService.sendTestEmail(request.body.to);
      return { ok: true };
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.code(400).send({ error: err.message });
      }
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(502).send({ error: `SMTP error: ${message}` });
    }
  });
};

export default settingsRoutes;
