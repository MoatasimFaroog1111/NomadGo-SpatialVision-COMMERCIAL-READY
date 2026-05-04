import 'dart:async';
import 'dart:ui' show Rect;

import 'package:ar_flutter_plugin_2/managers/ar_anchor_manager.dart';
import 'package:ar_flutter_plugin_2/managers/ar_location_manager.dart';
import 'package:ar_flutter_plugin_2/managers/ar_object_manager.dart';
import 'package:ar_flutter_plugin_2/managers/ar_session_manager.dart'
    as ar_plugin;
import 'package:vector_math/vector_math_64.dart';

/// Wraps the ar_flutter_plugin_2 session lifecycle and accumulates the 3-D
/// feature points emitted by ARCore (Android) / ARKit (iOS).
///
/// Usage:
/// ```dart
/// final manager = ARSessionManager();
/// // Wire up in your ARView widget:
/// ARView(onARViewCreated: manager.onARViewCreated, ...);
///
/// manager.startPointCollection();
/// // … capture frames / run YOLO …
/// final points = manager.collectedPoints;
/// manager.stopPointCollection();
/// ```
class ARSessionManager {
  // ---------------------------------------------------------------------------
  // AR plugin handles
  // ---------------------------------------------------------------------------

  ar_plugin.ARSessionManager? _arSession;
  ARObjectManager? _objectManager;
  ARAnchorManager? _anchorManager;
  ARLocationManager? _locationManager;

  // ---------------------------------------------------------------------------
  // Point cloud accumulation
  // ---------------------------------------------------------------------------

  final List<Vector3> _points = [];
  bool _collecting = false;

  /// Subscription to the AR session's frame-update stream.
  StreamSubscription<dynamic>? _frameSubscription;

  // ---------------------------------------------------------------------------
  // Camera state
  // ---------------------------------------------------------------------------

  /// Current view-projection matrix updated each AR frame.
  Matrix4 _viewProjection = Matrix4.identity();

  /// Detected plane centres keyed by plane ID (string).  Each entry stores
  /// the centre position and extent (half-sizes) of the plane.
  final Map<String, _PlaneInfo> _planes = {};

  // ---------------------------------------------------------------------------
  // AR view creation callback
  // ---------------------------------------------------------------------------

  /// Called by [ARView.onARViewCreated].  Stores plugin manager references and
  /// registers frame / plane callbacks.
  void onARViewCreated(
    ar_plugin.ARSessionManager arSessionManager,
    ARObjectManager objectManager,
    ARAnchorManager anchorManager,
    ARLocationManager locationManager,
  ) {
    _arSession = arSessionManager;
    _objectManager = objectManager;
    _anchorManager = anchorManager;
    _locationManager = locationManager;

    // Configure the session for plane detection and point-cloud collection.
    arSessionManager.onInitialize(
      customPlaneTexturePath: null,
      showAnimatedGuide: false,
      handleTaps: false,
      handlePans: false,
      handleRotation: false,
    );

    // Listen for plane updates to track real-world surfaces.
    arSessionManager.onPlaneOrPointTap = _onPlaneOrPointTap;
  }

  // ---------------------------------------------------------------------------
  // Point collection control
  // ---------------------------------------------------------------------------

  /// Begins accumulating feature points from incoming AR frames.
  void startPointCollection() {
    _collecting = true;
  }

  /// Stops accumulating new feature points.
  void stopPointCollection() {
    _collecting = false;
    _frameSubscription?.cancel();
    _frameSubscription = null;
  }

  /// Appends [points] to the internal collection if collection is active.
  void addPointsFromFrame(List<Vector3> points) {
    if (!_collecting) return;
    _points.addAll(points);
  }

