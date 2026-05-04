using System;
using UnityEngine;

namespace NomadGo.Vision
{
    [Serializable]
    public class DetectionResult
    {
        public int classId;
        public string label;
        public float confidence;
        public Rect boundingBox;
        public int trackingId;
        public float estimatedDepth;

        public DetectionResult(int classId, string label, float confidence, Rect boundingBox)
        {
            this.classId = classId;
            this.label = label;
            this.confidence = confidence;
            this.boundingBox = boundingBox;
            this.trackingId = -1;
            this.estimatedDepth = -1f;
        }

        public Vector2 Center => new Vector2(
            boundingBox.x + boundingBox.width / 2f,
            boundingBox.y + boundingBox.height / 2f
        );

        public float Area => boundingBox.width * boundingBox.height;

        public override string ToString()
        {
            return $"[Detection] {label} (id:{classId}) conf:{confidence:F2} box:{boundingBox} track:{trackingId}";
        }
    }
}
