# Scan3D Vision

Real-time 3D object scanner for Android and iOS. Combines **YOLOv8** object detection via TensorFlow Lite with **ARCore/ARKit** depth sensing to scan physical objects and export spec-compliant **GLTF 2.0** (`.glb`) 3D models.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Flutter UI Layer                  │
│  HomeScreen → ScanScreen → PreviewScreen → Export    │
├─────────────────────────────────────────────────────┤
│                  Provider State Layer                │
│  DetectionProvider │ ScanStateProvider │ MeshProvider │
├─────────────────────────────────────────────────────┤
│                   Service Layer                      │
│  CameraService → ImageConverter → YoloDetector       │
│  ARSessionManager → DepthEstimator → MeshGenerator   │
│  GltfExporter → ModelSharingService                  │
├─────────────────────────────────────────────────────┤
│               Platform / Native Layer                │
│  camera (YUV420) │ ar_flutter_plugin_2 (ARCore/ARKit)│
│  tflite_flutter (NNAPI/Metal) │ path_provider        │
└─────────────────────────────────────────────────────┘
```

### Pipeline Flow

1. **Camera Stream** → 10 FPS throttled frames via `CameraService`
2. **Image Conversion** → YUV420 (Android) / BGRA (iOS) → RGB via `ImageConverter`
3. **YOLO Detection** → YOLOv8n TFLite model (320×320 input) → bounding boxes with class-aware NMS
4. **AR Point Cloud** → ARCore/ARKit feature points accumulated in world-space via `ARSessionManager`
5. **Depth Estimation** → Sparse AR points filtered into detection region → IDW interpolation → dense `DepthMap`
6. **Mesh Generation** → Depth map → vertex grid displaced by depth → triangle indices → smooth normals → `Mesh3D`
7. **GLTF Export** → `Mesh3D` → spec-compliant GLB binary (positions, normals, UVs, indices) → file on disk
8. **3D Preview** → `flutter_3d_controller` renders the `.glb` with interactive rotation/zoom

---

## Project Structure

```
scan3d_vision/
├── android/
│   └── app/
│       ├── build.gradle              # Android build config (SDK 34, NDK 25, minSdk 24)
│       └── src/main/
│           └── AndroidManifest.xml   # Camera + ARCore permissions
├── ios/
│   └── Runner/
│       └── Info.plist                # Camera usage + ARKit capability
├── assets/
│   ├── models/                       # Place yolov8n.tflite here
│   └── labels/
│       └── coco_labels.txt           # 80-class COCO label list
├── lib/
│   ├── main.dart                     # App entry point with MultiProvider
│   ├── app/
│   │   ├── constants.dart            # App-wide constants (thresholds, sizes)
│   │   ├── routes.dart               # Named route generator with fade transitions
│   │   └── theme.dart                # Dark glassmorphic theme
│   ├── models/
│   │   ├── detection_result.dart     # YOLO detection data class (Rect bbox)
│   │   ├── depth_map.dart            # 2D depth grid with bilinear sampling
│   │   ├── mesh_3d.dart              # Triangulated mesh (vertices, normals, UVs, indices)
│   │   └── exported_model_info.dart  # File metadata for export list
│   ├── services/
│   │   ├── camera_service.dart       # Camera init + 10 FPS throttled stream
│   │   ├── image_converter.dart      # YUV420/BGRA → RGB conversion
│   │   ├── yolo_detector.dart        # YOLOv8n inference + NMS
│   │   ├── ar_session_manager.dart   # AR session + point cloud accumulation
│   │   ├── depth_estimator.dart      # Sparse-to-dense IDW depth interpolation
│   │   ├── mesh_generator.dart       # Depth map → triangulated mesh + simplification
│   │   ├── gltf_exporter.dart        # Mesh3D → GLB binary (GLTF 2.0 spec-compliant)
│   │   └── model_sharing_service.dart# System share sheet for .glb files
│   ├── providers/
│   │   ├── detection_provider.dart   # YOLO results + FPS tracking
│   │   ├── scan_state_provider.dart  # Scan lifecycle + timing
│   │   └── mesh_provider.dart        # Mesh result + processing state
│   ├── screens/
│   │   ├── home_screen.dart          # Landing page with navigation
│   │   ├── scan_screen.dart          # Camera + AR + YOLO + scanning controls
│   │   ├── preview_screen.dart       # Interactive 3D model viewer + export
│   │   └── export_screen.dart        # Export history list + management
│   └── widgets/
│       ├── detection_overlay.dart    # Bounding box painter with corner markers
│       ├── scan_button.dart          # Animated 3-state scan button
│       ├── glassmorphic_container.dart # Reusable blur container
│       └── stat_card.dart            # HUD metric display
└── pubspec.yaml                      # Dependencies and asset declarations
```

---

## Prerequisites

### Development Environment

| Tool            | Version       | Notes                              |
|-----------------|---------------|------------------------------------|
| Flutter SDK     | ≥ 3.16        | `flutter --version` to check       |
| Dart SDK        | ≥ 3.2.0       | Bundled with Flutter                |
| Android Studio  | 2023.1+       | With Android SDK 34 + NDK 25.2     |
| Xcode           | 15.0+         | For iOS builds (macOS only)        |
| CocoaPods       | ≥ 1.14        | `sudo gem install cocoapods`       |

### Physical Device Required

AR features require a physical device — emulators do not support ARCore/ARKit.

- **Android**: Device with [ARCore support](https://developers.google.com/ar/devices) running API 24+
- **iOS**: iPhone 6s+ or iPad Pro+ running iOS 12+

### YOLOv8 Model

You need a YOLOv8n model converted to TFLite format:

```bash
# Install ultralytics
pip install ultralytics

