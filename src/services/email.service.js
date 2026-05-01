/**
 * Email notification service — uses nodemailer with SMTP.
 * Requires: npm install nodemailer
 * Env vars:  SMTP_HOST, SMTP_PORT (default 465), SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Lazily created transport so missing SMTP config doesn't crash startup
let _transport = null;

const getTransport = () => {
  if (_transport) return _transport;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  const port   = parseInt(process.env.SMTP_PORT || '465');
  const secure = port === 465;

  _transport = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  });

  return _transport;
};

/**
 * Core send helper.
 * Throws if SMTP is not configured or send fails.
 */
const sendMail = async (to, subject, html, text) => {
  const transport = getTransport();
  if (!transport) {
    throw new Error('SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS in .env)');
  }

  const from   = process.env.SMTP_FROM || process.env.SMTP_USER;
  const domain = from.split('@')[1] || 'imakerrestro.com';
  const msgId  = `<${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`;

  await transport.sendMail({
    from:    `"iMaker RestroPOS" <${from}>`,
    to,
    replyTo: from,
    subject,
    messageId: msgId,
    headers: {
      'X-Mailer':        'RestroPOS Notification System',
      'X-Entity-Ref-ID': msgId,
      'Precedence':      'transactional',
      'List-Unsubscribe': `<mailto:support@${domain}>`,
    },
    html,
    text: text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
  });

  logger.info(`[Email] Sent to ${to}: ${subject}`);
};

/**
 * Send activation token email (Free or Pro plan).
 */
