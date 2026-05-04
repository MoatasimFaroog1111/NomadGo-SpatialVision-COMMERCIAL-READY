using UnityEngine;
using System.Collections.Generic;

#if UNITY_AR
using UnityEngine.XR.ARFoundation;
using UnityEngine.XR.ARSubsystems;
#endif

namespace NomadGo.Spatial
{
    public class SpatialManager : MonoBehaviour
    {
#if UNITY_AR
        [Header("AR Components")]
        [SerializeField] private ARPlaneManager arPlaneManager;
        [SerializeField] private ARRaycastManager arRaycastManager;

        private List<ARPlane> detectedPlanes = new List<ARPlane>();

        public List<ARPlane> DetectedPlanes => detectedPlanes;

        public delegate void PlaneDetectedHandler(ARPlane plane);
        public event PlaneDetectedHandler OnPlaneDetected;
#endif

        private bool isTracking = false;

        public bool IsTracking => isTracking;

        public delegate void TrackingStateChangedHandler(bool isTracking);
        public event TrackingStateChangedHandler OnTrackingStateChanged;

        private void OnEnable()
        {
#if UNITY_AR
            if (arPlaneManager != null)
            {
                arPlaneManager.planesChanged += OnPlanesChanged;
            }
#endif
        }

        private void OnDisable()
        {
#if UNITY_AR
            if (arPlaneManager != null)
            {
                arPlaneManager.planesChanged -= OnPlanesChanged;
            }
#endif
        }

        private void Update()
        {
#if UNITY_AR
            bool currentTracking = ARSession.state == ARSessionState.SessionTracking;
#else
            bool currentTracking = false;
#endif

            if (currentTracking != isTracking)
            {
                isTracking = currentTracking;
                OnTrackingStateChanged?.Invoke(isTracking);
                Debug.Log("[SpatialManager] Tracking state changed: " + isTracking);
            }
        }

#if UNITY_AR
        private void OnPlanesChanged(ARPlanesChangedEventArgs args)
        {
            foreach (var plane in args.added)
            {
                if (!detectedPlanes.Contains(plane))
                {
                    detectedPlanes.Add(plane);
                    OnPlaneDetected?.Invoke(plane);
                    Debug.Log("[SpatialManager] New plane detected: " + plane.trackableId);
                }
            }

            foreach (var plane in args.removed)
            {
                detectedPlanes.Remove(plane);
            }
        }

        public bool TryGetPlaneAtScreenPoint(Vector2 screenPoint, out ARRaycastHit hit)
        {
            hit = default;

            if (arRaycastManager == null)
            {
                return false;
            }

            var hits = new List<ARRaycastHit>();

            if (arRaycastManager.Raycast(screenPoint, hits, TrackableType.PlaneWithinPolygon))
            {
                hit = hits[0];
                return true;
            }

            return false;
        }
#endif

        public Vector3 GetWorldPositionFromScreen(Vector2 screenPoint)
        {
#if UNITY_AR
            if (TryGetPlaneAtScreenPoint(screenPoint, out ARRaycastHit hit))
            {
                return hit.pose.position;
            }
#endif
            return Vector3.zero;
        }
    }
}
