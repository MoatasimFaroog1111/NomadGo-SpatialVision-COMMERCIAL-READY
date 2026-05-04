using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace NomadGo.Vision
{
    public class ModelDownloader : MonoBehaviour
    {
        // ---------------------------------------------------------------
        // PlayerPrefs keys
        // ---------------------------------------------------------------
        private const string PREFS_CACHED_VERSION  = "ModelDownloader_CachedVersion";
        private const string PREFS_CACHED_MODEL    = "ModelDownloader_CachedModelPath";
        private const string PREFS_CACHED_LABELS   = "ModelDownloader_CachedLabelsPath";

        // ---------------------------------------------------------------
        // State
        // ---------------------------------------------------------------
        private string  remoteUrl      = "";
        private string  bundledVersion = "1.0.0";
        private bool    isDownloading  = false;
        private float   progress       = 0f;
        private bool    updateAvailable = false;
        private string  pendingVersion  = "";

        // ---------------------------------------------------------------
        // Public properties
        // ---------------------------------------------------------------
        public bool   IsDownloading    => isDownloading;
        public float  Progress         => progress;
        public bool   UpdateAvailable  => updateAvailable;
        public string PendingVersion   => pendingVersion;

        public bool HasCachedModel =>
            !string.IsNullOrEmpty(PlayerPrefs.GetString(PREFS_CACHED_MODEL, "")) &&
            File.Exists(PlayerPrefs.GetString(PREFS_CACHED_MODEL, ""));

        public string CachedModelPath =>
            HasCachedModel ? PlayerPrefs.GetString(PREFS_CACHED_MODEL, "") : "";

        public string CachedLabelsPath
        {
            get
            {
                string p = PlayerPrefs.GetString(PREFS_CACHED_LABELS, "");
                return (!string.IsNullOrEmpty(p) && File.Exists(p)) ? p : "";
            }
        }

        public string CachedVersion => PlayerPrefs.GetString(PREFS_CACHED_VERSION, "");

        // Callbacks (set by AppManager / UIBuilder)
        public event Action<float>  OnProgress;   // 0..1
        public event Action<bool>   OnComplete;   // true = success
        public event Action         OnUpdateFound;

        // ---------------------------------------------------------------
        // Initialisation
        // ---------------------------------------------------------------

        public void Initialize(AppShell.ModelConfig config)
        {
            remoteUrl      = config.remote_url      ?? "";
            bundledVersion = config.model_version   ?? "1.0.0";

            if (string.IsNullOrEmpty(remoteUrl))
            {
                Debug.Log("[ModelDownloader] remote_url is empty — using bundled model. Downloader dormant.");
                return;
            }

            Debug.Log($"[ModelDownloader] Initialized. remote_url={remoteUrl}  bundled_version={bundledVersion}");

            if (!HasCachedModel)
            {
                Debug.Log("[ModelDownloader] No cached model found — starting first-run download.");
                StartCoroutine(DownloadModelInternal(null, null));
            }
            else
            {
                Debug.Log($"[ModelDownloader] Cached model found (v{CachedVersion}). Checking for updates in background.");
                StartCoroutine(CheckForUpdateInternal(null));
            }
        }

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        public void CheckForUpdate(Action<bool> callback)
        {
            if (string.IsNullOrEmpty(remoteUrl))
            {
                callback?.Invoke(false);
                return;
            }
            StartCoroutine(CheckForUpdateInternal(callback));
        }

        public void DownloadModel(Action<float> progressCallback, Action<bool> completeCallback)
        {
            if (string.IsNullOrEmpty(remoteUrl))
            {
                Debug.LogWarning("[ModelDownloader] DownloadModel called but remote_url is empty.");
                completeCallback?.Invoke(false);
                return;
            }
            if (isDownloading)
            {
                Debug.LogWarning("[ModelDownloader] Already downloading.");
                return;
            }
            StartCoroutine(DownloadModelInternal(progressCallback, completeCallback));
        }

        // ---------------------------------------------------------------
        // Manifest fetch
        // ---------------------------------------------------------------

        [Serializable]
        private class ModelManifest
        {
            public string version;
            public string model_url;
            public string labels_url;
            public float  model_size_mb;
        }

        private IEnumerator CheckForUpdateInternal(Action<bool> callback)
        {
            Debug.Log($"[ModelDownloader] Fetching manifest from {remoteUrl}");

            using (var req = UnityWebRequest.Get(remoteUrl))
            {
                req.timeout = 15;
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"[ModelDownloader] Manifest fetch failed: {req.error}");
                    callback?.Invoke(false);
                    yield break;
                }

                ModelManifest manifest = null;
                try { manifest = JsonUtility.FromJson<ModelManifest>(req.downloadHandler.text); }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[ModelDownloader] Manifest parse error: {ex.Message}");
                    callback?.Invoke(false);
                    yield break;
                }

                if (manifest == null || string.IsNullOrEmpty(manifest.version))
                {
                    Debug.LogWarning("[ModelDownloader] Manifest missing version field.");
                    callback?.Invoke(false);
                    yield break;
                }

                string cachedVer = CachedVersion;
                bool needsUpdate = !HasCachedModel || CompareVersions(manifest.version, cachedVer) > 0;

                if (needsUpdate)
                {
                    pendingVersion  = manifest.version;
                    updateAvailable = true;
                    Debug.Log($"[ModelDownloader] Update available: {cachedVer} → {manifest.version} ({manifest.model_size_mb:F1} MB)");
                    OnUpdateFound?.Invoke();
                    callback?.Invoke(true);
                }
                else
                {
                    Debug.Log($"[ModelDownloader] Model is up-to-date (v{cachedVer}).");
                    callback?.Invoke(false);
                }
            }
        }

        // ---------------------------------------------------------------
        // Download
        // ---------------------------------------------------------------

        private IEnumerator DownloadModelInternal(Action<float> progressCallback, Action<bool> completeCallback)
        {
            Debug.Log($"[ModelDownloader] Fetching manifest from {remoteUrl}");
            isDownloading = true;
            progress      = 0f;
            ReportProgress(0f, progressCallback);

            ModelManifest manifest = null;
            using (var req = UnityWebRequest.Get(remoteUrl))
            {
                req.timeout = 15;
                yield return req.SendWebRequest();

                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning($"[ModelDownloader] Manifest fetch failed: {req.error}  → using bundled model.");
                    isDownloading = false;
                    completeCallback?.Invoke(false);
                    OnComplete?.Invoke(false);
                    yield break;
                }

                try { manifest = JsonUtility.FromJson<ModelManifest>(req.downloadHandler.text); }
                catch (Exception ex)
                {
                    Debug.LogWarning($"[ModelDownloader] Manifest parse error: {ex.Message}");
                    isDownloading = false;
                    completeCallback?.Invoke(false);
                    OnComplete?.Invoke(false);
                    yield break;
                }
            }

            if (manifest == null || string.IsNullOrEmpty(manifest.model_url))
            {
                Debug.LogWarning("[ModelDownloader] Manifest invalid (missing model_url).");
                isDownloading = false;
                completeCallback?.Invoke(false);
                OnComplete?.Invoke(false);
                yield break;
            }

            // Already up-to-date?
            if (HasCachedModel && CompareVersions(manifest.version, CachedVersion) <= 0)
            {
                Debug.Log($"[ModelDownloader] Already on v{CachedVersion}. No download needed.");
                isDownloading   = false;
                updateAvailable = false;
                ReportProgress(1f, progressCallback);
                completeCallback?.Invoke(true);
                OnComplete?.Invoke(true);
                yield break;
            }

            string cacheDir = Path.Combine(Application.persistentDataPath, "Models");
            try { Directory.CreateDirectory(cacheDir); }
            catch (Exception ex)
            {
                Debug.LogError($"[ModelDownloader] Cannot create cache dir: {ex.Message}");
                isDownloading = false;
                completeCallback?.Invoke(false);
                OnComplete?.Invoke(false);
                yield break;
            }

            string modelDest  = Path.Combine(cacheDir, "cached_model.onnx");
            string labelsDest = Path.Combine(cacheDir, "cached_labels.txt");

            Debug.Log($"[ModelDownloader] Downloading model from {manifest.model_url}  (~{manifest.model_size_mb:F1} MB)");

            yield return DownloadFile(manifest.model_url, modelDest,
                p => ReportProgress(p * 0.85f, progressCallback));  // model = 85% of bar

            if (!File.Exists(modelDest))
            {
                Debug.LogError("[ModelDownloader] Model file not written — aborting.");
                isDownloading = false;
                completeCallback?.Invoke(false);
                OnComplete?.Invoke(false);
                yield break;
            }

            if (!string.IsNullOrEmpty(manifest.labels_url))
            {
                Debug.Log($"[ModelDownloader] Downloading labels from {manifest.labels_url}");
                yield return DownloadFile(manifest.labels_url, labelsDest,
                    p => ReportProgress(0.85f + p * 0.15f, progressCallback));
            }
            else
            {
                Debug.Log("[ModelDownloader] No labels_url in manifest — skipping labels download.");
            }

            PlayerPrefs.SetString(PREFS_CACHED_VERSION, manifest.version);
            PlayerPrefs.SetString(PREFS_CACHED_MODEL,   modelDest);
            PlayerPrefs.SetString(PREFS_CACHED_LABELS,  File.Exists(labelsDest) ? labelsDest : "");
            PlayerPrefs.Save();

            isDownloading   = false;
            updateAvailable = false;
            pendingVersion  = "";
            ReportProgress(1f, progressCallback);

            Debug.Log($"[ModelDownloader] Download complete. Cached model v{manifest.version} at {modelDest}");
            completeCallback?.Invoke(true);
            OnComplete?.Invoke(true);
        }

        // ---------------------------------------------------------------
        // Helper: download a single file with progress
        // ---------------------------------------------------------------

        private IEnumerator DownloadFile(string url, string destPath, Action<float> progressCallback)
        {
            using (var req = UnityWebRequest.Get(url))
            {
                req.timeout = 300; // 5-minute timeout for large files
                var op = req.SendWebRequest();

                while (!op.isDone)
                {
                    progressCallback?.Invoke(req.downloadProgress);
                    yield return null;
                }

                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogError($"[ModelDownloader] File download failed ({url}): {req.error}");
                    // Remove partial file if present
                    try { if (File.Exists(destPath)) File.Delete(destPath); } catch { }
                    yield break;
                }

                try
                {
                    File.WriteAllBytes(destPath, req.downloadHandler.data);
                    Debug.Log($"[ModelDownloader] Saved {req.downloadHandler.data.Length / 1024 / 1024f:F2} MB → {destPath}");
                }
                catch (Exception ex)
                {
                    Debug.LogError($"[ModelDownloader] Write failed ({destPath}): {ex.Message}");
                    try { if (File.Exists(destPath)) File.Delete(destPath); } catch { }
                }
            }
        }

        // ---------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------

        private void ReportProgress(float p, Action<float> extCallback)
        {
            progress = Mathf.Clamp01(p);
            extCallback?.Invoke(progress);
            OnProgress?.Invoke(progress);
        }

        private static int CompareVersions(string a, string b)
        {
            if (string.IsNullOrEmpty(a) && string.IsNullOrEmpty(b)) return 0;
            if (string.IsNullOrEmpty(a)) return -1;
            if (string.IsNullOrEmpty(b)) return  1;

            string[] partsA = a.Split('.');
            string[] partsB = b.Split('.');
            int len = Mathf.Max(partsA.Length, partsB.Length);

            for (int i = 0; i < len; i++)
            {
                int va = i < partsA.Length && int.TryParse(partsA[i], out int pa) ? pa : 0;
                int vb = i < partsB.Length && int.TryParse(partsB[i], out int pb) ? pb : 0;
                if (va != vb) return va.CompareTo(vb);
            }
            return 0;
        }

        public void ClearCache()
        {
            string modelPath  = PlayerPrefs.GetString(PREFS_CACHED_MODEL, "");
            string labelsPath = PlayerPrefs.GetString(PREFS_CACHED_LABELS, "");

            try { if (!string.IsNullOrEmpty(modelPath)  && File.Exists(modelPath))  File.Delete(modelPath); }  catch { }
            try { if (!string.IsNullOrEmpty(labelsPath) && File.Exists(labelsPath)) File.Delete(labelsPath); } catch { }

            PlayerPrefs.DeleteKey(PREFS_CACHED_VERSION);
            PlayerPrefs.DeleteKey(PREFS_CACHED_MODEL);
            PlayerPrefs.DeleteKey(PREFS_CACHED_LABELS);
            PlayerPrefs.Save();

            Debug.Log("[ModelDownloader] Cache cleared.");
        }
    }
}
