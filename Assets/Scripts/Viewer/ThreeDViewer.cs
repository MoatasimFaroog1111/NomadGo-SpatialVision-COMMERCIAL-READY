using UnityEngine;
using UnityEngine.UI;
using TMPro;

namespace NomadGo.Viewer
{
    public class ThreeDViewer : MonoBehaviour
    {
        [Header("3D Visualization")]
        [SerializeField] private Material boxMaterial;
        [SerializeField] private float defaultDepth = 2f;  // meters

        private bool isActive = false;
        private Canvas overlayCanvas;
        private GameObject panel3D;
        private TextMeshProUGUI infoText;

        // Pool of 3D cube representations
        private GameObject[] cubePool;
        private int poolSize = 20;

        private void Start()
        {
            Build3DPanel();
            BuildCubePool();
        }

        private void Build3DPanel()
        {
            var canvasGO = GameObject.Find("UICanvas");
            if (canvasGO == null) return;
            overlayCanvas = canvasGO.GetComponent<Canvas>();

            panel3D = new GameObject("Panel3DView");
            panel3D.transform.SetParent(canvasGO.transform, false);

            var rt = panel3D.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0, 0.5f);
            rt.anchorMax = new Vector2(1, 1f);
            rt.offsetMin = new Vector2(10, 10);
            rt.offsetMax = new Vector2(-10, -80);

            var bg = panel3D.AddComponent<Image>();
            bg.color = new Color(0, 0, 0, 0.5f);

            var titleGO = new GameObject("Title3D");
            titleGO.transform.SetParent(panel3D.transform, false);
            var titleRT = titleGO.AddComponent<RectTransform>();
            titleRT.anchorMin = new Vector2(0, 1);
            titleRT.anchorMax = new Vector2(1, 1);
            titleRT.pivot = new Vector2(0.5f, 1f);
            titleRT.anchoredPosition = Vector2.zero;
            titleRT.sizeDelta = new Vector2(0, 55);
            var titleTxt = titleGO.AddComponent<TextMeshProUGUI>();
            titleTxt.text = "3D SPATIAL VIEW";
            titleTxt.fontSize = 28;
            titleTxt.color = Color.yellow;
            titleTxt.alignment = TextAlignmentOptions.Center;
            titleTxt.fontStyle = FontStyles.Bold;

            var infoGO = new GameObject("Info3D");
            infoGO.transform.SetParent(panel3D.transform, false);
            var infoRT = infoGO.AddComponent<RectTransform>();
            infoRT.anchorMin = new Vector2(0, 0);
            infoRT.anchorMax = new Vector2(1, 1);
            infoRT.offsetMin = new Vector2(10, 50);
            infoRT.offsetMax = new Vector2(-10, -60);
            infoText = infoGO.AddComponent<TextMeshProUGUI>();
            infoText.text = "Start a scan to see 3D detections.";
            infoText.fontSize = 22;
            infoText.color = Color.white;
            infoText.alignment = TextAlignmentOptions.TopLeft;

            panel3D.SetActive(false);
        }

        private void BuildCubePool()
        {
            cubePool = new GameObject[poolSize];
            for (int i = 0; i < poolSize; i++)
            {
                var cube = GameObject.CreatePrimitive(PrimitiveType.Cube);
                cube.name = $"DetectionCube_{i}";
                if (boxMaterial != null)
                    cube.GetComponent<Renderer>().material = boxMaterial;
                else
                {
                    var mat = cube.GetComponent<Renderer>().material;
                    mat.color = new Color(0, 1, 0, 0.4f);
                }
                cube.transform.SetParent(transform, false);
                cube.SetActive(false);
                cubePool[i] = cube;
            }
        }

        public void Toggle()
        {
            isActive = !isActive;
            if (panel3D != null) panel3D.SetActive(isActive);
            foreach (var cube in cubePool)
                if (cube != null) cube.SetActive(false);

            Debug.Log($"[3DViewer] {(isActive ? "Activated" : "Deactivated")}");
        }

        private void Update()
        {
            if (!isActive) return;

            var frameProcessor = FindObjectOfType<Vision.FrameProcessor>();
            if (frameProcessor == null || !frameProcessor.IsProcessing)
            {
                if (infoText != null) infoText.text = "Start a scan to see 3D detections.\n\nNote: Accurate 3D requires ARCore/LiDAR.";
                HideAllCubes();
                return;
            }

            var detections = frameProcessor.LatestDetections;
            if (detections == null || detections.Count == 0)
            {
                if (infoText != null) infoText.text = "Scanning... No objects detected yet.\n\nPoint camera at products on a shelf.";
                HideAllCubes();
                return;
            }

            // Update info text
            var countManager = FindObjectOfType<Counting.CountManager>();
            int total = countManager != null ? countManager.TotalCount : detections.Count;
            if (infoText != null)
            {
                var sb = new System.Text.StringBuilder();
                sb.AppendLine($"Detected Objects: {detections.Count}");
                sb.AppendLine($"Total Count: {total}");
                sb.AppendLine();
                sb.AppendLine("Spatial Positions (estimated):");
                for (int i = 0; i < Mathf.Min(detections.Count, 8); i++)
                {
                    var d = detections[i];
                    float depth = d.estimatedDepth > 0 ? d.estimatedDepth : defaultDepth;
                    sb.AppendLine($"  {d.label}: {depth:F1}m - conf {d.confidence * 100f:F0}%");
                }
                infoText.text = sb.ToString();
            }

            // Place cubes in 3D space
            var cam = Camera.main;
            if (cam == null) return;

            HideAllCubes();

            for (int i = 0; i < detections.Count && i < poolSize; i++)
            {
                var det = detections[i];
                float depth = det.estimatedDepth > 0 ? det.estimatedDepth : defaultDepth;

                // Convert screen center of bounding box to world position
                Vector2 screenCenter = new Vector2(
                    (det.boundingBox.x + det.boundingBox.width / 2f) / frameProcessor.InputWidth * Screen.width,
                    Screen.height - (det.boundingBox.y + det.boundingBox.height / 2f) / frameProcessor.InputHeight * Screen.height
                );

                Ray ray = cam.ScreenPointToRay(new Vector3(screenCenter.x, screenCenter.y, 0));
                Vector3 worldPos = ray.origin + ray.direction * depth;

                float worldW = det.boundingBox.width / frameProcessor.InputWidth * depth * 1.5f;
                float worldH = det.boundingBox.height / frameProcessor.InputHeight * depth * 1.5f;
                float worldD = 0.1f;

                cubePool[i].transform.position = worldPos;
                cubePool[i].transform.localScale = new Vector3(worldW, worldH, worldD);
                cubePool[i].SetActive(true);

                var renderer = cubePool[i].GetComponent<Renderer>();
                if (renderer != null)
                {
                    Color col = Color.Lerp(Color.green, Color.red, 1f - det.confidence);
                    col.a = 0.4f;
                    renderer.material.color = col;
                }
            }
        }

        private void HideAllCubes()
        {
            if (cubePool == null) return;
            foreach (var cube in cubePool)
                if (cube != null) cube.SetActive(false);
        }
    }
}
