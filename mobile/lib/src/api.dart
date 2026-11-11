import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart' show FlutterError;

typedef Json = Map<String, dynamic>;
Json object(dynamic value) =>
    value is Map ? Map<String, dynamic>.from(value) : {};
List<Json> objects(dynamic value) =>
    value is List ? value.map(object).toList() : [];
String string(dynamic value, [String fallback = '']) =>
    value is String ? value : fallback;
num numeric(dynamic value, [num fallback = 0]) =>
    value is num ? value : fallback;

class ApiException implements Exception {
  final String message;
  const ApiException(this.message);
  @override
  String toString() => message;
}

Uri serverOrigin(String input) {
  final uri = Uri.tryParse(input.trim());
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.host.isEmpty ||
      uri.userInfo.isNotEmpty ||
      uri.hasQuery ||
      uri.hasFragment ||
      (uri.path.isNotEmpty && uri.path != '/') ||
      uri.port < 1 ||
      uri.port > 65535) {
    throw const ApiException('请填写 HTTPS 服务首页地址，不含账号密码、路径或 API Key。');
  }
  return uri.replace(path: '', fragment: null);
}

bool sameOrigin(Uri a, Uri b) =>
    a.scheme == b.scheme &&
    a.host == b.host &&
    a.port == b.port &&
    b.userInfo.isEmpty;

abstract class CompanionApi {
  Uri get origin;
  Future<Json> call(String path, {String method = 'GET', Json? body});
  Future<Json> upload(Uint8List bytes, String name, String kind, String mime);
  Future<Uint8List> media(String path);
  void close();
}

class HttpCompanionApi implements CompanionApi {
  @override
  final Uri origin;
  final HttpClient _server;
  final HttpClient _public = HttpClient();
  HttpCompanionApi._(this.origin, this._server);

  static Future<HttpCompanionApi> connect(String address) async {
    final origin = serverOrigin(address);
    final context = SecurityContext(withTrustedRoots: true);
    const trustedHost = String.fromEnvironment('DAFEIYU_TRUSTED_HOST');
    if (trustedHost.isNotEmpty && origin.host == trustedHost) {
      try {
        final data = await rootBundle.load('assets/trust/companion.pem');
        context.setTrustedCertificatesBytes(data.buffer.asUint8List());
      } on FlutterError {
        // Generic builds contain no private deployment certificate.
      }
    }
    final client = HttpClient(context: context)
      ..connectionTimeout = const Duration(seconds: 12);
    return HttpCompanionApi._(origin, client);
  }

  Uri _resolve(String path) {
    final uri = origin.resolve(path);
    if (uri.scheme != 'https' || uri.userInfo.isNotEmpty) {
      throw const ApiException('不支持这个文件地址。');
    }
    return uri;
  }

  Future<Uint8List> _request(
    Uri uri,
    String method, {
    Uint8List? bytes,
    Map<String, String>? headers,
    int limit = 8 * 1024 * 1024,
  }) async {
    try {
      // The optional deployment certificate is never used for other origins.
      final client = sameOrigin(origin, uri) ? _server : _public;
      if (!sameOrigin(origin, uri) &&
          (method != 'GET' || headers != null || bytes != null)) {
        throw const ApiException('不能把伙伴服务的数据发往其他地址。');
      }
      final request = await client
          .openUrl(method, uri)
          .timeout(const Duration(seconds: 15));
      request.followRedirects = false;
      headers?.forEach(request.headers.set);
      if (bytes != null) request.add(bytes);
      final response = await request.close().timeout(
        const Duration(seconds: 105),
      );
      final builder = BytesBuilder(copy: false);
      await for (final chunk in response.timeout(const Duration(seconds: 30))) {
        if (builder.length + chunk.length > limit) {
          throw const ApiException('返回内容超过大小限制。');
        }
        builder.add(chunk);
      }
      final result = builder.takeBytes();
      if (response.statusCode < 200 || response.statusCode >= 300) {
        Json error = {};
        try {
          error = object(jsonDecode(utf8.decode(result)));
        } catch (_) {}
        throw ApiException(
          string(error['error'], '服务暂时没有完成操作（${response.statusCode}）。'),
        );
      }
      return result;
    } on ApiException {
      rethrow;
    } on HandshakeException {
      throw const ApiException('服务器证书验证失败，请核对 HTTPS 服务地址和证书配置。');
    } on SocketException {
      throw const ApiException('连不上伙伴服务，请确认手机网络和服务器状态。');
    } catch (_) {
      throw const ApiException('连接超时或已中断，请稍后重试。');
    }
  }

  @override
  Future<Json> call(String path, {String method = 'GET', Json? body}) async {
    if (!path.startsWith('/api/')) throw const ApiException('无效的服务接口。');
    final result = await _request(
      _resolve(path),
      method,
      bytes: body == null
          ? null
          : Uint8List.fromList(utf8.encode(jsonEncode(body))),
      headers: {'Content-Type': 'application/json'},
    );
    try {
      return object(jsonDecode(utf8.decode(result)));
    } catch (_) {
      throw const ApiException('这个地址没有返回伙伴服务的数据。');
    }
  }

  @override
  Future<Json> upload(
    Uint8List bytes,
    String name,
    String kind,
    String mime,
  ) async {
    if (bytes.isEmpty || bytes.length > 12 * 1024 * 1024) {
      throw const ApiException('附件需非空且小于 12 MB。');
    }
    final result = await _request(
      _resolve('/api/media'),
      'POST',
      bytes: bytes,
      headers: {
        'Content-Type': mime,
        'X-Media-Kind': kind,
        'X-File-Name': Uri.encodeComponent(name),
      },
    );
    return object(jsonDecode(utf8.decode(result)));
  }

  @override
  Future<Uint8List> media(String path) =>
      _request(_resolve(path), 'GET', limit: 16 * 1024 * 1024);
  @override
  void close() {
    _server.close(force: true);
    _public.close(force: true);
  }
}
