import { useState, useCallback } from "react";
import type { EditorField } from "./types";

const MAX_HISTORY = 50;

export function useHistory(initial: EditorField[] = []) {
  const [past, setPast] = useState<EditorField[][]>([]);
  const [present, setPresent] = useState<EditorField[]>(initial);
  const [future, setFuture] = useState<EditorField[][]>([]);

  const set = useCallback(
    (newFields: EditorField[] | ((prev: EditorField[]) => EditorField[])) => {
      setPresent((prev) => {
        const next =
          typeof newFields === "function" ? newFields(prev) : newFields;
        setPast((p) => {
          const updated = [...p, prev];
          // Cap history to MAX_HISTORY states to prevent memory bloat
          return updated.length > MAX_HISTORY ? updated.slice(updated.length - MAX_HISTORY) : updated;
        });
        setFuture([]);
        return next;
      });
    },
    []
  );

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const newPast = [...p];
      const previous = newPast.pop()!;
      setPresent((current) => {
        setFuture((f) => [...f, current]);
        return previous;
      });
      return newPast;
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const newFuture = [...f];
      const next = newFuture.pop()!;
      setPresent((current) => {
        setPast((p) => [...p, current]);
        return next;
      });
      return newFuture;
    });
  }, []);

  const reset = useCallback((fields: EditorField[] = []) => {
    setPast([]);
    setFuture([]);
    setPresent(fields);
  }, []);

  return {
    fields: present,
    set,
    undo,
    redo,
    reset,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}
