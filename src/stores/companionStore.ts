/**
 * companionStore.ts — Declarative Reactive State Store for Reader Companion (`nanostores`)
 *
 * Tracks spatial companion mode (`rail` | `notes-full` | `ask-full` | `split`) and panel geometry
 * (`notesOpen`, `askOpen`, `notesMaximized`, `askMaximized`, `splitActive`, `splitRatio`, `resizing`)
 * for `CompanionLayout.astro`, ensuring single-rail exclusivity and bounded split ratios.
 */

import { computed, map } from 'nanostores';
import {
  clampSplitRatio,
  maxSplitRatioForViewport,
  minSplitRatioForViewport,
  parseStoredRatio,
} from '../utils/companionSplit.ts';

export type CompanionKind = 'notes' | 'ask';
export type CompanionMode = 'rail' | 'notes-full' | 'ask-full' | 'split';

export interface CompanionState {
  mode: CompanionMode;
  lastActiveKind: CompanionKind;
  notesOpen: boolean;
  askOpen: boolean;
  notesMaximized: boolean;
  askMaximized: boolean;
  splitActive: boolean;
  splitRatio: number;
  resizing: boolean;
}

const INITIAL_COMPANION_STATE: CompanionState = {
  mode: 'rail',
  lastActiveKind: 'ask',
  notesOpen: false,
  askOpen: false,
  notesMaximized: false,
  askMaximized: false,
  splitActive: false,
  splitRatio: 0.5,
  resizing: false,
};

export const $companionState = map<CompanionState>({ ...INITIAL_COMPANION_STATE });

export const $isCompanionOverlayActive = computed(
  $companionState,
  (state) => state.mode !== 'rail'
);

export const $activeCompanionPanel = computed(
  $companionState,
  (state): CompanionKind | 'both' | null => {
    if (state.splitActive || (state.notesOpen && state.askOpen)) return 'both';
    if (state.notesOpen) return 'notes';
    if (state.askOpen) return 'ask';
    return null;
  }
);

export function clampCompanionRatioForViewport(ratio: number, viewportWidth?: number): number {
  const base = clampSplitRatio(ratio);
  if (typeof viewportWidth !== 'number' || !Number.isFinite(viewportWidth) || viewportWidth <= 0) {
    return base;
  }
  const min = minSplitRatioForViewport(viewportWidth);
  const max = maxSplitRatioForViewport(viewportWidth);
  return Math.min(max, Math.max(min, base));
}

export function hydrateCompanionSplitRatio(
  rawStored: string | null | undefined,
  viewportWidth?: number
): number {
  const parsed = parseStoredRatio(rawStored) ?? 0.5;
  const clamped = clampCompanionRatioForViewport(parsed, viewportWidth);
  $companionState.setKey('splitRatio', clamped);
  return clamped;
}

export function setCompanionSplitRatio(ratio: number, viewportWidth?: number): number {
  const clamped = clampCompanionRatioForViewport(ratio, viewportWidth);
  $companionState.setKey('splitRatio', clamped);
  return clamped;
}

export function setCompanionResizing(resizing: boolean): void {
  $companionState.setKey('resizing', Boolean(resizing));
}

export function setCompanionModeState(
  mode: CompanionMode,
  lastActiveKind?: CompanionKind
): CompanionState {
  const cur = $companionState.get();
  const next: CompanionState = {
    ...cur,
    mode,
    lastActiveKind: lastActiveKind ?? cur.lastActiveKind,
    splitActive: mode === 'split',
    notesMaximized: mode === 'notes-full',
    askMaximized: mode === 'ask-full',
  };
  $companionState.set(next);
  return next;
}

export function setCompanionPanelStatus(
  kind: CompanionKind,
  open: boolean,
  maximized?: boolean
): CompanionState {
  const cur = $companionState.get();
  const next: CompanionState = { ...cur };
  if (kind === 'notes') {
    next.notesOpen = Boolean(open);
    if (typeof maximized === 'boolean') next.notesMaximized = maximized;
    else if (!open) next.notesMaximized = false;
  } else {
    next.askOpen = Boolean(open);
    if (typeof maximized === 'boolean') next.askMaximized = maximized;
    else if (!open) next.askMaximized = false;
  }
  if (open) {
    next.lastActiveKind = kind;
  }
  $companionState.set(next);
  return next;
}

export function syncCompanionSnapshot(partial: Partial<CompanionState>): CompanionState {
  const cur = $companionState.get();
  const mode = partial.mode ?? cur.mode;
  const splitRatio =
    typeof partial.splitRatio === 'number'
      ? clampSplitRatio(partial.splitRatio)
      : cur.splitRatio;
  const next: CompanionState = {
    ...cur,
    ...partial,
    mode,
    splitActive: partial.splitActive ?? mode === 'split',
    splitRatio,
  };
  $companionState.set(next);
  return next;
}

export function resetCompanionStore(): void {
  $companionState.set({ ...INITIAL_COMPANION_STATE });
}
