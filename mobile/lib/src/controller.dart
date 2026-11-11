import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'api.dart';
import 'recording.dart';

class CompanionController extends ChangeNotifier {
  CompanionApi? api;
  Json data = {};
  bool online = false, connecting = false;
  String server = '', error = '', notice = '';
  int operations = 0;
  final Future<CompanionApi> Function(String) connectApi;
  final Future<void> Function(String)? persistAddress;
  final Map<String, Future<Uint8List>> _images = {};
  final Set<String> _seen = {};
  String _conversation = '', _encoded = '';
  Timer? _poller;
  bool _polling = false, _closed = false;
  int _generation = 0;
  int _pollRequest = 0;
  String _pendingChatSignature = '', _pendingChatId = '';
  AudioPlayer? _player;
  String? audioId;
  bool playing = false;
  Duration position = Duration.zero, audioDuration = Duration.zero;
  final List<StreamSubscription<dynamic>> _audioSubscriptions = [];
  late final TalkRecorder recorder;

  CompanionController({
    CompanionApi? initialApi,
    Future<CompanionApi> Function(String)? connectApi,
    this.persistAddress,
    RecorderBackend? recordingBackend,
  }) : api = initialApi,
       connectApi = connectApi ?? HttpCompanionApi.connect {
    recorder = TalkRecorder(
      backend: recordingBackend ?? PhoneRecorder(),
      deliver: sendRecording,
      inform: inform,
    );
  }
  AudioPlayer get player {
    if (_player != null) return _player!;
    final audio = AudioPlayer();
    _player = audio;
    _audioSubscriptions.add(
      audio.onPlayerStateChanged.listen((state) {
        playing = state == PlayerState.playing;
        changed();
      }),
    );
    _audioSubscriptions.add(
      audio.onPositionChanged.listen((value) {
        position = value;
        changed();
      }),
    );
    _audioSubscriptions.add(
      audio.onDurationChanged.listen((value) {
        audioDuration = value;
        changed();
      }),
    );
    _audioSubscriptions.add(
      audio.onPlayerComplete.listen((_) {
        playing = false;
        position = Duration.zero;
        changed();
      }),
    );
    return audio;
  }

  bool get busy => operations > 0;
  Json get settings => object(data['settings']);
  Json get personality => object(data['personality']);
  List<Json> get messages => objects(
    data['messages'],
  ).where((m) => m['conversationId'] == data['activeConversation']).toList();
  List<Json> get jobs => objects(data['jobs']);
  Json? get chatJob {
    for (final job in jobs) {
      if (job['kind'] == 'chat' &&
          job['status'] == 'running' &&
          job['conversationId'] == data['activeConversation']) {
        return job;
      }
    }
    return null;
  }

  bool get canSend =>
      online &&
      !busy &&
      chatJob == null &&
      object(settings['model'])['keyConfigured'] == true;
  void changed() {
    if (!_closed) notifyListeners();
  }

  void inform(String text) {
    if (_closed) return;
    notice = text;
    changed();
  }

  void clearNotice() {
    notice = '';
  }

  Future<void> initialize() async {
    final preferences = await SharedPreferences.getInstance();
    final address =
        preferences.getString('flutter.server') ??
        const String.fromEnvironment('DAFEIYU_SERVER_URL');
    if (address.isNotEmpty) await connect(address);
  }

  Future<void> connect(String address) async {
    final normalized = serverOrigin(address).toString();
    final generation = ++_generation;
    connecting = true;
    online = false;
    error = '';
    changed();
    await recorder.end(cancel: true);
    await stopAudio();
    _poller?.cancel();
    api?.close();
    _images.clear();
    _seen.clear();
    _encoded = '';
    _conversation = '';
    data = {};
    try {
      final client = await connectApi(normalized);
      if (_closed || generation != _generation) {
        client.close();
        return;
      }
      api = client;
      server = normalized;
      await poll(force: true);
      if (_closed || generation != _generation) return;
      if (online) {
        if (persistAddress != null) {
          await persistAddress!(normalized);
        } else {
          final preferences = await SharedPreferences.getInstance();
          await preferences.setString('flutter.server', normalized);
        }
      }
      if (_closed || generation != _generation) return;
      _poller = Timer.periodic(
        const Duration(milliseconds: 1600),
        (_) => unawaited(poll()),
      );
    } catch (exception) {
      if (generation == _generation) {
        error = exception.toString();
        online = false;
      }
    } finally {
      if (generation == _generation) {
        connecting = false;
        changed();
      }
    }
  }

  Future<void> poll({bool force = false}) async {
    final client = api;
    if (client == null || (_polling && !force)) return;
    final generation = _generation;
    final requestId = ++_pollRequest;
    _polling = true;
    try {
      final snapshot = await client.call('/api/state');
      if (_closed || generation != _generation || requestId != _pollRequest) {
        return;
      }
      if (snapshot['settings'] is! Map || snapshot['messages'] is! List) {
        throw const ApiException('这个地址不是大肥鱼伙伴服务。');
      }
      final encoded = jsonEncode(snapshot);
      final reconnected = !online;
      online = true;
      error = '';
      if (encoded != _encoded) {
        final first = _conversation != snapshot['activeConversation'];
        if (first) {
          _seen.clear();
          unawaited(stopAudio());
        }
        final arriving = objects(snapshot['messages'])
            .where(
              (m) =>
                  m['conversationId'] == snapshot['activeConversation'] &&
                  m['role'] == 'assistant' &&
                  m['status'] == 'complete',
            )
            .toList();
        final fresh = first
            ? <Json>[]
            : arriving.where((m) => !_seen.contains(m['id'])).toList();
        _seen.addAll(arriving.map((m) => string(m['id'])));
        _conversation = string(snapshot['activeConversation']);
        data = snapshot;
        _encoded = encoded;
        changed();
        if (object(object(snapshot['settings'])['voice'])['autoplay'] == true &&
            fresh.isNotEmpty) {
          final audio = objects(
            fresh.last['attachments'],
          ).where((a) => a['kind'] == 'audio' && a['available'] == true);
          if (audio.isNotEmpty) unawaited(playAudio(audio.first));
        }
      } else if (reconnected) {
        changed();
      }
    } catch (exception) {
      if (_closed || generation != _generation || requestId != _pollRequest) {
        return;
      }
      final message = exception.toString();
      final update = online || error != message;
      online = false;
      error = message;
      if (update) changed();
    } finally {
      if (requestId == _pollRequest) _polling = false;
    }
  }

