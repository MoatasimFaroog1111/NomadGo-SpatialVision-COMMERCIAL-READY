import 'dart:math' as math;
import 'dart:typed_data';
import 'dart:ui' show Rect;

import 'package:image/image.dart' as img;
import 'package:tflite_flutter/tflite_flutter.dart';

import '../models/detection_result.dart';

// ---------------------------------------------------------------------------
// COCO class labels (80 classes, indices 0-79)
// ---------------------------------------------------------------------------
const List<String> _cocoLabels = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train',
  'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
  'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag',
  'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite',
  'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana',
  'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
  'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table',
  'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock',
  'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const int _inputSize = 320;
const double _confidenceThreshold = 0.45;
const double _iouThreshold = 0.50;

// YOLOv8 output: [1, 84, 2100]  →  84 = 4 (cx,cy,w,h) + 80 class scores
const int _numClasses = 80;
const int _numDetections = 2100; // 320/8 * 320/8 + 320/16 * 320/16 + 320/32 * 320/32

/// Runs YOLOv8n object detection using the tflite_flutter package.
class YoloDetector {
  Interpreter? _interpreter;
  bool _isInitialized = false;

  bool get isInitialized => _isInitialized;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /// Loads the TFLite model from assets and allocates tensors.
  Future<void> initialize() async {
    if (_isInitialized) return;

    final options = InterpreterOptions()..threads = 4;
    _interpreter = await Interpreter.fromAsset(
      'assets/models/yolov8n.tflite',
      options: options,
    );

    // Explicitly resize input tensor to the expected shape.
    _interpreter!.resizeInputTensor(0, [1, _inputSize, _inputSize, 3]);
    _interpreter!.allocateTensors();

    _isInitialized = true;
  }

  /// Runs detection on a decoded [img.Image].
  List<DetectionResult> detectFromImage(img.Image image) {
    _assertInitialized();

    final inputData = _preprocess(image);
    final output = _runInference(inputData);
    return _postprocess(output, image.width, image.height);
  }

  /// Runs detection on raw camera bytes (e.g. from [ImageConverter]).
  ///
  /// [bytes] must be a flat RGBA or RGB buffer of dimensions [width] × [height].
  List<DetectionResult> detectFromBytes(
      Uint8List bytes, int width, int height) {
    _assertInitialized();

    // Reconstruct an img.Image from the raw bytes so we can reuse _preprocess.
    final image = img.Image.fromBytes(
      width: width,
      height: height,
      bytes: bytes.buffer,
      numChannels: 3,
    );
    return detectFromImage(image);
  }

