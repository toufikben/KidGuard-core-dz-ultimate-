package com.kidguard.app;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;

public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "KidGuardBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent != null) {
            String action = intent.getAction();
            Log.i(TAG, "Received broadcast intent action: " + action);
            
            if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
                "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
                "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
                
                Log.i(TAG, "Device reboot detected. Starting KidGuard Foreground Service and MainActivity...");

                // KidGuardForegroundService is declared with
                // foregroundServiceType="location" - starting it without
                // already holding location permission throws a
                // SecurityException on Android 14+ (this is also what caused
                // the app-crash-on-launch bug fixed in MainActivity; see the
                // comment there). Skip the attempt entirely if permission
                // isn't granted yet rather than throwing-and-catching an
                // exception on every single boot.
                boolean hasLocationPermission =
                    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED
                    || ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED;

                if (hasLocationPermission) {
                    Intent serviceIntent = new Intent(context, KidGuardForegroundService.class);
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            context.startForegroundService(serviceIntent);
                        } else {
                            context.startService(serviceIntent);
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to start Foreground Service on boot: " + e.getMessage(), e);
                    }
                } else {
                    Log.i(TAG, "Location permission not yet granted - skipping foreground service start on boot.");
                }

                // Launch MainActivity
                Intent launchIntent = new Intent(context, MainActivity.class);
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                
                try {
                    context.startActivity(launchIntent);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to launch MainActivity on boot: " + e.getMessage(), e);
                }
            }
        }
    }
}
