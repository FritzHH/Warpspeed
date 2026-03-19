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
