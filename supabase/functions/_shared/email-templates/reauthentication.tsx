/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your Quantivis verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={brand}>
          <Text style={brandMark}>Quantivis</Text>
        </Section>
        <Heading style={h1}>Confirm it's you</Heading>
        <Text style={text}>Enter this verification code to confirm your identity:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          This code expires shortly. If you didn't request it, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const brand = { marginBottom: '28px' }
const brandMark = { fontSize: '13px', fontWeight: 600 as const, letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: '#0EA5E9', margin: 0 }
const h1 = { fontSize: '24px', fontWeight: 600 as const, color: '#141E33', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '15px', color: '#475569', lineHeight: '1.6', margin: '0 0 16px' }
const codeStyle = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace', fontSize: '28px', fontWeight: 700 as const, letterSpacing: '0.18em', color: '#141E33', backgroundColor: '#F1F5F9', borderRadius: '12px', padding: '16px 24px', textAlign: 'center' as const, margin: '0 0 24px' }
const footer = { fontSize: '12px', color: '#94A3B8', margin: '32px 0 0', lineHeight: '1.6' }
