import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';
import 'package:vector_math/vector_math_64.dart';
import '../models/mesh_3d.dart';

/// Exports a [Mesh3D] object to the GLTF 2.0 Binary (.glb) format.
///
/// GLB file layout
/// ---------------
/// [12-byte header]
///   magic   : 0x46546C67  ("glTF" in little-endian)
///   version : 2
///   length  : total byte length of the file
///
/// [JSON chunk]
///   chunkLength : uint32 (padded to 4-byte boundary with 0x20 / space)
///   chunkType   : 0x4E4F534A  ("JSON")
///   chunkData   : UTF-8 JSON
///
/// [BIN chunk]
///   chunkLength : uint32 (padded to 4-byte boundary with 0x00)
///   chunkType   : 0x004E4942  ("BIN\0")
///   chunkData   : binary buffer (vertex data then index data)
class GltfExporter {
  // ── GLB magic numbers ──────────────────────────────────────────────────────
  static const int _glbMagic = 0x46546C67; // "glTF"
  static const int _glbVersion = 2;
  static const int _chunkTypeJson = 0x4E4F534A; // "JSON"
  static const int _chunkTypeBin = 0x004E4942; // "BIN\0"

  // ── GLTF component-type constants ──────────────────────────────────────────
  static const int _componentTypeFloat = 5126; // GL_FLOAT
  static const int _componentTypeUint16 = 5123; // GL_UNSIGNED_SHORT
  static const int _componentTypeUint32 = 5125; // GL_UNSIGNED_INT

  // ── Byte sizes ─────────────────────────────────────────────────────────────
  static const int _glbHeaderSize = 12; // magic + version + length
  static const int _chunkHeaderSize = 8; // chunkLength + chunkType
  static const int _bytesPerFloat = 4;
  static const int _floatsPerVertex = 8; // 3 pos + 3 normal + 2 uv
  static const int _bytesPerVertex = _floatsPerVertex * _bytesPerFloat; // 32

  // ──────────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────────

  /// Exports [mesh] to a .glb file named [filename] (without extension) inside
  /// the app's documents directory.  Returns the absolute path of the written
  /// file.
  Future<String> exportToGlb(Mesh3D mesh, String filename) async {
    final directory = await getExportDirectory();
    final safeFilename =
        filename.endsWith('.glb') ? filename : '$filename.glb';
    final filePath = '$directory/$safeFilename';

    final glbBytes = buildGlbBinary(mesh);
    await File(filePath).writeAsBytes(glbBytes, flush: true);

    return filePath;
  }

