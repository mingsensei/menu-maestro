// Booking emails, ported from the RTR Spring EmailService.
import nodemailer from 'nodemailer';

const RESTAURANT = {
  name: 'Riverside Terrace Restaurant',
  address: '493 Tran Hung Dao Street, An Hai Ward, Da Nang City, Viet Nam',
  phone: '(+84) 911500440',
};

const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const orNone = value => (value && String(value).trim() ? value : 'No reason provided.');

const statusPanel = (title, message, text, background) => `
<div style="margin:22px 0;padding:18px 20px;border-radius:16px;background:${background};border:1px solid ${text};">
  <div style="font-size:18px;font-weight:800;color:${text};">${escapeHtml(title)}</div>
  <div style="margin-top:6px;font-size:14px;line-height:1.6;color:${text};">${message}</div>
</div>`;

const holdNotice = `
<div style="margin:-10px 0 22px;padding:18px 20px;border-radius:16px;background:#fff7ed;border:1px solid #f59e0b;">
  <div style="font-size:16px;font-weight:800;color:#92400e;">Important arrival notice</div>
  <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#92400e;">We will hold your table for only <strong>15 minutes</strong> from your reservation time. Please arrive on time.</div>
</div>`;

const TEMPLATES = {
  otp: (booking, { otp }) => ({
    subject: 'Riverside Terrace email verification', title: 'Email Verification',
    intro: 'Please use the verification code below to complete your table reservation.',
    highlight: `
<div style="margin:24px 0;text-align:center;">
  <div style="display:inline-block;min-width:180px;padding:18px 28px;border-radius:14px;background:#7f1d1d;color:#fff;font-size:34px;font-weight:800;letter-spacing:8px;">${escapeHtml(otp)}</div>
  <p style="margin:14px 0 0;color:#6b7280;font-size:14px;">This code is valid for <strong>2 minutes</strong>.</p>
</div>`,
  }),
  pending: () => ({
    subject: 'Riverside Terrace booking received', title: 'Booking Request Received',
    intro: 'Thank you for choosing Riverside Terrace. We have received your request and our team is reviewing your table reservation.',
    highlight: statusPanel('Pending approval', 'Your booking is waiting for restaurant confirmation.', '#991b1b', '#fee2e2'),
  }),
  approved: () => ({
    subject: 'Riverside Terrace booking approved', title: 'Booking Confirmed',
    intro: 'Thank you for choosing Riverside Terrace. Your booking has been confirmed and we look forward to welcoming you.',
    highlight: statusPanel('Confirmed', 'Your table is reserved. Please arrive on time so we can prepare the best experience for your party.', '#166534', '#dcfce7') + holdNotice,
  }),
  rejected: booking => ({
    subject: 'Riverside Terrace booking rejected', title: 'Booking Update',
    intro: 'Thank you for your interest in Riverside Terrace. Unfortunately, we cannot confirm this booking request.',
    highlight: statusPanel('Rejected', `Reason: ${escapeHtml(orNone(booking.rejectionReason))}`, '#991b1b', '#fee2e2'),
  }),
  cancelled: () => ({
    subject: 'Riverside Terrace booking cancelled', title: 'Booking Cancelled',
    intro: 'Your booking has been cancelled. Thank you for contacting Riverside Terrace, and we hope to welcome you another time.',
    highlight: statusPanel('Cancelled', 'This reservation is no longer active.', '#374151', '#f3f4f6'),
  }),
  updated: () => ({
    subject: 'Riverside Terrace booking updated', title: 'Booking Updated',
    intro: 'Thank you for choosing Riverside Terrace. Your booking details have been updated by our team.',
    highlight: statusPanel('Updated', 'Please review the latest reservation details below.', '#92400e', '#fef3c7'),
  }),
};

const row = (label, value) => `
<tr>
  <td style="width:38%;padding:13px 18px;border-top:1px solid #eadfd8;color:#6b7280;font-weight:700;">${escapeHtml(label)}</td>
  <td style="padding:13px 18px;border-top:1px solid #eadfd8;color:#2f241f;font-weight:700;">${escapeHtml(value)}</td>
</tr>`;

