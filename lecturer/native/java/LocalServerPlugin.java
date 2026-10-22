package com.fegtech.attendance.lecturer;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Lets the lecturer's web app answer student phones over the hotspot / Wi-Fi.
 * Java only receives the HTTP request and passes it to the web app (event "request");
 * the web app decides and answers with respond({id, status, body}). Attendance logic stays in JavaScript.
 */
@CapacitorPlugin(name = "LocalServer")
public class LocalServerPlugin extends Plugin {

    private static final int ANSWER_TIMEOUT_SECONDS = 10;

    private static class Waiter {
        final CountDownLatch latch = new CountDownLatch(1);
        volatile MiniHttpServer.Response response;
    }

    private MiniHttpServer server;
    private final ConcurrentHashMap<String, Waiter> waiting = new ConcurrentHashMap<>();
    private final AtomicLong counter = new AtomicLong();

    @PluginMethod
    public void start(PluginCall call) {
        int port = call.getInt("port", 8765);
        stopServer();
        try {
            server = new MiniHttpServer(port, this::onRequest);
            server.start();
            JSObject r = new JSObject();
            r.put("port", port);
            r.put("addresses", addressList());
            call.resolve(r);
        } catch (Exception e) {
            server = null;
            call.reject("Could not start the local server: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        stopServer();
        call.resolve();
    }

    @PluginMethod
    public void addresses(PluginCall call) {
        JSObject r = new JSObject();
        r.put("addresses", addressList());
        r.put("running", server != null && server.isRunning());
        call.resolve(r);
    }

    @PluginMethod
    public void respond(PluginCall call) {
        String id = call.getString("id");
        int status = call.getInt("status", 200);
        String body = call.getString("body", "{}");
        Waiter w = id == null ? null : waiting.get(id);
        if (w != null) {
            w.response = new MiniHttpServer.Response(status, body);
            w.latch.countDown();
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        stopServer();
    }

    private void stopServer() {
        if (server != null) {
            server.stop();
            server = null;
        }
        for (Waiter w : waiting.values()) w.latch.countDown();
        waiting.clear();
    }

    /** Runs on a server thread: pass the request to the web app and wait for its answer. */
    private MiniHttpServer.Response onRequest(MiniHttpServer.Request req) {
        String id = Long.toString(counter.incrementAndGet());
        Waiter w = new Waiter();
        waiting.put(id, w);
        try {
            JSObject ev = new JSObject();
            ev.put("id", id);
            ev.put("method", req.method);
            ev.put("path", req.path);
            ev.put("query", req.query);
            ev.put("body", req.body);
            notifyListeners("request", ev);
            boolean answered = w.latch.await(ANSWER_TIMEOUT_SECONDS, TimeUnit.SECONDS);
            if (answered && w.response != null) return w.response;
            return new MiniHttpServer.Response(504, "{\"error\":\"The lecturer app did not answer. Keep the lecturer app open on the class screen.\"}");
        } catch (InterruptedException e) {
            return new MiniHttpServer.Response(504, "{\"error\":\"Interrupted.\"}");
        } finally {
            waiting.remove(id);
        }
    }

    /** Private IPv4 addresses of this phone, hotspot-like interfaces first. */
    private JSArray addressList() {
        final List<String[]> found = new ArrayList<>();
        try {
            Enumeration<NetworkInterface> nis = NetworkInterface.getNetworkInterfaces();
            while (nis != null && nis.hasMoreElements()) {
                NetworkInterface ni = nis.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.startsWith("rmnet") || name.startsWith("ccmni") || name.startsWith("dummy") || name.startsWith("tun")
                        || name.startsWith("v4-") || name.startsWith("p2p")) continue;
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (a instanceof Inet4Address && !a.isLoopbackAddress() && a.isSiteLocalAddress()) {
                        found.add(new String[]{name, a.getHostAddress()});
                    }
                }
            }
        } catch (Exception ignored) { }
        Collections.sort(found, new Comparator<String[]>() {
            @Override
            public int compare(String[] x, String[] y) { return rank(x[0]) - rank(y[0]); }
        });
        JSArray out = new JSArray();
        for (String[] f : found) {
            JSObject o = new JSObject();
            o.put("name", f[0]);
            o.put("ip", f[1]);
            out.put(o);
        }
        return out;
    }

    private static int rank(String n) {
        if (n.startsWith("ap") || n.startsWith("swlan") || n.startsWith("softap") || n.equals("wlan1")) return 0; // this phone is the hotspot
        if (n.startsWith("wlan")) return 1;                                                                    // connected to a Wi-Fi router
        if (n.startsWith("eth")) return 2;
        return 3;
    }
}
