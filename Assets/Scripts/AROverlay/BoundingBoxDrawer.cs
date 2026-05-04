using System.Collections.Generic;
using UnityEngine;
using NomadGo.Vision;

namespace NomadGo.AROverlay
{
    /// <summary>
    /// Draws bounding boxes for detections using OnGUI (immediate-mode GUI).
    ///
    /// FIX: The original implementation used GL.Begin / Shader.Find("Hidden/Internal-Colored")
    /// which causes a pink/magenta fallback on many Android devices (Adreno, Mali) when the
    /// shader is stripped or unavailable in the build.  OnGUI requires no shaders and works
    /// identically on every device.
    /// </summary>
    public class BoundingBoxDrawer : MonoBehaviour
    {
        [Header("Box Settings")]
        [SerializeField] private Color defaultColor            = Color.green;
        [SerializeField] private Color highConfidenceColor     = Color.yellow;
        [SerializeField] private float highConfidenceThreshold = 0.8f;
        [SerializeField] private float cornerLength            = 10f;
        [SerializeField] private float borderWidth             = 3f;

        // Cached textures — one per colour, created lazily
        private Texture2D defaultTex;
        private Texture2D highConfTex;
        private GUIStyle  lineStyle;
        private bool      stylesReady = false;

        // Detections supplied externally (e.g. by OverlayRenderer or UIBuilder)
        private List<DetectionResult> pendingDetections = new List<DetectionResult>();

        // ---------------------------------------------------------------
        // Public API
        // ---------------------------------------------------------------

        /// <summary>Replace the full detection list drawn this frame.</summary>
        public void SetDetections(List<DetectionResult> detections)
        {
            pendingDetections = detections ?? new List<DetectionResult>();
        }

        /// <summary>Draw a single box immediately (called from OnGUI context only).</summary>
        public void DrawBox(DetectionResult detection)
        {
            EnsureStyles();
            bool hi = detection.confidence >= highConfidenceThreshold;
            lineStyle.normal.background = hi ? highConfTex : defaultTex;
            DrawBoxGUI(detection.boundingBox, lineStyle);
        }

        // ---------------------------------------------------------------
        // Unity messages
        // ---------------------------------------------------------------

        private void OnGUI()
        {
            if (pendingDetections == null || pendingDetections.Count == 0) return;
            EnsureStyles();
            foreach (var det in pendingDetections)
                DrawBox(det);
        }

        // ---------------------------------------------------------------
        // Helpers
        // ---------------------------------------------------------------

        private void EnsureStyles()
        {
            if (stylesReady) return;

            defaultTex  = MakeTex(defaultColor);
            highConfTex = MakeTex(highConfidenceColor);

            lineStyle = new GUIStyle(GUIStyle.none);
            lineStyle.normal.background = defaultTex;

            stylesReady = true;
        }

        private static Texture2D MakeTex(Color c)
        {
            var t = new Texture2D(1, 1, TextureFormat.RGBA32, false);
            t.SetPixel(0, 0, c);
            t.Apply();
            return t;
        }

        private void DrawBoxGUI(Rect box, GUIStyle style)
        {
            float bw = borderWidth;
            float cl = cornerLength;

            // ---- four full sides ----
            // Top
            GUI.Box(new Rect(box.xMin, box.yMin, box.width, bw), GUIContent.none, style);
            // Bottom
            GUI.Box(new Rect(box.xMin, box.yMax - bw, box.width, bw), GUIContent.none, style);
            // Left
            GUI.Box(new Rect(box.xMin, box.yMin, bw, box.height), GUIContent.none, style);
            // Right
            GUI.Box(new Rect(box.xMax - bw, box.yMin, bw, box.height), GUIContent.none, style);

            // ---- corner accents (thicker) ----
            float cw = bw * 2f;
            // Top-left
            GUI.Box(new Rect(box.xMin, box.yMin, cl, cw), GUIContent.none, style);
            GUI.Box(new Rect(box.xMin, box.yMin, cw, cl), GUIContent.none, style);
            // Top-right
            GUI.Box(new Rect(box.xMax - cl, box.yMin, cl, cw), GUIContent.none, style);
            GUI.Box(new Rect(box.xMax - cw, box.yMin, cw, cl), GUIContent.none, style);
            // Bottom-left
            GUI.Box(new Rect(box.xMin, box.yMax - cw, cl, cw), GUIContent.none, style);
            GUI.Box(new Rect(box.xMin, box.yMax - cl, cw, cl), GUIContent.none, style);
            // Bottom-right
            GUI.Box(new Rect(box.xMax - cl, box.yMax - cw, cl, cw), GUIContent.none, style);
            GUI.Box(new Rect(box.xMax - cw, box.yMax - cl, cw, cl), GUIContent.none, style);
        }

        private void OnDestroy()
        {
            if (defaultTex  != null) Destroy(defaultTex);
            if (highConfTex != null) Destroy(highConfTex);
        }
    }
}
