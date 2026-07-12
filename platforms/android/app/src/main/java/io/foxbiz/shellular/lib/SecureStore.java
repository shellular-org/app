package io.foxbiz.shellular.lib;

import android.content.Context;
import android.content.SharedPreferences;
import android.webkit.WebView;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;

import org.json.JSONArray;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class SecureStore extends Service {
    private static final String STORE_NAME = "shellular_secure_store";
    private final SharedPreferences prefs;

    public SecureStore(Context context, WebView webView) {
        super(context, webView);
        try {
            String masterKeyAlias = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
            prefs = EncryptedSharedPreferences.create(
                    STORE_NAME,
                    masterKeyAlias,
                    context,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
        } catch (Exception e) {
            throw new RuntimeException("Unable to initialize secure store", e);
        }
    }

    @SuppressWarnings("unused")
    public void get(JSONArray args, Callback callback) {
        String key = args.optString(0, "");
        callback.success(prefs.getString(key, null));
    }

    @SuppressWarnings("unused")
    public void set(JSONArray args, Callback callback) {
        String key = args.optString(0, "");
        String value = args.optString(1, "");
        prefs.edit().putString(key, value).apply();
        callback.success();
    }

    @SuppressWarnings("unused")
    public void remove(JSONArray args, Callback callback) {
        String key = args.optString(0, "");
        prefs.edit().remove(key).apply();
        callback.success();
    }
}
