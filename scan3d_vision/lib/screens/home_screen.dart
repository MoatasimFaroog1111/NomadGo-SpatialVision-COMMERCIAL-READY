import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../app/constants.dart';
import '../app/routes.dart';
import '../app/theme.dart';
import '../providers/scan_state_provider.dart';

/// Landing screen — entry point of the app UI.
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scanState = context.watch<ScanStateProvider>();

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header ─────────────────────────────────────────────────────
              Text(
                AppConstants.appName,
                style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                      color: AppTheme.primary,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                'Real-time 3D scanning powered by AR & YOLO',
                style: Theme.of(context).textTheme.bodyMedium,
              ),

              const Spacer(),

              // ── Status card ────────────────────────────────────────────────
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Row(
                    children: [
                      Icon(
                        Icons.radio_button_checked,
                        color: scanState.isScanning
                            ? AppTheme.secondary
                            : Colors.grey,
                      ),
                      const SizedBox(width: 12),
                      Text(
                        'Status: ${scanState.statusMessage.toUpperCase()}',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 24),

              // ── Primary action ─────────────────────────────────────────────
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    scanState.reset();
                    Navigator.pushNamed(context, AppRouter.scan);
                  },
                  icon: const Icon(Icons.view_in_ar),
                  label: const Text('Start New Scan'),
                ),
              ),

              const SizedBox(height: 12),

              // ── Secondary actions ──────────────────────────────────────────
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          Navigator.pushNamed(context, AppRouter.preview),
                      icon: const Icon(Icons.threed_rotation, size: 18),
                      label: const Text('Preview'),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () =>
                          Navigator.pushNamed(context, AppRouter.export),
                      icon: const Icon(Icons.file_download, size: 18),
                      label: const Text('Export'),
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 32),
            ],
          ),
        ),
      ),
    );
  }
}