export function renderBookingEmail(kind, booking, extra = {}) {
  const template = TEMPLATES[kind];
  if (!template) throw new Error(`Unknown email template: ${kind}`);
  const { subject, title, intro, highlight } = template(booking, extra);
  const details = row('Booking code', booking.bookingCode) + row('Status', booking.status) + row('Area', booking.area)
    + row('Table', booking.tables.map(table => table.tableNumber).join(', ')) + row('Date', booking.bookingDate)
    + row('Time', `${booking.startTime} - ${booking.endTime}`) + row('Guests', String(booking.numberOfGuests))
    + row('Phone', booking.customerPhone) + row('Email', booking.customerEmail) + row('Note', orNone(booking.note));
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f7f2ee;font-family:Arial,Helvetica,sans-serif;color:#2f241f;">
    <div style="max-width:680px;margin:0 auto;padding:28px 14px;">
      <div style="overflow:hidden;border-radius:20px;background:#ffffff;border:1px solid #eadfd8;box-shadow:0 14px 40px rgba(47,36,31,0.12);">
        <div style="background:#7f1d1d;padding:30px 28px;color:#ffffff;">
          <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.86;">${RESTAURANT.name}</div>
          <h1 style="margin:10px 0 0;font-size:28px;line-height:1.2;font-weight:800;">${escapeHtml(title)}</h1>
          <p style="margin:10px 0 0;font-size:15px;line-height:1.6;opacity:.92;">Italian-inspired riverside dining in Da Nang</p>
        </div>
        <div style="padding:30px 28px;">
          <p style="margin:0 0 14px;font-size:16px;line-height:1.7;">Dear <strong>${escapeHtml(booking.customerName)}</strong>,</p>
          <p style="margin:0 0 22px;font-size:16px;line-height:1.7;">${escapeHtml(intro)}</p>
          ${highlight}
          <div style="margin-top:26px;border:1px solid #eadfd8;border-radius:16px;overflow:hidden;">
            <div style="padding:14px 18px;background:#faf7f4;font-weight:800;text-transform:uppercase;letter-spacing:.8px;font-size:12px;color:#7f1d1d;">Reservation Details</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:15px;">${details}</table>
          </div>
          <div style="margin-top:26px;padding:18px;border-radius:16px;background:#fff7ed;border:1px solid #fed7aa;">
            <p style="margin:0;font-size:15px;line-height:1.7;"><strong>Thank you for choosing Riverside Terrace.</strong><br>Our team is preparing a warm, comfortable dining experience for you and your guests.</p>
          </div>
          <p style="margin:24px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">If you need to adjust your reservation, please contact the restaurant team before your arrival time.</p>
        </div>
        <div style="padding:20px 28px;background:#2f241f;color:#f8efe8;">
          <div style="font-weight:800;">${RESTAURANT.name}</div>
          <div style="margin-top:6px;font-size:13px;line-height:1.6;color:#e8d7cd;">${RESTAURANT.address}<br>${RESTAURANT.phone}</div>
        </div>
      </div>
    </div>
  </body>
</html>`;
  return { subject, html };
}

/**
 * SMTP mailer. Without SMTP settings, development logs messages (including the OTP)
 * to the console; production reports itself as unconfigured so booking is refused.
 */
export function createMailer(config, logger = console) {
  const { host, port, secure, user, password, from } = config.mail || {};
  if (!host) {
    if (config.production) return { configured: false, send: async () => { throw new Error('Email is not configured.'); } };
    return {
      configured: true,
      send: async (kind, booking, extra = {}) => {
        logger.info(`[mail:dev] ${kind} -> ${booking.customerEmail} (${booking.bookingCode})${extra.otp ? ` OTP=${extra.otp}` : ''}`);
      },
    };
  }
  const transport = nodemailer.createTransport({ host, port, secure, ...(user ? { auth: { user, pass: password } } : {}) });
  const sender = from || user;
  return {
    configured: Boolean(sender),
    send: async (kind, booking, extra = {}) => {
      if (!sender) throw new Error('Email sender is not configured. Set MAIL_FROM or MAIL_USERNAME.');
      const { subject, html } = renderBookingEmail(kind, booking, extra);
      await transport.sendMail({ from: sender, to: booking.customerEmail, subject, html });
    },
  };
}
