import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_3d_controller/flutter_3d_controller.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../providers/mesh_provider.dart';
import '../services/gltf_exporter.dart';
import '../services/model_sharing_service.dart';
import '../models/mesh_3d.dart';
import '../widgets/glassmorphic_container.dart';

/// Displays the generated 3D mesh using [Flutter3DViewer], with metadata
/// and action buttons for exporting, sharing, or returning to scan.
class PreviewScreen extends StatefulWidget {
  const PreviewScreen({super.key});

  @override
  State<PreviewScreen> createState() => _PreviewScreenState();
}

class _PreviewScreenState extends State<PreviewScreen> {
  final Flutter3DController _controller = Flutter3DController();
  final GltfExporter _exporter = GltfExporter();
  final ModelSharingService _sharingService = ModelSharingService();

  String? _glbFilePath;
  int? _fileSizeBytes;
  bool _isExporting = false;
  bool _isSharing = false;
  bool _isLoadingModel = true;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);

  // Consistent filename based on timestamp so temp and permanent are the same.
  late final String _exportFilename;

  @override
  void initState() {
    super.initState();
    _exportFilename =
        'scan_${DateFormat('yyyyMMdd_HHmmss').format(DateTime.now())}.glb';
    _prepareModel();
  }

  Future<void> _prepareModel() async {
    final mesh = context.read<MeshProvider>().mesh;
    if (mesh == null) {
      setState(() => _isLoadingModel = false);
      return;
    }

    try {
      // Export to the app's export directory so Flutter3DViewer can load it
      // and it doubles as the permanent export file.
      final path = await _exporter.exportToGlb(mesh, _exportFilename);
      final size = await File(path).length();
      if (mounted) {
        setState(() {
          _glbFilePath = path;
          _fileSizeBytes = size;
          _isLoadingModel = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoadingModel = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load preview: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    }
  }

  Future<void> _exportGlb() async {
    if (_glbFilePath == null) return;

    // File was already written during _prepareModel; just confirm to the user.
    setState(() => _isExporting = true);
    await Future.delayed(const Duration(milliseconds: 300)); // brief visual feedback
    setState(() => _isExporting = false);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Row(
            children: [
              const Icon(Icons.check_circle, color: Colors.greenAccent, size: 18),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  'Saved: $_glbFilePath',
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ],
          ),
          backgroundColor: const Color(0xFF1E1E2E),
          duration: const Duration(seconds: 4),
        ),
      );
    }
  }

  Future<void> _share() async {
    if (_glbFilePath == null) return;
    setState(() => _isSharing = true);
    try {
      await _sharingService.shareModel(_glbFilePath!);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Share failed: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isSharing = false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Consumer<MeshProvider>(
      builder: (context, meshProvider, _) {
        final Mesh3D? mesh = meshProvider.mesh;

        return Scaffold(
          backgroundColor: const Color(0xFF121212),
          body: SafeArea(
            child: Column(
              children: [
                _buildAppBar(context),
                Expanded(child: _build3DViewer()),
                _buildBottomPanel(mesh),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _buildAppBar(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
      child: Row(
        children: [
          GlassmorphicContainer(
            borderRadius: 12,
            opacity: 0.12,
            child: Material(
              color: Colors.transparent,
              child: InkWell(
                borderRadius: BorderRadius.circular(12),
                onTap: () => Navigator.pop(context),
                child: const Padding(
                  padding: EdgeInsets.all(10),
                  child: Icon(Icons.arrow_back_ios_new,
                      color: Colors.white, size: 18),
                ),
              ),
            ),
          ),
          const SizedBox(width: 16),
          const Text(
            '3D Preview',
            style: TextStyle(
              color: Colors.white,
              fontSize: 20,
              fontWeight: FontWeight.bold,
            ),
          ),
          const Spacer(),
          const Icon(Icons.threesixty, color: Colors.white38, size: 20),
          const SizedBox(width: 4),
          const Text(
            'Drag to rotate',
            style: TextStyle(color: Colors.white38, fontSize: 12),
          ),
        ],
      ),
    );
  }

  Widget _build3DViewer() {
    if (_isLoadingModel) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(_accentColor),
            ),
            SizedBox(height: 12),
            Text(
              'Loading model…',
              style: TextStyle(color: Colors.white54, fontSize: 13),
            ),
          ],
        ),
      );
    }

    if (_glbFilePath == null) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, color: Colors.white30, size: 48),
            SizedBox(height: 12),
            Text(
              'No model available',
              style: TextStyle(color: Colors.white38, fontSize: 14),
            ),
          ],
        ),
      );
    }

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.white12),
        color: const Color(0xFF0D0D1A),
      ),
      clipBehavior: Clip.hardEdge,
      child: Flutter3DViewer(
        src: _glbFilePath!,
        controller: _controller,
        progressBarColor: _accentColor,
      ),
    );
  }

  Widget _buildBottomPanel(Mesh3D? mesh) {
    return GlassmorphicContainer(
      borderRadius: 0,
      opacity: 0.09,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (mesh != null) _buildMetricsRow(mesh),
          if (mesh != null) const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: _ActionButton(
                  icon: Icons.file_download_outlined,
                  label: 'Export GLB',
                  isLoading: _isExporting,
                  onTap: _exportGlb,
                  color: _primaryColor,
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ActionButton(
                  icon: Icons.share_outlined,
                  label: 'Share',
                  isLoading: _isSharing,
                  onTap: _share,
                  color: const Color(0xFF26A69A),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _ActionButton(
                  icon: Icons.camera_alt_outlined,
                  label: 'Scan Again',
                  onTap: () => Navigator.pushReplacementNamed(context, '/scan'),
                  color: Colors.white24,
                  labelColor: Colors.white70,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildMetricsRow(Mesh3D mesh) {
    // dimensions is in metres; convert to cm for display.
    final double wCm = mesh.dimensions.x * 100;
    final double hCm = mesh.dimensions.y * 100;
    final double dCm = mesh.dimensions.z * 100;
    final String fileSizeStr =
        _fileSizeBytes != null ? _formatBytes(_fileSizeBytes!) : '—';

    return GlassmorphicContainer(
      borderRadius: 12,
      opacity: 0.08,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'MODEL INFO',
            style: TextStyle(
              color: Colors.white38,
              fontSize: 10,
              letterSpacing: 1.2,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Dimensions',
                  value: '${wCm.toStringAsFixed(1)} × '
                      '${hCm.toStringAsFixed(1)} × '
                      '${dCm.toStringAsFixed(1)} cm',
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Row(
            children: [
              Expanded(
                child: _MetricTile(
                  label: 'Vertices',
                  value: _formatInt(mesh.vertexCount),
                ),
              ),
              Expanded(
                child: _MetricTile(
                  label: 'Triangles',
                  value: _formatInt(mesh.triangleCount),
                ),
              ),
              Expanded(
                child: _MetricTile(label: 'File size', value: fileSizeStr),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _formatInt(int n) {
    if (n >= 1000000) return '${(n / 1000000).toStringAsFixed(1)}M';
    if (n >= 1000) return '${(n / 1000).toStringAsFixed(1)}k';
    return '$n';
  }

  String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '$bytes B';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────────────────

class _MetricTile extends StatelessWidget {
  final String label;
  final String value;

  const _MetricTile({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: const TextStyle(color: Colors.white38, fontSize: 10)),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
              color: Colors.white, fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;
  final Color? labelColor;
  final bool isLoading;

  const _ActionButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
    this.labelColor,
    this.isLoading = false,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: isLoading ? null : onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              isLoading
                  ? SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        valueColor: AlwaysStoppedAnimation<Color>(
                            labelColor ?? Colors.white),
                      ),
                    )
                  : Icon(icon, color: labelColor ?? Colors.white, size: 22),
              const SizedBox(height: 4),
              Text(
                label,
                style: TextStyle(
                  color: labelColor ?? Colors.white,
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
