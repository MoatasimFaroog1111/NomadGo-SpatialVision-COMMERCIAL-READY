import 'package:flutter/foundation.dart';

import '../models/mesh_3d.dart';

// ---------------------------------------------------------------------------
// ScanState enum
// ---------------------------------------------------------------------------

/// Represents the high-level lifecycle state of a single scan operation.
enum ScanState {
  /// No scan in progress and no result available.
  idle,

  /// AR session is active and the user is capturing the scene.
  scanning,

  /// Point cloud has been captured; depth estimation and mesh generation are
  /// running in the background.
  processing,

  /// A valid [Mesh3D] is available and ready for export / preview.
  complete,

  /// An unrecoverable error occurred.  See [MeshProvider.errorMessage].
  error,
}

// ---------------------------------------------------------------------------
// MeshProvider
// ---------------------------------------------------------------------------

/// [ChangeNotifier] that owns the current scan result ([Mesh3D]) and exposes
/// the processing lifecycle to the UI layer.
///
/// Typical state flow:
/// ```
/// idle → scanning → processing → complete
///                              ↘ error
/// ```
class MeshProvider extends ChangeNotifier {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  Mesh3D? _mesh;
  ScanState _scanState = ScanState.idle;
  String? _errorMessage;
  double _scanProgress = 0.0;

  // ---------------------------------------------------------------------------
  // Getters
  // ---------------------------------------------------------------------------

  /// The most recently generated mesh, or `null` if none is available yet.
  Mesh3D? get mesh => _mesh;

  /// Current lifecycle state of the scan pipeline.
  ScanState get scanState => _scanState;

  /// Human-readable error description when [scanState] is [ScanState.error].
  String? get errorMessage => _errorMessage;

  /// Processing progress in the range [0.0, 1.0].
  /// Updated during [ScanState.processing] to reflect depth-map / mesh stages.
  double get scanProgress => _scanProgress;

  /// Convenience: true when a valid mesh is available for export.
  bool get hasMesh => _mesh != null;

  /// Convenience: true when the provider is actively working.
  bool get isBusy =>
      _scanState == ScanState.scanning || _scanState == ScanState.processing;

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  /// Stores [newMesh] and transitions to [ScanState.complete].
  ///
  /// Automatically resets [errorMessage] and sets [scanProgress] to 1.0.
  void setMesh(Mesh3D newMesh) {
    _mesh = newMesh;
    _scanState = ScanState.complete;
    _errorMessage = null;
    _scanProgress = 1.0;
    notifyListeners();
  }

  /// Transitions to [newState].
  ///
  /// When transitioning away from [ScanState.error], [errorMessage] is cleared.
  /// When transitioning to [ScanState.scanning] or [ScanState.processing],
  /// [scanProgress] is reset to 0.
  void setScanState(ScanState newState) {
    if (_scanState == newState) return;

    if (newState == ScanState.scanning || newState == ScanState.processing) {
      _scanProgress = 0.0;
    }
    if (newState != ScanState.error) {
      _errorMessage = null;
    }
    _scanState = newState;
    notifyListeners();
  }

  /// Updates processing progress.  [progress] is clamped to [0.0, 1.0].
  ///
  /// This does *not* change [scanState]; call [setScanState] separately when
  /// the transition is complete.
  void setProgress(double progress) {
    final clamped = progress.clamp(0.0, 1.0);
    if ((clamped - _scanProgress).abs() < 0.001) return; // avoid micro-updates
    _scanProgress = clamped;
    notifyListeners();
  }

  /// Records [message] as the error description and transitions to
  /// [ScanState.error].
  void setError(String message) {
    _errorMessage = message;
    _scanState = ScanState.error;
    _scanProgress = 0.0;
    notifyListeners();
  }

  /// Resets all state back to [ScanState.idle] and discards the current mesh.
  void reset() {
    _mesh = null;
    _scanState = ScanState.idle;
    _errorMessage = null;
    _scanProgress = 0.0;
    notifyListeners();
  }

  // ---------------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------------

  @override
  String toString() => 'MeshProvider('
      'state: $_scanState, '
      'progress: ${(_scanProgress * 100).toStringAsFixed(1)}%, '
      'mesh: ${_mesh?.toString() ?? 'none'}'
      ')';
}
