using System.Collections.Generic;
using UnityEngine;
using NomadGo.Vision;

namespace NomadGo.Counting
{
    public class TrackedObject
    {
        public int trackingId;
        public DetectionResult lastDetection;
        public int age;
        public int hitCount;
        public bool isActive;

        public TrackedObject(int id, DetectionResult detection)
        {
            trackingId = id;
            lastDetection = detection;
            age = 0;
            hitCount = 1;
            isActive = true;
        }
    }

    public class IOUTracker : MonoBehaviour
    {
        private float iouThreshold = 0.4f;
        private int maxAge = 15;
        private const int maxTrackedObjects = 200; // hard cap — prevents OOM on long scans
        private int nextTrackingId = 1;
        private List<TrackedObject> trackedObjects = new List<TrackedObject>();

        public List<TrackedObject> TrackedObjects => trackedObjects;
        public int ActiveTrackCount => trackedObjects.FindAll(t => t.isActive).Count;

        public void Initialize(float iouThreshold, int maxAge)
        {
            this.iouThreshold = iouThreshold;
            this.maxAge = maxAge;
            trackedObjects.Clear();
            nextTrackingId = 1;
            Debug.Log($"[IOUTracker] Initialized. IOU threshold: {iouThreshold}, Max age: {maxAge}");
        }

        public List<DetectionResult> UpdateTracks(List<DetectionResult> detections)
        {
            foreach (var track in trackedObjects)
            {
                track.age++;
                if (track.age > maxAge)
                {
                    track.isActive = false;
                }
            }

            bool[] matched = new bool[detections.Count];
            bool[] trackMatched = new bool[trackedObjects.Count];

            for (int d = 0; d < detections.Count; d++)
            {
                float bestIOU = 0f;
                int bestTrackIdx = -1;

                for (int t = 0; t < trackedObjects.Count; t++)
                {
                    if (trackMatched[t]) continue;
                    if (!trackedObjects[t].isActive) continue;

                    float iou = ONNXInferenceEngine.ComputeIOU(
                        detections[d].boundingBox,
                        trackedObjects[t].lastDetection.boundingBox
                    );

                    if (iou > bestIOU && iou >= iouThreshold)
                    {
                        bestIOU = iou;
                        bestTrackIdx = t;
                    }
                }

                if (bestTrackIdx >= 0)
                {
                    trackedObjects[bestTrackIdx].lastDetection = detections[d];
                    trackedObjects[bestTrackIdx].age = 0;
                    trackedObjects[bestTrackIdx].hitCount++;
                    trackedObjects[bestTrackIdx].isActive = true;
                    detections[d].trackingId = trackedObjects[bestTrackIdx].trackingId;

                    matched[d] = true;
                    trackMatched[bestTrackIdx] = true;
                }
            }

            for (int d = 0; d < detections.Count; d++)
            {
                if (!matched[d])
                {
                    int newId = nextTrackingId++;
                    detections[d].trackingId = newId;

                    if (trackedObjects.Count < maxTrackedObjects) // enforce hard cap
                    {
                        var newTrack = new TrackedObject(newId, detections[d]);
                        trackedObjects.Add(newTrack);
                    }
                }
            }

            trackedObjects.RemoveAll(t => !t.isActive && t.age > maxAge);

            return detections;
        }

        public void Reset()
        {
            trackedObjects.Clear();
            nextTrackingId = 1;
            Debug.Log("[IOUTracker] Reset.");
        }
    }
}
