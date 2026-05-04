using UnityEngine;
using UnityEngine.UI;
using TMPro;

#if UNITY_AR
using UnityEngine.XR.ARFoundation;
#endif

namespace NomadGo.Spatial
{
    public class ARController : MonoBehaviour
    {
        private bool isARActive = false;
        private GameObject arPanel;
        private TextMeshProUGUI arStatusText;
        private bool arCoreAvailable = false;

        private Vision.FrameProcessor _frameProcessor;
        private Counting.CountManager _countManager;

        private float _statusUpdateTimer = 0f;
        private const float STATUS_UPDATE_INTERVAL = 1f;

        private void Start()
        {
            _frameProcessor = FindObjectOfType<Vision.FrameProcessor>();
            _countManager = FindObjectOfType<Counting.CountManager>();

            CheckARCoreAvailability();
            BuildARPanel();
        }

        private void CheckARCoreAvailability()
        {
            arCoreAvailable = false;

#if UNITY_AR
            arCoreAvailable = ARSession.state != ARSessionState.Unsupported;
            Debug.Log("[ARController] ARFoundation state: " + ARSession.state);
#else
            Debug.LogWarning("[ARController] UNITY_AR is not defined. AR mode disabled.");
#endif
        }

        private void BuildARPanel()
        {
            var canvasGO = GameObject.Find("UICanvas");

            if (canvasGO == null)
            {
                canvasGO = GameObject.Find("Canvas");
            }

            if (canvasGO == null)
            {
                Debug.LogWarning("[ARController] No Canvas found. AR panel will not be created.");
                return;
            }

            arPanel = new GameObject("ARPanel");
            arPanel.transform.SetParent(canvasGO.transform, false);

            var rt = arPanel.AddComponent<RectTransform>();
            rt.anchorMin = new Vector2(0.05f, 0.3f);
            rt.anchorMax = new Vector2(0.95f, 0.85f);
            rt.offsetMin = Vector2.zero;
            rt.offsetMax = Vector2.zero;

            var bg = arPanel.AddComponent<Image>();
            bg.color = new Color(0, 0.1f, 0.2f, 0.75f);

            var titleGO = new GameObject("TitleAR");
            titleGO.transform.SetParent(arPanel.transform, false);

            var titleRT = titleGO.AddComponent<RectTransform>();
            titleRT.anchorMin = new Vector2(0, 1);
            titleRT.anchorMax = new Vector2(1, 1);
            titleRT.pivot = new Vector2(0.5f, 1f);
            titleRT.anchoredPosition = Vector2.zero;
            titleRT.sizeDelta = new Vector2(0, 60);

            var titleTxt = titleGO.AddComponent<TextMeshProUGUI>();
            titleTxt.text = arCoreAvailable ? "AR VIEW (ARCore)" : "AR VIEW (No ARCore)";
            titleTxt.fontSize = 28;
            titleTxt.color = arCoreAvailable ? Color.green : Color.yellow;
            titleTxt.alignment = TextAlignmentOptions.Center;
            titleTxt.fontStyle = FontStyles.Bold;

            var infoGO = new GameObject("ARInfo");
            infoGO.transform.SetParent(arPanel.transform, false);

            var infoRT = infoGO.AddComponent<RectTransform>();
            infoRT.anchorMin = new Vector2(0, 0);
            infoRT.anchorMax = new Vector2(1, 1);
            infoRT.offsetMin = new Vector2(10, 10);
            infoRT.offsetMax = new Vector2(-10, -65);

            arStatusText = infoGO.AddComponent<TextMeshProUGUI>();
            arStatusText.fontSize = 20;
            arStatusText.color = Color.white;
            arStatusText.alignment = TextAlignmentOptions.TopLeft;

            arPanel.SetActive(false);
            UpdateARStatus();
        }

        public void Toggle()
        {
            isARActive = !isARActive;

            if (arPanel != null)
            {
                arPanel.SetActive(isARActive);
            }

            UpdateARStatus();
            Debug.Log("[ARController] AR View " + (isARActive ? "ON" : "OFF"));
        }

        private void UpdateARStatus()
        {
            if (arStatusText == null) return;

            if (!isARActive)
            {
                arStatusText.text = "";
                return;
            }

            if (arCoreAvailable)
            {
#if UNITY_AR
                var state = ARSession.state;
                arStatusText.text =
                    "ARCore Status: " + state + "\n\n" +
                    "Point camera at flat surfaces to detect planes.\n" +
                    "Detected planes: " + GetDetectedPlaneCount() + "\n\n" +
                    "Tap on a plane to place objects.";
#endif
            }
            else
            {
                var sb = new System.Text.StringBuilder();

                sb.AppendLine("MODE: Camera / Non-AR");
                sb.AppendLine();
                sb.AppendLine("ARCore is not active.");
                sb.AppendLine("Check ARCore support, XR settings, and camera permission.");
                sb.AppendLine();

                if (_countManager != null)
                {
                    sb.AppendLine("Current Scan Data:");
                    sb.AppendLine("  Total Items: " + _countManager.TotalCount);
                    sb.AppendLine("  Rows: " + (_countManager.CurrentClusters?.Count ?? 0));

                    if (_countManager.CurrentCounts != null)
                    {
                        foreach (var kvp in _countManager.CurrentCounts)
                        {
                            sb.AppendLine("  " + kvp.Key + ": " + kvp.Value);
                        }
                    }
                }
                else
                {
                    sb.AppendLine("Start a scan to see data.");
                }

                arStatusText.text = sb.ToString();
            }
        }

        private int GetDetectedPlaneCount()
        {
#if UNITY_AR
            var planeManager = FindObjectOfType<ARPlaneManager>();
            return planeManager != null ? planeManager.trackables.count : 0;
#else
            return 0;
#endif
        }

        private void Update()
        {
            if (!isARActive) return;

            _statusUpdateTimer += Time.deltaTime;

            if (_statusUpdateTimer >= STATUS_UPDATE_INTERVAL)
            {
                _statusUpdateTimer = 0f;
                UpdateARStatus();
            }
        }
    }
}
