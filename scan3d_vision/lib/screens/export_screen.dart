import 'package:flutter_3d_controller/flutter_3d_controller.dart';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../services/gltf_exporter.dart';
import '../services/model_sharing_service.dart';
import '../models/exported_model_info.dart';
import '../widgets/glassmorphic_container.dart';

/// Shows a list of all previously exported .glb files stored on device,
/// with per-item actions for sharing, deleting, and previewing.
class ExportScreen extends StatefulWidget {
  const ExportScreen({super.key});

  @override
  State<ExportScreen> createState() => _ExportScreenState();
}

class _ExportScreenState extends State<ExportScreen> {
  final GltfExporter _exporter = GltfExporter();
  final ModelSharingService _sharingService = ModelSharingService();

  List<ExportedModelInfo> _models = [];
  bool _isLoading = true;
  String? _loadError;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);

  @override
  void initState() {
    super.initState();
    _loadModels();
  }

  Future<void> _loadModels() async {
    setState(() {
      _isLoading = true;
      _loadError = null;
    });
    try {
      // listExportedModels() returns absolute file paths.
      final paths = await _exporter.listExportedModels();
      final List<ExportedModelInfo> models = await Future.wait(
        paths.map((p) => ExportedModelInfo.fromFile(File(p))),
      );
      // Sort newest first
      models.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      if (mounted) {
        setState(() {
          _models = models;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _loadError = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _deleteModel(ExportedModelInfo model) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => _DeleteConfirmDialog(filename: model.filename),
    );
    if (confirmed != true) return;

    try {
      await File(model.filePath).delete();
      if (mounted) {
        setState(() => _models.remove(model));
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Model deleted'),
            backgroundColor: Color(0xFF1E1E2E),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Delete failed: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    }
  }

  Future<void> _shareModel(ExportedModelInfo model) async {
    try {
      await _sharingService.shareModel(model.filePath);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Share failed: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      body: SafeArea(
        child: Column(
          children: [
            _buildAppBar(),
            Expanded(child: _buildBody()),
          ],
        ),
      ),
    );
  }

  Widget _buildAppBar() {
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
          const Expanded(
            child: Text(
              'Exports',
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          if (!_isLoading)
            GlassmorphicContainer(
              borderRadius: 12,
              opacity: 0.12,
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: _loadModels,
                  child: const Padding(
                    padding: EdgeInsets.all(10),
                    child: Icon(Icons.refresh, color: Colors.white60, size: 20),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(_primaryColor),
        ),
      );
    }

    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 12),
              Text(
                _loadError!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white54, fontSize: 14),
              ),
              const SizedBox(height: 20),
              ElevatedButton(
                onPressed: _loadModels,
                style: ElevatedButton.styleFrom(
                  backgroundColor: _primaryColor,
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      );
    }

    if (_models.isEmpty) {
      return _buildEmptyState();
    }

    return RefreshIndicator(
      onRefresh: _loadModels,
      color: _primaryColor,
      backgroundColor: const Color(0xFF1E1E2E),
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
        itemCount: _models.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          return _ModelCard(
            model: _models[index],
            onShare: () => _shareModel(_models[index]),
            onDelete: () => _deleteModel(_models[index]),
            onPreview: () => _openPreview(_models[index]),
          );
        },
      ),
    );
  }

  Widget _buildEmptyState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Illustration
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: const Color(0xFF1E1E2E),
                border: Border.all(color: Colors.white12),
              ),
              child: const Icon(
                Icons.folder_open_rounded,
                color: Colors.white24,
                size: 48,
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'No exports yet',
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Scan an object and export it as a .glb file\nto see it here.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.white38, fontSize: 13, height: 1.5),
            ),
            const SizedBox(height: 28),
            GlassmorphicContainer(
              borderRadius: 14,
              opacity: 0.15,
              gradient: LinearGradient(
                colors: [
                  _primaryColor.withOpacity(0.35),
                  _primaryColor.withOpacity(0.15),
                ],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              child: Material(
                color: Colors.transparent,
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => Navigator.pushNamed(context, '/scan'),
                  child: const Padding(
                    padding:
                        EdgeInsets.symmetric(horizontal: 28, vertical: 14),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.camera_alt, color: Colors.white, size: 20),
                        SizedBox(width: 10),
                        Text(
                          'Start Scanning',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                            fontSize: 15,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _openPreview(ExportedModelInfo model) {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => _GlbFilePreviewScreen(filePath: model.filePath),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Model card
// ─────────────────────────────────────────────────────────────────────────────

class _ModelCard extends StatelessWidget {
  final ExportedModelInfo model;
  final VoidCallback onShare;
  final VoidCallback onDelete;
  final VoidCallback onPreview;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);
  static final DateFormat _dateFmt = DateFormat('d MMM y, HH:mm');

  const _ModelCard({
    required this.model,
    required this.onShare,
    required this.onDelete,
    required this.onPreview,
  });

  String _formatBytes(int bytes) {
    if (bytes >= 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    if (bytes >= 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '$bytes B';
  }

  @override
  Widget build(BuildContext context) {
    return GlassmorphicContainer(
      borderRadius: 14,
      opacity: 0.1,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onPreview,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Thumbnail placeholder
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    color: const Color(0xFF1E1E2E),
                    border: Border.all(color: _primaryColor.withOpacity(0.4)),
                  ),
                  child: Icon(
                    Icons.view_in_ar,
                    color: _primaryColor.withOpacity(0.8),
                    size: 26,
                  ),
                ),
                const SizedBox(width: 14),

                // Metadata
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        model.filename,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Icon(Icons.calendar_today,
                              color: Colors.white38, size: 11),
                          const SizedBox(width: 4),
                          Text(
                            _dateFmt.format(model.createdAt),
                            style: const TextStyle(
                              color: Colors.white38,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 3),
                      Row(
                        children: [
                          Icon(Icons.storage, color: _accentColor.withOpacity(0.7), size: 11),
                          const SizedBox(width: 4),
                          Text(
                            _formatBytes(model.fileSizeBytes),
                            style: TextStyle(
                              color: _accentColor.withOpacity(0.9),
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                // Action icons
                _IconAction(
                  icon: Icons.visibility_outlined,
                  color: _accentColor,
                  onTap: onPreview,
                  tooltip: 'Preview',
                ),
                _IconAction(
                  icon: Icons.share_outlined,
                  color: Colors.white54,
                  onTap: onShare,
                  tooltip: 'Share',
                ),
                _IconAction(
                  icon: Icons.delete_outline,
                  color: Colors.redAccent,
                  onTap: onDelete,
                  tooltip: 'Delete',
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _IconAction extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final String tooltip;

  const _IconAction({
    required this.icon,
    required this.color,
    required this.onTap,
    required this.tooltip,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(8),
            child: Icon(icon, color: color, size: 20),
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delete confirm dialog
// ─────────────────────────────────────────────────────────────────────────────

class _DeleteConfirmDialog extends StatelessWidget {
  final String filename;

  const _DeleteConfirmDialog({required this.filename});

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      backgroundColor: const Color(0xFF1E1E2E),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      title: const Text(
        'Delete Model',
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
      ),
      content: Text(
        'Delete "$filename"? This cannot be undone.',
        style: const TextStyle(color: Colors.white70),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Cancel', style: TextStyle(color: Colors.white54)),
        ),
        TextButton(
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Delete',
              style: TextStyle(color: Colors.redAccent)),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inline GLB file preview screen (from exports list)
// ─────────────────────────────────────────────────────────────────────────────

class _GlbFilePreviewScreen extends StatelessWidget {
  final String filePath;

  static const Color _accentColor = Color(0xFF00E5FF);

  const _GlbFilePreviewScreen({required this.filePath});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      appBar: AppBar(
        backgroundColor: const Color(0xFF1E1E2E),
        iconTheme: const IconThemeData(color: Colors.white),
        title: Text(
          filePath.split(Platform.pathSeparator).last,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: Flutter3DViewer(
        src: filePath,
        controller: Flutter3DController(),
        progressBarColor: _accentColor,
      ),
    );
  }
}
