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
