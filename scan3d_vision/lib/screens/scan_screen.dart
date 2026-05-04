import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:provider/provider.dart';
import 'package:ar_flutter_plugin_2/ar_flutter_plugin.dart';
import 'package:ar_flutter_plugin_2/datatypes/config_planedetection.dart';
import 'package:ar_flutter_plugin_2/managers/ar_session_manager.dart'
    as ar_plugin;
import 'package:ar_flutter_plugin_2/managers/ar_object_manager.dart';
import 'package:ar_flutter_plugin_2/managers/ar_anchor_manager.dart';
import 'package:ar_flutter_plugin_2/managers/ar_location_manager.dart';
import 'package:vector_math/vector_math_64.dart' hide Colors;
import '../providers/detection_provider.dart';
import '../providers/scan_state_provider.dart';
import '../providers/mesh_provider.dart';
import '../services/camera_service.dart';
import '../services/yolo_detector.dart';
import '../services/image_converter.dart';
import '../services/depth_estimator.dart';
import '../services/mesh_generator.dart';
import '../services/ar_session_manager.dart' as app_ar;
import '../models/detection_result.dart';
import '../widgets/detection_overlay.dart';
import '../widgets/scan_button.dart';
import '../widgets/glassmorphic_container.dart';
import '../widgets/stat_card.dart';

