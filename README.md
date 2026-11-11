# 大肥鱼 · AI 智能伙伴

一个会聊天、保留记忆、拥有心情与兴趣的 AI 伙伴。网页版原型已确定，Android 应用使用 Flutter 独立实现界面，通过 HTTPS 连接同一伙伴服务。

## 当前功能

- DeepSeek 对话，等待时显示正在输入，完整生成后一次发送。
- AI 自主决定记住什么、如何称呼用户，性格随聊天与阅读经历逐渐变化。
- 配置允许浏览的平台，自主探索并保留实际冲浪记录；支持查梗、收集与选择表情包。
- QQ 风格的内联表情输入、图片/GIF、按住说话、松开发送和上滑取消。
- 百炼语音识别、语音合成和参考音色复刻；保留可选的本地语音方案。
- B 站扫码连接、登录状态浏览与关注动态阅读。投稿、评论和私信尚未接入。
- 本机 SQLite 保存聊天、记忆与成长，支持文字记录的备份导入导出。

安卓客户端本身不运行 Node 服务、浏览器冲浪或本地语音模型。电脑/服务器上的伙伴服务需要保持在线，手机与网页版共用该服务的数据。厂商 API Key 和 B 站会话留在服务端，不打包进 APK。

## 运行伙伴服务

需要 Node.js 22.13 或更新版本。先在终端或系统环境变量中配置密钥：

```bash
export DEEPSEEK_KEY='你的 DeepSeek 密钥'
export QWEN_API_KEY='你的百炼密钥'
cd web
npm ci
npm run build
npm start
```

生产入口固定运行于 `http://127.0.0.1:5173`，Node 网关将 API 转发到 `127.0.0.1:3101`，将界面请求转发到内部 UI 服务 `127.0.0.1:5174`。远程手机访问需要为前端配置可访问的 HTTPS 地址。不要直接公开 3101。

`QWEN_API_KEY` 也可以使用 `DASHSCOPE_API_KEY`，后者在同时配置时优先。WSL 启动时兼容读取 Windows 用户/系统中已支持的环境变量。`.env.example` 仅为变量说明，服务不会自动加载 `.env` 文件。

语音解码与可选本地识别组件可通过 `npm run setup:speech` 安装。百炼云端识别不加载 Whisper，云端发声不加载 GPT-SoVITS。详细配置见 [百炼语音](docs/bailian-speech.md) 与 [本地参考音色](docs/klee-reference-voice.md)。

## Android APK

Flutter 客户端位于 [mobile/](mobile/README.md)，聊天、表情、录音、图片、记忆、冲浪及设置均由 Flutter 控件实现。包名 `com.qingyicode.dafeiyu`，最低支持 Android 8.0，版本 `0.3.0+3`。

配置 Flutter 3.41.9、完整 JDK 17/21、Android SDK 和 `ANDROID_HOME` 后：

```bash
python3 scripts/build-android.py --server-url https://your-companion.example.com
```

构建执行 Flutter 静态分析、单元/界面测试与 release 编译，输出开发签名的预览 APK 和 SHA-256 到 `releases/`。未指定服务地址时，首次打开填写；已连接时在「设置 → 修改服务地址」修改。服务端需要保持在线。

GitHub Actions 自动检查网页版与 Flutter，生成通用 Flutter APK，可从 **Actions → Verify and build Android preview → Artifacts** 下载。CI 包不含个人地址、证书或厂商凭据。构建、证书及安装说明见 [Flutter README](mobile/README.md)。

## 项目结构

| 目录 | 内容 |
| --- | --- |
| `web/` | React 界面、Node 伙伴服务与测试 |
| `mobile/` | Flutter Android 应用、原生录音/播放/文件选择和测试 |
| `scripts/` | Android 构建与平台验证脚本 |
| `docs/` | 产品、架构和各功能实现说明 |
| `prototype/` | 历史交互演示，行为不代表当前正式实现 |

密钥、聊天数据库、B 站登录信息、本地模型、用户参考录音、构建输出和私人验证材料均不提交到仓库。界面角色资源保留在项目中。

## 检查

```bash
cd web
npm run typecheck
npm test
npm run build

cd ../mobile
flutter analyze
flutter test
flutter build apk --release
```

真实厂商、浏览器、麦克风和模拟器验证需要对应的本机环境。参考 [自主伙伴方案](docs/autonomy-plan.md)、[网页版说明](web/README.md)、[B 站接入](docs/bilibili-account.md)、[网页可行性记录](docs/platform-browsing-verification.md) 和 [Flutter 说明](mobile/README.md)。本机截图与语音验证产物不随源码发布。
