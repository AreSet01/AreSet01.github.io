/**
 * ReaderShelfGrid.tsx — 本地 Markdown 书架卡片网格 React 19 + Motion Island
 *
 * 通过 `@nanostores/react` 订阅 `localReaderStore`，使用 `motion/react` `AnimatePresence`
 * 与 `motion.article` 提供 120fps 纯合成器弹簧入场/退场与空状态过渡，
 * 同时无缝桥接 `initPaperCardPhysics` 3D 宣纸物理微倾与纸面光泽。
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  $readerDocs,
  $readerFilteredDocs,
  $readerNotesCountMap,
  $readerProgressMap,
  $readerShelfReady,
} from '../../stores/localReaderStore.ts';
import {
  buildLocalReaderSlug,
  type LocalReaderDocument,
} from '../../utils/localReaderStorage.ts';
import {
  formatProgressPercent,
  normalizeReadingSlug,
} from '../../utils/readingBookmarkEngine.ts';
import { initPaperCardPhysics } from '../../utils/cardMotion.ts';

function useSafeReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)')?.matches);
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(Boolean(mql?.matches));
    if (!mql || typeof mql.addEventListener !== 'function') return;
    const onChange = (e: MediaQueryListEvent) => setReduced(Boolean(e.matches));
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

function formatWordCount(count: number): string {
  if (count >= 10000) return `${(count / 10000).toFixed(1)}w`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count || 0);
}

function formatRelativeTime(ts: number): string {
  if (!ts) return '刚刚';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface ReaderShelfGridProps {
  onOpenDoc?: (docId: string) => void;
  onReimportDoc?: (docId: string) => void;
  onChangeCategory?: (doc: LocalReaderDocument) => void;
  onDeleteDoc?: (doc: LocalReaderDocument) => void;
  onImportFiles?: () => void;
  onLoadSample?: () => void;
}

const CARD_SPRING = {
  type: 'spring' as const,
  stiffness: 340,
  damping: 30,
  mass: 0.78,
};

export function ReaderShelfGrid({
  onOpenDoc,
  onReimportDoc,
  onChangeCategory,
  onDeleteDoc,
  onImportFiles,
  onLoadSample,
}: ReaderShelfGridProps) {
  const allDocs = useStore($readerDocs);
  const filteredDocs = useStore($readerFilteredDocs);
  const progressMap = useStore($readerProgressMap);
  const notesCountMap = useStore($readerNotesCountMap);
  const shelfReady = useStore($readerShelfReady);
  const reduced = useSafeReducedMotion();
  const rootRef = useRef<HTMLDivElement | null>(null);

  const visibleSignature = useMemo(
    () => filteredDocs.map((d) => `${d.id}:${d.updatedAt}`).join('|'),
    [filteredDocs],
  );

  // 每次可见卡片集合稳定后重新挂载 3D 宣纸物理微倾（单一 rAF 弹簧）
  useEffect(() => {
    if (!shelfReady || filteredDocs.length === 0) return;
    let cleanup: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      cleanup = initPaperCardPhysics('#reader-shelf-island-host [data-paper-card]');
    }, reduced ? 0 : 120);
    return () => {
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, [shelfReady, visibleSignature, reduced, filteredDocs.length]);

  if (!shelfReady) {
    return null;
  }

  const isEmpty = filteredDocs.length === 0;
  const hasNoDocsAtAll = allDocs.length === 0;

  return (
    <div ref={rootRef} data-reader-shelf-island="">
      <AnimatePresence mode="wait" initial={false}>
        {isEmpty ? (
          <motion.section
            key={hasNoDocsAtAll ? 'reader-empty-virgin' : 'reader-empty-filtered'}
            id="reader-empty-state"
            className="mt-8 text-center py-16 panel max-w-xl mx-auto"
            initial={reduced ? false : { opacity: 0, y: 18, scale: 0.965 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.97 }}
            transition={reduced ? { duration: 0 } : CARD_SPRING}
          >
            <div className="w-16 h-16 rounded-full bg-[var(--bg-soft)] border border-[var(--rule)] flex items-center justify-center mx-auto mb-5 text-[var(--muted-strong)]">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
                <line x1="8" y1="7" x2="16" y2="7"></line>
                <line x1="8" y1="11" x2="14" y2="11"></line>
              </svg>
            </div>
            <h2 id="reader-empty-title" className="font-display text-xl text-[var(--text-strong)]">
              {hasNoDocsAtAll ? '书架暂时空着' : '当前筛选下没有匹配的文稿'}
            </h2>
            <p
              id="reader-empty-desc"
              className="mt-3 text-sm text-[var(--muted-strong)] leading-relaxed max-w-md mx-auto"
            >
              {hasNoDocsAtAll
                ? '把本地的 Markdown 笔记或整套技术文档文件夹拖到这里，即可获得与博客正式文章完全一致的排版、代码高亮、Mermaid 图表、划线批注与墨问伴读体验。'
                : '可以切换分类、清空搜索词，或直接拖入新的 Markdown 文件。'}
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                id="reader-empty-import-btn"
                className="btn-primary reader-action-btn"
                onClick={() => onImportFiles?.()}
              >
                <span>选择本地 .md 文件</span>
              </button>
              {hasNoDocsAtAll ? (
                <button
                  type="button"
                  id="reader-load-sample-btn"
                  className="btn-secondary reader-action-btn"
                  onClick={() => onLoadSample?.()}
                >
                  <span>载入示例文稿体验</span>
                </button>
              ) : null}
            </div>
          </motion.section>
        ) : (
          <motion.section
            key="reader-shelf-grid-active"
            id="reader-shelf-grid"
            className="reader-shelf-grid"
            aria-label="本地文稿书架"
            initial={false}
          >
            <AnimatePresence mode="popLayout" initial={true}>
              {filteredDocs.map((doc, index) => {
                const slug = normalizeReadingSlug(buildLocalReaderSlug(doc.id));
                const prog = progressMap[slug];
                const pct = prog ? formatProgressPercent(prog.progress) : 0;
                const notesCount = notesCountMap[slug] || 0;
                const assetCount = doc.assetPaths?.length || 0;
                const showProgress = Boolean(prog && prog.progress >= 0.04);

                return (
                  <motion.article
                    key={doc.id}
                    layout={reduced ? false : 'position'}
                    className="reader-doc-card panel"
                    tabIndex={0}
                    role="button"
                    data-paper-card=""
                    data-doc-id={doc.id}
                    aria-label={`打开文稿：${doc.title}`}
                    initial={
                      reduced
                        ? false
                        : { opacity: 0, y: 26, scale: 0.945 }
                    }
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={
                      reduced
                        ? { opacity: 0 }
                        : { opacity: 0, y: -14, scale: 0.95 }
                    }
                    transition={
                      reduced
                        ? { duration: 0 }
                        : {
                            ...CARD_SPRING,
                            delay: Math.min(index, 8) * 0.036,
                          }
                    }
                    onClick={() => onOpenDoc?.(doc.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        if ((e.target as HTMLElement)?.closest('[data-card-actions]')) return;
                        e.preventDefault();
                        onOpenDoc?.(doc.id);
                      }
                    }}
                  >
                    <div className="reader-card-top">
                      <div className="reader-card-badges">
                        <span className="reader-card-cat">{doc.category || '技术文档'}</span>
                        {assetCount > 0 ? (
                          <span
                            className="reader-card-asset-pill"
                            title={`已关联 ${assetCount} 张本地图片`}
                          >
                            含 {assetCount} 图
                          </span>
                        ) : null}
                        {notesCount > 0 ? (
                          <span
                            className="reader-card-asset-pill"
                            title={`已有 ${notesCount} 条划线或批注`}
                          >
                            {notesCount} 条笔记
                          </span>
                        ) : null}
                      </div>

                      <div className="reader-card-actions" data-card-actions="">
                        <button
                          type="button"
                          className="reader-card-icon-btn"
                          data-action="reimport"
                          title="重导更新正文（保留笔记与书签）"
                          aria-label="重导更新"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReimportDoc?.(doc.id);
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="23 4 23 10 17 10"></polyline>
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="reader-card-icon-btn"
                          data-action="category"
                          title="修改分类"
                          aria-label="修改分类"
                          onClick={(e) => {
                            e.stopPropagation();
                            onChangeCategory?.(doc);
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                            <line x1="7" y1="7" x2="7.01" y2="7"></line>
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="reader-card-icon-btn is-danger"
                          data-action="delete"
                          title="从本地书架移除"
                          aria-label="删除文稿"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteDoc?.(doc);
                          }}
                        >
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                            <path d="M10 11v6"></path>
                            <path d="M14 11v6"></path>
                          </svg>
                        </button>
                      </div>
                    </div>

                    <h2 className="reader-card-title">{doc.title}</h2>
                    <p className="reader-card-desc">{doc.description || doc.fileName}</p>

                    {doc.tags && doc.tags.length > 0 ? (
                      <div className="reader-card-tags">
                        {doc.tags.slice(0, 3).map((tag) => (
                          <span key={tag} className="reader-card-tag">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    ) : null}

                    <div className="reader-card-footer">
                      <div className="reader-card-meta">
                        <span title={doc.fileName}>{doc.fileName}</span>
                        <span className="opacity-40">·</span>
                        <span>{formatWordCount(doc.wordCount)} 字</span>
                        <span className="opacity-40">·</span>
                        <span>{doc.readingMinutes || 1} min</span>
                      </div>
                      <div className="reader-card-right">
                        {prog && prog.completed ? (
                          <span className="reader-card-progress-pill is-done">已读完</span>
                        ) : showProgress ? (
                          <span className="reader-card-progress-pill is-reading">已阅 {pct}%</span>
                        ) : (
                          <span className="reader-card-time">
                            {formatRelativeTime(doc.lastOpenedAt || doc.updatedAt)}
                          </span>
                        )}
                      </div>
                    </div>

                    {showProgress ? (
                      <div className="reader-card-progress-track" aria-hidden="true">
                        <span style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    ) : null}
                  </motion.article>
                );
              })}
            </AnimatePresence>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

export interface ReaderShelfIslandHandle {
  unmount: () => void;
}

export function mountReaderShelfIsland(
  container: HTMLElement,
  props: ReaderShelfGridProps = {},
): ReaderShelfIslandHandle {
  let root: Root | null = createRoot(container);
  try {
    flushSync(() => {
      root?.render(<ReaderShelfGrid {...props} />);
    });
  } catch {
    root.render(<ReaderShelfGrid {...props} />);
  }

  return {
    unmount() {
      if (!root) return;
      const current = root;
      root = null;
      try {
        current.unmount();
      } catch {}
    },
  };
}

export default ReaderShelfGrid;
