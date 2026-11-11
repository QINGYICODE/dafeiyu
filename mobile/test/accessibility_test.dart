import 'package:dafeiyu/src/app.dart';
import 'package:dafeiyu/src/chat.dart';
import 'package:dafeiyu/src/design.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'support.dart';

void main() {
  for (final brightness in Brightness.values) {
    testWidgets(
      'chat text remains legible in system ${brightness.name} appearance',
      (tester) async {
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        final api = FakeApi();
        api.state = snapshot(
          messages: [
            {
              'id': 'u1',
              'role': 'user',
              'content': '今天去看看海吧',
              'status': 'complete',
              'conversationId': 'one',
            },
            {
              'id': 'a1',
              'role': 'assistant',
              'content': '好呀，我陪你一起去',
              'status': 'complete',
              'conversationId': 'one',
            },
          ],
        );
        final c = TestController(api);
        await c.poll();
        addTearDown(c.dispose);
        await tester.pumpWidget(CompanionApp(controller: c, boot: false));
        await tester.pumpAndSettle();
        final context = tester.element(find.byKey(const Key('chat-input')));
        expect(Theme.of(context).brightness, brightness);
        for (final bubble in find.byType(MessageBubble).evaluate()) {
          final textFinder = find.descendant(
            of: find.byWidget(bubble.widget),
            matching: find.byType(SelectableText),
          );
          final text = tester.widget<SelectableText>(textFinder.first);
          final decorations = find
              .ancestor(of: textFinder.first, matching: find.byType(Container))
              .evaluate()
              .map((e) => (e.widget as Container).decoration)
              .whereType<BoxDecoration>();
          final background = decorations
              .firstWhere((d) => d.borderRadius != null && d.color != null)
              .color!;
          final a = text.style!.color!.computeLuminance(),
              b = background.computeLuminance();
          final ratio = (a > b ? (a + .05) / (b + .05) : (b + .05) / (a + .05));
          expect(
            ratio,
            greaterThanOrEqualTo(4.5),
            reason: 'Rendered message contrast must stay readable.',
          );
        }
        final p = context.colors;
        final ratio =
            (p.muted.computeLuminance() + .05) /
            (p.surface.computeLuminance() + .05);
        expect(ratio > 1 ? ratio : 1 / ratio, greaterThanOrEqualTo(4.5));
        expect(tester.takeException(), isNull);
      },
    );
  }

  testWidgets(
    'all sections remain usable at 320px with 200 percent system text',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 760);
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      final c = TestController(FakeApi());
      await c.poll();
      addTearDown(c.dispose);
      await tester.pumpWidget(CompanionApp(controller: c, boot: false));
      await tester.pumpAndSettle();
      for (var i = 0; i < 5; i++) {
        await tester.tap(find.byType(NavigationDestination).at(i));
        await tester.pumpAndSettle();
        expect(
          tester.takeException(),
          isNull,
          reason: 'Section $i must survive large text.',
        );
      }
      await tester.tap(find.byType(NavigationDestination).at(1));
      await tester.pumpAndSettle();
      await tester.tap(find.byTooltip('选择表情'));
      await tester.pumpAndSettle();
      expect(find.byKey(const Key('inline-stickers')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'regular width uses navigation rail and preserves the chat composer',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(1024, 768);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final c = TestController(FakeApi());
      await c.poll();
      addTearDown(c.dispose);
      await tester.pumpWidget(CompanionApp(controller: c, boot: false));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationRail), findsOneWidget);
      expect(find.byKey(const Key('chat-input')), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets(
    'keyboard insets keep the composer reachable and hide only the bottom navigation',
    (tester) async {
      tester.view.devicePixelRatio = 1;
      tester.view.physicalSize = const Size(320, 760);
      tester.view.viewInsets = const FakeViewPadding(bottom: 280);
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      addTearDown(tester.view.resetViewInsets);
      final c = TestController(FakeApi());
      await c.poll();
      addTearDown(c.dispose);
      await tester.pumpWidget(CompanionApp(controller: c, boot: false));
      await tester.pumpAndSettle();
      expect(find.byType(NavigationBar), findsNothing);
      final box = tester.getRect(find.byKey(const Key('chat-input')));
      expect(box.bottom, lessThanOrEqualTo(480));
      expect(tester.takeException(), isNull);
    },
  );
}
