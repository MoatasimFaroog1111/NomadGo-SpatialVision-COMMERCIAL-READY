import 'dart:ui';

/// Represents a single object detection result from the YOLO model.
class DetectionResult {
  /// Bounding box in normalized coordinates (0.0 – 1.0 relative to image size).
  final Rect boundingBox;

  /// Human-readable class label (e.g. "person", "chair").
  final String label;

  /// Detection confidence score in the range [0, 1].
  final double confidence;

  /// Zero-based COCO class index.
  final int classId;

  const DetectionResult({
    required this.boundingBox,
    required this.label,
    required this.confidence,
    required this.classId,
  });

  /// Returns a bounding box scaled to pixel dimensions [width] × [height].
  Rect scaledBox(double width, double height) {
    return Rect.fromLTWH(
      boundingBox.left * width,
      boundingBox.top * height,
      boundingBox.width * width,
      boundingBox.height * height,
    );
  }

  @override
  String toString() =>
      'DetectionResult($label: ${(confidence * 100).toStringAsFixed(1)}%)';
}
