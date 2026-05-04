using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;
using UnityEngine.Networking;

namespace NomadGo.Sync
{
    public class SyncPulseManager : MonoBehaviour
    {
        // Injected by AppManager
        private Counting.CountManager  countManager;
        private Storage.SessionStorage sessionStorage;

        // Config
        private bool   localMode          = true;
        private string localStoragePath;
        private string remoteUrl;
        private string apiKey;
        private float  pulseInterval      = 10f;
        private int    retryMaxAttempts   = 5;
        private float  retryBaseDelay     = 2f;
        private float  retryMaxDelay      = 60f;

        // Runtime state
        private bool      isPulsing     = false;
        private Coroutine pulseCoroutine;
        private int       totalWritten  = 0;
        private int       totalFailed   = 0;

        // Remote mode only
        private NetworkMonitor networkMonitor;
        private PulseQueue     pulseQueue;

        public int TotalWritten    => totalWritten;
        public int TotalFailed     => totalFailed;
        public int PendingCount    => pulseQueue != null ? pulseQueue.Count : 0;
        public bool IsLocalMode    => localMode;

        public void Initialize(AppShell.SyncConfig config)
        {
            localMode         = config.local_mode;
            pulseInterval     = config.pulse_interval_seconds;
            retryMaxAttempts  = config.retry_max_attempts;
            retryBaseDelay    = config.retry_base_delay_seconds;
            retryMaxDelay     = config.retry_max_delay_seconds;

            if (localMode)
            {
                string folder = string.IsNullOrEmpty(config.local_storage_path)
                    ? "Pulses" : config.local_storage_path;

                localStoragePath = Path.Combine(Application.persistentDataPath, folder);

                if (!Directory.Exists(localStoragePath))
                    Directory.CreateDirectory(localStoragePath);

                Debug.Log($"[SyncPulse] LOCAL mode. Path: {localStoragePath}");
            }
            else
            {
                remoteUrl = config.base_url;
                apiKey = config.api_key;

                if (string.IsNullOrWhiteSpace(remoteUrl))
                    Debug.LogWarning("[SyncPulse] Remote mode is enabled but base_url is empty.");

                networkMonitor = gameObject.AddComponent<NetworkMonitor>();
                pulseQueue     = gameObject.AddComponent<PulseQueue>();
                pulseQueue.Initialize(config.queue_persistent);
                networkMonitor.OnNetworkStatusChanged += OnNetworkStatusChanged;

                Debug.Log($"[SyncPulse] REMOTE mode. URL: {remoteUrl}");
            }
        }

        public void InjectReferences(Counting.CountManager cm, Storage.SessionStorage ss)
        {
            countManager   = cm;
            sessionStorage = ss;
        }

        public void StartPulsing()
        {
            if (isPulsing) return;
            isPulsing      = true;
            pulseCoroutine = StartCoroutine(PulseLoop());
            Debug.Log("[SyncPulse] Started.");
        }

        public void StopPulsing()
        {
            isPulsing = false;
            if (pulseCoroutine != null)
            {
                StopCoroutine(pulseCoroutine);
                pulseCoroutine = null;
            }
            Debug.Log($"[SyncPulse] Stopped. Written={totalWritten}, Failed={totalFailed}");
        }

        private IEnumerator PulseLoop()
        {
            while (isPulsing)
            {
                yield return new WaitForSeconds(pulseInterval);

                PulseData pulse = BuildPulse();
                if (pulse == null) continue;

                if (localMode)
                    WriteLocal(pulse);
                else
                    yield return SendRemote(pulse);
            }
        }

        private void WriteLocal(PulseData pulse)
        {
            try
            {
                string fileName = $"pulse_{pulse.sessionId}_{pulse.timestamp.Replace(":", "-").Replace(".", "-")}.json";
                string filePath = Path.Combine(localStoragePath, fileName);
                string json     = JsonUtility.ToJson(pulse, true);

                File.WriteAllText(filePath, json);
                totalWritten++;

                UpdateLocalIndex(pulse);

                Debug.Log($"[SyncPulse] Written locally: {fileName}  (total={totalWritten})");
            }
            catch (Exception ex)
            {
                totalFailed++;
                Debug.LogError($"[SyncPulse] Local write failed: {ex.Message}");
            }
        }

        private void UpdateLocalIndex(PulseData pulse)
        {
            string indexPath = Path.Combine(localStoragePath, "index.json");

            LocalPulseIndex index;
            if (File.Exists(indexPath))
            {
                try   { index = JsonUtility.FromJson<LocalPulseIndex>(File.ReadAllText(indexPath)); }
                catch { index = new LocalPulseIndex(); }
            }
            else
            {
                index = new LocalPulseIndex();
            }

            // Upsert session summary
            bool found = false;
            for (int i = 0; i < index.sessions.Count; i++)
            {
                if (index.sessions[i].sessionId == pulse.sessionId)
                {
                    index.sessions[i].lastPulseTime  = pulse.timestamp;
                    index.sessions[i].totalCount     = pulse.totalCount;
                    index.sessions[i].pulseCount++;
                    found = true;
                    break;
                }
            }

            if (!found)
            {
                index.sessions.Add(new LocalSessionSummary
                {
                    sessionId      = pulse.sessionId,
                    deviceId       = pulse.deviceId,
                    firstPulseTime = pulse.timestamp,
                    lastPulseTime  = pulse.timestamp,
                    totalCount     = pulse.totalCount,
                    pulseCount     = 1
                });
            }

            File.WriteAllText(indexPath, JsonUtility.ToJson(index, true));
        }

