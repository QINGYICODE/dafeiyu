# 百炼语音接入

用户语音 → 本地解码为 16 kHz 单声道 WAV → 千问 ASR → DeepSeek 完整回复 → Qwen Audio TTS → 下载、解码校验 → 本机语音附件。

对话不使用流式显示。按住说话、松开发送、滑动取消沿用现有 QQ 风格输入；语音回复仍支持播放、暂停、查看文字和新消息自动播放。

## 环境变量

后端读取 `DASHSCOPE_API_KEY`，也兼容本项目使用的 `QWEN_API_KEY`，两者都有时前者优先。WSL 启动时也会从 Windows 用户、系统环境变量中读取这些已明确支持的变量。修改后重启伙伴服务。

可选 `DASHSCOPE_WORKSPACE_ID`。设置页填写的业务空间 ID 优先于环境变量；未填写时使用百炼公共域名。北京与新加坡使用各自地域密钥。密钥不发送给前端，不写入备份、不放在命令参数或日志中。

本地音频处理需要现有 `.speech-runtime` 的 Python 与 PyAV；可通过 `npm run setup:speech` 安装。云端识别不加载本地 Whisper 模型，云端发声不加载本地 GPT-SoVITS。

## 设置与验证

打开「连接与偏好 → 百炼语音服务」，选择识别和发声开关、地域、模型、音色 ID 后保存。识别默认 `qwen3-asr-flash`，合成默认 `cosyvoice-v3-flash`，系统音色为龙呼呼 `longhuhu_v3`（无需声音复刻）。

- 自动语言识别适用于中英混说，也可以指定普通话、粤语或英语。
- 常用词只提供实体词汇提示，不用于改变聊天性格；不保证每次识别准确。
- 「测试真实识别」可选录音，默认使用项目已有的 `中文语音可莉.wav`。只测试识别，不向聊天写入消息或记忆。
- 「大肥鱼的声音」保留回复方式、语速和自动播放设置，试听使用已保存的云端配置。
- 关闭云端合成可切回原有本地参考音色。厂商请求失败时不偷偷替换音色；聊天保留完整文字，并提示语音未完成。

## 声音复刻

在折叠区域选择参考录音，或使用已有可莉 WAV，点击「创建云端音色」。参考录音会上传百炼并依厂商规则计费。建议 10–30 秒清晰单人录音，本界面限制 4 MB。

创建返回音色 ID 后仍需查询真实状态；只有 `OK` 可以使用，`DEPLOYING` 表示准备中，`UNDEPLOYED` 表示未通过或已停用。音色绑定精确模型和账号配置，改变模型、地域、业务空间或密钥后需要重新确认。可通过「连接已有复刻音色」验证现有 ID，避免重复创建。

选择「使用这个音色」后保存并试听。复刻相似度以实际试听为准。本地 GPT-SoVITS 权重不能直接迁移到百炼，云端使用同一参考录音重新提取音色。

## 实现与边界

- `server/cloud-speech.mjs`：厂商调用、模型与地域校验、音色创建和状态查询、完整音频下载。
- `server/cloud-audio-worker.py`：不加载模型的有界音频解码；输入最长 120 秒，12 MB。
- `server/environment.mjs`：后端环境变量白名单读取。
- `/api/speech/test`、`/api/speech/clone`、`/api/speech/clone/check`：测试、创建和验证已有音色。
- API Key 只发往固定百炼域名；音频 CDN 下载不携带 Key，重定向逐次检查公开 HTTPS 地址与大小上限。厂商返回的 OSS HTTP 链接使用同一对象的 HTTPS 版本。
- 取消对话会中止识别或合成，迟到结果不能写入语音消息。实际音频必须成功解码才会成为可播放附件。
- 设置中的“已读取密钥”仅表示存在凭据；“识别已验证”需要真实录音请求成功，且与当前模型和账号配置一致。

真实验证记录与试听在 `artifacts/web/bailian/`；测试聊天在隔离数据库 `/tmp/dafeiyu-bailian-validation` 中，没有写入日常聊天。

官方文档：[ASR](https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference)、[非流式 TTS](https://help.aliyun.com/zh/model-studio/qwen-audio-tts-http-api)、[声音复刻](https://help.aliyun.com/zh/model-studio/voice-clone-design-http-api)。

## 复刻音色的语气修正

对已验证的复刻音色，合成请求省略通用的“轻松自然、像朋友聊天”指令，避免给参考声音额外叠加统一表达方式。系统音色仍可使用通用聊天语气。这是减少干预的修正，不代表相似度已经提高；是否保留可莉的咬字、尾音和节奏，需要对同一句话实际试听。比较音频和参数记录见 `artifacts/web/bailian/style-comparison/`。

龙呼呼通过 CosyVoice WebSocket 接口合成，后端等待完整音频并验证后再发送语音气泡。不会把分段音频推给聊天界面。`longhuhu_v3` 不可与 Qwen Audio 3.1 模型混用。已有复刻音色不再用于当前发声，历史语音文件保留原来的声音。

官方说明：[CosyVoice 音色列表](https://help.aliyun.com/zh/model-studio/cosyvoice-voice-list)、[WebSocket 接入](https://help.aliyun.com/zh/model-studio/cosyvoice-websocket-api)。
