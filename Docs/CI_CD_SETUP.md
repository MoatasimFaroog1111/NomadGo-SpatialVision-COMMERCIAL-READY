# NomadGo SpatialVision — CI/CD Setup (GitHub Actions + GameCI)

## Overview
This project is configured to automatically build an Android APK using GitHub Actions and GameCI whenever you push code to the `main` branch.

---

## IMPORTANT: First Open in Unity

Before pushing to GitHub, you MUST open the project in Unity 2022.3 first. This generates correct GUIDs and meta files that GameCI needs:

1. Open Unity Hub
2. Click **Open** and select the project folder
3. Wait for Unity to import all assets (may take 5-10 minutes first time)
4. Go to **File > Build Settings** and verify `Main.unity` is in the scene list
5. Close Unity
6. Now the `ProjectSettings/` and `Packages/` folders contain valid auto-generated files

---

## Step 1: Push the Project to GitHub

### Option A: From PowerShell
```powershell
cd C:\Users\HP\Downloads\Nomad-Spatial-Vision

git init
git add .
git commit -m "Initial commit: NomadGo SpatialVision"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/NomadGo-SpatialVision.git
git push -u origin main
```

### Option B: Using GitHub Desktop
1. Open GitHub Desktop
2. File > Add Local Repository
3. Select the project folder
4. Publish to GitHub

---

## Step 2: Get Your Unity License

### 2a. Run the Activation Workflow
1. Go to your GitHub repository
2. Click **Actions** tab
3. Click **Acquire Unity License** on the left
4. Click **Run workflow** > **Run workflow**
5. Wait for it to finish
6. Download the artifact file (`.alf`)

### 2b. Activate the License
1. Go to https://license.unity3d.com/manual
2. Upload the `.alf` file
3. Choose **Unity Personal** (or your license type)
4. Download the `.ulf` license file
5. Open the `.ulf` file with Notepad
6. Copy ALL the contents

---

## Step 3: Add GitHub Secrets

Go to your repository: **Settings > Secrets and variables > Actions > New repository secret**

Add these secrets:

| Secret Name | Value |
|---|---|
| `UNITY_LICENSE` | Full contents of the `.ulf` file |
| `UNITY_EMAIL` | Your Unity account email |
| `UNITY_PASSWORD` | Your Unity account password |

### Optional: For signed APK (needed for Google Play)

| Secret Name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded keystore (see below) |
| `ANDROID_KEYSTORE_PASS` | Keystore password |
| `ANDROID_KEYALIAS_NAME` | Key alias name |
| `ANDROID_KEYALIAS_PASS` | Key alias password |

#### Create a keystore (PowerShell):
```powershell
keytool -genkey -v -keystore nomadgo.keystore -alias nomadgo -keyalg RSA -keysize 2048 -validity 10000

# Convert to Base64:
[Convert]::ToBase64String([IO.File]::ReadAllBytes("nomadgo.keystore")) | Out-File keystore.base64.txt
```
Copy the contents of `keystore.base64.txt` into the `ANDROID_KEYSTORE_BASE64` secret.

---

## Step 4: Add Your ONNX Model

Before the build will work, you need to add the YOLO model:

1. Download `yolov8n.onnx` from: https://github.com/ultralytics/assets/releases
2. Place it in: `Assets/StreamingAssets/Models/yolov8n.onnx`
3. Commit and push:
```powershell
git add Assets/StreamingAssets/Models/yolov8n.onnx
git commit -m "Add YOLO model"
git push
```

---

## Step 5: Run the Build

### Automatic
The build runs automatically when you push to `main` (only when files in `Assets/`, `Packages/`, or `ProjectSettings/` change).

### Manual
1. Go to **Actions** tab
2. Click **Build Android APK**
3. Click **Run workflow** > **Run workflow**

---

## Step 6: Download the APK

1. After the build completes (usually 15-30 minutes), go to the **Actions** tab
2. Click the completed workflow run
3. Scroll down to **Artifacts**
4. Click **NomadGo-SpatialVision-APK** to download
5. Extract the ZIP
6. Transfer the `.apk` file to your Android phone
7. Install and run

---

## Workflow Files

| File | Purpose |
|---|---|
| `.github/workflows/activation.yml` | One-time: generates Unity license activation file |
| `.github/workflows/build-android.yml` | Builds Android APK on every push to main |

---

## Troubleshooting

### Build fails with "No valid Unity license"
- Make sure `UNITY_LICENSE` secret contains the FULL contents of the `.ulf` file
- Re-run the activation workflow if the license expired

### Build fails with "Scene not found"
- Verify `Assets/Scenes/Main.unity` exists
- Check `ProjectSettings/EditorBuildSettings.asset` lists the scene

### Build takes too long
- First build takes 20-40 minutes (caching is set up for subsequent builds)
- Subsequent builds should take 10-15 minutes

### APK crashes on device
- Make sure your device supports ARCore
- Check that the ONNX model is in `Assets/StreamingAssets/Models/`
- Verify `CONFIG.json` has the correct model path

### Build runs out of disk space
- The workflow includes automatic disk cleanup
- If it still fails, try reducing the project size or using a self-hosted runner
