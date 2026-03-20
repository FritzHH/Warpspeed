/* eslint-disable */

const CHANNEL_NAME = "warpspeed-customer-display";

export const DISPLAY_MSG_TYPES = {
  WORKORDER: "workorder",
  SALE: "sale",
  CLEAR: "clear",
};

let _channel = null;
function getChannel() {
  if (!_channel) {
    _channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return _channel;
}

export function broadcastToDisplay(type, payload) {
  getChannel().postMessage({ type, payload, timestamp: Date.now() });
}

export function onDisplayMessage(callback) {
  const channel = getChannel();
  channel.onmessage = (event) => callback(event.data);
  return () => {
    channel.onmessage = null;
  };
}

export function broadcastClear() {
  broadcastToDisplay(DISPLAY_MSG_TYPES.CLEAR, null);
}

// ============================================================================
// Translate Display Channel
// ============================================================================
const TRANSLATE_CHANNEL_NAME = "warpspeed-translate-display";

export const TRANSLATE_MSG_TYPES = {
  TRANSLATE: "translate",
  CLEAR: "clear",
};

let _translateChannel = null;
function getTranslateChannel() {
  if (!_translateChannel) {
    _translateChannel = new BroadcastChannel(TRANSLATE_CHANNEL_NAME);
  }
  return _translateChannel;
}

export function broadcastToTranslateDisplay(type, payload) {
  getTranslateChannel().postMessage({ type, payload, timestamp: Date.now() });
}

export function onTranslateMessage(callback) {
  const channel = getTranslateChannel();
  channel.onmessage = (event) => callback(event.data);
  return () => {
    channel.onmessage = null;
  };
}

export function broadcastTranslateClear() {
  broadcastToTranslateDisplay(TRANSLATE_MSG_TYPES.CLEAR, null);
}
