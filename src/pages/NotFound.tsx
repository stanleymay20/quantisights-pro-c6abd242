import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { ArrowLeft, Shield } from "lucide-react";
import logo from "@/assets/quantivis-logo.png";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 w-96 h-96 bg-primary/5 rounded-full blur-[120px]" />
      </div>
      <div className="text-center relative z-10 max-w-md">
        <Link to="/" className="inline-block mb-8">
          <img src={logo} alt="Quantivis Global" className="h-10 mx-auto" />
        </Link>
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
          <Shield className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-6xl font-bold tracking-tight gradient-text mb-4">404</h1>
        <p className="text-lg text-muted-foreground mb-2">Page not found</p>
        <p className="text-sm text-muted-foreground mb-8">
          The page <code className="text-xs bg-secondary px-1.5 py-0.5 rounded">{location.pathname}</code> doesn't exist.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 transition-all"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