  /// Releases the interpreter and frees native resources.
  void dispose() {
    _interpreter?.close();
    _interpreter = null;
    _isInitialized = false;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  void _assertInitialized() {
    if (!_isInitialized || _interpreter == null) {
      throw StateError(
          'YoloDetector is not initialized. Call initialize() first.');
    }
  }

  /// Resizes [image] to [_inputSize]×[_inputSize] and normalises pixels to
  /// [0, 1].  Returns a [List<List<double>>] shaped [_inputSize * _inputSize, 3]
  /// that will be wrapped into the [1, 320, 320, 3] input tensor.
  List<List<double>> _preprocess(img.Image image) {
    final resized =
        img.copyResize(image, width: _inputSize, height: _inputSize);

    // Build flat [320*320][3] list — tflite_flutter accepts nested lists.
    final pixels = <List<double>>[];
    for (int y = 0; y < _inputSize; y++) {
      for (int x = 0; x < _inputSize; x++) {
        final pixel = resized.getPixel(x, y);
        pixels.add([
          pixel.r / 255.0,
          pixel.g / 255.0,
          pixel.b / 255.0,
        ]);
      }
    }
    return pixels;
  }

  /// Feeds [inputPixels] (flattened [320*320][3]) through the interpreter and
  /// returns the raw output shaped [1][84][2100].
  List<List<List<double>>> _runInference(List<List<double>> inputPixels) {
    // Reshape into [1][320][320][3] by wrapping appropriately.
    // tflite_flutter accepts a 4-D nested list for float32 inputs.
    final input = List.generate(
      1,
      (_) => List.generate(
        _inputSize,
        (y) => List.generate(
          _inputSize,
          (x) => inputPixels[y * _inputSize + x],
        ),
      ),
    );

    // Output buffer: [1][84][2100]
    final output = List.generate(
      1,
      (_) => List.generate(
        84,
        (_) => List.filled(_numDetections, 0.0),
      ),
    );

    _interpreter!.run(input, output);
    return output;
  }

  /// Parses the YOLOv8 [output] tensor ([1][84][2100]), filters by confidence,
  /// scales boxes back to original image size, then applies NMS.
  List<DetectionResult> _postprocess(
    List<List<List<double>>> output,
    int origWidth,
    int origHeight,
  ) {
    // output[0] has shape [84][2100]
    final data = output[0]; // [84][2100]

    final candidates = <DetectionResult>[];

    for (int d = 0; d < _numDetections; d++) {
      // YOLOv8 layout: rows 0-3 are cx, cy, w, h (in model-input pixels 0–320)
      final cx = data[0][d];
      final cy = data[1][d];
      final bw = data[2][d];
      final bh = data[3][d];

      // Find best class and its raw score.
      double maxScore = 0.0;
      int maxClassId = 0;
      for (int c = 0; c < _numClasses; c++) {
        final score = data[4 + c][d];
        if (score > maxScore) {
          maxScore = score;
          maxClassId = c;
        }
      }

      if (maxScore < _confidenceThreshold) continue;

      // Normalise bbox to [0, 1] relative to the model input size.
      final x1 = (cx - bw / 2.0) / _inputSize;
      final y1 = (cy - bh / 2.0) / _inputSize;
      final x2 = (cx + bw / 2.0) / _inputSize;
      final y2 = (cy + bh / 2.0) / _inputSize;

      // Clamp to valid range.
      final left = x1.clamp(0.0, 1.0);
      final top = y1.clamp(0.0, 1.0);
      final right = x2.clamp(0.0, 1.0);
      final bottom = y2.clamp(0.0, 1.0);

      if (right <= left || bottom <= top) continue;

      final label = maxClassId < _cocoLabels.length
          ? _cocoLabels[maxClassId]
          : 'class_$maxClassId';

      candidates.add(DetectionResult(
        boundingBox: Rect.fromLTRB(left, top, right, bottom),
        label: label,
        confidence: maxScore,
        classId: maxClassId,
      ));
    }

    return _nms(candidates);
  }

  /// Computes Intersection-over-Union between two rectangles.
  double _computeIoU(Rect a, Rect b) {
    final interLeft = math.max(a.left, b.left);
    final interTop = math.max(a.top, b.top);
    final interRight = math.min(a.right, b.right);
    final interBottom = math.min(a.bottom, b.bottom);

    if (interRight <= interLeft || interBottom <= interTop) return 0.0;

    final interArea =
        (interRight - interLeft) * (interBottom - interTop);
    final unionArea = a.width * a.height + b.width * b.height - interArea;

    return unionArea > 0 ? interArea / unionArea : 0.0;
  }

  /// Applies class-aware Non-Maximum Suppression to [detections].
  List<DetectionResult> _nms(List<DetectionResult> detections) {
    if (detections.isEmpty) return [];

    // Group detections by class.
    final byClass = <int, List<DetectionResult>>{};
    for (final d in detections) {
      byClass.putIfAbsent(d.classId, () => []).add(d);
    }

    final results = <DetectionResult>[];

    for (final classDetections in byClass.values) {
      // Sort descending by confidence.
      final sorted = List<DetectionResult>.from(classDetections)
        ..sort((a, b) => b.confidence.compareTo(a.confidence));

      final kept = <DetectionResult>[];
      final suppressed = List<bool>.filled(sorted.length, false);

      for (int i = 0; i < sorted.length; i++) {
        if (suppressed[i]) continue;

        kept.add(sorted[i]);

        for (int j = i + 1; j < sorted.length; j++) {
          if (suppressed[j]) continue;
          if (_computeIoU(sorted[i].boundingBox, sorted[j].boundingBox) >
              _iouThreshold) {
            suppressed[j] = true;
          }
        }
      }

      results.addAll(kept);
    }

    return results;
  }
}
