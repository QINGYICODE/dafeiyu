import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dafeiyu/src/api.dart';
import 'package:dafeiyu/src/controller.dart';
import 'package:dafeiyu/src/recording.dart';

Json snapshot({List<Json>? messages, bool autoplay = false}) => {
  'activeConversation': 'one',
  'conversations': [
    {'id': 'one', 'title': '日常', 'updatedAt': '2026-11-11T00:00:00Z'},
  ],
  'settings': {
    'model': {
      'provider': 'deepseek',
      'baseUrl': 'https://api.deepseek.com',
      'name': 'deepseek-flash',
      'visionName': 'deepseek-flash',
      'visionEnabled': true,
      'jsonMode': true,
      'keyConfigured': true,
    },
    'voice': {
      'enabled': true,
      'mode': 'auto',
      'speaker': 'klee',
      'rate': 0,
      'autoplay': autoplay,
    },
    'cloudSpeech': {
      'region': 'beijing',
      'workspaceId': '',
      'asrEnabled': true,
      'ttsEnabled': true,
      'asrModel': 'qwen3-asr-flash',
      'ttsModel': 'qwen-audio-3.1-tts-flash',
      'voiceId': 'test-voice',
      'hotwords': '大肥鱼',
      'language': 'auto',
    },
    'platforms': {
      'bilibili': {'enabled': true},
    },
    'stickers': {'collect': true, 'send': true, 'limit': 120, 'cooldown': 6},
    'autonomy': {
      'enabled': false,
      'intervalMinutes': 120,
      'maxRunsPerDay': 6,
      'maxItemsPerRun': 2,
      'quietStart': '23:00',
      'quietEnd': '08:00',
    },
    'discovery': {'onUnfamiliar': true, 'learnMemes': true},
  },
  'messages': messages ?? [],
  'memories': [],
  'experiences': [],
  'stickers': [],
  'jobs': [],
  'personality': {
    'mood': '平静',
    'moodReason': '想听听你的日常。',
    'summary': '有自己的想法，也认真听你说。',
    'interests': ['海洋'],
    'preferredName': null,
  },
  'capabilities': {
    'cloudSpeech': {
      'keyConfigured': true,
      'keySource': 'QWEN_API_KEY',
      'clone': null,
    },
    'voice': {'available': true, 'voices': []},
  },
  'accounts': {
    'bilibili': {'connected': false, 'preferences': {}},
  },
  'stats': {'messages': 0, 'memories': 0, 'readings': 0},
};

class FakeApi implements CompanionApi {
  @override
  Uri get origin => Uri.parse('https://example.com');
  Json state = snapshot();
  final calls = <({String path, String method, Json? body})>[];
  Future<Json> Function(String)? pending;
  bool closed = false;
  @override
  Future<Json> call(String path, {String method = 'GET', Json? body}) async {
    calls.add((path: path, method: method, body: body));
    if (pending != null) return pending!(path);
    if (path == '/api/state') return object(jsonDecode(jsonEncode(state)));
    return {'id': 'job-one', 'status': 'running'};
  }

  @override
  Future<Json> upload(
    Uint8List bytes,
    String name,
    String kind,
    String mime,
  ) async => {
    'id': 'media-one',
    'kind': kind,
    'name': name,
    'size': bytes.length,
  };
  @override
  Future<Uint8List> media(String path) async => base64Decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  );
  @override
  void close() {
    closed = true;
  }
}

class FakeRecorder implements RecorderBackend {
  Completer<bool>? permissionGate;
  Completer<void>? startGate;
  int starts = 0, cancels = 0, stops = 0;
  @override
  Future<bool> permission() async =>
      permissionGate == null ? true : permissionGate!.future;
  @override
  Future<void> start(String path) async {
    starts++;
    if (startGate != null) await startGate!.future;
  }

  @override
  Future<String?> stop() async {
    stops++;
    return '/tmp/recording.m4a';
  }

  @override
  Future<void> cancel() async {
    cancels++;
  }

  @override
  Future<void> dispose() async {}
}

class TestController extends CompanionController {
  final played = <String>[];
  TestController(FakeApi api)
    : super(
        initialApi: api,
        recordingBackend: FakeRecorder(),
        persistAddress: (_) async {},
      );
  @override
  Future<void> playAudio(Json attachment) async {
    played.add(string(attachment['id']));
  }
}
