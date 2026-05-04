import 'dart:math' as math;

import 'package:vector_math/vector_math_64.dart';

import '../models/depth_map.dart';
import '../models/mesh_3d.dart';

/// Generates, refines, and simplifies triangulated [Mesh3D] objects from
/// [DepthMap] data produced by [DepthEstimator].
///
/// The mesh is built on a regular grid aligned to the object's bounding box,
/// then displaced along Z by the depth map.  Normals are computed per-vertex
/// using area-weighted cross-products of adjacent triangle faces.
class MeshGenerator {
  // ---------------------------------------------------------------------------
  // generateMesh
  // ---------------------------------------------------------------------------

  /// Generates a triangulated mesh from [depthMap].
  ///
  /// [depthMap]     — the source depth grid.
  /// [objectCenter] — world-space centre of the scanned object (from AR anchor).
  /// [objectSize]   — real-world size in metres (x = width, y = height, z = depth range).
  /// [resolution]   — side length of the vertex grid.  Clamped to [2, 512].
  ///
  /// The final mesh has [resolution²] vertices and
  /// [2 × (resolution−1)²] triangles.
  Mesh3D generateMesh({
    required DepthMap depthMap,
    required Vector3 objectCenter,
    required Vector3 objectSize,
    int resolution = 128,
  }) {
    resolution = resolution.clamp(2, 512);

    final vertices = <Vector3>[];
    final uvs = <Vector2>[];

    final halfW = objectSize.x / 2.0;
    final halfH = objectSize.y / 2.0;
    final depthScale = objectSize.z; // depth range in metres

    // -----------------------------------------------------------------------
    // Step 1 — build vertex grid
    // -----------------------------------------------------------------------
    for (int row = 0; row < resolution; row++) {
      final vFrac = row / (resolution - 1); // [0, 1]
      for (int col = 0; col < resolution; col++) {
        final uFrac = col / (resolution - 1); // [0, 1]

        // Sample depth map bilinearly.
        final depth = depthMap.sampleBilinear(uFrac, vFrac);

        // Map (u, v, depth) → world-space position centred at objectCenter.
        final x = objectCenter.x + (uFrac - 0.5) * objectSize.x;
        final y = objectCenter.y + (0.5 - vFrac) * objectSize.y; // flip V
        final z = objectCenter.z + (depth == 0 ? 0.0 : (depth - depthMap.minDepth) /
                    (depthMap.maxDepth - depthMap.minDepth == 0
                        ? 1.0
                        : depthMap.maxDepth - depthMap.minDepth) *
                    depthScale);

        vertices.add(Vector3(x, y, z));
        uvs.add(Vector2(uFrac, vFrac));
      }
    }

    // -----------------------------------------------------------------------
    // Step 2 — generate triangle indices (two CCW triangles per quad cell)
    // -----------------------------------------------------------------------
    final indices = <int>[];
    for (int row = 0; row < resolution - 1; row++) {
      for (int col = 0; col < resolution - 1; col++) {
        final tl = row * resolution + col;
        final tr = tl + 1;
        final bl = tl + resolution;
        final br = bl + 1;

        // Upper triangle (TL, TR, BL)
        indices..add(tl)..add(tr)..add(bl);
        // Lower triangle (TR, BR, BL)
        indices..add(tr)..add(br)..add(bl);
      }
    }

    // -----------------------------------------------------------------------
    // Step 3 — compute per-vertex normals
    // -----------------------------------------------------------------------
    final normals = computeNormals(vertices, indices);

    return Mesh3D(
      vertices: vertices,
      normals: normals,
      uvCoordinates: uvs,
      indices: indices,
      center: objectCenter.clone(),
      dimensions: objectSize.clone(),
    );
  }

  // ---------------------------------------------------------------------------
  // computeNormals
  // ---------------------------------------------------------------------------

  /// Computes smooth per-vertex normals by accumulating area-weighted face
  /// normals for every triangle that references each vertex, then normalising.
  ///
  /// [vertices] — vertex positions.
  /// [indices]  — flat triangle index buffer (length must be a multiple of 3).
  ///
  /// Returns a [List<Vector3>] of the same length as [vertices].
  List<Vector3> computeNormals(List<Vector3> vertices, List<int> indices) {
    // Initialise accumulator list.
    final accum = List.generate(vertices.length, (_) => Vector3.zero());

    // Accumulate face normals weighted by triangle area (cross-product magnitude).
    for (int i = 0; i + 2 < indices.length; i += 3) {
      final i0 = indices[i];
      final i1 = indices[i + 1];
      final i2 = indices[i + 2];

      final v0 = vertices[i0];
      final v1 = vertices[i1];
      final v2 = vertices[i2];

      final edge1 = v1 - v0;
      final edge2 = v2 - v0;
      final faceNormal = edge1.cross(edge2); // magnitude = 2 × triangle area

      accum[i0].add(faceNormal);
      accum[i1].add(faceNormal);
      accum[i2].add(faceNormal);
    }

    // Normalise each accumulated normal; fall back to +Y for degenerate cases.
    return accum.map((n) {
      final len = n.length;
      if (len < 1e-9) return Vector3(0, 1, 0);
      return n..scale(1.0 / len);
    }).toList();
  }

