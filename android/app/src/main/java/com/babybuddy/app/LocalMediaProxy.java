package com.babybuddy.app;

import android.util.Log;

import fi.iki.elonen.NanoHTTPD;

import java.io.BufferedInputStream;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

/**
 * Local HTTP proxy server that forwards fnOS requests with authentication.
 *
 * Runs on localhost:PORT and serves as a same-origin proxy for the WebView.
 * This solves the fundamental WebView limitations:
 * 1. Cross-origin requests without cookies (CORS)
 * 2. Video streaming requires random-access HTTP (Range requests)
 * 3. HEIC images not supported in WebView (we request JPEG sizes)
 * 4. API requests need authx header forwarding (CORS bypass)
 *
 * Routes:
 *   /fnos-proxy/photo/{id}/{size}/{uuid}  → fnOS /p/api/v1/stream/p/t/{id}/{size}/{uuid}
 *   /fnos-proxy/video/{id}                  → fnOS /p/api/v1/stream/v/{id}
 *   /fnos-proxy/api/*                       → fnOS /p/api/v1/* (with authx forwarding)
 *   /fnos-proxy/raw?p=...                   → fnOS path (generic passthrough)
 */
public class LocalMediaProxy extends NanoHTTPD {
    private static final String TAG = "LocalMediaProxy";
    private static final int PROXY_PORT = 18080;

    // Static initializer: prefer IPv6 addresses when available.
    // Without this, Java's HttpURLConnection only queries A (IPv4) DNS records
    // and cannot resolve IPv6-only domains. With this setting, Java will also
    // query AAAA records and prefer IPv6 when both are available.
    static {
        java.lang.System.setProperty("java.net.preferIPv6Addresses", "true");
        java.lang.System.setProperty("java.net.preferIPv4Stack", "false");
        // Allow setting Host header manually (needed when connecting via IP)
        java.lang.System.setProperty("sun.net.http.allowRestrictedHeaders", "true");
    }

    private String fnosCookie = "";
    String fnosBaseUrl = "";  // package-private for plugin access
    String fnosHost = "";     // original host (domain or IP) for Host header

    public LocalMediaProxy() {
        super(PROXY_PORT);
    }

    public int getPort() {
        return PROXY_PORT;
    }

    /**
     * Set the fnOS authentication cookie and server base URL.
     * Called from JavaScript via the Capacitor plugin bridge.
     */
    public void setConfig(String cookie, String baseUrl, String originalHost) {
        this.fnosCookie = (cookie != null) ? cookie : "";
        this.fnosBaseUrl = (baseUrl != null) ? baseUrl : "";
        // Use originalHost if provided (for when baseUrl uses resolved IP instead of domain)
        // e.g. originalHost = "fn.060608.xyz:5666" when baseUrl = "http://[2408:...]:5666"
        if (originalHost != null && !originalHost.isEmpty()) {
            this.fnosHost = originalHost;
        } else if (!this.fnosBaseUrl.isEmpty()) {
            // Fallback: extract host from baseUrl
            try {
                java.net.URL u = new java.net.URL(this.fnosBaseUrl);
                int port = u.getPort();
                this.fnosHost = u.getHost() + (port > 0 ? ":" + port : "");
            } catch (Exception e) {
                this.fnosHost = "";
            }
        } else {
            this.fnosHost = "";
        }
        Log.d(TAG, "Config updated - base: " + fnosBaseUrl + ", host: " + fnosHost + ", cookie len: " + fnosCookie.length());
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();

        if (!uri.startsWith("/fnos-proxy/")) {
            return newFixedLengthResponse(Response.Status.NOT_FOUND, NanoHTTPD.MIME_PLAINTEXT, "Not Found");
        }

        // Log cookie status on every request for debugging
        Log.d(TAG, "Request: " + session.getMethod() + " " + uri + " (cookie=" + (fnosCookie.isEmpty() ? "EMPTY" : fnosCookie.length() + " chars") + ", baseUrl=" + fnosBaseUrl + ")");

        if (fnosBaseUrl.isEmpty()) {
            Log.w(TAG, "fnosBaseUrl not configured yet");
            return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE, NanoHTTPD.MIME_PLAINTEXT,
                "Proxy not configured");
        }

        if (fnosCookie.isEmpty()) {
            Log.w(TAG, "fnosCookie not set yet — upstream will likely return 401");
        }

