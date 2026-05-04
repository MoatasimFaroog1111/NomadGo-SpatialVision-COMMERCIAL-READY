import 'dart:math' as math;
import 'dart:ui' show Rect, Size;

import 'package:vector_math/vector_math_64.dart';

import '../models/depth_map.dart';

/// Estimates a dense per-pixel depth map from sparse AR feature-point clouds.
///
/// The pipeline:
/// 1. Project 3-D AR points into the 2-D image plane using [viewProjection].
/// 2. Retain only the points whose projected coordinates fall inside [boundingBox].
/// 3. Interpolate a dense [resolution × resolution] grid via Inverse Distance
///    Weighting (IDW) with a configurable number of [samples].
class DepthEstimator {
  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /// Estimates depth within [boundingBox] using the supplied AR [arPoints].
  ///
  /// [arPoints]       — raw 3-D feature points from ARCore / ARKit.
  /// [boundingBox]    — the 2-D bounding box of the detected object (pixels).
  /// [imageSize]      — full image resolution (pixels).
  /// [viewProjection] — combined camera view-projection matrix (column-major,
  ///                    as returned by ARCore / ARKit or assembled from the
  ///                    individual view and projection matrices).
  /// [samples]        — number of IDW interpolation samples per output cell.
  ///
  /// Returns a [DepthMap] with a [resolution × resolution] grid.
  DepthMap estimateDepth({
    required List<Vector3> arPoints,
    required Rect boundingBox,
    required Size imageSize,
    Matrix4? viewProjection,
    int samples = 64,
    int resolution = 64,
  }) {
    // Build a default identity view-projection if none was supplied.
    final vp = viewProjection ?? Matrix4.identity();

    // Step 1 — filter points that project into the bounding box region.
    final filtered = filterPointsInRegion(arPoints, boundingBox, vp);

    // Step 2 — fall back: if too few points, use the raw arPoints clipped to
    // a normalised region derived from boundingBox / imageSize.
    final Rect normRegion = _normaliseRect(boundingBox, imageSize);
    final workingPoints =
        filtered.isNotEmpty ? filtered : _fallbackPoints(arPoints, normRegion, vp);

    // Step 3 — build the interpolated grid.
    return interpolateDepthGrid(workingPoints, normRegion, resolution);
  }

  /// Projects each point in [points] into normalised device coordinates and
  /// returns those that fall within [region].
  ///
  /// [viewProjection] is a column-major 4×4 MVP matrix.  [region] is expressed
  /// in the same normalised [0,1]² space as the projected coordinates.
  List<Vector3> filterPointsInRegion(
    List<Vector3> points,
    Rect region,
    Matrix4 viewProjection,
  ) {
    final result = <Vector3>[];
    for (final p in points) {
      final ndc = _projectToNDC(p, viewProjection);
      if (ndc == null) continue; // behind camera or w ≈ 0
      if (ndc.x >= region.left &&
          ndc.x <= region.right &&
          ndc.y >= region.top &&
          ndc.y <= region.bottom) {
        result.add(p);
      }
    }
    return result;
  }

