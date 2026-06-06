package com.babybuddy.app;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;

/**
 * Capacitor Plugin for managing the LocalMediaProxy HTTP server.
 *
 * The proxy server runs on localhost:18080 and forwards fnOS media
 * requests with proper authentication. This replaces the old
 * WebViewClient.shouldInterceptRequest approach which couldn't
 * handle video streaming (sequential-only InputStream).
 */
@CapacitorPlugin(name = "LocalMediaProxy")
public class LocalMediaProxyPlugin extends Plugin {
    private static final String TAG = "LocalMediaProxy";
    private static LocalMediaProxy proxyServer = null;

    @Override
    public void load() {
        startProxy();
    }

    /**
     * Start the proxy server (called automatically on plugin load).
     */
    @PluginMethod
    public void start(PluginCall call) {
        boolean started = startProxy();
        JSObject result = new JSObject();
        result.put("started", started);
        result.put("port", getPort());
        call.resolve(result);
    }

    /**
     * Stop the proxy server.
     */
    @PluginMethod
    public void stop(PluginCall call) {
        stopProxy();
        call.resolve(new JSObject().put("stopped", true));
    }

    /**
     * Update the proxy's fnOS cookie and base URL.
     * Called from JavaScript after successful fnOS login.
     *
     * @param call.pluginData.cookie - Full cookie string
     * @param call.pluginData.url - fnOS server base URL (may be IP-based for IPv6)
     * @param call.pluginData.originalHost - Original host header value (domain:port) for virtual hosting
     */
    @PluginMethod
    public void setConfig(PluginCall call) {
        String cookie = call.getString("cookie", "");
        String url = call.getString("url", "");
        String originalHost = call.getString("originalHost", "");

        if (proxyServer != null) {
            proxyServer.setConfig(cookie, url, originalHost);
            Log.d(TAG, "Proxy config updated (cookie len=" + cookie.length() + ", url=" + url + ", host=" + originalHost + ")");
        } else {
            Log.w(TAG, "setConfig called but proxy not running, starting...");
            startProxy();
            if (proxyServer != null) {
                proxyServer.setConfig(cookie, url, originalHost);
            }
        }

        call.resolve(new JSObject().put("success", true));
    }

    /**
     * Get the proxy's status (running, port).
     */
    @PluginMethod
    public void getStatus(PluginCall call) {
        JSObject result = new JSObject();
        boolean running = proxyServer != null && proxyServer.isAlive();
        result.put("running", running);
        result.put("port", getPort());
        result.put("hasCookie", running && !proxyServer.fnosBaseUrl.isEmpty());
        call.resolve(result);
    }

    public static int getPort() {
        return 18080; // Must match LocalMediaProxy.PROXY_PORT
    }

    private synchronized boolean startProxy() {
        if (proxyServer != null && proxyServer.isAlive()) {
            Log.d(TAG, "Proxy already running on port " + proxyServer.getPort());
            return true;
        }
        try {
            proxyServer = new LocalMediaProxy();
            proxyServer.start();
            Log.d(TAG, "Proxy started on port " + proxyServer.getPort());
            return true;
        } catch (IOException e) {
            Log.e(TAG, "Failed to start proxy", e);
            return false;
        }
    }

    private synchronized void stopProxy() {
        if (proxyServer != null) {
            try {
                proxyServer.stop();
            } catch (Exception e) {
                Log.w(TAG, "Error stopping proxy", e);
            }
            proxyServer = null;
        }
    }
}
