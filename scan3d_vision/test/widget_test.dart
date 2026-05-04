import 'package:flutter_test/flutter_test.dart';
import 'package:scan3d_vision/main.dart';

void main() {
  testWidgets('App smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const Scan3dVisionApp());
    expect(find.byType(Scan3dVisionApp), findsOneWidget);
  });
}
