/* eslint-disable */

/**
 * Application routing constants
 * Centralized route definitions for the app
 */
export const ROUTES = {
  login: "/login",
  dashboard: "/",
  home: "/home",
  display: "/display",
  translate: "/translate",
  intake: "/intake",
  stand: "/stand",
  phone: "/phone",
  phoneOrdering: "/phone/ordering",
  phoneOrderingScan: "/phone/ordering/:orderID",
  phoneOrderingView: "/phone/ordering/:orderID/view",
  dbViewer: "/db-viewer",
  tokens: "/tokens",
  stripeConnect: "/stripe-connect",
  stripeConnectRefresh: "/onboarding/refresh",
  stripeConnectComplete: "/onboarding/complete",
  inviteAccept: "/invite-accept",
  mobile: {
    home: "/",
    workorders: "/workorders",
    workorderDetail: "/workorder/:id",
    itemEdit: "/workorder/:id/items",
    messages: "/workorder/:id/messages",
  },
};

