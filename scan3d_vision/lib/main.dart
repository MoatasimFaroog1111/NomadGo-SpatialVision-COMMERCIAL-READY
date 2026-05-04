import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app/routes.dart';
import 'app/theme.dart';
import 'providers/scan_state_provider.dart';
import 'providers/detection_provider.dart';
import 'providers/mesh_provider.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const Scan3dVisionApp());
}

class Scan3dVisionApp extends StatelessWidget {
  const Scan3dVisionApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => ScanStateProvider()),
        ChangeNotifierProvider(create: (_) => DetectionProvider()),
        ChangeNotifierProvider(create: (_) => MeshProvider()),
      ],
      child: MaterialApp(
        title: 'Scan3D Vision',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.darkTheme,
        initialRoute: '/',
        onGenerateRoute: AppRouter.generateRoute,
      ),
    );
  }
}
