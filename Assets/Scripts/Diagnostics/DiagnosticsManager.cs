using UnityEngine;

namespace NomadGo.Diagnostics
{
    public class DiagnosticsManager : MonoBehaviour
    {
        [SerializeField] private FPSOverlay fpsOverlay;
        [SerializeField] private InferenceTimer inferenceTimer;
        [SerializeField] private MemoryMonitor memoryMonitor;

        public void Initialize(AppShell.DiagnosticsConfig config)
        {
            if (fpsOverlay == null)
                fpsOverlay = gameObject.AddComponent<FPSOverlay>();

            if (inferenceTimer == null)
                inferenceTimer = gameObject.AddComponent<InferenceTimer>();

            if (memoryMonitor == null)
                memoryMonitor = gameObject.AddComponent<MemoryMonitor>();

            fpsOverlay.ShowOverlay = config.show_fps_overlay;
            inferenceTimer.LogEnabled = config.log_inference_time;
            inferenceTimer.ShowOverlay = config.log_inference_time;
            memoryMonitor.ShowOverlay = config.show_memory_monitor;

            Debug.Log($"[DiagnosticsManager] Initialized. FPS: {config.show_fps_overlay}, Inference: {config.log_inference_time}, Memory: {config.show_memory_monitor}");
        }

        public DiagnosticsSnapshot GetSnapshot()
        {
            return new DiagnosticsSnapshot
            {
                fps = fpsOverlay != null ? fpsOverlay.CurrentFPS : 0f,
                lastInferenceMs = inferenceTimer != null ? inferenceTimer.LastInferenceTimeMs : 0f,
                avgInferenceMs = inferenceTimer != null ? inferenceTimer.AvgInferenceTimeMs : 0f,
                maxInferenceMs = inferenceTimer != null ? inferenceTimer.MaxInferenceTimeMs : 0f,
                usedMemoryMB = memoryMonitor != null ? memoryMonitor.UsedMemoryMB : 0,
                totalMemoryMB = memoryMonitor != null ? memoryMonitor.TotalMemoryMB : 0
            };
        }

        public void ToggleAllOverlays(bool visible)
        {
            if (fpsOverlay != null) fpsOverlay.ShowOverlay = visible;
            if (inferenceTimer != null) inferenceTimer.ShowOverlay = visible;
            if (memoryMonitor != null) memoryMonitor.ShowOverlay = visible;
        }
    }

    [System.Serializable]
    public class DiagnosticsSnapshot
    {
        public float fps;
        public float lastInferenceMs;
        public float avgInferenceMs;
        public float maxInferenceMs;
        public long usedMemoryMB;
        public long totalMemoryMB;
    }
}
