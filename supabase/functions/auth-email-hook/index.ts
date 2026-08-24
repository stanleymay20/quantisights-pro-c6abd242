import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SignupEmail } from '../_shared/email-templates/signup.tsx'
import { InviteEmail } from '../_shared/email-templates/invite.tsx'
import { MagicLinkEmail } from '../_shared/email-templates/magic-link.tsx'
import { RecoveryEmail } from '../_shared/email-templates/recovery.tsx'
import { EmailChangeEmail } from '../_shared/email-templates/email-change.tsx'
import { ReauthenticationEmail } from '../_shared/email-templates/reauthentication.tsx'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, content-type, webhook-id, webhook-signature, webhook-timestamp, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'Confirm your email',
  invite: "You've been invited",
  magiclink: 'Your login link',
  recovery: 'Reset your password',
  email_change: 'Confirm your new email',
  reauthentication: 'Your verification code',
}

const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

const SITE_NAME = 'Quantivis'
const SENDER_DOMAIN = 'notify.www.quantivis.io'
const ROOT_DOMAIN = 'www.quantivis.io'
const FROM_DOMAIN = 'www.quantivis.io'

const SAMPLE_PROJECT_URL = 'https://quantisights-pro.lovable.app'
const SAMPLE_EMAIL = 'user@example.test'
const SAMPLE_DATA: Record<string, object> = {
  signup: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    recipient: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  magiclink: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  recovery: {
    siteName: SITE_NAME,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  invite: {
    siteName: SITE_NAME,
    siteUrl: SAMPLE_PROJECT_URL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  email_change: {
    siteName: SITE_NAME,
    oldEmail: SAMPLE_EMAIL,
    email: SAMPLE_EMAIL,
    newEmail: SAMPLE_EMAIL,
    confirmationUrl: SAMPLE_PROJECT_URL,
  },
  reauthentication: {
    token: '123456',
  },
}

type HookUser = {
  id: string
  email?: string | null
  new_email?: string | null
}

type HookEmailData = {
  token?: string | null
  token_hash?: string | null
  redirect_to?: string | null
  email_action_type: string
  site_url?: string | null
  token_new?: string | null
  token_hash_new?: string | null
  old_email?: string | null
}

type SendEmailHookPayload = {
  user: HookUser
  email_data: HookEmailData
}

type OutboundEmail = {
  recipient: string
  confirmationUrl?: string
  token?: string | null
  idempotencyMaterial: string
}

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

function buildVerificationUrl(
  tokenHash: string | null | undefined,
  actionType: string,
  redirectTo: string | null | undefined,
): string | undefined {
  if (!tokenHash) return undefined

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured')

  const url = new URL('/auth/v1/verify', supabaseUrl)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', actionType)
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

async function deterministicMessageId(material: string): Promise<string> {
  const bytes = new TextEncoder().encode(material)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function buildOutboundEmails(payload: SendEmailHookPayload): OutboundEmail[] {
  const { user, email_data: emailData } = payload
  const actionType = emailData.email_action_type
  const currentEmail = user.email?.trim()

  if (!currentEmail) throw new Error('Auth hook user is missing an email address')

  if (actionType === 'reauthentication') {
    return [{
      recipient: currentEmail,
      token: emailData.token,
      idempotencyMaterial: `${user.id}|${actionType}|${currentEmail}|${emailData.token ?? ''}`,
    }]
  }

  if (actionType === 'email_change') {
    const newEmail = user.new_email?.trim()
    if (!newEmail) throw new Error('Email-change hook is missing the new email address')

    // Supabase secure-email-change deliberately uses counterintuitive hash names:
    // token_hash_new confirms the CURRENT address, while token_hash confirms the NEW address.
    // When both hashes are present we must send one confirmation to each address.
    if (emailData.token_hash_new && emailData.token_hash) {
      return [
        {
          recipient: currentEmail,
          confirmationUrl: buildVerificationUrl(
            emailData.token_hash_new,
            actionType,
            emailData.redirect_to,
          ),
          token: emailData.token,
          idempotencyMaterial: `${user.id}|${actionType}|current|${currentEmail}|${emailData.token_hash_new}`,
        },
        {
          recipient: newEmail,
          confirmationUrl: buildVerificationUrl(
            emailData.token_hash,
            actionType,
            emailData.redirect_to,
          ),
          token: emailData.token_new,
          idempotencyMaterial: `${user.id}|${actionType}|new|${newEmail}|${emailData.token_hash}`,
        },
      ]
    }

    return [{
      recipient: newEmail,
      confirmationUrl: buildVerificationUrl(
        emailData.token_hash,
        actionType,
        emailData.redirect_to,
      ),
      token: emailData.token_new ?? emailData.token,
      idempotencyMaterial: `${user.id}|${actionType}|${newEmail}|${emailData.token_hash ?? ''}`,
    }]
  }

  return [{
    recipient: currentEmail,
    confirmationUrl: buildVerificationUrl(
      emailData.token_hash,
      actionType,
      emailData.redirect_to,
    ),
    token: emailData.token,
    idempotencyMaterial: `${user.id}|${actionType}|${currentEmail}|${emailData.token_hash ?? emailData.token ?? ''}`,
  }]
}

async function handlePreview(req: Request): Promise<Response> {
  const previewCorsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: previewCorsHeaders })
  }

  const apiKey = Deno.env.get('LOVABLE_API_KEY')
  const authHeader = req.headers.get('Authorization')

  if (!apiKey || authHeader !== `Bearer ${apiKey}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let type: string
  try {
    const body = await req.json()
    type = body.type
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const EmailTemplate = EMAIL_TEMPLATES[type]
  if (!EmailTemplate) {
    return new Response(JSON.stringify({ error: `Unknown email type: ${type}` }), {
      status: 400,
      headers: { ...previewCorsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const html = await renderAsync(React.createElement(EmailTemplate, SAMPLE_DATA[type] || {}))
  return new Response(html, {
    status: 200,
    headers: { ...previewCorsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function verifySupabaseHook(req: Request): Promise<SendEmailHookPayload> {
  const configuredSecret = Deno.env.get('SEND_EMAIL_HOOK_SECRET')
  if (!configuredSecret) throw new Error('SEND_EMAIL_HOOK_SECRET is not configured')

  const secret = configuredSecret.replace(/^v1,whsec_/, '')
  const rawBody = await req.text()
  const headers = Object.fromEntries(req.headers.entries())
  const webhook = new Webhook(secret)
  return webhook.verify(rawBody, headers) as SendEmailHookPayload
}

async function handleWebhook(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  let payload: SendEmailHookPayload
  try {
    payload = await verifySupabaseHook(req)
  } catch (error) {
    console.error('Supabase Auth hook verification failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({ error: 'Invalid webhook signature or payload' }, 401)
  }

  const emailType = payload.email_data?.email_action_type
  if (!emailType || !EMAIL_TEMPLATES[emailType]) {
    console.error('Unsupported Auth email type', { emailType })
    return jsonResponse({ error: 'Unsupported Auth email type' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Supabase email hook is missing service configuration')
    return jsonResponse({ error: 'Server configuration error' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const outbound = buildOutboundEmails(payload)

  for (const email of outbound) {
    const messageId = await deterministicMessageId(email.idempotencyMaterial)
    const templateProps = {
      siteName: SITE_NAME,
      siteUrl: `https://${ROOT_DOMAIN}`,
      recipient: email.recipient,
      confirmationUrl: email.confirmationUrl ?? payload.email_data.site_url ?? `https://${ROOT_DOMAIN}`,
      token: email.token,
      email: payload.user.email,
      oldEmail: payload.email_data.old_email ?? payload.user.email,
      newEmail: payload.user.new_email,
    }

    const EmailTemplate = EMAIL_TEMPLATES[emailType]
    const html = await renderAsync(React.createElement(EmailTemplate, templateProps))
    const text = await renderAsync(React.createElement(EmailTemplate, templateProps), {
      plainText: true,
    })

    const { error: logError } = await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: emailType,
      recipient_email: email.recipient,
      status: 'pending',
      metadata: {
        source: 'supabase_auth_send_email_hook',
        user_id: payload.user.id,
      },
    })

    if (logError) {
      console.error('Failed to create durable auth-email audit record', {
        emailType,
        messageId,
        error: logError.message,
      })
      return jsonResponse({ error: 'Failed to create email audit record' }, 500)
    }

    const { error: enqueueError } = await supabase.rpc('enqueue_email', {
      queue_name: 'auth_emails',
      payload: {
        run_id: messageId,
        message_id: messageId,
        idempotency_key: messageId,
        to: email.recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject: EMAIL_SUBJECTS[emailType] || 'Notification',
        html,
        text,
        purpose: 'transactional',
        label: emailType,
        queued_at: new Date().toISOString(),
      },
    })

    if (enqueueError) {
      console.error('Failed to enqueue auth email', {
        emailType,
        messageId,
        error: enqueueError.message,
      })
      await supabase
        .from('email_send_log')
        .update({
          status: 'failed',
          error_message: 'Failed to enqueue email',
        })
        .eq('message_id', messageId)
        .eq('status', 'pending')
      return jsonResponse({ error: 'Failed to enqueue email' }, 500)
    }

    console.log('Supabase Auth email enqueued', {
      emailType,
      recipient: email.recipient,
      messageId,
    })
  }

  return jsonResponse({ success: true, queued: outbound.length })
}

Deno.serve(async (req) => {
  const url = new URL(req.url)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (url.pathname.endsWith('/preview')) {
    return handlePreview(req)
  }

  try {
    return await handleWebhook(req)
  } catch (error) {
    console.error('Auth email hook failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonResponse({ error: 'Auth email hook failed' }, 500)
  }
})
