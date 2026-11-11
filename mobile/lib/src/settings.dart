import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'api.dart';
import 'chat.dart';
import 'controller.dart';
import 'pages.dart';
import 'widgets.dart';

Future<void> connectionDialog(
  BuildContext context,
  CompanionController c,
) async {
  final input = TextEditingController(text: c.server);
  final form = GlobalKey<FormState>();
  final address = await showDialog<String>(
    context: context,
    builder: (context) => AlertDialog(
      scrollable: true,
      title: Text('连接你的小岛'),
      content: Form(
        key: form,
        child: SizedBox(
          width: 360,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                '输入伙伴服务的 HTTPS 首页。Flutter 客户端会沿用这个服务中的聊天、记忆和账号。',
                style: TextStyle(height: 1.6),
              ),
              SizedBox(height: 18),
              TextFormField(
                key: Key('server-address'),
                controller: input,
                keyboardType: TextInputType.url,
                autocorrect: false,
                decoration: InputDecoration(
                  labelText: '服务地址',
                  hintText: 'https://example.com:38413',
                ),
                validator: (v) {
                  try {
                    serverOrigin(v ?? '');
                    return null;
                  } catch (e) {
                    return e.toString();
                  }
                },
              ),
              SizedBox(height: 12),
              Text(
                '不需要在这里填写 API Key。服务需保持运行。',
                style: TextStyle(fontSize: 12, color: context.colors.muted),
              ),
            ],
          ),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text('取消')),
        FilledButton(
          onPressed: () {
            if (form.currentState!.validate()) {
              Navigator.pop(context, input.text);
            }
          },
          child: Text('保存并连接'),
        ),
      ],
    ),
  );
  input.dispose();
  if (address != null) {
    try {
      await c.connect(address);
    } catch (e) {
      c.inform(e.toString());
    }
  }
}

class SettingsPage extends StatefulWidget {
  final CompanionController controller;
  const SettingsPage({super.key, required this.controller});
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  Json draft = {};
  String apiKey = '', transcript = '';
  bool dirty = false;
  int epoch = 0;
  CompanionController get c => widget.controller;
  @override
  void initState() {
    super.initState();
    load();
    c.addListener(syncSettings);
  }

  void syncSettings() {
    if (!dirty && mounted && jsonEncode(draft) != jsonEncode(c.settings)) {
      setState(load);
    }
  }

  @override
  void dispose() {
    c.removeListener(syncSettings);
    super.dispose();
  }

  void load() {
    draft = object(jsonDecode(jsonEncode(c.settings)));
    dirty = false;
    apiKey = '';
    epoch++;
  }