/// The primary scanning screen. Composes the camera preview, AR overlay,
/// YOLO detection bounding boxes, scanning controls, and status HUD.
class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  // ── Services ──────────────────────────────────────────────────────────────
  final CameraService _cameraService = CameraService();
  final YoloDetector _yoloDetector = YoloDetector();
  final DepthEstimator _depthEstimator = DepthEstimator();
  final MeshGenerator _meshGenerator = MeshGenerator();
  final app_ar.ARSessionManager _arManager = app_ar.ARSessionManager();

  // ── Local point collection ────────────────────────────────────────────────
  final List<Vector3> _collectedPoints = [];

  // ── State ─────────────────────────────────────────────────────────────────
  bool _isInitialized = false;
  bool _isGeneratingMesh = false;
  String? _initError;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _initializeAll();
  }

  Future<void> _initializeAll() async {
    try {
      await _cameraService.initialize();
      await _yoloDetector.initialize();
      _cameraService.startFrameStream((CameraImage image) {
        if (!mounted) return;
        final converted = ImageConverter.convertCameraImage(image);
        final detections = _yoloDetector.detectFromImage(converted);
        if (!mounted) return;
        context.read<DetectionProvider>().updateDetections(detections);
      });
      if (mounted) setState(() => _isInitialized = true);
    } catch (e) {
      if (mounted) setState(() => _initError = e.toString());
    }
  }

  @override
  void dispose() {
    _cameraService.dispose();
    _yoloDetector.dispose();
    _arManager.dispose();
    super.dispose();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AR callbacks
  // ─────────────────────────────────────────────────────────────────────────

  void _onARViewCreated(
    ar_plugin.ARSessionManager sessionManager,
    ARObjectManager objectManager,
    ARAnchorManager anchorManager,
    ARLocationManager locationManager,
  ) {
    _arManager.onARViewCreated(
      sessionManager, objectManager, anchorManager, locationManager,
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scan control
  // ─────────────────────────────────────────────────────────────────────────

  void _toggleScan() {
    final scanState = context.read<ScanStateProvider>();
    if (scanState.isScanning) {
      scanState.stopScan();
      _arManager.stopPointCollection();
    } else {
      _collectedPoints.clear();
      scanState.startScan();
      _arManager.startPointCollection();
      _collectPointsLoop(scanState);
    }
  }

  Future<void> _collectPointsLoop(ScanStateProvider scanState) async {
    while (scanState.isScanning && mounted) {
      // Gather AR points
      final arPoints = _arManager.collectedPoints;
      if (arPoints.isNotEmpty) {
        // Only add new points
        final newCount = arPoints.length - _collectedPoints.length;
        if (newCount > 0) {
          _collectedPoints.addAll(
            arPoints.sublist(_collectedPoints.length),
          );
          scanState.updatePointCount(_collectedPoints.length);
        }
      }
      await Future.delayed(const Duration(milliseconds: 100));
    }
  }

  Future<void> _generateMesh() async {
    final scanState = context.read<ScanStateProvider>();
    final detectionProvider = context.read<DetectionProvider>();
    setState(() => _isGeneratingMesh = true);
    scanState.startProcessing();

    try {
      // Get the primary detection bounding box
      final primaryDetection = detectionProvider.primaryDetection;
      final boundingBox = primaryDetection?.boundingBox ??
          const Rect.fromLTWH(0.1, 0.1, 0.8, 0.8);

      // Estimate object size from AR data
      final objectSize = _arManager.estimateObjectSize(boundingBox);
      final objectCenter = Vector3.zero();

      // Build depth map from collected points
      final depthMap = _depthEstimator.estimateDepth(
        arPoints: _collectedPoints,
        boundingBox: boundingBox,
        imageSize: const Size(1920, 1080),
        viewProjection: _arManager.currentViewMatrix,
      );

      // Generate mesh
      final mesh = _meshGenerator.generateMesh(
        depthMap: depthMap,
        objectCenter: objectCenter,
        objectSize: objectSize,
        resolution: 128,
      );

      if (!mounted) return;
      context.read<MeshProvider>().setMesh(mesh);
      scanState.stopProcessing(success: true);
      Navigator.pushNamed(context, '/preview');
    } catch (e) {
      if (mounted) {
        scanState.stopProcessing(success: false, errorMessage: e.toString());
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Mesh generation failed: $e'),
            backgroundColor: Colors.red.shade800,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isGeneratingMesh = false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Build
  // ─────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_initError != null) return _buildErrorState(_initError!);
    if (!_isInitialized) return _buildLoadingState();
    return _buildScannerUI();
  }

  Widget _buildLoadingState() {
    return const Scaffold(
      backgroundColor: Color(0xFF121212),
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation<Color>(Color(0xFF7C4DFF)),
            ),
            SizedBox(height: 16),
            Text(
              'Initializing camera & AI...',
              style: TextStyle(color: Colors.white54, fontSize: 14),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildErrorState(String error) {
    return Scaffold(
      backgroundColor: const Color(0xFF121212),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, color: Colors.redAccent, size: 48),
              const SizedBox(height: 16),
              Text(
                error,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 14),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _primaryColor,
                ),
                child: const Text('Go Back'),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildScannerUI() {
    final screenSize = MediaQuery.of(context).size;
    final controller = _cameraService.controller;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // ── 1. Camera preview ──────────────────────────────────────────
          if (controller != null && controller.value.isInitialized)
            CameraPreview(controller),

          // ── 2. AR view overlay ─────────────────────────────────────────
          Opacity(
            opacity: 0.6,
            child: ARView(
              onARViewCreated: _onARViewCreated,
              planeDetectionConfig: PlaneDetectionConfig.horizontal,
            ),
          ),

          // ── 3. Detection bounding boxes ────────────────────────────────
          DetectionOverlay(
            previewSize: Size(
              controller?.value.previewSize?.height ?? screenSize.width,
              controller?.value.previewSize?.width ?? screenSize.height,
            ),
          ),

          // ── 4. Top HUD ─────────────────────────────────────────────────
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: _TopHud(),
          ),

          // ── 5. Bottom controls ─────────────────────────────────────────
          Positioned(
            bottom: 0,
            left: 0,
            right: 0,
            child: _BottomControls(
              isGeneratingMesh: _isGeneratingMesh,
              collectedPointCount: _collectedPoints.length,
              onToggleScan: _toggleScan,
              onGenerateMesh: _generateMesh,
            ),
          ),

          // ── 6. Global processing overlay ───────────────────────────────
          if (_isGeneratingMesh)
            Container(
              color: Colors.black54,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                      valueColor:
                          AlwaysStoppedAnimation<Color>(_accentColor),
                      strokeWidth: 3,
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Generating 3D mesh...',
                      style: TextStyle(
                        color: Colors.white,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _TopHud extends StatelessWidget {
  const _TopHud();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 0),
        child: Row(
          children: [
            // Back button
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
            const SizedBox(width: 10),
            // Stats row
            Consumer<DetectionProvider>(
              builder: (context, dp, _) {
                return Consumer<ScanStateProvider>(
                  builder: (context, sp, _) {
                    return Expanded(
                      child: SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: [
                            StatCard(
                              icon: Icons.speed,
                              label: 'FPS',
                              value: '${dp.fps}',
                            ),
                            const SizedBox(width: 8),
                            StatCard(
                              icon: Icons.center_focus_strong,
                              label: 'DETECTIONS',
                              value: '${dp.detections.length}',
                            ),
                            const SizedBox(width: 8),
                            StatCard(
                              icon: Icons.grain,
                              label: 'POINTS',
                              value: sp.collectedPointCount > 999
                                  ? '${(sp.collectedPointCount / 1000).toStringAsFixed(1)}k'
                                  : '${sp.collectedPointCount}',
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}

class _BottomControls extends StatelessWidget {
  final bool isGeneratingMesh;
  final int collectedPointCount;
  final VoidCallback onToggleScan;
  final VoidCallback onGenerateMesh;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);

  const _BottomControls({
    required this.isGeneratingMesh,
    required this.collectedPointCount,
    required this.onToggleScan,
    required this.onGenerateMesh,
  });

  @override
  Widget build(BuildContext context) {
    return Consumer<ScanStateProvider>(
      builder: (context, scanState, _) {
        final bool hasSufficientPoints = collectedPointCount >= 50;
        final bool canGenerate =
            !scanState.isScanning && hasSufficientPoints && !isGeneratingMesh;

        ScanButtonState buttonState;
        if (isGeneratingMesh) {
          buttonState = ScanButtonState.processing;
        } else if (scanState.isScanning) {
          buttonState = ScanButtonState.scanning;
        } else {
          buttonState = ScanButtonState.idle;
        }

        return SafeArea(
          child: GlassmorphicContainer(
            borderRadius: 0,
            opacity: 0.1,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Point collection progress bar
                  if (scanState.isScanning || hasSufficientPoints)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              const Text(
                                'Point cloud',
                                style: TextStyle(
                                    color: Colors.white60, fontSize: 11),
                              ),
                              Text(
                                '$collectedPointCount / 50 pts',
                                style: const TextStyle(
                                    color: Colors.white60, fontSize: 11),
                              ),
                            ],
                          ),
                          const SizedBox(height: 4),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: (collectedPointCount / 50)
                                  .clamp(0.0, 1.0),
                              backgroundColor: Colors.white12,
                              valueColor: const AlwaysStoppedAnimation<Color>(
                                  _accentColor),
                              minHeight: 4,
                            ),
                          ),
                        ],
                      ),
                    ),

                  // Buttons row
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      // Scan toggle
                      ScanButton(
                        state: buttonState,
                        onTap: isGeneratingMesh ? null : onToggleScan,
                      ),

                      // Generate 3D — appears when conditions are met
                      if (canGenerate) ...[
                        const SizedBox(width: 24),
                        _Generate3DButton(onTap: onGenerateMesh),
                      ],
                    ],
                  ),

                  const SizedBox(height: 8),

                  // Hint text
                  Text(
                    scanState.isScanning
                        ? 'Move slowly around the object'
                        : canGenerate
                            ? 'Ready — tap Generate 3D'
                            : 'Tap the button to start scanning',
                    style: const TextStyle(
                      color: Colors.white38,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}

class _Generate3DButton extends StatelessWidget {
  final VoidCallback onTap;

  static const Color _accentColor = Color(0xFF00E5FF);

  const _Generate3DButton({required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(14),
          gradient: const LinearGradient(
            colors: [Color(0xFF00B8CC), _accentColor],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          boxShadow: [
            BoxShadow(
              color: _accentColor.withOpacity(0.4),
              blurRadius: 14,
              spreadRadius: 1,
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.view_in_ar, color: Colors.black, size: 20),
            SizedBox(width: 8),
            Text(
              'Generate 3D',
              style: TextStyle(
                color: Colors.black,
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
