// Local offline Android reminder notifications (100% on-device, no cloud or external push service).
import { Application, Utils } from '@nativescript/core';

const CHANNEL_ID = 'baal_kore_reminders';
const NOTIF_ID = 1001;

function ensureChannel(ctx: android.content.Context): void {
  if (android.os.Build.VERSION.SDK_INT >= 26) {
    const nm = ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager;
    if (!nm.getNotificationChannel(CHANNEL_ID)) {
      const ch = new android.app.NotificationChannel(
        CHANNEL_ID,
        'תזכורות תרגול יומיות – בעל קורא',
        android.app.NotificationManager.IMPORTANCE_HIGH,
      );
      ch.setDescription('תזכורת יומית לשמירה על רצף הקריאה בתורה');
      nm.createNotificationChannel(ch);
    }
  }
}

/** Requests Android 13+ notification permission if needed. */
export function requestNotificationPermission(): void {
  if (typeof android === 'undefined') return;
  try {
    const act = Application.android.foregroundActivity || Application.android.startActivity;
    if (act && android.os.Build.VERSION.SDK_INT >= 33) {
      const perm = 'android.permission.POST_NOTIFICATIONS';
      if (act.checkSelfPermission(perm) !== android.content.pm.PackageManager.PERMISSION_GRANTED) {
        act.requestPermissions([perm], 701);
      }
    }
  } catch {
    // ignore in non-UI contexts
  }
}

/** Fires an immediate local Android notification (for testing or celebrating a milestone/reminder). */
export function sendLocalReminderNotification(streakDays: number, titleOverride?: string, bodyOverride?: string): boolean {
  if (typeof android === 'undefined') return false;
  try {
    const ctx = Utils.android.getApplicationContext() as android.content.Context;
    if (!ctx) return false;
    requestNotificationPermission();
    ensureChannel(ctx);

    const nm = ctx.getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager;
    const intent = ctx.getPackageManager().getLaunchIntentForPackage(ctx.getPackageName());
    const flags = android.os.Build.VERSION.SDK_INT >= 23 ? android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE : android.app.PendingIntent.FLAG_UPDATE_CURRENT;
    const pi = android.app.PendingIntent.getActivity(ctx, 0, intent, flags);

    const title = titleOverride ?? (streakDays > 0 ? `🔥 רצף של ${streakDays} ימים בבעל קורא!` : '📖 זמן לתרגול קריאה בתורה!');
    const body = bodyOverride ?? 'הרב מחכה לכם! קראו פסוק אחד בפרשת בראשית כדי לשמור על הרצף ולהרוויח מטבעות זהב 🪙';

    const builder =
      android.os.Build.VERSION.SDK_INT >= 26
        ? new android.app.Notification.Builder(ctx, CHANNEL_ID)
        : new android.app.Notification.Builder(ctx);

    builder
      .setSmallIcon(ctx.getApplicationInfo().icon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(new android.app.Notification.BigTextStyle().bigText(body))
      .setAutoCancel(true)
      .setContentIntent(pi);

    nm.notify(NOTIF_ID, builder.build());
    return true;
  } catch (e) {
    console.log('Notification error:', e);
    return false;
  }
}
