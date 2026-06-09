/* eslint-disable */
import { useState, useRef, useEffect, useCallback } from "react";

/**
 * useAutoJumpBlock — short blocking overlay between an autocomplete pick and
 * the focus jump to the next field. While blocking, callers should render
 * <AutoJumpBlocker show={blocking} message={message} z={...} /> which captures
 * all pointer/keyboard input. After `durationMs`, the hook fires `onComplete`
 * (typically a focus move) and unblocks.
 *
 * Usage:
 *   const block = useAutoJumpBlock();
 *   block.trigger("Next: Description", () => focusDescription());
 */
export function useAutoJumpBlock(durationMs = 750) {
  const [blocking, _setBlocking] = useState(false);
  const [message, _setMessage] = useState("");
  const timerRef = useRef(null);

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    _setBlocking(false);
  }, []);

  const trigger = useCallback(
    (msg, onComplete) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      _setMessage(msg || "");
      _setBlocking(true);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        _setBlocking(false);
        if (typeof onComplete === "function") onComplete();
      }, durationMs);
    },
    [durationMs],
  );

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return { blocking, message, trigger, cancel };
}
