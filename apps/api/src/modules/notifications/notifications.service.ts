import type { Notification } from "@prisma/client";
import { AppError, type NotificationDto, type NotificationListQuery } from "@justicegrid/shared";
import { toSkipTake } from "../../lib/pagination.js";
import { prisma } from "../../lib/prisma.js";

interface ActorContext {
  id: string;
}

function toNotificationDto(n: Notification): NotificationDto {
  return {
    id: n.id,
    userId: n.userId,
    type: n.type,
    title: n.title,
    body: n.body,
    relatedEntityType: n.relatedEntityType,
    relatedEntityId: n.relatedEntityId,
    isRead: n.isRead,
    readAt: n.readAt?.toISOString() ?? null,
    createdAt: n.createdAt.toISOString(),
  };
}

/** `GET /notifications` (spec §7): always implicitly scoped to the
 * caller — there is no cross-user notification listing, for any role. */
export async function listNotifications(
  actor: ActorContext,
  filter: NotificationListQuery,
): Promise<{ items: NotificationDto[]; total: number; unreadCount: number }> {
  const where: Record<string, unknown> = { userId: actor.id };
  if (filter.isRead !== undefined) where.isRead = filter.isRead;

  const [rows, total, unreadCount] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...toSkipTake(filter),
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: actor.id, isRead: false } }),
  ]);

  return { items: rows.map(toNotificationDto), total, unreadCount };
}

export async function markNotificationRead(
  actor: ActorContext,
  notificationId: string,
): Promise<NotificationDto> {
  const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!existing || existing.userId !== actor.id) {
    // Same NOT_FOUND for "doesn't exist" and "belongs to someone else" —
    // never leak that another user's notification ID is valid (spec
    // §8.4's IDOR principle applied here too, even though notifications
    // aren't cases).
    throw new AppError("NOT_FOUND", "Notification not found.");
  }
  if (existing.isRead) return toNotificationDto(existing);

  const updated = await prisma.notification.update({
    where: { id: notificationId },
    data: { isRead: true, readAt: new Date() },
  });
  return toNotificationDto(updated);
}

export async function markAllNotificationsRead(
  actor: ActorContext,
): Promise<{ updatedCount: number }> {
  const result = await prisma.notification.updateMany({
    where: { userId: actor.id, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });
  return { updatedCount: result.count };
}
