/* eslint-disable */
import { useLoginStore } from "../stores";

/**
 * useLoginGate — Promise-based login gating primitives.
 *
 * Replaces the legacy `requireLogin`/`execute` callback-queue pattern. The
 * gate now intercepts pointerdown (so focus only lands AFTER the PIN
 * succeeds), keeping typing from being interrupted mid-keystroke.
 *
 * Pattern convention: name the gate `gate` in callers, e.g.
 *   const gate = useGatedInput();
 *   <TextInput_ {...gate} ... />
 *
 *   const editPrice = useGatedAction(handleEditPrice, { level: "Admin" });
 *   <Button_ onPress={editPrice} ... />
 */

export function sessionValid(level) {
  return useLoginStore.getState().isSessionValid({ level });
}

/**
 * useGatedInput — returns { onPointerDown, onFocus } that block input until
 * the session is valid. On success, the original target re-focuses so the
 * user lands inside the field automatically.
 *
 * Optional `level` requests a higher-privilege user (manager override).
 */
export function useGatedInput({ level } = {}) {
  return {
    onPointerDown: (e) => {
      const store = useLoginStore.getState();
      if (store.isSessionValid({ level })) return;
      e.preventDefault();
      const target = e.currentTarget;
      store.promptLogin({ level }).then((ok) => {
        if (ok && target) target.focus();
      });
    },
    onFocus: (e) => {
      const store = useLoginStore.getState();
      if (store.isSessionValid({ level })) return;
      const target = e.currentTarget;
      target.blur();
      store.promptLogin({ level }).then((ok) => {
        if (ok && target) target.focus();
      });
    },
  };
}

/**
 * useGatedAction — wraps an action function so it only runs after a valid
 * session (optionally at `level` or higher). Forwards args to the action.
 */
export function useGatedAction(action, { level } = {}) {
  return (...args) => {
    const store = useLoginStore.getState();
    if (store.isSessionValid({ level })) {
      action(...args);
      return;
    }
    store.promptLogin({ level }).then((ok) => {
      if (ok) action(...args);
    });
  };
}
