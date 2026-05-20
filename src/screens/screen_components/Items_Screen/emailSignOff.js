import { useSettingsStore, useLoginStore } from "../../../stores";

export function buildSignOffHtml(activeAccountKey) {
  let zSettings = useSettingsStore.getState().settings;
  let activeAccount = zSettings?.emailAccounts?.find((a) => a.accountKey === activeAccountKey) || {};
  let html = "";
  if (activeAccount.appendUserName) {
    let currentUser = useLoginStore.getState().getCurrentUser();
    if (currentUser) {
      let firstName = currentUser.first || "";
      let lastInitial = currentUser.last ? currentUser.last.charAt(0) + "." : "";
      let userName = (firstName + " " + lastInitial).trim();
      if (userName) {
        html += `<br/><br/><br/><p style="margin:0;">Thanks,<br/><br/>-${userName}</p>`;
      }
    }
  }
  let sig = activeAccount.signature || {};
  let hasSegments = sig?.segments?.length > 0 && sig.segments.some((s) => s.text);
  if (hasSegments || sig.imageUrl) {
    let scale = (sig.imageScale || 100) / 100;
    let logoImgTag = sig.imageUrl ? `<img src="${sig.imageUrl}" style="max-width:${Math.round(300 * scale)}px;max-height:${Math.round(300 * scale)}px;vertical-align:middle;" />` : "";
    let hasLogoVar = hasSegments && sig.segments.some((s) => s.text.includes("{logo}"));
    html += '<br/><div style="margin-top:10px;border-top:1px solid #ccc;padding-top:10px;">';
    if (hasSegments) {
      html += '<p style="margin:0;white-space:pre-wrap;">';
      for (let seg of sig.segments) {
        if (!seg.text) continue;
        let escaped = seg.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br/>");
        if (logoImgTag) escaped = escaped.replace(/\{logo\}/g, logoImgTag);
        html += `<span style="font-family:${seg.fontFamily};font-size:${seg.fontSize}px;font-weight:${seg.fontWeight};font-style:${seg.fontStyle || "normal"};">${escaped}</span>`;
      }
      html += "</p>";
    }
    if (sig.imageUrl && !hasLogoVar) {
      html += `<img src="${sig.imageUrl}" style="max-width:${Math.round(300 * scale)}px;max-height:${Math.round(300 * scale)}px;margin-top:${hasSegments ? "8" : "0"}px;" />`;
    }
    html += "</div>";
  }
  return html;
}
