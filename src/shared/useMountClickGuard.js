import { useCallback, useEffect, useRef } from "react";

export function useMountClickGuard(delayMs = 350) {
  const armedRef = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => {
      armedRef.current = false;
    }, delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);

  return useCallback((e) => {
    if (armedRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);
}