# Export YOLOv8n to TFLite (float32, 320×320 input)
yolo export model=yolov8n.pt format=tflite imgsz=320

# Copy to project assets
cp yolov8n_float32.tflite /path/to/scan3d_vision/assets/models/yolov8n.tflite
```

**Model specifications expected by the app:**
- Input: `[1, 320, 320, 3]` float32, normalized 0–1
- Output: `[1, 84, 2100]` (YOLOv8 format: 4 bbox + 80 class scores × 2100 anchors)

---

## Build Instructions

### 1. Clone and Install Dependencies

```bash
cd scan3d_vision
flutter pub get
```

### 2. Place the YOLO Model

Copy your `yolov8n.tflite` file into `assets/models/`:

```bash
cp /path/to/yolov8n.tflite assets/models/yolov8n.tflite
```

### 3. Android Build

```bash
# Debug build (connected device)
flutter run --debug

# Release APK
flutter build apk --release

# Release App Bundle (Play Store)
flutter build appbundle --release
```

**Android-specific setup** (if not already done):

1. Ensure `android/local.properties` has correct SDK paths:
   ```
   sdk.dir=/path/to/Android/sdk
   ndk.dir=/path/to/Android/sdk/ndk/25.2.9519653
   ```

2. For release builds, configure signing in `android/app/build.gradle`:
   ```groovy
   signingConfigs {
       release {
           storeFile file('your-keystore.jks')
           storePassword 'your-password'
           keyAlias 'your-alias'
           keyPassword 'your-key-password'
       }
   }
   ```

### 4. iOS Build

```bash
# Install CocoaPods dependencies
cd ios && pod install && cd ..

# Debug build (connected device)
flutter run --debug

# Release build
flutter build ios --release
```

**iOS-specific setup:**

1. Open `ios/Runner.xcworkspace` in Xcode
2. Set your development team under **Signing & Capabilities**
3. Set the deployment target to **iOS 12.0** or higher
4. Ensure the **ARKit** capability is enabled

### 5. TFLite Delegate Configuration (Optional Performance Boost)

For better inference performance, enable hardware delegates:

**Android — NNAPI delegate:**
```dart
// In yolo_detector.dart, modify initialize():
final options = InterpreterOptions()
  ..threads = 4
  ..addDelegate(NnApiDelegate());
```

**iOS — Metal delegate:**
```dart
final options = InterpreterOptions()
  ..threads = 4
  ..addDelegate(GpuDelegateV2());
