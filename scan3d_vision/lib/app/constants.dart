/// Application-wide constants.
///
/// Values are grouped by concern: model inference, scanning pipeline, mesh
/// generation, and general app metadata.
abstract class AppConstants {
  AppConstants._();

  // ─── YOLO / Inference ────────────────────────────────────────────────────

  /// Input image size fed into the YOLO model (pixels, square).
  static const int modelInputSize = 320;

  /// Minimum confidence score to accept a detection.
  static const double confidenceThreshold = 0.45;

  /// Intersection-over-Union threshold used during non-maximum suppression.
  static const double iouThreshold = 0.5;

  /// Maximum number of detections kept after NMS.
  static const int maxDetections = 20;

  // ─── Scanning Pipeline ────────────────────────────────────────────────────

  /// Target frames-per-second at which scan frames are sampled.
  static const int scanFrameRate = 10;

  /// Number of depth samples taken per scan frame for estimation.
  static const int depthSamples = 64;

  // ─── Mesh / 3D Reconstruction ─────────────────────────────────────────────

  /// Number of vertices along each axis in the reconstructed mesh grid.
  static const int meshResolution = 128;

  // ─── Export ───────────────────────────────────────────────────────────────

  /// GLTF specification version targeted during export.
  static const String gltfVersion = '2.0';

  // ─── General ──────────────────────────────────────────────────────────────

  /// Human-readable application name used in the UI.
  static const String appName = 'Scan3D Vision';

  // ─── Asset Paths ──────────────────────────────────────────────────────────

  /// Directory for TFLite model files bundled with the app.
  static const String modelsPath = 'assets/models/';

  /// Path to the COCO class labels file.
  static const String cocoLabelsPath = 'assets/labels/coco_labels.txt';

  // ─── Misc ─────────────────────────────────────────────────────────────────

  /// Duration (ms) for standard UI animations.
  static const int animationDurationMs = 300;
}
