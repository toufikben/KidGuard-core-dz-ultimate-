package com.kidguard.app;

import android.Manifest;
import android.telephony.SmsManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;

@CapacitorPlugin(
    name = "DirectSms",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.SEND_SMS })
    }
)
public class DirectSmsPlugin extends Plugin {

    @PluginMethod
    public void send(PluginCall call) {
        if (getPermissionState("sms") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsPermissionCallback");
            return;
        }
        sendNow(call);
    }

    @PermissionCallback
    private void smsPermissionCallback(PluginCall call) {
        if (getPermissionState("sms") == com.getcapacitor.PermissionState.GRANTED) {
            sendNow(call);
        } else {
            call.reject("لم يتم منح صلاحية إرسال SMS");
        }
    }

    private void sendNow(PluginCall call) {
        String phoneNumber = call.getString("phoneNumber", "");
        String message = call.getString("message", "");
        if (phoneNumber.trim().isEmpty() || message.trim().isEmpty()) {
            call.reject("رقم الهاتف أو نص الرسالة فارغ");
            return;
        }

        try {
            SmsManager smsManager = SmsManager.getDefault();
            ArrayList<String> parts = smsManager.divideMessage(message);
            if (parts.size() > 1) {
                smsManager.sendMultipartTextMessage(phoneNumber, null, parts, null, null);
            } else {
                smsManager.sendTextMessage(phoneNumber, null, message, null, null);
            }
            JSObject result = new JSObject();
            result.put("sent", true);
            call.resolve(result);
        } catch (SecurityException error) {
            call.reject("صلاحية إرسال SMS غير متاحة", error);
        } catch (Exception error) {
            call.reject("تعذر إرسال SMS من الجهاز", error);
        }
    }
}
