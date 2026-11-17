import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('墨问 AI 对话持久化与历史会话归档系统验证 (InkAsk Persistence & Multi-Session History)', () => {
  const rootDir = process.cwd();
  const inkAskPath = path.join(rootDir, 'src/components/InkAsk.astro');
  const serverAskPath = path.join(rootDir, 'server/ask.mjs');
  const storagePath = path.join(rootDir, 'src/utils/inkAskStorage.ts');

  it('1. 文件与模块结构: inkAskStorage 模块具备完整的数据模型与操作接口', () => {
    assert.ok(fs.existsSync(storagePath), 'inkAskStorage.ts 必须存在');
    const storageCode = fs.readFileSync(storagePath, 'utf8');

    assert.ok(storageCode.includes('loadArticleAskStore'), '必须导出 loadArticleAskStore');
    assert.ok(storageCode.includes('getActiveSession'), '必须导出 getActiveSession');
    assert.ok(storageCode.includes('appendTurn'), '必须导出 appendTurn');
    assert.ok(storageCode.includes('archiveAndNewSession'), '必须导出 archiveAndNewSession');
    assert.ok(storageCode.includes('switchActiveSession'), '必须导出 switchActiveSession');
    assert.ok(storageCode.includes('deleteSession'), '必须导出 deleteSession');
    assert.ok(storageCode.includes('clearAllSessions'), '必须导出 clearAllSessions');
    assert.ok(storageCode.includes('getRecentHistoryMessages'), '必须导出 getRecentHistoryMessages');
    assert.ok(storageCode.includes('QuotaExceededError'), '必须具备 localStorage 爆仓防御处理机制');
  });

  it('2. 界面与交互入口: 墨问抽屉顶部操作栏具备「历史对话」按钮与折叠面板', () => {
    assert.ok(fs.existsSync(inkAskPath), 'InkAsk.astro 必须存在');
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(content.includes('ink-ask-drawer-history-btn'), '抽屉顶部必须包含历史对话切换按钮');
    assert.ok(content.includes('ICON_HISTORY'), '必须定义专属水墨历史时钟矢量图标');
    assert.ok(content.includes('ink-ask-history-panel'), '抽屉顶部必须内嵌历史会话面板容器');
    assert.ok(content.includes('ink-ask-history-clear'), '历史面板中必须具备一键清空历史对话操作');
    assert.ok(content.includes('ink-ask-history-item-del'), '每个历史会话项必须具备单条删除微按钮');
  });

  it('3. 会话恢复与多轮连贯: 抽屉初始化自动回填上一回问答，追问时附带上下文', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    assert.ok(content.includes('loadAndRenderActiveSession'), '必须具备会话加载与恢复渲染函数');
    assert.ok(content.includes('getRecentHistoryMessages'), '发起网络请求前必须提取近期上下文');
    assert.ok(content.includes('history: recentHistory'), '向后端 /api/ask 发送 payload 时必须包含 history 字段');
    assert.ok(content.includes('updateActiveTurnAnswer'), '推演流结束时必须将最终答案更新回持久化存储');
  });

  it('4. 选区小窗联动: 划词即时问答自动并入文章墨问伴读历史', () => {
    const content = fs.readFileSync(inkAskPath, 'utf8');

    // 划词卡片完成后保存到当前文章的墨问历史
    const match = content.match(/function\s+ask\(s:\s*Session[\s\S]*?storeAppendTurn\([\s\S]*?reloadDrawerSession/);
    assert.ok(match, '划词小窗问答完成后必须调用 storeAppendTurn 保存并通知抽屉刷新');
  });

  it('5. 服务端兼容性: server/ask.mjs 支持解析多轮 history 并构建连贯 prompt', () => {
    assert.ok(fs.existsSync(serverAskPath), 'server/ask.mjs 必须存在');
    const serverCode = fs.readFileSync(serverAskPath, 'utf8');

    assert.ok(serverCode.includes('input?.history'), '服务端必须支持解析 input.history 数组');
    assert.ok(serverCode.includes('historyKeyStr'), '服务端缓存键必须加入多轮历史维度防碰撞');
    assert.ok(serverCode.includes('buildMessages') && serverCode.includes('history'), 'buildMessages 必须接收并处理 history 消息');
  });
});
