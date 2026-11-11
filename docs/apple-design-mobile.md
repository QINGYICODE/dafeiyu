# 大肥鱼移动端 · Apple Design 改进记录

使用技能 [dickwu/apple-design-skill](https://github.com/dickwu/apple-design-skill)，安装于 `~/.codex/skills/apple-design`。目标是 Flutter Android 伙伴应用：让聊天成为第一入口，以海蓝、角色和小岛日常建立辨识度。采用 HIG 的可读性、分组、渐进披露和系统外观原则；Android 继续使用 Material 导航、48 dp 点击区域、系统权限与文件选择器。

## 改进前的审查

- **Critical · 文本对比度**：次要文字 `#8194A0` 在白底上只有 **3.15:1**，蓝色 `#4387B2` 为 **3.93:1**，12–16 sp 的文字低于 4.5:1。`accessibility.md › Vision`：“Strive to meet color contrast minimum standards.” 改为下表的语义色，并用真实色值计算。
- **High · 系统外观**：各页面固定白底，系统切换暗色后不能适应。`dark-mode.md › Best practices`：“Ensure that your app looks good in both appearance modes.” 改为 `ThemeData` 与 `ThemeExtension`，跟随系统，不增加应用内明暗开关。
- **High · 设置层级**：服务、语音模型、克隆和探索选项同层展开，难以找到日常偏好。`layout.md › Visual hierarchy`：“Use progressive disclosure to make layouts cleaner and easier to interact with.” 高频服务连接与声音偏好直接展示，模型和探索参数分组展开。
- **Medium · 字号与尺寸适应**：元信息小到 10 sp；固定布局在横屏和大字模式容易拥挤。`typography.md › Supporting Dynamic Type`：“Make sure your app’s layout adapts to all font sizes.” 正文 17 sp、元信息至少 12 sp，布局测试覆盖 320 宽、横屏、2 倍字体和宽屏。
- **Craft · 品牌**：保留 QQ 式聊天与角色资源；以“小岛的今天”为唯一主要角色场景，用安静的海面线条作为签名。其他页面以内容、分组和留白组织。此处为产品设计判断。

## 设计变量

| 语义角色 | 浅色 | 深色 | 在各自内容表面上的对比度 |
| --- | --- | --- | --- |
| 页面底色 | `#F4F6F8` | `#0D141C` | 背景 |
| 内容表面 | `#FFFFFF` | `#172330` | 背景 |
| 主要文字 | `#182B3A` | `#EAF1F7` | 14.53:1 / 13.96:1 |
| 次要文字 | `#596B78` | `#A8B6C4` | 5.53:1 / 7.69:1 |
| 海蓝强调 | `#155978` | `#8BCFEA` | 7.69:1 / 9.25:1 |
| 危险操作 | `#B43A35` | `#FFB4AB` | 明确文字与确认操作 |

字体使用平台系统字体与中文回退；标题 32/28 sp，组标题 17 sp，聊天正文 17 sp，说明 13–15 sp，时间 12 sp。间距采用 4/8/12/16/24/32；主要按钮至少 48 dp。角色图片只在小岛和聊天身份中承担产品识别，不增加无关装饰。优先保留 Android 标准控件，导航采用实色表面。

```text
紧凑宽度                       常规宽度
┌──────────────────┐           ┌─────┬────────────────────────┐
│ 角色与状态   历史 ⋯│           │     │      上下文工具栏       │
├──────────────────┤           │ 导航├────────────────────────┤
│                  │           │     │   有阅读宽度限制的内容   │
│      对话内容      │           │ 栏  │                        │
│                  │           │     │                        │
├──────────────────┤           │     ├────────────────────────┤
│ 语音  输入  表情 图片│           │     │      聊天输入区域       │
├──────────────────┤           └─────┴────────────────────────┘
│ 小岛 聊天 生活 记忆 设置│
└──────────────────┘
```

改进顺序：先修复对比度与系统外观，再调整导航和设置层级，最后重构小岛、聊天、记忆及生活页面。常见操作保持直接，复杂设置渐进展开；字体放大后内容允许换行。动效只用于页面/滚动反馈，尊重系统减少动画设置。根据 `liquid-glass.md › Cross-platform translation`，不将 Flutter 控件冒称为苹果原生 Liquid Glass。
