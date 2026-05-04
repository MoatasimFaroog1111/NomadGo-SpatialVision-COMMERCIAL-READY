import 'package:flutter/material.dart';

/// Scan button states
enum ScanButtonState { idle, scanning, processing }

/// An animated circular scan button that adapts its appearance to the current
/// scanning state. Uses a pulsing animation when actively scanning.
class ScanButton extends StatefulWidget {
  final ScanButtonState state;
  final VoidCallback? onTap;
  final double size;

  const ScanButton({
    super.key,
    required this.state,
    this.onTap,
    this.size = 72.0,
  });

  @override
  State<ScanButton> createState() => _ScanButtonState();
}

class _ScanButtonState extends State<ScanButton>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late Animation<double> _pulseAnimation;
  late Animation<double> _pulseOpacity;

  static const Color _primaryColor = Color(0xFF7C4DFF);
  static const Color _accentColor = Color(0xFF00E5FF);

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _pulseAnimation = Tween<double>(begin: 1.0, end: 1.35).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );
    _pulseOpacity = Tween<double>(begin: 0.6, end: 0.0).animate(
      CurvedAnimation(parent: _pulseController, curve: Curves.easeInOut),
    );

    if (widget.state == ScanButtonState.scanning) {
      _pulseController.repeat(reverse: false);
    }
  }

  @override
  void didUpdateWidget(ScanButton oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.state == ScanButtonState.scanning) {
      if (!_pulseController.isAnimating) {
        _pulseController.repeat(reverse: false);
      }
    } else {
      if (_pulseController.isAnimating) {
        _pulseController.stop();
        _pulseController.reset();
      }
    }
  }

  @override
  void dispose() {
    _pulseController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    switch (widget.state) {
      case ScanButtonState.processing:
        return _buildProcessingButton();
      case ScanButtonState.scanning:
        return _buildScanningButton();
      case ScanButtonState.idle:
        return _buildIdleButton();
    }
  }

  Widget _buildIdleButton() {
    return GestureDetector(
      onTap: widget.onTap,
      child: Container(
        width: widget.size,
        height: widget.size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: _primaryColor, width: 2.5),
          color: Colors.transparent,
        ),
        child: const Center(
          child: Icon(
            Icons.camera_alt,
            color: _primaryColor,
            size: 32.0,
          ),
        ),
      ),
    );
  }

  Widget _buildScanningButton() {
    return GestureDetector(
      onTap: widget.onTap,
      child: AnimatedBuilder(
        animation: _pulseController,
        builder: (context, child) {
          return Stack(
            alignment: Alignment.center,
            children: [
              // Outer pulsing ring
              Transform.scale(
                scale: _pulseAnimation.value,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _primaryColor.withOpacity(_pulseOpacity.value),
                      width: 3.0,
                    ),
                  ),
                ),
              ),
              // Second pulsing ring with offset timing
              Transform.scale(
                scale: 1.0 + (_pulseAnimation.value - 1.0) * 0.5,
                child: Container(
                  width: widget.size,
                  height: widget.size,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _accentColor
                          .withOpacity(_pulseOpacity.value * 0.5),
                      width: 2.0,
                    ),
                  ),
                ),
              ),
              // Core button
              Container(
                width: widget.size,
                height: widget.size,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: _primaryColor,
                  boxShadow: [
                    BoxShadow(
                      color: _primaryColor.withOpacity(0.5),
                      blurRadius: 16.0,
                      spreadRadius: 2.0,
                    ),
                  ],
                ),
                child: const Center(
                  child: Icon(
                    Icons.stop_rounded,
                    color: Colors.white,
                    size: 34.0,
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildProcessingButton() {
    return Container(
      width: widget.size,
      height: widget.size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: const Color(0xFF1E1E2E),
        border: Border.all(color: _primaryColor.withOpacity(0.4), width: 2.0),
      ),
      child: Center(
        child: SizedBox(
          width: widget.size * 0.45,
          height: widget.size * 0.45,
          child: CircularProgressIndicator(
            strokeWidth: 2.5,
            valueColor: AlwaysStoppedAnimation<Color>(_accentColor),
          ),
        ),
      ),
    );
  }
}
