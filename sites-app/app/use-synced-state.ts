"use client";
import { useState } from "react";

/**
 * Keep a controlled local value responsive to prop changes without copying
 * props into state from an effect. The returned value immediately reflects a
 * new source value; user edits remain local until the source changes again.
 */
export function useSyncedState<T>(source: T): [T, (next: T) => void] {
  const [state, setState] = useState({ source, value: source });
  const value = Object.is(state.source, source) ? state.value : source;
  const setValue = (next: T) => setState({ source, value: next });
  return [value, setValue];
}
