using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Networking;
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

namespace NomadGo.Vision
{
    public class ONNXInferenceEngine : MonoBehaviour
    {
        private string modelPath;
        private int inputWidth = 640;
        private int inputHeight = 640;
        private float confidenceThreshold = 0.45f;
        private float nmsThreshold = 0.45f;
        private int maxDetections = 50;
        private string[] labels;

        private bool isLoaded = false;
        private bool isLoading = false;
        private bool useDemoMode = false;
        private float lastInferenceMs = 0f;

        private InferenceSession ortSession;
        private string ortInputName = "images";
        private string ortOutputName = "output0";
        private bool ortReady = false;

        private string overrideOnnxPath;
        private string overrideLabelsPath;

        public bool IsLoaded => isLoaded;
        public bool IsLoading => isLoading;
        public bool IsInDemoMode => useDemoMode;
        public float LastInferenceTimeMs => lastInferenceMs;
        public int InputWidth => inputWidth;
        public int InputHeight => inputHeight;

        public void Initialize(AppShell.ModelConfig config)
        {
            modelPath = string.IsNullOrEmpty(config.path) ? "Models/yolov8n.onnx" : config.path;
            inputWidth = config.input_width > 0 ? config.input_width : 640;
            inputHeight = config.input_height > 0 ? config.input_height : 640;

            confidenceThreshold = Mathf.Clamp(
                config.confidence_threshold <= 0 ? 0.45f : config.confidence_threshold,
                0.15f,
                0.90f
            );

            nmsThreshold = Mathf.Clamp(
                config.nms_threshold <= 0 ? 0.45f : config.nms_threshold,
                0.10f,
                0.95f
            );

            maxDetections = Mathf.Clamp(
                config.max_detections <= 0 ? 50 : config.max_detections,
                1,
                200
            );

            LoadLabels(config.labels_path);
            StartCoroutine(LoadModelAsync());
        }

        public void ReloadModel(string onnxPath, string newLabelsPath)
        {
            if (isLoading)
                return;

            overrideOnnxPath = onnxPath;
            overrideLabelsPath = newLabelsPath;

            if (ortSession != null)
            {
                ortSession.Dispose();
                ortSession = null;
            }

            ortReady = false;
            isLoaded = false;
            useDemoMode = false;

            if (!string.IsNullOrEmpty(newLabelsPath) && File.Exists(newLabelsPath))
            {
                labels = File.ReadAllText(newLabelsPath)
                    .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(x => x.Trim())
                    .Where(x => x.Length > 0)
                    .ToArray();
            }

            StartCoroutine(LoadModelAsync());
        }

        public List<DetectionResult> RunInference(Texture2D frame)
        {
            if (frame == null || !isLoaded)
                return new List<DetectionResult>();

            if (ortReady && ortSession != null && !useDemoMode)
            {
                try
                {
                    return RunOnnxRuntimeInference(frame);
                }
                catch (Exception ex)
                {
                    UnityEngine.Debug.LogError("[ONNXEngine] Inference failed: " + ex);
                    return new List<DetectionResult>();
                }
            }

            return new List<DetectionResult>();
        }

