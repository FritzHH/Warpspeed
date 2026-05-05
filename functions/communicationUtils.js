function findTemplateByType(templates, type) {
  if (!templates || !type) return null;
  return templates.find((t) => t.type === type) || null;
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function applyVars(template, vars) {
  if (!template || !vars) return template || "";
  let result = template;
  for (const [key, val] of Object.entries(vars)) {
    result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val != null ? escapeHtml(val) : "");
  }
  return result;
}

function nl2br(str) {
  return (str || "").replace(/\n/g, "<br>");
}

function formatStoreHours(storeHours) {
  if (!storeHours?.standard || storeHours.standard.length === 0) return "";
  let days = storeHours.standard;
  let shortNames = { Monday: "Mon", Tuesday: "Tues", Wednesday: "Wed", Thursday: "Thurs", Friday: "Fri", Saturday: "Sat", Sunday: "Sun" };
  let groups = [];
  let currentGroup = null;
  for (let i = 0; i < days.length; i++) {
    let day = days[i];
    let key = day.isOpen ? day.open + "-" + day.close : "closed";
    if (currentGroup && currentGroup.key === key) {
      currentGroup.end = day.name;
    } else {
      currentGroup = { key, start: day.name, end: day.name, isOpen: day.isOpen, open: day.open, close: day.close };
      groups.push(currentGroup);
    }
  }
  return groups.map((g) => {
    let label = g.start === g.end ? shortNames[g.start] || g.start : (shortNames[g.start] || g.start) + "-" + (shortNames[g.end] || g.end);
    return g.isOpen ? label + " " + g.open + " - " + g.close : "Closed " + label;
  }).join(", ");
}

function resolveEmailSectionVars(templateStr, settings, extraVars) {
  if (!templateStr) return "";
  let si = settings?.storeInfo || {};
  let storeHoursText = "";
  try { storeHoursText = formatStoreHours(settings?.storeHours); } catch (e) {}
  let phone = si.phone || "";
  let formattedPhone = phone.length === 10
    ? "(" + phone.slice(0, 3) + ") " + phone.slice(3, 6) + "-" + phone.slice(6)
    : phone;
  let logoUrl = si.storeLogo || "";
  let logoWidth = settings?.emailLogoWidth || 180;
  let logoHtml = logoUrl ? '<img src="' + logoUrl + '" alt="' + (si.displayName || "Logo") + '" style="max-width:' + logoWidth + 'px;height:auto;display:block;margin:0 auto 8px auto;">' : "";
  let result = templateStr
    .replace(/\{storeLogo\}/g, logoHtml)
    .replace(/\{storeDisplayName\}/g, si.displayName || si.name || "")
    .replace(/\{storeName\}/g, si.displayName || si.name || "")
    .replace(/\{storeStreet\}/g, si.street || "")
    .replace(/\{storeUnit\}/g, si.unit || "")
    .replace(/\{storeCity\}/g, si.city || "")
    .replace(/\{storeState\}/g, si.state || "")
    .replace(/\{storeZip\}/g, si.zip || "")
    .replace(/\{storePhone\}/g, formattedPhone)
    .replace(/\{storeAddress\}/g, (si.street || "") + (si.unit ? " " + si.unit : "") + (si.city ? ", " + si.city : "") + (si.state ? ", " + si.state : "") + (si.zip ? " " + si.zip : ""))
    .replace(/\{storeHours\}/g, storeHoursText)
    .replace(/\{supportEmail\}/g, si.supportEmail || "");
  if (extraVars) {
    for (let [key, val] of Object.entries(extraVars)) {
      result = result.replace(new RegExp("\\{" + key + "\\}", "g"), val != null ? String(val) : "");
    }
  }
  return result;
}