  Json group(String name) => object(draft[name]);
  dynamic value(String groupName, String key) => group(groupName)[key];
  void change(String groupName, String key, dynamic next) => setState(() {
    draft[groupName] = {...group(groupName), key: next};
    dirty = true;
  });
  Widget field(
    String groupName,
    String key,
    String title, {
    String? helper,
    bool number = false,
    bool secret = false,
    int lines = 1,
  }) => Padding(
    padding: EdgeInsets.only(bottom: 15),
    child: TextFormField(
      key: ValueKey('$epoch:$groupName:$key'),
      initialValue: '${value(groupName, key) ?? ''}',
      obscureText: secret,
      maxLines: secret ? 1 : lines,
      style: const TextStyle(fontSize: 17),
      keyboardType: number ? TextInputType.number : TextInputType.text,
      decoration: InputDecoration(
        labelText: title,
        helperText: helper,
        helperMaxLines: 3,
      ),
      onChanged: (v) =>
          change(groupName, key, number ? num.tryParse(v) ?? 0 : v),
    ),
  );
  Widget toggle(String groupName, String key, String title, String detail) =>
      SwitchListTile.adaptive(
        contentPadding: EdgeInsets.zero,
        title: Text(title, style: TextStyle(fontSize: 15)),
        subtitle: Text(
          detail,
          style: TextStyle(
            color: context.colors.muted,
            fontSize: 12,
            height: 1.5,
          ),
        ),
        value: value(groupName, key) == true,
        onChanged: (v) => change(groupName, key, v),
      );
  Widget select(
    String groupName,
    String key,
    String title,
    Map<String, String> choices,
  ) {
    final current = string(value(groupName, key));
    final entries = {
      ...choices,
      if (current.isNotEmpty && !choices.containsKey(current))
        current: '$current（当前配置）',
    };
    return Padding(
      padding: EdgeInsets.only(bottom: 15),
      child: DropdownButtonFormField<String>(
        key: ValueKey('$epoch:$groupName:$key:$current'),
        initialValue: current.isEmpty ? null : current,
        isExpanded: true,
        decoration: InputDecoration(labelText: title),
        items: entries.entries
            .map(
              (e) => DropdownMenuItem(
                value: e.key,
                child: Text(
                  e.value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            )
            .toList(),
        onChanged: (v) {
          if (v != null) change(groupName, key, v);
        },
      ),
    );
  }

  Widget section(
    String title,
    String subtitle,
    IconData icon,
    List<Widget> children,
  ) {
    if (title == '伙伴服务' || title == '大肥鱼的声音') {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Panel(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [SectionHeading(title, subtitle, icon), ...children],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Panel(
        padding: EdgeInsets.zero,
        child: ExpansionTile(
          maintainState: true,
          tilePadding: const EdgeInsets.fromLTRB(18, 12, 16, 0),
          childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
          title: SectionHeading(title, subtitle, icon),
          children: children,
        ),
      ),
    );
  }

  Future<void> guarded(Future<void> Function() operation) async {
    try {
      await operation();
    } catch (error) {
      c.inform(error.toString());
    }
  }

  Future<void> save() async {
    final result = await c.action(
      '/settings',
      method: 'PUT',
      body: {...draft, if (apiKey.trim().isNotEmpty) 'apiKey': apiKey.trim()},
      success: '连接与偏好已保存。',
    );
    if (result != null && mounted) setState(load);
  }

  Future<void> preview() async {
    final item = await c.action('/voice/preview');
    if (item != null) await c.playAudio(item);
  }

  Future<void> testRecognition() async {
    final picked = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['wav', 'mp3', 'm4a', 'webm', 'ogg'],
    );
    if (picked == null) return;
    final file = picked;
    final media = await c.uploadBytes(
      await pickedBytes(file, 12 * 1024 * 1024),
      file.name,
      'audio',
      fileMime(file.name),
    );
    if (media == null) return;
    final result = await c.action(
      '/speech/test',
      body: {'mediaId': media['id']},
    );
    if (result != null && mounted) {
      setState(() => transcript = string(result['transcript']));
    }
  }

  Future<void> cloneVoice({bool reference = false}) async {
    Json body = {'useReference': true};
    if (!reference) {
      final picked = await FilePicker.pickFile(
        type: FileType.custom,
        allowedExtensions: ['wav', 'mp3', 'm4a'],
      );
      if (picked == null) return;
      final file = picked;
      body = {
        'audio': base64Encode(await pickedBytes(file, 4 * 1024 * 1024)),
        'replace': true,
      };
    }
    await c.action('/speech/clone', body: body, success: '音色已提交，请查看实际状态。');
  }

  Future<void> exportBackup() async {
    try {
      final data = await c.api!.call('/api/backup');
      final saved = await FilePicker.saveFile(
        dialogTitle: '保存大肥鱼备份',
        fileName:
            '大肥鱼备份-${DateTime.now().toIso8601String().split('T').first}.json',
        mimeType: 'application/json',
        bytes: Uint8List.fromList(utf8.encode(jsonEncode(data))),
      );
      if (saved != null) c.inform('备份已保存。');
    } catch (e) {
      c.inform('备份未能保存：$e');
    }
  }

  Future<void> importBackup() async {
    final file = await FilePicker.pickFile(
      type: FileType.custom,
      allowedExtensions: ['json'],
    );
    if (file == null) return;
    if (!mounted ||
        !await confirm(
          context,
          '恢复这份备份？',
          '会替换当前聊天、记忆和成长记录。建议先导出当前备份。',
          accept: '恢复备份',
        )) {
      return;
    }
    try {
      final data = object(
        jsonDecode(utf8.decode(await pickedBytes(file, 8 * 1024 * 1024))),
      );
      await c.action('/backup/import', body: data, success: '备份已恢复。');
    } catch (_) {
      c.inform('备份格式无法读取。');
    }
  }

  Future<void> reset() async {
    final input = TextEditingController();
    bool include = false;
    if (!mounted) return;
    final result = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, local) => AlertDialog(
          scrollable: true,
          title: Text('清空这座小岛？'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('聊天、记忆、性格成长与媒体缓存会清除，无法撤销。请先导出备份。'),
              SizedBox(height: 16),
              TextField(
                controller: input,
                onChanged: (_) => local(() {}),
                decoration: InputDecoration(labelText: '输入「清空数据」确认'),
              ),
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                value: include,
                onChanged: (v) => local(() => include = v ?? false),
                title: Text('同时清除连接配置并断开 B 站', style: TextStyle(fontSize: 13)),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text('保留数据'),
            ),
            FilledButton(
              onPressed: input.text == '清空数据'
                  ? () => Navigator.pop(context, true)
                  : null,
              child: Text('确认清空'),
            ),
          ],
        ),
      ),
    );
    input.dispose();
    if (result == true) {
      await c.action(
        '/reset',
        body: {'confirm': '清空数据', 'includeSettings': include},
      );
      if (mounted) setState(load);
    }
  }

  @override
  Widget build(BuildContext context) {
    final capability = object(c.data['capabilities']);
    final cloud = object(capability['cloudSpeech']),
        clone = object(cloud['clone']);
    final voice = object(capability['voice']);
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
            children: [
              const PageIntro('连接与偏好', '让相处，保持舒服的样子。'),
              section('伙伴服务', '换一台手机，也能接着聊。', Icons.phone_android, [
                Text(
                  c.server,
                  style: TextStyle(color: context.colors.muted, fontSize: 13),
                ),
                SizedBox(height: 10),
                Text(
                  '手机与网页版共用伙伴服务。聊天、记忆和冲浪由服务保存和运行，厂商密钥留在服务端。',
                  style: TextStyle(fontSize: 13, height: 1.6),
                ),
                SizedBox(height: 10),
                OutlinedButton.icon(
                  onPressed: () => connectionDialog(context, c),
                  icon: Icon(Icons.dns_outlined),
                  label: Text('修改服务地址'),
                ),
                Text(
                  '大肥鱼 Android · 0.3.0',
                  style: TextStyle(fontSize: 12, color: context.colors.muted),
                ),
              ]),
              BilibiliPanel(controller: c),
              SizedBox(height: 18),
              section(
                '连接大模型',
                object(c.settings['model'])['keyConfigured'] == true
                    ? '服务端密钥已配置'
                    : '等待配置模型',
                Icons.auto_awesome_outlined,
                [
                  if (object(c.settings['model'])['keySource'] == 'environment')
                    Padding(
                      padding: EdgeInsets.only(bottom: 16),
                      child: Text(
                        '正在使用服务端环境变量 DEEPSEEK_KEY',
                        style: TextStyle(
                          color: context.colors.accent,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  select('model', 'provider', '服务商', {
                    'deepseek': 'DeepSeek',
                    'compatible': '兼容接口',
                  }),
                  field('model', 'name', '对话模型名称'),
                  field('model', 'baseUrl', '模型接口地址'),
                  Padding(
                    padding: EdgeInsets.only(bottom: 12),
                    child: TextFormField(
                      key: ValueKey('secret-$epoch'),
                      obscureText: true,
                      autocorrect: false,
                      enableSuggestions: false,
                      decoration: InputDecoration(
                        labelText: 'API Key',
                        helperText: '留空保留现有密钥，仅通过 HTTPS 发送到服务端',
                      ),
                      onChanged: (v) {
                        apiKey = v;
                        setState(() => dirty = true);
                      },
                    ),
                  ),
                  toggle('model', 'visionEnabled', '图片理解', '让大肥鱼理解图片与表情'),
                  if (value('model', 'visionEnabled') == true)
                    field('model', 'visionName', '图片理解模型'),
                  toggle('model', 'jsonMode', 'JSON 输出模式', '供后台状态分析使用'),
                  OutlinedButton.icon(
                    onPressed: c.busy || dirty
                        ? null
                        : () => c.action('/model/test', success: '模型连接成功。'),
                    icon: Icon(Icons.link),
                    label: Text('测试模型连接'),
                  ),
                ],
              ),
              section(
                '百炼语音服务',
                cloud['keyConfigured'] == true
                    ? '服务端已读取 ${cloud['keySource']}'
                    : '服务端尚未配置百炼密钥',
                Icons.cloud_outlined,
                [
                  select('cloudSpeech', 'region', '服务地域', {
                    'beijing': '华北 2 · 北京',
                    'singapore': '新加坡',
                  }),
                  field('cloudSpeech', 'workspaceId', '业务空间 ID（选填）'),
                  toggle(
                    'cloudSpeech',
                    'asrEnabled',
                    '百炼语音识别',
                    '完整识别后再交给大肥鱼回复',
                  ),
                  field('cloudSpeech', 'asrModel', '识别模型'),
                  select('cloudSpeech', 'language', '识别语言', {
                    'auto': '自动识别 / 中英混说',
                    'zh': '普通话',
                    'yue': '粤语',
                    'en': '英语',
                  }),
                  field(
                    'cloudSpeech',
                    'hotwords',
                    '常用词提示',
                    lines: 2,
                    helper: '常用称呼、游戏名和专有名词，不保证每次准确',
                  ),
                  OutlinedButton.icon(
                    onPressed: c.busy || dirty || cloud['keyConfigured'] != true
                        ? null
                        : () => guarded(testRecognition),
                    icon: Icon(Icons.mic_none),
                    label: Text('选择录音测试识别'),
                  ),
                  if (transcript.isNotEmpty)
                    Padding(
                      padding: EdgeInsets.symmetric(vertical: 12),
                      child: SelectableText(
                        '实际识别结果\n$transcript',
                        style: TextStyle(height: 1.7),
                      ),
                    ),
                  toggle(
                    'cloudSpeech',
                    'ttsEnabled',
                    '百炼语音合成',
                    '回复完整生成后，再发送语音气泡',
                  ),
                  select('cloudSpeech', 'ttsModel', '云端合成模型', {
                    'cosyvoice-v3-flash': 'CosyVoice v3 · 龙呼呼',
                    'qwen-audio-3.1-tts-flash': 'Qwen Audio 3.1 Flash',
                    'qwen-audio-3.1-tts-plus': 'Qwen Audio 3.1 Plus',
                  }),
                  field(
                    'cloudSpeech',
                    'voiceId',
                    '云端音色 ID',
                    helper:
                        value('cloudSpeech', 'ttsModel') == 'cosyvoice-v3-flash'
                        ? '龙呼呼：longhuhu_v3，使用系统音色，无需复刻。'
                        : '音色须与模型匹配',
                  ),
                  if (value('cloudSpeech', 'ttsModel') !=
                      'cosyvoice-v3-flash') ...[
                    OutlinedButton(
                      onPressed: c.busy || dirty
                          ? null
                          : () => c.action(
                              '/speech/clone/check',
                              body: {
                                'voiceId': value('cloudSpeech', 'voiceId'),
                              },
                            ),
                      child: Text('验证已有复刻音色'),
                    ),
                    ExpansionTile(
                      tilePadding: EdgeInsets.zero,
                      title: Text('参考录音与声音复刻', style: TextStyle(fontSize: 15)),
                      children: [
                        Text(
                          '10–30 秒清晰单人录音，4 MB 以内。创建会把录音上传百炼，费用与审核以厂商规则为准。',
                          style: TextStyle(
                            color: context.colors.muted,
                            fontSize: 12,
                            height: 1.7,
                          ),
                        ),
                        SizedBox(height: 10),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            OutlinedButton(
                              onPressed: c.busy || dirty
                                  ? null
                                  : () => guarded(cloneVoice),
                              child: Text('选择录音并创建'),
                            ),
                            if (cloud['referenceAvailable'] == true)
                              OutlinedButton(
                                onPressed: c.busy || dirty
                                    ? null
                                    : () => cloneVoice(reference: true),
                                child: Text('使用已有参考录音'),
                              ),
                          ],
                        ),
                      ],
                    ),
                    if (clone.isNotEmpty) ...[
                      Text(
                        '音色状态：${clone['status']}',
                        style: TextStyle(color: context.colors.accent),
                      ),
                      SizedBox(height: 8),
                      SelectableText(
                        string(clone['voiceId']),
                        style: TextStyle(
                          fontSize: 12,
                          color: context.colors.muted,
                        ),
                      ),
                      Wrap(
                        spacing: 8,
                        children: [
                          TextButton(
                            onPressed: c.busy || dirty
                                ? null
                                : () => c.action('/speech/clone/check'),
                            child: Text('更新状态'),
                          ),
                          TextButton(
                            onPressed:
                                clone['status'] == 'OK' &&
                                    clone['compatible'] == true
                                ? () {
                                    change(
                                      'cloudSpeech',
                                      'voiceId',
                                      clone['voiceId'],
                                    );
                                    change('cloudSpeech', 'ttsEnabled', true);
                                  }
                                : null,
                            child: Text('使用这个音色'),
                          ),
                        ],
                      ),
                    ],
                  ],
                  if (dirty)
                    Text(
                      '先保存，再测试或试听。',
                      style: TextStyle(
                        color: context.colors.muted,
                        fontSize: 12,
                      ),
                    ),
                ],
              ),
              section('大肥鱼的声音', '有时候打字，有时候亲口说', Icons.volume_up_outlined, [
                toggle('voice', 'enabled', '开启语音回复', '较长回复或合成失败时保留文字'),
                select('voice', 'mode', '回复方式', {
                  'auto': '由大肥鱼自己决定',
                  'voice': '短消息尽量用语音',
                }),
                if (value('cloudSpeech', 'ttsEnabled') != true)
                  select('voice', 'speaker', '本地声音', {
                    for (final item in objects(voice['voices']))
                      string(item['id']): string(item['name']),
                  }),
                field(
                  'voice',
                  'rate',
                  '语速百分比',
                  number: true,
                  helper: '-20 至 20，负数更舒缓',
                ),
                toggle('voice', 'autoplay', '自动播放新语音', '只播放新到的语音，不重播历史消息'),
                OutlinedButton.icon(
                  onPressed: c.busy || dirty ? null : preview,
                  icon: Icon(Icons.play_arrow),
                  label: Text('听听这个声音'),
                ),
              ]),
              section('允许去逛的地方', '只从开启的来源阅读与收集', Icons.explore_outlined, [
                for (final entry in platformNames.entries)
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    title: Text(entry.value),
                    value:
                        object(group('platforms')[entry.key])['enabled'] ==
                        true,
                    onChanged: (v) =>
                        change('platforms', entry.key, {'enabled': v}),
                    subtitle: Text(
                      string(
                        object(
                          object(c.data['platforms'])[entry.key],
                        )['message'],
                      ),
                      style: TextStyle(
                        fontSize: 12,
                        color: context.colors.muted,
                      ),
                    ),
                    secondary: IconButton(
                      tooltip: '检查可读性',
                      onPressed:
                          c.busy ||
                              dirty ||
                              object(
                                    group('platforms')[entry.key],
                                  )['enabled'] !=
                                  true
                          ? null
                          : () => c.action('/platforms/${entry.key}/test'),
                      icon: Icon(Icons.refresh, size: 18),
                    ),
                  ),
              ]),
              section('好奇与自主冲浪', '记忆和性格，由经历慢慢形成', Icons.waves_outlined, [
                toggle(
                  'discovery',
                  'onUnfamiliar',
                  '遇到不懂的去查查',
                  '查到与没查到的都会留在冲浪记录',
                ),
                toggle('discovery', 'learnMemes', '闲逛时学点新梗', '从已开启的来源找资料'),
                toggle('autonomy', 'enabled', '开启自主冲浪', '伙伴服务在线时按兴趣探索'),
                field('autonomy', 'intervalMinutes', '探索间隔（分钟）', number: true),
                field('autonomy', 'maxRunsPerDay', '每日最多探索次数', number: true),
                field('autonomy', 'maxItemsPerRun', '每次最多阅读条数', number: true),
                field('autonomy', 'quietStart', '安静时段开始（HH:mm）'),
                field('autonomy', 'quietEnd', '安静时段结束（HH:mm）'),
              ]),
              section(
                '表情包小习惯',
                '自己收集，在合适的时候发送',
                Icons.emoji_emotions_outlined,
                [
                  toggle('stickers', 'collect', '自动收藏表情', '从实际浏览取得的素材筛选'),
                  toggle('stickers', 'send', '聊天时发送表情', '每条完整回复最多一张'),
                  field('stickers', 'limit', '收藏上限（张）', number: true),
                  field('stickers', 'cooldown', '同一表情间隔（轮）', number: true),
                  OutlinedButton(
                    onPressed: () => Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => StickerLibrary(controller: c),
                      ),
                    ),
                    child: Text('打开表情收藏'),
                  ),
                ],
              ),
              section('小岛的数据', '记录保存在已连接的伙伴服务', Icons.shield_outlined, [
                Text(
                  '备份包含文字、记忆与成长状态，不包含密钥和媒体文件。',
                  style: TextStyle(
                    fontSize: 12,
                    color: context.colors.muted,
                    height: 1.7,
                  ),
                ),
                SizedBox(height: 12),
                Wrap(
                  spacing: 8,
                  children: [
                    OutlinedButton.icon(
                      onPressed: c.busy ? null : () => guarded(exportBackup),
                      icon: Icon(Icons.download),
                      label: Text('导出备份'),
                    ),
                    OutlinedButton.icon(
                      onPressed: c.busy ? null : () => guarded(importBackup),
                      icon: Icon(Icons.upload),
                      label: Text('恢复备份'),
                    ),
                  ],
                ),
                TextButton(
                  onPressed: c.busy ? null : reset,
                  child: Text(
                    '清空服务端数据',
                    style: TextStyle(color: context.colors.danger),
                  ),
                ),
              ]),
            ],
          ),
        ),
        if (dirty)
          Container(
            color: context.colors.surface,
            padding: EdgeInsets.symmetric(horizontal: 20, vertical: 10),
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: c.busy || !dirty ? null : save,
              icon: Icon(Icons.check),
              label: Text(c.busy ? '正在保存……' : '保存连接与偏好'),
            ),
          ),
      ],
    );
  }
}

