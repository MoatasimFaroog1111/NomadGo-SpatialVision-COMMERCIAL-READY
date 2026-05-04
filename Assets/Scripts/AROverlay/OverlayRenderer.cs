using System.Collections.Generic;
using UnityEngine;
using NomadGo.Vision;
using NomadGo.Counting;

namespace NomadGo.AROverlay
{
    public class OverlayRenderer : MonoBehaviour
    {
        [Header("Overlay Settings")]
        [SerializeField] private Color boundingBoxColor = Color.green;
        [SerializeField] private Color rowLineColor = Color.cyan;
        [SerializeField] private float lineWidth = 3f;
        [SerializeField] private int fontSize = 16;
        [SerializeField] private Color labelBackgroundColor = new Color(0, 0, 0, 0.75f);
        [SerializeField] private Color labelTextColor = Color.white;

        private List<DetectionResult> currentDetections = new List<DetectionResult>();
        private List<RowCluster> currentClusters = new List<RowCluster>();
        private int totalCount = 0;
        private Dictionary<string, int> countsByLabel = new Dictionary<string, int>();

        private GUIStyle boxStyle;
        private GUIStyle labelStyle;
        private GUIStyle countStyle;
        private GUIStyle rowStyle;
        private bool stylesInitialized = false;

        private int yoloInputW = 640;
        private int yoloInputH = 640;
        private AppShell.CameraFix cameraFix;

        private void Start()
        {
            // If UIBuilder exists, it handles rendering — disable this overlay
            if (FindObjectOfType<AppShell.UIBuilder>() != null)
            {
                Debug.Log("[OverlayRenderer] UIBuilder detected — disabling duplicate overlay.");
                enabled = false;
                return;
            }

            cameraFix = FindObjectOfType<AppShell.CameraFix>();

            var countManager = FindObjectOfType<CountManager>();
            if (countManager != null)
                countManager.OnCountsUpdated += OnCountsUpdated;

            var frameProcessor = FindObjectOfType<FrameProcessor>();
            if (frameProcessor != null)
            {
                frameProcessor.OnDetectionsUpdated += OnDetectionsUpdated;
                yoloInputW = frameProcessor.InputWidth;
                yoloInputH = frameProcessor.InputHeight;
            }
        }

        private void OnDetectionsUpdated(List<DetectionResult> detections)
        {
            currentDetections = detections ?? new List<DetectionResult>();
        }

        private void OnCountsUpdated(int total, Dictionary<string, int> counts, List<RowCluster> clusters)
        {
            totalCount = total;
            countsByLabel = counts ?? new Dictionary<string, int>();
            currentClusters = clusters ?? new List<RowCluster>();
        }

        private void InitializeStyles()
        {
            if (stylesInitialized) return;

            boxStyle = new GUIStyle();
            Texture2D boxTex = new Texture2D(1, 1);
            boxTex.SetPixel(0, 0, boundingBoxColor);
            boxTex.Apply();
            boxStyle.normal.background = boxTex;

            labelStyle = new GUIStyle(GUI.skin.label);
            labelStyle.fontSize = fontSize;
            labelStyle.normal.textColor = labelTextColor;
            labelStyle.alignment = TextAnchor.MiddleCenter;
            labelStyle.fontStyle = FontStyle.Bold;
            Texture2D labelBg = new Texture2D(1, 1);
            labelBg.SetPixel(0, 0, labelBackgroundColor);
            labelBg.Apply();
            labelStyle.normal.background = labelBg;
            labelStyle.padding = new RectOffset(4, 4, 2, 2);

            countStyle = new GUIStyle(GUI.skin.label);
            countStyle.fontSize = fontSize + 10;
            countStyle.normal.textColor = Color.white;
            countStyle.alignment = TextAnchor.UpperLeft;
            countStyle.fontStyle = FontStyle.Bold;
            Texture2D countBg = new Texture2D(1, 1);
            countBg.SetPixel(0, 0, new Color(0, 0, 0, 0.8f));
            countBg.Apply();
            countStyle.normal.background = countBg;
            countStyle.padding = new RectOffset(8, 8, 4, 4);

            rowStyle = new GUIStyle();
            Texture2D rowTex = new Texture2D(1, 1);
            rowTex.SetPixel(0, 0, new Color(rowLineColor.r, rowLineColor.g, rowLineColor.b, 0.3f));
            rowTex.Apply();
            rowStyle.normal.background = rowTex;

            stylesInitialized = true;
        }

