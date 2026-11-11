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
        padding: const EdgeInsets.all(20),
        children: [
          Text(
            '${string(p['preferredName'], '你')}，今天也来啦。',
            style: const TextStyle(
              fontSize: 25,
              fontWeight: FontWeight.w700,
              letterSpacing: .5,
            ),
          ),
          const SizedBox(height: 8),
          const Text('有话慢慢说，小岛一直在这里。', style: TextStyle(color: muted)),
          const SizedBox(height: 22),
          Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(24),
              gradient: const LinearGradient(
                colors: [Color(0xffe9f3fa), Color(0xfff0edf8)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            padding: const EdgeInsets.all(22),
            child: Column(
              children: [
                Image.asset(
                  'assets/characters/dafeiyu-full-v1.webp',
                  height: 228,
                  fit: BoxFit.contain,
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Text(
                      '大肥鱼',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Chip(
                      label: Text(string(p['mood'], '平静')),
                      visualDensity: VisualDensity.compact,
                      side: BorderSide.none,
                      backgroundColor: Colors.white.withValues(alpha: .75),
                    ),
                  ],
                ),
                Text(
                  string(p['moodReason'], '想听听你今天过得怎么样。'),
                  textAlign: TextAlign.center,
                  style: const TextStyle(height: 1.7, color: muted),
                ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: () => navigate(1),
                  icon: const Icon(Icons.chat_bubble_outline_rounded),
                  label: const Text('和大肥鱼聊一会儿'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          Row(
            children: [
              for (final item in [
                ('聊过的日常', stats['messages']),
                ('记住的小事', stats['memories']),
                ('逛过的见闻', stats['readings']),
              ])
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 3),
                    child: Panel(
                      padding: const EdgeInsets.symmetric(
                        vertical: 16,
                        horizontal: 8,
                      ),
                      child: Column(
                        children: [
                          Text(
                            '${numeric(item.$2)}',
                            style: const TextStyle(
                              fontSize: 24,
                              color: blue,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          const SizedBox(height: 5),
                          Text(
                            item.$1,
                            style: const TextStyle(fontSize: 11, color: muted),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          Panel(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SectionHeading(
                  '慢慢认识的大肥鱼',
                  '从相处中长出来的样子',
                  Icons.auto_awesome_outlined,
                ),
                Text(string(p['summary']), style: const TextStyle(height: 1.7)),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children:
                      (p['interests'] is List ? p['interests'] as List : [])
                          .map(
                            (v) => Chip(
                              label: Text('$v'),
                              side: BorderSide.none,
                              backgroundColor: const Color(0xffedf5f1),
                            ),
                          )
                          .toList(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => navigate(2),
                  icon: const Icon(Icons.explore_outlined),
                  label: const Text('生活足迹'),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () => Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => StickerLibrary(controller: controller),
                    ),
                  ),
                  icon: const Icon(Icons.emoji_emotions_outlined),
                  label: const Text('表情收藏'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
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
        padding: const EdgeInsets.all(20),
        children: [
          const Text(
            '大肥鱼的生活',
            style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          const Text('有自己的好奇，也会把见闻带回来。', style: TextStyle(color: muted)),
          const SizedBox(height: 18),
          FilledButton.tonalIcon(
            onPressed:
                !controller.online || controller.busy || active.isNotEmpty
                ? null
                : () => controller.action('/explore', body: {}),
            icon: const Icon(Icons.explore_outlined),
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
              child: const Text('先休息一下'),
            ),
          const SizedBox(height: 16),
          if (experiences.isEmpty)
            const EmptyState(
              '还没留下足迹',
              '开启喜欢的平台，让大肥鱼自己去看看。',
              icon: Icons.explore_outlined,
            ),
          for (final item in experiences)
            Padding(
              padding: const EdgeInsets.only(bottom: 14),
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
                          color: blue,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            platformNames[item['platform']] ?? '小岛日常',
                            style: const TextStyle(color: muted, fontSize: 12),
                          ),
                        ),
                        Text(
                          timeLabel(item['createdAt']),
                          style: const TextStyle(color: muted, fontSize: 11),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Text(
                      string(item['title']),
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (string(item['reflection']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 10),
                        child: Text(
                          string(item['reflection']),
                          style: const TextStyle(height: 1.7),
                        ),
                      ),
                    if (string(item['description']).isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          string(item['description']),
                          style: const TextStyle(
                            color: muted,
                            fontSize: 13,
                            height: 1.7,
                          ),
                        ),
                      ),
                    if (string(item['excerpt']).isNotEmpty)
                      ExpansionTile(
                        tilePadding: EdgeInsets.zero,
                        title: const Text(
                          '看看读到了什么',
                          style: TextStyle(fontSize: 13, color: blue),
                        ),
                        children: [
                          SelectableText(
                            string(item['excerpt']),
                            style: const TextStyle(fontSize: 13, height: 1.7),
                          ),
                        ],
                      ),
                    if (string(item['url']).isNotEmpty)
                      TextButton.icon(
                        onPressed: () => external(string(item['url'])),
                        icon: const Icon(Icons.open_in_new, size: 15),
                        label: const Text('打开原网页'),
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
      padding: const EdgeInsets.all(20),
      children: [
        const Text(
          '记得的小事',
          style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 8),
        const Text('留不留下，由大肥鱼在相处中自己决定。', style: TextStyle(color: muted)),
        const SizedBox(height: 20),
        TextField(
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.search),
            hintText: '找找那件小事',
          ),
          onChanged: (v) => setState(() => query = v),
        ),
        const SizedBox(height: 20),
        if (items.isEmpty)
          const EmptyState(
            '还在慢慢认识你',
            '聊聊你的日常、偏好和重要的事情。',
            icon: Icons.menu_book_outlined,
          ),
        for (final item in items)
          Padding(
            padding: const EdgeInsets.only(bottom: 14),
            child: Panel(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    categories[item['category']] ?? '小小记忆',
                    style: const TextStyle(color: blue, fontSize: 12),
                  ),
                  const SizedBox(height: 10),
                  SelectableText(
                    string(item['content']),
                    style: const TextStyle(fontSize: 16, height: 1.7),
                  ),
                  const SizedBox(height: 10),
                  Text(
                    '${item['sourceKind'] == 'reading' ? '来自实际阅读' : '从聊天中记住'} · ${timeLabel(item['updatedAt'])}',
                    style: const TextStyle(color: muted, fontSize: 11),
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
        appBar: AppBar(title: const Text('表情收藏')),
        body: ListView(
          padding: const EdgeInsets.all(20),
          children: [
            TextField(
              decoration: const InputDecoration(
                prefixIcon: Icon(Icons.search),
                hintText: '开心、撒娇、震惊……',
              ),
              onChanged: (v) => setState(() => query = v),
            ),
            const SizedBox(height: 12),
            FilledButton.tonalIcon(
              onPressed: c.busy || collecting || !c.online
                  ? null
                  : () => c.action('/stickers/discover'),
              icon: const Icon(Icons.explore_outlined),
              label: Text(collecting ? '正在挑选新表情……' : '找点新表情'),
            ),
            if (items.isEmpty)
              const EmptyState(
                '等着下一份惊喜',
                '大肥鱼会在浏览中自己挑选表情。',
                icon: Icons.emoji_emotions_outlined,
              ),
            const SizedBox(height: 14),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
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
                          child: const Text('素材来源'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: const Text('关闭'),
                        ),
                      ],
                    ),
                  ),
                  child: Panel(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      children: [
                        Expanded(
                          child: RemotePicture(
                            controller: c,
                            url: string(item['imageUrl']),
                            label: string(item['meaning']),
                          ),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          string(item['meaning']),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 12),
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
              child: const Text('清空收藏缓存'),
            ),
          ],
        ),
      );
    },
  );
}
