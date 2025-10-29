/* eslint-disable */

/**
 * Service modules for data operations
 * Implements best practices: separation of concerns between services and stores
 * Services handle all data operations, stores handle state management
 */

import { dbSendSMS } from "./db_calls_wrapper";
import { useCustMessagesStore } from "./stores";
import { generateRandomID } from "./utils";
import { log } from "./utils";
import { SMS_PROTO } from "./data";

/**
 * SMS Service Module
 * Handles all SMS-related operations including sending and managing messages
 */
export const smsService = {
  /**
   * Send an SMS message
   * Immediately posts message to Zustand store, then sends via database.
   * If database send fails, removes the message from the store.
   * @param {Object} params - SMS parameters
   * @param {string} params.message - Message text content
   * @param {string} params.phoneNumber - Recipient phone number (10 digits, US format)
   * @param {string} [params.customerID] - Customer ID (optional)
   * @param {Object} [params.senderUserObj] - Sender user object (optional)
   * @param {string} [params.firstName] - Customer first name (optional)
   * @param {string} [params.lastName] - Customer last name (optional)
   * @param {boolean} [params.canRespond] - Whether customer can respond (optional)
   * @returns {Promise<Object>} Result object with success status and data
   */
  send: async (
    message,
  ) => {
    log("Sending SMS", message)
    try {

      // Immediately post message to Zustand store
      useCustMessagesStore.getState().setOutgoingMessage(message, false);
      // log("SMS Service: Message posted to store", { messageID: message.id });

      // Send SMS via database wrapper
      // log("SMS Service: Sending SMS", { phoneNumber: cleanPhoneNumber, customerID });
      const result = await dbSendSMS(message);

      if (result.success) {
        log("SMS Service: SMS sent successfully", result.data);
        
        return {
          success: true,
          message: "SMS sent successfully",
          messageObj,
        };
      } else {
        // Remove message from store on failure
        const store = useCustMessagesStore.getState();
        const filteredMessages = store.outgoingMessagesArr.filter(
          (msg) => msg.id !== message.id
        );
        store.setOutgoingMessage(filteredMessages);
        
        log("SMS Service: SMS send failed, message removed from store", result.error);
        
        return {
          success: false,
          error: result.error || "Failed to send SMS",
          code: result.code || "SEND_FAILED",
        };
      }
    } catch (error) {
      // If error occurred after message was posted to store, try to remove it
      try {
        // Try to remove by messageObj.id if it exists (was created and posted before error)
        if (message && message.id) {
          const store = useCustMessagesStore.getState();
          const filteredMessages = store.outgoingMessagesArr.filter(
            (msg) => msg.id !== message.id
          );
          store.set({ outgoingMessagesArr: filteredMessages });
          log("SMS Service: Removed message from store after error");
        }
      } catch (removeError) {
        log("SMS Service: Error removing message from store", removeError);
      }
      
      log("SMS Service: Error in send function", error);
      
      return {
        success: false,
        error: error.message || "Unknown error occurred while sending SMS",
        code: "SERVICE_ERROR",
        details: {
          originalError: error,
          timestamp: new Date().toISOString(),
        },
      };
    }
  },
};

