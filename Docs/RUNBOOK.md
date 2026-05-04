# NomadGo SpatialVision — RUNBOOK

## 1. Environment Requirements

| Component | Version | Notes |
|-----------|---------|-------|
| Unity | **2022.3 LTS** (2022.3.x) | Use Unity Hub to install |
| Render Pipeline | **URP** (Universal Render Pipeline) | Must be selected at project creation |
| AR Foundation | **5.1.5** | Via Unity Package Manager |
| ARCore XR Plugin | **5.1.5** | Via Unity Package Manager |
| ONNX Runtime for Unity | **1.16.3** | Manual import or via UPM git URL |
| JDK | **17** | Required for Android builds |
| Android SDK | API Level **34** | Install via Unity Hub > Installs > Add Modules |
| Min Android Version | **Android 10 (API 29)** | Set in Player Settings |
| Gradle | **7.6+** | Bundled with Unity |

---

## 2. Project Setup (Step by Step)

### 2.1 Create Unity Project

1. Open **Unity Hub**
2. Click **New Project**
3. Select template: **3D (URP)**
4. Set Unity version: **2022.3 LTS**
5. Name: `NomadGo-SpatialVision`
6. Click **Create project**

### 2.2 Import Project Files

1. Copy the entire `Assets/` folder from this repository into the Unity project's `Assets/` folder
2. Unity will auto-import and compile all scripts
3. Wait for compilation to complete (check Console for errors)

### 2.3 Install Required Packages

Open **Window > Package Manager** and install:

1. **AR Foundation 5.1.5**
   - Click `+` > `Add package by name`
   - Name: `com.unity.xr.arfoundation`
   - Version: `5.1.5`

2. **ARCore XR Plugin 5.1.5**
   - Name: `com.unity.xr.arcore`
   - Version: `5.1.5`

3. **TextMeshPro** (usually pre-installed)
   - Name: `com.unity.textmeshpro`

4. **ONNX Runtime for Unity** (install AFTER project compiles successfully)
   - Go to: https://github.com/microsoft/onnxruntime/releases/tag/v1.16.3
   - Download: `Microsoft.ML.OnnxRuntime.1.16.3.nupkg`
   - Rename `.nupkg` to `.zip` and extract it
   - Copy these DLLs to your Unity project:
     - `lib/netstandard2.0/Microsoft.ML.OnnxRuntime.dll` → `Assets/Plugins/OnnxRuntime/Microsoft.ML.OnnxRuntime.dll`
     - `runtimes/android-arm64/native/libonnxruntime.so` → `Assets/Plugins/Android/arm64-v8a/libonnxruntime.so`
   - Also download: `Microsoft.ML.OnnxRuntime.Managed.1.16.3.nupkg`
     - Extract and copy `lib/netstandard2.0/Microsoft.ML.OnnxRuntime.Managed.dll` → `Assets/Plugins/OnnxRuntime/`
   - After importing, go to **Edit > Project Settings > Player > Other Settings > Scripting Define Symbols**
   - Add: `ONNX_RUNTIME` (separated by semicolon from existing symbols)
   - Click **Apply** — the project will recompile with full ONNX inference enabled
   - **Note**: Without `ONNX_RUNTIME` defined, the project compiles and runs but inference is disabled (stub mode)

### 2.4 Configure URP

1. Open **Edit > Project Settings > Graphics**
2. Ensure **Scriptable Render Pipeline Settings** points to a URP Asset
3. If missing, create via **Assets > Create > Rendering > URP Asset (with Universal Renderer)**
4. Assign the URP Asset to Graphics settings

### 2.5 Add ONNX Model

1. Download or export a YOLOv8n model in ONNX format:
   ```bash
   pip install ultralytics
   python -c "from ultralytics import YOLO; m = YOLO('yolov8n.pt'); m.export(format='onnx', imgsz=640, opset=12)"
   ```
2. Copy `yolov8n.onnx` to `Assets/Models/`
3. Ensure `Assets/Models/labels.txt` matches your model's class order

