import { useCallback, useState, type SetStateAction } from 'react';

export function usePersistedState<T>(
  key: string,
  initialState: T
): [T, (value: SetStateAction<T>) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      if (typeof window === 'undefined') {
        return initialState;
      }

      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialState;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialState;
    }
  });

  const setPersistedState = useCallback(
    (value: SetStateAction<T>) => {
      setState((currentValue) => {
        try {
          const nextValue =
            typeof value === 'function'
              ? (value as (previousValue: T) => T)(currentValue)
              : value;

          if (typeof window !== 'undefined') {
            window.localStorage.setItem(key, JSON.stringify(nextValue));
          }

          return nextValue;
        } catch (error) {
          console.error(`Error saving localStorage key "${key}":`, error);
          return currentValue;
        }
      });
    },
    [key]
  );

  return [state, setPersistedState];
}
