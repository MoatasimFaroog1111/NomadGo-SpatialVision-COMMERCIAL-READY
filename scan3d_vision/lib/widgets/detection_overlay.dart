import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../models/detection_result.dart';
import '../providers/detection_provider.dart';
import 'package:provider/provider.dart';

/// A widget that renders YOLO detection bounding boxes with corner markers,
/// confidence-colored strokes, and label badges over the camera preview.
class DetectionOverlay extends StatefulWidget {
  final Size previewSize;

  const DetectionOverlay({
    super.key,
    required this.previewSize,
  });

  @override
  State<DetectionOverlay> createState() => _DetectionOverlayState();
}

class _DetectionOverlayState extends State<DetectionOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _scanLineController;
  late Animation<double> _opacityAnimation;

  @override
  void initState() {
    super.initState();
    _scanLineController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1500),
    )..repeat(reverse: true);

    _opacityAnimation = Tween<double>(begin: 0.5, end: 1.0).animate(
      CurvedAnimation(parent: _scanLineController, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _scanLineController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DetectionProvider>(
      builder: (context, provider, _) {
        return AnimatedBuilder(
          animation: _opacityAnimation,
          builder: (context, _) {
            return CustomPaint(
              painter: _DetectionPainter(
                detections: provider.detections,
                previewSize: widget.previewSize,
                animationOpacity: _opacityAnimation.value,
              ),
              child: const SizedBox.expand(),
            );
          },
        );
      },
    );
  }
}

class _DetectionPainter extends CustomPainter {
  final List<DetectionResult> detections;
  final Size previewSize;
  final double animationOpacity;

  _DetectionPainter({
    required this.detections,
    required this.previewSize,
    required this.animationOpacity,
  });

  /// Returns a color based on detection confidence level.
  Color _colorForConfidence(double confidence) {
    if (confidence >= 0.7) return const Color(0xFF00E676); // green
    if (confidence >= 0.5) return const Color(0xFFFFD600); // yellow
    return const Color(0xFFFF1744); // red
  }

  /// Scales a normalized [Rect] to the canvas dimensions, accounting for
  /// the aspect ratio difference between the camera preview and the widget.
  Rect _scaleRect(Rect normalized, Size canvasSize) {
    final double scaleX = canvasSize.width / previewSize.width;
    final double scaleY = canvasSize.height / previewSize.height;
    return Rect.fromLTWH(
      normalized.left * previewSize.width * scaleX,
      normalized.top * previewSize.height * scaleY,
      normalized.width * previewSize.width * scaleX,
      normalized.height * previewSize.height * scaleY,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    for (final detection in detections) {
      final Rect rect = _scaleRect(detection.boundingBox, size);
      final Color boxColor =
          _colorForConfidence(detection.confidence).withOpacity(animationOpacity);

      // ─── Bounding box stroke ─────────────────────────────────────────────
      final Paint boxPaint = Paint()
        ..color = boxColor
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.0;
      canvas.drawRect(rect, boxPaint);

      // ─── Corner L-shaped markers ─────────────────────────────────────────
      _drawCornerMarkers(canvas, rect, boxColor);

      // ─── Label badge ─────────────────────────────────────────────────────
      _drawLabel(
        canvas,
        rect,
        detection.label,
        detection.confidence,
        boxColor,
      );
    }
  }

  void _drawCornerMarkers(Canvas canvas, Rect rect, Color color) {
    const double markerLength = 16.0;
    const double markerThickness = 3.0;
    final Paint markerPaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = markerThickness
      ..strokeCap = StrokeCap.square;

    // Top-left
    canvas.drawLine(rect.topLeft, rect.topLeft.translate(markerLength, 0), markerPaint);
    canvas.drawLine(rect.topLeft, rect.topLeft.translate(0, markerLength), markerPaint);

    // Top-right
    canvas.drawLine(rect.topRight, rect.topRight.translate(-markerLength, 0), markerPaint);
    canvas.drawLine(rect.topRight, rect.topRight.translate(0, markerLength), markerPaint);

    // Bottom-left
    canvas.drawLine(rect.bottomLeft, rect.bottomLeft.translate(markerLength, 0), markerPaint);
    canvas.drawLine(rect.bottomLeft, rect.bottomLeft.translate(0, -markerLength), markerPaint);

    // Bottom-right
    canvas.drawLine(rect.bottomRight, rect.bottomRight.translate(-markerLength, 0), markerPaint);
    canvas.drawLine(rect.bottomRight, rect.bottomRight.translate(0, -markerLength), markerPaint);
  }

  void _drawLabel(
    Canvas canvas,
    Rect boxRect,
    String label,
    double confidence,
    Color color,
  ) {
    final String displayText =
        '$label ${(confidence * 100).toStringAsFixed(0)}%';

    final TextPainter tp = TextPainter(
      text: TextSpan(
        text: displayText,
        style: const TextStyle(
          color: Colors.white,
          fontSize: 11.0,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.3,
        ),
      ),
      textDirection: TextDirection.ltr,
    )..layout();

    const double hPad = 6.0;
    const double vPad = 3.0;
    const double badgeRadius = 4.0;

    final double badgeWidth = tp.width + hPad * 2;
    final double badgeHeight = tp.height + vPad * 2;

    // Position above the box, clamped so it doesn't go off-screen top
    double badgeTop = boxRect.top - badgeHeight - 2.0;
    if (badgeTop < 0) badgeTop = boxRect.top + 2.0;

    final Rect badgeRect = Rect.fromLTWH(
      boxRect.left,
      badgeTop,
      badgeWidth,
      badgeHeight,
    );

    final RRect badgeRRect =
        RRect.fromRectAndRadius(badgeRect, const Radius.circular(badgeRadius));

    // Badge background
    canvas.drawRRect(
      badgeRRect,
      Paint()..color = color.withOpacity(0.9),
    );

    // Badge text
    tp.paint(
      canvas,
      Offset(badgeRect.left + hPad, badgeRect.top + vPad),
    );
  }

  @override
  bool shouldRepaint(_DetectionPainter oldDelegate) =>
      oldDelegate.detections != detections ||
      oldDelegate.animationOpacity != animationOpacity ||
      oldDelegate.previewSize != previewSize;
}
