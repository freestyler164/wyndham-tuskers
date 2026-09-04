import { config } from '../config.js';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

export const buildMemberApprovalEmail = ({ memberName }) => {
  const safeName = escapeHtml(memberName || 'Tuskers member');
  const logoUrl = `${config.frontendUrl.replace(/\/$/, '')}/static/logos/wt_logo.png`;
  const subject = 'Welcome to Wyndham Tuskers - membership approved';
  const text = [
    `Hi ${memberName || 'Tuskers member'},`,
    '',
    'Your Wyndham Tuskers membership application has been approved.',
    '',
    'You are now part of a community that connects, celebrates and grows together. We are pleased to welcome you and your family to Wyndham Tuskers.',
    '',
    'We look forward to meeting you at Tuskers Onam 2026 on 8 August 2026.',
    '',
    'Once a Tusker, Always a Family.',
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f7f2e8;color:#171513;font-family:Montserrat,'Helvetica Neue',Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Your Wyndham Tuskers membership application has been approved.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f7f2e8;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#fffaf0;border:1px solid #e8d8bd;border-collapse:separate;border-spacing:0;border-radius:24px;overflow:hidden;box-shadow:0 16px 42px rgba(109,79,42,0.13);">
          <tr><td style="height:8px;background:#f7941d;border-radius:23px 23px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>
          <tr>
            <td align="center" style="padding:30px 36px 18px;">
              <img src="${logoUrl}" width="82" height="82" alt="Wyndham Tuskers" style="display:block;width:82px;height:82px;object-fit:contain;border:0;">
              <p style="margin:12px 0 0;color:#171513;font-size:20px;line-height:26px;font-weight:800;">WYNDHAM TUSKERS</p>
              <p style="margin:4px 0 0;color:#c75b1b;font-size:11px;line-height:16px;font-weight:800;letter-spacing:2px;text-transform:uppercase;">Community &bull; Culture &bull; Sport</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:16px 36px 10px;">
              <p style="margin:0 0 9px;color:#c75b1b;font-size:12px;line-height:18px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">Welcome to the family</p>
              <h1 style="margin:0;color:#171513;font-size:40px;line-height:46px;font-weight:800;">Your membership has been approved.</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#fffaf0;border:1px solid #e8d8bd;border-radius:14px;box-shadow:0 14px 32px rgba(109,79,42,0.16);">
                <tr>
                  <td width="74" align="center" style="width:74px;padding:18px 0 18px 18px;">
                    <div style="width:48px;height:48px;border-radius:50%;background:#f7941d;color:#fffaf0;font-size:27px;line-height:48px;font-weight:800;text-align:center;">&#10003;</div>
                  </td>
                  <td style="padding:18px 22px 18px 14px;">
                    <p style="margin:0;color:#c75b1b;font-size:11px;line-height:17px;font-weight:700;letter-spacing:1.3px;text-transform:uppercase;">Application status</p>
                    <p style="margin:2px 0 0;color:#171513;font-size:24px;line-height:30px;font-weight:800;">Approved</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 8px;">
              <p style="margin:0 0 14px;color:#171513;font-size:18px;line-height:28px;font-weight:700;">Hi ${safeName},</p>
              <p style="margin:0;color:#756a5c;font-size:16px;line-height:27px;">You are not just joining a club. You are now part of a community that connects, celebrates and grows together. We are pleased to welcome you and your family to Wyndham Tuskers.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #e8d8bd;border-bottom:1px solid #e8d8bd;">
                <tr>
                  <td width="42%" valign="middle" style="width:42%;padding:20px 16px 20px 0;">
                    <p style="margin:0;color:#f7941d;font-size:11px;line-height:17px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;">Meet and greet</p>
                    <p style="margin:5px 0 0;color:#171513;font-size:21px;line-height:27px;font-weight:800;">Tuskers Onam 2026</p>
                  </td>
                  <td width="58%" valign="middle" style="width:58%;padding:20px 0 20px 16px;border-left:1px solid #e8d8bd;">
                    <p style="margin:0;color:#756a5c;font-size:13px;line-height:20px;">We look forward to meeting you and celebrating together.</p>
                    <p style="margin:6px 0 0;color:#b31824;font-size:16px;line-height:23px;font-weight:800;">8 August 2026</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:23px;background:#171513;border-top:5px solid #f7941d;border-radius:0 0 23px 23px;">
              <p style="margin:0;color:#fffaf0;font-size:18px;line-height:26px;font-weight:800;">Once a Tusker, Always a Family.</p>
              <p style="margin:7px 0 0;color:#efe2c8;font-size:12px;line-height:18px;">Wyndham Tuskers &bull; Wyndham, Melbourne</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
};
