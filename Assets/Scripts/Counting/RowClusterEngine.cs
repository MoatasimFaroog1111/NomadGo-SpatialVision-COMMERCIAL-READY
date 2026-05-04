using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using NomadGo.Vision;

namespace NomadGo.Counting
{
    [System.Serializable]
    public class RowCluster
    {
        public int rowIndex;
        public float yCenter;
        public List<DetectionResult> items = new List<DetectionResult>();

        public int Count => items.Count;
    }

    public class RowClusterEngine : MonoBehaviour
    {
        private float verticalGap = 50f;
        private int rowLimit = 6;

        public void Initialize(float verticalGap, int rowLimit)
        {
            this.verticalGap = verticalGap;
            this.rowLimit = rowLimit;
            Debug.Log($"[RowCluster] Initialized. Vertical gap: {verticalGap}, Row limit: {rowLimit}");
        }

        public List<RowCluster> ClusterDetections(List<DetectionResult> detections)
        {
            if (detections == null || detections.Count == 0)
            {
                return new List<RowCluster>();
            }

            var sorted = detections.OrderBy(d => d.Center.y).ToList();

            List<RowCluster> clusters = new List<RowCluster>();
            RowCluster currentCluster = new RowCluster
            {
                rowIndex = 0,
                yCenter = sorted[0].Center.y
            };
            currentCluster.items.Add(sorted[0]);

            for (int i = 1; i < sorted.Count; i++)
            {
                float yDiff = Mathf.Abs(sorted[i].Center.y - currentCluster.yCenter);

                if (yDiff <= verticalGap)
                {
                    currentCluster.items.Add(sorted[i]);
                    currentCluster.yCenter = currentCluster.items.Average(d => d.Center.y);
                }
                else
                {
                    clusters.Add(currentCluster);
                    currentCluster = new RowCluster
                    {
                        rowIndex = clusters.Count,
                        yCenter = sorted[i].Center.y
                    };
                    currentCluster.items.Add(sorted[i]);
                }
            }
            clusters.Add(currentCluster);

            if (clusters.Count > rowLimit)
            {
                clusters = clusters.Take(rowLimit).ToList();
                Debug.LogWarning($"[RowCluster] Clusters capped at row limit: {rowLimit}");
            }

            for (int i = 0; i < clusters.Count; i++)
            {
                clusters[i].rowIndex = i;
                clusters[i].items = clusters[i].items.OrderBy(d => d.Center.x).ToList();
            }

            return clusters;
        }

        public Dictionary<string, int> GetCountsByLabel(List<RowCluster> clusters)
        {
            var counts = new Dictionary<string, int>();

            foreach (var cluster in clusters)
            {
                foreach (var item in cluster.items)
                {
                    if (counts.ContainsKey(item.label))
                        counts[item.label]++;
                    else
                        counts[item.label] = 1;
                }
            }

            return counts;
        }

        public int GetTotalCount(List<RowCluster> clusters)
        {
            return clusters.Sum(c => c.Count);
        }
    }
}
