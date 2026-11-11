import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:dafeiyu/src/api.dart';
import 'support.dart';

void main() {
  test(
    'connection addresses require an HTTPS origin and exact hostname and port',
    () {
      final uri = serverOrigin(' https://EXAMPLE.com:443/ ');
      expect(uri.host, 'example.com');
      expect(
        sameOrigin(uri, Uri.parse('https://example.com/api/state')),
        isTrue,
      );
      expect(
        sameOrigin(uri, Uri.parse('https://example.com:38413/api/state')),
        isFalse,
      );
      for (final value in [
        'http://example.com',
        'https://a:b@example.com',
        'https://example.com/path',
        'https://example.com?key=x',
        'https://example.com#chat',
        'file:///sdcard/key',
        'https://example.com:0',
      ]) {
        expect(() => serverOrigin(value), throwsA(isA<ApiException>()));
      }
    },
  );
  test(
    'chat uses complete reply jobs, existing conversation, attachment IDs and a unique request ID',
    () async {
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      addTearDown(c.dispose);
      await c.poll();
      expect(
        await c.send('今天听到一首很好听的歌', [
          {'id': 'image-one'},
        ]),
        isTrue,
      );
      final call = api.calls.firstWhere((x) => x.path == '/api/chat');
      expect(call.body!['conversationId'], 'one');
      expect(call.body!['text'], '今天听到一首很好听的歌');
      expect(call.body!['attachmentIds'], ['image-one']);
      expect(call.body!['requestId'], isNotEmpty);
      expect(call.body!.containsKey('stream'), isFalse);
    },
  );
  test(
    'out-of-order polling cannot replace a fresh snapshot with an older one',
    () async {
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      addTearDown(c.dispose);
      final old = Completer<Json>(), fresh = Completer<Json>();
      int count = 0;
      api.pending = (_) => ++count == 1 ? old.future : fresh.future;
      final first = c.poll(), second = c.poll(force: true);
      fresh.complete(
        snapshot(
          messages: [
            {'id': 'fresh', 'conversationId': 'one'},
          ],
        ),
      );
      await second;
      old.complete(snapshot());
      await first;
      expect(c.messages.single['id'], 'fresh');
    },
  );
  test(
    'autoplay ignores history and plays each new complete voice only once',
    () async {
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      addTearDown(c.dispose);
      Map<String, dynamic> message(String id) => {
        'id': id,
        'conversationId': 'one',
        'role': 'assistant',
        'status': 'complete',
        'replyMode': 'voice',
        'attachments': [
          {'id': 'audio-$id', 'kind': 'audio', 'available': true},
        ],
      };
      api.state = snapshot(messages: [message('old')], autoplay: true);
      await c.poll();
      expect(c.played, isEmpty);
      api.state = snapshot(
        messages: [message('old'), message('new')],
        autoplay: true,
      );
      await c.poll();
      await c.poll();
      expect(c.played, ['audio-new']);
    },
  );
  test(
    'an offline request preserves existing records and disables sending',
    () async {
      final api = FakeApi(), c = TestController(FakeApi());
      c.api = api;
      addTearDown(c.dispose);
      api.state = snapshot(
        messages: [
          {'id': 'kept', 'conversationId': 'one'},
        ],
      );
      await c.poll();
      api.pending = (_) async => throw const ApiException('offline');
      await c.poll();
      expect(c.online, isFalse);
      expect(c.canSend, isFalse);
      expect(c.messages.single['id'], 'kept');
    },
  );
  test('GET actions do not carry a request body', () async {
    final api = FakeApi(), c = TestController(FakeApi());
    c.api = api;
    addTearDown(c.dispose);
    await c.action('/accounts/bilibili/feed', method: 'GET');
    expect(api.calls.first.body, isNull);
  });
  test(
    'a timed-out chat retries with the same request ID, while a new message gets a new ID',
    () async {
      final api = FakeApi();
      final c = TestController(api);
      addTearDown(c.dispose);
      await c.poll();
      int attempts = 0;
      api.pending = (path) async {
        if (path == '/api/chat') {
          if (++attempts == 1) throw const ApiException('timeout');
          return {'id': 'accepted'};
        }
        return api.state;
      };
      expect(await c.send('再试一次', []), isFalse);
      expect(await c.send('再试一次', []), isTrue);
      expect(await c.send('再试一次', []), isTrue);
      final ids = api.calls
          .where((call) => call.path == '/api/chat')
          .map((call) => call.body!['requestId'])
          .toList();
      expect(ids[0], ids[1]);
      expect(ids[2], isNot(ids[1]));
    },
  );
}
