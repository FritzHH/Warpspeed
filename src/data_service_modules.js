/* eslint-disable */

import { dbSendSMS } from "./db_calls_wrapper";
import { useCustMessagesStore } from "./stores";
import { log } from "./utils";

export const smsService = {
  send: async (message) => {
    log("Sending SMS", message);
    try {
      // Set status to sending and post to store
      message.status = "sending";
      useCustMessagesStore.getState().setOutgoingMessage(message);

      // Send SMS via database wrapper
      const result = await dbSendSMS(message);

      if (result.success) {
        log("SMS Service: SMS sent successfully", result.data);
        useCustMessagesStore.getState().updateMessageStatus(message.id, "sent", "");
        return { success: true, message: "SMS sent successfully" };
      } else {
        log("SMS Service: SMS send failed", result.error);
        useCustMessagesStore.getState().updateMessageStatus(message.id, "failed", result.error || "Failed to send");
        return {
          success: false,
          error: result.error || "Failed to send SMS",
          code: result.code || "SEND_FAILED",
        };
      }
    } catch (error) {
      log("SMS Service: Error in send function", error);
      // Update message status to failed if it was posted to store
      if (message && message.id) {
        useCustMessagesStore.getState().updateMessageStatus(message.id, "failed", error.message || "Unknown error");
      }
      return {
        success: false,
        error: error.message || "Unknown error occurred while sending SMS",
        code: "SERVICE_ERROR",
      };
    }
  },
};
