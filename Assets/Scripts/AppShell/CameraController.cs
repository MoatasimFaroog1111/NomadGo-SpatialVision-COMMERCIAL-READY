using System.Collections;
using UnityEngine;
using UnityEngine.UI;

#if UNITY_AR
using UnityEngine.XR.ARFoundation;
#endif

namespace NomadGo.AppShell
{
    public class CameraController : MonoBehaviour
    {
        [Header("Display")]
        [SerializeField] private RawImage cameraDisplay;
        [SerializeField] private AspectRatioFitter aspectFitter;

#if UNITY_AR
        [Header("AR")]
        [SerializeField] private ARCameraManager arCameraManager;
#endif

        private WebCamTexture webCamTexture;
        private bool usingARFoundation = false;
        private bool cameraStarted = false;

        private int deviceCameraRotation = 0;
        private bool deviceCameraMirror = false;

        private void Start()
        {
            StartCoroutine(InitializeCamera());
        }

        private IEnumerator InitializeCamera()
        {
            yield return Application.RequestUserAuthorization(UserAuthorization.WebCam);

            if (!Application.HasUserAuthorization(UserAuthorization.WebCam))
            {
                Debug.LogError("[CameraController] Camera permission denied.");
                yield break;
            }

#if UNITY_AR
            if (arCameraManager != null && arCameraManager.enabled)
            {
                Debug.Log("[CameraController] Trying ARFoundation camera.");
                arCameraManager.frameReceived += OnARFrameReceived;

                yield return new WaitForSeconds(3f);

                if (!usingARFoundation)
                {
                    Debug.LogWarning("[CameraController] ARFoundation did not provide frames. Falling back to WebCamTexture.");
                    arCameraManager.frameReceived -= OnARFrameReceived;
                    StartWebCamFallback();
                }

                yield break;
            }
#endif

            StartWebCamFallback();
        }

#if UNITY_AR
        private void OnARFrameReceived(ARCameraFrameEventArgs args)
        {
            usingARFoundation = true;
            cameraStarted = true;
        }
#endif

        private void StartWebCamFallback()
        {
            Debug.Log("[CameraController] Starting WebCamTexture fallback.");

            WebCamDevice? backCamera = null;

            foreach (var device in WebCamTexture.devices)
            {
                if (!device.isFrontFacing)
                {
                    backCamera = device;
                    break;
                }
            }

            if (backCamera == null && WebCamTexture.devices.Length > 0)
            {
                backCamera = WebCamTexture.devices[0];
            }

            if (backCamera == null)
            {
                Debug.LogError("[CameraController] No camera found.");
                return;
            }

            webCamTexture = new WebCamTexture(backCamera.Value.name, 1280, 720, 30);
            webCamTexture.Play();

            if (cameraDisplay != null)
            {
                cameraDisplay.texture = webCamTexture;
                cameraDisplay.gameObject.SetActive(true);
            }

            cameraStarted = true;
            Debug.Log("[CameraController] WebCamTexture started: " + backCamera.Value.name);
        }

        private void Update()
        {
            if (webCamTexture == null || !webCamTexture.isPlaying) return;
            if (cameraDisplay == null) return;

            deviceCameraRotation = webCamTexture.videoRotationAngle;
            deviceCameraMirror = webCamTexture.videoVerticallyMirrored;

            ApplyCameraTransform();
        }

        private void ApplyCameraTransform()
        {
            if (cameraDisplay == null) return;

            cameraDisplay.rectTransform.localEulerAngles = Vector3.zero;
            cameraDisplay.uvRect = new Rect(0, 0, 1, 1);

            float rotation = -deviceCameraRotation;
            cameraDisplay.rectTransform.localEulerAngles = new Vector3(0, 0, rotation);

            if (deviceCameraMirror)
            {
                cameraDisplay.uvRect = new Rect(0, 1, 1, -1);
            }

            if (aspectFitter != null && webCamTexture.width > 16 && webCamTexture.height > 16)
            {
                float aspect = (float)webCamTexture.width / webCamTexture.height;

                if (deviceCameraRotation == 90 || deviceCameraRotation == 270)
                {
                    aspect = 1f / aspect;
                }

                aspectFitter.aspectRatio = aspect;
            }
        }

        public WebCamTexture GetWebCamTexture()
        {
            return webCamTexture;
        }

        public bool IsCameraReady()
        {
            return cameraStarted && (usingARFoundation || (webCamTexture != null && webCamTexture.isPlaying && webCamTexture.width > 16));
        }

        private void OnDestroy()
        {
            if (webCamTexture != null)
            {
                webCamTexture.Stop();
                webCamTexture = null;
            }

#if UNITY_AR
            if (arCameraManager != null)
            {
                arCameraManager.frameReceived -= OnARFrameReceived;
            }
#endif
        }
    }
}
