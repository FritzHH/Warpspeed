import { useEffect, useRef } from "react";
import { claimZ, releaseZ } from "../styles";

// Claims a z-index slot from the given band for the component's lifetime and
// auto-releases on unmount. Pass active=false to release while the component
// stays mounted (toggle visibility without unmount).
// Bands: "modal" | "dropdown" | "tooltip" | "toast" | "alert" | "debug".
export function useZ(band, active = true) {
  const zRef = useRef(0);

  if (active && zRef.current === 0) {
    zRef.current = claimZ(band);
  } else if (!active && zRef.current !== 0) {
    releaseZ(band, zRef.current);
    zRef.current = 0;
  }

  useEffect(
    () => () => {
      if (zRef.current !== 0) {
        releaseZ(band, zRef.current);
        zRef.current = 0;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return zRef.current;
}
