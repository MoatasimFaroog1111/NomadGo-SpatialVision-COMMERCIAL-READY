using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace NomadGo.AppShell
{
    public class CameraFix : MonoBehaviour
    {
        private WebCamTexture webCamTexture;
        private bool          cameraReady = false;
        private RawImage      rawImage;
        private string        diagText    = "Initializing...";

        public WebCamTexture CameraTexture => webCamTexture;
        public bool          IsReady       => cameraReady;

        private void Awake()
        {
            RenderSettings.skybox = null;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = Color.black;

            string[] arTypes = { "ARCameraBackground", "ARCameraManager",
                                  "ARSession", "ARSessionOrigin",
                                  "ARInputManager", "ARPlaneManager",
                                  "ARPointCloudManager", "ARRaycastManager" };
            var arTypeSet = new System.Collections.Generic.HashSet<string>(arTypes);
            foreach (var mb in FindObjectsOfType<MonoBehaviour>())
            {
                if (mb != null && arTypeSet.Contains(mb.GetType().Name))
                {
                    mb.enabled = false;
                    Debug.Log($"[CameraFix] Disabled {mb.GetType().Name}");
                }
            }

            // Set every Camera to clear with solid black so AR failures can't bleed through
            foreach (var cam in FindObjectsOfType<Camera>())
            {
                cam.clearFlags      = CameraClearFlags.SolidColor;
                cam.backgroundColor = Color.black;
                cam.depth           = 0;
                // Remove any ARCameraBackground component that renders the pink/magenta
                var arBg = cam.GetComponent("ARCameraBackground") as MonoBehaviour;
                if (arBg != null)
                {
                    arBg.enabled = false;
                    Destroy(arBg);
                    Debug.Log("[CameraFix] Removed ARCameraBackground from camera");
                }
            }
        }

        private void Start()
        {
            BuildCameraCanvas();
            StartCoroutine(StartCamera());
        }

        private void LateUpdate()
        {
            foreach (var cam in Camera.allCameras)
            {
                if (cam.clearFlags != CameraClearFlags.SolidColor)
                {
                    cam.clearFlags      = CameraClearFlags.SolidColor;
                    cam.backgroundColor = Color.black;
                    Debug.LogWarning($"[CameraFix] Re-forced SolidColor on {cam.name}");
                }
            }
        }

        private void BuildCameraCanvas()
        {
            var canvasGo = new GameObject("[CameraBG]");
            var canvas   = canvasGo.AddComponent<Canvas>();
            canvas.renderMode   = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = -100;   // behind all UI
            canvasGo.AddComponent<CanvasScaler>();

            var imgGo = new GameObject("feed");
            imgGo.transform.SetParent(canvasGo.transform, false);
            rawImage = imgGo.AddComponent<RawImage>();

            // Center-anchored — size set explicitly after camera starts
            var rt = rawImage.rectTransform;
            rt.anchorMin        = new Vector2(0.5f, 0.5f);
            rt.anchorMax        = new Vector2(0.5f, 0.5f);
            rt.pivot            = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = Vector2.zero;
            rt.sizeDelta        = new Vector2(Screen.width, Screen.height);

            // Use a solid black texture as initial placeholder (NOT just Color.black on rawImage)
            // This ensures no pink/magenta can leak through even if the camera never starts.
            var blackTex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            var pixels = blackTex.GetPixels();
            for (int i = 0; i < pixels.Length; i++) pixels[i] = Color.black;
            blackTex.SetPixels(pixels);
            blackTex.Apply();
            rawImage.texture = blackTex;
            rawImage.color   = Color.white;        }

        private IEnumerator StartCamera()
        {
            diagText = "Requesting camera permission...";
            yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);

            if (!Application.HasUserAuthorization(UserAuthorization.WebCam))
            {
                diagText = "Camera permission denied.\nAllow camera access and restart.";
                Debug.LogError("[CameraFix] Camera permission denied.");
                yield break;
            }

            string camName = "";
            foreach (var d in WebCamTexture.devices)
            {
                Debug.Log($"[CameraFix] device: {d.name} front={d.isFrontFacing}");
                if (!d.isFrontFacing) { camName = d.name; break; }
            }
            if (string.IsNullOrEmpty(camName) && WebCamTexture.devices.Length > 0)
                camName = WebCamTexture.devices[0].name;

            if (string.IsNullOrEmpty(camName))
            {
                diagText = "No camera found on device.";
                Debug.LogError("[CameraFix] No camera device found.");
                yield break;
            }

            diagText = "Opening camera...";
            webCamTexture = new WebCamTexture(camName, 1280, 720, 30);
            webCamTexture.Play();

            float timeout = 30f;
            while (webCamTexture.width <= 16)
            {
                timeout -= Time.deltaTime;
                if (timeout <= 0)
                {
                    diagText = "Camera timed out. Check permissions.";
                    Debug.LogError("[CameraFix] Camera startup timed out.");
                    yield break;
                }
                yield return null;
            }
            yield return new WaitForSeconds(1.0f);

            int  rotAngle = webCamTexture.videoRotationAngle;
            bool mirrored = webCamTexture.videoVerticallyMirrored;

            int scrW = Screen.width;
            int scrH = Screen.height;
            int camW = webCamTexture.width;
            int camH = webCamTexture.height;

            Debug.Log($"[CameraFix] Camera actual res={camW}x{camH} rot={rotAngle} mirror={mirrored} screen={scrW}x{scrH}");

            float scale;
            if (rotAngle == 90 || rotAngle == 270)
                scale = Mathf.Max((float)scrW / camH, (float)scrH / camW);
            else
                scale = Mathf.Max((float)scrW / camW, (float)scrH / camH);

            rawImage.texture = webCamTexture;
            rawImage.color   = Color.white;

            var rt2 = rawImage.rectTransform;
            rt2.sizeDelta        = new Vector2(camW * scale, camH * scale);
            rt2.localEulerAngles = new Vector3(0f, 0f, -rotAngle);
            rt2.localScale       = new Vector3(mirrored ? -1f : 1f, 1f, 1f);

            cameraReady = true;
            diagText    = "";
            Debug.Log($"[CameraFix] Ready rot={rotAngle} mirror={mirrored} " +
                      $"cam={camW}x{camH} scale={scale:F3} " +
                      $"rect={camW * scale:F0}x{camH * scale:F0}");
        }

        private void OnGUI()
        {
            if (cameraReady || string.IsNullOrEmpty(diagText)) return;

            var s = new GUIStyle(GUI.skin.label);
            s.fontSize         = Mathf.Max(22, Screen.height / 28);
            s.fontStyle        = FontStyle.Bold;
            s.normal.textColor = Color.yellow;
            s.alignment        = TextAnchor.MiddleCenter;
            s.wordWrap         = true;
            GUI.Label(new Rect(20, Screen.height * 0.4f, Screen.width - 40, Screen.height * 0.2f),
                      diagText, s);
        }

        private void OnDestroy()
        {
            cameraReady = false;
            if (webCamTexture != null) { webCamTexture.Stop(); webCamTexture = null; }
        }
    }
}
