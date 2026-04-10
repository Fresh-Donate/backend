import { Rcon } from 'rcon-client';
import { SettingsService } from './settings.service';

export interface RconResult {
  command: string;
  response: string;
  success: boolean;
}

export interface DeliveryLog {
  attempt: number;
  timestamp: string;
  success: boolean;
  results?: RconResult[];
  error?: string;
}

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
    variables: Record<string, string>,
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
        const command = this.resolveVariables(raw, variables);
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
      rcon.end();
    }
  }

  private resolveVariables(command: string, variables: Record<string, string>): string {
    let result = command;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replaceAll(`{${key}}`, value);
    }
    return result;
  }
}
