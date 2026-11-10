# 大肥鱼 Android 客户端

首版使用 Android 原生 Activity + WebView，复用已经确认的网页版 UI。应用包名 `com.qingyicode.dafeiyu`，最低 Android 8.0（API 26），目标 Android 16（API 36）。

这是连接现有伙伴服务的手机客户端。DeepSeek、百炼、记忆、B 站会话、自主冲浪和 SQLite 仍在服务端运行，APK 不包含厂商密钥、聊天数据库或本地语音模型。电脑/服务器上的服务需要持续运行；安装 APK 不会把服务迁移到手机。

## 构建与安装

需要 JDK 17 或 21、Android SDK（`platforms;android-36`、`build-tools;35.0.0`）及网络。设置 `ANDROID_HOME` 后：

```bash
cd android
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
```

生成 `app/build/outputs/apk/debug/app-debug.apk`，已使用 Android 开发签名，可侧载安装。这是测试版，不是应用商店发行包。不同电脑/CI 的默认开发签名可能不同，覆盖安装时需使用相同签名。

也可以在项目根目录执行：

```bash
python3 scripts/build-android.py --server-url https://your-companion.example.com
```

会输出 APK 和 SHA-256 到本机 `releases/`。增加 `--publish-download` 会复制到本机网页下载目录；之后重新构建并启动网页版，手机可通过 `/downloads/dafeiyu-android-v0.1.0-preview.apk` 下载。

未指定服务地址的通用 APK 首次打开会要求填写 HTTPS 服务首页。已连接时可以在「连接与偏好 → 安卓客户端 → 修改服务地址」切换。服务地址不能包含 API Key、路径或账号密码。

## 首版原生适配

- 麦克风只在按住说话触发时申请权限，只授权当前服务 origin 的音频采集。拒绝后仍可打字，不会授权摄像头。
- 图片、GIF、测试录音、参考录音、备份导入通过系统文件选择器打开；不申请整个相册或文件系统权限。
- 保留网页的松开发送、上滑取消、非流式回复和语音气泡；切到后台会中止录音并暂停音频。
- 状态栏、导航栏、刘海与键盘边距由原生容器适配；返回键先处理网页历史，首页双击退出。
- 外部视频、百科等链接交给系统浏览器；内部页面限制在已配置的伙伴服务 origin。
- 备份导出使用系统保存对话框；下载不跟随重定向，不把会话 Cookie 发给其他域名。
- 无连接、HTTP 错误和证书错误显示可重试页面；WebView 崩溃后可以重新连接。

## HTTPS 与自签证书

正常部署使用系统认可的 HTTPS 证书。当前个人内网穿透若使用自签证书，可以在核对证书指纹后显式加入构建：

```bash
python3 scripts/build-android.py \
  --server-url https://your-companion.example.com:38413 \
  --trusted-certificate /absolute/path/to/server-public-certificate.pem
```

构建只为该服务域名额外信任这张公有证书，其他域名继续使用系统信任库。运行时从不调用 `SslErrorHandler.proceed()`，不全局跳过证书或主机名校验。证书更换/到期后，需要更新有效证书或重新构建对应配置。

自签证书文件和具体个人服务地址不需要提交 Git。构建参数仅含服务地址和公有证书，不含任何厂商 API Key。

## 自动构建

GitHub Actions 在 main 提交与 PR 上执行网页版检查、Android 单元测试和 lint，并上传 `dafeiyu-android-preview` 构建产物。CI 通用 APK 不含个人服务地址与自签证书，安装后需填写具有有效 HTTPS 证书的服务地址。

设备上的音频编码、麦克风降噪和后台行为还会受到 WebView 版本与厂商系统影响；编译和模拟器检查不能替代真机验收。

## 本轮验证范围

已在隔离的 Android 15 模拟器安装 APK，验证真实 HTTPS 页面、语音气泡播放/暂停、系统键盘与返回键、内联表情、麦克风允许/拒绝、系统文件选择后的真实图片上传，以及原生服务设置对话框。测试没有发送聊天消息。

该模拟器明确使用 `-no-audio` 启动，因此本轮没有验证真实麦克风采集或手机录音的识别准确度，需要真机验收。模拟器截图、详细结果和个人配置 APK 仅保存在本机，不提交到公开仓库。

复测工具为 `web/scripts/check-android.mjs`，只接受显式指定的隔离模拟器串号：

```bash
cd web
DAFEIYU_ANDROID_SERIAL=emulator-5580 DAFEIYU_ADB_PORT=5038 node scripts/check-android.mjs
```

仅当模拟器确实以无音频模式启动时，可设置 `DAFEIYU_ANDROID_NO_AUDIO=1`；此时报告会将真实录音列为未验证项，不会把它计为录音成功。