---

## 2.7 Configure Main Scene AR Components

After opening `Main.unity`, you need to add AR components manually via Unity Inspector:

### AR Session GameObject:
1. Select **AR Session** in Hierarchy
2. Click **Add Component** in Inspector
3. Search and add: **AR Session**

### AR Session Origin GameObject:
1. Select **AR Session Origin** in Hierarchy
2. Click **Add Component** in Inspector
3. Search and add: **AR Session Origin**
4. Search and add: **AR Plane Manager**
5. Drag the **AR Camera** child object into the **Camera** field of AR Session Origin

### AR Camera GameObject:
1. Select **AR Camera** (child of AR Session Origin) in Hierarchy
2. Click **Add Component** in Inspector
3. Search and add: **AR Camera Manager**
4. Search and add: **AR Camera Background**
5. Verify the **Camera** component is already present (Tag: MainCamera)

### AppManager GameObject:
1. Select **AppManager** in Hierarchy
2. Click **Add Component** in Inspector
3. Search and add the script: **AppManager** (from NomadGo.AppShell)

### SystemManagers GameObject:
1. Select **SystemManagers** in Hierarchy
2. Click **Add Component** and add each of these scripts:
   - **PlaneDetector** (NomadGo.Spatial)
   - **DepthEstimator** (NomadGo.Spatial)
   - **SpatialTracker** (NomadGo.Spatial)
   - **FrameProcessor** (NomadGo.Vision)
   - **ONNXInferenceEngine** (NomadGo.Vision)
   - **IOUTracker** (NomadGo.Counting)
   - **RowCluster** (NomadGo.Counting)
   - **CountManager** (NomadGo.Counting)
   - **BoundingBoxRenderer** (NomadGo.AROverlay)
   - **CountLabelRenderer** (NomadGo.AROverlay)
   - **OverlayManager** (NomadGo.AROverlay)
   - **JSONSessionStorage** (NomadGo.Storage)
   - **SyncPulseManager** (NomadGo.Sync)
   - **NetworkMonitor** (NomadGo.Sync)
   - **FPSOverlay** (NomadGo.Diagnostics)
   - **InferenceTimer** (NomadGo.Diagnostics)
   - **MemoryMonitor** (NomadGo.Diagnostics)

3. Save the scene: **File > Save** (Ctrl+S)

---

## 3. Android Build Configuration

### 3.1 Platform Switch

1. Open **File > Build Settings**
2. Select **Android**
3. Click **Switch Platform**
4. Wait for re-import to complete

### 3.2 Player Settings

Open **Edit > Project Settings > Player** (Android tab):

| Setting | Value |
|---------|-------|
| Company Name | NomadGo |
| Product Name | SpatialVision |
| Package Name | com.nomadgo.spatialvision |
| Minimum API Level | **Android 10.0 (API 29)** |
| Target API Level | **34** |
| Scripting Backend | **IL2CPP** |
| Target Architectures | **ARM64** (uncheck ARMv7) |
| Internet Access | **Require** |
| Write Permission | **External (SDCard)** |

### 3.3 XR Plugin Management

1. Open **Edit > Project Settings > XR Plug-in Management**
2. Android tab: Check **ARCore**
3. Ensure **Initialize XR on Startup** is checked

### 3.4 Build

1. Open **File > Build Settings**
2. Add scene: `Assets/Scenes/Main.unity`
3. Ensure **Development Build** is checked for debug
4. Click **Build** or **Build and Run**
5. Select output APK location

---

## 4. How to Swap the Model File

1. Replace `Assets/Models/yolov8n.onnx` with your custom model
2. Update `Assets/Models/labels.txt` with the new class labels (one per line, matching model output order)
3. Update `Assets/Resources/CONFIG.json`:
   ```json
   {
     "model": {
       "path": "Models/your_model_name.onnx",
       "labels_path": "Models/labels.txt",
       "input_width": 640,
       "input_height": 640,
       "confidence_threshold": 0.45,
       "nms_threshold": 0.5,
       "max_detections": 100
     }
   }
   ```
