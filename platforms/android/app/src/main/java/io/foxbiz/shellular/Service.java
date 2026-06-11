package io.foxbiz.shellular;

import android.app.Activity;
import android.app.Application;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.util.Log;
import android.webkit.WebView;

import org.json.JSONArray;

import java.lang.reflect.Method;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public abstract class Service {
    protected final Context context;
    protected final WebView webview;

    protected Service(Context context, WebView webView) {
        this.context = context;
        this.webview = webView;
    }

    public boolean exec(String action, final JSONArray args, final Callback callback){
        try {
            final Method method = this.getClass().getDeclaredMethod(action, JSONArray.class, Callback.class);
            Shellular app = (Shellular) ((Activity) context).getApplication();
            ExecutorService executor = app.getThreadPool();
            executor.execute(() -> {
                try {
                    method.invoke(this, args, callback);
                } catch (Exception e) {
                    callback.error(e.toString());
                }
            });
            return true;
        } catch (NoSuchMethodException e) {
            callback.error(e.toString());
            return false;
        }
    }
    public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode == 0) {
            if (permissions.length > 0 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                Log.d("Service", "Permission granted");
            } else {
                Log.d("Service", "Permission denied");
            }
        }
    }
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == 0) {
            if (resultCode == Activity.RESULT_OK) {
                Log.d("Service", "Activity result OK");
            } else {
                Log.d("Service", "Activity result not OK");
            }
        }
    }
    public void onNewIntent(Intent intent) {}
    public void onDestroy() {
        // Cleanup resources if needed
    }
    public void destroy(){}
}
