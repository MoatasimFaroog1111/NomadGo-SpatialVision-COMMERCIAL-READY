using System;
using System.Collections.Generic;
using UnityEngine;
// FIX CS1069: ScreenCapture is in UnityEngine.ScreenCaptureModule — add explicit using
using ScreenCapture = UnityEngine.ScreenCapture;

namespace NomadGo.Vision
{
    public class FrameProcessor : MonoBehaviour
    {
        public static FrameProcessor Instance;

        public bool IsProcessing { get; private set; } = false;

        public List<DetectionResult> LatestDetections { get; private set; } = new List<DetectionResult>();

        public event Action<List<DetectionResult>> OnDetectionsUpdated;

        private ONNXInferenceEngine engine;

        private int inputWidth = 640;
        private int inputHeight = 640;

        public int InputWidth => inputWidth;
        public int InputHeight => inputHeight;
        public float LastInferenceTimeMs => engine != null ? engine.LastInferenceTimeMs : 0f;

        private void Awake()
        {
            Instance = this;
            EnsureEngine();
        }

        public void Initialize(AppShell.ModelConfig config)
        {
            inputWidth = config.input_width > 0 ? config.input_width : 640;
            inputHeight = config.input_height > 0 ? config.input_height : 640;

            EnsureEngine();

            if (engine != null)
            {
                engine.Initialize(config);
                Debug.Log("[FrameProcessor] Initialized with ONNX engine.");
            }
            else
            {
                Debug.LogError("[FrameProcessor] ONNXInferenceEngine not found and could not be created.");
            }
        }

        private void EnsureEngine()
        {
            if (engine != null)
                return;

            engine = GetComponent<ONNXInferenceEngine>();

            if (engine == null)
                engine = FindObjectOfType<ONNXInferenceEngine>();

            if (engine == null)
                engine = gameObject.AddComponent<ONNXInferenceEngine>();
        }

        public void StartProcessing()
        {
            EnsureEngine();
            IsProcessing = true;
            Debug.Log("[FrameProcessor] Started.");
        }

        public void StopProcessing()
        {
            IsProcessing = false;
            LatestDetections.Clear();
            OnDetectionsUpdated?.Invoke(LatestDetections);
            Debug.Log("[FrameProcessor] Stopped.");
        }

        private void Update()
        {
            if (!IsProcessing)
                return;

            EnsureEngine();

            if (engine == null)
                return;

            Texture2D frame = CaptureFrame();

            if (frame == null)
                return;

            List<DetectionResult> detections = engine.RunInference(frame);

            if (detections != null)
            {
                LatestDetections = detections;
                OnDetectionsUpdated?.Invoke(LatestDetections);
            }

            Destroy(frame);
        }

        private Texture2D CaptureFrame()
        {
            try
            {
                return UnityEngine.ScreenCapture.CaptureScreenshotAsTexture();
            }
            catch (Exception ex)
            {
                Debug.LogError("[FrameProcessor] Capture failed: " + ex.Message);
                return null;
            }
        }
    }
}
