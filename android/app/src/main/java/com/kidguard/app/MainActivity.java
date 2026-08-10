package com.kidguard.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 2001;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DirectSmsPlugin.class);
        super.onCreate(savedInstanceState);
        maybeRequestNotificationPermission();
        maybeStartForegroundService();
    }

    /**
     * POST_NOTIFICATIONS is a runtime ("dangerous") permission on Android 13+
     * (API 33+). Without requesting it, KidGuardForegroundService's persistent
     * "KidGuard Protection" notification is silently suppressed by the system
     * - the foreground service itself still runs fine (this does NOT cause a
     * crash), but the user never sees the notification that's supposed to
     * show tracking is active. Nothing elsewhere in the app was requesting
     * this permission.
     */
    private void maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return; // Not a runtime permission before Android 13.
        }
        boolean hasNotificationPermission =
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED;
        if (!hasNotificationPermission) {
            ActivityCompat.requestPermissions(
                this,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_PERMISSION_REQUEST_CODE
            );
        }
    }

    /**
     * Only starts the background-tracking foreground service if location
     * permission has already been granted.
     *
     * KidGuardForegroundService is declared with
     * android:foregroundServiceType="location" in the manifest. On Android
     * 14+ (API 34+) starting a "location"-typed foreground service:
     *   1. requires the startForeground() call to explicitly pass that same
     *      type (see KidGuardForegroundService.showNotification()) - a
     *      mismatch throws MissingForegroundServiceTypeException, and
     *   2. requires the app to already hold ACCESS_FINE_LOCATION /
     *      ACCESS_COARSE_LOCATION at the moment startForeground() is called
     *      - otherwise it throws a SecurityException.
     *
     * Previously this ran unconditionally in onCreate(), before the user had
     * ever been asked for location permission (that prompt only happens
     * later, from the WebView's own geolocation call) - so on a fresh
     * install, every single launch crashed instantly with a SecurityException
     * (visible as: tap the icon, a brief splash flash, then it closes with no
     * UI). The web layer's own tracking (navigator.geolocation.watchPosition,
     * which triggers Capacitor's normal permission prompt) still works
     * regardless of this service, so skipping the service start here is safe
     * - it will start automatically on a later launch once permission has
     * been granted through that flow.
     */
    private void maybeStartForegroundService() {
        boolean hasLocationPermission =
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;

        if (!hasLocationPermission) {
            return;
        }

        Intent serviceIntent = new Intent(this, KidGuardForegroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }
}
