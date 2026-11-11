import 'package:audioplayers/audioplayers.dart';
import 'package:dafeiyu/src/api.dart';
import 'package:dafeiyu/src/app.dart';
import 'package:dafeiyu/src/controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('Android Flutter UI connects to the existing companion service', (
    tester,
  ) async {
    Future<void> settle() async {
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 250));
      }
    }

    const address = String.fromEnvironment('DAFEIYU_SERVER_URL');
    expect(
      address,
      isNotEmpty,
      reason: 'Set DAFEIYU_SERVER_URL to a running HTTPS service.',
    );
    final controller = CompanionController(persistAddress: (_) async {});
    addTearDown(controller.dispose);
    await controller.connect(address);
    expect(controller.online, isTrue, reason: controller.error);
    expect(controller.data['messages'], isA<List>());
    // Exercise native Android playback using an existing server attachment.
    final audio = objects(controller.data['messages'])
        .expand((message) => objects(message['attachments']))
        .where((item) => item['kind'] == 'audio' && item['available'] == true);
    if (audio.isNotEmpty) {
      final started = controller.player.onPlayerStateChanged
          .firstWhere((value) => value == PlayerState.playing)
          .timeout(const Duration(seconds: 20));
      await controller.playAudio(audio.first);
      expect(await started, PlayerState.playing);
      expect(controller.audioId, audio.first['id']);
      await controller.stopAudio();
    }
    await tester.pumpWidget(CompanionApp(controller: controller, boot: false));
    await settle();
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await tester.tap(find.byTooltip('选择表情'));
    await settle();
    expect(find.byKey(const Key('inline-stickers')), findsOneWidget);
    expect(find.byType(AlertDialog), findsNothing);
    await tester.tap(find.text('表情'));
    await settle();
    await tester.tap(find.text('😊'));
    await tester.pump();
    expect(find.byKey(const Key('chat-input')), findsOneWidget);
    await tester.tap(find.byTooltip('切换文字输入').first);
    await settle();
    await tester.tap(find.byTooltip('切换语音输入'));
    await settle();
    expect(find.text('按住说话'), findsOneWidget);
    await tester.tap(find.text('记忆'));
    await settle();
    expect(find.text('记得的小事'), findsWidgets);
    await tester.tap(find.text('生活'));
    await settle();
    expect(find.text('生活足迹'), findsWidgets);
    await tester.tap(find.text('设置'));
    await settle();
    expect(find.text('伙伴服务'), findsOneWidget);
    await tester.tap(find.text('修改服务地址'));
    await settle();
    expect(find.byType(AlertDialog), findsOneWidget);
    expect(find.byKey(const Key('server-address')), findsOneWidget);
    await tester.tap(find.text('取消'));
    await settle();
    await tester.tap(find.text('聊天'));
    await settle();
    await tester.tap(find.byTooltip('聊天历史'));
    await settle();
    expect(find.byType(BottomSheet), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
