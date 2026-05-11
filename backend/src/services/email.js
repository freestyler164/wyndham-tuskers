import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { awsClientConfig } from '../awsConfig.js';
import { config } from '../config.js';
import { getRuntimeSecret } from '../runtimeSecrets.js';

const sesClient = new SESClient(awsClientConfig);

const sendWithResend = async ({ to, subject, text, html }) => {
  const resendApiKey = getRuntimeSecret('RESEND_API_KEY') || config.resendApiKey;
  if (!resendApiKey) {
    throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend.');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.emailFrom,
      to: [to],
      subject,
      text,
      ...(html ? { html } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend email failed with ${response.status}: ${body}`);
  }
};

const sendWithSes = async ({ to, subject, text, html }) => {
  await sesClient.send(new SendEmailCommand({
    Source: config.emailFrom,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Data: subject },
      Body: {
        Text: { Data: text },
        ...(html ? { Html: { Data: html } } : {}),
      },
    },
  }));
};

const logEmail = ({ to, subject, text }) => {
  console.log('Email not sent by provider. Local email preview follows.');
  console.log(JSON.stringify({ to, from: config.emailFrom, subject, text }, null, 2));
};

export const sendEmail = async (message) => {
  if (config.emailProvider === 'resend') {
    await sendWithResend(message);
    return;
  }

  if (['ses', 'localstack', 'localstack-ses'].includes(config.emailProvider)) {
    try {
      await sendWithSes(message);
      return;
    } catch (error) {
      if (config.isProduction || config.emailProvider === 'ses') {
        throw error;
      }
      console.warn('LocalStack SES send failed; falling back to console preview:', error?.message);
    }
  }

  logEmail(message);
};
