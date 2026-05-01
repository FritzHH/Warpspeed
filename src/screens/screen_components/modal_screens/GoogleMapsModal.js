/* eslint-disable */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { View, Text } from "react-native-web";
import { C, COLOR_GRADIENTS, ICONS } from "../../../styles";
import { Button_ } from "../../../components";
import { gray } from "../../../utils";
import { useLayoutStore } from "../../../stores";
import { GOOGLE_MAPS_API_KEY } from "../../../private_user_constants";

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

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.55)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: isTablet ? "95%" : "70%",
          height: "95%",
        }}
      >
        <View
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: C.backgroundWhite,
            borderRadius: 12,
            borderWidth: 2,
            borderColor: C.buttonLightGreenOutline,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 18,
              paddingVertical: 10,
              backgroundColor: "rgb(255, 253, 235)",
              borderBottomWidth: 1,
              borderBottomColor: C.buttonLightGreenOutline,
            }}
          >
            {/* Drive time & distance */}
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {!sLoading && !sError && sDuration ? (
                <>
                  <Text style={{ fontSize: 11, color: gray(0.45), marginRight: 4 }}>
                    Time:
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.green }}>
                    {sDuration}
                  </Text>
                  <Text style={{ fontSize: 13, color: gray(0.4), marginHorizontal: 10 }}>
                    |
                  </Text>
                  <Text style={{ fontSize: 11, color: gray(0.45), marginRight: 4 }}>
                    Distance:
                  </Text>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.blue }}>
                    {sDistance}
                  </Text>
                </>
              ) : (
                <Text style={{ fontSize: 15, fontWeight: "600", color: C.text }}>
                  {sLoading && !sError ? "Loading route..." : sError ? "Route error" : "Route"}
                </Text>
              )}
            </View>

            {/* Close button */}
            <Button_
              text="Close"
              icon={ICONS.redx}
              iconSize={14}
              onPress={onClose}
              buttonStyle={{
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: gray(0.15),
                borderRadius: 5,
                paddingHorizontal: 12,
                paddingVertical: 5,
              }}
              textStyle={{ color: C.text, fontSize: 13 }}
            />
          </View>

          {/* Map Container */}
          <View style={{ flex: 1, position: "relative" }}>
            <div
              ref={mapContainerRef}
              style={{
                width: "100%",
                height: "100%",
              }}
            />

            {/* Loading overlay */}
            {sLoading && !sError && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.85)",
                }}
              >
                <Text style={{ fontSize: 15, color: gray(0.4) }}>
                  Loading map...
                </Text>
              </View>
            )}

            {/* Error overlay */}
            {sError && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.9)",
                }}
              >
                <Text style={{ fontSize: 15, color: C.lightred, textAlign: "center", paddingHorizontal: 30 }}>
                  {sError}
                </Text>
                <Button_
                  text="Retry"
                  onPress={initMap}
                  colorGradientArr={COLOR_GRADIENTS.blue}
                  buttonStyle={{
                    borderRadius: 5,
                    paddingHorizontal: 20,
                    paddingVertical: 8,
                    marginTop: 12,
                  }}
                  textStyle={{ color: C.textWhite, fontSize: 14 }}
                />
              </View>
            )}
          </View>
        </View>
      </div>
    </div>,
    document.body
  );
};