        try {
            String remotePath;
            boolean isApiRequest = false;

            if (uri.startsWith("/fnos-proxy/api/")) {
                // API proxy: /fnos-proxy/api/album/baby/getList → /p/api/v1/album/baby/getList
                String apiPath = uri.substring("/fnos-proxy/api/".length());
                // Preserve query string
                String query = session.getQueryParameterString();
                remotePath = "/p/api/v1/" + apiPath + (query != null && !query.isEmpty() ? "?" + query : "");
                isApiRequest = true;
            } else if (uri.startsWith("/fnos-proxy/raw")) {
                // Generic passthrough: /fnos-proxy/raw?p=...
                Map<String, String> params = session.getParms();
                String p = params.get("p");
                if (p == null) {
                    return newFixedLengthResponse(Response.Status.BAD_REQUEST, NanoHTTPD.MIME_PLAINTEXT, "Missing p parameter");
                }
                remotePath = p;
                isApiRequest = true;
            } else {
                remotePath = translateUri(uri);
            }

            if (remotePath == null) {
                return newFixedLengthResponse(Response.Status.BAD_REQUEST, NanoHTTPD.MIME_PLAINTEXT, "Bad Request");
            }

            String fullUrl = fnosBaseUrl + remotePath;
            Log.d(TAG, "Proxy: " + session.getMethod() + " " + uri + " → " + fullUrl);

            if (isApiRequest) {
                return proxyApiRequest(fullUrl, session);
            } else {
                return proxyMediaRequest(fullUrl, session);
            }

        } catch (Exception e) {
            Log.e(TAG, "Proxy error for " + uri, e);
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, NanoHTTPD.MIME_PLAINTEXT,
                "Proxy Error: " + e.getMessage());
        }
    }

    /**
     * Translate our proxy URI to fnOS remote path.
     *   /fnos-proxy/photo/{id}/{size}/{uuid}  → /p/api/v1/stream/p/t/{id}/{size}/{uuid}
     *   /fnos-proxy/video/{id}                  → /p/api/v1/stream/v/{id}
     */
    private String translateUri(String uri) {
        // /fnos-proxy/photo/{id}/{size}/{uuid}
        if (uri.startsWith("/fnos-proxy/photo/")) {
            String rest = uri.substring("/fnos-proxy/photo/".length());
            int firstSlash = rest.indexOf('/');
            if (firstSlash < 0) return null;
            int secondSlash = rest.indexOf('/', firstSlash + 1);
            if (secondSlash < 0) return null;
            String id = rest.substring(0, firstSlash);
            String size = rest.substring(firstSlash + 1, secondSlash);
            String uuid = rest.substring(secondSlash + 1);
            if (uuid.isEmpty()) uuid = "0";
            return "/p/api/v1/stream/p/t/" + id + "/" + size + "/" + uuid;
        }

        // /fnos-proxy/video/{id}
        if (uri.startsWith("/fnos-proxy/video/")) {
            String id = uri.substring("/fnos-proxy/video/".length());
            return "/p/api/v1/stream/v/" + id;
        }

        return null;
    }

    /**
     * Proxy an API request to fnOS, forwarding cookies and authx header.
     * Supports both GET and POST methods.
     * Returns JSON response body as-is.
     */
    private Response proxyApiRequest(String fullUrl, IHTTPSession session) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(fullUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod(session.getMethod().name());
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);

            // Set authentication cookie
            if (!fnosCookie.isEmpty()) {
                conn.setRequestProperty("Cookie", fnosCookie);
            }

            // Set Accept header
            conn.setRequestProperty("Accept", "application/json");
            conn.setRequestProperty("Accept-Encoding", "identity");

            // Set Host header (important when connecting via IP — fnOS may check Host)
            if (!fnosHost.isEmpty()) {
                conn.setRequestProperty("Host", fnosHost);
            }

            // Forward authx header (critical for fnOS API authentication)
            Map<String, String> headers = session.getHeaders();
            String authx = headers.get("authx");
            if (authx != null && !authx.isEmpty()) {
                conn.setRequestProperty("authx", authx);
                Log.d(TAG, "  Forwarded authx header: " + authx.substring(0, Math.min(authx.length(), 30)) + "...");
            }

            // Handle POST body
            if (session.getMethod() == Method.POST) {
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json");

                // Read POST body from session (NanoHTTPD requires a map parameter)
                Map<String, String> bodyMap = new java.util.HashMap<>();
                session.parseBody(bodyMap);
                // NanoHTTPD puts POST body into the "postData" key
                String postData = bodyMap.get("postData");
                if (postData != null && !postData.isEmpty()) {
                    byte[] bodyBytes = postData.getBytes("UTF-8");
                    conn.setFixedLengthStreamingMode(bodyBytes.length);
                    conn.connect();
                    OutputStream os = conn.getOutputStream();
                    os.write(bodyBytes);
                    os.flush();
                    os.close();
                    Log.d(TAG, "  POST body: " + postData.substring(0, Math.min(postData.length(), 100)));
                } else {
                    conn.connect();
                }
            } else {
                conn.connect();
            }

            int statusCode = conn.getResponseCode();
            Log.d(TAG, "  API response: " + statusCode);

            // Read response body
            InputStream inStream = (statusCode >= 400) ? conn.getErrorStream() : conn.getInputStream();
            byte[] body;
            if (inStream != null) {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = inStream.read(buf)) >= 0) baos.write(buf, 0, n);
                inStream.close();
                body = baos.toByteArray();
            } else {
                body = new byte[0];
            }
            conn.disconnect();

            String bodyStr = new String(body, "UTF-8");
            Log.d(TAG, "  API body: " + bodyStr.substring(0, Math.min(bodyStr.length(), 200)));

            Response.Status status = Response.Status.lookup(statusCode);
            if (status == null) status = Response.Status.INTERNAL_ERROR;

            return newFixedLengthResponse(status, "application/json", bodyStr);

        } catch (Exception e) {
            Log.e(TAG, "API proxy error for " + fullUrl, e);
            if (conn != null) conn.disconnect();
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, "application/json",
                "{\"error\":\"Proxy Error: " + e.getMessage().replace("\"", "\\\"") + "\"}");
        }
    }

    /**
     * Proxy a media request to fnOS, forwarding cookies and Range headers,
     * and streaming the response back to the WebView client.
     */
    private Response proxyMediaRequest(String fullUrl, IHTTPSession session) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(fullUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(30000);

            // Set authentication cookie
            if (!fnosCookie.isEmpty()) {
                conn.setRequestProperty("Cookie", fnosCookie);
            }

            // Accept any content type (we want JPEG, not HEIC)
            conn.setRequestProperty("Accept", "*/*");
            conn.setRequestProperty("Accept-Encoding", "identity");

            // Set Host header (important when connecting via IP — fnOS may check Host)
            if (!fnosHost.isEmpty()) {
                conn.setRequestProperty("Host", fnosHost);
            }

            // Forward Range header from client (essential for video streaming)
            String rangeHeader = session.getHeaders().get("range");
            if (rangeHeader != null) {
                conn.setRequestProperty("Range", rangeHeader);
                Log.d(TAG, "  Range: " + rangeHeader);
            }

            // Forward If-None-Match / If-Modified-Since for caching
            String ifNoneMatch = session.getHeaders().get("if-none-match");
            if (ifNoneMatch != null) conn.setRequestProperty("If-None-Match", ifNoneMatch);

            String ifModifiedSince = session.getHeaders().get("if-modified-since");
            if (ifModifiedSince != null) conn.setRequestProperty("If-Modified-Since", ifModifiedSince);

            conn.connect();

            int statusCode = conn.getResponseCode();

            // Handle 304 Not Modified (caching)
            if (statusCode == 304) {
                Response resp = newFixedLengthResponse(Response.Status.NOT_MODIFIED, "", "");
                String etag = conn.getHeaderField("ETag");
                if (etag != null) resp.addHeader("ETag", etag);
                return resp;
            }

            // Handle errors
            if (statusCode >= 400) {
                String errorBody = "";
                InputStream errStream = conn.getErrorStream();
                if (errStream != null) {
                    ByteArrayOutputStream baos = new ByteArrayOutputStream();
                    byte[] buf = new byte[1024];
                    int n;
                    while ((n = errStream.read(buf)) >= 0) baos.write(buf, 0, n);
                    errStream.close();
                    errorBody = baos.toString();
                }
                Log.e(TAG, "  Upstream error: " + statusCode + " " + errorBody.substring(0, Math.min(errorBody.length(), 200)));
                return newFixedLengthResponse(Response.Status.lookup(statusCode), NanoHTTPD.MIME_PLAINTEXT, "Upstream Error " + statusCode);
            }

            // Get content type (strip params like "; charset=utf-8")
            String contentType = conn.getContentType();
            if (contentType != null) {
                int semi = contentType.indexOf(';');
                if (semi > 0) contentType = contentType.substring(0, semi).trim();
            }

            // Fix content type for video streams — HarmonyOS 4.2 WebView's MediaPlayer
            // is picky about Content-Type. If fnOS returns a generic type (e.g.
            // "application/octet-stream" or "video/quicktime"), force "video/mp4"
            // which is the most universally supported format in Android WebView.
            boolean isVideoUrl = fullUrl.contains("/stream/v/");
            if (isVideoUrl && (contentType == null ||
                    contentType.equals("application/octet-stream") ||
                    contentType.equals("video/quicktime") ||
                    contentType.equals("video/x-matroska") ||
                    contentType.equals("video/avi"))) {
                contentType = "video/mp4";
                Log.d(TAG, "  Overriding video Content-Type to: " + contentType);
            }

            long contentLength = conn.getContentLengthLong();
            Log.d(TAG, "  Response: " + statusCode + " " + contentType + " len=" + contentLength);

            // Build response with piped streaming
            Response.Status status = (statusCode == 206)
                ? Response.Status.PARTIAL_CONTENT
                : Response.Status.OK;

            String contentRange = conn.getHeaderField("Content-Range");

            // For video streaming, HarmonyOS WebView requires a known Content-Length
            // and doesn't support chunked Transfer-Encoding well. If contentLength
            // is unknown (-1) for a video, we need to buffer the entire response
            // to provide a proper Content-Length header.
            boolean needFullBuffer = isVideoUrl && contentLength <= 0;

            Response resp;
            if (contentLength > 0 && contentLength < 10 * 1024 * 1024) {
                // Small files (images): buffer in memory for fast delivery
                byte[] data = readFully(conn.getInputStream(), (int) contentLength);
                conn.disconnect();
                resp = newFixedLengthResponse(status, contentType,
                    new ByteArrayInputStream(data), data.length);
            } else if (needFullBuffer) {
                // Video with unknown length — buffer fully to provide Content-Length.
                // HarmonyOS 4.2 WebView can't handle chunked video responses.
                Log.d(TAG, "  Buffering video with unknown length for HarmonyOS compat");
                byte[] data = readFully(conn.getInputStream(), 8 * 1024 * 1024);
                conn.disconnect();
                contentLength = data.length;
                resp = newFixedLengthResponse(status, contentType,
                    new ByteArrayInputStream(data), data.length);
            } else {
                // Large files (videos): stream directly from connection
                final HttpURLConnection connRef = conn;
                final InputStream stream = new BufferedInputStream(conn.getInputStream(), 65536);
                resp = new Response(status, contentType, stream, contentLength) {
                    @Override
                    public void close() throws IOException {
                        super.close();
                        try { stream.close(); } catch (IOException ignored) {}
                        try { connRef.disconnect(); } catch (Exception ignored) {}
                    }
                };
            }

            // Forward important headers
            resp.addHeader("Accept-Ranges", "bytes");
            resp.addHeader("Connection", "keep-alive");

            if (contentLength > 0) {
                resp.addHeader("Content-Length", String.valueOf(contentLength));
            }

            if (contentRange != null) {
                resp.addHeader("Content-Range", contentRange);
            }

            String etag = conn.getHeaderField("ETag");
            if (etag != null) resp.addHeader("ETag", etag);

            String lastModified = conn.getHeaderField("Last-Modified");
            if (lastModified != null) resp.addHeader("Last-Modified", lastModified);

            String cacheControl = conn.getHeaderField("Cache-Control");
            if (cacheControl != null) resp.addHeader("Cache-Control", cacheControl);

            return resp;

        } catch (Exception e) {
            Log.e(TAG, "Proxy error for " + fullUrl, e);
            if (conn != null) conn.disconnect();
            return newFixedLengthResponse(Response.Status.INTERNAL_ERROR, NanoHTTPD.MIME_PLAINTEXT,
                "Proxy Error: " + e.getMessage());
        }
    }

    private byte[] readFully(InputStream in, int initialBufferSize) throws IOException {
        BufferedInputStream bis = new BufferedInputStream(in, 65536);
        ByteArrayOutputStream baos = new ByteArrayOutputStream(Math.max(initialBufferSize, 65536));
        byte[] buf = new byte[65536];
        int n;
        while ((n = bis.read(buf)) >= 0) {
            baos.write(buf, 0, n);
        }
        bis.close();
        return baos.toByteArray();
    }
}
