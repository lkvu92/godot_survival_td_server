import nodemailer from 'nodemailer';

export function createSmtpTransport(env) {
  if (!env.SMTP_USER || !env.SMTP_PASSWORD) throw Error('SMTP_USER and SMTP_PASSWORD are required');
  const port = Number(env.SMTP_PORT || 587);
  if (![465, 587].includes(port)) throw Error('SMTP TLS port required');
  return nodemailer.createTransport({
    host: env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, requireTLS: true,
    auth: {user: env.SMTP_USER, pass: env.SMTP_PASSWORD.replace(/ /g, '')},
    tls: {minVersion: 'TLSv1.2', rejectUnauthorized: true},
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false
  });
}
