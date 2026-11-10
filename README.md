# 大肥鱼 · 手机里的 AI 伙伴

一个具有自主记忆、心情与兴趣的 AI 伙伴 App，应用和伙伴统一命名为「大肥鱼」。角色形象根据用户提供的蓝发女仆小鱼参考图重绘。第一版面向个人使用：Android 优先，用户自备 DeepSeek API Key，聊天和记忆保存在本机。

当前交付为 **可运行的本机网页版 v0.7**：[打开 http://localhost:5173](http://localhost:5173)。支持真实模型、自主记忆和成长、查梗与表情收发、用户图片/GIF/语音；新增大肥鱼真实语音回复、温柔女声试听，以及 B 站扫码连接、登录状态浏览和关注动态阅读。登录后可让大肥鱼按兴趣挑选阅读，投稿与互动尚未接入。本机服务使用环境变量 `DEEPSEEK_KEY`。Android APK 尚未打包。

## 网页版运行

```bash
cd /home/wen/Qing/web
npm run build
npm start
```

前端固定在 5173，本机服务在 3101。详细说明见 [网页版 README](web/README.md)，检查与截图见 [实现验证](docs/web-implementation.md)。

功能以 [自主伙伴方案 v0.3](docs/autonomy-plan.md) 为依据：配置平台范围内自主浏览，AI 自主决定记忆，性格随经历成长，自主收集并按语境发送表情包。用户不能直接编辑性格，称呼从聊天了解。当前实际支持范围以网页版说明为准。

已完成 [B 站、抖音、小红书网页可行性实测](docs/platform-browsing-verification.md)：当前匿名浏览器中，B 站首页、搜索和详情可读；抖音部分详情与评论可读，首页和搜索受验证码限制；小红书当前环境未通过。结果只覆盖样本，不表示 App 已接入。

## 旧交互原型（历史）

直接用浏览器打开 [prototype/index.html](prototype/index.html)，或在项目根目录执行：

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

然后访问 `http://127.0.0.1:8080/prototype/`。原型不依赖构建工具、外部字体或第三方服务。

目前保留的是旧版 v0.2 原型，可以切换陪伴、聊天、记忆、生活、设置五页。聊天先显示「正在输入中……」，完成后整条出现，可以取消等待；试着说「以后叫我小林」，体验从对话了解称呼。生活页展示模拟心情、兴趣及自主冲浪演示。

旧原型仍保留手动记忆按钮、固定性格说明及 NOAA 预置见闻；这些属于旧演示，不代表 v0.3 的行为或平台配置。本轮不改原型及 SQL，后期实现时按新方案移除或替换。

原型不调用模型、不自动联网：称呼使用明确句式模拟提取，心情变化使用演示规则，冲浪读取预置科普内容。正式 App 会用 AI 提取称呼、维护角色状态，调用真实搜索与网页读取工具。开启自主冲浪演示后，页面可见期间等待约 12 秒，会自动演示一次；也可立即手动演示。

浏览器仅保存演示聊天、记忆、从对话了解的称呼、生活状态和非敏感设置；API Key 输入框禁用。原先保存的可编辑人格和手填称呼不再使用，已有聊天和记忆保留。

## 文档

- [产品与页面设计](docs/product.md)
- [网页版 v0.4 实现与验证](docs/web-implementation.md)
- [v0.5 自然聊天、查梗与多媒体验证](docs/companion-v05.md)
- [v0.6 B 站账号接入与验证](docs/bilibili-account.md)
- [最新自主伙伴方案 v0.3](docs/autonomy-plan.md)
- [网页浏览可行性实测与截图](docs/platform-browsing-verification.md)
- [技术架构与数据说明](docs/architecture.md)
- [称呼、心情、爱好与自主上网](docs/companion-life.md)
- [SQLite 初始结构](docs/schema.sql)
- [开发阶段与验收清单](docs/acceptance.md)
- [原型验证记录](docs/verification.md)

界面截图：[陪伴首页](artifacts/prototype-home.png) · [正在输入](artifacts/prototype-typing.png) · [完整回复](artifacts/prototype-chat.png) · [生活页面](artifacts/prototype-life.png) · [冲浪见闻](artifacts/prototype-surf.png)。

当前 B 站浏览器阅读已接入，抖音和小红书仍按实际可用状态处理。先使用网页版验证相处体验，后续再按需要进行手机 App 集成。

支持通过阿里云百炼进行语音识别、语音合成和参考音色复刻。后端兼容环境变量 `QWEN_API_KEY`，详见 [百炼语音接入](docs/bailian-speech.md)。
