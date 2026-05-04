# NomadGo SpatialVision — Commercial Release Notes

## What was hardened

- Unity Android build now uses a production build method with IL2CPP, ARM64, target SDK 34, version metadata, and deterministic APK output.
- AI confidence default is raised to production-safe values to reduce false positives.
- Backend API routes are protected with `x-api-key` authentication outside test mode.
- Backend now includes request IDs, security headers, JSON structured request logging, simple rate limiting, and safer health output.
- Pulse payload validation is stricter: ISO timestamps, max lengths, max counts, and label limits.
- Unity remote sync can send the API key using the `x-api-key` header.
- Catalog import now rejects empty products, missing product names, missing visual matching fields, and duplicate SKUs.
- CI now runs backend typecheck/tests before Unity Android APK build.

## Required before final customer handover

1. Train or fine-tune the object-detection model using the customer's real product images.
2. Replace `Assets/StreamingAssets/Models/yolov8n.onnx` with the customer-approved model.
3. Replace `Assets/Models/labels.txt` and `Training/labels.txt` with the customer labels.
4. Put the backend behind HTTPS.
5. Set a strong `API_KEY` in the backend environment.
6. Put the same API key in the mobile config only for controlled customer builds.
7. Test on at least three real Android devices that support ARCore.
8. Sign the APK/AAB with the customer's release keystore before Play Store or external delivery.

## Production limitations still remaining

- The included YOLO model is still generic unless you replace it with a trained customer model.
- This ZIP does not include Play Store signing credentials.
- Crash monitoring such as Firebase Crashlytics or Sentry still needs the customer project keys.
