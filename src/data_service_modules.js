/* eslint-disable */

import {
  dbSendSMS,
  dbSendTwilioMessage,
  dbListenToNewMessages,
  dbListenToSaasNewMessages,
  dbGetCustomerMessages,
  dbGetSaasCustomerMessages,
} from "./db_calls_wrapper";
import { useCustMessagesStore } from "./stores";
import { log } from "./utils";
import { APP_BRAND } from "./private_user_constants";

const IS_SAAS = APP_BRAND === "rss";

export const smsService = {
  isSaas: IS_SAAS,

  send: async (message) => {
    log("Sending SMS", { brand: APP_BRAND, message });
    try {
      message.status = "sending";
      useCustMessagesStore.getState().setOutgoingMessage(message);

      const result = IS_SAAS
        ? await dbSendTwilioMessage(message)
        : await dbSendSMS(message);

      if (result.success) {
        log("SMS Service: SMS sent successfully", result.data);
        useCustMessagesStore.getState().updateMessageStatus(message.id, "sent", "");
        return { success: true, message: "SMS sent successfully" };
      } else {
        log("SMS Service: SMS send failed", result.error);
        useCustMessagesStore.getState().updateMessageStatus(
          message.id,
          "failed",
          result.error || "Failed to send"
        );
        return {
          success: false,
          error: result.error || "Failed to send SMS",
          code: result.code || "SEND_FAILED",
        };
      }
    } catch (error) {
      log("SMS Service: Error in send function", error);
      if (message && message.id) {
        useCustMessagesStore.getState().updateMessageStatus(
          message.id,
          "failed",
          error.message || "Unknown error"
        );
      }
      return {
        success: false,
        error: error.message || "Unknown error occurred while sending SMS",
        code: "SERVICE_ERROR",
      };
    }
  },

  listenToNewMessages: (phone, afterMillis, callback) => {
    if (IS_SAAS) {
      return dbListenToSaasNewMessages(phone, afterMillis, callback);
    }
    return dbListenToNewMessages(phone, afterMillis, callback);
  },

  getCustomerMessages: async (phone, startAfterTimestamp = null, pageSize = 10) => {
    if (IS_SAAS) {
      return dbGetSaasCustomerMessages(phone, startAfterTimestamp, pageSize);
    }
    return dbGetCustomerMessages(phone, startAfterTimestamp, pageSize);
  },
};