        private IEnumerator SendRemote(PulseData pulse)
        {
            pulseQueue.Enqueue(pulse);

            if (networkMonitor != null && networkMonitor.IsOnline)
                yield return FlushQueue();
            else
                Debug.Log("[SyncPulse] Offline — queued for later.");
        }

        private IEnumerator FlushQueue()
        {
            while (pulseQueue.Count > 0 &&
                   networkMonitor != null && networkMonitor.IsOnline)
            {
                PulseData pulse = pulseQueue.Peek();
                if (pulse == null) break;

                bool success = false;
                yield return PostPulse(pulse, r => success = r);

                pulseQueue.Dequeue();

                if (success)
                {
                    totalWritten++;
                    Debug.Log($"[SyncPulse] Sent: {pulse.pulseId}");
                }
                else if (pulse.attemptCount >= retryMaxAttempts)
                {
                    totalFailed++;
                    Debug.LogWarning($"[SyncPulse] Dropped after {retryMaxAttempts} attempts: {pulse.pulseId}");
                }
                else
                {
                    pulseQueue.RequeueWithRetry(pulse);
                    float delay = Mathf.Min(retryBaseDelay * Mathf.Pow(2, pulse.attemptCount), retryMaxDelay);
                    Debug.Log($"[SyncPulse] Retry in {delay}s: {pulse.pulseId}");
                    yield return new WaitForSeconds(delay);
                }
            }
        }

        private IEnumerator PostPulse(PulseData pulse, Action<bool> callback)
        {
            using (var req = new UnityWebRequest(remoteUrl, "POST"))
            {
                byte[] body = System.Text.Encoding.UTF8.GetBytes(JsonUtility.ToJson(pulse));
                req.uploadHandler   = new UploadHandlerRaw(body);
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                if (!string.IsNullOrWhiteSpace(apiKey))
                    req.SetRequestHeader("x-api-key", apiKey);
                req.timeout = 15;

                yield return req.SendWebRequest();
                callback(req.result == UnityWebRequest.Result.Success);

                if (req.result != UnityWebRequest.Result.Success)
                    Debug.LogWarning($"[SyncPulse] HTTP error: {req.error}");
            }
        }

        private void OnNetworkStatusChanged(bool online)
        {
            if (online && isPulsing && pulseQueue != null && pulseQueue.Count > 0)
            {
                Debug.Log("[SyncPulse] Network restored — flushing queue...");
                StartCoroutine(FlushQueue());
            }
        }

        private PulseData BuildPulse()
        {
            if (countManager == null || sessionStorage == null) return null;
            if (sessionStorage.CurrentSession == null) return null;

            var pulse = new PulseData
            {
                pulseId    = Guid.NewGuid().ToString("N").Substring(0, 8),
                sessionId  = sessionStorage.CurrentSession.sessionId,
                timestamp  = DateTime.UtcNow.ToString("o"),
                totalCount = countManager.TotalCount,
                rowCount   = countManager.CurrentClusters.Count,
                deviceId   = SystemInfo.deviceUniqueIdentifier,
                status     = "ok"
            };

            foreach (var kvp in countManager.CurrentCounts)
                pulse.countsByLabel.Add(new Storage.LabelCount { label = kvp.Key, count = kvp.Value });

            return pulse;
        }

        public LocalPulseIndex GetLocalIndex()
        {
            if (!localMode) return null;

            string indexPath = Path.Combine(localStoragePath, "index.json");
            if (!File.Exists(indexPath)) return new LocalPulseIndex();

            try   { return JsonUtility.FromJson<LocalPulseIndex>(File.ReadAllText(indexPath)); }
            catch { return new LocalPulseIndex(); }
        }

        public List<PulseData> GetLocalPulses(string sessionId)
        {
            var list = new List<PulseData>();
            if (!localMode || !Directory.Exists(localStoragePath)) return list;

            foreach (string f in Directory.GetFiles(localStoragePath, $"pulse_{sessionId}_*.json"))
            {
                try
                {
                    string json = File.ReadAllText(f);
                    list.Add(JsonUtility.FromJson<PulseData>(json));
                }
                catch { /* skip corrupt file */ }
            }

            return list;
        }

        private void OnDestroy()
        {
            StopPulsing();
            if (networkMonitor != null)
                networkMonitor.OnNetworkStatusChanged -= OnNetworkStatusChanged;
        }
    }

    [Serializable]
    public class LocalPulseIndex
    {
        public List<LocalSessionSummary> sessions = new List<LocalSessionSummary>();
    }

    [Serializable]
    public class LocalSessionSummary
    {
        public string sessionId;
        public string deviceId;
        public string firstPulseTime;
        public string lastPulseTime;
        public int    totalCount;
        public int    pulseCount;
    }
}
