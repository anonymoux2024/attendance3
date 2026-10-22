package com.fegtech.attendance.student;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * A hotspot Wi-Fi has no internet, so Android may send app traffic over mobile data instead and the lecturer's phone
 * (192.168.x.x) cannot be reached. bind() makes this app use the Wi-Fi network; unbind() puts things back to normal.
 */
@CapacitorPlugin(name = "WifiBind")
public class WifiBindPlugin extends Plugin {

    private ConnectivityManager cm;
    private ConnectivityManager.NetworkCallback callback;
    private boolean bound = false;

    private ConnectivityManager manager() {
        if (cm == null) cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        return cm;
    }

    @PluginMethod
    public void bind(final PluginCall call) {
        try {
            releaseCallback();
            final ConnectivityManager m = manager();
            NetworkRequest request = new NetworkRequest.Builder()
                    .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
                    .build();
            final boolean[] done = {false};
            final Handler main = new Handler(Looper.getMainLooper());
            callback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(Network network) {
                    try {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) m.bindProcessToNetwork(network);
                        else ConnectivityManager.setProcessDefaultNetwork(network);
                        bound = true;
                    } catch (Exception ignored) { }
                    finish(call, done, true);
                }

                @Override
                public void onUnavailable() {
                    finish(call, done, false);
                }
            };
            m.requestNetwork(request, callback);
            main.postDelayed(new Runnable() {
                @Override
                public void run() { finish(call, done, bound); }
            }, 4000);
        } catch (Exception e) {
            JSObject r = new JSObject();
            r.put("ok", false);
            r.put("error", String.valueOf(e.getMessage()));
            call.resolve(r);
        }
    }

    private void finish(PluginCall call, boolean[] done, boolean ok) {
        synchronized (done) {
            if (done[0]) return;
            done[0] = true;
        }
        JSObject r = new JSObject();
        r.put("ok", ok);
        call.resolve(r);
    }

    @PluginMethod
    public void unbind(PluginCall call) {
        try {
            if (bound) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) manager().bindProcessToNetwork(null);
                else ConnectivityManager.setProcessDefaultNetwork(null);
                bound = false;
            }
            releaseCallback();
        } catch (Exception ignored) { }
        call.resolve();
    }

    private void releaseCallback() {
        if (callback != null) {
            try { manager().unregisterNetworkCallback(callback); } catch (Exception ignored) { }
            callback = null;
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (bound) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) manager().bindProcessToNetwork(null);
                else ConnectivityManager.setProcessDefaultNetwork(null);
            }
            releaseCallback();
        } catch (Exception ignored) { }
    }
}
