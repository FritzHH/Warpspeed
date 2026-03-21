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

// ============================================================================
// Display Status Channel — display window broadcasts its state to dashboard
// ============================================================================
const STATUS_CHANNEL_NAME = "warpspeed-display-status";

export const DISPLAY_STATUS = {
  OPEN: "open",           // display window loaded
  CLOSED: "closed",       // display window closing
  FULLSCREEN: "fullscreen", // entered fullscreen
  WINDOWED: "windowed",   // exited fullscreen (still open)
  VISIBLE: "visible",     // tab/window is visible
  HIDDEN: "hidden",       // tab/window is minimized or hidden
};

let _statusChannel = null;
function getStatusChannel() {
  if (!_statusChannel) {
    _statusChannel = new BroadcastChannel(STATUS_CHANNEL_NAME);
  }
  return _statusChannel;
}

export function broadcastDisplayStatus(status) {
  getStatusChannel().postMessage({ status, timestamp: Date.now() });
}

export function onDisplayStatusMessage(callback) {
  const channel = getStatusChannel();
  channel.onmessage = (event) => callback(event.data);
  return () => {
    channel.onmessage = null;
  };
}
