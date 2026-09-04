import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const smtpScript = readFileSync("scripts/configure-staging-auth-smtp.mjs", "utf8");

const STAGING_REF = "cmnihsbdbpubznlkmjbc";
const PRODUCTION_REF = "izgfrekdamlgigehxoqs";


describe("staging Auth custom SMTP contract", () => {
  it("is hard-locked to the staging Supabase project", () => {
    expect(smtpScript).toContain(`const STAGING_REF = "${STAGING_REF}"`);
    expect(smtpScript).not.toContain(PRODUCTION_REF);
    expect(smtpScript).toContain("Refusing to configure Auth SMTP outside Quantivis staging");
  });

  it("uses the verified Quantivis sender and Resend SMTP endpoint", () => {
    expect(smtpScript).toContain('const EXPECTED_FROM_EMAIL = "alerts@quantivis.io"');
    expect(smtpScript).toContain('const SMTP_HOST = "smtp.resend.com"');
    expect(smtpScript).toContain("const SMTP_PORT = 465");
    expect(smtpScript).toContain('const SMTP_USER = "resend"');
    expect(smtpScript).toContain('const SMTP_SENDER_NAME = "Quantivis"');
  });

  it("reads credentials only from protected environment inputs", () => {
    expect(smtpScript).toContain("process.env.RESEND_API_KEY?.trim()");
    expect(smtpScript).toContain("process.env.RESEND_FROM_EMAIL?.trim()");
    expect(smtpScript).toContain("smtp_pass: resendApiKey");
    expect(smtpScript).not.toContain("console.log(resendApiKey");
    expect(smtpScript).not.toContain("console.error(resendApiKey");
  });

  it("read-back verifies only non-secret SMTP settings", () => {
    expect(smtpScript).toContain('after.smtp_admin_email !== EXPECTED_FROM_EMAIL');
    expect(smtpScript).toContain('after.smtp_host !== SMTP_HOST');
    expect(smtpScript).toContain('Number(after.smtp_port) !== SMTP_PORT');
    expect(smtpScript).toContain('after.smtp_user !== SMTP_USER');
    expect(smtpScript).toContain('after.smtp_sender_name !== SMTP_SENDER_NAME');
    expect(smtpScript).not.toContain("after.smtp_pass");
  });
});
