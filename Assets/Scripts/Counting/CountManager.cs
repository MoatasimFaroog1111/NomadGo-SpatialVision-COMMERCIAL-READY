using System.Collections.Generic;
using UnityEngine;
using NomadGo.Vision;

namespace NomadGo.Counting
{
    public class CountManager : MonoBehaviour
    {
        [SerializeField] private IOUTracker iouTracker;
        [SerializeField] private RowClusterEngine rowClusterEngine;

        private FrameProcessor frameProcessor;

        private List<RowCluster> currentClusters = new List<RowCluster>();
        private Dictionary<string, int> currentCounts = new Dictionary<string, int>();
        private int totalCount = 0;

        public List<RowCluster> CurrentClusters => currentClusters;
        public Dictionary<string, int> CurrentCounts => currentCounts;
        public int TotalCount => totalCount;

        public delegate void CountsUpdatedHandler(int totalCount, Dictionary<string, int> countsByLabel, List<RowCluster> clusters);
        public event CountsUpdatedHandler OnCountsUpdated;

        public void Initialize(AppShell.CountingConfig config)
        {
            if (iouTracker == null)
                iouTracker = gameObject.AddComponent<IOUTracker>();

            if (rowClusterEngine == null)
                rowClusterEngine = gameObject.AddComponent<RowClusterEngine>();

            iouTracker.Initialize(config.iou_threshold, config.tracking_max_age_frames);
            rowClusterEngine.Initialize(config.row_cluster_vertical_gap, config.row_limit);

            Debug.Log("[CountManager] Initialized.");
        }

        public void InjectFrameProcessor(FrameProcessor fp)
        {
            if (frameProcessor != null)
                frameProcessor.OnDetectionsUpdated -= OnNewDetections;

            frameProcessor = fp;

            if (frameProcessor != null)
                frameProcessor.OnDetectionsUpdated += OnNewDetections;
        }

        private void OnNewDetections(List<DetectionResult> detections)
        {
            List<DetectionResult> tracked = iouTracker.UpdateTracks(detections);

            currentClusters = rowClusterEngine.ClusterDetections(tracked);
            currentCounts   = rowClusterEngine.GetCountsByLabel(currentClusters);
            totalCount      = rowClusterEngine.GetTotalCount(currentClusters);

            OnCountsUpdated?.Invoke(totalCount, currentCounts, currentClusters);

            Debug.Log($"[CountManager] Total: {totalCount}, Rows: {currentClusters.Count}, Tracks: {iouTracker.ActiveTrackCount}");
        }

        public CountSnapshot GetSnapshot()
        {
            return new CountSnapshot
            {
                timestamp        = System.DateTime.UtcNow.ToString("o"),
                totalCount       = totalCount,
                countsByLabel    = new Dictionary<string, int>(currentCounts),
                rowCount         = currentClusters.Count,
                activeTrackCount = iouTracker.ActiveTrackCount
            };
        }

        public void ResetCounts()
        {
            currentClusters.Clear();
            currentCounts.Clear();
            totalCount = 0;
            iouTracker.Reset();
            Debug.Log("[CountManager] Counts reset.");
        }

        private void OnDestroy()
        {
            if (frameProcessor != null)
                frameProcessor.OnDetectionsUpdated -= OnNewDetections;
        }
    }

    [System.Serializable]
    public class CountSnapshot
    {
        public string timestamp;
        public int totalCount;
        public Dictionary<string, int> countsByLabel;
        public int rowCount;
        public int activeTrackCount;
    }
}
