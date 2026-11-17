// Browser Push Notification helper

export async function requestPushPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied';
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Send token registration to backend
      const dummyPushToken = `web-push-token-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
      fetch('/api/notifications/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'parent-1',
          token: dummyPushToken,
          platform: 'web-browser',
        }),
      }).catch(() => {});
    }
    return permission;
  } catch {
    return 'denied';
  }
}

export function showSystemNotification(title: string, body: string, tag?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: tag || 'bus-update',
      });
    } catch {
      // Notification might fail in some contexts
    }
  }
}
