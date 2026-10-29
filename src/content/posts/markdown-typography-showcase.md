---
title: '「素笺」排版全景：Markdown 语法、数学公式与代码高亮'
description: '全景呈现水墨素笺主题的排版特性，包括层级标题、行内格式、注记卡片、数学公式与丰富代码高亮。'
pubDate: 2026-10-28
tags: ['排版', 'Markdown', 'KaTeX', '示例']
category: '设计与排版'
series: '主题使用手册'
seriesOrder: 1
---

# 「素笺」排版全景

> 素笺如雪，闲记平生。长卷微舒，字若惊鸿。

本文用于全景演示「清浅」博客主题的排版能力与阅读体验。无论是技术深度剖析、数学公式推导，还是随笔札记，主题均以温润的宣纸质感底纹与东方排版美学呈现。

---

## 一、 标题与文字层级

在排版设计中，清朗疏阔的标题层级能带给读者专注舒适的心境。

### 1.1 三级标题示例
正文段落具有自然的行距（1.85）与适中的行宽，段落之间留白考究。中英文混排时会自动通过 `remark-cjk-friendly` 处理**粗体间距**与标点避头尾。

#### 1.1.1 四级小节标题
深入技术实现时，细节层级依然井然有序。

---

## 二、 行内强调与注记卡片

你可以自由使用各种行内样式：
* **重要强调**：使用加粗文本突出核心概念。
* *诗意斜体*：用于名言警句或心情旁白。
* ~~删除线~~：记录已迭代废弃的方案。
* `行内代码`：高亮类名、函数与配置项，如 `createMarkdownProcessor()`。
* [超链接演示](https://github.com/AreSet01/AreSet01.github.io)：自然的平滑交互与下划线动效。

> [!NOTE]
> 这是一个 **注解卡片 (Note Callout)**。适合用于补充背景知识或提供额外的参考链接。

> [!TIP]
> 这是一个 **实用建议 (Tip Callout)**。推荐在写作长文时合理运用小标题与列表，增强可读性。

> [!WARNING]
> 这是一个 **注意事项 (Warning Callout)**。提醒读者在操作或配置时的关键前置依赖。

---

## 三、 数学公式支持 (KaTeX)

博客内置原生 KaTeX 公式渲染引擎，支持行内公式与跨行高精度排版。

### 3.1 行内公式
经典质能方程表达式为 $E = mc^2$，欧拉恒等式为 $e^{i\pi} + 1 = 0$。在正文中穿插公式时，行高始终保持稳定，不发生抖动。

### 3.2 独立公式块
对于复杂微积分、高斯分布或傅里叶变换：

$$
\int_{-\infty}^{+\infty} e^{-x^2} \, dx = \sqrt{\pi}
$$

高斯积分概率密度函数：

$$
f(x) = \frac{1}{\sigma \sqrt{2\pi}} \exp\left( -\frac{(x - \mu)^2}{2\sigma^2} \right)
$$

---

## 四、 代码高亮与代码块工具栏

代码块由 **Shiki** 强力驱动，支持多语言语法高亮、代码行号、代码块标题以及一键复制。

```typescript title="src/utils/greeting.ts" {3-5}
export interface GreetingOptions {
  name: string;
  salutation?: string;
  timestamp?: Date;
}

export function createWelcomeMessage(options: GreetingOptions): string {
  const { name, salutation = '你好', timestamp = new Date() } = options;
  const timeStr = timestamp.toLocaleTimeString('zh-CN', { hour12: false });
  return `[${timeStr}] ${salutation}，${name}！欢迎来到素笺阅读空间。`;
}
```

对于底层 C++ 代码与 Rust 逻辑，代码高亮同样清晰锐利：

```cpp title="MemoryPool.h"
#pragma once
#include <cstddef>
#include <new>

template <typename T, size_t BlockSize = 4096>
class SimpleMemoryPool {
public:
    SimpleMemoryPool() noexcept : freeListHead(nullptr) {}
    ~SimpleMemoryPool() { purge(); }

    T* allocate() {
        if (!freeListHead) replenish();
        Node* node = freeListHead;
        freeListHead = freeListHead->next;
        return reinterpret_cast<T*>(node);
    }

    void deallocate(T* ptr) noexcept {
        if (!ptr) return;
        auto* node = reinterpret_cast<Node*>(ptr);
        node->next = freeListHead;
        freeListHead = node;
    }

private:
    struct Node { Node* next; };
    Node* freeListHead;
    void replenish();
    void purge();
};
```

---

## 五、 表格与数据展示

博客表格自动具备**横向平滑滚动容器**支持，即便在手机窄屏视口下也能自如横向滑动查阅，绝不破坏页面宽度。

| 模块分类 | 核心特性 | 渲染机制 | 多端自适应 |
| :--- | :--- | :--- | :---: |
| **双卷工作台** | 伴读与文章推挤并排 | 弹性 Split 布局 | 完美适配 |
| **AI 划词伴读** | 钤印唤出、流式答疑 | SSE 打字机流 | 响应式折叠 |
| **全屏卡片笔记** | 瀑布流、颜色脊线 | LocalStorage 索引 | 触控支持 |
| **水墨雨境** | 烟雨微气象、程序白噪 | Web Audio + Canvas | 低功耗运行 |

---

## 六、 任务清单与列表排版

日常待办与计划清单：
- [x] 完成博客主题东方美学重构
- [x] 实现双卷推挤并排工作台
- [x] 集成 AI 划词伴读打字机流
- [ ] 编写更多优质的技术长文与随笔

无序列表示例：
- **凝**：静默沉思，蓄势待发
- **落**：落墨成线，点染篇章
- **散**：行云流水，气象万千

---

## 七、 结语

在当前页面中，你可以随意**用鼠标划选一段文字**体验印章与伴读问答，或者点击右上角的伴读按钮展开双卷工作台！