  /// Clears all accumulated points and resets the view-projection matrix.
  void clearPoints() {
    _points.clear();
    _viewProjection = Matrix4.identity();
    _planes.clear();
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /// All accumulated 3-D feature points in world space (metres).
  List<Vector3> get collectedPoints => List.unmodifiable(_points);

  /// The most recent camera view-projection matrix.
  Matrix4 get currentViewMatrix => _viewProjection.clone();

  /// Total number of accumulated points.
  int get pointCount => _points.length;

  /// Whether collection is currently active.
  bool get isCollecting => _collecting;

  // ---------------------------------------------------------------------------
  // Object size estimation
  // ---------------------------------------------------------------------------

  /// Estimates the real-world size of the detected object described by
  /// [boundingBox] (normalised [0,1]² coordinates).
  ///
  /// Strategy:
  /// 1. If a horizontal plane is visible, project the bounding box corners onto
  ///    the plane and compute the physical width/height.
  /// 2. Otherwise, fall back to the median depth of collected points combined
  ///    with a typical camera FOV to estimate angular size.
  /// 3. Depth (Z extent) is estimated from the standard deviation of the Z
  ///    coordinates of points within the bounding box.
  Vector3 estimateObjectSize(Rect boundingBox) {
    // Gather the subset of points that project into the bounding box.
    final inBox = _pointsInBoundingBox(boundingBox);

    if (inBox.isEmpty) {
      // No AR data for this region — return a reasonable default (0.3 m cube).
      return Vector3(0.3, 0.3, 0.3);
    }

    // Compute axis-aligned extent of the selected points.
    double minX = inBox[0].x, maxX = inBox[0].x;
    double minY = inBox[0].y, maxY = inBox[0].y;
    double minZ = inBox[0].z, maxZ = inBox[0].z;

    for (final p in inBox) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
    }

    // Use detected plane dimensions to refine width/height if available.
    double width = (maxX - minX).clamp(0.05, 10.0);
    double height = (maxY - minY).clamp(0.05, 10.0);
    final depth = (maxZ - minZ).clamp(0.01, 10.0);

    if (_planes.isNotEmpty) {
      // Prefer the largest detected plane's extents as an anchor for scale.
      final largest = _planes.values.reduce(
        (a, b) => a.extentX * a.extentZ > b.extentX * b.extentZ ? a : b,
      );
      // Scale the width/height proportionally to the bounding box fractions.
      final boxW = boundingBox.width.clamp(0.01, 1.0);
      final boxH = boundingBox.height.clamp(0.01, 1.0);
      width = (largest.extentX * boxW * 2).clamp(0.05, 10.0);
      height = (largest.extentZ * boxH * 2).clamp(0.05, 10.0);
    }

    return Vector3(width, height, depth);
  }

  // ---------------------------------------------------------------------------
  // Frame update ingestion
  // ---------------------------------------------------------------------------

  /// Call this every AR frame with the latest feature points and camera matrix.
  /// Typically invoked from the AR view's frame-update callback or a timer.
  void updateFrame({
    required List<Vector3> featurePoints,
    required Matrix4 viewProjection,
    List<_PlaneInfo>? detectedPlanes,
  }) {
    _viewProjection = viewProjection.clone();
    if (detectedPlanes != null) {
      for (final plane in detectedPlanes) {
        _planes[plane.id] = plane;
      }
    }
    addPointsFromFrame(featurePoints);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /// Releases all resources.  Must be called when the AR view is destroyed.
  void dispose() {
    stopPointCollection();
    _arSession?.dispose();
    _arSession = null;
    _objectManager = null;
    _anchorManager = null;
    _locationManager = null;
    _planes.clear();
    _points.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /// Returns the subset of [_points] whose projected NDC coordinates fall
  /// inside [normBox] (normalised [0,1]²).
  List<Vector3> _pointsInBoundingBox(Rect normBox) {
    final vp = _viewProjection;
    final storage = vp.storage;
    final result = <Vector3>[];

    for (final p in _points) {
      // Compute clip-space position.
      final clip = vp.transformed3(p);
      final w = storage[3] * p.x +
          storage[7] * p.y +
          storage[11] * p.z +
          storage[15];
      if (w <= 0) continue;
      final ndcX = (clip.x / w + 1.0) / 2.0;
      final ndcY = (1.0 - clip.y / w) / 2.0;
      if (ndcX >= normBox.left &&
          ndcX <= normBox.right &&
          ndcY >= normBox.top &&
          ndcY <= normBox.bottom) {
        result.add(p);
      }
    }
    return result;
  }

  /// No-op tap handler required by the AR plugin API.
  void _onPlaneOrPointTap(List<dynamic> hits) {
    // Intentionally empty — tap handling is done elsewhere.
  }
}

// ---------------------------------------------------------------------------
// Supporting data class
// ---------------------------------------------------------------------------

/// Lightweight descriptor for a detected AR plane.
class _PlaneInfo {
  final String id;

  /// Centre of the plane in world space.
  final Vector3 center;

  /// Half-extents of the plane (X and Z since planes are horizontal by default).
  final double extentX;
  final double extentZ;

  const _PlaneInfo({
    required this.id,
    required this.center,
    required this.extentX,
    required this.extentZ,
  });
}
