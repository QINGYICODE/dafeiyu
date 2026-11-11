import 'dart:async';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'api.dart';
import 'controller.dart';
import 'widgets.dart';

String fileMime(String name) {
  final extension = name.split('.').last.toLowerCase();
  return {
        'png': 'image/png',
        'webp': 'image/webp',
        'gif': 'image/gif',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'wav': 'audio/wav',
        'mp3': 'audio/mpeg',
        'm4a': 'audio/mp4',
        'webm': 'audio/webm',
        'ogg': 'audio/ogg',
        'json': 'application/json',
      }[extension] ??
      'application/octet-stream';
}

Future<Uint8List> pickedBytes(PlatformFile file, int limit) async {
  final length = await file.length();
  if (length != null && length > limit) throw const ApiException('所选文件超过大小限制。');
  final builder = BytesBuilder(copy: false);
  await for (final bytes in file.readAsByteStream()) {
    if (builder.length + bytes.length > limit) {
      throw const ApiException('所选文件超过大小限制。');
    }
    builder.add(bytes);
  }
  return builder.takeBytes();
}

class ChatPage extends StatefulWidget {
  final CompanionController controller;
  const ChatPage({super.key, required this.controller});
  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final editor = TextEditingController(), scroll = ScrollController();
  final focus = FocusNode();
  List<Json> pending = [];
  String mode = 'text', stickerTab = '收藏', conversation = '', messageKey = '';
  double? pressY;
  int? pointer;
  CompanionController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    conversation = string(c.data['activeConversation']);
    c.addListener(update);
    editor.addListener(draftChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) update();
    });
  }

  void draftChanged() {
    if (mounted) setState(() {});
  }

  void update() {
    final nextConversation = string(c.data['activeConversation']);
    final items = c.messages;
    final key =
        '$nextConversation:${items.length}:${items.isEmpty ? '' : '${items.last['id']}:${items.last['status']}'}';
    if (conversation != nextConversation) {
      conversation = nextConversation;
      pending = [];
      editor.clear();
      unawaited(c.recorder.end(cancel: true));
    }
    if (key != messageKey) {
      final bottom =
          !scroll.hasClients ||
          scroll.position.maxScrollExtent - scroll.offset < 130 ||
          messageKey.isEmpty;
      messageKey = key;
      if (bottom) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted && scroll.hasClients) {
            scroll.animateTo(
              scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 240),
              curve: Curves.easeOut,
            );
          }
        });
      }
    }
  }

  @override
  void dispose() {
    c.removeListener(update);
    editor.removeListener(draftChanged);
    editor.dispose();
    scroll.dispose();
    focus.dispose();
    unawaited(c.recorder.end(cancel: true));
    super.dispose();
  }

  Future<void> pickImages({bool sticker = false}) async {
    if (!c.canSend) return;
    await c.recorder.end(cancel: true);
    try {
      final result = await FilePicker.pickFiles(type: FileType.image);
      if (result.isEmpty) return;
      for (final file in result) {
        if (!mounted) return;
        if (pending.length >= 4) {
          c.inform('每条消息最多 4 个附件。');
          break;
        }
        final mime = fileMime(file.name);
        final item = await c.uploadBytes(
          await pickedBytes(file, 12 * 1024 * 1024),
          file.name,
          sticker || mime == 'image/gif' ? 'sticker' : 'image',
          mime,
        );
        if (item != null && mounted) setState(() => pending.add(item));
      }
    } catch (_) {
      c.inform('没有选到可读取的图片，请重试。');
    }
  }

  Future<void> submit() async {
    final text = editor.text;
    final sent = List<Json>.of(pending);
    final done = await c.send(text, sent);
    if (!done || !mounted) return;
    setState(() {
      if (editor.text == text) editor.clear();
      pending.removeWhere((a) => sent.any((s) => s['id'] == a['id']));
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && scroll.hasClients) {
        scroll.animateTo(
          scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 200),
          curve: Curves.easeOut,
        );
      }
    });
  }

  void switchMode(String next) {
    unawaited(c.recorder.end(cancel: true));
    pointer = null;
    focus.unfocus();
    setState(() => mode = next);
  }

  @override
  Widget build(BuildContext context) {
    final messages = c.messages;
    final job = c.chatJob;
    return LayoutBuilder(
      builder: (context, constraints) => Column(
        children: [
          if (!c.online)
            Material(
              color: const Color(0xfffff3df),
              child: ListTile(
                dense: true,
                leading: const Icon(Icons.cloud_off_outlined, size: 18),
                title: const Text(
                  '连接已中断，已有记录仍可查看',
                  style: TextStyle(fontSize: 12),
                ),
                trailing: IconButton(
                  onPressed: () => c.poll(force: true),
                  icon: const Icon(Icons.refresh),
                ),
              ),
            ),
          Expanded(
            child: messages.isEmpty
                ? const EmptyState(
                    '和大肥鱼说句话吧',
                    '文字、表情、图片、语音，都可以。\n视频链接和歌名，直接发在聊天里。',
                    icon: Icons.chat_bubble_outline_rounded,
                  )
                : ListView.builder(
                    controller: scroll,
                    padding: const EdgeInsets.fromLTRB(14, 16, 14, 20),
                    itemCount: messages.length,
                    itemBuilder: (context, i) =>
                        MessageBubble(controller: c, message: messages[i]),
                  ),
          ),
          if (job != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 5),
              child: Row(
                children: [
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 1.5),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      string(job['stage'], '大肥鱼正在输入中……'),
                      style: const TextStyle(fontSize: 11, color: muted),
                    ),
                  ),
                ],
              ),
            ),
          AnimatedBuilder(
            animation: c.recorder,
            builder: (context, _) {
              final r = c.recorder;
              return Container(
                decoration: const BoxDecoration(
                  color: Colors.white,
                  border: Border(top: BorderSide(color: Color(0xffe8eef1))),
                ),
                padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (pending.isNotEmpty)
                      SizedBox(
                        height: 78,
                        child: ListView(
                          scrollDirection: Axis.horizontal,
                          children: pending
                              .map(
                                (a) => Padding(
                                  padding: const EdgeInsets.only(right: 8),
                                  child: Stack(
                                    children: [
                                      ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: RemotePicture(
                                          controller: c,
                                          url: string(a['url']),
                                          width: 72,
                                          height: 72,
                                          fit: BoxFit.cover,
                                        ),
                                      ),
                                      Positioned(
                                        top: 0,
                                        right: 0,
                                        child: IconButton.filledTonal(
                                          visualDensity: VisualDensity.compact,
                                          iconSize: 14,
                                          tooltip: '移除附件',
                                          onPressed: () =>
                                              setState(() => pending.remove(a)),
                                          icon: const Icon(Icons.close),
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              )
                              .toList(),
                        ),
                      ),
                    if (r.recording || r.pending)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              r.cancelling
                                  ? Icons.close_rounded
                                  : Icons.graphic_eq,
                              color: r.cancelling ? Colors.red : blue,
                            ),
                            const SizedBox(width: 8),
                            Flexible(
                              child: Text(
                                r.pending
                                    ? '正在等待麦克风授权……'
                                    : '${clock(Duration(seconds: r.seconds))}  ${r.cancelling ? '松开取消' : '松开发送，上滑取消'}',
                                style: TextStyle(
                                  color: r.cancelling ? Colors.red : blue,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        IconButton(
                          tooltip: mode == 'voice' ? '切换文字输入' : '切换语音输入',
                          onPressed: r.recording
                              ? null
                              : () => switchMode(
                                  mode == 'voice' ? 'text' : 'voice',
                                ),
                          icon: Icon(
                            mode == 'voice'
                                ? Icons.keyboard_outlined
                                : Icons.mic_none_rounded,
                            color: muted,
                          ),
                        ),
                        Expanded(
                          child: mode == 'voice'
                              ? Listener(
                                  onPointerDown:
                                      !c.canSend || pending.isNotEmpty
                                      ? null
                                      : (event) {
                                          pointer = event.pointer;
                                          pressY = event.position.dy;
                                          unawaited(r.begin());
                                        },
                                  onPointerMove: (event) {
                                    if (pointer == event.pointer &&
                                        pressY != null) {
                                      r.slide(pressY! - event.position.dy > 65);
                                    }
                                  },
                                  onPointerUp: (event) {
                                    if (pointer == event.pointer) {
                                      pointer = null;
                                      unawaited(r.end());
                                    }
                                  },
                                  onPointerCancel: (_) {
                                    pointer = null;
                                    unawaited(r.end(cancel: true));
                                  },
                                  child: Semantics(
                                    label: '按住说话',
                                    button: true,
                                    child: Container(
                                      height: 48,
                                      alignment: Alignment.center,
                                      decoration: BoxDecoration(
                                        color: r.cancelling
                                            ? const Color(0xffffe8e5)
                                            : const Color(0xfff1f5f7),
                                        borderRadius: BorderRadius.circular(14),
                                      ),
                                      child: Text(
                                        r.pending
                                            ? '等待授权…'
                                            : r.recording
                                            ? r.cancelling
                                                  ? '松开取消'
                                                  : '松开发送'
                                            : pending.isNotEmpty
                                            ? '先发送待发附件'
                                            : '按住说话',
                                        style: const TextStyle(
                                          fontSize: 15,
                                          fontWeight: FontWeight.w500,
                                        ),
                                      ),
                                    ),
                                  ),
                                )
                              : TextField(
                                  key: const Key('chat-input'),
                                  controller: editor,
                                  focusNode: focus,
                                  minLines: 1,
                                  maxLines: 5,
                                  textInputAction: TextInputAction.newline,
                                  style: const TextStyle(fontSize: 16),
                                  decoration: const InputDecoration(
                                    hintText: '发消息…',
                                    contentPadding: EdgeInsets.symmetric(
                                      vertical: 12,
                                      horizontal: 12,
                                    ),
                                    filled: true,
                                    fillColor: Color(0xfff6f8fa),
                                    border: OutlineInputBorder(
                                      borderSide: BorderSide.none,
                                      borderRadius: BorderRadius.all(
                                        Radius.circular(15),
                                      ),
                                    ),
                                  ),
                                  onTap: () {
                                    if (mode == 'emoji') {
                                      setState(() => mode = 'text');
                                    }
                                  },
                                ),
                        ),
                        IconButton(
                          tooltip: mode == 'emoji' ? '切换文字输入' : '选择表情',
                          onPressed: r.recording || r.pending
                              ? null
                              : () => switchMode(
                                  mode == 'emoji' ? 'text' : 'emoji',
                                ),
                          icon: Icon(
                            mode == 'emoji'
                                ? Icons.keyboard_outlined
                                : Icons.emoji_emotions_outlined,
                            color: mode == 'emoji' ? blue : muted,
                          ),
                        ),
                        IconButton(
                          tooltip: '发送图片',
                          onPressed: c.canSend && !r.recording && !r.pending
                              ? pickImages
                              : null,
                          icon: const Icon(Icons.image_outlined, color: muted),
                        ),
                        if (job != null)
                          IconButton.filled(
                            tooltip: '取消正在生成的回复',
                            onPressed: c.busy
                                ? null
                                : () => c.action('/jobs/${job['id']}/cancel'),
                            icon: const Icon(Icons.stop_rounded),
                          )
                        else if (mode != 'voice')
                          IconButton.filled(
                            tooltip: '发送消息',
                            onPressed:
                                c.canSend &&
                                    (editor.text.trim().isNotEmpty ||
                                        pending.isNotEmpty)
                                ? submit
                                : null,
                            icon: c.busy
                                ? const SizedBox(
                                    width: 17,
                                    height: 17,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(Icons.arrow_upward_rounded),
                          ),
                      ],
                    ),
                    if (c.busy)
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: LinearProgressIndicator(minHeight: 1),
                      ),
                  ],
                ),
              );
            },
          ),
          if (mode == 'emoji')
            stickerInput((constraints.maxHeight * .45).clamp(60.0, 240.0)),
        ],
      ),
    );
  }

  Widget stickerInput(double height) {
    const emoji = [
      '😊',
      '🥰',
      '🥺',
      '😏',
      '😭',
      '😂',
      '🤣',
      '😳',
      '😴',
      '😤',
      '😎',
      '🤔',
      '😱',
      '🙄',
      '😋',
      '🥳',
      '🫶',
      '❤️',
      '✨',
      '🐟',
      '🌊',
      '🍵',
      '👀',
      '👍',
    ];
    final items = objects(c.data['stickers']);
    return Container(
      key: const Key('inline-stickers'),
      height: height,
      color: const Color(0xfff3f7fa),
      child: Column(
        children: [
          Row(
            children: [
              for (final tab in ['收藏', '表情'])
                TextButton(
                  onPressed: () => setState(() => stickerTab = tab),
                  child: Text(
                    tab,
                    style: TextStyle(
                      color: tab == stickerTab ? blue : muted,
                      fontWeight: tab == stickerTab
                          ? FontWeight.w700
                          : FontWeight.normal,
                    ),
                  ),
                ),
              const Spacer(),
              TextButton.icon(
                onPressed: c.canSend ? () => pickImages(sticker: true) : null,
                icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                label: const Text('本机'),
              ),
            ],
          ),
          Expanded(
            child: stickerTab == '表情'
                ? GridView.count(
                    crossAxisCount: 8,
                    children: emoji
                        .map(
                          (v) => InkWell(
                            onTap: () {
                              final selection = editor.selection;
                              final index = selection.isValid
                                  ? selection.start
                                  : editor.text.length;
                              editor.text = editor.text.replaceRange(
                                index,
                                selection.isValid ? selection.end : index,
                                v,
                              );
                              editor.selection = TextSelection.collapsed(
                                offset: index + v.length,
                              );
                            },
                            child: Center(
                              child: Text(
                                v,
                                style: const TextStyle(fontSize: 26),
                              ),
                            ),
                          ),
                        )
                        .toList(),
                  )
                : items.isEmpty
                ? const Center(
                    child: Text(
                      '收藏夹还空着，大肥鱼会慢慢去找。',
                      style: TextStyle(color: muted, fontSize: 13),
                    ),
                  )
                : GridView.builder(
                    gridDelegate:
                        const SliverGridDelegateWithFixedCrossAxisCount(
                          crossAxisCount: 4,
                          mainAxisExtent: 87,
                        ),
                    itemCount: items.length,
                    itemBuilder: (context, i) {
                      final s = items[i];
                      return InkWell(
                        onTap: !c.canSend
                            ? null
                            : () async {
                                if (pending.length >= 4) {
                                  c.inform('每条最多 4 个附件。');
                                  return;
                                }
                                final item = await c.action(
                                  '/media/from-sticker',
                                  body: {'stickerId': s['id']},
                                );
                                if (item != null && mounted) {
                                  setState(() => pending.add(item));
                                }
                              },
                        child: Padding(
                          padding: const EdgeInsets.all(8),
                          child: RemotePicture(
                            controller: c,
                            url: string(s['imageUrl']),
                            label: string(s['meaning']),
                          ),
                        ),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

class MessageBubble extends StatelessWidget {
  final CompanionController controller;
  final Json message;
  const MessageBubble({
    super.key,
    required this.controller,
    required this.message,
  });
  @override
  Widget build(BuildContext context) {
    final mine = message['role'] == 'user';
    final attachments = objects(message['attachments']);
    final sticker = objects(
      controller.data['stickers'],
    ).where((s) => s['id'] == message['stickerId']);
    final voice =
        message['replyMode'] == 'voice' &&
        attachments.any((a) => a['kind'] == 'audio');
    final waiting = message['status'] == 'waiting';
    final text = string(message['content']);
    final max = MediaQuery.sizeOf(context).width * .75;
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: mine
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,
        children: [
          if (!mine) ...[const Avatar(size: 34), const SizedBox(width: 8)],
          Flexible(
            child: ConstrainedBox(
              constraints: BoxConstraints(maxWidth: max),
              child: Column(
                crossAxisAlignment: mine
                    ? CrossAxisAlignment.end
                    : CrossAxisAlignment.start,
                children: [
                  GestureDetector(
                    onLongPress: text.isEmpty
                        ? null
                        : () async {
                            await Clipboard.setData(ClipboardData(text: text));
                            controller.inform('文字已复制。');
                          },
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 15,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: mine ? const Color(0xffe7f2fa) : Colors.white,
                        borderRadius: BorderRadius.circular(17),
                        border: Border.all(color: const Color(0xffe5edf2)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          if (waiting)
                            const Text(
                              '正在输入中……',
                              style: TextStyle(color: muted),
                            )
                          else if (message['status'] != 'complete')
                            Text(
                              string(message['error'], '这条回复已中断。'),
                              style: const TextStyle(color: muted),
                            )
                          else if (text.isNotEmpty && !voice)
                            SelectableText(
                              text,
                              style: const TextStyle(
                                height: 1.65,
                                fontSize: 16,
                              ),
                            ),
                          for (final item in attachments)
                            Padding(
                              padding: const EdgeInsets.only(top: 4),
                              child: item['kind'] == 'audio'
                                  ? VoiceBubble(
                                      controller: controller,
                                      attachment: item,
                                      fallbackText: voice
                                          ? text
                                          : string(message['transcript']),
                                    )
                                  : InkWell(
                                      onTap: () => showDialog(
                                        context: context,
                                        builder: (_) => Dialog(
                                          child: SizedBox(
                                            height:
                                                MediaQuery.sizeOf(
                                                  context,
                                                ).height *
                                                .7,
                                            child: InteractiveViewer(
                                              child: RemotePicture(
                                                controller: controller,
                                                url: string(item['url']),
                                              ),
                                            ),
                                          ),
                                        ),
                                      ),
                                      child: ClipRRect(
                                        borderRadius: BorderRadius.circular(12),
                                        child: RemotePicture(
                                          controller: controller,
                                          url: string(item['url']),
                                          width: 230,
                                          height: 210,
                                          label: '聊天图片',
                                        ),
                                      ),
                                    ),
                            ),
                          if (sticker.isNotEmpty &&
                              sticker.first['available'] == true)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: RemotePicture(
                                controller: controller,
                                url: string(sticker.first['imageUrl']),
                                width: 150,
                                height: 150,
                                label: string(sticker.first['meaning']),
                              ),
                            ),
                          if (numeric(message['missingAttachments']) > 0)
                            const Text(
                              '部分附件已不可用',
                              style: TextStyle(fontSize: 12, color: muted),
                            ),
                          if (string(message['voiceNote']).isNotEmpty)
                            Padding(
                              padding: const EdgeInsets.only(top: 8),
                              child: Text(
                                string(message['voiceNote']),
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: muted,
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        timeLabel(message['createdAt']),
                        style: const TextStyle(fontSize: 10, color: muted),
                      ),
                      if (!mine &&
                          message['status'] == 'complete' &&
                          !voice &&
                          text.isNotEmpty)
                        IconButton(
                          tooltip: '听大肥鱼读这条回复',
                          iconSize: 16,
                          visualDensity: VisualDensity.compact,
                          onPressed: controller.busy
                              ? null
                              : () async {
                                  final item = await controller.action(
                                    '/messages/${message['id']}/voice',
                                  );
                                  if (item != null) {
                                    await controller.playAudio(item);
                                  }
                                },
                          icon: const Icon(
                            Icons.volume_up_outlined,
                            color: muted,
                          ),
                        ),
                      if (RegExp(r'https?://[^\s]+').hasMatch(text))
                        IconButton(
                          tooltip: '打开消息中的链接',
                          iconSize: 16,
                          visualDensity: VisualDensity.compact,
                          onPressed: () => external(
                            RegExp(
                              r'https?://[^\s]+',
                            ).firstMatch(text)!.group(0)!,
                          ),
                          icon: const Icon(Icons.open_in_new, color: muted),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

Future<void> conversations(BuildContext context, CompanionController c) =>
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => FractionallySizedBox(
        heightFactor: .72,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.all(20),
              child: Row(
                children: [
                  const Expanded(
                    child: Text(
                      '聊过的日常',
                      style: TextStyle(
                        fontSize: 19,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  FilledButton.tonalIcon(
                    onPressed: c.busy
                        ? null
                        : () async {
                            final item = await c.action('/conversations');
                            if (item != null && context.mounted) {
                              Navigator.pop(context);
                            }
                          },
                    icon: const Icon(Icons.add),
                    label: const Text('新聊天'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                children: objects(c.data['conversations'])
                    .map(
                      (item) => ListTile(
                        selected: item['id'] == c.data['activeConversation'],
                        leading: const Icon(Icons.chat_bubble_outline),
                        title: Text(
                          string(item['title']),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(timeLabel(item['updatedAt'])),
                        onTap: () async {
                          await c.action(
                            '/conversations/active',
                            method: 'PUT',
                            body: {'id': item['id']},
                          );
                          if (context.mounted) Navigator.pop(context);
                        },
                        trailing: IconButton(
                          tooltip: '删除聊天',
                          icon: const Icon(Icons.delete_outline, size: 20),
                          onPressed: () async {
                            if (await confirm(
                              context,
                              '删除这段聊天？',
                              '会删除这段聊天和附件，已经形成的记忆不会被移除。',
                              accept: '删除',
                            )) {
                              await c.action(
                                '/conversations/${item['id']}',
                                method: 'DELETE',
                              );
                              if (context.mounted) Navigator.pop(context);
                            }
                          },
                        ),
                      ),
                    )
                    .toList(),
              ),
            ),
          ],
        ),
      ),
    );
