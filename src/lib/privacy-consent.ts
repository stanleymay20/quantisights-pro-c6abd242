export const PRIVACY_CONSENT_KEY = "quantivis_cookie_consent";
export const PRIVACY_CONSENT_EVENT = "quantivis:privacy-consent-changed";

export type PrivacyConsentChoice = "analytics" | "essential_only";

export interface PrivacyConsentRecord {
  version: 1;
  choice: PrivacyConsentChoice;
  analytics: boolean;
  timestamp: string;
}

const normalizeChoice = (value: unknown): PrivacyConsentChoice | null => {
  if (value === "analytics" || value === "accepted") return "analytics";
  if (value === "essential_only") return "essential_only";
  return null;
};

export const readPrivacyConsent = (): PrivacyConsentRecord | null => {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(PRIVACY_CONSENT_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PrivacyConsentRecord>;
    const choice = normalizeChoice(parsed.choice);
    if (!choice) return null;
    return {
      version: 1,
      choice,
      analytics: choice === "analytics",
      timestamp: typeof parsed.timestamp === "string" ? parsed.timestamp : "unknown",
    };
  } catch {
    const choice = normalizeChoice(raw);
    if (!choice) return null;
    return { version: 1, choice, analytics: choice === "analytics", timestamp: "legacy" };
  }
};

export const hasAnalyticsConsent = () => readPrivacyConsent()?.analytics === true;

export const setPrivacyConsent = (choice: PrivacyConsentChoice): PrivacyConsentRecord => {
  const record: PrivacyConsentRecord = {
    version: 1,
    choice,
    analytics: choice === "analytics",
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(PRIVACY_CONSENT_KEY, JSON.stringify(record));
  window.dispatchEvent(new CustomEvent(PRIVACY_CONSENT_EVENT, { detail: record }));
  return record;
};
