import { logger } from "./logger";

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

// Sent-mail sink. In dev / test, every sendEmail call appends here so the
// integration tests can pull tokens out of the rendered URL. Production
// deployments should swap the underlying sender (Resend / Postmark / SES)
// and either disable the sink or cap its size.
const sentEmails: EmailMessage[] = [];
const MAX_RETAINED = 100;

export async function sendEmail(message: EmailMessage): Promise<void> {
  // Default impl: log to pino at info. Replace with a real provider call
  // when one's picked. The interface stays the same.
  logger.info(
    { to: message.to, subject: message.subject },
    "outbound email (dev sink)",
  );
  // For dev convenience, dump the body at debug — useful when copying a
  // reset link out of console output.
  logger.debug({ body: message.body }, "outbound email body");

  sentEmails.push(message);
  while (sentEmails.length > MAX_RETAINED) sentEmails.shift();

  // Async signature kept so we can swap in a network-call provider
  // without changing callers.
  return Promise.resolve();
}

export function drainSentEmails(): EmailMessage[] {
  const snapshot = sentEmails.slice();
  sentEmails.length = 0;
  return snapshot;
}

export function getLastEmailTo(address: string): EmailMessage | undefined {
  for (let i = sentEmails.length - 1; i >= 0; i--) {
    if (sentEmails[i]!.to === address) return sentEmails[i];
  }
  return undefined;
}
