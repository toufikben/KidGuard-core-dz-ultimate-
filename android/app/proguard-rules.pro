# Add project specific ProGuard rules here.

# Capacitor & Plugins Keep Rules
-keep public class com.getcapacitor.* { public *; }
-keep class com.getcapacitor.** { *; }
-keep class * extends com.getcapacitor.Plugin {
    public *;
}
-keep class * extends com.getcapacitor.BridgeActivity {
    public *;
}

# AndroidX & WebView Keep Rules
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Keep Capacitor Plugins
-keep class com.capacitorjs.plugins.** { *; }
-keep class com.kidguard.app.** { *; }
