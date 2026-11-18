/**
 * CommandPaletteResults.tsx — ⌘K 全局命令面板搜索结果 React 19 + Motion Island
 *
 * 采用 `@nanostores/react` 订阅 `commandPaletteStore`，并通过 `motion/react`
 * `AnimatePresence` + `motion.a` / `motion.button` 提供纯合成器弹簧入场与活跃墨脊游标。
 * 严格保留 `[data-search-result]`, `[data-index]`, `aria-selected`, `.is-active` 全部无障碍与测试契约。
 */

import React, { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  activeIndex as activeIndexAtom,
  effectiveCategory as effectiveCategoryAtom,
  indexState as indexStateAtom,
  items as itemsAtom,
  query as queryAtom,
  setActivePaletteIndex,
} from '../../stores/commandPaletteStore.ts';
import type { PaletteResultItem } from '../../utils/commandPaletteEngine.ts';

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

export interface CommandPaletteResultsProps {
  onSelectResult?: (
    index: number,
    item: PaletteResultItem,
    element: HTMLElement,
    event: React.MouseEvent<HTMLElement>
  ) => void;
  onHoverResult?: (index: number) => void;
}

function ResultInnerContent({ item }: { item: PaletteResultItem }) {
  const summary = item.summary || '';
  const chips = (item.chips || []).slice(0, 3);
  const metaRight = item.metaRight || '';
  const hasProgress = typeof item.progressRatio === 'number';
  const clampedRatio = hasProgress
    ? Math.max(0.03, Math.min(1, item.progressRatio as number)).toFixed(3)
    : '0';

  return (
    <>
      <div className="search-result-top">
        <div className="search-result-title-row">
          {item.badge ? (
            <span className="search-kind-badge" data-tone={item.badgeTone || 'muted'}>
              {item.badge}
            </span>
          ) : null}
          <p className="search-result-title">{item.title}</p>
        </div>
        <span className="search-result-date">{metaRight}</span>
      </div>
      <p className="search-result-summary">{summary}</p>
      {hasProgress ? (
        <div className="search-resume-track" aria-hidden="true">
          <span
            className="search-resume-fill"
            style={{ transform: `scaleX(${clampedRatio})` }}
          />
        </div>
      ) : null}
      {chips.length > 0 ? (
        <div className="search-result-meta">
          <div className="search-chip-group">
            {chips.map((tag, chipIdx) => (
              <span key={`${tag}-${chipIdx}`} className="search-chip">
                {tag}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

export function CommandPaletteResults({
  onSelectResult,
  onHoverResult,
}: CommandPaletteResultsProps) {
  const resultItems = useStore(itemsAtom);
  const currentActiveIndex = useStore(activeIndexAtom);
  const rawQuery = useStore(queryAtom);
  const currentIndexState = useStore(indexStateAtom);
  const currentCategory = useStore(effectiveCategoryAtom);
  const reduced = useSafeReducedMotion();
  const listWrapRef = useRef<HTMLDivElement | null>(null);

  const trimmedQuery = rawQuery.trim();

  useEffect(() => {
    if (currentActiveIndex < 0) return;
    const host = listWrapRef.current?.parentElement ?? listWrapRef.current;
    const activeNode = host?.querySelector<HTMLElement>(
      `[data-search-result][data-index="${currentActiveIndex}"]`
    );
    if (activeNode && typeof activeNode.scrollIntoView === 'function') {
      activeNode.scrollIntoView({ block: 'nearest' });
    }
  }, [currentActiveIndex, resultItems.length]);

  if (currentIndexState === 'loading' && resultItems.length === 0) {
    return (
      <div ref={listWrapRef} data-palette-island-root="">
        <motion.div
          key="palette-loading"
          className="search-empty"
          style={{ animation: 'none' }}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.2 }}
        >
          <p>正在装载全站书目与知识索引…</p>
        </motion.div>
      </div>
    );
  }

  if (currentIndexState === 'error' && resultItems.length === 0) {
    return (
      <div ref={listWrapRef} data-palette-island-root="">
        <motion.div
          key="palette-error"
          className="search-empty"
          style={{ animation: 'none' }}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.2 }}
        >
          <p>暂时无法加载文章索引，你仍可切换至「笔记」「导图」或「指令」使用。</p>
        </motion.div>
      </div>
    );
  }

  if (resultItems.length === 0) {
    return (
      <div ref={listWrapRef} data-palette-island-root="">
        <motion.div
          key={`palette-empty-${currentCategory}`}
          className="search-empty"
          style={{ animation: 'none' }}
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.2 }}
        >
          <p>
            {trimmedQuery
              ? '换个关键词试试，或按 Tab 切换分类、输入 > 执行快捷指令。'
              : '当前分类下暂无记录。'}
          </p>
        </motion.div>
      </div>
    );
  }

  let lastSection = '';
  const rows = resultItems.map((item, index) => {
    const showSection = Boolean(
      !trimmedQuery && item.sectionLabel && item.sectionLabel !== lastSection
    );
    if (showSection && item.sectionLabel) {
      lastSection = item.sectionLabel;
    }
    return { item, index, showSection, sectionLabel: item.sectionLabel };
  });

  const handleHover = (index: number) => {
    if (currentActiveIndex !== index) {
      setActivePaletteIndex(index);
    }
    onHoverResult?.(index);
  };

  return (
    <div ref={listWrapRef} data-palette-island-root="">
      <AnimatePresence initial={false}>
        {rows.map(({ item, index, showSection, sectionLabel }) => {
          const isActive = index === currentActiveIndex;
          const isCommandBtn = Boolean(item.actionId && !item.href);
          const itemSpring = reduced
            ? { duration: 0 }
            : {
                type: 'spring' as const,
                stiffness: 520,
                damping: 38,
                mass: 0.72,
                delay: Math.min(index, 7) * 0.015,
              };

          const activeSpine = isActive ? (
            <motion.span
              data-palette-active-indicator=""
              aria-hidden="true"
              initial={reduced ? false : { opacity: 0, scaleY: 0.32 }}
              animate={{ opacity: 1, scaleY: 1 }}
              style={{
                position: 'absolute',
                left: 0,
                top: '0.68rem',
                bottom: '0.68rem',
                width: '2px',
                borderRadius: '999px',
                background: 'var(--ink-strong)',
                transformOrigin: 'center center',
                pointerEvents: 'none',
              }}
              transition={
                reduced
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 560, damping: 36, mass: 0.62 }
              }
            />
          ) : null;

          const commonStyle: React.CSSProperties = {
            position: 'relative',
            animation: 'none',
          };

          return (
            <React.Fragment key={item.uid || `${item.kind}-${index}`}>
              {showSection && sectionLabel ? (
                <div className="search-section-header" role="presentation">
                  {sectionLabel}
                </div>
              ) : null}
              {isCommandBtn ? (
                <motion.button
                  type="button"
                  role="option"
                  className={`search-result search-result-btn${isActive ? ' is-active' : ''}`}
                  data-search-result=""
                  data-index={index}
                  data-kind={item.kind || 'command'}
                  aria-selected={isActive ? 'true' : 'false'}
                  style={commonStyle}
                  initial={reduced ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: 6 }}
                  transition={itemSpring}
                  onMouseMove={() => handleHover(index)}
                  onClick={(e) => {
                    if (onSelectResult) {
                      onSelectResult(index, item, e.currentTarget, e);
                    }
                  }}
                >
                  {activeSpine}
                  <ResultInnerContent item={item} />
                </motion.button>
              ) : (
                <motion.a
                  href={item.href || '#'}
                  role="option"
                  className={`search-result${isActive ? ' is-active' : ''}`}
                  data-search-result=""
                  data-index={index}
                  data-kind={item.kind || 'post'}
                  aria-selected={isActive ? 'true' : 'false'}
                  style={commonStyle}
                  initial={reduced ? false : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, x: 6 }}
                  transition={itemSpring}
                  onMouseMove={() => handleHover(index)}
                  onClick={(e) => {
                    if (onSelectResult) {
                      onSelectResult(index, item, e.currentTarget, e);
                    }
                  }}
                >
                  {activeSpine}
                  <ResultInnerContent item={item} />
                </motion.a>
              )}
            </React.Fragment>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export interface MountedIslandHandle {
  unmount: () => void;
}

export function mountCommandPaletteResultsIsland(
  container: HTMLElement,
  props: CommandPaletteResultsProps = {}
): MountedIslandHandle {
  let root: Root | null = createRoot(container);
  try {
    flushSync(() => {
      root?.render(<CommandPaletteResults {...props} />);
    });
  } catch {
    root.render(<CommandPaletteResults {...props} />);
  }

  return {
    unmount() {
      if (!root) return;
      const currentRoot = root;
      root = null;
      try {
        currentRoot.unmount();
      } catch {}
    },
  };
}

export default CommandPaletteResults;
