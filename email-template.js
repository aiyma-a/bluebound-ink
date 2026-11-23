// One look for every email Bluebound Ink sends (confirm, welcome, new review).
// Used by server.js and scripts/notify-subscribers.js.
//
// Email programs ignore most CSS, so this uses a table and inline styles only.

// Colours copied from the website (style.css). Two themes: 'dark' and 'light'.
const BUTTON_TEXT = '#0f172a';
const THEMES = {
    dark:  { page: '#223152', card: '#223152', text: '#f0e8d6', muted: '#b9b3a6', line: '#3e4d75', gold: '#d4af37' },
    light: { page: '#f7f4ec', card: '#fffdf8', text: '#2c2925', muted: '#7a7468', line: '#e6dfcf', gold: '#b8860b' }
};
const GOLD = '#d4af37'; // buttons use this in both themes
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "Helvetica, Arial, sans-serif";

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// options:
//   siteUrl          address of the website (logo links to it)
//   preheader        grey preview text shown in the inbox list (optional)
//   heading          big italic title (plain text)
//   bodyHtml         paragraphs, already safe HTML
//   button           { label, url } gold button (optional)
//   noteHtml         small grey text under the button (optional, safe HTML)
//   unsubscribeLink  when given, the footer shows an Unsubscribe button
function renderEmail({ theme = 'dark', siteUrl, preheader, heading, bodyHtml, button, noteHtml, unsubscribeLink }) {
    const c = THEMES[theme] || THEMES.dark;
    const siteLink = `<a href="${escapeHtml(siteUrl)}" style="color: ${c.muted}; text-decoration: underline;">bluebound-ink.com</a>`;
    const buttonHtml = button ? `
                <tr><td class="bb-pad" style="padding: 8px 40px 8px 40px;">
                    <a href="${escapeHtml(button.url)}" style="display: inline-block; background: ${GOLD}; color: ${BUTTON_TEXT}; padding: 14px 30px; border-radius: 6px; text-decoration: none; font-family: ${SANS}; font-size: 14px; font-weight: bold; letter-spacing: 0.06em;">${escapeHtml(button.label)}</a>
                </td></tr>` : '';

    const noteRow = noteHtml ? `
                <tr><td class="bb-pad" style="padding: 18px 40px 0 40px; font-family: ${SERIF}; font-size: 14px; line-height: 1.6; color: ${c.muted};">${noteHtml}</td></tr>` : '';

    const unsubscribeHtml = unsubscribeLink ? `
                    <p style="margin: 0 0 14px 0;">You are receiving this because you subscribed on ${siteLink}.</p>
                    <a href="${escapeHtml(unsubscribeLink)}" style="display: inline-block; border: 1px solid ${c.muted}; color: ${c.muted}; padding: 8px 18px; border-radius: 6px; text-decoration: none; font-family: ${SANS}; font-size: 12px; letter-spacing: 0.05em;">Unsubscribe</a>` : `
                    <p style="margin: 0;">You are receiving this because someone used this address on ${siteLink}.</p>`;

    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="${theme === 'light' ? 'light' : 'dark'}"><title>${escapeHtml(heading)}</title>
<style>
    html, body { margin: 0; padding: 0; background: ${c.page}; }
    @media only screen and (max-width: 640px) {
        .bb-pad { padding-left: 24px !important; padding-right: 24px !important; }
    }
</style></head>
<body bgcolor="${c.page}" style="margin: 0; padding: 0; background: ${c.page};">
    <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: ${c.page};">${escapeHtml(preheader || heading)}</div>
    <!-- One flat background across the whole message; the content sits in a centred 640 px column -->
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${c.page}" style="background: ${c.page}; min-width: 100%;">
        <tr><td align="center" bgcolor="${c.page}" style="padding: 0;">
            <table class="bb-col" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 640px;">
                <tr><td class="bb-pad" style="padding: 30px 40px;">
                    <a href="${escapeHtml(siteUrl)}" style="text-decoration: none; font-family: ${SERIF}; font-size: 28px; font-style: italic; color: ${c.text};">Bluebound <span style="color: ${c.gold};">Ink</span></a>
                </td></tr>
            </table>
        </td></tr>
        <tr><td bgcolor="${c.gold}" style="height: 3px; background: ${c.gold}; font-size: 0; line-height: 0;">&nbsp;</td></tr>
        <tr><td align="center" bgcolor="${c.page}" style="padding: 0 0 24px 0;">
            <table class="bb-col" role="presentation" width="640" cellpadding="0" cellspacing="0" border="0" style="width: 100%; max-width: 640px;">
                <tr><td class="bb-pad" style="padding: 36px 40px 10px 40px; font-family: ${SERIF}; font-size: 26px; font-style: italic; line-height: 1.3; color: ${c.text};">${escapeHtml(heading)}</td></tr>
                <tr><td class="bb-pad" style="padding: 0 40px 22px 40px; font-family: ${SERIF}; font-size: 17px; line-height: 1.7; color: ${c.text};">${bodyHtml}</td></tr>${buttonHtml}${noteRow}
                <tr><td class="bb-pad" style="padding: 36px 40px 0 40px;"><div style="border-top: 1px solid ${c.line}; font-size: 0; line-height: 0;">&nbsp;</div></td></tr>
                <tr><td class="bb-pad" style="padding: 22px 40px 10px 40px; font-family: ${SERIF}; font-size: 13px; line-height: 1.6; color: ${c.muted};">${unsubscribeHtml}
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>`;
}

module.exports = { renderEmail, escapeHtml };
