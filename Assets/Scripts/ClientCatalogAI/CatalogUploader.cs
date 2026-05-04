using System;
using System.IO;
using UnityEngine;

public class CatalogUploader : MonoBehaviour
{
    public static CatalogUploader Instance;

    private void Awake()
    {
        Instance = this;
    }

    public void PickCatalogFile()
    {
#if UNITY_ANDROID && !UNITY_EDITOR
        using (var unityPlayer = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
        using (var activity = unityPlayer.GetStatic<AndroidJavaObject>("currentActivity"))
        using (var pickerClass = new AndroidJavaClass("com.nomadgo.spatialvision.CatalogFilePickerActivity"))
        using (var intent = new AndroidJavaObject("android.content.Intent", activity, pickerClass))
        {
            activity.Call("startActivity", intent);
        }
#else
        NotifyUI(null, "File picker works only after building Android APK.");
#endif
    }

    public void OnCatalogImported(string sourcePath)
    {
        try
        {
            Debug.Log("[CatalogUploader] Imported path/message: " + sourcePath);

            string destPath = Path.Combine(Application.persistentDataPath, "client_catalog.json");

            if (!string.IsNullOrEmpty(sourcePath) && File.Exists(sourcePath))
            {
                File.Copy(sourcePath, destPath, true);
            }

            if (!File.Exists(destPath))
            {
                NotifyUI(false, "Upload failed: file was not saved inside the app storage.");
                return;
            }

            Debug.Log("[CatalogUploader] Saved catalog to: " + destPath);

            var manager = ClientCatalogManager.Instance ?? FindObjectOfType<ClientCatalogManager>();

            if (manager == null)
            {
                NotifyUI(false, "Upload failed: catalog manager not found.");
                return;
            }

            manager.Load();

            if (manager.IsLoaded)
            {
                NotifyUI(true, "Upload successful — products loaded: " + manager.ItemsCount);
            }
            else
            {
                NotifyUI(false, "Upload completed, but file format is invalid or contains no products.");
            }
        }
        catch (Exception ex)
        {
            Debug.LogError("[CatalogUploader] Upload error: " + ex);
            NotifyUI(false, "Upload failed: " + ex.Message);
        }
    }

    public void OnCatalogImportFailed(string message)
    {
        Debug.LogError("[CatalogUploader] Import failed: " + message);
        NotifyUI(false, "Upload failed: " + message);
    }

    public void ImportFromPath(string sourcePath)
    {
        try
        {
            if (!File.Exists(sourcePath))
            {
                NotifyUI(false, "Upload failed: file not found.");
                return;
            }

            string destPath = Path.Combine(Application.persistentDataPath, "client_catalog.json");
            File.Copy(sourcePath, destPath, true);

            var manager = ClientCatalogManager.Instance ?? FindObjectOfType<ClientCatalogManager>();
            if (manager != null)
            {
                manager.Load();
                NotifyUI(
                    manager.IsLoaded,
                    manager.IsLoaded
                        ? "Upload successful — products loaded: " + manager.ItemsCount
                        : "Upload completed, but file format is invalid or contains no products."
                );
            }
        }
        catch (Exception ex)
        {
            NotifyUI(false, "Upload failed: " + ex.Message);
        }
    }

    private void NotifyUI(bool? success, string text)
    {
        var ui = NomadGo.AppShell.UIBuilder.Instance ?? FindObjectOfType<NomadGo.AppShell.UIBuilder>();
        if (ui != null)
            ui.SetCatalogUploadStatus(success, text);
    }
}
