import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react';
import {
  DEFAULT_SETTINGS,
  type Batch,
  type Label,
  type TemplateSettings,
} from '../lib/types';
import { loadBatches, loadSettings, saveBatches, saveSettings } from '../lib/storage';

export type Screen = 'overview' | 'batches' | 'import' | 'template';

interface State {
  ready: boolean;
  screen: Screen;
  batches: Batch[];
  /** Id of the batch currently open on the Batches screen. */
  activeBatchId: string | null;
  /** Id of the label shown in the preview panel. */
  activeLabelId: string | null;
  settings: TemplateSettings;
  search: string;
}

type Action =
  | { type: 'hydrated'; batches: Batch[]; settings: TemplateSettings }
  | { type: 'navigate'; screen: Screen }
  | { type: 'openBatch'; batchId: string }
  | { type: 'addBatch'; batch: Batch }
  | { type: 'removeBatch'; batchId: string }
  | { type: 'selectLabel'; labelId: string }
  | { type: 'patchLabel'; batchId: string; labelId: string; patch: Partial<Label> }
  | { type: 'addLabel'; batchId: string; label: Label }
  | { type: 'deleteLabel'; batchId: string; labelId: string }
  | { type: 'setSelection'; batchId: string; labelIds: string[]; selected: boolean }
  | { type: 'markPrinted'; batchId: string }
  | { type: 'patchSettings'; patch: Partial<TemplateSettings> }
  | { type: 'setSearch'; value: string };

const initial: State = {
  ready: false,
  screen: 'import',
  batches: [],
  activeBatchId: null,
  activeLabelId: null,
  settings: DEFAULT_SETTINGS,
  search: '',
};

function mapBatch(state: State, batchId: string, fn: (b: Batch) => Batch): Batch[] {
  return state.batches.map((b) => (b.id === batchId ? fn(b) : b));
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'hydrated': {
      const first = action.batches[0];
      return {
        ...state,
        ready: true,
        batches: action.batches,
        settings: action.settings,
        activeBatchId: first?.id ?? null,
        activeLabelId: first?.labels[0]?.id ?? null,
      };
    }

    case 'navigate':
      return { ...state, screen: action.screen };

    case 'openBatch': {
      const batch = state.batches.find((b) => b.id === action.batchId);
      return {
        ...state,
        screen: 'batches',
        activeBatchId: action.batchId,
        activeLabelId: batch?.labels[0]?.id ?? null,
      };
    }

    case 'addBatch':
      return {
        ...state,
        screen: 'batches',
        batches: [action.batch, ...state.batches],
        activeBatchId: action.batch.id,
        activeLabelId: action.batch.labels[0]?.id ?? null,
      };

    case 'removeBatch': {
      const batches = state.batches.filter((b) => b.id !== action.batchId);
      const stillActive = state.activeBatchId !== action.batchId;
      const next = batches[0];
      return {
        ...state,
        batches,
        activeBatchId: stillActive ? state.activeBatchId : (next?.id ?? null),
        activeLabelId: stillActive ? state.activeLabelId : (next?.labels[0]?.id ?? null),
      };
    }

    case 'selectLabel':
      return { ...state, activeLabelId: action.labelId };

    case 'patchLabel':
      return {
        ...state,
        batches: mapBatch(state, action.batchId, (b) => ({
          ...b,
          labels: b.labels.map((l) => (l.id === action.labelId ? { ...l, ...action.patch } : l)),
        })),
      };

    case 'addLabel':
      return {
        ...state,
        activeLabelId: action.label.id,
        batches: mapBatch(state, action.batchId, (b) => ({
          ...b,
          labels: [action.label, ...b.labels],
        })),
      };

    case 'deleteLabel': {
      const batches = mapBatch(state, action.batchId, (b) => ({
        ...b,
        labels: b.labels.filter((l) => l.id !== action.labelId),
      }));
      const active = batches.find((b) => b.id === action.batchId);
      return {
        ...state,
        batches,
        activeLabelId:
          state.activeLabelId === action.labelId
            ? (active?.labels[0]?.id ?? null)
            : state.activeLabelId,
      };
    }

    case 'setSelection': {
      const ids = new Set(action.labelIds);
      return {
        ...state,
        batches: mapBatch(state, action.batchId, (b) => ({
          ...b,
          labels: b.labels.map((l) => (ids.has(l.id) ? { ...l, selected: action.selected } : l)),
        })),
      };
    }

    case 'markPrinted':
      return {
        ...state,
        batches: mapBatch(state, action.batchId, (b) => ({
          ...b,
          printedAt: new Date().toISOString(),
        })),
      };

    case 'patchSettings':
      return { ...state, settings: { ...state.settings, ...action.patch } };

    case 'setSearch':
      return { ...state, search: action.value };
  }
}

interface Store extends State {
  activeBatch: Batch | null;
  activeLabel: Label | null;
  dispatch: (action: Action) => void;
  navigate: (screen: Screen) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);

  // Hydrate from IndexedDB once on mount.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [batches, settings] = await Promise.all([loadBatches(), loadSettings()]);
      if (!cancelled) dispatch({ type: 'hydrated', batches, settings });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist batches whenever they change (after hydration).
  useEffect(() => {
    if (!state.ready) return;
    void saveBatches(state.batches);
  }, [state.ready, state.batches]);

  useEffect(() => {
    if (!state.ready) return;
    void saveSettings(state.settings);
  }, [state.ready, state.settings]);

  const activeBatch = useMemo(
    () => state.batches.find((b) => b.id === state.activeBatchId) ?? null,
    [state.batches, state.activeBatchId],
  );

  const activeLabel = useMemo(
    () => activeBatch?.labels.find((l) => l.id === state.activeLabelId) ?? null,
    [activeBatch, state.activeLabelId],
  );

  const navigate = useCallback((screen: Screen) => dispatch({ type: 'navigate', screen }), []);

  const value = useMemo<Store>(
    () => ({ ...state, activeBatch, activeLabel, dispatch, navigate }),
    [state, activeBatch, activeLabel, navigate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
