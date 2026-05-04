# NomadGo SpatialVision — Commercial Hardened Build

This branch/ZIP is a commercial-hardened version of the Unity AR + ONNX object-counting application and its supporting Express backend.

## Main commands

```bash
npm ci
npm run check
npm test
npm run build
```

## Backend environment

Copy `.env.example` to your deployment environment and set:

- `DATABASE_URL`
- `API_KEY`
- `NODE_ENV=production`

All `/api/*` routes require this header outside test mode:

```http
x-api-key: YOUR_API_KEY
```

## Unity build

GitHub Actions uses:

- Unity `2022.3.22f1`
- Android target SDK 34
- IL2CPP
- ARM64
- `BuildScript.BuildAndroid`

The APK artifact is uploaded as `NomadGo-SpatialVision-Commercial-APK`.

## Important

The repository is now hardened, but final commercial accuracy depends on a customer-trained ONNX model, real-device testing, and release signing.
