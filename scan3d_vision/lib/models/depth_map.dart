/// Represents a dense 2-D grid of depth values produced by [DepthEstimator].
///
/// Each cell holds a floating-point distance in metres (camera space).
/// A value of 0 means the depth is unknown / not estimated for that cell.
class DepthMap {
  final int width;
  final int height;

  /// Row-major depth grid: `data[y][x]`.  0 means unknown.
  final List<List<double>> data;

  final double minDepth;
  final double maxDepth;

  const DepthMap({
    required this.width,
    required this.height,
    required this.data,
    required this.minDepth,
    required this.maxDepth,
  });

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /// Returns the depth value at pixel (x, y).
  /// Returns 0 for out-of-bounds coordinates.
  double depthAt(int x, int y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return 0;
    return data[y][x];
  }

  // ---------------------------------------------------------------------------
  // Derived maps
  // ---------------------------------------------------------------------------

  /// Returns a new [DepthMap] whose values are linearly remapped to [0, 1].
  /// Cells with value 0 (unknown) remain 0.
  DepthMap normalized() {
    final range = maxDepth - minDepth;
    if (range == 0) return this;
    final normalizedData = data
        .map((row) =>
            row.map((d) => d == 0 ? 0.0 : (d - minDepth) / range).toList())
        .toList();
    return DepthMap(
      width: width,
      height: height,
      data: normalizedData,
      minDepth: 0,
      maxDepth: 1,
    );
  }

  /// Returns a bilinearly-interpolated depth for a fractional (u, v) ∈ [0,1].
  double sampleBilinear(double u, double v) {
    final fx = u * (width - 1);
    final fy = v * (height - 1);
    final x0 = fx.floor().clamp(0, width - 1);
    final y0 = fy.floor().clamp(0, height - 1);
    final x1 = (x0 + 1).clamp(0, width - 1);
    final y1 = (y0 + 1).clamp(0, height - 1);
    final tx = fx - x0;
    final ty = fy - y0;
    final d00 = data[y0][x0];
    final d10 = data[y0][x1];
    final d01 = data[y1][x0];
    final d11 = data[y1][x1];
    return (d00 * (1 - tx) + d10 * tx) * (1 - ty) +
        (d01 * (1 - tx) + d11 * tx) * ty;
  }

  /// Computes the average depth of all known (non-zero) cells.
  /// Returns 0 if no cells have data.
  double get averageDepth {
    double sum = 0;
    int count = 0;
    for (final row in data) {
      for (final d in row) {
        if (d != 0) {
          sum += d;
          count++;
        }
      }
    }
    return count == 0 ? 0 : sum / count;
  }

  /// Fraction of cells that have a known depth value (non-zero).
  double get coverage {
    int known = 0;
    for (final row in data) {
      for (final d in row) {
        if (d != 0) known++;
      }
    }
    return (width * height) == 0 ? 0 : known / (width * height);
  }

  @override
  String toString() =>
      'DepthMap(${width}x$height, depth: $minDepth–$maxDepth m, '
      'coverage: ${(coverage * 100).toStringAsFixed(1)}%)';
}
