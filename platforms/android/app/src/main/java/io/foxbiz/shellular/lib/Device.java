package io.foxbiz.shellular.lib;

import android.annotation.SuppressLint;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.webkit.WebView;

import org.json.JSONArray;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class Device extends Service {

    public Device(Context context, WebView webView) {
        super(context, webView);
    }

    public void id(final JSONArray ignoredArgs, final Callback callback) {
        try {
            String manufacturer = Build.MANUFACTURER;
            String model = Build.MODEL;
            DisplayMetrics dm = context.getResources().getDisplayMetrics();
            int width = dm.widthPixels;
            int height = dm.heightPixels;
            int dpi = dm.densityDpi;
            @SuppressLint("HardwareIds")
            String androidId = Settings.Secure.getString(context.getContentResolver(), Settings.Secure.ANDROID_ID);

            String deviceId = manufacturer + "_" + model + "_" + width + "_" + height + "_" + dpi + "_" + androidId;
            callback.success(deviceId);
        } catch (Exception e) {
            callback.error(e.getMessage());
        }
    }
}
