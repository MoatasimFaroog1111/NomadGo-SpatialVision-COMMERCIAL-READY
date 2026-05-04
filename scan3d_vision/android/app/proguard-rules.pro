# ============================================
# Scan3D Vision — ProGuard / R8 Rules
# ============================================

# --- Flutter Framework ---
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.** { *; }
-keep class io.flutter.util.** { *; }
-keep class io.flutter.view.** { *; }
-keep class io.flutter.** { *; }
-keep class io.flutter.plugins.** { *; }
-keep class io.flutter.embedding.** { *; }

# --- Flutter Method/Event Channels ---
-keep class * implements io.flutter.plugin.common.MethodChannel$MethodCallHandler { *; }
-keep class * implements io.flutter.plugin.common.EventChannel$StreamHandler { *; }
-keep class * implements io.flutter.plugin.common.BasicMessageChannel$MessageHandler { *; }
-keepclassmembers class * {
    public void onMethodCall(io.flutter.plugin.common.MethodCall, io.flutter.plugin.common.MethodChannel$Result);
    public void onListen(java.lang.Object, io.flutter.plugin.common.EventChannel$EventSink);
    public void onCancel(java.lang.Object);
}

# --- TensorFlow Lite ---
-keep class org.tensorflow.lite.** { *; }
-keep class org.tensorflow.lite.gpu.** { *; }
-keep class org.tensorflow.lite.nnapi.** { *; }
-dontwarn org.tensorflow.lite.**

# --- ARCore ---
-keep class com.google.ar.** { *; }
-keep class com.google.ar.core.** { *; }
-keep class com.google.ar.sceneform.** { *; }
-dontwarn com.google.ar.**

# --- Camera Plugin ---
-keep class io.flutter.plugins.camera.** { *; }
-dontwarn io.flutter.plugins.camera.**

# --- Permission Handler ---
-keep class com.baseflow.permissionhandler.** { *; }

# --- Share Plus ---
-keep class dev.fluttercommunity.plus.share.** { *; }

# --- Path Provider ---
-keep class io.flutter.plugins.pathprovider.** { *; }

# --- General Android ---
-keepattributes SourceFile,LineNumberTable
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses,EnclosingMethod

# --- Prevent stripping native methods ---
-keepclasseswithmembernames class * {
    native <methods>;
}

# --- Keep Parcelables ---
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# --- Keep Serializable ---
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

# --- Suppress common warnings ---
-dontwarn javax.annotation.**
-dontwarn kotlin.Unit
-dontwarn retrofit2.**
-dontwarn okhttp3.**
-dontwarn okio.**