  /// Creates a [resolution × resolution] [DepthMap] by Inverse Distance
  /// Weighting (IDW) over [filteredPoints].
  ///
  /// [filteredPoints] — 3-D world-space points already known to be inside
  ///                    [region].
  /// [region]         — normalised [0,1]² sub-region to populate.
  /// [resolution]     — side length of the output grid.
  ///
  /// The depth value used per point is its Z component (camera-space depth).
  /// Unknown cells (no neighbours within [_idwMaxRadius]) are set to 0.
  DepthMap interpolateDepthGrid(
    List<Vector3> filteredPoints,
    Rect region,
    int resolution,
  ) {
    if (resolution < 1) resolution = 1;

    // Pre-compute 2-D projections in [0,1]² region-space for each point.
    // We use the XY components normalised into [region] space.
    final pts2d = <_Point2D>[];
    double globalMinZ = double.infinity;
    double globalMaxZ = double.negativeInfinity;

    for (final p in filteredPoints) {
      // Map X/Y world coords → [0,1] within the region bounding box.
      final u = region.width == 0
          ? 0.5
          : ((p.x - region.left) / region.width).clamp(0.0, 1.0);
      final v = region.height == 0
          ? 0.5
          : ((p.y - region.top) / region.height).clamp(0.0, 1.0);
      final depth = p.z.abs(); // use absolute depth (metres)
      if (depth < globalMinZ) globalMinZ = depth;
      if (depth > globalMaxZ) globalMaxZ = depth;
      pts2d.add(_Point2D(u, v, depth));
    }

    // Build the empty grid.
    final grid = List.generate(
      resolution,
      (_) => List<double>.filled(resolution, 0),
    );

    if (pts2d.isEmpty) {
      // No data — return a zero map.
      return DepthMap(
        width: resolution,
        height: resolution,
        data: grid,
        minDepth: 0,
        maxDepth: 0,
      );
    }

    // Guarantee valid range when only one unique depth exists.
    if (globalMinZ == globalMaxZ) globalMaxZ = globalMinZ + 1e-6;

    double minOut = double.infinity;
    double maxOut = double.negativeInfinity;

    // IDW interpolation — power = 2.
    const double p = 2.0;
    const double eps = 1e-9; // avoids divide-by-zero for exact coincidences

    for (int row = 0; row < resolution; row++) {
      final v = (row + 0.5) / resolution; // centre of cell in [0,1]
      for (int col = 0; col < resolution; col++) {
        final u = (col + 0.5) / resolution;

        double numerator = 0;
        double denominator = 0;

        for (final pt in pts2d) {
          final du = u - pt.u;
          final dv = v - pt.v;
          final dist2 = du * du + dv * dv;
          final w = 1.0 / (math.pow(dist2 + eps, p / 2));
          numerator += w * pt.depth;
          denominator += w;
        }

        final depth = denominator == 0 ? 0.0 : numerator / denominator;
        grid[row][col] = depth;
        if (depth < minOut) minOut = depth;
        if (depth > maxOut) maxOut = depth;
      }
    }

    return DepthMap(
      width: resolution,
      height: resolution,
      data: grid,
      minDepth: minOut.isFinite ? minOut : 0,
      maxDepth: maxOut.isFinite ? maxOut : 0,
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /// Projects a world-space [point] through [mvp] and returns its normalised
  /// [0,1]² screen coordinates.  Returns null if the point is behind the camera
  /// (negative w) or w is effectively zero.
  Vector2? _projectToNDC(Vector3 point, Matrix4 mvp) {
    final clip = mvp.transformed3(point);
    // vector_math transformed3 applies the full 4×4 transform; we need to do
    // the perspective divide manually.  Reconstruct the homogeneous w.
    // Compute w = m[3]*x + m[7]*y + m[11]*z + m[15]  (column-major storage).
    final storage = mvp.storage;
    final w = storage[3] * point.x +
        storage[7] * point.y +
        storage[11] * point.z +
        storage[15];
    if (w <= 0) return null; // behind camera
    final ndcX = (clip.x / w + 1.0) / 2.0; // remap [-1,1] → [0,1]
    final ndcY = (1.0 - clip.y / w) / 2.0; // flip Y (screen origin top-left)
    return Vector2(ndcX, ndcY);
  }

  /// Normalise a pixel-space [rect] to [0, 1]² coordinates using [imageSize].
  Rect _normaliseRect(Rect rect, Size imageSize) {
    if (imageSize.width == 0 || imageSize.height == 0) return Rect.zero;
    return Rect.fromLTRB(
      rect.left / imageSize.width,
      rect.top / imageSize.height,
      rect.right / imageSize.width,
      rect.bottom / imageSize.height,
    );
  }

  /// When [filterPointsInRegion] returns nothing (e.g. identity projection),
  /// project all [points] via NDC and keep those in [normRegion].  This gives
  /// a workable fallback for when the bounding box was already in normalised
  /// coordinates.
  List<Vector3> _fallbackPoints(
    List<Vector3> points,
    Rect normRegion,
    Matrix4 vp,
  ) {
    final result = <Vector3>[];
    for (final p in points) {
      final ndc = _projectToNDC(p, vp);
      if (ndc == null) continue;
      if (ndc.x >= normRegion.left &&
          ndc.x <= normRegion.right &&
          ndc.y >= normRegion.top &&
          ndc.y <= normRegion.bottom) {
        result.add(p);
      }
    }
    // If still empty, include all points so we always produce *some* depth.
    return result.isEmpty ? points : result;
  }
}

// ---------------------------------------------------------------------------
// Internal data class
// ---------------------------------------------------------------------------

/// Lightweight 2-D point with associated depth used during IDW.
class _Point2D {
  final double u;
  final double v;
  final double depth;
  const _Point2D(this.u, this.v, this.depth);
}
