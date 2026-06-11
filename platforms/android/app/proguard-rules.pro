# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# Keep all public classes and methods in your app's package
-keep class io.foxbiz.shellular.** {
    public *;
}

# Keep all classes and methods used in reflection
-keepclassmembers class * {
    public *;
}

-keep class org.sqlite.database.sqlite.SQLiteCustomFunction { *; }

-keep class org.sqlite.database.sqlite.SQLiteConstraintException { *; }

-keep class androidx.room.** { *; }