import 'dart:typed_data';

import 'package:camera/camera.dart';
import 'package:image/image.dart' as img;

/// Utility class that converts raw [CameraImage] frames and [img.Image]
/// objects into formats suitable for the YOLO TFLite model.
class ImageConverter {
  // Private constructor – this is a purely static utility class.
  ImageConverter._();

  // -------------------------------------------------------------------------
  // Public static API
  // -------------------------------------------------------------------------

  /// Converts a [CameraImage] (either YUV420 or BGRA8888) to an RGB
  /// [img.Image].
  ///
  /// YUV420 is the default format on Android; BGRA8888 is the default on iOS.
  /// Falls back to a blank image for unrecognised formats rather than throwing.
  static img.Image convertCameraImage(CameraImage cameraImage) {
    switch (cameraImage.format.group) {
      case ImageFormatGroup.yuv420:
        return convertYUV420(cameraImage);
      case ImageFormatGroup.bgra8888:
        return convertBGRA8888(cameraImage);
      default:
        // For unrecognised formats, attempt YUV420 as a reasonable fallback.
        return convertYUV420(cameraImage);
    }
  }

  /// Converts a YUV420 [CameraImage] (Android) to an RGB [img.Image].
  ///
  /// The YUV420 semi-planar format stores:
  ///   Plane 0: Y  (luma), one byte per pixel
  ///   Plane 1: U  (Cb)
  ///   Plane 2: V  (Cr)
  ///
  /// The U/V planes may be interleaved (NV21) or separate (I420).
  static img.Image convertYUV420(CameraImage cameraImage) {
    final width = cameraImage.width;
    final height = cameraImage.height;

    final yPlane = cameraImage.planes[0];
    final uPlane = cameraImage.planes[1];
    final vPlane = cameraImage.planes[2];

    final yBytes = yPlane.bytes;
    final uBytes = uPlane.bytes;
    final vBytes = vPlane.bytes;

    final int uvRowStride = uPlane.bytesPerRow;
    final int uvPixelStride = uPlane.bytesPerPixel ?? 1;

    final image = img.Image(width: width, height: height);

    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        // Y sample.
        final int yIndex = y * yPlane.bytesPerRow + x;
        final int yValue = yBytes[yIndex] & 0xFF;

        // UV sample – sub-sampled 2×2.
        final int uvRow = (y >> 1);
        final int uvCol = (x >> 1);
        final int uvIndex = uvRow * uvRowStride + uvCol * uvPixelStride;

        final int uValue = uBytes[uvIndex] & 0xFF;
        final int vValue = vBytes[uvIndex] & 0xFF;

        // ITU-R BT.601 YCbCr → RGB.
        final int r =
            (yValue + 1.402 * (vValue - 128)).round().clamp(0, 255);
        final int g =
            (yValue - 0.344136 * (uValue - 128) - 0.714136 * (vValue - 128))
                .round()
                .clamp(0, 255);
        final int b =
            (yValue + 1.772 * (uValue - 128)).round().clamp(0, 255);

        image.setPixelRgb(x, y, r, g, b);
      }
    }

    return image;
  }

  /// Converts a BGRA8888 [CameraImage] (iOS) to an RGB [img.Image].
  static img.Image convertBGRA8888(CameraImage cameraImage) {
    final width = cameraImage.width;
    final height = cameraImage.height;

    final plane = cameraImage.planes[0];
    final bytes = plane.bytes;
    final int rowStride = plane.bytesPerRow;
    // BGRA: 4 bytes per pixel.
    final int pixelStride = plane.bytesPerPixel ?? 4;

    final image = img.Image(width: width, height: height);

    for (int y = 0; y < height; y++) {
      for (int x = 0; x < width; x++) {
        final int offset = y * rowStride + x * pixelStride;

        final int b = bytes[offset] & 0xFF;
        final int g = bytes[offset + 1] & 0xFF;
        final int r = bytes[offset + 2] & 0xFF;
        // Alpha byte at offset + 3 is ignored for RGB output.

        image.setPixelRgb(x, y, r, g, b);
      }
    }

    return image;
  }

  /// Resizes [image] to [targetSize]×[targetSize], normalises each channel to
  /// [0.0, 1.0] and returns the data as a flat [Float32List] in
  /// R, G, B interleaved order (HWC layout).
  ///
  /// The returned buffer has length [targetSize * targetSize * 3] and can be
  /// used directly as the input tensor for the YOLOv8 TFLite model.
  static Uint8List imageToFloat32List(img.Image image, int targetSize) {
    final resized = resizeImage(image, targetSize, targetSize);
    final floats = Float32List(targetSize * targetSize * 3);

    int idx = 0;
    for (int y = 0; y < targetSize; y++) {
      for (int x = 0; x < targetSize; x++) {
        final pixel = resized.getPixel(x, y);
        floats[idx++] = pixel.r / 255.0;
        floats[idx++] = pixel.g / 255.0;
        floats[idx++] = pixel.b / 255.0;
      }
    }

    // Return the underlying bytes of the Float32List so callers can treat it
    // as Uint8List when needed (e.g. writing to an isolate message buffer).
    return floats.buffer.asUint8List();
  }

  /// Returns a new [img.Image] that is [src] resampled to [width]×[height]
  /// using bilinear interpolation (delegated to the image package).
  static img.Image resizeImage(img.Image src, int width, int height) {
    return img.copyResize(
      src,
      width: width,
      height: height,
      interpolation: img.Interpolation.linear,
    );
  }
}
