import { isAxiosError } from 'axios';

const MAX_LENGTH = 300;

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}

function bodyText(body: unknown): string | undefined {
  if (typeof body === 'string') {
    const text = body.trim();
    return text && !text.startsWith('<') ? text : undefined;
  }
  if (body && typeof body === 'object') return JSON.stringify(body);
  return undefined;
}

export function describeHttpError(error: unknown, pick: (body: any) => unknown[] = () => []): string {
  if (!isAxiosError(error)) return error instanceof Error ? error.message : String(error);
  const body = error.response?.data;
  const text = (firstText(pick(body)) ?? bodyText(body) ?? error.message).slice(0, MAX_LENGTH);
  const status = error.response?.status;
  return status ? `${status} ${text}` : text;
}