        private void LoadLabels(string labelsPath)
        {
            string res = string.IsNullOrEmpty(labelsPath)
                ? "labels"
                : labelsPath.Replace(".txt", "").Replace("Models/", "").Replace("Resources/", "");

            TextAsset asset = Resources.Load<TextAsset>(res) ?? Resources.Load<TextAsset>("labels");

            if (asset != null)
            {
                labels = asset.text
                    .Split(new[] { '\n', '\r' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(x => x.Trim())
                    .Where(x => x.Length > 0)
                    .ToArray();
            }
            else
            {
                labels = new[]
                {
                    "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
                    "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
                    "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
                    "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
                    "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
                    "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
                    "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
                    "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
                    "remote","keyboard","cell phone","microwave","oven","toaster","sink","refrigerator",
                    "book","clock","vase","scissors","teddy bear","hair drier","toothbrush"
                };
            }
        }

        private IEnumerator LoadModelAsync()
        {
            isLoading = true;

            string effectivePath = !string.IsNullOrEmpty(overrideOnnxPath)
                ? overrideOnnxPath
                : Path.Combine(Application.streamingAssetsPath, modelPath);

            byte[] bytes = null;

#if UNITY_ANDROID && !UNITY_EDITOR
            using (var req = UnityWebRequest.Get(effectivePath))
            {
                req.timeout = 120;
                yield return req.SendWebRequest();

                if (req.result == UnityWebRequest.Result.Success)
                    bytes = req.downloadHandler.data;
                else
                    UnityEngine.Debug.LogError("[ONNXEngine] Model load failed: " + req.error + " | " + effectivePath);
            }
#else
            if (File.Exists(effectivePath))
                bytes = File.ReadAllBytes(effectivePath);
            else
                UnityEngine.Debug.LogError("[ONNXEngine] Model file not found: " + effectivePath);

            yield return null;
#endif

            if (bytes == null || bytes.Length == 0)
            {
                isLoading = false;
                isLoaded = false;
                useDemoMode = false;
                yield break;
            }

            try
            {
                var options = new SessionOptions
                {
                    GraphOptimizationLevel = GraphOptimizationLevel.ORT_ENABLE_ALL
                };

                ortSession = new InferenceSession(bytes, options);
                ortInputName = ortSession.InputMetadata.Keys.FirstOrDefault() ?? "images";
                ortOutputName = ortSession.OutputMetadata.Keys.FirstOrDefault() ?? "output0";

                ortReady = true;
                isLoaded = true;
                useDemoMode = false;

                UnityEngine.Debug.Log("[ONNXEngine] Model loaded. Input=" + ortInputName + " Output=" + ortOutputName);
            }
            catch (Exception ex)
            {
                UnityEngine.Debug.LogError("[ONNXEngine] ONNX Runtime session failed: " + ex);

                ortReady = false;
                isLoaded = false;
                useDemoMode = false;
            }

            isLoading = false;
        }

        private List<DetectionResult> RunOnnxRuntimeInference(Texture2D frame)
        {
            var sw = Stopwatch.StartNew();

            DenseTensor<float> tensor = TextureToNCHWTensor(frame);
            NamedOnnxValue input = NamedOnnxValue.CreateFromTensor<float>(ortInputName, tensor);

            using (var results = ortSession.Run(new[] { input }))
            {
                sw.Stop();
                lastInferenceMs = (float)sw.Elapsed.TotalMilliseconds;

                var outputValue = results.FirstOrDefault(r => r.Name == ortOutputName) ?? results.First();
                var outputTensor = outputValue.AsTensor<float>();

                var parsed = ParseYolo(outputTensor);
                var nms = ApplyNMS(parsed).Take(maxDetections).ToList();

                if (Time.frameCount % 30 == 0)
                    UnityEngine.Debug.Log("[ONNXEngine] raw=" + parsed.Count + " nms=" + nms.Count + " ms=" + lastInferenceMs.ToString("F1"));

                return nms;
            }
        }

        private DenseTensor<float> TextureToNCHWTensor(Texture2D src)
        {
            RenderTexture rt = RenderTexture.GetTemporary(inputWidth, inputHeight, 0, RenderTextureFormat.ARGB32);
            Graphics.Blit(src, rt);

            RenderTexture prev = RenderTexture.active;
            RenderTexture.active = rt;

            Texture2D tex = new Texture2D(inputWidth, inputHeight, TextureFormat.RGB24, false);
            tex.ReadPixels(new Rect(0, 0, inputWidth, inputHeight), 0, 0);
            tex.Apply(false);

            RenderTexture.active = prev;
            RenderTexture.ReleaseTemporary(rt);

            Color32[] px = tex.GetPixels32();
            Destroy(tex);

            DenseTensor<float> t = new DenseTensor<float>(new[] { 1, 3, inputHeight, inputWidth });

            for (int y = 0; y < inputHeight; y++)
            {
                for (int x = 0; x < inputWidth; x++)
                {
                    Color32 p = px[y * inputWidth + x];

                    t[0, 0, y, x] = p.r / 255f;
                    t[0, 1, y, x] = p.g / 255f;
                    t[0, 2, y, x] = p.b / 255f;
                }
            }

            return t;
        }

        private List<DetectionResult> ParseYolo(Tensor<float> output)
        {
            int[] d = output.Dimensions.ToArray();
            List<DetectionResult> list = new List<DetectionResult>();

            if (d.Length != 3)
                return list;

            if (d[0] == 1 && d[1] >= 6 && d[2] > d[1])
                ParseAttributesAnchors(output, d[1], d[2], list);
            else if (d[0] == 1 && d[2] >= 6 && d[1] > d[2])
                ParseAnchorsAttributes(output, d[1], d[2], list);

            return list;
        }

        private void ParseAttributesAnchors(Tensor<float> o, int attributes, int anchors, List<DetectionResult> list)
        {
            bool hasObjectness = attributes == (labels.Length + 5) || attributes == 85 || attributes == 6;
            int classStart = hasObjectness && attributes > 6 ? 5 : 4;
            int classCount = Mathf.Min(labels.Length, attributes - classStart);

            for (int a = 0; a < anchors; a++)
            {
                float obj = hasObjectness && attributes > 6 ? SigmoidIfNeeded(o[0, 4, a]) : 1f;
                int cls = 0;
                float best = 0f;

                if (attributes == 6)
                {
                    best = SigmoidIfNeeded(o[0, 4, a]);
                    cls = Mathf.Clamp(Mathf.RoundToInt(o[0, 5, a]), 0, labels.Length - 1);
                }
                else
                {
                    for (int c = 0; c < classCount; c++)
                    {
                        float s = SigmoidIfNeeded(o[0, classStart + c, a]) * obj;

                        if (s > best)
                        {
                            best = s;
                            cls = c;
                        }
                    }
                }

                if (best < confidenceThreshold)
                    continue;

                AddDetection(list, cls, best, o[0, 0, a], o[0, 1, a], o[0, 2, a], o[0, 3, a], attributes == 6);
            }
        }

        private void ParseAnchorsAttributes(Tensor<float> o, int anchors, int attributes, List<DetectionResult> list)
        {
            bool hasObjectness = attributes == (labels.Length + 5) || attributes == 85 || attributes == 6;
            int classStart = hasObjectness && attributes > 6 ? 5 : 4;
            int classCount = Mathf.Min(labels.Length, attributes - classStart);

            for (int a = 0; a < anchors; a++)
            {
                float obj = hasObjectness && attributes > 6 ? SigmoidIfNeeded(o[0, a, 4]) : 1f;
                int cls = 0;
                float best = 0f;

                if (attributes == 6)
                {
                    best = SigmoidIfNeeded(o[0, a, 4]);
                    cls = Mathf.Clamp(Mathf.RoundToInt(o[0, a, 5]), 0, labels.Length - 1);
                }
                else
                {
                    for (int c = 0; c < classCount; c++)
                    {
                        float s = SigmoidIfNeeded(o[0, a, classStart + c]) * obj;

                        if (s > best)
                        {
                            best = s;
                            cls = c;
                        }
                    }
                }

                if (best < confidenceThreshold)
                    continue;

                AddDetection(list, cls, best, o[0, a, 0], o[0, a, 1], o[0, a, 2], o[0, a, 3], attributes == 6);
            }
        }

        private void AddDetection(List<DetectionResult> list, int cls, float conf, float x0, float y0, float x1orW, float y1orH, bool xyxy)
        {
            Rect r;

            if (xyxy)
            {
                float x1 = NormalizeCoord(x0, inputWidth);
                float y1 = NormalizeCoord(y0, inputHeight);
                float x2 = NormalizeCoord(x1orW, inputWidth);
                float y2 = NormalizeCoord(y1orH, inputHeight);

                r = Rect.MinMaxRect(
                    Mathf.Min(x1, x2),
                    Mathf.Min(y1, y2),
                    Mathf.Max(x1, x2),
                    Mathf.Max(y1, y2)
                );
            }
            else
            {
                float cx = NormalizeCoord(x0, inputWidth);
                float cy = NormalizeCoord(y0, inputHeight);
                float w = NormalizeSize(x1orW, inputWidth);
                float h = NormalizeSize(y1orH, inputHeight);

                r = new Rect(cx - w * 0.5f, cy - h * 0.5f, w, h);
            }

            if (r.width <= 0.01f || r.height <= 0.01f || r.width > 1.2f || r.height > 1.2f)
                return;

            r.x = Mathf.Clamp01(r.x);
            r.y = Mathf.Clamp01(r.y);
            r.width = Mathf.Clamp01(r.width);
            r.height = Mathf.Clamp01(r.height);

            string label = cls >= 0 && cls < labels.Length ? labels[cls] : "class_" + cls;

            list.Add(new DetectionResult(cls, label, conf, r));
        }

        private float NormalizeCoord(float value, int size)
        {
            return Mathf.Abs(value) > 1.5f ? value / size : value;
        }

        private float NormalizeSize(float value, int size)
        {
            return Mathf.Abs(value) > 1.5f ? value / size : value;
        }

        private float SigmoidIfNeeded(float value)
        {
            return value < 0f || value > 1f ? 1f / (1f + Mathf.Exp(-value)) : value;
        }

        private List<DetectionResult> ApplyNMS(List<DetectionResult> detections)
        {
            detections.Sort((a, b) => b.confidence.CompareTo(a.confidence));

            List<DetectionResult> kept = new List<DetectionResult>();

            foreach (DetectionResult detection in detections)
            {
                bool keep = true;

                foreach (DetectionResult existing in kept)
                {
                    if (detection.classId == existing.classId &&
                        ComputeIOU(detection.boundingBox, existing.boundingBox) > nmsThreshold)
                    {
                        keep = false;
                        break;
                    }
                }

                if (keep)
                    kept.Add(detection);
            }

            return kept;
        }

        public static float ComputeIOU(Rect a, Rect b)
        {
            float x1 = Mathf.Max(a.xMin, b.xMin);
            float y1 = Mathf.Max(a.yMin, b.yMin);
            float x2 = Mathf.Min(a.xMax, b.xMax);
            float y2 = Mathf.Min(a.yMax, b.yMax);

            float inter = Mathf.Max(0, x2 - x1) * Mathf.Max(0, y2 - y1);
            float union = a.width * a.height + b.width * b.height - inter;

            return union > 0 ? inter / union : 0;
        }

        private void OnDestroy()
        {
            if (ortSession != null)
            {
                ortSession.Dispose();
                ortSession = null;
            }
        }
    }
}
