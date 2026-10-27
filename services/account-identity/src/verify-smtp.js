import {createSmtpTransport} from './smtp.js';
let transport;
try {
  transport = createSmtpTransport(process.env);
  await transport.verify();
  console.log('PASS SMTP TLS and authentication. No message sent.');
} catch (error) {
  // Never print provider response, environment, address or credentials.
  console.error('SMTP verification failed:', error.code || 'CONFIGURATION_ERROR', Number(error.responseCode) || '');
  process.exitCode = 1;
} finally {
  transport?.close();
}
