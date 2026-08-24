export class ResendDeliveryError extends Error {
  status: number
  retryAfterSeconds: number | null

  constructor(message: string, status: number, retryAfterSeconds: number | null = null) {
    super(message)
    this.name = 'ResendDeliveryError'
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

type ResendMessage = {
  apiKey: string
  from: string
  to: string | string[]
  subject: string
  html?: string | null
  text?: string | null
  idempotencyKey?: string | null
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds)

  const retryAt = Date.parse(value)
  if (!Number.isNaN(retryAt)) {
    return Math.max(0, Math.ceil((retryAt - Date.now()) / 1000))
  }

  return null
}

function providerErrorDetail(body: string): string {
  if (!body) return 'empty response body'

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>
    const candidate = parsed.message ?? parsed.error ?? parsed.name
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim().slice(0, 500)
    }
  } catch {
    // Fall back to a bounded plain-text detail below.
  }

  return body.replace(/\s+/g, ' ').trim().slice(0, 500) || 'unreadable response body'
}

export async function sendResendEmail(message: ResendMessage): Promise<{ id: string | null }> {
  const recipients = Array.isArray(message.to) ? message.to : [message.to]
  const normalizedRecipients = recipients
    .map((recipient) => recipient.trim())
    .filter(Boolean)

  if (!message.apiKey.trim()) {
    throw new ResendDeliveryError('RESEND_API_KEY is not configured', 500)
  }
  if (!message.from.trim()) {
    throw new ResendDeliveryError('RESEND_FROM_EMAIL is not configured', 500)
  }
  if (normalizedRecipients.length === 0) {
    throw new ResendDeliveryError('Email recipient is missing', 422)
  }
  if (!message.subject?.trim()) {
    throw new ResendDeliveryError('Email subject is missing', 422)
  }
  if (!message.html && !message.text) {
    throw new ResendDeliveryError('Email body is missing', 422)
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${message.apiKey}`,
    'Content-Type': 'application/json',
  }

  if (message.idempotencyKey?.trim()) {
    headers['Idempotency-Key'] = message.idempotencyKey.trim()
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      from: message.from,
      to: normalizedRecipients,
      subject: message.subject,
      ...(message.html ? { html: message.html } : {}),
      ...(message.text ? { text: message.text } : {}),
    }),
  })

  const body = await response.text()
  if (!response.ok) {
    throw new ResendDeliveryError(
      `Resend HTTP ${response.status}: ${providerErrorDetail(body)}`,
      response.status,
      parseRetryAfter(response.headers.get('retry-after')),
    )
  }

  if (!body) return { id: null }

  try {
    const payload = JSON.parse(body) as { id?: unknown }
    return { id: typeof payload.id === 'string' ? payload.id : null }
  } catch {
    return { id: null }
  }
}
