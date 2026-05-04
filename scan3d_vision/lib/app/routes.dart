import 'package:flutter/material.dart';

import '../screens/home_screen.dart';
import '../screens/scan_screen.dart';
import '../screens/preview_screen.dart';
import '../screens/export_screen.dart';

/// Centralised route generator for the application.
class AppRouter {
  AppRouter._();

  static const String home = '/';
  static const String scan = '/scan';
  static const String preview = '/preview';
  static const String export = '/export';

  /// Generates named routes and handles unknown route fallback.
  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case home:
        return _buildRoute(const HomeScreen(), settings);

      case scan:
        return _buildRoute(const ScanScreen(), settings);

      case preview:
        return _buildRoute(const PreviewScreen(), settings);

      case export:
        return _buildRoute(const ExportScreen(), settings);

      default:
        return _buildRoute(
          Scaffold(
            body: Center(
              child: Text(
                'No route defined for "${settings.name}"',
                style: const TextStyle(color: Colors.white70),
              ),
            ),
          ),
          settings,
        );
    }
  }

  /// Wraps a widget in a [MaterialPageRoute] with a fade transition.
  static PageRoute<T> _buildRoute<T>(Widget page, RouteSettings settings) {
    return PageRouteBuilder<T>(
      settings: settings,
      pageBuilder: (context, animation, secondaryAnimation) => page,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        return FadeTransition(
          opacity: CurvedAnimation(
            parent: animation,
            curve: Curves.easeInOut,
          ),
          child: child,
        );
      },
      transitionDuration: const Duration(milliseconds: 250),
    );
  }
}