  Future<Json?> action(
    String path, {
    String method = 'POST',
    Json? body,
    String? success,
  }) async {
    final client = api;
    if (client == null) {
      inform('先连接伙伴服务。');
      return null;
    }
    final generation = _generation;
    operations++;
    changed();
    try {
      final result = await client.call(
        '/api$path',
        method: method,
        body: method == 'GET' || method == 'HEAD' ? null : body ?? {},
      );
      if (_closed || generation != _generation) return null;
      await poll(force: true);
      if (success != null) inform(success);
      return result;
    } catch (exception) {
      if (generation == _generation) inform(exception.toString());
      return null;
    } finally {
      operations--;
      changed();
    }
  }

  Future<bool> send(String text, List<Json> attachments) async {
    if (!canSend) {
      inform(chatJob != null ? '大肥鱼正在输入中，稍等一下。' : '先连接已配置模型的伙伴服务。');
      return false;
    }
    if (text.trim().isEmpty && attachments.isEmpty) return false;
    final signature = jsonEncode([
      server,
      data['activeConversation'],
      text.trim(),
      attachments.map((a) => a['id']).toList(),
    ]);
    if (_pendingChatSignature != signature) {
      _pendingChatSignature = signature;
      _pendingChatId =
          '${DateTime.now().microsecondsSinceEpoch}-${Random.secure().nextInt(1 << 30)}';
    }
    final sent =
        await action(
          '/chat',
          body: {
            'text': text.trim(),
            'conversationId': data['activeConversation'],
            'requestId': _pendingChatId,
            'attachmentIds': attachments.map((a) => a['id']).toList(),
          },
        ) !=
        null;
    if (sent && _pendingChatSignature == signature) _pendingChatSignature = '';
    return sent;
  }

  Future<Json?> upload(
    String path,
    String name,
    String kind,
    String mime,
  ) async {
    final file = File(path);
    if (await file.length() > 12 * 1024 * 1024) {
      inform('附件需小于 12 MB。');
      return null;
    }
    return uploadBytes(await file.readAsBytes(), name, kind, mime);
  }

  Future<Json?> uploadBytes(
    Uint8List bytes,
    String name,
    String kind,
    String mime,
  ) async {
    final client = api;
    if (client == null || !online) {
      inform('连接中断，暂时不能上传。');
      return null;
    }
    operations++;
    changed();
    try {
      return await client.upload(bytes, name, kind, mime);
    } catch (exception) {
      inform(exception.toString());
      return null;
    } finally {
      operations--;
      changed();
    }
  }

  Future<void> sendRecording(String path) async {
    try {
      final item = await upload(path, '语音.m4a', 'audio', 'audio/mp4');
      if (item != null) await send('', [item]);
    } finally {
      await removeRecording(path);
    }
  }

  Future<Uint8List> image(String url) {
    if (_images.length >= 96) _images.remove(_images.keys.first);
    return _images.putIfAbsent(url, () => api!.media(url));
  }

  Future<void> playAudio(Json attachment) async {
    if (api == null || attachment['available'] == false) {
      inform('这段语音已不可用。');
      return;
    }
    final id = string(attachment['id'], string(attachment['url']));
    if (audioId == id && playing) {
      await player.pause();
      return;
    }
    if (audioId == id && position > Duration.zero && !playing) {
      await player.resume();
      return;
    }
    try {
      await player.stop();
      audioId = id;
      position = Duration.zero;
      audioDuration = Duration(
        milliseconds: (numeric(attachment['duration']) * 1000).round(),
      );
      changed();
      final bytes = await api!.media(string(attachment['url']));
      final directory = await getTemporaryDirectory();
      final extension = string(attachment['mime']).contains('wav')
          ? 'wav'
          : string(attachment['mime']).contains('mpeg')
          ? 'mp3'
          : string(attachment['mime']).contains('webm')
          ? 'webm'
          : 'm4a';
      final file = File(
        '${directory.path}/speech-${id.replaceAll(RegExp(r'[^a-zA-Z0-9_-]'), '_')}.$extension',
      );
      await file.writeAsBytes(bytes, flush: true);
      if (!_closed && audioId == id) {
        await player.play(DeviceFileSource(file.path));
      }
    } catch (_) {
      playing = false;
      inform('语音暂时播放不了，可以展开文字查看。');
    }
  }

  Future<void> stopAudio() async {
    await _player?.stop();
    audioId = null;
    position = Duration.zero;
    playing = false;
  }

  Future<void> background() async {
    await recorder.end(cancel: true);
    await _player?.pause();
  }

  @override
  void dispose() {
    _closed = true;
    _generation++;
    _poller?.cancel();
    recorder.dispose();
    api?.close();
    for (final sub in _audioSubscriptions) {
      unawaited(sub.cancel());
    }
    if (_player != null) unawaited(_player!.dispose());
    super.dispose();
  }
}
