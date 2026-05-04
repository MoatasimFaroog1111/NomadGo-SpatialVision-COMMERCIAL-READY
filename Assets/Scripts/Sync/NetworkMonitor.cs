using UnityEngine;

namespace NomadGo.Sync
{
    public class NetworkMonitor : MonoBehaviour
    {
        private bool isOnline = false;
        private float checkInterval = 3f;
        private float checkTimer = 0f;

        public bool IsOnline => isOnline;

        public delegate void NetworkStatusChangedHandler(bool isOnline);
        public event NetworkStatusChangedHandler OnNetworkStatusChanged;

        private void Start()
        {
            CheckNetworkStatus();
        }

        private void Update()
        {
            checkTimer += Time.deltaTime;
            if (checkTimer >= checkInterval)
            {
                checkTimer = 0f;
                CheckNetworkStatus();
            }
        }

        private void CheckNetworkStatus()
        {
            bool previousStatus = isOnline;
            isOnline = Application.internetReachability != NetworkReachability.NotReachable;

            if (isOnline != previousStatus)
            {
                OnNetworkStatusChanged?.Invoke(isOnline);
                Debug.Log($"[NetworkMonitor] Network status changed: {(isOnline ? "ONLINE" : "OFFLINE")}");
            }
        }

        public string GetConnectionType()
        {
            switch (Application.internetReachability)
            {
                case NetworkReachability.ReachableViaCarrierDataNetwork:
                    return "cellular";
                case NetworkReachability.ReachableViaLocalAreaNetwork:
                    return "wifi";
                default:
                    return "none";
            }
        }
    }
}
