import 'package:flutter/material.dart';

/// App-wide theme definitions with a glassmorphic-inspired dark style.
class AppTheme {
  AppTheme._();

  // ─── Brand colours ───────────────────────────────────────────────────────
  static const Color primary = Color(0xFF7C4DFF);
  static const Color secondary = Color(0xFF00E5FF);
  static const Color surface = Color(0xFF1E1E2E);
  static const Color background = Color(0xFF121212);
  static const Color error = Color(0xFFFF5252);
  static const Color onPrimary = Colors.white;
  static const Color onSurface = Color(0xFFE0E0E0);
  static const Color onBackground = Color(0xFFE0E0E0);

  // ─── Dark theme ──────────────────────────────────────────────────────────
  static ThemeData get darkTheme {
    final colorScheme = ColorScheme(
      brightness: Brightness.dark,
      primary: primary,
      onPrimary: onPrimary,
      secondary: secondary,
      onSecondary: Colors.black,
      surface: surface,
      onSurface: onSurface,
      background: background,
      onBackground: onBackground,
      error: error,
      onError: Colors.white,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: background,

      // ── AppBar ────────────────────────────────────────────────────────────
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: true,
        titleTextStyle: TextStyle(
          color: onSurface,
          fontSize: 20,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
        iconTheme: IconThemeData(color: onSurface),
      ),

      // ── Cards ─────────────────────────────────────────────────────────────
      cardTheme: CardTheme(
        elevation: 8,
        color: surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      ),

      // ── Elevated Button ───────────────────────────────────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: primary,
          foregroundColor: onPrimary,
          elevation: 4,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
      ),

      // ── Outlined Button ───────────────────────────────────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: primary,
          side: const BorderSide(color: primary, width: 1.5),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5,
          ),
        ),
      ),

      // ── Text Button ───────────────────────────────────────────────────────
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: secondary,
          textStyle: const TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),

      // ── Floating Action Button ────────────────────────────────────────────
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: primary,
        foregroundColor: onPrimary,
        elevation: 6,
        shape: CircleBorder(),
      ),

      // ── Input Decoration ──────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Color(0xFF2E2E3E), width: 1),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: primary, width: 2),
        ),
        labelStyle: const TextStyle(color: Color(0xFF9E9E9E)),
        hintStyle: const TextStyle(color: Color(0xFF616161)),
      ),

      // ── Chip ──────────────────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        backgroundColor: surface,
        selectedColor: primary.withOpacity(0.3),
        labelStyle: const TextStyle(color: onSurface, fontSize: 13),
        side: const BorderSide(color: Color(0xFF2E2E3E)),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(8),
        ),
      ),

      // ── Divider ───────────────────────────────────────────────────────────
      dividerTheme: const DividerThemeData(
        color: Color(0xFF2E2E3E),
        thickness: 1,
      ),

      // ── SnackBar ──────────────────────────────────────────────────────────
      snackBarTheme: SnackBarThemeData(
        backgroundColor: surface,
        contentTextStyle: const TextStyle(color: onSurface),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(10),
        ),
        behavior: SnackBarBehavior.floating,
      ),

      // ── Typography ────────────────────────────────────────────────────────
      textTheme: const TextTheme(
        displayLarge: TextStyle(
            color: onBackground, fontWeight: FontWeight.w700, fontSize: 57),
        displayMedium: TextStyle(
            color: onBackground, fontWeight: FontWeight.w700, fontSize: 45),
        displaySmall: TextStyle(
            color: onBackground, fontWeight: FontWeight.w600, fontSize: 36),
        headlineLarge: TextStyle(
            color: onSurface, fontWeight: FontWeight.w600, fontSize: 32),
        headlineMedium: TextStyle(
            color: onSurface, fontWeight: FontWeight.w600, fontSize: 28),
        headlineSmall: TextStyle(
            color: onSurface, fontWeight: FontWeight.w600, fontSize: 24),
        titleLarge: TextStyle(
            color: onSurface, fontWeight: FontWeight.w600, fontSize: 22),
        titleMedium: TextStyle(
            color: onSurface, fontWeight: FontWeight.w500, fontSize: 16),
        titleSmall: TextStyle(
            color: onSurface, fontWeight: FontWeight.w500, fontSize: 14),
        bodyLarge: TextStyle(color: onSurface, fontSize: 16),
        bodyMedium: TextStyle(color: onSurface, fontSize: 14),
        bodySmall: TextStyle(color: Color(0xFF9E9E9E), fontSize: 12),
        labelLarge: TextStyle(
            color: onSurface, fontWeight: FontWeight.w600, fontSize: 14),
        labelMedium: TextStyle(
            color: onSurface, fontWeight: FontWeight.w500, fontSize: 12),
        labelSmall: TextStyle(color: Color(0xFF9E9E9E), fontSize: 11),
      ),
    );
  }
}
