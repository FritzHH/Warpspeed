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
  mobile: {
    home: "/",
    workorders: "/workorders",
    workorderDetail: "/workorder/:id",
    itemEdit: "/workorder/:id/items",
    messages: "/workorder/:id/messages",
  },
};

