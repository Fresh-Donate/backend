import { Rcon } from 'rcon-client';
import { SettingsService } from './settings.service';
import { resolveCommandVariables, type CommandVariables } from '@/utils/command-variables';
import type { RconResult } from '@/types';

export class RconService {
  private settingsService = new SettingsService();

  async isConfigured(): Promise<boolean> {
    const settings = await this.settingsService.get();
    if (settings.delivery_method !== 'rcon') return false;
    const { host, password } = settings.rcon_config;
    return !!(host && password);
  }

  async executeCommands(
    commands: string[],
    variables: CommandVariables,
  ): Promise<RconResult[]> {
    const settings = await this.settingsService.get();

    if (settings.delivery_method !== 'rcon') {
      throw new Error('Delivery method is not RCON');
    }

    const { host, port, password } = settings.rcon_config;
    if (!host || !password) {
      throw new Error('RCON not configured: host or password is empty');
    }

    const rcon = new Rcon({ host, port, password, timeout: 5000 });

    try {
      await rcon.connect();

      const results: RconResult[] = [];
      for (const raw of commands) {
        const command = resolveCommandVariables(raw, variables);
        try {
          const response = await rcon.send(command);
          results.push({ command, response, success: true });
        } catch (err) {
          results.push({
            command,
            response: err instanceof Error ? err.message : String(err),
            success: false,
          });
        }
      }

      return results;
    } finally {
      void rcon.end();
    }
  }
}
