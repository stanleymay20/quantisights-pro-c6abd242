import { Link, useSearchParams } from "react-router-dom";
import { Mail } from "lucide-react";

const VerifyEmail = () => {
  const [params] = useSearchParams();
  const email = params.get("email") || "your email address";

  return (
    <div style={{ minHeight: "100dvh", background: "#0E1628", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif", padding: "24px" }}>
      <div style={{ background: "#fff", borderRadius: 8, padding: "48px 40px", maxWidth: 480, width: "100%", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}>
          <Mail size={24} color="#3D5AFE" />
        </div>
        <h1 style={{ fontFamily: "Georgia, serif", fontSize: 28, color: "#1E2761", fontWeight: 400, margin: "0 0 12px", letterSpacing: "-0.02em" }}>
          Check your email
        </h1>
        <p style={{ fontSize: 15, color: "#64748B", lineHeight: 1.7, margin: "0 0 8px" }}>
          We sent a verification link to
        </p>
        <p style={{ fontSize: 15, fontWeight: 600, color: "#1E2761", margin: "0 0 32px", wordBreak: "break-all" }}>
          {email}
        </p>
        <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.6, margin: "0 0 32px" }}>
          Click the link in your email to confirm your account and access your Quantivis workspace. The link expires in 24 hours.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <a href={`mailto:${email}`} style={{ display: "block", background: "#3D5AFE", color: "#fff", padding: "12px 20px", borderRadius: 4, fontSize: 14, fontWeight: 600, textDecoration: "none" }}>
            Open email app
          </a>
          <Link to="/login" style={{ display: "block", color: "#64748B", fontSize: 13, textDecoration: "none", padding: "8px" }}>
            Already verified? Sign in →
          </Link>
        </div>
        <p style={{ fontSize: 11, color: "#CBD5E1", marginTop: 24 }}>
          Didn't receive it? Check your spam folder or{" "}
          <Link to="/register" style={{ color: "#3D5AFE", textDecoration: "none" }}>try a different email</Link>.
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
