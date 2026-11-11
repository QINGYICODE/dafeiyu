import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'api.dart';
import 'chat.dart';
import 'controller.dart';
import 'pages.dart';
import 'settings.dart';
import 'widgets.dart';

class CompanionApp extends StatefulWidget {
  final CompanionController? controller;
  final bool boot;
  const CompanionApp({super.key, this.controller, this.boot = true});
  @override
  State<CompanionApp> createState() => _CompanionAppState();
}

class _CompanionAppState extends State<CompanionApp>
    with WidgetsBindingObserver {
  late final CompanionController c;
  final messenger = GlobalKey<ScaffoldMessengerState>();
  int tab = 1;
  DateTime? lastBack;
  static const labels = ['小岛', '聊天', '生活', '记忆', '设置'];
  static const icons = [
    Icons.home_outlined,
    Icons.chat_bubble_outline_rounded,
    Icons.explore_outlined,
    Icons.menu_book_outlined,
    Icons.tune_rounded,
  ];
  static const selectedIcons = [
    Icons.home_rounded,
    Icons.chat_bubble_rounded,
    Icons.explore,
    Icons.menu_book_rounded,
    Icons.tune_rounded,
  ];

  @override
  void initState() {
    super.initState();
    c = widget.controller ?? CompanionController();
    WidgetsBinding.instance.addObserver(this);
    c.addListener(notices);
    if (widget.boot) unawaited(c.initialize());
  }

  void notices() {
    if (c.notice.isEmpty) return;
    final message = c.notice;
    c.clearNotice();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      messenger.currentState?.hideCurrentSnackBar();
      messenger.currentState?.showSnackBar(SnackBar(content: Text(message)));
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused ||
        state == AppLifecycleState.hidden ||
        state == AppLifecycleState.detached) {
      unawaited(c.background());
    }
    if (state == AppLifecycleState.resumed && c.api != null) {
      unawaited(c.poll(force: true));
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    c.removeListener(notices);
    if (widget.controller == null) c.dispose();
    super.dispose();
  }

  void navigate(int value) {
    unawaited(c.recorder.end(cancel: true));
    FocusManager.instance.primaryFocus?.unfocus();
    setState(() => tab = value);
  }

  void more(String action) {
    if (action == 'new') unawaited(c.action('/conversations'));
    if (action == 'autoplay') {
      unawaited(
        c.action(
          '/settings',
          method: 'PUT',
          body: {
            'voice': {
              'autoplay': object(c.settings['voice'])['autoplay'] != true,
            },
          },
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: '大肥鱼',
    debugShowCheckedModeBanner: false,
    scaffoldMessengerKey: messenger,
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    theme: companionTheme(Brightness.light),
    darkTheme: companionTheme(Brightness.dark),
    themeMode: ThemeMode.system,
    themeAnimationDuration:
        WidgetsBinding
            .instance
            .platformDispatcher
            .accessibilityFeatures
            .disableAnimations
        ? Duration.zero
        : const Duration(milliseconds: 180),
    home: AnimatedBuilder(
      animation: c,
      builder: (context, _) {
        if (c.data.isEmpty) return ConnectionPage(controller: c);
        final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
        final largeText = MediaQuery.textScalerOf(context).scale(12) > 18;
        final wide =
            MediaQuery.sizeOf(context).width >= 840 &&
            MediaQuery.sizeOf(context).height >= 500;
        final contents = IndexedStack(
          index: tab,
          children: [
            IslandPage(controller: c, navigate: navigate),
            ChatPage(controller: c),
            LifePage(controller: c),
            MemoriesPage(controller: c),
            SettingsPage(controller: c),
          ],
        );
        final column = Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 880),
            child: contents,
          ),
        );
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (popped, result) {
            if (popped) return;
            if (tab != 0) {
              navigate(0);
              return;
            }
            if (lastBack != null &&
                DateTime.now().difference(lastBack!).inSeconds < 2) {
              SystemNavigator.pop();
              return;
            }
            lastBack = DateTime.now();
            c.inform('再按一次返回退出大肥鱼。');
          },
          child: Scaffold(
            appBar: AppBar(
              toolbarHeight: largeText ? 80 : 64,
              titleSpacing: 20,
              title: tab == 1
                  ? Row(
                      children: [
                        const Avatar(size: 32),
                        const SizedBox(width: 11),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                '大肥鱼',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w600,
                                  color: context.colors.ink,
                                ),
                              ),
                              Text(
                                c.online
                                    ? string(c.personality['mood'], '平静')
                                    : '连接中断',
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: context.colors.muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : Text(labels[tab]),
              actions: tab == 1
                  ? [
                      IconButton(
                        tooltip: '聊天历史',
                        onPressed: () => conversations(context, c),
                        icon: const Icon(Icons.history_rounded, size: 23),
                      ),
                      PopupMenuButton<String>(
                        tooltip: '更多聊天选项',
                        icon: const Icon(Icons.more_horiz_rounded),
                        onSelected: more,
                        itemBuilder: (_) => [
                          PopupMenuItem(
                            value: 'new',
                            enabled: !c.busy,
                            child: const ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(Icons.add_comment_outlined),
                              title: Text('新聊天'),
                            ),
                          ),
                          PopupMenuItem(
                            value: 'autoplay',
                            child: ListTile(
                              contentPadding: EdgeInsets.zero,
                              leading: Icon(
                                object(c.settings['voice'])['autoplay'] == true
                                    ? Icons.volume_up_outlined
                                    : Icons.volume_off_outlined,
                              ),
                              title: Text(
                                object(c.settings['voice'])['autoplay'] == true
                                    ? '关闭语音自动播放'
                                    : '开启语音自动播放',
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(width: 6),
                    ]
                  : [
                      Padding(
                        padding: const EdgeInsets.only(right: 20),
                        child: Semantics(
                          label: c.online ? '伙伴服务已连接' : '伙伴服务连接中断',
                          child: Icon(
                            c.online
                                ? Icons.cloud_done_outlined
                                : Icons.cloud_off_outlined,
                            size: 20,
                            color: context.colors.muted,
                          ),
                        ),
                      ),
                    ],
            ),
            body: SafeArea(
              top: false,
              bottom: keyboard || wide,
              child: wide
                  ? Row(
                      children: [
                        NavigationRail(
                          selectedIndex: tab,
                          onDestinationSelected: navigate,
                          labelType: NavigationRailLabelType.all,
                          minWidth: 88,
                          destinations: [
                            for (var i = 0; i < labels.length; i++)
                              NavigationRailDestination(
                                icon: Icon(icons[i]),
                                selectedIcon: Icon(selectedIcons[i]),
                                label: Text(labels[i]),
                              ),
                          ],
                        ),
                        Expanded(child: column),
                      ],
                    )
                  : column,
            ),
            bottomNavigationBar: keyboard || wide
                ? null
                : SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(12, 6, 12, 8),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(24),
                        child: NavigationBar(
                          selectedIndex: tab,
                          height: largeText ? 90 : 68,
                          onDestinationSelected: navigate,
                          destinations: [
                            for (var i = 0; i < labels.length; i++)
                              NavigationDestination(
                                icon: Icon(icons[i]),
                                selectedIcon: Icon(selectedIcons[i]),
                                label: labels[i],
                              ),
                          ],
                        ),
                      ),
                    ),
                  ),
          ),
        );
      },
    ),
  );
}

class ConnectionPage extends StatelessWidget {
  final CompanionController controller;
  const ConnectionPage({super.key, required this.controller});
  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: SingleChildScrollView(
          padding: EdgeInsets.all(30),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Avatar(size: 116),
                SizedBox(height: 24),
                Text(
                  '大肥鱼',
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                  ),
                ),
                SizedBox(height: 12),
                Text(
                  controller.connecting ? '正在回到小岛……' : '把今天的日常，说给我听。',
                  style: TextStyle(color: context.colors.muted, fontSize: 16),
                ),
                SizedBox(height: 28),
                if (controller.connecting)
                  CircularProgressIndicator(strokeWidth: 2),
                if (controller.error.isNotEmpty)
                  Padding(
                    padding: EdgeInsets.only(bottom: 18),
                    child: Text(
                      controller.error,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: context.colors.danger,
                        height: 1.7,
                      ),
                    ),
                  ),
                if (!controller.connecting) ...[
                  if (controller.server.isNotEmpty)
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton.icon(
                        onPressed: () => controller.connect(controller.server),
                        icon: Icon(Icons.refresh_rounded),
                        label: Text('重新连接'),
                      ),
                    ),
                  SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => connectionDialog(context, controller),
                      icon: Icon(Icons.dns_outlined),
                      label: Text('连接伙伴服务'),
                    ),
                  ),
                  SizedBox(height: 20),
                  Text(
                    '连接你自己的服务，沿用原来的聊天与记忆。',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      color: context.colors.muted,
                      fontSize: 12,
                      height: 1.8,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
      ),
    ),
  );
}
