import 'package:flutter/material.dart';
import 'api.dart';
import 'controller.dart';
import 'widgets.dart';

class IslandPage extends StatelessWidget {
  final CompanionController controller;
  final void Function(int) navigate;
  const IslandPage({
    super.key,
    required this.controller,
    required this.navigate,
  });
  @override
  Widget build(BuildContext context) {
    final p = controller.personality, stats = object(controller.data['stats']);
    return RefreshIndicator(
      onRefresh: () => controller.poll(force: true),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 24),
        children: [
          PageIntro(
            '${string(p['preferredName'], '你')}，今天也来啦。',
            '有话慢慢说，小岛一直在这里。',
          ),
          Panel(
            padding: EdgeInsets.zero,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              '小岛的今天',
                              style: TextStyle(
                                fontSize: 13,
                                color: context.colors.muted,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '大肥鱼',
                              style: Theme.of(context).textTheme.headlineMedium,
                            ),
                          ],
                        ),
                      ),
                      Icon(
                        Icons.waves_rounded,
                        color: context.colors.accent,
                        size: 25,
                      ),
                    ],
                  ),
                ),
                SizedBox(
                  height: 228,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      Positioned(
                        bottom: 0,
                        left: 0,
                        right: 0,
                        height: 66,
                        child: ExcludeSemantics(
                          child: CustomPaint(
                            painter: _TidePainter(
                              context.colors.accent.withValues(alpha: .14),
                            ),
                          ),
                        ),
                      ),
                      Image.asset(
                        'assets/characters/dafeiyu-full-v1.webp',
                        height: 210,
                        fit: BoxFit.contain,
                        semanticLabel: '大肥鱼，蓝色长发的小岛伙伴',
                      ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(22, 16, 22, 22),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.favorite_border_rounded,
                            color: context.colors.accent,
                            size: 18,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              string(p['mood'], '平静'),
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.w600,
                                color: context.colors.ink,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        string(p['moodReason'], '想听听你今天过得怎么样。'),
                        style: TextStyle(
                          fontSize: 16,
                          height: 1.65,
                          color: context.colors.muted,
                        ),
                      ),
                      const SizedBox(height: 20),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () => navigate(1),
                          icon: const Icon(
                            Icons.chat_bubble_outline_rounded,
                            size: 19,
                          ),
                          label: const Text('和大肥鱼聊一会儿'),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text('一起留下的日常', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Panel(
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
            child: Column(
              children: [
                _IslandRow(
                  '聊过的日常',
                  '${numeric(stats['messages'])}',
                  Icons.chat_bubble_outline_rounded,
                  () => navigate(1),
                ),
                const Divider(),
                _IslandRow(
                  '记住的小事',
                  '${numeric(stats['memories'])}',
                  Icons.menu_book_outlined,
                  () => navigate(3),
                ),
                const Divider(),
                _IslandRow(
                  '逛过的见闻',
                  '${numeric(stats['readings'])}',
                  Icons.explore_outlined,
                  () => navigate(2),
                ),
              ],
            ),
          ),
          const SizedBox(height: 28),
          Text('慢慢认识的大肥鱼', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  string(p['summary']),
                  style: const TextStyle(fontSize: 16, height: 1.7),
                ),
                if ((p['interests'] is List ? p['interests'] as List : [])
                    .isNotEmpty) ...[
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final interest in p['interests'] as List)
                        Chip(label: Text('$interest')),
                    ],
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: 18),
          ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 6),
            leading: Icon(
              Icons.emoji_emotions_outlined,
              color: context.colors.accent,
            ),
            title: const Text('表情收藏'),
            subtitle: const Text('开心的时候，总有合适的一张。'),
            trailing: const Icon(Icons.chevron_right_rounded),
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => StickerLibrary(controller: controller),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IslandRow extends StatelessWidget {
  final String title, value;
  final IconData icon;
  final VoidCallback onTap;
  const _IslandRow(this.title, this.value, this.icon, this.onTap);
  @override
  Widget build(BuildContext context) => ListTile(
    contentPadding: EdgeInsets.zero,
    minLeadingWidth: 22,
    leading: Icon(icon, size: 21, color: context.colors.muted),
    title: Text(title, style: const TextStyle(fontSize: 16)),
    trailing: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          value,
          style: TextStyle(fontSize: 16, color: context.colors.muted),
        ),
        const SizedBox(width: 6),
        Icon(
          Icons.chevron_right_rounded,
          color: context.colors.muted,
          size: 19,
        ),
      ],
    ),
    onTap: onTap,
  );
}

