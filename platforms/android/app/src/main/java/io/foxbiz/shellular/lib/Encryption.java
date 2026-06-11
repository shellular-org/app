package io.foxbiz.shellular.lib;

import android.content.Context;
import android.util.Base64;
import android.webkit.WebView;

import org.json.JSONArray;

import java.nio.charset.StandardCharsets;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class Encryption extends Service {

    public Encryption(Context context, WebView webView) {
        super(context, webView);
    }

    /**
     * Encrypts the given message using XOR encryption with the provided password.
     * The result is encoded in Base64.
     *
     * @param args     JSONArray containing [message, password]
     * @param callback CallbackContext to send the result or error
     */
    public void encrypt(JSONArray args, Callback callback) {
        try {
            String message = args.getString(0);
            String password = args.getString(1);

            byte[] encrypted = xorWithKey(message.getBytes(StandardCharsets.UTF_8), password.getBytes(StandardCharsets.UTF_8));
            String encryptedString = Base64.encodeToString(encrypted, Base64.NO_WRAP); // Use NO_WRAP to avoid adding line
            // breaks

            callback.success(encryptedString);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    /**
     * Decrypts the given Base64-encoded string using XOR encryption with the
     * provided password.
     *
     * @param args     JSONArray containing [encryptedString, password]
     * @param callback CallbackContext to send the result or error
     */
    public void decrypt(JSONArray args, Callback callback) {
        try {
            String encryptedString = args.getString(0);
            String password = args.getString(1);

            byte[] encrypted = Base64.decode(encryptedString, Base64.NO_WRAP);
            byte[] decrypted = xorWithKey(encrypted, password.getBytes(StandardCharsets.UTF_8));

            String decryptedString = new String(decrypted, StandardCharsets.UTF_8);
            callback.success(decryptedString);
        } catch (Exception e) {
            callback.error(e.toString());
        }
    }

    /**
     * Performs XOR operation between the input byte array and the key.
     *
     * @param data Input data to be encrypted/decrypted
     * @param key  Key used for XOR operation
     * @return Resulting byte array after XOR operation
     */
    private byte[] xorWithKey(byte[] data, byte[] key) {
        byte[] output = new byte[data.length];
        for (int i = 0; i < data.length; i++) {
            output[i] = (byte) (data[i] ^ key[i % key.length]);
        }
        return output;
    }
}
