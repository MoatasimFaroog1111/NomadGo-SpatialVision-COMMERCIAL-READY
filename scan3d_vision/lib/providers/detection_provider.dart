import 'package:flutter/foundation.dart';
import '../models/detection_result.dart';

/// Manages the current set of YOLO detections and notifies the UI on update.
class DetectionProvider extends ChangeNotifier {
  List<DetectionResult> _detections = [];
  bool _isDetecting = false;
  int _fps = 0;
  int _frameCount = 0;
  DateTime _lastFpsUpdate = DateTime.now();

  // ─── Getters ──────────────────────────────────────────────────────────────

  List<DetectionResult> get detections => List.unmodifiable(_detections);
  bool get isDetecting => _isDetecting;
  int get fps => _fps;
  bool get hasDetections => _detections.isNotEmpty;

  /// Returns the detection with the highest confidence, or null if empty.
  DetectionResult? get primaryDetection {
    if (_detections.isEmpty) return null;
    return _detections.reduce(
        (a, b) => a.confidence > b.confidence ? a : b);
  }

  // ─── Updates ──────────────────────────────────────────────────────────────

  void updateDetections(List<DetectionResult> results) {
    _detections = results;
    _updateFps();
    notifyListeners();
  }

  void clearDetections() {
    _detections = [];
    _fps = 0;
    _frameCount = 0;
    notifyListeners();
  }

  void setDetecting(bool value) {
    if (_isDetecting == value) return;
    _isDetecting = value;
    notifyListeners();
  }

  void _updateFps() {
    _frameCount++;
    final now = DateTime.now();
    final elapsed = now.difference(_lastFpsUpdate).inMilliseconds;
    if (elapsed >= 1000) {
      _fps = (_frameCount * 1000 / elapsed).round();
      _frameCount = 0;
      _lastFpsUpdate = now;
    }
  }
}
