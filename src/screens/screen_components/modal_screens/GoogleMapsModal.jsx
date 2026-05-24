/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button } from "../../../dom_components";
import { useZ } from "../../../hooks/useZ";

import { useLayoutStore } from "../../../stores";
import { GOOGLE_MAPS_API_KEY } from "../../../private_user_constants";
import styles from "./GoogleMapsModal.module.css";

let googleMapsLoadPromise = null;

function loadGoogleMapsAPI() {
  if (window.google?.maps) return Promise.resolve();
  if (googleMapsLoadPromise) return googleMapsLoadPromise;

  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => {
      googleMapsLoadPromise = null;
      reject(new Error("Failed to load Google Maps API"));
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadPromise;
}

export const GoogleMapsModal = ({
  visible,
  onClose,
  startAddress,
  endAddress,
}) => {
  const zDeviceType = useLayoutStore((s) => s.deviceType);
  const isTablet = zDeviceType === "tablet" || zDeviceType === "mobile";

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const z = useZ("modal", visible);

  const [sLoading, _setLoading] = useState(true);
  const [sError, _setError] = useState("");
  const [sDuration, _setDuration] = useState("");
  const [sDistance, _setDistance] = useState("");

  const initMap = useCallback(async () => {
    if (!mapContainerRef.current || !startAddress || !endAddress) return;

    _setLoading(true);
    _setError("");

    try {
      await loadGoogleMapsAPI();

      const map = new window.google.maps.Map(mapContainerRef.current, {
        zoom: 4,
        center: { lat: 26.35, lng: -81.8 },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
      }

      const renderer = new window.google.maps.DirectionsRenderer({
        map,
        suppressMarkers: true,
        suppressInfoWindows: true,
        polylineOptions: {
          strokeColor: "rgb(33, 148, 86)",
          strokeWeight: 5,
          strokeOpacity: 0.85,
        },
      });
      directionsRendererRef.current = renderer;

      const directionsService = new window.google.maps.DirectionsService();
      const result = await directionsService.route({
        origin: startAddress,
        destination: endAddress,
        travelMode: window.google.maps.TravelMode.DRIVING,
      });

      renderer.setDirections(result);

      const leg = result.routes[0].legs[0];

      new window.google.maps.Marker({
        position: leg.start_location,
        map,
        label: {
          text: "A",
          color: "#fff",
          fontWeight: "bold",
          fontSize: "14px",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "rgb(33, 148, 86)",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      new window.google.maps.Marker({
        position: leg.end_location,
        map,
        label: {
          text: "B",
          color: "#fff",
          fontWeight: "bold",
          fontSize: "14px",
        },
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: "rgb(53, 135, 210)",
          fillOpacity: 1,
          strokeColor: "#fff",
          strokeWeight: 2,
        },
      });

      _setDuration(leg.duration.text);
      _setDistance(leg.distance.text);
      _setLoading(false);
    } catch (err) {
      _setError(err.message || "Could not load directions");
      _setLoading(false);
    }
  }, [startAddress, endAddress]);

  useEffect(() => {
    if (visible) initMap();
  }, [visible, initMap]);

  useEffect(() => {
    if (!visible) {
      _setLoading(true);
      _setError("");
      _setDuration("");
      _setDistance("");
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
      mapRef.current = null;
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      style={{ zIndex: z }}
    >
      <div
        className={styles.innerWrap}
        onClick={(e) => e.stopPropagation()}
        style={{ width: isTablet ? "95%" : "70%", zIndex: z + 1 }}
      >
        <div
          className={styles.modal}
          style={{
            backgroundColor: C.backgroundWhite,
            borderColor: C.buttonLightGreenOutline,
          }}
        >
          <div
            className={styles.header}
            style={{ borderBottomColor: C.buttonLightGreenOutline }}
          >
            <div className={styles.headerLeft}>
              {!sLoading && !sError && sDuration ? (
                <>
                  <span className={styles.routeLabel} style={{ color: C.textMuted }}>
                    Time:
                  </span>
                  <span className={styles.routeValueGreen} style={{ color: C.green }}>
                    {sDuration}
                  </span>
                  <span className={styles.routeSep} style={{ color: C.textMuted }}>
                    |
                  </span>
                  <span className={styles.routeLabel} style={{ color: C.textMuted }}>
                    Distance:
                  </span>
                  <span className={styles.routeValueBlue} style={{ color: C.blue }}>
                    {sDistance}
                  </span>
                </>
              ) : (
                <span className={styles.routeFallback} style={{ color: C.text }}>
                  {sLoading && !sError ? "Loading route..." : sError ? "Route error" : "Route"}
                </span>
              )}
            </div>

            <Button
              text="Close"
              icon={ICONS.redx}
              iconSize={14}
              onPress={onClose}
              buttonStyle={{
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: C.borderSubtle,
                borderRadius: 5,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
              textStyle={{ color: C.text, fontSize: 13 }}
            />
          </div>

          <div className={styles.mapContainer}>
            <div ref={mapContainerRef} className={styles.mapHost} />

            {sLoading && !sError && (
              <div className={styles.loadingOverlay}>
                <span className={styles.loadingText} style={{ color: C.textMuted }}>
                  Loading map...
                </span>
              </div>
            )}

            {sError && (
              <div className={styles.errorOverlay}>
                <span className={styles.errorText} style={{ color: C.lightred }}>
                  {sError}
                </span>
                <div className={styles.retryBtnWrap}>
                  <Button
                    text="Retry"
                    onPress={initMap}
                    colorGradientArr={COLOR_GRADIENTS.blue}
                    buttonStyle={{
                      borderRadius: 5,
                      paddingHorizontal: 20,
                      paddingVertical: 8,
                    }}
                    textStyle={{ color: C.textWhite, fontSize: 14 }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
