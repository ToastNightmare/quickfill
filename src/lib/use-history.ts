import { useState, useCallback } from "react";
import type { EditorField } from "./types";

export function useHistory(initial: EditorField[] = []) {
  const [past, setPast] = useState<EditorField[][]>([]);
  const [present, setPresent] = useState<EditorField[]>(initial);
  const [future, setFuture] = useState<EditorField[][]>([]);

  const set = useCallback(
    (newFields: EditorField[] | ((prev: EditorField[]) => EditorField[])) => {
      setPresent((prev) => {
        const next =
          typeof newFields === "function" ? newFields(prev) : newFields;
        setPast((p) => [...p, prev]);
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
