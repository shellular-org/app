package io.foxbiz.shellular.browser;

import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;
import android.webkit.WebView;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class EmbeddedProxyServer {

    private static final String TAG = "EmbeddedProxy";
    public static final EmbeddedProxyServer INSTANCE = new EmbeddedProxyServer();

    public static class ParsedRequest {
        public final String method;
        public final String url;
        public final Map<String, String> headers;
        public final byte[] body;

        public ParsedRequest(String method, String url, Map<String, String> headers, byte[] body) {
            this.method = method;
            this.url = url;
            this.headers = headers;
            this.body = body;
        }
    }

    public static class PendingConnection {
        public final Socket socket;
        public final OutputStream outputStream;
        public final String requestId;
        public boolean useChunked = false;

        public PendingConnection(Socket socket, OutputStream outputStream, String requestId) {
            this.socket = socket;
            this.outputStream = outputStream;
            this.requestId = requestId;
        }
    }

    private final ExecutorService threadPool = Executors.newCachedThreadPool();
    private final Map<Integer, ServerSocket> listeners = new ConcurrentHashMap<>();
    private final Set<Integer> activePorts = ConcurrentHashMap.newKeySet();
    private final Map<String, PendingConnection> pendingConnections = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    private WebView mainWebView;

    public void setMainWebView(WebView webView) {
        this.mainWebView = webView;
    }

    public boolean startServer(int port) {
        if (activePorts.contains(port)) return true;

        try {
            ServerSocket serverSocket = new ServerSocket();
            serverSocket.setReuseAddress(true);
            serverSocket.bind(new InetSocketAddress("127.0.0.1", port));
            listeners.put(port, serverSocket);
            activePorts.add(port);

            threadPool.execute(() -> acceptLoop(serverSocket, port));
            Log.d(TAG, "Server started on 127.0.0.1:" + port);
            return true;
        } catch (IOException e) {
            Log.e(TAG, "Failed to start server on port " + port + ": " + e.getMessage());
            return false;
        }
    }

    public void stopServer(int port) {
        ServerSocket ss = listeners.remove(port);
        activePorts.remove(port);
        if (ss != null) {
            try { ss.close(); } catch (IOException ignored) {}
        }
    }

    public void stopAll() {
        for (Map.Entry<Integer, ServerSocket> entry : listeners.entrySet()) {
            try { entry.getValue().close(); } catch (IOException ignored) {}
            activePorts.remove(entry.getKey());
        }
        listeners.clear();
    }

    public boolean hasServer(int port) {
        return activePorts.contains(port);
    }

    public void cancelAllPending() {
        for (PendingConnection pc : pendingConnections.values()) {
            try { pc.socket.close(); } catch (IOException ignored) {}
        }
        pendingConnections.clear();
    }

    private void acceptLoop(ServerSocket serverSocket, int port) {
        while (!serverSocket.isClosed()) {
            try {
                Socket socket = serverSocket.accept();
                threadPool.execute(() -> handleConnection(socket));
            } catch (IOException e) {
                if (!serverSocket.isClosed()) {
                    Log.w(TAG, "Accept error on port " + port + ": " + e.getMessage());
                }
                break;
            }
        }
    }

    private void handleConnection(Socket socket) {
        try {
            socket.setSoTimeout(30000);
            InputStream in = socket.getInputStream();
            OutputStream out = socket.getOutputStream();

            ParsedRequest request = readHTTPRequest(in);
            if (request == null) {
                sendErrorResponse(out, 400, "Bad Request");
                socket.close();
                return;
            }

            String requestId = "req_" + UUID.randomUUID().toString().replace("-", "");
            pendingConnections.put(requestId, new PendingConnection(socket, out, requestId));

            proxyRequest(requestId, request);
        } catch (IOException e) {
            try { socket.close(); } catch (IOException ignored) {}
        }
    }

    private ParsedRequest readHTTPRequest(InputStream in) throws IOException {
        ByteArrayOutputStream headerBuffer = new ByteArrayOutputStream();
        int prev3 = -1, prev2 = -1, prev1 = -1;
        int b;
        while ((b = in.read()) != -1) {
            headerBuffer.write(b);
            if (prev3 == '\r' && prev2 == '\n' && prev1 == '\r' && b == '\n') {
                break;
            }
            prev3 = prev2;
            prev2 = prev1;
            prev1 = b;
        }

        byte[] headerBytes = headerBuffer.toByteArray();
        if (headerBytes.length == 0) return null;
        int headerEnd = headerBytes.length - 4;

        String headerStr = new String(headerBytes, 0, headerEnd, StandardCharsets.UTF_8);
        String[] lines = headerStr.split("\r\n");

        if (lines.length == 0) return null;
        String[] requestParts = lines[0].split(" ");
        if (requestParts.length < 2) return null;

        String method = requestParts[0].toUpperCase();
        String url = requestParts[1];

        Map<String, String> headers = new HashMap<>();
        for (int i = 1; i < lines.length; i++) {
            int colonIdx = lines[i].indexOf(':');
            if (colonIdx > 0) {
                String key = lines[i].substring(0, colonIdx).trim();
                String value = lines[i].substring(colonIdx + 1).trim();
                String existing = headers.get(key);
                if (existing != null && key.equalsIgnoreCase("Set-Cookie")) {
                    headers.put(key, existing + "\n" + value);
                } else {
                    headers.put(key, value);
                }
            }
        }

        byte[] body = null;
        String contentLengthStr = headers.get("Content-Length");
        if (contentLengthStr != null) {
            try {
                int contentLength = Integer.parseInt(contentLengthStr.trim());
                if (contentLength > 0) {
                    ByteArrayOutputStream bodyBuffer = new ByteArrayOutputStream();
                    byte[] chunk = new byte[Math.min(contentLength, 8192)];
                    int totalRead = 0;
                    while (totalRead < contentLength) {
                        int n = in.read(chunk, 0, Math.min(contentLength - totalRead, chunk.length));
                        if (n == -1) break;
                        bodyBuffer.write(chunk, 0, n);
                        totalRead += n;
                    }
                    body = bodyBuffer.toByteArray();
                }
            } catch (NumberFormatException ignored) {}
        }

        return new ParsedRequest(method, url, headers, body);
    }

    private void proxyRequest(String requestId, ParsedRequest request) {
        WebView wv = mainWebView;
        if (wv == null) {
            sendResponseError(requestId, "WebView not available");
            return;
        }

        mainHandler.post(() -> {
            String headersJson = mapToJson(request.headers);
            String bodyStr = request.body != null ? new String(request.body, StandardCharsets.UTF_8) : "";

            String escapedHeaders = escapeForJS(headersJson);
            String escapedBody = escapeForJS(bodyStr);
            String escapedUrl = escapeForJS(request.url);
            String escapedMethod = escapeForJS(request.method);

            String js = "window.__shellularProxy&&window.__shellularProxy.httpRequest('"
                    + requestId + "','"
                    + escapedMethod + "','"
                    + escapedUrl + "','"
                    + escapedHeaders + "','"
                    + escapedBody + "')";

            wv.evaluateJavascript(js, null);
        });
    }

    public void sendResponseStart(String requestId, int status, String statusText, String headersJson) {
        PendingConnection pc = pendingConnections.get(requestId);
        if (pc == null) return;

        try {
            Writer writer = new OutputStreamWriter(pc.outputStream, StandardCharsets.UTF_8);
            writer.write("HTTP/1.1 " + status + " " + statusText + "\r\n");

            Map<String, String> headers = jsonToMap(headersJson);
            boolean hasTransferEncoding = false;
            boolean hasContentType = false;

            for (Map.Entry<String, String> entry : headers.entrySet()) {
                String lower = entry.getKey().toLowerCase();
                if (lower.equals("connection")) continue;

                if (lower.equals("content-type")) {
                    hasContentType = true;
                    Log.d(TAG, "Response Content-Type: " + entry.getValue() + " for " + requestId);
                }

                if (lower.equals("transfer-encoding")) {
                    hasTransferEncoding = true;
                    if (entry.getValue().toLowerCase().contains("chunked")) {
                        pc.useChunked = true;
                    }
                }

                if (lower.equals("set-cookie")) {
                    String[] cookies = entry.getValue().split("\n");
                    for (String cookie : cookies) {
                        String trimmed = cookie.trim();
                        if (!trimmed.isEmpty()) {
                            writer.write(entry.getKey() + ": " + trimmed + "\r\n");
                        }
                    }
                } else {
                    writer.write(entry.getKey() + ": " + entry.getValue() + "\r\n");
                }
            }

            if (!hasContentType) {
                Log.w(TAG, "Missing Content-Type for " + requestId + " headersJson=" + headersJson.substring(0, Math.min(200, headersJson.length())));
            }

            Log.d(TAG, "Response " + requestId + " status=" + status + " headers=" + headers.size()
                    + " chunked=" + pc.useChunked + " hasContentType=" + hasContentType);

            if (!hasTransferEncoding) {
                writer.write("Connection: close\r\n");
            }

            writer.write("\r\n");
            writer.flush();
        } catch (IOException e) {
            Log.w(TAG, "Error writing response start: " + e.getMessage());
            cleanupConnection(requestId);
        }
    }

    public void sendResponseData(String requestId, String chunkBase64, int index) {
        PendingConnection pc = pendingConnections.get(requestId);
        if (pc == null) return;

        try {
            byte[] chunk = Base64.decode(chunkBase64, Base64.DEFAULT);

            if (chunk != null && chunk.length > 0) {
                Log.d(TAG, "Response data " + requestId + " index=" + index + " size=" + chunk.length);
            } else if (chunk == null) {
                Log.w(TAG, "Response data " + requestId + " index=" + index + " base64 decode returned null");
                return;
            }

            if (pc.useChunked) {
                String hexSize = Integer.toHexString(chunk.length);
                pc.outputStream.write((hexSize + "\r\n").getBytes(StandardCharsets.UTF_8));
                pc.outputStream.write(chunk);
                pc.outputStream.write("\r\n".getBytes(StandardCharsets.UTF_8));
            } else {
                pc.outputStream.write(chunk);
            }
            pc.outputStream.flush();
        } catch (IOException e) {
            Log.w(TAG, "Error writing response data: " + e.getMessage());
            cleanupConnection(requestId);
        }
    }

    public void sendResponseEnd(String requestId) {
        PendingConnection pc = pendingConnections.remove(requestId);
        if (pc == null) return;

        try {
            if (pc.useChunked) {
                pc.outputStream.write("0\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                pc.outputStream.flush();
            }
            pc.outputStream.flush();
            pc.socket.close();
        } catch (IOException ignored) {}
    }

    public void sendResponseError(String requestId, String errorMessage) {
        PendingConnection pc = pendingConnections.remove(requestId);
        if (pc == null) return;

        try {
            byte[] body = errorMessage.getBytes(StandardCharsets.UTF_8);
            Writer writer = new OutputStreamWriter(pc.outputStream, StandardCharsets.UTF_8);
            writer.write("HTTP/1.1 502 Bad Gateway\r\n");
            writer.write("Content-Type: text/plain\r\n");
            writer.write("Content-Length: " + body.length + "\r\n");
            writer.write("Connection: close\r\n");
            writer.write("\r\n");
            writer.flush();
            pc.outputStream.write(body);
            pc.outputStream.flush();
            pc.socket.close();
        } catch (IOException e) {
            cleanupConnection(requestId);
        }
    }

    private void cleanupConnection(String requestId) {
        PendingConnection pc = pendingConnections.remove(requestId);
        if (pc != null) {
            try { pc.socket.close(); } catch (IOException ignored) {}
        }
    }

    private void sendErrorResponse(OutputStream out, int status, String message) throws IOException {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8);
        writer.write("HTTP/1.1 " + status + " Error\r\n");
        writer.write("Content-Type: text/plain\r\n");
        writer.write("Content-Length: " + body.length + "\r\n");
        writer.write("Connection: close\r\n");
        writer.write("\r\n");
        writer.flush();
        out.write(body);
        out.flush();
    }

    private static String escapeForJS(String s) {
        return s.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    private static String mapToJson(Map<String, String> map) {
        org.json.JSONObject obj = new org.json.JSONObject();
        for (Map.Entry<String, String> entry : map.entrySet()) {
            try {
                obj.put(entry.getKey(), entry.getValue());
            } catch (Exception ignored) {}
        }
        return obj.toString();
    }

    private static Map<String, String> jsonToMap(String json) {
        Map<String, String> result = new HashMap<>();
        try {
            org.json.JSONObject obj = new org.json.JSONObject(json);
            java.util.Iterator<String> keys = obj.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                result.put(key, obj.getString(key));
            }
        } catch (Exception e) {
            Log.w(TAG, "Error parsing JSON: " + e.getMessage() + " json=" + json.substring(0, Math.min(200, json.length())));
        }
        return result;
    }
}
