package com.nomadgo.spatialvision;

import android.app.Activity;
import android.os.Bundle;
import android.content.Intent;
import android.net.Uri;

import com.unity3d.player.UnityPlayer;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;

public class CatalogFilePickerActivity extends Activity {
    private static final int PICK_PRODUCTS_FILE = 9001;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");

        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        intent.addFlags(Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);

        intent.putExtra(Intent.EXTRA_MIME_TYPES, new String[] {
                "application/json",
                "text/plain",
                "text/csv",
                "application/csv",
                "application/vnd.ms-excel",
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/octet-stream"
        });

        startActivityForResult(intent, PICK_PRODUCTS_FILE);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode != PICK_PRODUCTS_FILE || resultCode != RESULT_OK || data == null || data.getData() == null) {
            UnityPlayer.UnitySendMessage("CatalogSystem", "OnCatalogImportFailed", "No file selected");
            finish();
            return;
        }

        try {
            Uri uri = data.getData();

            InputStream input = getContentResolver().openInputStream(uri);

            if (input == null) {
                UnityPlayer.UnitySendMessage("CatalogSystem", "OnCatalogImportFailed", "Unable to open selected file");
                finish();
                return;
            }

            File outFile = new File(getFilesDir(), "client_catalog.json");
            FileOutputStream output = new FileOutputStream(outFile, false);

            byte[] buffer = new byte[8192];
            int len;

            while ((len = input.read(buffer)) != -1) {
                output.write(buffer, 0, len);
            }

            output.flush();
            output.close();
            input.close();

            UnityPlayer.UnitySendMessage("CatalogSystem", "OnCatalogImported", outFile.getAbsolutePath());

        } catch (Exception e) {
            UnityPlayer.UnitySendMessage("CatalogSystem", "OnCatalogImportFailed", e.toString());
        }

        finish();
    }
}
