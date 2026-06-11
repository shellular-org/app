package io.foxbiz.shellular.browser;

import android.content.Context;
import android.webkit.WebView;

import org.json.JSONArray;

import io.foxbiz.shellular.Callback;
import io.foxbiz.shellular.Service;

public class EmbeddedProxyService extends Service {

    private final EmbeddedProxyServer server = EmbeddedProxyServer.INSTANCE;

    public EmbeddedProxyService(Context context, WebView webView) {
        super(context, webView);
        server.setMainWebView(webView);
    }

    @Override
    public boolean exec(String action, JSONArray args, Callback callback) {
        switch (action) {
            case "responseStart":
                return handleResponseStart(args, callback);
            case "responseData":
                return handleResponseData(args, callback);
            case "responseEnd":
                return handleResponseEnd(args, callback);
            case "responseError":
                return handleResponseError(args, callback);
            default:
                callback.error("Unknown action: " + action);
                return false;
        }
    }

    private boolean handleResponseStart(JSONArray args, Callback callback) {
        try {
            String requestId = args.getString(0);
            int status = args.getInt(1);
            String statusText = args.getString(2);
            String headersJson = args.getString(3);

            server.sendResponseStart(requestId, status, statusText, headersJson);
            callback.success();
            return true;
        } catch (Exception e) {
            callback.error(e.getMessage());
            return false;
        }
    }

    private boolean handleResponseData(JSONArray args, Callback callback) {
        try {
            String requestId = args.getString(0);
            String chunk = args.getString(1);
            int index = args.getInt(2);

            server.sendResponseData(requestId, chunk, index);
            callback.success();
            return true;
        } catch (Exception e) {
            callback.error(e.getMessage());
            return false;
        }
    }

    private boolean handleResponseEnd(JSONArray args, Callback callback) {
        try {
            String requestId = args.getString(0);
            server.sendResponseEnd(requestId);
            callback.success();
            return true;
        } catch (Exception e) {
            callback.error(e.getMessage());
            return false;
        }
    }

    private boolean handleResponseError(JSONArray args, Callback callback) {
        try {
            String requestId = args.getString(0);
            String errorMessage = args.optString(1, "Unknown error");
            server.sendResponseError(requestId, errorMessage);
            callback.success();
            return true;
        } catch (Exception e) {
            callback.error(e.getMessage());
            return false;
        }
    }

    public boolean ensureServer(int port) {
        return server.startServer(port);
    }

    public void cleanupServer(int port) {
        server.stopServer(port);
    }

    public void cleanupAll() {
        server.cancelAllPending();
        server.stopAll();
    }

    public boolean hasServer(int port) {
        return server.hasServer(port);
    }

    @Override
    public void onDestroy() {
        cleanupAll();
    }
}
