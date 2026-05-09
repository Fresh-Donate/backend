import fp from 'fastify-plugin';
import { TelemetryService } from '@/services/telemetry.service';
import { config } from '@/config';

const HEARTBEAT_INTERVAL_MS = 24 * 60 * 60 * 1000;

export default fp(async (fastify) => {
  const telemetry = new TelemetryService();

  fastify.decorate('telemetry', {
    instance: telemetry,
    onToggle: async (enabled: boolean) => {
      // Send the marker BEFORE going silent so the dashboard can see opt-outs.
      if (!enabled) {
        await telemetry.track('telemetry_disabled');
      } else {
        await telemetry.track('telemetry_enabled');
      }
    },
  });

  fastify.addHook('onRequest', async (request) => {
    const header = request.headers['x-fd-client'];
    if (typeof header !== 'string') return;
    // Format: `name/version` (e.g. `panel/1.1.0`). Tolerate stray spaces.
    const [name, version] = header.split('/').map((s) => s.trim());
    if (name && version) {
      telemetry.recordClient(name, version);
    }
  });

  // Defer the boot event a tick so the DB connection has a chance to come up
  // before we try to read settings.installation_id.
  fastify.addHook('onReady', async () => {
    setTimeout(() => {
      void telemetry.track('app_started');
    }, 2000);
  });

  if (config.telemetry.disabled) {
    fastify.log.info('Telemetry disabled via env (APTABASE_DISABLED/SKIP_TELEMETRY).');
    return;
  }

  const handle = setInterval(() => {
    void telemetry.track('heartbeat');
  }, HEARTBEAT_INTERVAL_MS);
  handle.unref();

  fastify.addHook('onClose', async () => {
    clearInterval(handle);
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    telemetry: {
      instance: TelemetryService;
      onToggle: (enabled: boolean) => Promise<void>;
    };
  }
}
