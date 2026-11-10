# 可莉参考音色

当前实例已接入用户提供的 `中文语音可莉.wav`，使用本机 GPT-SoVITS v2 生成新台词。它根据参考音频推理，没有进行微调训练，也不通过提高普通女声音调来冒充参考音色。

原音频约 18.91 秒、48kHz 单声道；提取开头约 6.45 秒，转换为 32kHz PCM 单声道。参考文字为“这个小小的玻璃球，就代表了巴巴托斯大人对可莉的肯定吗？”。原始音频保持完整，参考文件与模型位于被忽略的 `web/.character-voice-runtime/`，不作为网页静态资源公开。参考文字仅用于语音模型，不放进聊天模型的身份、记忆或对话提示。

运行使用 GPT-SoVITS 的固定 v2 源码版本 `a7e38f93f1ad8d263093ca26ce0dea3fb7080ea2`，官方预训练 GPT、SoVITS、中文 BERT 与 HuBERT 权重。参见 [上游项目](https://github.com/RVC-Boss/GPT-SoVITS/tree/a7e38f93f1ad8d263093ca26ce0dea3fb7080ea2)。安装在独立 Python 环境，保留原有 Whisper 和 Edge-TTS 环境。

已针对当前 Python 3.12 / PyTorch 2.7 做兼容处理：

- 官方模型先载入 CPU，再迁入 GPU；BERT/HuBERT 先转半精度，降低峰值显存。
- 补充旧版注意力模块的显式类型导入。
- 直接调用 LangSegment 0.2.0 的实现，绕开其缺少导出别名的包初始化错误。
- 用 Jieba 的 Python 实现替代需要系统开发头文件的扩展。
- 为推理提供实际音频读取适配器，避免引入上游 Gradio 训练界面依赖。

## 安装与验证

在项目 `web` 目录中，已有 `npm run setup:speech` 创建的 Python 环境后执行：

```bash
.speech-runtime/bin/python scripts/setup-character-voice.py
node scripts/check-character-voice.mjs
```

初次准备需要下载 GPU 运行库和模型。脚本支持 `--reference`、`--reference-text`、`--start` 和 `--seconds`；应选择 3～10 秒、文字与录音一致的完整语句。`--prepare-only` 可复用已安装依赖和权重。

实际合成验证通过后，再将 `.character-voice-runtime/config.json` 复制为同目录的 `ready.json`，设置页才会出现参考音色。应用设置 `voice.speaker="klee"`、`voice.rate=0` 使用它；也可随时选回晓晓或晓伊。

## 运行行为

- 仅将最终回复文字发给本地推理进程，参考音色不使用第三方语音服务。
- 完整生成 WAV 后再作为聊天语音发送，保持非流式交互。
- 单条最长 200 字，语音生成最长等待 90 秒；失败保留文字，不替换成别人的声音。
- 复用推理进程，同一时刻处理一条；闲置 2 分钟后释放模型占用。
- 取消、超时或进程退出会终止待处理任务，临时输出会清理。
- MP3/WAV 播放、暂停、查看文字与历史不自动重播的行为保持一致。

实测硬件为 RTX 3050 Laptop 4GB。最初一组测试，首次加载并生成约 23.5 秒，进程内第二句约 1.7 秒；两段音频分别约 6.5 秒和 4.08 秒，均经 Whisper 识别回读，生成了新的目标台词。这个时间仅代表当前机器和测试句子。

音色相似程度由试听判断，短参考音频不保证所有情绪、语句或专名的发音都一致。实测音频与报告位于 `artifacts/web/klee-voice/`。
