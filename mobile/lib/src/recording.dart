import 'dart:async';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';
import 'package:record/record.dart';

abstract class RecorderBackend {
  Future<bool> permission();
  Future<void> start(String path);
  Future<String?> stop();
  Future<void> cancel();
  Future<void> dispose();
}

class PhoneRecorder implements RecorderBackend {
  final _recorder = AudioRecorder();
  @override
  Future<bool> permission() => _recorder.hasPermission();
  @override
  Future<void> start(String path) => _recorder.start(
    const RecordConfig(
      encoder: AudioEncoder.aacLc,
      sampleRate: 24000,
      bitRate: 64000,
    ),
    path: path,
  );
  @override
  Future<String?> stop() => _recorder.stop();
  @override
  Future<void> cancel() => _recorder.cancel();
  @override
  Future<void> dispose() => _recorder.dispose();
}

class TalkRecorder extends ChangeNotifier {
  final RecorderBackend backend;
  final Future<String> Function() destination;
  final void Function(String) inform;
  final Future<void> Function(String) deliver;
  bool pending = false, recording = false, cancelling = false;
  bool _released = true, _starting = false, _disposed = false;
  DateTime? _started;
  Timer? _timer;
  int seconds = 0;
  TalkRecorder({
    required this.backend,
    required this.deliver,
    required this.inform,
    Future<String> Function()? destination,
  }) : destination =
           destination ??
           (() async =>
               '${(await getTemporaryDirectory()).path}/voice-${DateTime.now().microsecondsSinceEpoch}.m4a');

  void _changed() {
    if (!_disposed) notifyListeners();
  }

  Future<void> begin() async {
    if (pending || recording || _starting || _disposed) return;
    _released = false;
    pending = true;
    cancelling = false;
    seconds = 0;
    _changed();
    try {
      final permitted = await backend.permission();
      if (_released || _disposed) return;
      if (!permitted) {
        inform('没有获得麦克风权限，可以继续打字，或在系统应用权限中开启。');
        return;
      }
      final path = await destination();
      if (_released || _disposed) return;
      _starting = true;
      await backend.start(path);
      _starting = false;
      if (_released || _disposed) {
        await backend.cancel();
        return;
      }
      _started = DateTime.now();
      recording = true;
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        seconds++;
        _changed();
        if (seconds >= 120) unawaited(end());
      });
    } catch (_) {
      inform('录音暂时无法启动，请检查设备麦克风后重新按住说话。');
      await backend.cancel().catchError((_) {});
    } finally {
      _starting = false;
      pending = false;
      if (!recording) _released = true;
      _changed();
    }
  }

  void slide(bool cancel) {
    if (_released) return;
    cancelling = cancel;
    _changed();
  }

  Future<void> end({bool cancel = false}) async {
    if (_released) return;
    _released = true;
    _timer?.cancel();
    final active = recording;
    recording = false;
    final discard = cancel || cancelling || !active;
    final short =
        _started == null ||
        DateTime.now().difference(_started!).inMilliseconds < 650;
    cancelling = false;
    _changed();
    if (!active) {
      return; // begin() cancels a recording if permission/start resolves after release.
    }
    try {
      if (discard || short) {
        await backend.cancel();
        if (!discard && short) inform('说话时间太短了，再按住说一遍吧。');
        return;
      }
      final file = await backend.stop();
      if (file != null && !_disposed) await deliver(file);
    } catch (_) {
      inform('这段录音没有发送成功，请重试。');
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _released = true;
    _timer?.cancel();
    unawaited(backend.dispose());
    super.dispose();
  }
}

Future<void> removeRecording(String path) async {
  try {
    final file = File(path);
    if (await file.exists()) await file.delete();
  } catch (_) {}
}
