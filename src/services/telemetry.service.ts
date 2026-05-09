import os from 'os';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import axios from 'axios';
import { sequelize } from '@/config/database';
import { config } from '@/config';
import { PaymentProvider } from '@/models/payment-provider.model';
import { SettingsService } from '@/services/settings.service';

function readBackendVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'package.json');
    if (fs.existsSync(candidate)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(candidate, 'utf8')) as { version?: string };
        if (pkg.version) return pkg.version;
      } catch { /* keep walking */ }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return '0.0.0';
}

type AptabaseEvent = {
  timestamp: string;
  sessionId: string;
  eventName: string;
  systemProps: {
    isDebug: boolean;
    osName: string;
    osVersion: string;
    locale: string;
    appVersion: string;
    sdkVersion: string;
  };
  props?: Record<string, string | number | boolean>;
};

function newSessionId(): string {
  return crypto.randomUUID();
}

export interface ClientVersion {
  version: string;
  lastSeen: number;
}

export class TelemetryService {
  private readonly settingsService = new SettingsService();
  private readonly clientVersions = new Map<string, ClientVersion>();
  private readonly appVersion = readBackendVersion();
  private readonly sdkVersion = `fresh-donate-backend@${this.appVersion}`;
  private readonly axios = axios.create({
    baseURL: config.telemetry.host,
    timeout: 5000,
    headers: {
      'App-Key': config.telemetry.appKey,
      'Content-Type': 'application/json',
    },
  });

  recordClient(name: string, version: string): void {
    const trimmedName = name.trim().toLowerCase();
    const trimmedVersion = version.trim();
    if (!trimmedName || !trimmedVersion) return;
    if (trimmedName.length > 32 || trimmedVersion.length > 32) return;
    this.clientVersions.set(trimmedName, { version: trimmedVersion, lastSeen: Date.now() });
  }

  getClients(): Record<string, ClientVersion> {
    return Object.fromEntries(this.clientVersions.entries());
  }

  async track(eventName: string, extraProps: Record<string, string | number | boolean> = {}): Promise<void> {
    if (config.telemetry.disabled) return;

    let settings;
    try {
      settings = await this.settingsService.get();
    } catch {
      return;
    }

    if (!settings.telemetry_enabled && eventName !== 'telemetry_disabled') return;
    if (!settings.installation_id) return;

    const baseProps = await this.collectBaseProps(settings.installation_id);
    const props = { ...baseProps, ...extraProps };

    const event: AptabaseEvent = {
      timestamp: new Date().toISOString(),
      sessionId: newSessionId(),
      eventName,
      systemProps: {
        isDebug: process.env.NODE_ENV !== 'production',
        osName: os.platform(),
        osVersion: os.release(),
        locale: process.env.LANG || 'unknown',
        appVersion: this.appVersion,
        sdkVersion: this.sdkVersion,
      },
      props,
    };

    try {
      await this.axios.post('/api/v0/event', event);
    } catch {
      // Telemetry must never affect server stability - swallow and move on.
    }
  }

  private async collectBaseProps(installationId: string): Promise<Record<string, string | number | boolean>> {
    const props: Record<string, string | number | boolean> = {
      installation_id: installationId,
      backend_version: this.appVersion,
      node_version: process.versions.node,
      arch: os.arch(),
    };

    try {
      const settings = await this.settingsService.get();
      props.delivery_method = settings.delivery_method;
      props.demo_payments = settings.demo_payments;
      props.base_currency = settings.base_currency;
    } catch {
      // ignore - partial props are fine
    }

    try {
      const providers = await PaymentProvider.findAll({
        attributes: ['providerId', 'enabled'],
      });
      for (const p of providers) {
        props[`provider_${p.providerId}`] = p.enabled;
      }
    } catch {
      // ignore
    }

    try {
      const [result] = await sequelize.query('SELECT version() as version');
      const row = (result as Array<{ version: string }>)[0];
      if (row?.version) {
        props.postgres_version = row.version.split(' ').slice(0, 2).join(' ');
      }
    } catch {
      // ignore
    }

    for (const [name, info] of this.clientVersions.entries()) {
      props[`client_${name}_version`] = info.version;
      props[`client_${name}_last_seen_minutes`] = Math.round((Date.now() - info.lastSeen) / 60000);
    }

    return props;
  }
}
