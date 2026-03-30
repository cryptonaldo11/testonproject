import React, { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLogin } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowRight, ShieldCheck, Users, Workflow } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { user, login } = useAuth();
  const [, setLocation] = useLocation();
  const redirectTarget = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("redirect") || "/dashboard";
  }, []);

  useEffect(() => {
    if (user) {
      setLocation(redirectTarget);
    }
  }, [user, setLocation, redirectTarget]);

  const loginMutation = useLogin({
    mutation: {
      onSuccess: (data) => {
        login(data.token);
        setLocation(redirectTarget);
      },
      onError: (err: Error & { response?: { data?: { error?: string } } }) => {
        setError(err?.response?.data?.error || "Invalid credentials");
      },
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ data: { email, password } });
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_hsl(var(--primary)/0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_hsl(var(--secondary)/0.45),_transparent_32%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.2))] px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-7xl overflow-hidden rounded-[2rem] border border-border/70 bg-card/75 shadow-2xl backdrop-blur xl:grid-cols-[1.08fr_0.92fr]">
        <section className="relative hidden overflow-hidden border-r border-border/70 bg-slate-950 px-8 py-10 text-white xl:flex xl:flex-col xl:justify-between">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.14),_transparent_30%)]" />
          <div className="absolute inset-0 opacity-70">
            <img
              src={`${import.meta.env.BASE_URL}images/login-bg.png`}
              alt="Workforce operations overview"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-slate-950/70" />
          </div>

          <div className="relative z-10 max-w-xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium backdrop-blur">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-950 text-[11px] font-bold">
                WO
              </div>
              Unified workforce operations platform
            </div>

            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="mt-10"
            >
              <h1 className="max-w-lg text-4xl font-semibold leading-tight tracking-tight xl:text-5xl">
                Run attendance, compliance, and workforce response from one trusted workspace.
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-slate-200">
                Access operational visibility, role-aware workflows, and auditable actions designed for responsible workforce management.
              </p>
            </motion.div>
          </div>

          <div className="relative z-10 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <ShieldCheck className="h-5 w-5 text-emerald-300" />
              <p className="mt-3 text-sm font-medium">Compliance-ready</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Role controls and clear audit expectations remain central.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <Workflow className="h-5 w-5 text-sky-300" />
              <p className="mt-3 text-sm font-medium">Coordinated operations</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Monitor daily workforce activity and response pathways together.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 backdrop-blur">
              <Users className="h-5 w-5 text-amber-300" />
              <p className="mt-3 text-sm font-medium">Role-aware access</p>
              <p className="mt-1 text-xs leading-5 text-slate-300">Each user sees only the tools and data appropriate to their role.</p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-4 py-8 sm:px-8 lg:px-12">
          <Card className="w-full max-w-md border-border/70 bg-background/90 shadow-none">
            <CardHeader className="space-y-4 pb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 xl:hidden">
                WO
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl tracking-tight">Sign in to Workforce Operations</CardTitle>
                <p className="text-sm leading-6 text-muted-foreground">
                  Use your work account to access workforce oversight, operational workflows, and compliance-sensitive tools.
                </p>
              </div>
              {redirectTarget !== "/dashboard" && (
                <div className="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  After sign-in, you will return to the page you originally requested.
                </div>
              )}
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="flex items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive"
                  >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                    <div>
                      <p className="font-medium">We could not sign you in.</p>
                      <p className="mt-1 text-destructive/90">{error}</p>
                    </div>
                  </motion.div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Password</Label>
                    <span className="text-xs text-muted-foreground">Contact your administrator for resets</span>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>

                <Button
                  type="submit"
                  className="h-12 w-full text-base"
                  disabled={loginMutation.isPending}
                >
                  <span>{loginMutation.isPending ? "Authenticating..." : "Continue securely"}</span>
                  {!loginMutation.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
                </Button>

                <div className="rounded-2xl border border-border/70 bg-muted/40 px-4 py-3 text-xs leading-5 text-muted-foreground">
                  Access is role-based and monitored to support workforce trust, compliance, and accountable operational decision-making.
                </div>
              </form>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
