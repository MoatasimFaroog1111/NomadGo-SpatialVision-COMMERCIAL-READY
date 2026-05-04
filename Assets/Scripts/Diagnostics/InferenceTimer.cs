using UnityEngine;

namespace NomadGo.Diagnostics
{
    public class InferenceTimer : MonoBehaviour
    {
        private float lastInferenceTimeMs = 0f;
        private float avgInferenceTimeMs = 0f;
        private float maxInferenceTimeMs = 0f;
        private int sampleCount = 0;
        private bool logEnabled = true;
        private bool showOverlay = true;
        private GUIStyle timerStyle;
        private bool styleInitialized = false;

        public float LastInferenceTimeMs => lastInferenceTimeMs;
        public float AvgInferenceTimeMs => avgInferenceTimeMs;
        public float MaxInferenceTimeMs => maxInferenceTimeMs;
        public bool LogEnabled { get => logEnabled; set => logEnabled = value; }
        public bool ShowOverlay { get => showOverlay; set => showOverlay = value; }

        private void Start()
        {
            var frameProcessor = FindObjectOfType<Vision.FrameProcessor>();
            if (frameProcessor != null)
            {
                frameProcessor.OnDetectionsUpdated += (detections) =>
                {
                    RecordInference(frameProcessor.LastInferenceTimeMs);
                };
            }
        }

        public void RecordInference(float timeMs)
        {
            lastInferenceTimeMs = timeMs;
            sampleCount++;
            avgInferenceTimeMs = ((avgInferenceTimeMs * (sampleCount - 1)) + timeMs) / sampleCount;
            maxInferenceTimeMs = Mathf.Max(maxInferenceTimeMs, timeMs);

            if (logEnabled)
            {
                Debug.Log($"[InferenceTimer] Last: {timeMs:F1}ms, Avg: {avgInferenceTimeMs:F1}ms, Max: {maxInferenceTimeMs:F1}ms");
            }
        }

        public void Reset()
        {
            lastInferenceTimeMs = 0f;
            avgInferenceTimeMs = 0f;
            maxInferenceTimeMs = 0f;
            sampleCount = 0;
        }

        private void InitStyle()
        {
            if (styleInitialized) return;

            timerStyle = new GUIStyle();
            timerStyle.fontSize = 14;
            timerStyle.fontStyle = FontStyle.Normal;
            timerStyle.normal.textColor = Color.white;
            timerStyle.padding = new RectOffset(6, 6, 4, 4);

            Texture2D bg = new Texture2D(1, 1);
            bg.SetPixel(0, 0, new Color(0, 0, 0, 0.6f));
            bg.Apply();
            timerStyle.normal.background = bg;

            styleInitialized = true;
        }

        private void OnGUI()
        {
            if (!showOverlay) return;

            InitStyle();

            float x = Screen.width - 200;
            float y = 45;

            GUI.Label(new Rect(x, y, 190, 22), $"Inference: {lastInferenceTimeMs:F1}ms", timerStyle);
            GUI.Label(new Rect(x, y + 25, 190, 22), $"Avg: {avgInferenceTimeMs:F1}ms | Max: {maxInferenceTimeMs:F1}ms", timerStyle);
        }
    }
}