function buildStyledEmailHTML({ greeting, message, action, actionUrl, footer, greetingAlign, footerAlign, actionBgColor, actionTextColor, greetingBgColor, greetingTextColor }) {
  let gAlign = greetingAlign === "left" ? "left" : "center";
  let fAlign = footerAlign === "left" ? "left" : "center";
  let btnBg = actionBgColor || "green";
  let btnText = actionTextColor || "white";
  let gBg = greetingBgColor || "#2E7D32";
  let gText = greetingTextColor || "#ffffff";
  let safeUrl = actionUrl && /^https?:\/\//i.test(actionUrl) ? actionUrl : "";

  let greetingSection = greeting ? '<tr><td style="background-color:' + gBg + ';padding:30px 40px;text-align:' + gAlign + ';"><p style="margin:0;color:' + gText + ';font-size:20px;font-weight:700;line-height:1.4;">' + nl2br(greeting) + '</p></td></tr>' : "";
  let messageSection = message ? '<tr><td style="background-color:#ffffff;padding:30px 40px;color:#333333;font-size:15px;line-height:1.7;">' + nl2br(message) + '</td></tr>' : "";

  let actionSection = "";
  if (action && safeUrl) {
    actionSection = '<tr><td style="background-color:#E8F5E9;padding:24px 40px;text-align:center;"><a href="' + safeUrl + '" target="_blank" style="display:inline-block;padding:14px 36px;background-color:' + btnBg + ';color:' + btnText + ';text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;letter-spacing:0.3px;">' + action + '</a></td></tr>';
  } else if (action) {
    actionSection = '<tr><td style="background-color:#E8F5E9;padding:24px 40px;text-align:center;color:#333333;font-size:15px;font-weight:600;">' + nl2br(action) + '</td></tr>';
  }

  let footerSection = footer ? '<tr><td style="background-color:#F5F5F5;padding:24px 40px;text-align:' + fAlign + ';border-top:1px solid #E0E0E0;"><p style="margin:0;color:#888888;font-size:13px;line-height:1.6;">' + nl2br(footer) + '</p></td></tr>' : "";

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>'
    + '<body style="margin:0;padding:0;background-color:#f0f0f0;font-family:Arial,Helvetica,sans-serif;">'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f0f0;">'
    + '<tr><td align="center" style="padding:24px 10px;">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">'
    + greetingSection
    + messageSection
    + actionSection
    + footerSection
    + '</table></td></tr></table></body></html>';
}

const DEFAULT_GREETING = "{storeLogo}\nHi {firstName}, thanks for choosing {storeDisplayName}!";
const DEFAULT_FOOTER = "{storeDisplayName}\n{storeStreet}, {storeCity}, {storeState} {storeZip}\n{storePhone}";

function buildEmailFromTemplate(emailTemplate, settings, vars, actionUrl) {
  let subject = applyVars(emailTemplate.subject || "", vars);
  let message = applyVars(emailTemplate.message || emailTemplate.content || emailTemplate.body || "", vars);
  let actionLabel = applyVars(emailTemplate.action || "", vars);
  let greetingRaw = settings?.emailGreeting != null ? settings.emailGreeting : DEFAULT_GREETING;
  let footerRaw = settings?.emailFooter != null ? settings.emailFooter : DEFAULT_FOOTER;
  let greeting = resolveEmailSectionVars(greetingRaw, settings, vars);
  let footer = resolveEmailSectionVars(footerRaw, settings);
  let colorObj = emailTemplate.actionColorObj;
  let greetingColorObj = settings?.emailGreetingColorObj;
  let html = buildStyledEmailHTML({
    greeting,
    message,
    action: actionLabel,
    actionUrl: actionUrl || "",
    footer,
    greetingAlign: settings?.emailGreetingAlign,
    footerAlign: settings?.emailFooterAlign,
    actionBgColor: colorObj?.backgroundColor,
    actionTextColor: colorObj?.textColor,
    greetingBgColor: greetingColorObj?.backgroundColor,
    greetingTextColor: greetingColorObj?.textColor,
  });
  return { subject, html };
}

function getTemplateType(receiptType) {
  switch (receiptType) {
    case "sale":
      return "saleReceipt";
    case "refund":
      return "refundReceipt";
    case "credit":
      return "creditReceipt";
    case "giftcard":
      return "giftCardReceipt";
    case "intake":
    case "workorder":
      return "intakeReceipt";
    default:
      return null;
  }
}

function getDefaultSMSMessage(receiptType) {
  switch (receiptType) {
    case "credit":
      return "\u{1F4B0} Hey {firstName}! A store credit of {amount} has been added to your account. Here's your receipt: {link}\n\n\u{1F64F} Thank you! - {storeName}";
    case "giftcard":
      return "\u{1F381} Hey {firstName}! A gift card of {amount} has been created. Here's your receipt: {link}\n\n\u{1F64F} Thank you! - {storeName}";
    default:
      return null;
  }
}

module.exports = {
  findTemplateByType,
  applyVars,
  nl2br,
  formatStoreHours,
  resolveEmailSectionVars,
  buildStyledEmailHTML,
  buildEmailFromTemplate,
  getTemplateType,
  getDefaultSMSMessage,
};
