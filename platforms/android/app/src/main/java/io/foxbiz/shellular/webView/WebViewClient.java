package io.foxbiz.shellular.webView;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.net.http.SslError;
import android.util.Log;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import androidx.annotation.Nullable;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

import io.foxbiz.shellular.MainActivity;
import io.foxbiz.shellular.utils.Path;

public class WebViewClient extends android.webkit.WebViewClient {
    public static final String TAG = "FoxbizWebViewClient";
    private final MainActivity activity;
    private AssetResolver assetResolver;

    public WebViewClient(MainActivity activity) {
        this.activity = activity;
        this.assetResolver = new AssetResolver(this, activity);
    }

    private boolean isDebuggable() {
        return (activity.getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
    }

    private static String getMimeType(String path, String extension) {
        switch (extension.toLowerCase()) {
            case "html":
            case "htm":
                return "text/html";
            case "js":
            case "mjs":
                return "application/javascript";
            case "css":
                return "text/css";
            case "json":
                return "application/json";
            case "xml":
                return "application/xml";
            case "svg":
                return "image/svg+xml";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "gif":
                return "image/gif";
            case "webp":
                return "image/webp";
            case "ico":
                return "image/x-icon";
            case "ttf":
                return "font/ttf";
            case "woff":
                return "font/woff";
            case "woff2":
                return "font/woff2";
            case "eot":
                return "application/vnd.ms-fontobject";
            case "otf":
                return "font/otf";
            case "mp4":
                return "video/mp4";
            case "mp3":
                return "audio/mpeg";
            case "wav":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            case "webm":
                return "video/webm";
            case "pdf":
                return "application/pdf";
            case "wasm":
                return "application/wasm";
            case "txt":
                return "text/plain";
            case "map":
                return "application/json";
            default: {
                String guessed = HttpURLConnection.guessContentTypeFromName("file." + extension);
                if (guessed != null && !guessed.isEmpty()) return guessed;
                return "application/octet-stream";
            }
        }
    }

    private static boolean isTextMime(String mimeType) {
        if (mimeType == null) return false;
        return mimeType.startsWith("text/")
                || mimeType.equals("application/javascript")
                || mimeType.equals("application/json")
                || mimeType.equals("application/xml")
                || mimeType.equals("application/wasm")
                || mimeType.startsWith("image/svg");
    }

    private static void logAssetRequest(String path, String mimeType, int statusCode) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".svg") || lower.endsWith(".woff") || lower.endsWith(".woff2")
                || lower.endsWith(".css") || lower.endsWith(".js") || lower.endsWith(".png")
                || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".gif")
                || lower.endsWith(".webp") || lower.endsWith(".ttf") || lower.endsWith(".otf")
                || lower.endsWith(".wasm") || lower.endsWith(".ico") || lower.endsWith(".mp4")
                || lower.endsWith(".webm") || lower.endsWith(".eot")) {
            Log.d(TAG, "Static asset: " + path + " -> " + mimeType + " (status=" + statusCode + ")");
        }
    }

    private WebResourceResponse injectBaseTag(WebResourceResponse response) {
        try {
            InputStream inputStream = response.getData();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            byte[] buffer = new byte[1024];
            int len;
            while ((len = inputStream.read(buffer)) != -1) {
                baos.write(buffer, 0, len);
            }
            inputStream.close();

            String content = new String(baos.toByteArray(), StandardCharsets.UTF_8);
            content = content.replace("<head>", "<head>\n  <base href=\"shellular://localhost/\">");

            byte[] data = content.getBytes(StandardCharsets.UTF_8);
            ByteArrayInputStream bais = new ByteArrayInputStream(data);

            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");

            return new WebResourceResponse("text/html", "utf-8", 200, "OK", headers, bais);
        } catch (IOException e) {
            Log.e(TAG, "Error injecting base tag", e);
            return response;
        }
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        return false;
    }

    @SuppressLint("WebViewClientOnReceivedSslError")
    @Override
    public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        if (isDebuggable()) {
            handler.proceed();
        } else {
            super.onReceivedSslError(view, handler, error);
        }
    }

    @Nullable
    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        Uri uri = request.getUrl();
        String scheme = uri.getScheme();
        String host = uri.getHost();

        if (scheme == null || !scheme.equals("shellular")) {
            return super.shouldInterceptRequest(view, request);
        }

        String path = uri.getPath();

        if (path == null || path.isEmpty() || path.equals("/")) {
            path = "/index.html";
        }

        String extension = path.substring(path.lastIndexOf(".") + 1);
        if (extension.isEmpty()) {
            extension = "html";
        }

        String mimeType = getMimeType(path, extension);

        if (path.startsWith("/__cache__/")) {
            path = path.replace("/__cache__", activity.getCacheDir().getAbsolutePath());
            if (path.isEmpty()) {
                return null;
            }
        } else if (path.startsWith("/__file__/")) {
            path = path.replace("/__file__", activity.getFilesDir().getAbsolutePath());
            if (path.isEmpty()) {
                return null;
            }
        } else {
            WebResourceResponse response = assetResolver.resolve(path);
            if (response != null && "text/html".equals(response.getMimeType())) {
                return injectBaseTag(response);
            }
            return response;
        }

        try {
            InputStream inputStream = new FileInputStream(path);
            String encoding = isTextMime(mimeType) ? "utf-8" : null;

            logAssetRequest(path, mimeType, 200);

            if (isDebuggable()) {
                Map<String, String> headers = new HashMap<>();
                headers.put("Access-Control-Allow-Origin", "*");
                headers.put("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
                return new WebResourceResponse(mimeType, encoding, 200, "OK", headers, inputStream);
            } else {
                return new WebResourceResponse(mimeType, encoding, inputStream);
            }

        } catch (FileNotFoundException e) {
            Log.e(TAG, "File not found: " + path, e);
            return null;
        } catch (Exception e) {
            Log.e(TAG, "Error reading file: " + path, e);
            return null;
        }
    }

    static class AssetResolver {
        protected final WebViewClient client;
        protected final Context context;

        public AssetResolver(WebViewClient client, Context context) {
            this.client = client;
            this.context = context;
        }

        public WebResourceResponse resolve(String path) {
            try {
                File file = new File(Path.join(context.getFilesDir().getAbsolutePath(), "patch"));
                if(file.exists()){
                    PackageManager pm = client.activity.getPackageManager();
                    PackageInfo pInfo = pm.getPackageInfo(context.getPackageName(), 0);
                    ApplicationInfo appInfo = context.getApplicationInfo();
                    String versionName = pInfo.versionName;

                    if(versionName == null){
                        versionName = appInfo.metaData.getString("versionName");

                        if(versionName == null){
                            versionName = "0.0.0";
                        }
                    }

                    String[] versionParts = versionName.split("\\.");
                    String major = versionParts[0];
                    String minor = versionParts[1];
                    String patch = versionParts[2];

                    File[] patches = file.listFiles();

                    if(patches != null){
                        File newestPatch = null;
                        for(File patchDir : patches){
                            Log.d(TAG, "Checking patch: " + patchDir.getName());
                            String[] versions = patchDir.getName().split("\\.");
                            String majorVersion = versions[0];
                            String minorVersion = versions[1];
                            String patchVersion = versions[2];

                            if(majorVersion.equals(major) && minorVersion.equals(minor) && Integer.parseInt(patchVersion) > Integer.parseInt(patch)){
                                if(newestPatch != null){
                                    deleteDirRecursively(newestPatch);
                                }

                                Log.d(TAG, "Found newer patch: " + patchDir.getName());
                                newestPatch = patchDir;
                            }else{
                                deleteDirRecursively(patchDir);
                            }
                        }

                        if(newestPatch != null && new File(Path.join(newestPatch.getAbsolutePath(), path)).exists()){
                            client.assetResolver = new AssetResolverFromPatch(client, context, newestPatch.getName());
                            return client.assetResolver.resolve(path);
                        }
                    }
                }

                client.assetResolver = new AssetResolverFromBundle(client, context);
                return client.assetResolver.resolve(path);
            } catch (PackageManager.NameNotFoundException e) {
                Log.e(TAG, "Package not found: " + context.getPackageName(), e);
                return null;
            } catch (Exception e) {
                Log.e(TAG, "Error resolving asset: " + path, e);
                return null;
            }
        }

        private void deleteDirRecursively(File dir) {
            if (dir.isDirectory()) {
                File[] children = dir.listFiles();
                if (children != null) {
                    for (File child : children) {
                        deleteDirRecursively(child);
                    }
                }
            }
            boolean deleted = dir.delete();
            if (!deleted) {
                Log.e(TAG, "Failed to delete file: " + dir.getAbsolutePath());
            }
        }
    }

    static class AssetResolverFromBundle extends AssetResolver {
        private static final String TAG = "AssetResolverFromBundle";

        public AssetResolverFromBundle(WebViewClient client, Context context) {
            super(client, context);
        }

        public WebResourceResponse resolve(String path) {
            try {
                InputStream inputStream = context.getAssets().open("bundle" + path);
                String extension = path.substring(path.lastIndexOf(".") + 1);
                String mimeType = getMimeType(path, extension);
                String encoding = isTextMime(mimeType) ? "utf-8" : null;

                logAssetRequest(path, mimeType, 200);

                return new WebResourceResponse(mimeType, encoding, inputStream);
            } catch (FileNotFoundException e) {
                Log.e(TAG, "File not found: " + path, e);
                return null;
            } catch (Exception e) {
                Log.e(TAG, "Error reading file: " + path, e);
                return null;
            }
        }
    }

    static class AssetResolverFromPatch extends AssetResolver {
        private static final String TAG = "AssetResolverFromPatch";
        private final String version;

        public AssetResolverFromPatch(WebViewClient client, Context context, String version) {
            super(client, context);
            this.version = version;
        }

        public WebResourceResponse resolve(String path) {
            try {
                String updatePath = Path.join(context.getFilesDir().getAbsolutePath(), "patch", version, path);
                InputStream inputStream = new FileInputStream(updatePath);
                String extension = path.substring(path.lastIndexOf(".") + 1);
                String mimeType = getMimeType(path, extension);
                String encoding = isTextMime(mimeType) ? "utf-8" : null;

                logAssetRequest(path, mimeType, 200);

                return new WebResourceResponse(mimeType, encoding, inputStream);
            } catch (FileNotFoundException e) {
                Log.e(TAG, "File not found: " + path, e);
                return null;
            } catch (Exception e) {
                Log.e(TAG, "Error reading file: " + path, e);
                return null;
            }
        }
    }
}
