export type JsonSafeValue = string | number | boolean | null | JsonSafeValue[] | { [key: string]: JsonSafeValue };
export type PushMessage = { deviceId: string; token: string; title: string; body: string; data?: Record<string, JsonSafeValue> };
export type PushSendStatus = 'ACCEPTED' | 'INVALID_TOKEN' | 'TRANSIENT_ERROR' | 'DISABLED';
export type PushSendResult = { deviceId: string; status: PushSendStatus; ticketId?: string };
export type PushReceiptStatus = 'DELIVERED' | 'INVALID_TOKEN' | 'PERMANENT_ERROR' | 'TRANSIENT_ERROR';
export type PushReceiptResult = { ticketId: string; status: PushReceiptStatus; errorCode?: string };
export abstract class PushProvider {
  abstract sendBatch(messages: PushMessage[]): Promise<PushSendResult[]>;
  abstract getReceipts(ticketIds: string[]): Promise<PushReceiptResult[]>;
}