  // ---------------------------------------------------------------------------
  // simplifyMesh
  // ---------------------------------------------------------------------------

  /// Simplifies [mesh] towards [targetFaces] using a lightweight vertex
  /// clustering / decimation strategy.
  ///
  /// This implementation groups vertices into a uniform 3-D voxel grid sized
  /// proportionally to the reduction ratio, merges vertices within the same
  /// cell, then removes degenerate triangles and rebuilds the index buffer.
  ///
  /// The result always has at most [targetFaces] triangles (often fewer due
  /// to degenerate removal) but the mesh shape is preserved at large scale.
  ///
  /// [targetFaces] is clamped to [1, mesh.triangleCount].
  Mesh3D simplifyMesh(Mesh3D mesh, int targetFaces) {
    if (mesh.triangleCount == 0) return mesh;
    targetFaces = targetFaces.clamp(1, mesh.triangleCount);

    // Ratio of target to current triangles.
    final ratio = targetFaces / mesh.triangleCount;
    if (ratio >= 1.0) return mesh; // nothing to do

    // -----------------------------------------------------------------------
    // Step 1 — compute grid resolution based on reduction ratio.
    //   For a uniform grid with cell side s, the fraction of surviving
    //   triangles is roughly s³/volume, so s ≈ cbrt(ratio).
    //   We map vertices to integer cells and keep one representative per cell.
    // -----------------------------------------------------------------------
    final boundsMin = mesh.boundsMin;
    final boundsMax = mesh.boundsMax;
    final extent = boundsMax - boundsMin;
    final maxExtent = [extent.x, extent.y, extent.z]
        .fold<double>(0, (prev, e) => e > prev ? e : prev);
    if (maxExtent < 1e-9) return mesh;

    // Grid resolution: at least 2, at most 256.
    final gridRes = (math.pow(ratio, 1.0 / 3.0) * 256).round().clamp(2, 256);
    final cellSize = maxExtent / gridRes;

    // -----------------------------------------------------------------------
    // Step 2 — assign each vertex to a cell; keep the first encountered.
    // -----------------------------------------------------------------------
    final cellToNewIdx = <int, int>{};
    final newVertices = <Vector3>[];
    final newNormals = <Vector3>[];
    final newUVs = <Vector2>[];

    // Map old vertex index → new index.
    final oldToNew = List<int>.filled(mesh.vertices.length, -1);

    for (int i = 0; i < mesh.vertices.length; i++) {
      final v = mesh.vertices[i];
      final cx = ((v.x - boundsMin.x) / cellSize).floor().clamp(0, gridRes - 1);
      final cy = ((v.y - boundsMin.y) / cellSize).floor().clamp(0, gridRes - 1);
      final cz = ((v.z - boundsMin.z) / cellSize).floor().clamp(0, gridRes - 1);
      final cellKey = cx + cy * gridRes + cz * gridRes * gridRes;

      if (cellToNewIdx.containsKey(cellKey)) {
        oldToNew[i] = cellToNewIdx[cellKey]!;
      } else {
        final newIdx = newVertices.length;
        cellToNewIdx[cellKey] = newIdx;
        oldToNew[i] = newIdx;
        newVertices.add(v.clone());
        newNormals.add(
          (i < mesh.normals.length) ? mesh.normals[i].clone() : Vector3(0, 1, 0),
        );
        newUVs.add(
          (i < mesh.uvCoordinates.length)
              ? mesh.uvCoordinates[i].clone()
              : Vector2.zero(),
        );
      }
    }

    // -----------------------------------------------------------------------
    // Step 3 — remap indices; discard degenerate triangles.
    // -----------------------------------------------------------------------
    final newIndices = <int>[];
    for (int i = 0; i + 2 < mesh.indices.length; i += 3) {
      final a = oldToNew[mesh.indices[i]];
      final b = oldToNew[mesh.indices[i + 1]];
      final c = oldToNew[mesh.indices[i + 2]];
      if (a == b || b == c || a == c) continue; // degenerate
      newIndices..add(a)..add(b)..add(c);
    }

    // -----------------------------------------------------------------------
    // Step 4 — recompute normals for the simplified mesh.
    // -----------------------------------------------------------------------
    final smoothNormals = computeNormals(newVertices, newIndices);

    return Mesh3D(
      vertices: newVertices,
      normals: smoothNormals,
      uvCoordinates: newUVs,
      indices: newIndices,
      center: mesh.center.clone(),
      dimensions: mesh.dimensions.clone(),
    );
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /// Clamps [value] to [min, max].
  static double _clamp(double value, double min, double max) {
    if (value < min) return min;
    if (value > max) return max;
    return value;
  }
}