class BilibiliPanel extends StatelessWidget {
  final CompanionController controller;
  const BilibiliPanel({super.key, required this.controller});
  @override
  Widget build(BuildContext context) {
    final c = controller,
        account = object(object(controller.data['accounts'])['bilibili']);
    final preferences = object(account['preferences']),
        profile = object(account['profile']);
    final connected = account['connected'] == true;
    return Panel(
      padding: EdgeInsets.zero,
      child: ExpansionTile(
        maintainState: true,
        tilePadding: const EdgeInsets.fromLTRB(18, 12, 16, 0),
        childrenPadding: const EdgeInsets.fromLTRB(18, 0, 18, 18),
        title: SectionHeading(
          '大肥鱼的 B 站账号',
          connected
              ? '已连接 ${string(profile['name'])}'
              : string(account['message'], '还没有连接账号'),
          Icons.live_tv_outlined,
        ),
        children: [
          if (connected) ...[
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text('使用登录状态浏览', style: TextStyle(fontSize: 15)),
              value: preferences['useForBrowsing'] == true,
              onChanged: (v) => c.action(
                '/accounts/bilibili/preferences',
                method: 'PUT',
                body: {...preferences, 'useForBrowsing': v},
              ),
            ),
            SwitchListTile.adaptive(
              contentPadding: EdgeInsets.zero,
              title: Text('阅读关注动态', style: TextStyle(fontSize: 15)),
              value: preferences['useFollowingFeed'] == true,
              onChanged: (v) => c.action(
                '/accounts/bilibili/preferences',
                method: 'PUT',
                body: {...preferences, 'useFollowingFeed': v},
              ),
            ),
            Wrap(
              spacing: 8,
              children: [
                OutlinedButton(
                  onPressed: c.busy
                      ? null
                      : () => c.action('/accounts/bilibili/check'),
                  child: Text('检查登录状态'),
                ),
                OutlinedButton(
                  onPressed: c.busy
                      ? null
                      : () async {
                          final result = await c.action(
                            '/accounts/bilibili/feed',
                            method: 'GET',
                          );
                          if (result != null && context.mounted) {
                            await showModalBottomSheet(
                              context: context,
                              useSafeArea: true,
                              isScrollControlled: true,
                              builder: (context) => FractionallySizedBox(
                                heightFactor: .7,
                                child: ListView(
                                  padding: EdgeInsets.all(20),
                                  children: [
                                    Text(
                                      '关注动态',
                                      style: TextStyle(
                                        fontSize: 20,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                    if (objects(result['items']).isEmpty)
                                      EmptyState(
                                        '这次没有读到动态',
                                        '可能暂时没有新内容，也可能受平台限制。',
                                      ),
                                    for (final item in objects(result['items']))
                                      ListTile(
                                        title: Text(string(item['title'])),
                                        subtitle: Text(string(item['author'])),
                                        onTap: () =>
                                            external(string(item['url'])),
                                      ),
                                  ],
                                ),
                              ),
                            );
                          }
                        },
                  child: Text('看看关注动态'),
                ),
              ],
            ),
            TextButton(
              onPressed: c.busy
                  ? null
                  : () async {
                      if (await confirm(
                        context,
                        '断开 B 站账号？',
                        '将清除服务端保存的登录会话。',
                        accept: '断开连接',
                      )) {
                        await c.action('/accounts/bilibili', method: 'DELETE');
                      }
                    },
              child: Text(
                '断开账号',
                style: TextStyle(color: context.colors.danger),
              ),
            ),
          ] else
            FilledButton.tonalIcon(
              onPressed: c.busy
                  ? null
                  : () async {
                      final login = await c.action('/accounts/bilibili/login');
                      if (login != null && context.mounted) {
                        await showDialog(
                          context: context,
                          builder: (_) =>
                              BilibiliLogin(controller: c, initial: login),
                        );
                      }
                    },
              icon: Icon(Icons.qr_code),
              label: Text('扫码连接 B 站'),
            ),
          Text(
            '目前支持浏览与关注动态，不会自动投稿、评论或私信。',
            style: TextStyle(
              color: context.colors.muted,
              fontSize: 12,
              height: 1.6,
            ),
          ),
        ],
      ),
    );
  }
}

class BilibiliLogin extends StatefulWidget {
  final CompanionController controller;
  final Json initial;
  const BilibiliLogin({
    super.key,
    required this.controller,
    required this.initial,
  });
  @override
  State<BilibiliLogin> createState() => _BilibiliLoginState();
}

class _BilibiliLoginState extends State<BilibiliLogin> {
  late Json login;
  Timer? timer;
  bool polling = false, complete = false;
  String error = '';
  @override
  void initState() {
    super.initState();
    login = widget.initial;
    timer = Timer.periodic(Duration(seconds: 2), (_) => poll());
  }