        private void OnGUI()
        {
            InitializeStyles();
            DrawBoundingBoxes();
            DrawRowIndicators();
            DrawCountOverlay();
        }

        private Rect YoloBoxToScreen(Rect yoloBox)
        {
            int rotAngle = (cameraFix != null) ? GetCameraRotation() : 0;

            float nx = yoloBox.x / yoloInputW;
            float ny = yoloBox.y / yoloInputH;
            float nw = yoloBox.width / yoloInputW;
            float nh = yoloBox.height / yoloInputH;

            float sx, sy, sw, sh;

            // In portrait mode (rotAngle=90): texture X → screen Y, texture Y (inverted) → screen X
            if (rotAngle == 90)
            {
                // ReadPixels gives y=0 at bottom, YOLO expects y=0 at top → flip y
                float flippedNy = 1f - ny - nh;

                sx = flippedNy * Screen.width;
                sy = nx * Screen.height;
                sw = nh * Screen.width;
                sh = nw * Screen.height;
            }
            else if (rotAngle == 270)
            {
                float flippedNy = 1f - ny - nh;
                sx = (1f - flippedNy - nh) * Screen.width;
                sy = (1f - nx - nw) * Screen.height;
                sw = nh * Screen.width;
                sh = nw * Screen.height;
            }
            else if (rotAngle == 180)
            {
                sx = (1f - nx - nw) * Screen.width;
                sy = ny * Screen.height;
                sw = nw * Screen.width;
                sh = nh * Screen.height;
            }
            else // 0 — landscape
            {
                float flippedNy = 1f - ny - nh;
                sx = nx * Screen.width;
                sy = flippedNy * Screen.height;
                sw = nw * Screen.width;
                sh = nh * Screen.height;
            }

            return new Rect(sx, sy, sw, sh);
        }

        private int GetCameraRotation()
        {
            if (cameraFix == null) return 0;
            var tex = cameraFix.CameraTexture;
            if (tex == null) return 0;
            return tex.videoRotationAngle;
        }

        private void DrawBoundingBoxes()
        {
            if (currentDetections == null) return;

            foreach (var det in currentDetections)
            {
                Rect box = YoloBoxToScreen(det.boundingBox);

                // Draw box outline (4 sides)
                GUI.Box(new Rect(box.x, box.y, box.width, lineWidth), GUIContent.none, boxStyle);
                GUI.Box(new Rect(box.x, box.yMax - lineWidth, box.width, lineWidth), GUIContent.none, boxStyle);
                GUI.Box(new Rect(box.x, box.y, lineWidth, box.height), GUIContent.none, boxStyle);
                GUI.Box(new Rect(box.xMax - lineWidth, box.y, lineWidth, box.height), GUIContent.none, boxStyle);

                // Label
                string labelText = $"{det.label} {det.confidence * 100f:F0}%";
                Vector2 labelSize = labelStyle.CalcSize(new GUIContent(labelText));
                float labelY = Mathf.Max(0, box.y - labelSize.y - 2);
                GUI.Label(new Rect(box.x, labelY, labelSize.x + 8, labelSize.y + 4), labelText, labelStyle);
            }
        }

        private void DrawRowIndicators()
        {
            if (currentClusters == null) return;

            foreach (var cluster in currentClusters)
            {
                float screenY = (cluster.yCenter / yoloInputH) * Screen.height;
                GUI.Box(new Rect(0, screenY - 1, Screen.width, 2), GUIContent.none, rowStyle);

                string rowText = $"Row {cluster.rowIndex + 1}: {cluster.Count} items";
                GUI.Label(new Rect(10, screenY - 24, 250, 22), rowText, labelStyle);
            }
        }

        private void DrawCountOverlay()
        {
            float yOffset = Screen.height - 350f;
            float xOffset = 10f;

            GUI.Label(new Rect(xOffset, yOffset, 320, 44), $"Total: {totalCount}", countStyle);
            yOffset += 48;

            if (countsByLabel != null)
            {
                foreach (var kvp in countsByLabel)
                {
                    GUI.Label(new Rect(xOffset, yOffset, 270, 28), $"  {kvp.Key}: {kvp.Value}", labelStyle);
                    yOffset += 30;
                }
            }
        }

        private void OnDestroy()
        {
            var countManager = FindObjectOfType<CountManager>();
            if (countManager != null)
                countManager.OnCountsUpdated -= OnCountsUpdated;

            var frameProcessor = FindObjectOfType<FrameProcessor>();
            if (frameProcessor != null)
                frameProcessor.OnDetectionsUpdated -= OnDetectionsUpdated;
        }
    }
}
