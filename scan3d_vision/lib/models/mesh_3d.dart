import 'package:vector_math/vector_math_64.dart';

/// A triangulated 3-D mesh produced by [MeshGenerator].
///
/// The mesh is stored in a split-array layout:
/// - [vertices]      — world-space positions, one per vertex.
/// - [normals]       — unit normals, parallel to [vertices].
/// - [uvCoordinates] — texture coordinates in [0, 1]², parallel to [vertices].
/// - [indices]       — flat list of triangle corner indices (length = 3 × triangleCount).
class Mesh3D {
  final List<Vector3> vertices;
  final List<Vector3> normals;
  final List<Vector2> uvCoordinates;

  /// Flat triangle index buffer.  Every 3 entries form one triangle.
  final List<int> indices;

  /// World-space centre of the mesh (matches the AR anchor position).
  final Vector3 center;

  /// Approximate real-world extent of the mesh in metres (width, height, depth).
  final Vector3 dimensions;

  const Mesh3D({
    required this.vertices,
    required this.normals,
    required this.uvCoordinates,
    required this.indices,
    required this.center,
    required this.dimensions,
  });

  // ---------------------------------------------------------------------------
  // Convenience getters
  // ---------------------------------------------------------------------------

  int get vertexCount => vertices.length;
  int get triangleCount => indices.length ~/ 3;

  /// Axis-aligned bounding-box minimum corner.
  Vector3 get boundsMin {
    if (vertices.isEmpty) return Vector3.zero();
    var min = vertices[0].clone();
    for (final v in vertices) {
      if (v.x < min.x) min.x = v.x;
      if (v.y < min.y) min.y = v.y;
      if (v.z < min.z) min.z = v.z;
    }
    return min;
  }

  /// Axis-aligned bounding-box maximum corner.
  Vector3 get boundsMax {
    if (vertices.isEmpty) return Vector3.zero();
    var max = vertices[0].clone();
    for (final v in vertices) {
      if (v.x > max.x) max.x = v.x;
      if (v.y > max.y) max.y = v.y;
      if (v.z > max.z) max.z = v.z;
    }
    return max;
  }

  /// Geometric centre derived from the AABB (may differ slightly from [center]).
  Vector3 get aabbCenter => (boundsMin + boundsMax)..scale(0.5);

  /// True AABB diagonal length in metres — useful for LOD distance thresholds.
  double get boundsDiagonal {
    final d = boundsMax - boundsMin;
    return d.length;
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  /// Returns true when all parallel arrays have consistent lengths and the
  /// index buffer references only valid vertex positions.
  bool get isValid {
    if (vertices.length != normals.length) return false;
    if (vertices.length != uvCoordinates.length) return false;
    if (indices.length % 3 != 0) return false;
    for (final idx in indices) {
      if (idx < 0 || idx >= vertices.length) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Serialisation helpers
  // ---------------------------------------------------------------------------

  /// Flat vertex position buffer [x0,y0,z0, x1,y1,z1, …] — useful for GLTF
  /// accessor generation.
  List<double> get flatPositions {
    final out = <double>[];
    for (final v in vertices) {
      out..add(v.x)..add(v.y)..add(v.z);
    }
    return out;
  }

  /// Flat normal buffer [nx0,ny0,nz0, …].
  List<double> get flatNormals {
    final out = <double>[];
    for (final n in normals) {
      out..add(n.x)..add(n.y)..add(n.z);
    }
    return out;
  }

  /// Flat UV buffer [u0,v0, u1,v1, …].
  List<double> get flatUVs {
    final out = <double>[];
    for (final uv in uvCoordinates) {
      out..add(uv.x)..add(uv.y);
    }
    return out;
  }

  @override
  String toString() =>
      'Mesh3D(vertices: $vertexCount, triangles: $triangleCount, '
      'bounds: ${boundsMin.storage.map((v) => v.toStringAsFixed(3)).toList()} → '
      '${boundsMax.storage.map((v) => v.toStringAsFixed(3)).toList()})';
}
