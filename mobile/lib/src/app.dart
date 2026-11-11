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
      if (mounted) {
        messenger.currentState?.hideCurrentSnackBar();
        messenger.currentState?.showSnackBar(
          SnackBar(content: Text(message), behavior: SnackBarBehavior.floating),
        );
      }
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

  @override
  Widget build(BuildContext context) => MaterialApp(
    title: '大肥鱼',
    debugShowCheckedModeBanner: false,
    scaffoldMessengerKey: messenger,
    locale: const Locale('zh', 'CN'),
    supportedLocales: const [Locale('zh', 'CN')],
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    theme: ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: blue,
        surface: paper,
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: paper,
      textTheme: ThemeData.light().textTheme.apply(
        bodyColor: ink,
        displayColor: ink,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        surfaceTintColor: Colors.transparent,
        foregroundColor: ink,
        elevation: 0,
        systemOverlayStyle: SystemUiOverlayStyle.dark,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: const Color(0xfffbfdfe),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Color(0xffdfe8ee)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(13),
          borderSide: const BorderSide(color: Color(0xffdfe8ee)),
        ),
        labelStyle: const TextStyle(color: muted),
        helperStyle: const TextStyle(fontSize: 11, color: muted),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        indicatorColor: const Color(0xffe3f0f9),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 11,
            color: states.contains(WidgetState.selected) ? blue : muted,
          ),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: blue,
          foregroundColor: Colors.white,
          minimumSize: const Size(44, 46),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(13),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: blue,
          minimumSize: const Size(44, 44),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(13),
          ),
        ),
      ),
      dividerColor: const Color(0xffe8eef1),
    ),
    home: AnimatedBuilder(
      animation: c,
      builder: (context, _) {
        if (c.data.isEmpty) return ConnectionPage(controller: c);
        final keyboard = MediaQuery.viewInsetsOf(context).bottom > 0;
        return PopScope(
          canPop: false,
          onPopInvokedWithResult: (popped, result) {
            if (popped) return;
            if (tab != 0) {
              setState(() => tab = 0);
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
              title: tab == 1
                  ? Row(
                      children: [
                        const Avatar(size: 35),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              const Text(
                                '大肥鱼',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              Text(
                                c.online
                                    ? string(c.personality['mood'], '平静')
                                    : '连接中断',
                                style: const TextStyle(
                                  fontSize: 11,
                                  color: muted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    )
                  : Text(
                      ['我的小岛', '和大肥鱼聊天', '生活足迹', '记得的小事', '连接与偏好'][tab],
                      style: const TextStyle(fontSize: 18),
                    ),
              actions: [
                if (tab == 1) ...[
                  IconButton(
                    tooltip: object(c.settings['voice'])['autoplay'] == true
                        ? '关闭语音自动播放'
                        : '开启语音自动播放',
                    onPressed: () => c.action(
                      '/settings',
                      method: 'PUT',
                      body: {
                        'voice': {
                          'autoplay':
                              object(c.settings['voice'])['autoplay'] != true,
                        },
                      },
                    ),
                    icon: Icon(
                      object(c.settings['voice'])['autoplay'] == true
                          ? Icons.volume_up_outlined
                          : Icons.volume_off_outlined,
                      size: 21,
                    ),
                  ),
                  IconButton(
                    tooltip: '聊天历史',
                    onPressed: () => conversations(context, c),
                    icon: const Icon(Icons.history_rounded),
                  ),
                  IconButton(
                    tooltip: '新聊天',
                    onPressed: c.busy ? null : () => c.action('/conversations'),
                    icon: const Icon(Icons.add_rounded),
                  ),
                ] else
                  Icon(
                    c.online
                        ? Icons.cloud_done_outlined
                        : Icons.cloud_off_outlined,
                    size: 19,
                    color: c.online ? const Color(0xff85ae9b) : muted,
                  ),
                const SizedBox(width: 8),
              ],
            ),
            body: SafeArea(
              top: false,
              bottom: keyboard,
              child: IndexedStack(
                index: tab,
                children: [
                  IslandPage(
                    controller: c,
                    navigate: (value) => setState(() => tab = value),
                  ),
                  ChatPage(controller: c),
                  LifePage(controller: c),
                  MemoriesPage(controller: c),
                  SettingsPage(controller: c),
                ],
              ),
            ),
            bottomNavigationBar: keyboard
                ? null
                : NavigationBar(
                    selectedIndex: tab,
                    height: 70,
                    onDestinationSelected: (value) {
                      unawaited(c.recorder.end(cancel: true));
                      FocusManager.instance.primaryFocus?.unfocus();
                      setState(() => tab = value);
                    },
                    destinations: const [
                      NavigationDestination(
                        icon: Icon(Icons.home_outlined),
                        selectedIcon: Icon(Icons.home_rounded),
                        label: '小岛',
                      ),
                      NavigationDestination(
                        icon: Icon(Icons.chat_bubble_outline_rounded),
                        selectedIcon: Icon(Icons.chat_bubble_rounded),
                        label: '聊天',
                      ),
                      NavigationDestination(
                        icon: Icon(Icons.explore_outlined),
                        selectedIcon: Icon(Icons.explore),
                        label: '生活',
                      ),
                      NavigationDestination(
                        icon: Icon(Icons.menu_book_outlined),
                        selectedIcon: Icon(Icons.menu_book),
                        label: '记忆',
                      ),
                      NavigationDestination(
                        icon: Icon(Icons.tune_rounded),
                        label: '设置',
                      ),
                    ],
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
          padding: const EdgeInsets.all(30),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Avatar(size: 116),
                const SizedBox(height: 24),
                const Text(
                  '大肥鱼',
                  style: TextStyle(
                    fontSize: 30,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 2,
                  ),
                ),
                const SizedBox(height: 12),
                Text(
                  controller.connecting ? '正在回到小岛……' : '把今天的日常，说给我听。',
                  style: const TextStyle(color: muted, fontSize: 16),
                ),
                const SizedBox(height: 28),
                if (controller.connecting)
                  const CircularProgressIndicator(strokeWidth: 2),
                if (controller.error.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 18),
                    child: Text(
                      controller.error,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                        color: Color(0xffb37869),
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
                        icon: const Icon(Icons.refresh_rounded),
                        label: const Text('重新连接'),
                      ),
                    ),
                  const SizedBox(height: 10),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => connectionDialog(context, controller),
                      icon: const Icon(Icons.dns_outlined),
                      label: const Text('连接伙伴服务'),
                    ),
                  ),
                  const SizedBox(height: 20),
                  const Text(
                    'Flutter 客户端\n连接你自己的服务，沿用原来的聊天与记忆。',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: muted, fontSize: 12, height: 1.8),
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
