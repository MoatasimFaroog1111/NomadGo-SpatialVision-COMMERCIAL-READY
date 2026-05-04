import 'package:flutter/foundation.dart';

/// [ChangeNotifier] that manages the overall scan workflow state,
/// including timing, point-count tracking, and status messaging.
///
/// This provider sits above [MeshProvider] and drives the higher-level UX
/// flow: button states, progress indicators, and elapsed-time display.
///
/// Typical usage:
/// ```dart
/// final scanState = context.watch<ScanStateProvider>();
///
/// ElevatedButton(
///   onPressed: scanState.isScanning ? scanState.stopScan : scanState.startScan,
///   child: Text(scanState.isScanning ? 'Stop' : 'Start Scan'),
/// );
///
/// Text('Points: ${scanState.collectedPointCount}'),
/// Text('Duration: ${scanState.scanDuration.inSeconds}s'),
/// ```
class ScanStateProvider extends ChangeNotifier {
  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  bool _isScanning = false;
  bool _isProcessing = false;
  String _statusMessage = 'Ready to scan';
  int _collectedPointCount = 0;

  /// Internal stopwatch used to track elapsed scan time.
  final Stopwatch _stopwatch = Stopwatch();

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /// True while the AR session is actively collecting feature points.
  bool get isScanning => _isScanning;

  /// True while the depth-map / mesh pipeline is running.
  bool get isProcessing => _isProcessing;

  /// Human-readable description of the current step, suitable for display in
  /// status bars or overlays.
  String get statusMessage => _statusMessage;

  /// Total number of AR feature points collected since the last [reset].
  int get collectedPointCount => _collectedPointCount;

  /// Elapsed time since [startScan] was called.
  /// Stops updating once [stopScan] is called.
  Duration get scanDuration => _stopwatch.elapsed;

  /// Convenience: true when either scanning or processing.
  bool get isBusy => _isScanning || _isProcessing;

  // ---------------------------------------------------------------------------
  // Scan lifecycle
  // ---------------------------------------------------------------------------

  /// Transitions to the scanning state.
  ///
  /// - Resets the stopwatch and restarts it.
  /// - Clears [collectedPointCount].
  /// - Sets [statusMessage] to a default prompt.
  /// - Notifies listeners.
  ///
  /// Does nothing if already scanning.
  void startScan() {
    if (_isScanning) return;
    _isScanning = true;
    _isProcessing = false;
    _collectedPointCount = 0;
    _statusMessage = 'Scanning — move the camera around the object';
    _stopwatch
      ..reset()
      ..start();
    notifyListeners();
  }

  /// Ends the active scan and transitions to idle (or processing if the caller
  /// starts the mesh pipeline immediately after).
  ///
  /// - Stops the stopwatch (elapsed time is preserved).
  /// - Sets [statusMessage] to a completion prompt.
  /// - Notifies listeners.
  ///
  /// Does nothing if not currently scanning.
  void stopScan() {
    if (!_isScanning) return;
    _isScanning = false;
    _stopwatch.stop();
    _statusMessage = 'Scan complete — ${_collectedPointCount} points collected';
    notifyListeners();
  }

  /// Enters the processing state (depth estimation + mesh generation).
  ///
  /// Should be called immediately after [stopScan].
  void startProcessing() {
    if (_isProcessing) return;
    _isProcessing = true;
    _statusMessage = 'Processing — generating 3D mesh…';
    notifyListeners();
  }

  /// Ends the processing state.
  ///
  /// [success] — if `true`, transitions to an idle-ready state with a success
  /// message; if `false`, indicates an error and passes [errorMessage] through.
  void stopProcessing({bool success = true, String? errorMessage}) {
    _isProcessing = false;
    _statusMessage = success
        ? 'Mesh ready — tap to export'
        : 'Error: ${errorMessage ?? 'unknown error'}';
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Progress updates
  // ---------------------------------------------------------------------------

  /// Updates the count of collected AR feature points.
  ///
  /// Skips the notification if the count hasn't changed, to avoid
  /// unnecessary rebuilds from high-frequency AR callbacks.
  void updatePointCount(int count) {
    if (count == _collectedPointCount) return;
    _collectedPointCount = count;
    if (_isScanning) {
      _statusMessage = 'Scanning — $_collectedPointCount points';
    }
    notifyListeners();
  }

  /// Sets a custom status message visible in the UI.
  ///
  /// Use this for step-level feedback, e.g. "Estimating depth…" or
  /// "Building triangles…".
  void setStatus(String message) {
    if (message == _statusMessage) return;
    _statusMessage = message;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  /// Resets all state back to the initial idle condition.
  ///
  /// Stops the stopwatch and clears all counters / messages.
  void reset() {
    _isScanning = false;
    _isProcessing = false;
    _collectedPointCount = 0;
    _statusMessage = 'Ready to scan';
    _stopwatch
      ..stop()
      ..reset();
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  @override
  String toString() => 'ScanStateProvider('
      'scanning: $_isScanning, '
      'processing: $_isProcessing, '
      'points: $_collectedPointCount, '
      'elapsed: ${_stopwatch.elapsed.inSeconds}s, '
      '"$_statusMessage"'
      ')';
}
