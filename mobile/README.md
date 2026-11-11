# 大肥鱼 · Flutter Android 客户端

聊天、小岛、生活、记忆和设置均由 Flutter 控件绘制，直接调用伙伴服务的 JSON API。录音使用 Android 麦克风，图片和 GIF 使用系统文件选择器，语音使用本机播放器。分享链接和歌名直接输入聊天即可。应用没有加载网页的 WebView。

包名 `com.qingyicode.dafeiyu`，版本 `0.2.0+2`，Android 8.0 及以上。聊天、模型调用、语音识别与合成、冲浪和 B 站登录数据沿用服务端；手机不运行 Node 或本地语音模型，伙伴服务需要在线。厂商凭据保留在服务器。客户端仅保存服务地址和临时播放、录音文件。

## 功能

- 完整回复后一次显示；等待时显示输入状态；聊天历史、新建聊天、取消回复。
- 内联表情与收藏表情包、图片/GIF、按住说话、松开发送、上滑取消；原生语音播放与转写展示。
- 查看心情、兴趣、记忆、成长与真实冲浪记录；记忆与性格由 AI 决定。
- DeepSeek/兼容接口、百炼 ASR/TTS/音色复刻、本地发声选项、平台开关、自动探索、表情库、备份导入导出。
- B 站二维码连接、会话检查、关注动态、偏好和断开连接；原始内容通过系统浏览器打开。

## 构建

使用 Flutter **3.41.9 / Dart 3.11.5**，完整 JDK 17 或 21，以及 Android SDK（platform 35/36、build-tools 35.0.0、NDK 28.2.13676358、CMake 3.22.1），接受 Android SDK 许可。固定依赖见 `pubspec.lock`。

```bash
# 仓库根目录；先配置 PATH、JAVA_HOME、ANDROID_HOME
python3 scripts/build-android.py --server-url https://your-companion.example.com --publish-download
```

脚本执行 pub get、静态分析、单元/界面测试和 release APK 构建，输出 `releases/dafeiyu-flutter-v0.2.0-preview.apk` 与 SHA-256。APK 包含 ARMv7、ARM64 和 x86_64。预览包使用开发签名，可直接安装；商店发行前需配置私人发行签名。

不传服务地址时，首次启动填写 HTTPS 服务地址；已连接时在「设置 → 修改服务地址」修改。它应指向对外的 5173 前端代理入口，而非仅供本机使用的 3101。

自签证书部署可额外传 `--trusted-certificate /path/to/public-server.pem`。仅使用公开证书，脚本将其临时放入被 Git 忽略的资源目录，信任限定于指定服务域名，仍执行 TLS 校验。没有跳过证书验证。更换服务器证书后需要更新证书重新构建，或使用系统认可的 HTTPS 证书。

```bash
cd mobile
flutter analyze
flutter test
flutter run --dart-define=DAFEIYU_SERVER_URL=https://your-companion.example.com
flutter test integration_test/native_smoke_test.dart -d <device-id> \
  --dart-define=DAFEIYU_SERVER_URL=https://your-companion.example.com
```

集成测试使用真实服务读取状态和媒体，不发送消息或修改服务偏好。麦克风权限、真实录音音质和厂商转写结果还需有麦克风的手机验收。

官方参考：[Android 构建](https://docs.flutter.dev/deployment/android)、[Flutter 集成测试](https://docs.flutter.dev/testing/integration-tests)。
