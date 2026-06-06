package com.babybuddy.app;

import android.content.Intent;
import android.net.Uri;
import android.util.Log;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "FileOpener")
public class FileOpenerPlugin extends Plugin {
    private static final String TAG = "FileOpener";

    @PluginMethod
    public void open(PluginCall call) {
        String filePath = call.getString("filePath");
        String mimeType = call.getString("mimeType", "video/mp4");

        if (filePath == null) {
            call.reject("filePath is required");
            return;
        }

        File file = new File(filePath);
        if (!file.exists()) {
            call.reject("File not found: " + filePath);
            return;
        }

        try {
            Uri uri = FileProvider.getUriForFile(
                    getContext(),
                    getContext().getPackageName() + ".fileprovider",
                    file
            );

            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, mimeType);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception e) {
            Log.e(TAG, "Failed to open file", e);
            call.reject("Failed to open file: " + e.getMessage());
        }
    }
}
