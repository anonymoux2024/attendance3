package com.fegtech.attendance.lecturer;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * A tiny HTTP/1.1 server with no Android dependencies (so it can be tested on a normal computer).
 * One request per connection ("Connection: close"). Every request is handed to a Handler, which returns the answer.
 * CORS is answered here so the Student app (origin http://localhost inside its own WebView) may call it.
 */
public class MiniHttpServer {

    public static class Request {
        public String method = "";
        public String path = "";
        public String query = "";
        public String body = "";
        public final Map<String, String> headers = new HashMap<>();
    }

    public static class Response {
        public final int status;
        public final String body;
        public Response(int status, String body) { this.status = status; this.body = body == null ? "" : body; }
    }

    public interface Handler { Response handle(Request req); }

    private static final int MAX_HEADER_BYTES = 16 * 1024;
    private static final int MAX_BODY_BYTES = 64 * 1024;
    private static final int READ_TIMEOUT_MS = 8000;

    private final int port;
    private final Handler handler;
    private volatile boolean running = false;
    private ServerSocket serverSocket;
    private ExecutorService pool;
    private Thread acceptThread;

    public MiniHttpServer(int port, Handler handler) {
        this.port = port;
        this.handler = handler;
    }

    public int getPort() { return port; }

    public synchronized void start() throws IOException {
        if (running) return;
        serverSocket = new ServerSocket();
        serverSocket.setReuseAddress(true);
        serverSocket.bind(new InetSocketAddress(port)); // all interfaces, so the hotspot address works
        // at most 24 requests at the same time; extra connections wait in the accept queue
        pool = new ThreadPoolExecutor(2, 24, 30, TimeUnit.SECONDS, new SynchronousQueue<Runnable>(),
                r -> { Thread t = new Thread(r, "fc-http-worker"); t.setDaemon(true); return t; },
                new ThreadPoolExecutor.CallerRunsPolicy());
        running = true;
        acceptThread = new Thread(() -> {
            while (running) {
                try {
                    final Socket s = serverSocket.accept();
                    pool.execute(() -> serve(s));
                } catch (IOException e) {
                    if (!running) break;
                }
            }
        }, "fc-http-accept");
        acceptThread.setDaemon(true);
        acceptThread.start();
    }

    public synchronized void stop() {
        running = false;
        try { if (serverSocket != null) serverSocket.close(); } catch (IOException ignored) { }
        if (pool != null) pool.shutdownNow();
        serverSocket = null;
        pool = null;
    }

    public boolean isRunning() { return running; }

    private void serve(Socket s) {
        try {
            s.setSoTimeout(READ_TIMEOUT_MS);
            s.setTcpNoDelay(true);
            InputStream in = s.getInputStream();
            OutputStream out = s.getOutputStream();
            Request req;
            try {
                req = readRequest(in);
            } catch (BadRequest e) {
                write(out, new Response(e.status, "{\"error\":\"" + e.getMessage() + "\"}"), true);
                return;
            } catch (SocketTimeoutException e) {
                return;
            }
            if (req == null) return;
            if ("OPTIONS".equals(req.method)) {
                write(out, new Response(204, ""), true);
                return;
            }
            Response res;
            try {
                res = handler.handle(req);
            } catch (Throwable t) {
                res = new Response(500, "{\"error\":\"Lecturer phone error.\"}");
            }
            write(out, res, true);
        } catch (IOException ignored) {
        } finally {
            try { s.close(); } catch (IOException ignored) { }
        }
    }

    private static class BadRequest extends Exception {
        final int status;
        BadRequest(int status, String m) { super(m); this.status = status; }
    }

    private Request readRequest(InputStream in) throws IOException, BadRequest {
        // read until the blank line that ends the headers
        ByteArrayOutputStream head = new ByteArrayOutputStream();
        int state = 0, b;
        byte[] extra = new byte[0];
        while ((b = in.read()) != -1) {
            head.write(b);
            if (head.size() > MAX_HEADER_BYTES) throw new BadRequest(431, "Headers too large.");
            // match \r\n\r\n
            if (state == 0 && b == '\r') state = 1;
            else if (state == 1 && b == '\n') state = 2;
            else if (state == 2 && b == '\r') state = 3;
            else if (state == 3 && b == '\n') { state = 4; break; }
            else state = (b == '\r') ? 1 : 0;
        }
        if (state != 4) return null; // client closed before sending a full request
        String text = new String(head.toByteArray(), StandardCharsets.ISO_8859_1);
        String[] lines = text.split("\r\n");
        String[] first = lines[0].split(" ");
        if (first.length < 2) throw new BadRequest(400, "Bad request.");
        Request r = new Request();
        r.method = first[0].toUpperCase(Locale.ROOT);
        String target = first[1];
        int q = target.indexOf('?');
        r.path = q >= 0 ? target.substring(0, q) : target;
        r.query = q >= 0 ? target.substring(q + 1) : "";
        for (int i = 1; i < lines.length; i++) {
            int c = lines[i].indexOf(':');
            if (c > 0) r.headers.put(lines[i].substring(0, c).trim().toLowerCase(Locale.ROOT), lines[i].substring(c + 1).trim());
        }
        int len = 0;
        String cl = r.headers.get("content-length");
        if (cl != null) {
            try { len = Integer.parseInt(cl); } catch (NumberFormatException e) { throw new BadRequest(400, "Bad length."); }
        }
        if (len < 0 || len > MAX_BODY_BYTES) throw new BadRequest(413, "Too large.");
        if (len > 0) {
            byte[] body = new byte[len];
            int got = 0;
            while (got < len) {
                int n = in.read(body, got, len - got);
                if (n < 0) throw new BadRequest(400, "Incomplete body.");
                got += n;
            }
            r.body = new String(body, StandardCharsets.UTF_8);
        }
        return r;
    }

    private static String reason(int status) {
        switch (status) {
            case 200: return "OK";
            case 204: return "No Content";
            case 400: return "Bad Request";
            case 404: return "Not Found";
            case 409: return "Conflict";
            case 410: return "Gone";
            case 413: return "Payload Too Large";
            case 431: return "Request Header Fields Too Large";
            case 500: return "Internal Server Error";
            case 504: return "Gateway Timeout";
            default: return "Status";
        }
    }

    private void write(OutputStream out, Response res, boolean cors) throws IOException {
        byte[] body = res.body.getBytes(StandardCharsets.UTF_8);
        StringBuilder h = new StringBuilder();
        h.append("HTTP/1.1 ").append(res.status).append(' ').append(reason(res.status)).append("\r\n");
        if (res.status != 204) h.append("Content-Type: application/json; charset=utf-8\r\n");
        h.append("Content-Length: ").append(body.length).append("\r\n");
        h.append("Cache-Control: no-store\r\n");
        if (cors) {
            h.append("Access-Control-Allow-Origin: *\r\n");
            h.append("Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n");
            h.append("Access-Control-Allow-Headers: Content-Type\r\n");
            h.append("Access-Control-Allow-Private-Network: true\r\n");
            h.append("Access-Control-Max-Age: 600\r\n");
        }
        h.append("Connection: close\r\n\r\n");
        out.write(h.toString().getBytes(StandardCharsets.ISO_8859_1));
        out.write(body);
        out.flush();
    }
}
