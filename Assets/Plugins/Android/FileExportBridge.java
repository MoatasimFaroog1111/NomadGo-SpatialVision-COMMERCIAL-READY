package com.nomadgo.spatialvision;

import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.unity3d.player.UnityPlayer;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

public class FileExportBridge {
    public static String saveFileToDownloads(String sourcePath, String displayName, String mimeType) {
        try {
            File source = new File(sourcePath);
            if (!source.exists()) return "";

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Downloads.DISPLAY_NAME, displayName);
                values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
                values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/NomadGo");
                values.put(MediaStore.Downloads.IS_PENDING, 1);

                Uri uri = UnityPlayer.currentActivity.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                if (uri == null) return "";

                OutputStream out = UnityPlayer.currentActivity.getContentResolver().openOutputStream(uri);
                InputStream in = new FileInputStream(source);
                copy(in, out);
                in.close();
                out.close();

                values.clear();
                values.put(MediaStore.Downloads.IS_PENDING, 0);
                UnityPlayer.currentActivity.getContentResolver().update(uri, values, null, null);

                return uri.toString();
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), "NomadGo");
                if (!dir.exists()) dir.mkdirs();

                File dest = new File(dir, displayName);
                InputStream in = new FileInputStream(source);
                OutputStream out = new FileOutputStream(dest);
                copy(in, out);
                in.close();
                out.close();

                return dest.getAbsolutePath();
            }
        } catch (Exception e) {
            return "";
        }
    }

    private static void copy(InputStream in, OutputStream out) throws java.io.IOException {
        byte[] buffer = new byte[8192];
        int len;
        while ((len = in.read(buffer)) > 0) {
            out.write(buffer, 0, len);
        }
        out.flush();
    }
}
