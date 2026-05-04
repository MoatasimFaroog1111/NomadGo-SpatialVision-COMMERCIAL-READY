import 'package:flutter/material.dart';
import 'glassmorphic_container.dart';

/// A compact stat card widget for displaying a labeled metric with an icon.
/// Designed for use in horizontal rows within scanner overlays.
class StatCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final Color? iconColor;
  final Color? valueColor;

  const StatCard({
    super.key,
    required this.icon,
    required this.label,
    required this.value,
    this.iconColor,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    final Color effectiveIconColor =
        iconColor ?? const Color(0xFF7C4DFF);
    final Color effectiveValueColor =
        valueColor ?? const Color(0xFF00E5FF);

    return GlassmorphicContainer(
      borderRadius: 12.0,
      opacity: 0.12,
      padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 8.0),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            icon,
            size: 16.0,
            color: effectiveIconColor,
          ),
          const SizedBox(width: 6.0),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white54,
                  fontSize: 9.0,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.5,
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  color: effectiveValueColor,
                  fontSize: 13.0,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 0.3,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