  Future<void> poll() async {
    if (polling || complete) return;
    polling = true;
    try {
      final result = await widget.controller.api!.call(
        '/api/accounts/bilibili/login/${widget.initial['id']}',
      );
      if (!mounted) return;
      setState(() {
        login = {...login, ...result};
        error = '';
      });
      if (result['status'] == 'connected') {
        complete = true;
        timer?.cancel();
        await widget.controller.poll(force: true);
        if (mounted) Navigator.pop(context);
      }
      if (result['status'] == 'expired') timer?.cancel();
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      polling = false;
    }
  }

  @override
  void dispose() {
    timer?.cancel();
    if (!complete) {
      unawaited(
        widget.controller.api!
            .call(
              '/api/accounts/bilibili/login/${widget.initial['id']}',
              method: 'DELETE',
            )
            .catchError((_) => <String, dynamic>{}),
      );
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    Uint8List? image;
    try {
      image = Uri.parse(string(login['qrImage'])).data?.contentAsBytes();
    } catch (_) {}
    return AlertDialog(
      scrollable: true,
      title: Text('连接 B 站账号'),
      content: SizedBox(
        width: 290,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (image != null) Image.memory(image, width: 240, height: 240),
            SizedBox(height: 14),
            Text(
              login['status'] == 'scanned'
                  ? '已扫码，请在 B 站 App 确认。'
                  : login['status'] == 'expired'
                  ? '二维码已过期，请关闭后重新获取。'
                  : '使用 B 站 App 扫码，也可截图后从扫一扫的相册中识别。',
              textAlign: TextAlign.center,
              style: TextStyle(height: 1.7),
            ),
            if (error.isNotEmpty)
              Text(
                error,
                style: TextStyle(color: context.colors.muted, fontSize: 12),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: Text('关闭')),
      ],
    );
  }
}