class _TidePainter extends CustomPainter {
  final Color color;
  const _TidePainter(this.color);
  @override
  void paint(Canvas canvas, Size size) {
    final pen = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.2;
    for (var i = 0; i < 3; i++) {
      final y = 18.0 + i * 13;
      final path = Path()
        ..moveTo(0, y)
        ..cubicTo(
          size.width * .28,
          y - 18,
          size.width * .65,
          y + 18,
          size.width,
          y - 2,
        );
      canvas.drawPath(path, pen);
    }
  }

  @override
  bool shouldRepaint(covariant _TidePainter oldDelegate) =>
      oldDelegate.color != color;
}

class LifePage extends StatelessWidget {
  final CompanionController controller;
  const LifePage({super.key, required this.controller});
  @override
  Widget build(BuildContext context) {
    final experiences = objects(controller.data['experiences']);
    final active = controller.jobs.where(
      (j) => j['kind'] == 'explore' && j['status'] == 'running',
    );
    return RefreshIndicator(
      onRefresh: () => controller.poll(force: true),
      child: ListView(
        padding: EdgeInsets.fromLTRB(24, 4, 24, 24),
        children: [
          PageIntro('生活足迹', '有自己的好奇，也会把见闻带回来。'),
          FilledButton.tonalIcon(
            onPressed:
                !controller.online || controller.busy || active.isNotEmpty
                ? null
                : () => controller.action('/explore', body: {}),
            icon: Icon(Icons.explore_outlined),
            label: Text(
              active.isNotEmpty
                  ? string(active.first['stage'], '正在逛逛……')
                  : '让大肥鱼去逛逛',
            ),
          ),
          if (active.isNotEmpty)
            TextButton(
              onPressed: () =>
                  controller.action('/jobs/${active.first['id']}/cancel'),
              child: Text('先休息一下'),
            ),
          SizedBox(height: 16),
          if (experiences.isEmpty)
            EmptyState(
              '还没留下足迹',
              '开启喜欢的平台，让大肥鱼自己去看看。',
              icon: Icons.explore_outlined,
            ),
          for (final item in experiences)
            Padding(
              padding: EdgeInsets.only(bottom: 14),
              child: Panel(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Icon(
                          item['lookupStatus'] == 'not-found'
                              ? Icons.search_rounded
                              : Icons.travel_explore,
                          size: 19,
                          color: context.colors.accent,
                        ),
                        SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            platformNames[item['platform']] ?? '小岛日常',
                            style: TextStyle(
                              color: context.colors.muted,
                              fontSize: 12,
                            ),
                          ),
                        ),
                        Text(
                          timeLabel(item['createdAt']),
                          style: TextStyle(
                            color: context.colors.muted,
                            fontSize: 11,
                          ),
                        ),
                      ],
                    ),
                    SizedBox(height: 12),
                    Text(
                      string(item['title']),
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (string(item['reflection']).isNotEmpty)
                      Padding(
                        padding: EdgeInsets.only(top: 10),
                        child: Text(
                          string(item['reflection']),
                          style: TextStyle(height: 1.7),
                        ),
                      ),
                    if (string(item['description']).isNotEmpty)
                      Padding(
                        padding: EdgeInsets.only(top: 8),
                        child: Text(
                          string(item['description']),
                          style: TextStyle(
                            color: context.colors.muted,
                            fontSize: 13,
                            height: 1.7,
                          ),
                        ),
                      ),
                    if (string(item['excerpt']).isNotEmpty)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: Text(
                          '看看读到了什么',
                          style: TextStyle(
                            fontSize: 13,
                            color: context.colors.accent,
                          ),
                        ),
                        children: [
                          SelectableText(
                            string(item['excerpt']),
                            style: TextStyle(fontSize: 13, height: 1.7),
                          ),
                        ],
                      ),
                    if (string(item['url']).isNotEmpty)
                      TextButton.icon(
                        onPressed: () => external(string(item['url'])),
                        icon: Icon(Icons.open_in_new, size: 15),
                        label: Text('打开原网页'),
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

class MemoriesPage extends StatefulWidget {
  final CompanionController controller;
  const MemoriesPage({super.key, required this.controller});
  @override
  State<MemoriesPage> createState() => _MemoriesPageState();
}

class _MemoriesPageState extends State<MemoriesPage> {
  String query = '';
  @override
  Widget build(BuildContext context) {
    final items = objects(
      widget.controller.data['memories'],
    ).where((m) => string(m['content']).contains(query)).toList();
    const categories = {
      'preference': '你的偏好',
      'event': '重要的事',
      'agreement': '我们约好的',
      'identity': '关于你',
      'experience': '大肥鱼的见闻',
    };
    return ListView(
      padding: EdgeInsets.fromLTRB(24, 4, 24, 24),
      children: [
        PageIntro('记得的小事', '有些日常，大肥鱼一直记得。'),
        TextField(
          decoration: InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: '找找那件小事',
          ),
          onChanged: (v) => setState(() => query = v),
        ),
        SizedBox(height: 20),
        if (items.isEmpty)
          EmptyState(
            '还在慢慢认识你',
            '聊聊你的日常、偏好和重要的事情。',
            icon: Icons.menu_book_outlined,
          ),
        for (final item in items)
          Padding(
            padding: EdgeInsets.only(bottom: 14),
            child: Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    categories[item['category']] ?? '小小记忆',
                    style: TextStyle(
                      color: context.colors.accent,
                      fontSize: 12,
                    ),
                  ),
                  SizedBox(height: 10),
                  SelectableText(
                    string(item['content']),
                    style: TextStyle(fontSize: 16, height: 1.7),
                  ),
                  SizedBox(height: 10),
                  Text(
                    '${item['sourceKind'] == 'reading' ? '来自实际阅读' : '从聊天中记住'} · ${timeLabel(item['updatedAt'])}',
                    style: TextStyle(color: context.colors.muted, fontSize: 11),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class StickerLibrary extends StatefulWidget {
  final CompanionController controller;
  const StickerLibrary({super.key, required this.controller});
  @override
  State<StickerLibrary> createState() => _StickerLibraryState();
}

class _StickerLibraryState extends State<StickerLibrary> {
  String query = '';
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: widget.controller,
    builder: (context, _) {
      final c = widget.controller;
      final items = objects(
        c.data['stickers'],
      ).where((s) => '${s['meaning']} ${s['tags']}'.contains(query)).toList();
      final collecting = c.jobs.any(
        (j) => j['kind'] == 'sticker-search' && j['status'] == 'running',
      );
      return Scaffold(
        appBar: AppBar(title: Text('表情收藏')),
        body: ListView(
          padding: EdgeInsets.fromLTRB(24, 4, 24, 24),
          children: [
            TextField(
              decoration: InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '开心、撒娇、震惊……',
              ),
              onChanged: (v) => setState(() => query = v),
            ),
            SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: c.busy || collecting || !c.online
                  ? null
                  : () => c.action('/stickers/discover'),
              icon: Icon(Icons.explore_outlined),
              label: Text(collecting ? '正在挑选新表情……' : '找点新表情'),
            ),
            if (items.isEmpty)
              EmptyState(
                '等着下一份惊喜',
                '大肥鱼会在浏览中自己挑选表情。',
                icon: Icons.emoji_emotions_outlined,
              ),
            SizedBox(height: 14),
            GridView.builder(
              shrinkWrap: true,
              physics: NeverScrollableScrollPhysics(),
              gridDelegate: SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 185,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                mainAxisExtent: 185,
              ),
              itemCount: items.length,
              itemBuilder: (context, i) {
                final item = items[i];
                return InkWell(
                  borderRadius: BorderRadius.circular(18),
                  onTap: () => showDialog(
                    context: context,
                    builder: (context) => AlertDialog(
                      title: Text(string(item['meaning'])),
                      content: SizedBox(
                        width: 280,
                        height: 260,
                        child: RemotePicture(
                          controller: c,
                          url: string(item['imageUrl']),
                        ),
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => external(string(item['sourceUrl'])),
                          child: Text('素材来源'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: Text('关闭'),
                        ),
                      ],
                    ),
                  ),
                  child: Panel(
                    padding: EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Expanded(
                          child: RemotePicture(
                            controller: c,
                            url: string(item['imageUrl']),
                            label: string(item['meaning']),
                          ),
                        ),
                        SizedBox(height: 10),
                        Text(
                          string(item['meaning']),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            TextButton(
              onPressed: c.busy
                  ? null
                  : () async {
                      if (await confirm(
                        context,
                        '清空表情收藏？',
                        '聊天文字保留，图片缓存会删除，以后仍可重新收集。',
                        accept: '清空收藏',
                      )) {
                        await c.action('/stickers', method: 'DELETE');
                      }
                    },
              child: Text('清空收藏缓存'),
            ),
          ],
        ),
      );
    },
  );
}
