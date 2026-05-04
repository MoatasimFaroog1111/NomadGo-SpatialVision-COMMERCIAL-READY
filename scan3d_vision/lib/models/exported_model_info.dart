import 'dart:io';

/// Metadata about a previously exported .glb file stored on device.
class ExportedModelInfo {
  /// Absolute path to the .glb file.
  final String filePath;

  /// Filename with extension (no directory component).
  final String filename;

  /// File size in bytes.
  final int fileSizeBytes;

  /// Creation / modification timestamp of the file.
  final DateTime createdAt;

  const ExportedModelInfo({
    required this.filePath,
    required this.filename,
    required this.fileSizeBytes,
    required this.createdAt,
  });

  /// Constructs an [ExportedModelInfo] by reading stats from [file].
  static Future<ExportedModelInfo> fromFile(File file) async {
    final FileStat stat = await file.stat();
    return ExportedModelInfo(
      filePath: file.path,
      filename: file.path.split(Platform.pathSeparator).last,
      fileSizeBytes: stat.size,
      createdAt: stat.modified,
    );
  }
}
