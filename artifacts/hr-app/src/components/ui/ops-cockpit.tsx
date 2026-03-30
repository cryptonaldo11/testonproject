import React from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function OpsPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 lg:mb-8 lg:flex-row lg:items-end lg:justify-between">
      <div className="space-y-2">
        {eyebrow ? (
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">{eyebrow}</div>
        ) : null}
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight lg:text-4xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground lg:text-base">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function OpsHero({
  title,
  description,
  badge,
  icon: Icon,
  children,
  tone = "default",
}: {
  title: string;
  description: string;
  badge?: string;
  icon?: LucideIcon;
  children?: React.ReactNode;
  tone?: "default" | "critical" | "attention" | "success";
}) {
  const toneClasses = {
    default: "border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background",
    critical: "border-destructive/20 bg-gradient-to-br from-destructive/10 via-background to-background",
    attention: "border-amber-400/20 bg-gradient-to-br from-amber-400/10 via-background to-background",
    success: "border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-background to-background",
  } as const;

  return (
    <Card className={cn("mb-6 overflow-hidden border shadow-lg", toneClasses[tone])}>
      <CardContent className="p-6 lg:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {Icon ? (
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-background/80 text-primary shadow-sm">
                  <Icon className="h-5 w-5" />
                </div>
              ) : null}
              {badge ? <Badge variant="outline">{badge}</Badge> : null}
            </div>
            <div>
              <h2 className="text-2xl font-display font-bold tracking-tight">{title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground lg:text-base">{description}</p>
            </div>
          </div>
          {children ? <div className="xl:min-w-[280px]">{children}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function OpsStatGrid({ children }: { children: React.ReactNode }) {
  return <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

export function OpsStatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "critical" | "attention" | "success";
}) {
  const toneClasses = {
    default: "border-border bg-card",
    critical: "border-destructive/20 bg-destructive/5",
    attention: "border-amber-400/20 bg-amber-400/5",
    success: "border-emerald-400/20 bg-emerald-400/5",
  } as const;

  return (
    <Card className={cn("shadow-sm", toneClasses[tone])}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
            <div className="text-3xl font-display font-bold tracking-tight">{value}</div>
            {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
          </div>
          {Icon ? (
            <div className="rounded-2xl bg-background/80 p-3 text-primary shadow-sm">
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function OpsSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("shadow-sm", className)}>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="text-xl font-display">{title}</CardTitle>
          {description ? <CardDescription className="mt-1">{description}</CardDescription> : null}
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function OpsQueueNotice({
  title,
  description,
  cta,
  tone = "default",
}: {
  title: string;
  description: string;
  cta?: React.ReactNode;
  tone?: "default" | "critical" | "attention" | "success";
}) {
  const toneClasses = {
    default: "border-border bg-secondary/20",
    critical: "border-destructive/20 bg-destructive/5",
    attention: "border-amber-400/20 bg-amber-400/5",
    success: "border-emerald-400/20 bg-emerald-400/5",
  } as const;

  return (
    <div className={cn("rounded-2xl border p-4", toneClasses[tone])}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {cta ? <div className="mt-3">{cta}</div> : null}
    </div>
  );
}

export function OpsActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={href}>{children}</a>
    </Button>
  );
}
