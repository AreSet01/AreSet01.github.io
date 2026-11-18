/**
 * BookmarkPopoverList.tsx — 「本文夹签」一文多签管理列表 React 19 + Motion Island
 *
 * 通过 `@nanostores/react` 订阅 `readingStore.bookmarks`，使用 `motion/react`
 * `AnimatePresence` 实现竹签入夹弹簧浮现与撤签墨干消隐过渡（纯合成器 transform + opacity，零 filter: blur）。
 */

import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'motion/react';
import { bookmarks as bookmarksAtom } from '../../stores/readingStore.ts';
import { formatProgressPercent } from '../../utils/readingBookmarkEngine.ts';

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

export interface BookmarkPopoverListProps {
  onJumpBookmark?: (bookmarkId: string) => void;
  onDeleteBookmark?: (bookmarkId: string) => void;
}

export function BookmarkPopoverList({
  onJumpBookmark,
  onDeleteBookmark,
}: BookmarkPopoverListProps) {
  const items = useStore(bookmarksAtom);
  const reduced = useSafeReducedMotion();

  if (items.length === 0) {
    return (
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key="rbm-empty"
          className="rbm-empty"
          initial={reduced ? false : { opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? { opacity: 0 } : { opacity: 0, y: -4 }}
          transition={reduced ? { duration: 0 } : { duration: 0.18 }}
        >
          本文暂未夹签。
          <br />
          阅读时按 <kbd>B</kbd> 或划词点击「夹签」，即可在此留存多处书签。
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence initial={false}>
      {items.map((bm, index) => {
        const pct = formatProgressPercent(bm.progress);
        const sectionTitle = bm.headingText ? `§ ${bm.headingText}` : '正文段落';

        return (
          <motion.div
            key={bm.id}
            className="rbm-item"
            data-rbm-id={bm.id}
            initial={reduced ? false : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, x: 10, scale: 0.96 }}
            transition={
              reduced
                ? { duration: 0 }
                : {
                    type: 'spring',
                    stiffness: 480,
                    damping: 34,
                    mass: 0.72,
                    delay: Math.min(index, 6) * 0.015,
                  }
            }
          >
            <button
              type="button"
              className="rbm-item-main"
              data-rbm-jump={bm.id}
              onClick={() => onJumpBookmark?.(bm.id)}
            >
              <span className="rbm-item-meta">
                <span className="rbm-item-pct">{pct}%</span>
                <span className="rbm-item-heading">{sectionTitle}</span>
              </span>
              <p className="rbm-item-excerpt">{bm.excerpt}</p>
            </button>
            <button
              type="button"
              className="rbm-item-del"
              data-rbm-del={bm.id}
              aria-label="移除此书签"
              title="移除书签"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteBookmark?.(bm.id);
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.1"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </motion.div>
        );
      })}
    </AnimatePresence>
  );
}

export interface BookmarkIslandHandle {
  unmount: () => void;
}

export function mountBookmarkPopoverIsland(
  container: HTMLElement,
  props: BookmarkPopoverListProps = {}
): BookmarkIslandHandle {
  let root: Root | null = createRoot(container);
  try {
    flushSync(() => {
      root?.render(<BookmarkPopoverList {...props} />);
    });
  } catch {
    root.render(<BookmarkPopoverList {...props} />);
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

export default BookmarkPopoverList;
