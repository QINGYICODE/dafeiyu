import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:dafeiyu/src/recording.dart';
import 'support.dart';

void main() {
  test(
    'releasing while permission is pending cannot start or send a late recording',
    () async {
      final backend = FakeRecorder()..permissionGate = Completer<bool>();
      final sent = <String>[];
      final r = TalkRecorder(
        backend: backend,
        destination: () async => '/tmp/test.m4a',
        deliver: (p) async => sent.add(p),
        inform: (_) {},
      );
      addTearDown(r.dispose);
      final task = r.begin();
      expect(r.pending, isTrue);
      await r.end();
      backend.permissionGate!.complete(true);
      await task;
      expect(backend.starts, 0);
      expect(sent, isEmpty);
      expect(r.recording, isFalse);
    },
  );
  test(
    'a cancelled native start is stopped when it eventually finishes',
    () async {
      final backend = FakeRecorder()..startGate = Completer<void>();
      final sent = <String>[];
      final r = TalkRecorder(
        backend: backend,
        destination: () async => '/tmp/test.m4a',
        deliver: (p) async => sent.add(p),
        inform: (_) {},
      );
      addTearDown(r.dispose);
      final task = r.begin();
      await Future<void>.delayed(Duration.zero);
      await r.end(cancel: true);
      backend.startGate!.complete();
      await task;
      expect(backend.cancels, 1);
      expect(sent, isEmpty);
    },
  );
  test(
    'slide-to-cancel discards audio and normal release delivers exactly once',
    () async {
      final backend = FakeRecorder();
      final sent = <String>[];
      final r = TalkRecorder(
        backend: backend,
        destination: () async => '/tmp/test.m4a',
        deliver: (p) async => sent.add(p),
        inform: (_) {},
      );
      addTearDown(r.dispose);
      await r.begin();
      r.slide(true);
      await r.end();
      expect(backend.cancels, 1);
      expect(sent, isEmpty);
      await r.begin();
      await Future<void>.delayed(const Duration(milliseconds: 700));
      await r.end();
      await r.end();
      expect(sent, ['/tmp/recording.m4a']);
      expect(backend.stops, 1);
    },
  );
}
