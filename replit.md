# NomadGo SpatialVision

## Overview
NomadGo SpatialVision is a Unity Mobile AR Application for 3D Spatial Intelligence Inventory Counting. This Replit project contains:
1. Full Unity project files (C# scripts, scenes, configs) for local Unity development
2. A live Mock Sync Server with web dashboard for receiving sync pulses from the Unity app

## Project Architecture

### Unity Project (Assets/)
- **Assets/Scripts/AppShell/** — Application lifecycle, config loading, scan UI
- **Assets/Scripts/Spatial/** — AR plane detection, depth estimation, spatial tracking
- **Assets/Scripts/Vision/** — ONNX inference engine, frame processing, detection results
- **Assets/Scripts/Counting/** — IOU tracking, row clustering, count management
- **Assets/Scripts/AROverlay/** — Bounding box drawing, count labels, overlay renderer
- **Assets/Scripts/Storage/** — JSON session storage, auto-save, export
- **Assets/Scripts/Sync/** — Sync pulse manager, queue with retry, network monitor
- **Assets/Scripts/Diagnostics/** — FPS overlay, inference timer, memory monitor
- **Assets/Scenes/Main.unity** — Main AR scene
- **Assets/Resources/CONFIG.json** — Editable application configuration
- **Assets/Models/** — ONNX model and labels placement

### Mock Server (server/)
- Express.js server running on port 5000
- POST /api/pulse — Receive sync pulses
- GET /api/pulses — List received pulses
- GET /api/stats — Server statistics
- GET /api/health — Health check

### Documentation (Docs/)
- RUNBOOK.md — Complete setup and deployment guide
- QA_CHECKLIST.md — Full QA test matrix

### Web Dashboard (client/)
- React dashboard for monitoring sync pulses
- Real-time stats, pulse log, test tools, API docs

### CI/CD (GitHub Actions + GameCI)
- **.github/workflows/activation.yml** — Unity license activation
- **.github/workflows/build-android.yml** — Automated Android APK build
- **ProjectSettings/** — Full Unity project settings for CI builds
- **Packages/manifest.json** — Package dependency declarations

### Local Setup
- **setup_local.ps1** — PowerShell script for local environment setup

## Recent Changes
- 2026-02-17: Added GitHub Actions + GameCI CI/CD pipeline
  - Created activation.yml workflow for Unity license setup
  - Created build-android.yml workflow for automated APK builds
  - Added complete ProjectSettings (PlayerSettings, QualitySettings, GraphicsSettings, etc.)
  - Added Packages/manifest.json with AR Foundation and ARCore dependencies
  - Added ProjectVersion.txt targeting Unity 2022.3.22f1
  - Created CI_CD_SETUP.md with step-by-step instructions
  - Updated .gitignore for Unity + Node.js
- 2026-02-13: Initial full project generation
  - Created complete Unity C# scripts for all subsystems
  - Created Main.unity scene file
  - Created CONFIG.json with all configurable parameters
  - Built Express mock server with pulse API endpoints
  - Built React web dashboard for pulse monitoring
  - Created RUNBOOK.md with setup/troubleshooting
  - Created QA_CHECKLIST.md with comprehensive test matrix
