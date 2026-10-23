import { EmailClient } from '@azure/communication-email'

// Azure Communication Services Email, using its free "Azure Managed Domain" sender
// (no domain purchase or DNS setup needed — see infra/main.bicep's emailServices/
// domains resource). Chosen over a third-party provider since it needs no new
// account: it's provisioned in the same Azure subscription/resource group as
// everything else, billed against the same credit.
let client: EmailClient | null = null

function getClient(): EmailClient {
  if (!client) {
    const connectionString = process.env.ACS_CONNECTION_STRING
    if (!connectionString) throw new Error('ACS_CONNECTION_STRING is not configured')
    client = new EmailClient(connectionString)
  }
  return client
}

function senderAddress(): string {
  const address = process.env.ACS_SENDER_ADDRESS
  if (!address) throw new Error('ACS_SENDER_ADDRESS is not configured')
  return address
}

export async function sendVerificationCodeEmail(email: string, code: string): Promise<void> {
  const poller = await getClient().beginSend({
    senderAddress: senderAddress(),
    content: {
      subject: `${code} is your Artha verification code`,
      plainText: `Your Artha verification code is ${code}. It expires in 15 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      html: `<p>Your Artha verification code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p><p>It expires in 15 minutes.</p><p style="color:#666;font-size:13px">If you didn't request this, you can ignore this email.</p>`
    },
    recipients: {
      to: [{ address: email }]
    }
  })
  await poller.pollUntilDone()
}

// Generic reminder/notification content (insurance renewal, credit card due, etc.)
// — the Electron client builds subject/text itself (see src/main/services/email.ts)
// and just needs this to actually deliver it. `to` must match whatever email the
// caller's `notify`-purpose verificationToken proves ownership of — enforced by
// notifySend.ts before this is ever called, not by this function itself.
export async function sendNotificationEmail(to: string, subject: string, text: string): Promise<void> {
  const poller = await getClient().beginSend({
    senderAddress: senderAddress(),
    content: {
      subject,
      plainText: text
    },
    recipients: {
      to: [{ address: to }]
    }
  })
  await poller.pollUntilDone()
}
