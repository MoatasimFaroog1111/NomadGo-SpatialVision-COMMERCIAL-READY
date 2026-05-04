using UnityEngine;

#if UNITY_AR
using UnityEngine.XR.ARFoundation;
#endif

namespace NomadGo.Spatial
{
    public class DepthEstimator : MonoBehaviour
    {
#if UNITY_AR
        [SerializeField] private AROcclusionManager occlusionManager;
#endif

        private bool depthAvailable = false;

        public bool DepthAvailable => depthAvailable;

        private void Update()
        {
#if UNITY_AR
            if (occlusionManager == null)
            {
                depthAvailable = false;
                return;
            }

            depthAvailable = occlusionManager.environmentDepthTexture != null;
#else
            depthAvailable = false;
#endif
        }

        public float EstimateDepthAtScreenPoint(Vector2 normalizedScreenPoint)
        {
#if UNITY_AR
            if (occlusionManager == null || !depthAvailable)
            {
                return -1f;
            }

            var depthTexture = occlusionManager.environmentDepthTexture;
            if (depthTexture == null) return -1f;

            int x = Mathf.Clamp((int)(normalizedScreenPoint.x * depthTexture.width), 0, depthTexture.width - 1);
            int y = Mathf.Clamp((int)(normalizedScreenPoint.y * depthTexture.height), 0, depthTexture.height - 1);

            try
            {
                Color pixel = depthTexture.GetPixel(x, y);
                return pixel.r;
            }
            catch
            {
                return -1f;
            }
#else
            return -1f;
#endif
        }

        public float EstimateDepthAtBoundingBox(Rect boundingBox)
        {
            Vector2 center = new Vector2(
                (boundingBox.xMin + boundingBox.xMax) / 2f,
                (boundingBox.yMin + boundingBox.yMax) / 2f
            );

            float centerDepth = EstimateDepthAtScreenPoint(center);
            if (centerDepth < 0) return -1f;

            float topDepth = EstimateDepthAtScreenPoint(new Vector2(center.x, boundingBox.yMin));
            float bottomDepth = EstimateDepthAtScreenPoint(new Vector2(center.x, boundingBox.yMax));

            float avgDepth = centerDepth;
            int count = 1;

            if (topDepth > 0)
            {
                avgDepth += topDepth;
                count++;
            }

            if (bottomDepth > 0)
            {
                avgDepth += bottomDepth;
                count++;
            }

            return avgDepth / count;
        }
    }
}
