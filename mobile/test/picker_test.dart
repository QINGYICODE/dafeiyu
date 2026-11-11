import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dafeiyu/src/api.dart';
import 'package:dafeiyu/src/chat.dart';

final class MemoryPickedFile extends PlatformFile {
  final List<int> bytes;
  final bool known;
  bool read = false, closed = false;
  MemoryPickedFile(this.bytes, {this.known = true});
  @override
  String get name => '表情.gif';
  @override
  Uri get uri => Uri.parse('content://documents/selected/42');
  @override
  Never get xFile => throw UnimplementedError();
  @override
  int? lengthSync() => known ? bytes.length : null;
  @override
  Future<int?> length() async => lengthSync();
  @override
  Future<Uint8List> readAsBytes() async => Uint8List.fromList(bytes);
  @override
  Stream<Uint8List> readAsByteStream() async* {
    read = true;
    try {
      for (final value in bytes) {
        yield Uint8List.fromList([value]);
      }
    } finally {
      closed = true;
    }
  }
}

void main() {
  test(
    'selected Android content URIs are readable without a filesystem path',
    () async {
      final file = MemoryPickedFile([1, 2, 3]);
      expect(file.path, isNull);
      expect(await pickedBytes(file, 12), [1, 2, 3]);
      expect(file.closed, isTrue);
    },
  );
  test(
    'known oversized documents are rejected before loading their contents',
    () async {
      final file = MemoryPickedFile([1, 2, 3]);
      await expectLater(pickedBytes(file, 2), throwsA(isA<ApiException>()));
      expect(file.read, isFalse);
    },
  );
  test(
    'unknown-length documents are bounded while reading and their stream is cancelled',
    () async {
      final file = MemoryPickedFile([1, 2, 3, 4], known: false);
      await expectLater(pickedBytes(file, 2), throwsA(isA<ApiException>()));
      expect(file.closed, isTrue);
    },
  );
}
