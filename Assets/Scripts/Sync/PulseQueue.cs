using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace NomadGo.Sync
{
    [Serializable]
    public class PulseData
    {
        public string pulseId;
        public string sessionId;
        public string timestamp;
        public int totalCount;
        public List<Storage.LabelCount> countsByLabel = new List<Storage.LabelCount>();
        public int rowCount;
        public string deviceId;
        public int attemptCount;
        public string status;
    }

    [Serializable]
    public class PulseQueueData
    {
        public List<PulseData> pendingPulses = new List<PulseData>();
    }

    public class PulseQueue : MonoBehaviour
    {
        private Queue<PulseData> queue = new Queue<PulseData>();
        private string persistPath;
        private bool persistEnabled = true;

        public int Count => queue.Count;

        public void Initialize(bool persistent)
        {
            persistEnabled = persistent;
            persistPath = Path.Combine(Application.persistentDataPath, "pulse_queue.json");

            if (persistEnabled)
            {
                LoadFromDisk();
            }

            Debug.Log($"[PulseQueue] Initialized. Persistent: {persistEnabled}, Pending: {queue.Count}");
        }

        public void Enqueue(PulseData pulse)
        {
            pulse.pulseId = Guid.NewGuid().ToString("N").Substring(0, 8);
            pulse.status = "pending";
            pulse.attemptCount = 0;
            queue.Enqueue(pulse);

            if (persistEnabled)
            {
                SaveToDisk();
            }

            Debug.Log($"[PulseQueue] Pulse enqueued: {pulse.pulseId}. Queue size: {queue.Count}");
        }

        public PulseData Peek()
        {
            if (queue.Count == 0) return null;
            return queue.Peek();
        }

        public PulseData Dequeue()
        {
            if (queue.Count == 0) return null;

            PulseData pulse = queue.Dequeue();

            if (persistEnabled)
            {
                SaveToDisk();
            }

            Debug.Log($"[PulseQueue] Pulse dequeued: {pulse.pulseId}. Queue size: {queue.Count}");
            return pulse;
        }

        public void RequeueWithRetry(PulseData pulse)
        {
            pulse.attemptCount++;
            pulse.status = "retry";
            queue.Enqueue(pulse);

            if (persistEnabled)
            {
                SaveToDisk();
            }

            Debug.Log($"[PulseQueue] Pulse requeued: {pulse.pulseId}, attempt: {pulse.attemptCount}");
        }

        private void SaveToDisk()
        {
            try
            {
                PulseQueueData data = new PulseQueueData();
                data.pendingPulses = new List<PulseData>(queue);

                string json = JsonUtility.ToJson(data, true);
                File.WriteAllText(persistPath, json);
            }
            catch (Exception ex)
            {
                Debug.LogError($"[PulseQueue] Failed to save to disk: {ex.Message}");
            }
        }

        private void LoadFromDisk()
        {
            if (!File.Exists(persistPath)) return;

            try
            {
                string json = File.ReadAllText(persistPath);
                PulseQueueData data = JsonUtility.FromJson<PulseQueueData>(json);

                queue.Clear();
                foreach (var pulse in data.pendingPulses)
                {
                    queue.Enqueue(pulse);
                }

                Debug.Log($"[PulseQueue] Loaded {queue.Count} pending pulses from disk.");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[PulseQueue] Failed to load from disk: {ex.Message}");
            }
        }

        public void Clear()
        {
            queue.Clear();
            if (persistEnabled && File.Exists(persistPath))
            {
                File.Delete(persistPath);
            }
            Debug.Log("[PulseQueue] Queue cleared.");
        }
    }
}