4. Re-import in Unity (right-click `Assets/Models` > Reimport)
5. Build and test

---

## 5. How to Run the Mock Server

### 5.1 On Replit (Recommended)

The mock server runs automatically in this Replit project:
- Dashboard: Visit the Replit webview URL
- Pulse endpoint: `POST https://YOUR_REPLIT_URL/api/pulse`
- Health check: `GET https://YOUR_REPLIT_URL/api/health`

### 5.2 Locally

```bash
# Clone this Replit project or copy server files
npm install
npm run dev

# Server runs on http://localhost:5000
# Pulse endpoint: POST http://localhost:5000/api/pulse
# Dashboard: http://localhost:5000
```

### 5.3 Test with cURL

```bash
# Health check
curl http://localhost:5000/api/health

# Send test pulse
curl -X POST http://localhost:5000/api/pulse \
  -H "Content-Type: application/json" \
  -d '{
    "pulseId": "test001",
    "sessionId": "session_test",
    "timestamp": "2026-02-13T10:00:00Z",
    "totalCount": 25,
    "countsByLabel": [{"label":"bottle","count":10},{"label":"can","count":15}],
    "rowCount": 3,
    "deviceId": "test-device",
    "attemptCount": 0,
    "status": "pending"
  }'

# View all pulses
curl http://localhost:5000/api/pulses

# View stats
curl http://localhost:5000/api/stats

# Clear all pulses
curl -X DELETE http://localhost:5000/api/pulses
```

---

## 6. Unity Scene Setup (Manual)

If importing from scratch without the `.unity` file:

1. Create empty scene
2. Add GameObjects:
   - **AppManager** — attach `AppShell.AppManager`
   - **AR Session** — attach `ARSession`, `ARInputManager`
   - **AR Session Origin** — attach `ARSessionOrigin`, `ARPlaneManager`, `ARRaycastManager`, `AROcclusionManager`
     - Child: **AR Camera** — attach `Camera`, `ARCameraManager`, `ARCameraBackground`
   - **SystemManagers** — attach:
     - `Vision.FrameProcessor`
     - `Counting.CountManager`
     - `Storage.SessionStorage`
     - `Sync.SyncPulseManager`
     - `Diagnostics.DiagnosticsManager`
     - `Spatial.SpatialManager`
     - `Spatial.PlaneDetector`
     - `Spatial.DepthEstimator`
   - **Canvas** (Screen Space - Overlay) — attach:
     - `AROverlay.OverlayRenderer`
     - `AppShell.ScanUIController`
     - Add UI buttons: Start Scan, Stop Scan, Export Session
     - Add TextMeshPro status text
3. Wire up SerializeField references in Inspector
4. Set AR Camera as Main Camera

---

## 7. CONFIG.json Reference

| Section | Key | Type | Description |
|---------|-----|------|-------------|
| model | path | string | Path to ONNX model file |
| model | labels_path | string | Path to labels text file |
| model | input_width | int | Model input width (640) |
| model | input_height | int | Model input height (640) |
| model | confidence_threshold | float | Min detection confidence (0.45) |
| model | nms_threshold | float | NMS overlap threshold (0.5) |
| model | max_detections | int | Max detections per frame (100) |
| counting | row_cluster_vertical_gap | float | Pixel gap for row clustering (50) |
| counting | row_limit | int | Max rows to detect (6) |
| counting | iou_threshold | float | IOU for tracking (0.4) |
| counting | tracking_max_age_frames | int | Frames before track expires (15) |
| sync | base_url | string | Mock server URL |
| sync | pulse_interval_seconds | float | Seconds between pulses (5) |
| sync | queue_persistent | bool | Persist queue to disk (true) |
| storage | autosave_interval_seconds | float | Auto-save interval (2) |
| diagnostics | show_fps_overlay | bool | Display FPS counter |
| diagnostics | log_inference_time | bool | Log inference timing |
| diagnostics | show_memory_monitor | bool | Display memory usage |

