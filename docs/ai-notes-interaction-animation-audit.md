# AI（墨问）与笔记功能交互动效与微动效审计报告

> **审计基准**：Astro 个人技术博客 · 东方书斋空间交互系统  
> **审计模块**：墨问 AI (`InkAsk.astro`)、高亮笔记抽屉 (`ArticleSelectionDock.astro`)、伴读空间协调器 (`CompanionLayout.astro`)、浮动对照工作台 (`PinWorkbench.astro`)、全站笔记中心 (`src/pages/notes.astro`)  
> **设计语言**：水墨留白、东方书斋、金石印章、经卷并排、微光流动  
> **安全要求**：严禁上传部署至生产服务器，严禁改动业务代码；本文件及配套截图仅用于设计走查与动效改进规划。

---

## 目录

- [一、交互架构与审计概览](#一交互架构与审计概览)
- [二、六大交互维度缺失动效深度审计](#二六大交互维度缺失动效深度审计)
  - [维度 1：选中文本与 AI / 笔记入口的连接交互](#维度-1选中文本与-ai--笔记入口的连接交互)
    - [1.1 划词微托盘呼叫「墨问」缺少文字飞入与轨迹连接](#11-划词微托盘呼叫墨问缺少文字飞入与轨迹连接)
    - [1.2 快捷键触发缺少按键按下与微波纹触觉反馈](#12-快捷键触发缺少按键按下与微波纹触觉反馈)
  - [维度 2：InkAsk 墨问流式推敲与气泡微动效](#维度-2inkask-墨问流式推敲与气泡微动效)
    - [2.1 快捷预设提问卡片点击缺少吸入与变形动效](#21-快捷预设提问卡片点击缺少吸入与变形动效)
    - [2.2 流式回答阶段缺少水墨呼吸光标与渐进渗入](#22-流式回答阶段缺少水墨呼吸光标与渐进渗入)
    - [2.3 回答完成态操作条与「存入笔记」微交互反馈](#23-回答完成态操作条与存入笔记微交互反馈)
  - [维度 3：「存入笔记」跨模块数据流与时空反馈断层](#维度-3存入笔记跨模块数据流与时空反馈断层)
    - [3.1 单抽屉模式下「存入笔记」的“盲存”视觉失联](#31-单抽屉模式下存入笔记的盲存视觉失联)
    - [3.2 并排模式（Split Mode）下跨分隔条飞渡动效缺失](#32-并排模式split-mode下跨分隔条飞渡动效缺失)
    - [3.3 划定回答局部选区缺少聚焦微高亮](#33-划定回答局部选区缺少聚焦微高亮)
  - [维度 4：伴读顶部分段互切与双卷并排拖拽微动效](#维度-4伴读顶部分段互切与双卷并排拖拽微动效)
    - [4.1 顶部伴读分段切换缺少滑动胶囊滑块（Sliding Pill Morph）](#41-顶部伴读分段切换缺少滑动胶囊滑块sliding-pill-morph)
    - [4.2 中缝分隔条（Splitter）到达极值缺少阻尼橡皮筋与复位弹簧](#42-中缝分隔条splitter到达极值缺少阻尼橡皮筋与复位弹簧)
    - [4.3 双卷并排（Split Mode）宏观对峙与空间舒展动效缺失](#43-双卷并排split-mode宏观对峙与空间舒展动效缺失)
  - [维度 5：笔记抽屉内 AI 卡片结构与双向回流微动效](#维度-5笔记抽屉内-ai-卡片结构与双向回流微动效)
    - [5.1 笔记列表中的 AI 问答卡片缺少「向墨问追问」的反向回流入口](#51-笔记列表中的-ai-问答卡片缺少向墨问追问的反向回流入口)
    - [5.2 并排模式下双向拖拽（Drag & Drop）微交互全无](#52-并排模式下双向拖拽drag--drop微交互全无)
    - [5.3 笔记卡片展开/收起手风琴动画缺失](#53-笔记卡片展开收起手风琴动画缺失)
    - [5.4 浮动对照工作台与 AI/笔记卡片多屏对照联动动效缺失](#54-浮动对照工作台与-ai笔记卡片多屏对照联动动效缺失)
  - [维度 6：全站笔记中心 (`/notes`) 的 AI 交互孤岛与重排动效](#维度-6全站笔记中心-notes-的-ai-交互孤岛与重排动效)
    - [6.1 标签筛选重排缺少流体 FLIP 布局重排补间](#61-标签筛选重排缺少流体-flip-布局重排补间)
    - [6.2 全站笔记中心内 AI 卡片无法直接唤起墨问继续探索](#62-全站笔记中心内-ai-卡片无法直接唤起墨问继续探索)
- [三、全量审计现场截图对照表](#三全量审计现场截图对照表)
- [四、水墨书斋微动效参数规范推荐 (Motion Tokens)](#四水墨书斋微动效参数规范推荐-motion-tokens)
- [五、改造实施排期建议](#五改造实施排期建议)

---

## 一、交互架构与审计概览

本站围绕「东方书斋」意象，构建了深度融合的伴读系统：
- **正文阅读区**：提供划词微托盘（Selection Dock），支持对选中文字进行高亮划线、钉入工作台、复制引用、呼叫墨问 AI。
- **墨问 AI (`InkAsk.astro`)**：伴读解惑系统，提供预设脉络、流式回答、答案回溯、一键存入笔记等能力。
- **高亮笔记抽屉 (`ArticleSelectionDock.astro`)**：按文章与正文结构汇集划线、随笔与 AI 问答摘录。
- **伴读空间协调器 (`CompanionLayout.astro`)**：管理右侧单浮岛（Rail）、墨问全屏（Ask-Full）、笔记全屏（Notes-Full）以及左墨问·右笔记双卷并排（Split Mode）。
- **浮动对照工作台 (`PinWorkbench.astro`)**：支持跨段落、跨章节将正文引文、代码块与 AI 问答摘录一键钉入（Pin）可自由拖拽调整尺寸的半透明浮动窗口，并支持右边缘标签（Edge Tab）吸附折叠。
- **全站笔记管理中心 (`/notes`)**：以瀑布流展板统一陈列全站笔记，按来源与类型分类索引。

**审计核心发现**：
目前基础骨架功能已经齐备，逻辑闭环。但在 **「AI 与笔记两个系统的动态交互与微反馈」** 层面，存在大量 **瞬断切换、无轨迹飞入、盲存无视觉回馈、状态突变、缺乏触感阻尼** 等体验断层。

---

## 二、六大交互维度缺失动效深度审计

### 维度 1：选中文本与 AI / 笔记入口的连接交互

#### 1.1 划词微托盘呼叫「墨问」缺少文字飞入与轨迹连接
- **相关代码**：[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L1150-L1175)
- **代码现状**：
  ```javascript
  function triggerAsk() {
    // 隐藏微托盘
    hideDock();
    // 直接打开侧边栏并将文本注入 textarea
    window.__inkAsk.openSidebarWithContext(snippet);
  }
  ```
- **缺失表现**：
  点击 `[墨问]` 按钮或按下快捷键 `A` 时，选中的段落文字直接瞬间出现在右侧墨问抽屉的 `textarea` 中。用户的视线无法跟随文字的去向，缺乏「从正文纸面摘入墨问砚台」的连续视觉轨迹。
- **推荐微动效方案**：
  点击 `[墨问]` 时，从选中段落生成一个半透明的文字幽灵卡片（Ghost Capsule），沿平滑二次贝塞尔曲线（`cubic-bezier(0.16, 1, 0.3, 1)`）飞向右侧抽屉输入框，同时伴随微量粒子收拢与水墨轻晕，时长 320ms。
- **截图佐证**：
  ![划词微托盘入口](/images/ai-notes-audit/01-selection-dock-ask.png)

#### 1.2 快捷键触发缺少按键按下与微波纹触觉反馈
- **相关代码**：[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L1334-L1385)
- **缺失表现**：
  微托盘中清晰标明了快捷键 `<kbd>A</kbd>`（墨问）与 `<kbd>H</kbd>`（划线）。但当用户通过键盘按下 `A` 或 `H` 时，托盘按钮毫无视觉按压反馈（无 `:active` 缩放或微光下陷），功能直接执行，缺乏物理按压感。
- **推荐微动效方案**：
  监听键盘触发时，为对应按钮动态添加 `.is-key-pressed` 类，播放 `transform: scale(0.92)` 缩放下陷后迅速回弹（弹性动画，80ms 下陷 + 140ms 弹回），并在微托盘胶囊周围泛起一层淡金微光波纹。

---

## 维度 2：InkAsk 墨问流式推敲与气泡微动效

#### 2.1 快捷预设提问卡片点击缺少吸入与变形动效
- **相关代码**：[`InkAsk.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/InkAsk.astro#L1187-L1225)
- **代码现状**：
  预设卡片（脉络提要、问题溯源、机巧拆解、前置与避坑）在 hover 时仅有平淡的背景色变化，点击时立即被清除。
- **缺失表现**：
  用户点击某张预设卡片时，卡片直接瞬间消失，界面突变为空白并挂载问答。
- **推荐微动效方案**：
  预设卡片在 hover 时增加 `translateY(-2px)` 微浮与金石边框微亮；点击时，被点击的卡片平滑收缩并转化为一颗「墨珠」滑入下方对话流，未被点击的 3 张卡片淡出下沉（FLIP 动画，240ms）。
- **截图佐证**：
  ![墨问空状态预设卡片](/images/ai-notes-audit/02-ink-ask-empty-state.png)

#### 2.2 流式回答阶段缺少水墨呼吸光标与渐进渗入
- **相关代码**：[`InkAsk.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/InkAsk.astro#L689-L705)
- **缺失表现**：
  生成回答时，虽然顶部有「展卷推敲中」小三点微动效，但回答正文区域只是生硬地 chunk-by-chunk 刷出文本。缺少大模型或水墨书斋特有的「墨韵呼吸打字光标」，文字流出时略显生冷。
- **推荐微动效方案**：
  在当前正在流式输出的文本末端追加一个仿毛笔着墨呼吸光标 `::after`（朱砂红或松烟墨，周期 1.1s 柔和淡入淡出），新换行的段落自下而上轻微位移 4px 并淡入（Stagger Cascade Fade-in）。
- **截图佐证**：
  ![墨问推敲中与流式状态](/images/ai-notes-audit/03-ink-ask-streaming-state.png)

#### 2.3 回答完成态操作条与「存入笔记」微交互反馈
- **相关代码**：[`InkAsk.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/InkAsk.astro#L734-L780)
- **代码现状**：
  回答输出结束瞬间，代码通过 `appendTurnActions` 挂载 `[存入笔记]` 与 `[复制]` 两个操作按钮。
- **缺失表现**：
  操作栏直接瞬间弹出（pop-in），缺乏平滑入场；按钮在 hover 与点击时缺少物理微触觉反馈与状态流转动效。
- **推荐微动效方案**：
  操作栏采用 `translate3d(0, 6px, 0) -> translate3d(0, 0, 0)` 伴随 `opacity: 0 -> 1` 的入场补间（220ms）；按钮 hover 时呈现微浮与边框微光，点击存入时播放微弹性缩放与朱砂印记微闪。
- **截图佐证**：
  ![墨问回答完成态与底部操作条](/images/ai-notes-audit/04-ink-ask-answer-save-note.png)

---

## 维度 3：「存入笔记」跨模块数据流与时空反馈断层

#### 3.1 单抽屉模式下「存入笔记」的“盲存”视觉失联
- **相关代码**：[`InkAsk.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/InkAsk.astro#L740-L770)、[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L2232-L2275)
- **关键代码还原**：
  ```typescript
  btn.addEventListener('click', () => {
    const detail = { kind: 'ai', text, markdown: text, question, headingText: 'AI 问答摘录' };
    api.addNote(detail);
    // 仅修改按钮文案
    labelEl.textContent = '已存入笔记';
    btn.classList.add('is-saved');
  });
  ```
- **致命体验断层**：
  当用户处于默认的单抽屉阅读态（屏幕只打开了墨问抽屉，笔记抽屉处于完全关闭状态）时，用户点击「存入笔记」：
  1. 按钮文字仅仅变为「已存入笔记」；
  2. 笔记抽屉没有打开，用户根本**看不到笔记存到了哪里**；
  3. 顶部分段栏中的 `[笔记 2]` 数字角标没有播放跳跃或闪烁动画；
  4. 屏幕上没有任何浮动 Toast 提示，用户产生强烈的不确定感（“真存成功了吗？去哪看？”）。
- **推荐微动效方案**：
  1. 点击「存入笔记」按钮后，从该按钮迸发出一颗金色水墨光点，划过优美的抛物线飞向抽屉顶部的 `[笔记]` 分段标签；
  2. 顶部的数字角标（`.companion-seg-badge`）触发一次弹性放大跳动（`scale(1.35) -> scale(1.0)`，弹性阻尼 0.45）；
  3. 弹出东方书斋风格的轻量胶囊微 Toast：“已收录入卷 · 点击可查看”，提供即时跳转链接。
- **截图佐证**：
  ![单抽屉存入笔记视觉失联](/images/ai-notes-audit/05-save-note-closed-drawer-disconnect.png)

#### 3.2 并排模式（Split Mode）下跨分隔条飞渡动效缺失
- **相关代码**：[`CompanionLayout.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/CompanionLayout.astro#L430-L530)、[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L2077-L2125)
- **缺失表现**：
  在「左墨问 · 右笔记」双卷并排模式下，两卷同屏对照。用户点击左侧的「存入笔记」，右侧笔记列表最上方虽然插入了新卡片，但两屏之间没有任何跨越中央中缝（Splitter）的视觉过渡，看起来像两个毫不相关的独立软件窗口。
- **推荐微动效方案**：
  设计「飞渡穿缝」微动效：左侧卡片收拢出一道微光轨迹，穿越中缝分隔条进入右侧笔记抽屉，右侧抽屉对应位置平滑撑开（Height Spring 0 -> Auto），卡片以水墨微光自上而下缓缓落座（WAAPI FLIP 补间）。
- **截图佐证**：
  ![并排模式跨面板存入缺失连贯性](/images/ai-notes-audit/08-split-mode-save-cross-panel.png)

#### 3.3 划定回答局部选区缺少聚焦微高亮
- **相关代码**：[`InkAsk.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/InkAsk.astro#L707-L732)
- **缺失表现**：
  代码设计了精巧的特性：“在回答里选中一段文字，则只保存选中的部分，按钮变更为【存入选中】”。但在用户选中文本时，回答气泡内部没有给出任何视觉锁定框或金线边缘包围，用户难以感知系统是否准确捕获了当前选区。
- **推荐微动效方案**：
  当 `selectedTextInside` 检测到有效选区时，为该选区外层赋予流动水墨淡黄虚线边框，并在按钮上方弹出微气泡提示：“已锁定选区：142 字”。

---

## 维度 4：伴读顶部分段互切与双卷并排拖拽微动效

#### 4.1 顶部伴读分段切换缺少滑动胶囊滑块（Sliding Pill Morph）
- **相关代码**：[`CompanionLayout.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/CompanionLayout.astro#L155-L175)
- **缺失表现**：
  顶部分段器包含 `[问 墨问]` 与 `[✎ 笔记 N]` 两个 Tab。目前点击切换时，仅通过类名修改背景色与透明度。虽然面板主体有横向微移，但 Tab 本身缺少 macOS / iOS 风格的共享平滑滑动背景滑块。
- **推荐微动效方案**：
  在 `.companion-seg` 内置一个绝对定位的背景滑动底板（Active Indicator Pill），利用 FLIP 或 CSS 弹簧动画在两个 Tab 之间平滑滑行拉伸，切换时伴随数字角标的轻微浮沉。
- **截图佐证**：
  ![顶部分段切换](/images/ai-notes-audit/06-companion-seg-tab-switch.png)

#### 4.2 中缝分隔条（Splitter）到达极值缺少阻尼橡皮筋与复位弹簧
- **相关代码**：[`CompanionLayout.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/CompanionLayout.astro#L639-L688)
- **代码现状**：
  ```javascript
  splitter.addEventListener('dblclick', () => {
    ratio = clampToViewport(0.5);
    applyRatio();
    saveRatio();
  });
  ```
- **缺失表现**：
  1. **拖拽边界死硬**：拖拽至最小比例（26%）或最大比例（74%）时，分隔线直接硬生生撞停，毫无物理世界中的阻尼胶质感或微震反馈；
  2. **双击复位瞬间跳变**：双击分隔线复位至 50% 时，直接赋值 `ratio = 0.5`，两扇抽屉没有任何补间动画，直接发生几何突变；
  3. **靠近 50% 缺少磁吸微动效**：当用户拖动至 48%~52% 区间时，缺乏磁力感应和吸附触觉动画。
- **推荐微动效方案**：
  1. 拖至极限时允许超出 15px 并呈现反向二次方阻尼拉力，松手后像橡皮筋一样弹回限制区间；
  2. 双击复位 50% 时，调用弹簧插值动画（Spring Transition 380ms），使两卷优雅舒展回中间等分位置；
  3. 百分比气泡在经过 50% 临界点时，微徽章播放一次金石微颤。
- **截图佐证**：
  ![中缝分隔条拖拽与百分比气泡](/images/ai-notes-audit/10-splitter-drag-feedback.png)

#### 4.3 双卷并排（Split Mode）宏观对峙与空间舒展动效缺失
- **相关代码**：[`CompanionLayout.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/CompanionLayout.astro#L430-L460, #L510-L530)
- **代码现状**：
  在宽屏模式下，用户可通过操作栏或分段菜单触发 `enterSplit` 进入双卷并排。
- **缺失表现**：
  进入并排模式时，两扇抽屉同时展开，但左卷与右卷的展开缺乏时间差与书卷舒展的层次感（Staggered Unfold），视线无焦点；退出并排退回单抽屉时，收拢动作略显生硬。
- **推荐微动效方案**：
  进入并排模式时，采用书卷双扉舒展开阖动效：主屏（发起方）保持沉稳，副屏（被呼出方）从右侧如经卷般缓缓延展铺开（Duration 480ms，`cubic-bezier(0.16, 1, 0.3, 1)`），中央中缝同步自顶部垂落显现。
- **截图佐证**：
  ![双卷并排模式全景展开](/images/ai-notes-audit/07-split-mode-overview.png)

---

## 维度 5：笔记抽屉内 AI 卡片结构与双向回流微动效

#### 5.1 笔记列表中的 AI 问答卡片缺少「向墨问追问」的反向回流入口
- **相关代码**：[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L1584, #L1671-L1750, #L3974-L4035)
- **严重交互死胡同**：
  在笔记抽屉中，AI 卡片标有 `墨问 § AI 问答摘录` 标签与原问题 `问：...`，下方操作栏仅有 `[钉住]`、`[备注]`、`[复制]`、`[删除]`。如果用户重读此条 AI 笔记时产生新的疑问，**无法在此卡片上一键追问**！必须退回墨问抽屉重新打字。
- **推荐微动效方案**：
  在 AI 卡片右下角增设 `[追问墨问]` 按钮。点击后，卡片文字化作一缕墨线，平滑切回/唤起左侧墨问输入框，并在输入框上方挂载「引用追问来源」微胶囊，同时墨问面板自右向左丝滑滑入。
- **截图佐证**：
  ![笔记抽屉 AI 卡片解构](/images/ai-notes-audit/09-notes-drawer-ai-cards.png)

#### 5.2 并排模式下双向拖拽（Drag & Drop）微交互全无
- **相关代码**：[`CompanionLayout.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/CompanionLayout.astro)、[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro)
- **缺失表现**：
  在「左墨问 · 右笔记」双卷并排的宽屏环境下，用户无法将左侧墨问的某段文字拖入右侧作为新便签；也无法将右侧已有的划线笔记拖进左侧墨问输入框作为上下文。
- **推荐微动效方案**：
  实现 HTML5 Drag-and-Drop 微交互：拖动时生成半透明纸张跟随光标；当光标悬停至目标面板时，目标面板泛起淡金色的接收区域外边框虚线（Dropzone Expansion Animation），松手时卡片伴随重力回弹轻盈就位。

#### 5.3 笔记卡片展开/收起手风琴动画缺失
- **相关代码**：[`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L4067-L4160)
- **缺失表现**：
  长文折叠的笔记点击「展开阅读全文」时，高度直接突变跳跃，把下方的卡片生硬顶开。
- **推荐微动效方案**：
  采用 CSS `grid-template-rows: 0fr -> 1fr` 或现代平滑插值，展开时内容以 300ms 丝滑舒展，渐变遮罩由下至上柔和消散。

#### 5.4 浮动对照工作台与 AI/笔记卡片多屏对照联动动效缺失
- **相关代码**：[`PinWorkbench.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/PinWorkbench.astro#L28, #L909-L955, #L1065-L1170), [`ArticleSelectionDock.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/components/ArticleSelectionDock.astro#L1100-L1105), [`global.css`](file:///e:/搞搞新意思/个人博客/my-blog/src/styles/global.css#L9778-L9848)
- **代码现状与实测分析**：
  在 `PinWorkbench.astro` 中，系统设计了可自由拖拽、缩放的「浮动对照工作台」（`#pin-float-window`），并在右侧屏幕边缘设有「贴边收纳标签」（`#pin-edge-tab`）。当用户在正文划词或在抽屉中点击「钉住」时，调用 `window.__pinWorkbench.pinExcerpt(...)` 将引文或 AI 摘录收录进工作台，并通过 `ensureWindowPosition()` 自动居中避让右侧笔记抽屉呈现（如现场截图 11 所示：米色宣纸正文、居中半透明浮动工作台、右侧展开的笔记抽屉以及最右侧边缘标签四者和谐共存）。
- **微动效与交互缺失表现**：
  1. **跨抽屉钉入 AI 笔记缺少目标指向微轨迹**：在笔记抽屉内的 AI 问答卡片上点击 `[钉住]` 时，虽然底层有 `spawnFlyGhost`，但起点终点在多抽屉开启时未能精准映射到浮动工作台或边缘标签的当前三维坐标，视觉上缺乏「从笔记卡片飞入对照工作台」的平滑水墨抛物线；
  2. **双工作台对照时的联动回溯（Traceback）动效缺失**：用户在对照工作台中阅读已钉住的 AI 问答摘录，点击 `[定位]` 按钮时，目前仅支持正文滚动并播放 `pin-source-pulse`。如果该卡片来源于墨问问答，无法反向定位并高亮墨问对话流中的提问轮次（Turn）；
  3. **工作台「贴边/展开」时的空间折叠与层级遮挡**：点击工作台右上角的 `[>> 贴边]` 时，浮动窗口以 WAAPI 平滑滑向屏幕右侧边缘标签（`dockWindow`，740ms），但在笔记抽屉同时处于打开状态时，边缘标签在抽屉后方，缺乏空间景深层级过渡，容易造成视觉穿透或被盖住的感知困惑。
- **推荐微动效方案**：
  1. 统一 `pinExcerpt` 动画管线：在任何面板（正文微托盘、笔记抽屉卡片、墨问回答气泡）点击「钉住」时，提取源卡片缩略轮廓，以三阶贝塞尔抛物线飞向对照工作台，目标工作台对应卡片以 FLIP 平滑下移展开接纳；
  2. 增强卡片定位反向联动：点击工作台内 AI 卡片的 `[定位]`，若墨问抽屉未打开则自动拉开墨问抽屉，并将目标问答轮次气泡以淡金色边框脉冲高亮（Pulse Glow 1.8s）；
  3. 贴边收纳景深感知：贴边时根据笔记抽屉的开闭状态动态调整层级与目标锚点，提供柔和的景深模糊与缩放（Scale 1.0 -> 0.85 -> Edge Tab 吸纳）。
- **截图佐证**：
  ![浮动对照工作台与笔记抽屉多屏对照联动](/images/ai-notes-audit/11-pin-workbench-interaction.png)

---

## 维度 6：全站笔记中心 (`/notes`) 的 AI 交互孤岛与重排动效

#### 6.1 标签筛选重排缺少流体 FLIP 布局重排补间
- **相关代码**：[`src/pages/notes.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/pages/notes.astro#L77-L80, #L1943-L2360)
- **缺失表现**：
  在 `/notes` 页面点击 `[墨问 AI 问答]` 筛选分类时，非 AI 卡片直接突兀消失，剩余卡片直接跳跃到新的瀑布流网格位置，存在明显的视觉断层。
- **推荐微动效方案**：
  为全部卡片启用 FLIP 动画管线：被筛选掉的卡片以 `scale(0.9) opacity(0)` 缩散，保留的卡片记录初始绝对矩形（First Rect），在 DOM 重构后沿平滑曲线平移到新坐标（Last Rect），过渡时间 380ms。
- **截图佐证**：
  ![全站笔记中心 AI 分类视图](/images/ai-notes-audit/12-notes-page-ai-view.png)

#### 6.2 全站笔记中心内 AI 卡片无法直接唤起墨问继续探索
- **相关代码**：[`src/pages/notes.astro`](file:///e:/搞搞新意思/个人博客/my-blog/src/pages/notes.astro#L1730-L1820)
- **缺失表现**：
  卡片底部仅有「出自某文章 · 跳转原文 >」。全站独立页面环境下，墨问 AI 完全处于沉睡状态，无法针对该笔记做二次拓展、润色或答疑。
- **推荐微动效方案**：
  在卡片悬停时浮现「墨问解析」微按钮，点击后原地展开微型水墨问答气泡，或拉起右侧轻量伴读抽屉。

---

## 三、全量审计现场截图对照表

所有截图均已就地归档至 `public/images/ai-notes-audit/` 目录下，并已在 Git 版本控制中就绪：

| 序号 | 截图文件名 | 交互场景与核心问题说明 |
|:---:|:---|:---|
| **01** | [`01-selection-dock-ask.png`](/images/ai-notes-audit/01-selection-dock-ask.png) | **划词微托盘**：选区生成底端微胶囊，点击「墨问」缺少文字飞入与轨迹连接 |
| **02** | [`02-ink-ask-empty-state.png`](/images/ai-notes-audit/02-ink-ask-empty-state.png) | **墨问伴读开卷**：欢迎页与四张预设卡片，hover 与点击缺少吸入变形动效 |
| **03** | [`03-ink-ask-streaming-state.png`](/images/ai-notes-audit/03-ink-ask-streaming-state.png) | **推敲生成中**：回答流式输出时缺少水墨呼吸打字光标与段落层叠渗入 |
| **04** | [`04-ink-ask-answer-save-note.png`](/images/ai-notes-audit/04-ink-ask-answer-save-note.png) | **回答完成态**：底部操作栏展示「存入笔记」与「复制」，排版精炼但缺少入场过渡与触感反馈 |
| **05** | [`05-save-note-closed-drawer-disconnect.png`](/images/ai-notes-audit/05-save-note-closed-drawer-disconnect.png) | **单抽屉盲存**：点击存入后仅按钮改字，右侧笔记抽屉关闭，用户产生严重的存储迷失感 |
| **06** | [`06-companion-seg-tab-switch.png`](/images/ai-notes-audit/06-companion-seg-tab-switch.png) | **顶部分段互切**：缺少 iOS 风格滑动胶囊背景滑块，切换略带闪烁 |
| **07** | [`07-split-mode-overview.png`](/images/ai-notes-audit/07-split-mode-overview.png) | **双卷并排宏观**：左墨问·右笔记并排展开，空间宏大，但两卷展开缺乏经卷舒展层次感 |
| **08** | [`08-split-mode-save-cross-panel.png`](/images/ai-notes-audit/08-split-mode-save-cross-panel.png) | **并排跨面板飞渡**：左侧点击存入，右侧虽然落座，但缺少穿越中缝的微光飞线 |
| **09** | [`09-notes-drawer-ai-cards.png`](/images/ai-notes-audit/09-notes-drawer-ai-cards.png) | **笔记卡片解构**：AI 笔记卡片缺少一键追问墨问入口，成为单向孤岛 |
| **10** | [`10-splitter-drag-feedback.png`](/images/ai-notes-audit/10-splitter-drag-feedback.png) | **中缝拖拽与气泡**：中缝缺少极值阻尼橡皮筋回弹，双击复位缺少弹簧动画 |
| **11** | [`11-pin-workbench-interaction.png`](/images/ai-notes-audit/11-pin-workbench-interaction.png) | **对照工作台多屏联动**：正文、浮动对照工作台、笔记抽屉与右边缘标签多屏并存，卡片跨抽屉钉入与回跳墨问问答缺少视觉引导轨迹 |
| **12** | [`12-notes-page-ai-view.png`](/images/ai-notes-audit/12-notes-page-ai-view.png) | **全站笔记中心**：AI 问答摘录瀑布流重排突兀，缺乏原地追问与流体 FLIP 排版 |

---

## 四、水墨书斋微动效参数规范推荐 (Motion Tokens)

为确保未来的动效实现与整站水墨克制、文人典雅的气质高度契合，建议遵循以下设计参数系统：

### 4.1 缓动曲线参数规范 (Easing Curves)

| 动效 Token 名称 | 贝塞尔曲线 (Bezier Curve) | 物理感知模型 | 适用场景 |
|:---|:---|:---|:---|
| `--motion-spring-paper` | `cubic-bezier(0.16, 1, 0.3, 1)` | 宣纸沉稳舒展（超阻尼弹簧） | 伴读抽屉展开/收起、双卷并排、浮动工作台滑行 |
| `--motion-spring-tactile`| `cubic-bezier(0.34, 1.56, 0.64, 1)` | 金石印泥微弹（微回弹物理） | 快捷键按下反馈、分段器滑块移动、角标跳动、按钮下陷 |
| `--motion-ease-gentle`  | `cubic-bezier(0.2, 0.8, 0.2, 1)` | 微风轻拂（柔和缓入缓出） | 百分比气泡浮现、轻量微 Toast、卡片折叠手风琴 |
| `--motion-sine-breath`  | `cubic-bezier(0.45, 0.05, 0.55, 0.95)` | 着墨呼吸（平滑正弦正循环） | 墨问推敲中打字游标呼吸、宣纸微光流转 |

### 4.2 动效时长规范 (Duration Tiers)

| 时长 Token 名称 | 标准取值 | 视觉感知分层 | 适用交互元素 |
|:---|:---:|:---|:---|
| `--motion-duration-instant`| `120ms` | 瞬时微触感 | 按钮 `:active` 按压缩放、hover 亮度微变 |
| `--motion-duration-micro`  | `180ms ~ 220ms` | 细腻微反馈 | 分段器指示器滑移、角标跳动、操作条浮现 |
| `--motion-duration-flow`   | `320ms ~ 420ms` | 物体运动与飞渡 | 文字幽灵胶囊飞入、跨面板穿缝飞线、Toast 显隐 |
| `--motion-duration-scene`  | `540ms ~ 740ms` | 场景切换与空间延展 | 伴读抽屉展开、双卷舒展、对照工作台贴边吸附 |
| `--motion-duration-breath` | `1100ms ~ 1200ms` | 情绪韵律呼吸 | 墨问思考中打字光标正弦脉动 |

### 4.3 空间几何与微形变规范 (Transforms & Filters)

| 变换类型 | 参数区间 | 约束准则 |
|:---|:---|:---|
| **下按下沉 (Scale & Depress)** | `scale(0.92)` ~ `scale(0.96)` | 仅针对可交互按钮与胶囊，按压深度不超过 8%，严禁剧烈抖动 |
| **空间位移 (Translate 3D)**   | `translate3d(0, -2px, 0)` ~ `translate3d(0, 6px, 0)` | 强制使用 3D 硬件加速，卡片入场位移不超过 12px，保持文人沉静 |
| **模糊雾化 (Defocus & Veil)** | `blur(0px)` ~ `blur(4px)` | 卡片进退场或被遮挡时仅允许微量虚化，严禁过度模糊引发视觉疲劳 |

---

## 五、改造实施排期建议

1. **P0 紧急核心体验修复（解决盲存与时空断层）**：
   - 实现「存入笔记」飞渡微动效与单抽屉下的微 Toast + 顶部角标跳动（彻底解决用户不知存哪里的问题）；
   - 在笔记抽屉 AI 卡片上增设「追问墨问」回流微动效（打通单向孤岛）。
2. **P1 空间操控质感提升**：
   - 顶部分段器增加平滑滑动胶囊指示器（Sliding Pill Morph）；
   - 中缝分隔条增加极值橡皮筋阻尼与双击 50% 平滑弹簧回弹；
   - 浮动对照工作台跨面板钉入飞线与 AI 会话反向高亮定位。
3. **P2 细节打磨与全站连通**：
   - 选中文本呼叫墨问的文字幽灵飞入轨迹；
   - 全站 `/notes` 页面卡片筛选 FLIP 流体排版与原地微问答。

---
*报告生成于：2026-11-01 · 本文件遵照指示已放入本地版本控制并附带完整现场截图，未上传部署至任何服务器。*
