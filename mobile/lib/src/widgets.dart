import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import 'api.dart';
import 'controller.dart';

const ink = Color(0xff293b47),
    muted = Color(0xff8194a0),
    blue = Color(0xff4387b2),
    paper = Color(0xfff7f9fa);
const platformNames = <String, String>{
  'bilibili': 'B 站',
  'douyin': '抖音',
  'xiaohongshu': '小红书',
  'weibo': '微博',
  'gengbaike': '梗百科',
  'gengwiki': '梗百科 · geng.page',
  'fabiaoqing': '发表情',
};
String timeLabel(dynamic input) {
  final date = DateTime.tryParse(string(input));
  if (date == null) return '';
  final d = date.toLocal();
  return '${d.month}/${d.day} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
}

String clock(Duration d) =>
    '${d.inMinutes}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';
Future<void> external(String value) async {
  final uri = Uri.tryParse(value);
  if (uri == null ||
      !['https', 'http'].contains(uri.scheme) ||
      uri.userInfo.isNotEmpty) {
    return;
  }
  await launchUrl(uri, mode: LaunchMode.externalApplication);
}

class Avatar extends StatelessWidget {
  final double size;
  const Avatar({super.key, this.size = 42});
  @override
  Widget build(BuildContext context) => ClipRRect(
    borderRadius: BorderRadius.circular(size * .3),
    child: Image.asset(
      'assets/characters/dafeiyu-avatar-v1.webp',
      width: size,
      height: size,
      fit: BoxFit.cover,
    ),
  );
}

class RemotePicture extends StatefulWidget {
  final CompanionController controller;
  final String url;
  final double? width, height;
  final BoxFit fit;
  final String? label;
  const RemotePicture({
    super.key,
    required this.controller,
    required this.url,
    this.width,
    this.height,
    this.fit = BoxFit.contain,
    this.label,
  });
  @override
  State<RemotePicture> createState() => _RemotePictureState();
}

class _RemotePictureState extends State<RemotePicture> {
  late Future<Uint8List> future;
  @override
  void initState() {
    super.initState();
    future = widget.controller.image(widget.url);
  }

  @override
  void didUpdateWidget(RemotePicture old) {
    super.didUpdateWidget(old);
    if (old.url != widget.url || old.controller.api != widget.controller.api) {
      future = widget.controller.image(widget.url);
    }
  }

  @override
  Widget build(BuildContext context) => SizedBox(
    width: widget.width,
    height: widget.height,
    child: FutureBuilder<Uint8List>(
      future: future,
      builder: (context, snapshot) {
        if (snapshot.hasData) {
          return Image.memory(
            snapshot.data!,
            fit: widget.fit,
            semanticLabel: widget.label,
            gaplessPlayback: true,
            errorBuilder: (_, _, _) =>
                const Icon(Icons.broken_image_outlined, color: muted),
          );
        }
        if (snapshot.hasError) {
          return const Center(
            child: Icon(Icons.image_not_supported_outlined, color: muted),
          );
        }
        return const Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        );
      },
    ),
  );
}

class Panel extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;
  const Panel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(18),
  });
  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(20),
      border: Border.all(color: const Color(0xffe8eef1)),
    ),
    child: child,
  );
}

class SectionHeading extends StatelessWidget {
  final String title, subtitle;
  final IconData icon;
  const SectionHeading(this.title, this.subtitle, this.icon, {super.key});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 16),
    child: Row(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: const Color(0xffe9f3fa),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(icon, color: blue, size: 21),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (subtitle.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(
                  subtitle,
                  style: const TextStyle(fontSize: 12, color: muted),
                ),
              ],
            ],
          ),
        ),
      ],
    ),
  );
}

class EmptyState extends StatelessWidget {
  final String title, detail;
  final IconData icon;
  const EmptyState(
    this.title,
    this.detail, {
    super.key,
    this.icon = Icons.water_drop_outlined,
  });
  @override
  Widget build(BuildContext context) => Center(
    child: SingleChildScrollView(
      padding: const EdgeInsets.symmetric(vertical: 42, horizontal: 24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 44, color: blue.withValues(alpha: .5)),
          const SizedBox(height: 18),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 10),
          Text(
            detail,
            textAlign: TextAlign.center,
            style: const TextStyle(color: muted, height: 1.7),
          ),
        ],
      ),
    ),
  );
}

Future<bool> confirm(
  BuildContext context,
  String title,
  String detail, {
  String accept = '确认',
}) async =>
    await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(title),
        content: Text(detail),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('取消'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: Text(accept),
          ),
        ],
      ),
    ) ??
    false;

class VoiceBubble extends StatelessWidget {
  final CompanionController controller;
  final Json attachment;
  final String? fallbackText;
  const VoiceBubble({
    super.key,
    required this.controller,
    required this.attachment,
    this.fallbackText,
  });
  @override
  Widget build(BuildContext context) {
    final current = controller.audioId == attachment['id'];
    final active = current && controller.playing;
    final text = string(attachment['transcript'], fallbackText ?? '');
    final duration = current && controller.audioDuration.inMilliseconds > 0
        ? controller.audioDuration
        : Duration(
            milliseconds: (numeric(attachment['duration']) * 1000).round(),
          );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Material(
          color: const Color(0xffeaf4fb),
          borderRadius: BorderRadius.circular(14),
          child: InkWell(
            borderRadius: BorderRadius.circular(14),
            onTap: () => controller.playAudio(attachment),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    active ? Icons.pause_rounded : Icons.play_arrow_rounded,
                    color: blue,
                    size: 30,
                  ),
                  const SizedBox(width: 6),
                  const Icon(Icons.graphic_eq, color: blue),
                  const SizedBox(width: 10),
                  Text(
                    current && controller.position > Duration.zero
                        ? '${clock(controller.position)} / ${clock(duration)}'
                        : '${duration.inSeconds}″',
                    style: const TextStyle(
                      color: blue,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        if (text.isNotEmpty)
          Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              tilePadding: EdgeInsets.zero,
              childrenPadding: const EdgeInsets.only(bottom: 8),
              dense: true,
              title: const Text(
                '查看文字',
                style: TextStyle(color: muted, fontSize: 12),
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: SelectableText(
                    text,
                    style: const TextStyle(fontSize: 14, height: 1.6),
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
