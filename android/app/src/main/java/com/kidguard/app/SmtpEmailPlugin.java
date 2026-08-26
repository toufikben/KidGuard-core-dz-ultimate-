package com.kidguard.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Properties;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.mail.Authenticator;
import javax.mail.Message;
import javax.mail.PasswordAuthentication;
import javax.mail.Session;
import javax.mail.Transport;
import javax.mail.internet.InternetAddress;
import javax.mail.internet.MimeMessage;

@CapacitorPlugin(name = "SmtpEmail")
public class SmtpEmailPlugin extends Plugin {
    private static final String KEY_ALIAS = "kidguard_smtp_key_v2";
    private static final String PREFS = "kidguard_smtp_secure_v2";
    private static final String KEY_CIPHERTEXT = "password_ciphertext";
    private static final String KEY_IV = "password_iv";
    private static final String KEY_IS_SECURE = "is_secure_mode";
    private static final String KEY_PLAIN = "password_plain";

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance("AndroidKeyStore"); ks.load(null);
        if (!ks.containsAlias(KEY_ALIAS)) {
            KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            kg.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) ks.getEntry(KEY_ALIAS, null)).getSecretKey();
    }

    private void savePassword(String password) {
        try {
            byte[] iv = new byte[12]; new java.security.SecureRandom().nextBytes(iv);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); 
            cipher.init(Cipher.ENCRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            byte[] encrypted = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
            
            prefs().edit()
                .putString(KEY_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .putString(KEY_IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .putBoolean(KEY_IS_SECURE, true)
                .remove(KEY_PLAIN)
                .apply();
        } catch (Exception e) {
            android.util.Log.e("SmtpEmailPlugin", "KeyStore encryption failed, falling back to plain storage: " + e.getMessage());
            // Fallback: Save as plain text if KeyStore is unavailable on this device
            prefs().edit()
                .putString(KEY_PLAIN, password)
                .putBoolean(KEY_IS_SECURE, false)
                .remove(KEY_CIPHERTEXT)
                .remove(KEY_IV)
                .apply();
        }
    }

    private String readPassword() {
        try {
            if (!prefs().getBoolean(KEY_IS_SECURE, true)) {
                return prefs().getString(KEY_PLAIN, "");
            }
            String encrypted = prefs().getString(KEY_CIPHERTEXT, null);
            String ivText = prefs().getString(KEY_IV, null);
            if (encrypted == null || ivText == null) return null;
            
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); 
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) {
            android.util.Log.e("SmtpEmailPlugin", "Decryption failed: " + e.getMessage());
            return prefs().getString(KEY_PLAIN, ""); // Try fallback read
        }
    }

    @PluginMethod public void saveCredentials(PluginCall call) {
        try {
            String password = call.getString("password", "");
            if (password != null && !password.isEmpty()) {
                savePassword(password);
            }
            prefs().edit()
                .putString("host", call.getString("host", "smtp.gmail.com"))
                .putInt("port", call.getInt("port", 587))
                .putString("username", call.getString("username", ""))
                .apply();
            com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
            ret.put("saved", true);
            ret.put("storageMode", prefs().getBoolean(KEY_IS_SECURE, true) ? "keystore" : "fallback");
            call.resolve(ret);
        } catch (Exception e) {
            android.util.Log.e("SmtpEmailPlugin", "Save error: " + e.getMessage());
            call.reject("تعذر حفظ إعدادات SMTP: " + e.getMessage());
        }
    }

    @PluginMethod public void clearCredentials(PluginCall call) { prefs().edit().clear().apply(); call.resolve(); }
    
    @PluginMethod public void hasCredentials(PluginCall call) { 
        boolean configured = (prefs().contains(KEY_CIPHERTEXT) || prefs().contains(KEY_PLAIN)) && !prefs().getString("username", "").isEmpty();
        call.resolve(new com.getcapacitor.JSObject().put("configured", configured)); 
    }

    @PluginMethod public void send(PluginCall call) {
        new Thread(() -> {
            try {
                String host = prefs().getString("host", "smtp.gmail.com"); 
                int port = prefs().getInt("port", 587); 
                String username = prefs().getString("username", ""); 
                String password = readPassword();
                
                if (username == null || username.isEmpty() || password == null || password.isEmpty()) {
                    throw new IllegalStateException("لم يتم إعداد بيانات SMTP بشكل صحيح");
                }
                
                Properties props = new Properties(); 
                props.put("mail.smtp.host", host); 
                props.put("mail.smtp.port", String.valueOf(port)); 
                props.put("mail.smtp.auth", "true"); 
                props.put("mail.smtp.starttls.enable", "true"); 
                props.put("mail.smtp.ssl.protocols", "TLSv1.2"); 
                props.put("mail.smtp.connectiontimeout", "15000"); 
                props.put("mail.smtp.timeout", "15000");
                
                Session session = Session.getInstance(props, new Authenticator() { 
                    protected PasswordAuthentication getPasswordAuthentication() { 
                        return new PasswordAuthentication(username, password); 
                    } 
                });
                
                MimeMessage msg = new MimeMessage(session); 
                msg.setFrom(new InternetAddress(username, "KidGuard")); 
                msg.setRecipients(Message.RecipientType.TO, InternetAddress.parse(call.getString("recipient", ""))); 
                msg.setSubject(call.getString("subject", "KidGuard Alert"), "UTF-8"); 
                msg.setText(call.getString("body", ""), "UTF-8"); 
                
                Transport.send(msg);
                call.resolve(new com.getcapacitor.JSObject().put("sent", true));
            } catch (Exception e) { 
                android.util.Log.e("SmtpEmailPlugin", "Send error: " + e.getMessage());
                call.reject("فشل إرسال SMTP: " + e.getMessage()); 
            }
        }).start();
    }
}