```

---

## Key Technical Details

### GLTF 2.0 Export Compliance

The `GltfExporter` produces byte-accurate GLB files per the [GLTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html):

- **Header**: 12 bytes — magic `0x46546C67` ("glTF"), version 2, total length
- **JSON chunk**: type `0x4E4F534A`, padded to 4-byte boundary with `0x20`
- **BIN chunk**: type `0x004E4942`, padded to 4-byte boundary with `0x00`
- **Non-interleaved buffer layout**: positions (vec3) → normals (vec3) → texcoords (vec2) → indices (uint16/uint32)
- **Position accessor** includes `min`/`max` bounding box (required by spec)
- **Automatic index type selection**: uint16 for ≤65535 vertices, uint32 otherwise
- **Buffer view targets**: `ARRAY_BUFFER (34962)` for vertices, `ELEMENT_ARRAY_BUFFER (34963)` for indices

### YOLOv8 Detection Pipeline

- **Preprocessing**: Bilinear resize to 320×320, normalize pixels to [0,1]
- **Inference**: 4-thread CPU with optional NNAPI/Metal delegate
- **Postprocessing**: Parse [1,84,2100] output → center-format to LTRB → confidence filter (0.45) → class-aware NMS (IoU 0.5)

### 3D Reconstruction Pipeline

1. **Point Cloud**: AR feature points accumulated during scanning
2. **Depth Estimation**: Points filtered into detection bounding box region via view-projection matrix, then dense grid via IDW (power=2)
3. **Mesh Generation**: Resolution×Resolution vertex grid, depth-displaced, two CCW triangles per quad, area-weighted smooth normals
4. **Mesh Simplification**: Uniform 3D voxel clustering with ∛ratio grid resolution, degenerate triangle removal, normal recomputation

### Object Size Estimation

Real-world dimensions are estimated using:
- AR plane detection extents (when available)
- Point cloud AABB within the detection bounding box
- Fallback: 0.3m cube when insufficient AR data

---

## Dependencies

| Package                | Version    | Purpose                            |
|------------------------|------------|------------------------------------|
| camera                 | ^0.11.0+2  | Device camera access + frame stream|
| ar_flutter_plugin_2    | ^0.0.3     | ARCore (Android) + ARKit (iOS)     |
| tflite_flutter         | ^0.12.1    | TensorFlow Lite inference          |
| image                  | ^4.3.0     | Image format conversion            |
| vector_math            | ^2.1.4     | 3D math (Vector3, Matrix4)         |
| path_provider          | ^2.1.4     | App document directory access      |
| permission_handler     | ^11.3.1    | Runtime permission requests        |
| flutter_3d_controller  | ^2.3.1     | Interactive 3D model viewer        |
| share_plus             | ^10.1.4    | System share sheet                 |
| provider               | ^6.1.2     | State management                   |
| intl                   | ^0.19.0    | Date/number formatting             |
| uuid                   | ^4.5.1     | Unique identifiers                 |
| collection             | ^1.19.0    | Collection utilities               |

---

## Troubleshooting

### ARCore not detected
- Ensure Google Play Services for AR is installed on the Android device
- Check that `minSdkVersion` is 24+ in `build.gradle`

### TFLite model fails to load
- Verify the model file exists at `assets/models/yolov8n.tflite`
- Confirm the model input shape is `[1, 320, 320, 3]`
- Check that `assets/models/` is declared in `pubspec.yaml`

### iOS build fails with ARKit errors
- Ensure Xcode 15+ with iOS 12+ deployment target
- Add `NSCameraUsageDescription` to Info.plist
- Run `cd ios && pod install` after adding dependencies

### Low detection performance
- Enable NNAPI delegate (Android) or Metal delegate (iOS)
- Reduce `modelInputSize` to 256 in constants.dart
- Ensure good lighting conditions

### Empty mesh / no 3D model
- Ensure enough AR feature points are collected (≥50)
- Move the device slowly around the object during scanning
- The object should have visible texture for AR feature detection

---

## License

MIT License — see LICENSE file for details.
