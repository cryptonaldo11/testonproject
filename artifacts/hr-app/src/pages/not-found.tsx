import { Link } from "wouter";
import { ArrowLeft, Compass, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";

export default function NotFound() {
  const { user } = useAuth();
  const primaryHref = user ? "/dashboard" : "/login";
  const primaryLabel = user ? "Return to command center" : "Go to sign in";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.08),_transparent_35%),linear-gradient(180deg,_hsl(var(--background)),_hsl(var(--muted)/0.22))] px-4 py-8">
      <Card className="w-full max-w-2xl border-border/70 bg-card/90 shadow-xl backdrop-blur">
        <CardContent className="p-6 sm:p-10">
          <div className="flex flex-col gap-8 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-medium text-muted-foreground">
                <ShieldAlert className="h-3.5 w-3.5 text-primary" />
                Route not available
              </div>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                This workspace route could not be found.
              </h1>
              <p className="mt-4 text-sm leading-7 text-muted-foreground sm:text-base">
                The page may have moved, the link may be incomplete, or this destination may not be part of your current workflow.
                Access controls and route protections are still active.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Button asChild className="w-full sm:w-auto">
                  <Link href={primaryHref}>{primaryLabel}</Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => window.history.back()}
                >
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Go back
                </Button>
              </div>
            </div>

            <div className="rounded-3xl border border-border/70 bg-background/80 p-5 sm:w-64">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
                <Compass className="h-6 w-6" />
              </div>
              <p className="mt-4 text-sm font-semibold">Need a safe next step?</p>
              <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                <li>Check that the web address is correct.</li>
                <li>Return to the command center and continue from the main navigation.</li>
                <li>Contact an administrator if you expected access to this destination.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
