using System.Collections.Generic;
using UnityEngine;

namespace NomadGo.AppShell
{
    public class UIBuilder : MonoBehaviour
    {
        public static UIBuilder Instance;

        private bool isScanning = false;
        private string statusMessage = "NomadGo Ready — Press Start Scan";

        private float btnHeight;
        private float btnMargin;
        private float statusHeight;

        private GUIStyle btnStyle;
        private GUIStyle statusStyle;

        private List<Vision.DetectionResult> latestDetections = new List<Vision.DetectionResult>();

        private void Awake()
        {
            Instance = this;
        }

        private void Start()
        {
            EnsureCatalogSystem();

            if (GetComponent<CatalogIndicatorUI>() == null)
                gameObject.AddComponent<CatalogIndicatorUI>();
        }

        public void SetCatalogUploadStatus(string msg)
        {
            statusMessage = msg;
        }

        // FIX CS1501: overloads called by CatalogUploader and CatalogReportExporter
        public void SetCatalogUploadStatus(bool? success, string msg)
        {
            statusMessage = msg;
        }

        public void SetCatalogUploadStatus(bool success, string msg)
        {
            statusMessage = msg;
        }

        private void EnsureCatalogSystem()
        {
            var existing = GameObject.Find("CatalogSystem");

            if (existing == null)
                existing = new GameObject("CatalogSystem");

            existing.name = "CatalogSystem";

            if (existing.GetComponent<global::ClientCatalogManager>() == null)
                existing.AddComponent<global::ClientCatalogManager>();

            if (existing.GetComponent<global::CatalogUploader>() == null)
                existing.AddComponent<global::CatalogUploader>();

            DontDestroyOnLoad(existing);
        }

        private void Update()
        {
            var fp = AppManager.Instance != null ? AppManager.Instance.FrameProcessor : null;

            if (isScanning && fp != null)
                latestDetections = fp.LatestDetections ?? new List<Vision.DetectionResult>();
        }

        private void InitStyles()
        {
            float H = Screen.height;

            btnHeight = H * 0.08f;
            btnMargin = H * 0.015f;
            statusHeight = H * 0.06f;

            btnStyle = new GUIStyle(GUI.skin.button);
            btnStyle.fontSize = Mathf.RoundToInt(H * 0.028f);
            btnStyle.alignment = TextAnchor.MiddleCenter;

            statusStyle = new GUIStyle(GUI.skin.label);
            statusStyle.fontSize = Mathf.RoundToInt(H * 0.022f);
            statusStyle.alignment = TextAnchor.MiddleCenter;
            statusStyle.normal.textColor = Color.white;
            statusStyle.wordWrap = true;
        }

        private void OnGUI()
        {
            InitStyles();

            float W = Screen.width;
            float H = Screen.height;
            float m = btnMargin;

            GUI.Box(new Rect(0, 0, W, statusHeight), "");
            GUI.Label(new Rect(0, 0, W, statusHeight), statusMessage, statusStyle);

            float uploadY = H - (btnHeight * 3f);

            if (GUI.Button(new Rect(m, uploadY, W - 2f * m, btnHeight), "Upload Items File", btnStyle))
                OnUploadCatalog();

            float scanY = H - btnHeight - m;

            if (!isScanning)
            {
                if (GUI.Button(new Rect(m, scanY, W - 2f * m, btnHeight), "Start Scan", btnStyle))
                    OnStartScan();
            }
            else
            {
                if (GUI.Button(new Rect(m, scanY, W - 2f * m, btnHeight), "Stop Scan", btnStyle))
                    OnStopScan();
            }

            if (isScanning)
                DrawDetections(W, H);
        }

        private void DrawDetections(float W, float H)
        {
            if (latestDetections == null)
                return;

            GUIStyle labelStyle = new GUIStyle(GUI.skin.label);
            labelStyle.fontSize = Mathf.RoundToInt(H * 0.026f);
            labelStyle.normal.textColor = Color.white;
            labelStyle.fontStyle = FontStyle.Bold;
            labelStyle.wordWrap = true;

            float labelH = Mathf.Max(70f, H * 0.08f);

            foreach (var det in latestDetections)
            {
                if (det == null)
                    continue;

                Rect b = det.boundingBox;

                float x = b.x * W;
                float y = b.y * H;
                float w = b.width * W;
                float h = b.height * H;

                GUI.Box(new Rect(x, y, w, h), "");

                string txt = $"{det.label} {det.confidence:P0}";
                GUI.Label(new Rect(x, Mathf.Max(statusHeight + 40f, y - labelH), Mathf.Max(w, W * 0.35f), labelH), txt, labelStyle);
            }
        }

        private void OnUploadCatalog()
        {
            var uploader = global::CatalogUploader.Instance ?? FindObjectOfType<global::CatalogUploader>();

            if (uploader == null)
            {
                SetCatalogUploadStatus("Catalog uploader not found");
                return;
            }

            SetCatalogUploadStatus("Choose JSON file...");
            uploader.PickCatalogFile();
        }

        private void OnStartScan()
        {
            isScanning = true;
            SetCatalogUploadStatus("Scanning...");
            AppManager.Instance?.StartScan();
        }

        private void OnStopScan()
        {
            isScanning = false;
            latestDetections.Clear();
            SetCatalogUploadStatus("Stopped");
            AppManager.Instance?.StopScan();
        }
    }
}
