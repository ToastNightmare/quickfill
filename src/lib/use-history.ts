import { useReducer, useCallback } from "react";
import type { EditorField } from "./types";

const MAX_HISTORY = 50;

interface HistoryState {
  past: EditorField[][];
  present: EditorField[];
  future: EditorField[][];
}

type HistoryAction =
  | { type: "SET"; updater: EditorField[] | ((prev: EditorField[]) => EditorField[]) }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "RESET"; fields: EditorField[] };

function reducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case "SET": {
      const next =
        typeof action.updater === "function"
          ? action.updater(state.present)
          : action.updater;
      const newPast = [...state.past, state.present];
      return {
        past: newPast.length > MAX_HISTORY ? newPast.slice(newPast.length - MAX_HISTORY) : newPast,
        present: next,
        future: [],
      };
    }
    case "UNDO": {
      if (state.past.length === 0) return state;
      const newPast = [...state.past];
      const previous = newPast.pop()!;
      return {
        past: newPast,
        present: previous,
        future: [...state.future, state.present],
      };
    }
    case "REDO": {
      if (state.future.length === 0) return state;
      const newFuture = [...state.future];
      const next = newFuture.pop()!;
      return {
        past: [...state.past, state.present],
        present: next,
        future: newFuture,
      };
    }
    case "RESET":
      return { past: [], present: action.fields, future: [] };
  }
}

export function useHistory(initial: EditorField[] = []) {
  const [state, dispatch] = useReducer(reducer, {
    past: [],
    present: initial,
    future: [],
  });

  const set = useCallback(
    (updater: EditorField[] | ((prev: EditorField[]) => EditorField[])) => {
      dispatch({ type: "SET", updater });
    },
    []
  );

  const undo = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo = useCallback(() => dispatch({ type: "REDO" }), []);
  const reset = useCallback(
    (fields: EditorField[] = []) => dispatch({ type: "RESET", fields }),
    []
  );

  return {
    fields: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
