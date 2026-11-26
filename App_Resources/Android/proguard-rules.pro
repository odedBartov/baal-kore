# R8 / ProGuard configuration for Ba'al Kore (NativeScript + ONNX Runtime + Google Play Billing).
# Performs R8 bytecode optimization and shrinking while keeping all classes accessed via JNI or V8 reflection intact.

-dontobfuscate
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod,SourceFile,LineNumberTable

# Keep all Ba'al Kore native Java bridge classes (AudioDecoder, CtcModel, PaywallBridge, PcmRecorder, PhoneModel)
-keep class com.baalkore.app.** { *; }

# Keep NativeScript V8 runtime, metadata bindings, and widgets
-keep class com.tns.** { *; }
-keep interface com.tns.** { *; }
-keep class org.nativescript.** { *; }
-keep interface org.nativescript.** { *; }

# Keep ONNX Runtime JNI classes
-keep class ai.onnxruntime.** { *; }

# Keep Google Play Billing v8 classes
-keep class com.android.billingclient.** { *; }

# Keep AndroidX & Material components accessed dynamically by NativeScript Core
-keep class androidx.** { *; }
-keep interface androidx.** { *; }
-keep class com.google.android.material.** { *; }

# Keep JNI native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

-dontwarn com.tns.**
-dontwarn org.nativescript.**
-dontwarn ai.onnxruntime.**
