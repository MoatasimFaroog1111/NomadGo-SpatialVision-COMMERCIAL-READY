import 'package:camera/camera.dart';

/// Manages the device camera and provides a throttled frame stream suitable
/// for real-time object detection at up to 10 FPS.
class CameraService {
  CameraController? _controller;
  bool _isInitialized = false;
  bool _isStreaming = false;

  // Used by the FPS throttle – initialised to the epoch so the first frame
  // is always processed immediately.
  DateTime _lastFrameTime = DateTime.fromMillisecondsSinceEpoch(0);

  // Target inter-frame interval for 10 FPS.
  static const Duration _frameInterval = Duration(milliseconds: 100);

  // -------------------------------------------------------------------------
  // Getters
  // -------------------------------------------------------------------------

  /// The underlying [CameraController] (may be null before [initialize]).
  CameraController? get controller => _controller;

  /// Whether the camera has been successfully initialised.
  bool get isInitialized => _isInitialized;

  /// Whether a frame stream is currently active.
  bool get isStreaming => _isStreaming;

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /// Discovers the first available back-facing camera and initialises the
  /// [CameraController] at [ResolutionPreset.high].
  ///
  /// Throws a [StateError] if no back camera is found on the device.
  Future<void> initialize() async {
    if (_isInitialized) return;

    final cameras = await availableCameras();

    CameraDescription? backCamera;
    for (final camera in cameras) {
      if (camera.lensDirection == CameraLensDirection.back) {
        backCamera = camera;
        break;
      }
    }

    if (backCamera == null) {
      throw StateError('No back-facing camera found on this device.');
    }

    _controller = CameraController(
      backCamera,
      ResolutionPreset.high,
      enableAudio: false,
      imageFormatGroup: ImageFormatGroup.yuv420,
    );

    await _controller!.initialize();
    _isInitialized = true;
  }

  /// Starts the camera image stream and delivers frames to [onFrame] at a
  /// rate capped at 10 FPS.
  ///
  /// [onFrame] receives a raw [CameraImage] which can be passed to
  /// [ImageConverter] for further processing.
  void startFrameStream(void Function(CameraImage) onFrame) {
    if (!_isInitialized || _controller == null) {
      throw StateError(
          'CameraService is not initialized. Call initialize() first.');
    }
    if (_isStreaming) return;

    _isStreaming = true;
    _lastFrameTime = DateTime.fromMillisecondsSinceEpoch(0);

    _controller!.startImageStream((CameraImage image) {
      if (!_isStreaming) return;

      final now = DateTime.now();
      if (now.difference(_lastFrameTime) < _frameInterval) return;

      _lastFrameTime = now;
      onFrame(image);
    });
  }

  /// Stops the active image stream without disposing the controller.
  void stopFrameStream() {
    if (!_isStreaming || _controller == null) return;

    _isStreaming = false;
    // stopImageStream is synchronous in the camera plugin.
    _controller!.stopImageStream();
  }

  /// Stops the stream (if active) and fully disposes the [CameraController].
  Future<void> dispose() async {
    if (_isStreaming) {
      stopFrameStream();
    }
    await _controller?.dispose();
    _controller = null;
    _isInitialized = false;
  }
}
