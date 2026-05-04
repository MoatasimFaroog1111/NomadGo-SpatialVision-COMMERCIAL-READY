import 'dart:ui';
import 'package:flutter/material.dart';

/// A reusable glassmorphic container widget with backdrop blur effect,
/// semi-transparent background, and a subtle white border.
class GlassmorphicContainer extends StatelessWidget {
  final Widget child;
  final double? width;
  final double? height;
  final double borderRadius;
  final double opacity;
  final EdgeInsetsGeometry? padding;
  final EdgeInsetsGeometry? margin;
  final Gradient? gradient;

  const GlassmorphicContainer({
    super.key,
    required this.child,
    this.width,
    this.height,
    this.borderRadius = 16.0,
    this.opacity = 0.1,
    this.padding,
    this.margin,
    this.gradient,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      margin: margin,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(borderRadius),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10.0, sigmaY: 10.0),
          child: Container(
            width: width,
            height: height,
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(borderRadius),
              gradient: gradient ??
                  LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Colors.white.withOpacity(opacity),
                      Colors.white.withOpacity(opacity * 0.5),
                    ],
                  ),
              border: Border.all(
                color: Colors.white.withOpacity(0.2),
                width: 1.0,
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
