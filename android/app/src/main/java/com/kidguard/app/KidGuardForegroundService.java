package com.kidguard.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;

public class KidGuardForegroundService extends Service {
    private static final String CHANNEL_ID = "KidGuardForegroundChannel";
    private static final int NOTIFICATION_ID = 1337;
    public static final String ACTION_TOGGLE_MONITORING = "com.kidguard.app.ACTION_TOGGLE_MONITORING";
    
    private boolean isMonitoringActive = true;
    private BroadcastReceiver toggleReceiver;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        // Register broadcast receiver for notification action button
        toggleReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (ACTION_TOGGLE_MONITORING.equals(intent.getAction())) {
                    isMonitoringActive = !isMonitoringActive;
                    updateNotification();
                }
            }
        };

        IntentFilter filter = new IntentFilter(ACTION_TOGGLE_MONITORING);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(toggleReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(toggleReceiver, filter);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        showNotification();
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (toggleReceiver != null) {
            try {
                unregisterReceiver(toggleReceiver);
            } catch (Exception e) {
                // Ignore if already unregistered
            }
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // Restart service and broadcast/alarm when swiped away from recent apps
        Intent restartServiceIntent = new Intent(getApplicationContext(), KidGuardForegroundService.class);
        restartServiceIntent.setPackage(getPackageName());
        
        PendingIntent restartServicePendingIntent = PendingIntent.getService(
            getApplicationContext(),
            1,
            restartServiceIntent,
            PendingIntent.FLAG_ONE_SHOT | PendingIntent.FLAG_IMMUTABLE
        );

        android.app.AlarmManager alarmService = (android.app.AlarmManager) getApplicationContext().getSystemService(Context.ALARM_SERVICE);
        if (alarmService != null) {
            alarmService.setExact(
                android.app.AlarmManager.ELAPSED_REALTIME_WAKEUP,
                android.os.SystemClock.elapsedRealtime() + 1000,
                restartServicePendingIntent
            );
        }
        
        super.onTaskRemoved(rootIntent);
    }

    private void showNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Intent toggleIntent = new Intent(ACTION_TOGGLE_MONITORING);
        PendingIntent togglePendingIntent = PendingIntent.getBroadcast(
            this,
            1,
            toggleIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        String statusText = isMonitoringActive ? "Telemetry monitoring is active." : "Telemetry monitoring is paused.";
        String actionButtonTitle = isMonitoringActive ? "Pause" : "Resume";

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("KidGuard Protection")
            .setContentText(statusText)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(pendingIntent)
            .addAction(android.R.drawable.ic_media_pause, actionButtonTitle, togglePendingIntent)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build();

        // The manifest declares this service with
        // android:foregroundServiceType="location", so on Android 10+ (API 29+)
        // that same type must be passed explicitly here - the plain
        // startForeground(id, notification) overload (no type) throws
        // MissingForegroundServiceTypeException on Android 14+ and crashes the
        // app the instant this service starts.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void updateNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            Intent notificationIntent = new Intent(this, MainActivity.class);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            Intent toggleIntent = new Intent(ACTION_TOGGLE_MONITORING);
            PendingIntent togglePendingIntent = PendingIntent.getBroadcast(
                this,
                1,
                toggleIntent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            String statusText = isMonitoringActive ? "Telemetry monitoring is active." : "Telemetry monitoring is paused.";
            String actionButtonTitle = isMonitoringActive ? "Pause" : "Resume";

            Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("KidGuard Protection")
                .setContentText(statusText)
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setContentIntent(pendingIntent)
                .addAction(android.R.drawable.ic_media_pause, actionButtonTitle, togglePendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .build();

            manager.notify(NOTIFICATION_ID, notification);
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID,
                "KidGuard Background Protection Service",
                NotificationManager.IMPORTANCE_LOW
            );
            serviceChannel.setDescription("Keeps KidGuard running persistently in the background.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(serviceChannel);
            }
        }
    }
}
