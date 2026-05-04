import 'dart:io';
import 'package:share_plus/share_plus.dart';
import '../models/mesh_3d.dart';

/// Provides system-level sharing for exported .glb model files.
class ModelSharingService {
  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /// Shares the .glb file at [filePath] via the platform share sheet.
  ///
  /// The file must exist on disk; an [ArgumentError] is thrown otherwise.
  Future<void> shareModel(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw ArgumentError('File does not exist: $filePath');
    }

    final xFile = XFile(
      filePath,
      mimeType: 'model/gltf-binary',
    );

    await Share.shareXFiles(
      [xFile],
      subject: _filenameFromPath(filePath),
    );
  }

  /// Shares the .glb file at [filePath] together with a human-readable text
  /// description that summarises the mesh dimensions, vertex count, and face
  /// count.
  ///
  /// The sharing sheet will include both the file attachment and the text so
  /// that apps that accept plain text (e.g. Messages, Mail) show the metadata
  /// even if they cannot open the .glb.
  Future<void> shareWithMetadata(String filePath, Mesh3D mesh) async {
    final file = File(filePath);
    if (!await file.exists()) {
      throw ArgumentError('File does not exist: $filePath');
    }

    final sizeString = await getFileSizeString(filePath);
    final description = _buildDescription(mesh, sizeString);

    final xFile = XFile(
      filePath,
      mimeType: 'model/gltf-binary',
    );

    await Share.shareXFiles(
      [xFile],
      subject: _filenameFromPath(filePath),
      text: description,
    );
  }

  /// Returns a human-readable string for the size of the file at [filePath].
  ///
  /// Examples: "512 B", "12.3 KB", "4.7 MB".
  /// Returns "0 B" if the file does not exist.
  Future<String> getFileSizeString(String filePath) async {
    final file = File(filePath);
    if (!await file.exists()) return '0 B';

    final bytes = await file.length();
    return _formatBytes(bytes);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ──────────────────────────────────────────────────────────────────────────

  /// Extracts just the filename (with extension) from a full path.
  String _filenameFromPath(String path) {
    return path.split(Platform.pathSeparator).last;
  }

  /// Converts [bytes] to a readable size string with up to one decimal place.
  String _formatBytes(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      final kb = bytes / 1024;
      return '${kb.toStringAsFixed(1)} KB';
    }
    if (bytes < 1024 * 1024 * 1024) {
      final mb = bytes / (1024 * 1024);
      return '${mb.toStringAsFixed(1)} MB';
    }
    final gb = bytes / (1024 * 1024 * 1024);
    return '${gb.toStringAsFixed(2)} GB';
  }

  /// Builds the metadata text that accompanies a shared model.
  String _buildDescription(Mesh3D mesh, String fileSizeString) {
    final vertexCount = mesh.vertices.length;
    final faceCount = mesh.indices.length ~/ 3;

    // Compute bounding-box dimensions for display.
    final (dimX, dimY, dimZ) = _computeDimensions(mesh);

    final sb = StringBuffer();
    sb.writeln('3D Scan — Scan3D Vision');
    sb.writeln();
    sb.writeln('Vertices : $vertexCount');
    sb.writeln('Faces    : $faceCount');
    sb.writeln(
        'Dimensions (W × H × D): '
        '${dimX.toStringAsFixed(3)} × '
        '${dimY.toStringAsFixed(3)} × '
        '${dimZ.toStringAsFixed(3)} m');
    sb.writeln('File size: $fileSizeString');
    return sb.toString().trimRight();
  }

  /// Computes the width × height × depth of the mesh bounding box in mesh
  /// units.  Returns (0, 0, 0) for an empty mesh.
  (double, double, double) _computeDimensions(Mesh3D mesh) {
    if (mesh.vertices.isEmpty) return (0.0, 0.0, 0.0);

    double minX = double.infinity,
        minY = double.infinity,
        minZ = double.infinity;
    double maxX = double.negativeInfinity,
        maxY = double.negativeInfinity,
        maxZ = double.negativeInfinity;

    for (final v in mesh.vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.z < minZ) minZ = v.z;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if (v.z > maxZ) maxZ = v.z;
    }

    return (maxX - minX, maxY - minY, maxZ - minZ);
  }
}