const sendActivationTokenEmail = async (to, { restaurant, licenseId, token, plan, adminEmail, adminPassword, maxOutlets }) => {
  if (!to) return;

  const planLabel = plan === 'pro' ? '🚀 Pro' : '🆓 Free';
  const maxOutletsText = maxOutlets > 1 ? `${maxOutlets} outlets` : '1 outlet';

  const subject = `RestroPOS License Ready — ${restaurant || 'RestroPOS'}`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f5f5f5;margin:0;padding:20px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">
    <div style="background:#1a73e8;padding:24px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:22px">🎉 Welcome to RestroPOS!</h1>
    </div>
    <div style="padding:32px">
      <p style="color:#333;font-size:16px">Dear <strong>${restaurant}</strong>,</p>
      <p style="color:#555;line-height:1.6">Your RestroPOS activation token is ready. Use it in the app to activate your license.</p>

      <table style="width:100%;border-collapse:collapse;margin:20px 0;background:#f8f9fa;border-radius:6px">
        <tr><td style="padding:10px 16px;color:#888;font-size:13px;border-bottom:1px solid #eee;width:40%">Restaurant</td><td style="padding:10px 16px;font-weight:bold;border-bottom:1px solid #eee">${restaurant}</td></tr>
        <tr><td style="padding:10px 16px;color:#888;font-size:13px;border-bottom:1px solid #eee">Plan</td><td style="padding:10px 16px;border-bottom:1px solid #eee">${planLabel} — ${maxOutletsText}</td></tr>
        <tr><td style="padding:10px 16px;color:#888;font-size:13px;border-bottom:1px solid #eee">License ID</td><td style="padding:10px 16px;font-size:12px;font-family:monospace;border-bottom:1px solid #eee">${licenseId}</td></tr>
        <tr><td style="padding:10px 16px;color:#888;font-size:13px;border-bottom:1px solid #eee">Admin Email</td><td style="padding:10px 16px;border-bottom:1px solid #eee">${adminEmail}</td></tr>
        <tr><td style="padding:10px 16px;color:#888;font-size:13px">Admin Password</td><td style="padding:10px 16px;font-family:monospace;font-weight:bold">${adminPassword}</td></tr>
      </table>

      <p style="color:#333;font-weight:bold;margin-top:24px;margin-bottom:8px">🔑 Activation Token:</p>
      <div style="background:#1e1e1e;border-radius:6px;padding:16px">
        <code style="color:#4fc3f7;font-size:11px;word-break:break-all;white-space:pre-wrap;display:block">${token}</code>
      </div>

      <p style="color:#555;font-size:13px;margin-top:16px;line-height:1.6">
        Copy the token above and paste it in the RestroPOS app on the <strong>Activation</strong> screen.
      </p>
      <p style="color:#e53935;font-size:13px">⚠️ Keep this token confidential. Do not share it with anyone outside your team.</p>
    </div>
    <div style="background:#f8f9fa;padding:16px;text-align:center;color:#aaa;font-size:12px">
      RestroPOS &bull; Powered by iMaker
    </div>
  </div>
</body>
</html>`;

  const text =
    `Welcome to RestroPOS!\n\n` +
    `Restaurant : ${restaurant}\n` +
    `Plan       : ${plan === 'pro' ? 'Pro' : 'Free'} — ${maxOutletsText}\n` +
    `License ID : ${licenseId}\n` +
    `Admin Email: ${adminEmail}\n` +
    `Password   : ${adminPassword}\n\n` +
    `--- ACTIVATION KEY ---\n${token}\n--- END ---\n\n` +
    `Copy the key above and paste it in the RestroPOS Activation screen.\n` +
    `Keep this email confidential.\n\n` +
    `RestroPOS | Powered by iMaker`;

  return sendMail(to, subject, html, text);
};

/**
 * Send Pro upgrade token email.
 */
const sendUpgradeTokenEmail = async (to, { restaurant, token, newLicenseId, upgradesFrom }) => {
  if (!to) return;

  const subject = `RestroPOS Pro License Ready — ${restaurant || 'RestroPOS'}`;

  const html = `
<div style="font-family:Arial,sans-serif;background:#1A1A2E;color:#ffffff;padding:32px;border-radius:12px;max-width:560px;margin:0 auto">
  <div style="text-align:center;margin-bottom:24px">
    <h2 style="color:#E53935;margin:0;font-size:22px">RestroPOS Pro Upgrade</h2>
    <p style="color:#aaa;margin:8px 0 0;font-size:14px">Your Pro plan is ready to activate</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="color:#888;padding:6px 0;width:130px">Restaurant</td><td style="color:#fff">${restaurant || '—'}</td></tr>
    <tr><td style="color:#888;padding:6px 0">New License</td><td style="color:#fff;font-family:monospace;font-size:12px">${newLicenseId}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Upgraded From</td><td style="color:#fff;font-family:monospace;font-size:12px">${upgradesFrom}</td></tr>
  </table>
  <div style="background:#22243A;border:1px solid #E53935;border-radius:8px;padding:16px;margin:16px 0">
    <p style="color:#aaa;margin:0 0 8px;font-size:11px;letter-spacing:1px">PRO UPGRADE KEY</p>
    <p style="color:#ffffff;word-break:break-all;font-family:monospace;font-size:11px;margin:0;line-height:1.6">${token}</p>
  </div>
  <p style="color:#aaa;font-size:13px;line-height:1.6">
    Apply this key in RestroPOS under <strong>Settings &rsaquo; License &rsaquo; Upgrade to Pro</strong>.<br>
    Keep this email confidential.
  </p>
  <p style="color:#555;font-size:11px;margin-top:24px;text-align:center">RestroPOS &bull; Powered by iMaker Technology</p>
</div>`;

  const text =
    `RestroPOS Pro Upgrade\n\n` +
    `Restaurant  : ${restaurant || '—'}\n` +
    `New License : ${newLicenseId}\n` +
    `Upgraded From: ${upgradesFrom}\n\n` +
    `--- PRO UPGRADE KEY ---\n${token}\n--- END ---\n\n` +
    `Apply this key in RestroPOS under Settings > License > Upgrade to Pro.\n` +
    `Keep this email confidential.\n\n` +
    `RestroPOS | Powered by iMaker Technology`;

  return sendMail(to, subject, html, text);
};

/**
 * Send payment invoice email for Pro upgrade.
 */
const sendPaymentInvoiceEmail = async (to, { restaurant, paymentId, orderId, amount, currency, date, token, newLicenseId, upgradesFrom }) => {
  if (!to) return;

  const amountStr = currency === 'INR'
    ? `₹${(amount / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`
    : `${amount / 100} ${currency}`;
  const dateStr = date || new Date().toLocaleString('en-IN', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Kolkata' });

  const subject = `Payment Receipt — RestroPOS Pro Upgrade — ${restaurant || 'RestroPOS'}`;

  const html = `
<div style="font-family:Arial,sans-serif;background:#1A1A2E;color:#ffffff;padding:32px;border-radius:12px;max-width:560px;margin:0 auto">
  <div style="text-align:center;margin-bottom:24px">
    <h2 style="color:#22c55e;margin:0;font-size:22px">✓ Payment Successful</h2>
    <p style="color:#aaa;margin:8px 0 0;font-size:14px">RestroPOS Pro Upgrade — Invoice</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px">
    <tr><td style="color:#888;padding:6px 0;width:140px">Restaurant</td><td style="color:#fff">${restaurant || '—'}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Amount Paid</td><td style="color:#22c55e;font-weight:bold;font-size:16px">${amountStr}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Payment ID</td><td style="color:#fff;font-family:monospace;font-size:12px">${paymentId || '—'}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Order ID</td><td style="color:#fff;font-family:monospace;font-size:12px">${orderId || '—'}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Date</td><td style="color:#fff">${dateStr}</td></tr>
    <tr><td style="color:#888;padding:6px 0">Plan</td><td style="color:#fff">Pro (Lifetime)</td></tr>
  </table>
  <hr style="border:none;border-top:1px solid #2E3155;margin:20px 0">
  <div style="text-align:center;margin-bottom:16px">
    <p style="color:#aaa;font-size:12px;letter-spacing:1px;margin:0 0 8px">YOUR PRO UPGRADE KEY</p>
  </div>
  <div style="background:#22243A;border:1px solid #E53935;border-radius:8px;padding:16px;margin:8px 0">
    <p style="color:#ffffff;word-break:break-all;font-family:monospace;font-size:11px;margin:0;line-height:1.6">${token}</p>
  </div>
  <p style="color:#aaa;font-size:13px;line-height:1.6;margin-top:16px">
    Apply this key in RestroPOS under <strong>Settings &rsaquo; License &rsaquo; Upgrade to Pro</strong>.<br>
    Your upgrade will activate all Pro features including Captain, Inventory, and Advanced Reports modules.
  </p>
  <p style="color:#555;font-size:11px;margin-top:24px;text-align:center">
    This is a computer-generated receipt. No signature required.<br>
    RestroPOS &bull; Powered by iMaker Technology &bull; support@imaker.technology
  </p>
</div>`;

  const text =
    `PAYMENT RECEIPT — RestroPOS Pro Upgrade\n` +
    `========================================\n\n` +
    `Restaurant  : ${restaurant || '—'}\n` +
    `Amount Paid : ${amountStr}\n` +
    `Payment ID  : ${paymentId || '—'}\n` +
    `Order ID    : ${orderId || '—'}\n` +
    `Date        : ${dateStr}\n` +
    `Plan        : Pro (Lifetime)\n\n` +
    `--- PRO UPGRADE KEY ---\n${token}\n--- END ---\n\n` +
    `Apply this key in RestroPOS under Settings > License > Upgrade to Pro.\n\n` +
    `This is a computer-generated receipt. No signature required.\n` +
    `RestroPOS | Powered by iMaker Technology | support@imaker.technology`;

  return sendMail(to, subject, html, text);
};

module.exports = { sendMail, sendActivationTokenEmail, sendUpgradeTokenEmail, sendPaymentInvoiceEmail };
