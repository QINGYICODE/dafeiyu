import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dafeiyu/src/app.dart';
import 'support.dart';

void main() {
  testWidgets(
    '320px native chat keeps emoji input inline and sends through the API',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 720);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      await c.poll();
      addTearDown(c.dispose);
      await tester.pumpWidget(CompanionApp(controller: c, boot: false));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('chat-input')), findsOneWidget);
      await tester.tap(find.byTooltip('选择表情'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('inline-stickers')), findsOneWidget);
      expect(find.byType(AlertDialog), findsNothing);
      await tester.tap(find.text('表情'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('😊'));
      await tester.pump();
      expect(find.text('😊'), findsNWidgets(2));
      await tester.tap(find.byTooltip('发送消息'));
      await tester.pumpAndSettle();
      expect(
        api.calls.any((x) => x.path == '/api/chat' && x.body!['text'] == '😊'),
        isTrue,
      );
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'memories and personality stay read-only and settings are Flutter controls',
    (tester) async {
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      await c.poll();
      addTearDown(c.dispose);
      await tester.pumpWidget(CompanionApp(controller: c, boot: false));
      await tester.pumpAndSettle();
      await tester.tap(find.text('记忆'));
      await tester.pumpAndSettle();
      expect(find.text('记得的小事'), findsWidgets);
      expect(find.text('保存记忆'), findsNothing);
      await tester.tap(find.text('设置'));
      await tester.pumpAndSettle();
      expect(find.text('Flutter 客户端'), findsOneWidget);
      expect(find.text('修改服务地址'), findsOneWidget);
      await tester.tap(find.text('修改服务地址'));
      await tester.pumpAndSettle();
      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.byKey(const Key('server-address')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('landscape keeps the inline sticker tray inside the screen', (
    tester,
  ) async {
    tester.view.devicePixelRatio = 1;
    tester.view.physicalSize = const Size(720, 360);
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final c = TestController(FakeApi());
    await c.poll();
    addTearDown(c.dispose);
    await tester.pumpWidget(CompanionApp(controller: c, boot: false));
    await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('选择表情'));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('inline-stickers')), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
