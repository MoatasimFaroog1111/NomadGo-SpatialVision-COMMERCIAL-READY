using UnityEngine;
using System.Collections.Generic;

#if UNITY_AR
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#endif

namespace NomadGo.Spatial
{
    public class PlaneDetector : MonoBehaviour
    {
#if UNITY_AR
        [SerializeField] private ARPlaneManager planeManager;
#endif

        [SerializeField] private Material planeMaterial;
        [SerializeField] private bool showPlaneVisuals = true;
        [SerializeField] private int maxPlaneCount = 10;

#if UNITY_AR
        private Dictionary<TrackableId, GameObject> planeVisuals = new Dictionary<TrackableId, GameObject>();
#else
        private Dictionary<string, GameObject> planeVisuals = new Dictionary<string, GameObject>();
#endif

        public int DetectedPlaneCount => planeVisuals.Count;

        private void OnEnable()
        {
#if UNITY_AR
            if (planeManager != null)
            {
                planeManager.planesChanged += HandlePlanesChanged;
            }
#endif
        }

        private void OnDisable()
        {
#if UNITY_AR
            if (planeManager != null)
            {
                planeManager.planesChanged -= HandlePlanesChanged;
            }
#endif
        }

        public void Configure(int maxPlanes, string detectionMode)
        {
            maxPlaneCount = maxPlanes;

#if UNITY_AR
            if (planeManager != null)
            {
                switch (detectionMode)
                {
                    case "Horizontal":
                        planeManager.requestedDetectionMode = PlaneDetectionMode.Horizontal;
                        break;

                    case "Vertical":
                        planeManager.requestedDetectionMode = PlaneDetectionMode.Vertical;
                        break;

                    case "Everything":
                        planeManager.requestedDetectionMode = PlaneDetectionMode.Horizontal | PlaneDetectionMode.Vertical;
                        break;

                    default:
                        planeManager.requestedDetectionMode = PlaneDetectionMode.Horizontal;
                        break;
                }
            }
#endif

            Debug.Log("[PlaneDetector] Configured: maxPlanes=" + maxPlanes + ", mode=" + detectionMode);
        }

#if UNITY_AR
        private void HandlePlanesChanged(ARPlanesChangedEventArgs args)
        {
            foreach (var plane in args.added)
            {
                if (planeVisuals.Count >= maxPlaneCount)
                {
                    Debug.Log("[PlaneDetector] Max plane count reached. Ignoring new plane.");
                    continue;
                }

                if (showPlaneVisuals && !planeVisuals.ContainsKey(plane.trackableId))
                {
                    planeVisuals[plane.trackableId] = plane.gameObject;
                    Debug.Log("[PlaneDetector] Plane added: " + plane.trackableId);
                }
            }

            foreach (var plane in args.removed)
            {
                if (planeVisuals.ContainsKey(plane.trackableId))
                {
                    planeVisuals.Remove(plane.trackableId);
                    Debug.Log("[PlaneDetector] Plane removed: " + plane.trackableId);
                }
            }
        }
#endif

        public void SetPlaneVisualsEnabled(bool enabled)
        {
            showPlaneVisuals = enabled;

            foreach (var kvp in planeVisuals)
            {
                if (kvp.Value != null)
                {
                    kvp.Value.SetActive(enabled);
                }
            }
        }
    }
}
