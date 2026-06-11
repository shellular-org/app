package io.foxbiz.shellular;

import android.webkit.WebMessage;
import android.webkit.WebView;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;

public class Callback {
    private final long id;
    private final WebView webView;
    private boolean keepAlive = false;
    private boolean isLive = true;

    public Callback(long id, WebView webview) {
        this.id = id;
        this.webView = webview;
    }

    public void sendPayload(Payload payload){
        this.keepAlive = payload.keepAlive;
        this.send(payload.data, payload.type);
    }

    public void success(Object data) {
       this.send(data, Payload.SUCCESS);
    }

    public void success() {
        this.send(null, Payload.SUCCESS);
    }

    public void error(Object data) {
        this.send(data, Payload.ERROR);
    }

    private void send(Object data, int type){
        if(!isLive) {
            return;
        }

        JSONObject response = new JSONObject();
        String key = type == Payload.SUCCESS ? "success" : "error";

        try {
            response.put("id", id);
            response.put("type", type);
            response.put("keep", keepAlive);

            // if data is byte[] then convert to base64 string
            if (data instanceof byte[]) {
                response.put("length", ((byte[]) data).length);
                response.put("isBinary", true);
                response.put(key, new String((byte[]) data, StandardCharsets.ISO_8859_1));
            }else{
                response.put(key, data);
            }

            webView.post(new Runnable() {
                @Override
                public void run() {
                    webView.evaluateJavascript(
                        "window.Android.callback(" + response.toString() + ");",
                        null
                    );
                }
            });

            if(!keepAlive) {
                isLive = false;
            }

        } catch (Exception e) {
            error(e.getMessage());
        }
    }
}