---

## 8. Top Troubleshooting Issues

### 0. Package Resolution Errors ("Package cannot be found" / "Awaitable<>" errors)
**Symptoms**: Unity shows errors like:
- `com.unity.modules.accessibility: Package cannot be found`
- `com.unity.xr.arfoundation@6.3.3 ... Awaitable<> could not be found`
- `TagManager.asset: Parser Failure`

**Root Cause**: Unity resolved AR Foundation to v6.3.3 (requires Unity 6) instead of v5.1.5 (for Unity 2022.3). Also, stale cache or lock files may exist.

**Fix — Follow these steps IN ORDER**:
1. **Close Unity completely**
2. **Delete these folders/files** from the project root:
   - `Library/` (entire folder)
   - `Temp/` (entire folder)
   - `Packages/packages-lock.json` (if it exists)
3. **Verify `Packages/manifest.json`** contains these exact versions:
   ```json
   {
     "dependencies": {
       "com.unity.xr.arcore": "5.1.5",
       "com.unity.xr.arfoundation": "5.1.5",
       "com.unity.xr.management": "4.4.0",
       "com.unity.inputsystem": "1.7.0",
       "com.unity.textmeshpro": "3.0.6",
       "com.unity.ugui": "1.0.0",
       "com.unity.modules.ui": "1.0.0",
       "com.unity.modules.unitywebrequest": "1.0.0",
       "com.unity.modules.jsonserialize": "1.0.0",
       "com.unity.modules.imageconversion": "1.0.0",
       "com.unity.modules.audio": "1.0.0",
       "com.unity.modules.physics": "1.0.0"
     }
   }
   ```
4. **Re-open the project in Unity 2022.3 LTS**
5. Wait for Unity to re-import everything (this may take 5-10 minutes)
6. Unity will auto-generate a correct `packages-lock.json`

**Important**: Do NOT use AR Foundation 6.x with Unity 2022.3 — it requires Unity 6.

### 1. "Missing Assembly Reference" errors after import
**Fix**: Ensure all packages are installed via Package Manager (AR Foundation, ARCore, TextMeshPro). Restart Unity after installation.

### 2. AR Camera shows black screen on device
**Fix**: Check XR Plug-in Management settings. Ensure ARCore is enabled for Android. Verify camera permissions in AndroidManifest.xml.

### 3. ONNX model fails to load
**Fix**: Verify the model file exists at the path specified in CONFIG.json. Ensure ONNX Runtime for Unity package is imported. Check model was exported with opset 12 or higher.

### 4. Detections not appearing / zero count
**Fix**: Check confidence_threshold in CONFIG.json (try lowering to 0.3). Verify labels.txt matches model output classes. Enable verbose_mode in diagnostics to see raw inference output.

### 5. Android build fails with Gradle errors
**Fix**: Ensure JDK 17 is installed and configured in Unity Preferences > External Tools. Update Gradle to 7.6+. Set Target API Level to 34.

### 6. Sync pulses not reaching server
**Fix**: Verify base_url in CONFIG.json matches your server URL. Test server health endpoint. Check device has internet access. Look for logs with `[SyncPulse]` tag.

### 7. App crashes after ~2 minutes
**Fix**: Check MemoryMonitor overlay for excessive memory usage. Reduce max_detections. Increase frame skip (lower FPS target). Ensure textures are being properly disposed.

### 8. Plane detection not working
**Fix**: Ensure device supports ARCore. Move device slowly over textured surfaces. Check ARPlaneManager is attached and enabled. Verify PlaneDetectionMode in CONFIG.json.

### 9. Tracking jitter / double counting
**Fix**: Increase iou_threshold in CONFIG.json (try 0.5-0.6). Increase tracking_max_age_frames. Ensure camera is moving slowly and steadily.

### 10. Session export file not generated
**Fix**: Check Write Permission is set to External (SDCard) in Player Settings. Verify session_export_path in CONFIG.json. Check device storage space. Look for `[JSONStorage]` error logs.
