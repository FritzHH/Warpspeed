/* eslint-disable */

import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent, useTransformEffect } from "react-zoom-pan-pinch";
import { LoadingIndicator as LoadingIndicatorDom } from "../../../dom_components";
import { useZ } from "../../../hooks/useZ";
import s from "./Messages.module.css";

function ZoomCursorHelper({ wrapperRef }) {
  useTransformEffect(({ state }) => {
    if (wrapperRef.current) wrapperRef.current.style.cursor = state.scale > 1 ? "grab" : "default";
  });
  return null;
}

export default function MediaLightbox({ url, isVideo, onClose, onDownload }) {
  const [sFullLoading, _setFullLoading] = useState(true);
  const [sFullDims, _setFullDims] = useState(null);
  const wrapperDivRef = useRef(null);
  const z = useZ("modal");

  return createPortal(
    <div
      onClick={onClose}
      className={s.mediaFullOverlay}
      style={{ zIndex: z }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={s.mediaFullContent}
        style={{
          width: sFullDims ? sFullDims.width : "80%",
          height: sFullDims ? sFullDims.height : "80%",
        }}
      >
        <div
          onClick={(e) => { e.stopPropagation(); onDownload(); }}
          className={s.mediaDownloadBtn}
        >
          &#8681;
        </div>
        {isVideo ? (
          <video src={url} controls autoPlay className={s.mediaFullVideo} />
        ) : (
          <div ref={wrapperDivRef} className={s.mediaFullImgWrap}>
            <TransformWrapper
              initialScale={1}
              minScale={1}
              maxScale={8}
              centerOnInit={true}
              wheel={{ step: 0.3 }}
              panning={{ velocityDisabled: true }}
              doubleClick={{ disabled: true }}
            >
              <ZoomCursorHelper wrapperRef={wrapperDivRef} />
              <TransformComponent
                wrapperStyle={{ width: "100%", height: "100%" }}
                contentStyle={{ width: "100%", height: "100%" }}
              >
                <img
                  src={url}
                  alt=""
                  onLoad={(e) => {
                    _setFullLoading(false);
                    const { naturalWidth, naturalHeight } = e.target;
                    const maxW = window.innerWidth * 0.8;
                    const maxH = window.innerHeight * 0.8;
                    const scale = Math.min(maxW / naturalWidth, maxH / naturalHeight, 1);
                    _setFullDims({ width: Math.round(naturalWidth * scale), height: Math.round(naturalHeight * scale) });
                  }}
                  className={s.mediaFullImg}
                  draggable={false}
                />
              </TransformComponent>
            </TransformWrapper>
          </div>
        )}
        {sFullLoading && !isVideo && (
          <div className={s.mediaFullLoadingOverlay}>
            <LoadingIndicatorDom />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
