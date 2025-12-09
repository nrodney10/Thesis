export async function notifyUsers(userIds, subject, message) {
  console.log('notifyUsers called for', userIds, subject);
  if (!process.env.SMTP_HOST) return Promise.resolve();

  // dynamic import to avoid runtime errors when nodemailer isn't installed
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
    return transporter.sendMail({ from: process.env.SMTP_FROM || 'no-reply@example.com', to: process.env.SMTP_TO || process.env.SMTP_USER, subject, text: message });
  } catch (err) {
    console.warn('nodemailer not available or failed to send', err.message);
    return Promise.resolve();
  }
}
