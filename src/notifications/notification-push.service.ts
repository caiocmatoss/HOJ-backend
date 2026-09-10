import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from '../push/push.service';
import type { PushMessage, PushSendResult } from '../push/push.types';

const preferenceByType: Record<string, 'friendRequests' | 'groupInvites' | 'messages' | undefined> = {
  FRIEND_REQUEST: 'friendRequests', FRIEND_ACCEPTED: 'friendRequests', GROUP_INVITE: 'groupInvites', GROUP_INVITE_ACCEPTED: 'groupInvites', GROUP_MESSAGE: 'messages', DIRECT_MESSAGE: 'messages',
};
type NotificationForPush = { id: string; userId: string; type: string; title: string; message: string; referenceId: string | null; referenceType: string | null };

@Injectable()
export class NotificationPushService {
  constructor(private readonly prisma: PrismaService, private readonly pushService: PushService) {}
  async dispatch(notification: NotificationForPush): Promise<void> { await this.dispatchMany([notification]); }
  async dispatchMany(notifications: NotificationForPush[]): Promise<void> {
    const eligible = notifications.filter((n) => Boolean(preferenceByType[n.type])); if (!eligible.length) return;
    const userIds = [...new Set(eligible.map((n) => n.userId))];
    const [preferences, devices] = await Promise.all([
      this.prisma.notificationPreferences.findMany({ where: { userId: { in: userIds } }, select: { userId: true, pushEnabled: true, friendRequests: true, groupInvites: true, messages: true } }),
      this.prisma.pushDevice.findMany({ where: { userId: { in: userIds }, disabledAt: null }, select: { id: true, userId: true, token: true } }),
    ]);
    const prefsByUser = new Map(preferences.map((p) => [p.userId, p])); const devicesByUser = new Map<string, typeof devices>();
    for (const d of devices) { const list = devicesByUser.get(d.userId) ?? []; list.push(d); devicesByUser.set(d.userId, list); }
    const messages: PushMessage[] = []; const messageByDevice = new Map<string, NotificationForPush>();
    for (const n of eligible) {
      const pref = preferenceByType[n.type]!; const settings = prefsByUser.get(n.userId); if (settings && (!settings.pushEnabled || !settings[pref])) continue;
      const data: Record<string, string> = { notificationId: n.id, type: n.type }; if (n.referenceId) data.referenceId = n.referenceId; if (n.referenceType) data.referenceType = n.referenceType;
      for (const d of devicesByUser.get(n.userId) ?? []) { messages.push({ deviceId: d.id, token: d.token, title: n.title, body: n.message, data }); messageByDevice.set(d.id, n); }
    }
    if (!messages.length) return;
    let results: PushSendResult[]; try { results = await this.pushService.sendBatch(messages); } catch { return; }
    const accepted = results.filter((r) => r.status === 'ACCEPTED' && r.ticketId).map((r) => ({ notificationId: messageByDevice.get(r.deviceId)?.id, pushDeviceId: r.deviceId, ticketId: r.ticketId!, status: 'PENDING' as const })).filter((r) => r.notificationId);
    if (accepted.length) { try { await (this.prisma as any).pushDelivery.createMany({ data: accepted, skipDuplicates: true }); } catch { /* operational metadata must not break domain */ } }
    const invalidIds = results.filter((r) => r.status === 'INVALID_TOKEN').map((r) => r.deviceId); if (invalidIds.length) { try { await this.prisma.pushDevice.updateMany({ where: { id: { in: invalidIds }, disabledAt: null }, data: { disabledAt: new Date() } }); } catch { /* best-effort device hygiene */ } }
  }
}