  /// Assembles the complete GLB binary for [mesh].
  Uint8List buildGlbBinary(Mesh3D mesh) {
    // 1. Build the binary buffer (vertices + indices).
    final bufferData = _buildBufferData(mesh);

    // 2. Compute layout metrics needed for JSON and buffer views.
    final vertexCount = mesh.vertices.length;
    final indexCount = mesh.indices.length;
    final useUint32 = vertexCount > 65535;

    final vertexBufferLength = vertexCount * _bytesPerVertex;
    final indexElementSize = useUint32 ? 4 : 2;
    final indexBufferLength = indexCount * indexElementSize;

    // 3. Compute bounding box for the position accessor.
    final (posMin, posMax) = _computeBounds(mesh);

    // 4. Build the JSON chunk content.
    final gltfJson = _buildGltfJson(
      bufferLength: bufferData.length,
      vertexCount: vertexCount,
      indexCount: indexCount,
      posMin: posMin,
      posMax: posMax,
      vertexBufferLength: vertexBufferLength,
      indexBufferLength: indexBufferLength,
    );

    final jsonString = jsonEncode(gltfJson);
    final jsonBytes = utf8.encode(jsonString);

    // 5. Pad JSON to 4-byte boundary using spaces (0x20).
    final jsonPaddedLength = _alignTo4(jsonBytes.length);
    final jsonPadding = jsonPaddedLength - jsonBytes.length;

    // 6. Pad BIN to 4-byte boundary using zero bytes.
    final binPaddedLength = _alignTo4(bufferData.length);
    final binPadding = binPaddedLength - bufferData.length;

    // 7. Total file size.
    final totalLength = _glbHeaderSize +
        _chunkHeaderSize +
        jsonPaddedLength +
        _chunkHeaderSize +
        binPaddedLength;

    // 8. Assemble everything into a single ByteData.
    final result = ByteData(totalLength);
    int offset = 0;

    // --- GLB header ---
    result.setUint32(offset, _glbMagic, Endian.little);
    offset += 4;
    result.setUint32(offset, _glbVersion, Endian.little);
    offset += 4;
    result.setUint32(offset, totalLength, Endian.little);
    offset += 4;

    // --- JSON chunk header ---
    result.setUint32(offset, jsonPaddedLength, Endian.little);
    offset += 4;
    result.setUint32(offset, _chunkTypeJson, Endian.little);
    offset += 4;

    // --- JSON chunk data ---
    for (int i = 0; i < jsonBytes.length; i++) {
      result.setUint8(offset + i, jsonBytes[i]);
    }
    offset += jsonBytes.length;

    // --- JSON padding (spaces) ---
    for (int i = 0; i < jsonPadding; i++) {
      result.setUint8(offset + i, 0x20);
    }
    offset += jsonPadding;

    // --- BIN chunk header ---
    result.setUint32(offset, binPaddedLength, Endian.little);
    offset += 4;
    result.setUint32(offset, _chunkTypeBin, Endian.little);
    offset += 4;

    // --- BIN chunk data ---
    for (int i = 0; i < bufferData.length; i++) {
      result.setUint8(offset + i, bufferData[i]);
    }
    offset += bufferData.length;

    // --- BIN padding (zeros) ---
    for (int i = 0; i < binPadding; i++) {
      result.setUint8(offset + i, 0x00);
    }

    return result.buffer.asUint8List();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // GLTF JSON construction
  // ──────────────────────────────────────────────────────────────────────────

  /// Builds the complete GLTF 2.0 JSON descriptor.
  ///
  /// Buffer-view layout (all within a single GLB BIN chunk):
  ///   View 0 – positions  : byteOffset=0,               byteLength = vertexCount * 12
  ///   View 1 – normals    : byteOffset after positions, byteLength = vertexCount * 12
  ///   View 2 – texcoords  : byteOffset after normals,  byteLength = vertexCount * 8
  ///   View 3 – indices    : byteOffset after texcoords,byteLength = indexCount * (2|4)
  ///
  /// Each attribute is stored as a tightly-packed array (no interleaving) so
  /// that byteStride is omitted (implying tightly-packed per spec §3.6.2.4).
  Map<String, dynamic> _buildGltfJson({
    required int bufferLength,
    required int vertexCount,
    required int indexCount,
    required Vector3 posMin,
    required Vector3 posMax,
    required int vertexBufferLength,
    required int indexBufferLength,
  }) {
    final useUint32 = vertexCount > 65535;
    final indexComponentType =
        useUint32 ? _componentTypeUint32 : _componentTypeUint16;
    final indexElementSize = useUint32 ? 4 : 2;

    // Byte offsets for each attribute array inside the BIN chunk.
    final positionByteLength = vertexCount * 3 * _bytesPerFloat; // vec3
    final normalByteLength = vertexCount * 3 * _bytesPerFloat; // vec3
    final texcoordByteLength = vertexCount * 2 * _bytesPerFloat; // vec2
    final indexByteLength = indexCount * indexElementSize;

    final normalByteOffset = positionByteLength;
    final texcoordByteOffset = normalByteOffset + normalByteLength;
    final indexByteOffset = texcoordByteOffset + texcoordByteLength;

    return {
      'asset': {
        'version': '2.0',
        'generator': 'Scan3D Vision',
      },
      'scene': 0,
      'scenes': [
        {
          'nodes': [0],
        }
      ],
      'nodes': [
        {
          'mesh': 0,
          'name': 'ScannedObject',
        }
      ],
      'meshes': [
        {
          'primitives': [
            {
              'attributes': {
                'POSITION': 0,
                'NORMAL': 1,
                'TEXCOORD_0': 2,
              },
              'indices': 3,
            }
          ],
        }
      ],
      // ── Accessors ──────────────────────────────────────────────────────────
      'accessors': [
        // 0 – POSITION (vec3 float)
        {
          'bufferView': 0,
          'byteOffset': 0,
          'componentType': _componentTypeFloat,
          'count': vertexCount,
          'type': 'VEC3',
          'min': [posMin.x, posMin.y, posMin.z],
          'max': [posMax.x, posMax.y, posMax.z],
        },
        // 1 – NORMAL (vec3 float)
        {
          'bufferView': 1,
          'byteOffset': 0,
          'componentType': _componentTypeFloat,
          'count': vertexCount,
          'type': 'VEC3',
        },
        // 2 – TEXCOORD_0 (vec2 float)
        {
          'bufferView': 2,
          'byteOffset': 0,
          'componentType': _componentTypeFloat,
          'count': vertexCount,
          'type': 'VEC2',
        },
        // 3 – indices (scalar uint16/uint32)
        {
          'bufferView': 3,
          'byteOffset': 0,
          'componentType': indexComponentType,
          'count': indexCount,
          'type': 'SCALAR',
        },
      ],
      // ── Buffer views ───────────────────────────────────────────────────────
      'bufferViews': [
        // 0 – positions
        {
          'buffer': 0,
          'byteOffset': 0,
          'byteLength': positionByteLength,
          'target': 34962, // ARRAY_BUFFER
        },
        // 1 – normals
        {
          'buffer': 0,
          'byteOffset': normalByteOffset,
          'byteLength': normalByteLength,
          'target': 34962, // ARRAY_BUFFER
        },
        // 2 – texcoords
        {
          'buffer': 0,
          'byteOffset': texcoordByteOffset,
          'byteLength': texcoordByteLength,
          'target': 34962, // ARRAY_BUFFER
        },
        // 3 – indices
        {
          'buffer': 0,
          'byteOffset': indexByteOffset,
          'byteLength': indexByteLength,
          'target': 34963, // ELEMENT_ARRAY_BUFFER
        },
      ],
      // ── Buffers ────────────────────────────────────────────────────────────
      'buffers': [
        {
          'byteLength': bufferLength,
        }
      ],
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Binary buffer construction
  // ──────────────────────────────────────────────────────────────────────────

  /// Builds the binary buffer that becomes the GLB BIN chunk.
  ///
  /// Layout (non-interleaved, tightly-packed per attribute):
  ///   [positions: N × 3 × float32]
  ///   [normals:   N × 3 × float32]
  ///   [texcoords: N × 2 × float32]
  ///   [indices:   I × (uint16 | uint32)]
  ///
  /// The result length is padded to a 4-byte boundary by [buildGlbBinary].
  Uint8List _buildBufferData(Mesh3D mesh) {
    final vertexCount = mesh.vertices.length;
    final indexCount = mesh.indices.length;
    final useUint32 = vertexCount > 65535;
    final indexElementSize = useUint32 ? 4 : 2;

    final positionBytes = vertexCount * 3 * _bytesPerFloat;
    final normalBytes = vertexCount * 3 * _bytesPerFloat;
    final texcoordBytes = vertexCount * 2 * _bytesPerFloat;
    final indexBytes = indexCount * indexElementSize;

    final totalBytes = positionBytes + normalBytes + texcoordBytes + indexBytes;
    final bd = ByteData(totalBytes);

    // ── Positions ────────────────────────────────────────────────────────────
    int offset = 0;
    for (final v in mesh.vertices) {
      bd.setFloat32(offset, v.x, Endian.little);
      offset += 4;
      bd.setFloat32(offset, v.y, Endian.little);
      offset += 4;
      bd.setFloat32(offset, v.z, Endian.little);
      offset += 4;
    }

    // ── Normals ──────────────────────────────────────────────────────────────
    for (final n in mesh.normals) {
      bd.setFloat32(offset, n.x, Endian.little);
      offset += 4;
      bd.setFloat32(offset, n.y, Endian.little);
      offset += 4;
      bd.setFloat32(offset, n.z, Endian.little);
      offset += 4;
    }

    // ── Texture coordinates ───────────────────────────────────────────────────
    for (final uv in mesh.uvCoordinates) {
      bd.setFloat32(offset, uv.x, Endian.little);
      offset += 4;
      bd.setFloat32(offset, uv.y, Endian.little);
      offset += 4;
    }

    // ── Indices ───────────────────────────────────────────────────────────────
    if (useUint32) {
      for (final idx in mesh.indices) {
        bd.setUint32(offset, idx, Endian.little);
        offset += 4;
      }
    } else {
      for (final idx in mesh.indices) {
        bd.setUint16(offset, idx, Endian.little);
        offset += 2;
      }
    }

    return bd.buffer.asUint8List();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // File-system helpers
  // ──────────────────────────────────────────────────────────────────────────

  /// Returns (and creates if necessary) the directory used to store exported
  /// .glb files.
  Future<String> getExportDirectory() async {
    final appDocDir = await getApplicationDocumentsDirectory();
    final exportDir = Directory('${appDocDir.path}/scan3d_exports');
    if (!await exportDir.exists()) {
      await exportDir.create(recursive: true);
    }
    return exportDir.path;
  }

  /// Returns a list of absolute paths for every .glb file in the export
  /// directory, sorted by modification time (newest first).
  Future<List<String>> listExportedModels() async {
    final exportDirPath = await getExportDirectory();
    final exportDir = Directory(exportDirPath);
    if (!await exportDir.exists()) return [];

    final entities = await exportDir
        .list()
        .where((e) => e is File && e.path.toLowerCase().endsWith('.glb'))
        .cast<File>()
        .toList();

    // Sort newest first.
    entities.sort((a, b) {
      final aStat = a.statSync();
      final bStat = b.statSync();
      return bStat.modified.compareTo(aStat.modified);
    });

    return entities.map((f) => f.path).toList();
  }

  /// Deletes the exported .glb file at [path].
  /// Silently succeeds if the file does not exist.
  Future<void> deleteExport(String path) async {
    final file = File(path);
    if (await file.exists()) {
      await file.delete();
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ──────────────────────────────────────────────────────────────────────────

  /// Rounds [value] up to the nearest multiple of 4.
  int _alignTo4(int value) => (value + 3) & ~3;

  /// Computes the axis-aligned bounding box of all vertex positions.
  /// Returns (min, max) as a record.
  (Vector3, Vector3) _computeBounds(Mesh3D mesh) {
    if (mesh.vertices.isEmpty) {
      return (Vector3.zero(), Vector3.zero());
    }

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

    return (
      Vector3(minX, minY, minZ),
      Vector3(maxX, maxY, maxZ),
    );
  }
}
