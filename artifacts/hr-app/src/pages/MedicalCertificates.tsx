import React, { useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  useCreateMedicalCertificate,
  useListMedicalCertificates,
  useListUsers,
  useUpdateMedicalCertificate,
} from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Badge, Input, Label } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";
import { OPERATIONAL_ROLES, ADMIN_HR_ROLES, useAuth } from "@/lib/auth";
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, Upload, X, Filter, UserCheck, CalendarClock, SearchX, ShieldCheck, FileSearch, ShieldAlert } from "lucide-react";
import {
  OpsHero,
  OpsPageHeader,
  OpsQueueNotice,
  OpsSection,
  OpsStatCard,
  OpsStatGrid,
} from "@/components/ui/ops-cockpit";
import { useUpload } from "@workspace/object-storage-web";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const storageBasePath = apiBaseUrl ? `${apiBaseUrl}/api/storage` : "/api/storage";

function employeeFallback(userId: number): string {
  return `Employee #${userId}`;
}

export default function MedicalCertificates() {
  const { user, hasRole } = useAuth();
  const isOperational = hasRole(OPERATIONAL_ROLES);
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split("T")[0]);
  const [mcStartDate, setMcStartDate] = useState("");
  const [mcEndDate, setMcEndDate] = useState("");
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [reviewTarget, setReviewTarget] = useState<{ id: number; status: "pending" | "verified" | "suspicious" | "unreadable" } | null>(null);
  const [verificationNotes, setVerificationNotes] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [expiryFilter, setExpiryFilter] = useState<"" | "expiring_soon" | "expired">("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: mcData, refetch } = useListMedicalCertificates(
    isOperational ? (statusFilter ? { verificationStatus: statusFilter } : {}) : { userId: user?.id },
  );
  const { data: usersData } = useListUsers(undefined, {
    query: {
      queryKey: ["medical-certificates", "users"],
      enabled: isOperational,
    },
  });

  const userLabelMap = useMemo(() => {
    const entries = new Map<number, string>();
    usersData?.users?.forEach((account) => {
      entries.set(account.id, account.name || employeeFallback(account.id));
    });
    if (user?.id) {
      entries.set(user.id, user.name || employeeFallback(user.id));
    }
    return entries;
  }, [user, usersData?.users]);

  const getEmployeeLabel = (userId: number) => userLabelMap.get(userId) ?? employeeFallback(userId);

  // Determine expiry status for a certificate
  const getCertExpiryInfo = (mc: { mcEndDate?: string | null; reminderSentAt?: string | null }) => {
    if (!mc.mcEndDate) return null;
    const endDate = new Date(mc.mcEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);
    const diffMs = endDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Expired", variant: "destructive" as const, diffDays };
    if (diffDays <= 7) return { label: `Expiring in ${diffDays}d`, variant: "warning" as const, diffDays };
    return null;
  };

  // Apply combined status + expiry filter
  const filteredCerts = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const futureStr = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return (mcData?.certificates ?? []).filter((mc) => {
      if (statusFilter && mc.verificationStatus !== statusFilter) return false;
      if (!expiryFilter) return true;
      if (!mc.mcEndDate) return false;
      if (expiryFilter === "expired") return mc.mcEndDate < todayStr;
      if (expiryFilter === "expiring_soon") {
        return mc.mcEndDate >= todayStr && mc.mcEndDate <= futureStr;
      }
      return true;
    });
  }, [mcData?.certificates, statusFilter, expiryFilter]);

  const certificateSummary = useMemo(() => {
    return (mcData?.certificates ?? []).reduce(
      (summary, mc) => {
        summary.total += 1;
        if (mc.verificationStatus === "pending") summary.pending += 1;
        if (mc.verificationStatus === "verified") summary.verified += 1;
        if (mc.verificationStatus === "suspicious" || mc.verificationStatus === "unreadable") summary.needsFollowUp += 1;
        const expiryInfo = getCertExpiryInfo(mc);
        if (expiryInfo?.variant === "warning") summary.expiringSoon += 1;
        if (expiryInfo?.variant === "destructive") summary.expired += 1;
        return summary;
      },
      {
        total: 0,
        pending: 0,
        verified: 0,
        needsFollowUp: 0,
        expiringSoon: 0,
        expired: 0,
      },
    );
  }, [mcData?.certificates]);

  const createMCMutation = useCreateMedicalCertificate({
    mutation: {
      onSuccess: () => {
        setIsUploading(false);
        setSelectedFile(null);
        setClinicName("");
        setDoctorName("");
        setMcStartDate("");
        setMcEndDate("");
        setFeedback({ type: "success", message: "Medical certificate uploaded successfully." });
        refetch();
      },
      onError: () => {
        setIsUploading(false);
        setFeedback({ type: "error", message: "Failed to save the medical certificate record." });
      },
    },
  });

  const updateMCMutation = useUpdateMedicalCertificate({
    mutation: {
      onSuccess: () => {
        setFeedback({ type: "success", message: "Medical certificate verification updated." });
        setReviewTarget(null);
        setVerificationNotes("");
        refetch();
      },
      onError: () => {
        setFeedback({ type: "error", message: "Failed to update medical certificate verification." });
      },
    },
  });

  const { uploadFile, isUploading: isFileUploading, progress } = useUpload({
    basePath: storageBasePath,
    getAuthHeaders: () => {
      const token = localStorage.getItem("auth_token");
      if (!token) {
        return {} as Record<string, string>;
      }
      return { Authorization: `Bearer ${token}` };
    },
    onError: () => {
      setFeedback({
        type: "error",
        message: "File upload failed. Check that object storage is configured correctly and try again.",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFeedback(null);

    if (!user?.id || !selectedFile) return;

    setIsUploading(true);
    const uploadResult = await uploadFile(selectedFile);
    if (!uploadResult) {
      setIsUploading(false);
      return;
    }

    createMCMutation.mutate({
      data: {
        userId: user.id,
        fileName: selectedFile.name,
        fileUrl: uploadResult.objectPath,
        fileType: selectedFile.type || "application/octet-stream",
        clinicName: clinicName || undefined,
        doctorName: doctorName || undefined,
        issueDate: issueDate || undefined,
        mcStartDate: mcStartDate || undefined,
        mcEndDate: mcEndDate || undefined,
      },
    });
  };

  const openReviewDialog = (
    id: number,
    status: "pending" | "verified" | "suspicious" | "unreadable",
    currentNotes?: string | null,
  ) => {
    setFeedback(null);
    setReviewTarget({ id, status });
    setVerificationNotes(currentNotes ?? "");
  };

  const submitVerificationUpdate = () => {
    if (!reviewTarget) return;
    updateMCMutation.mutate({
      id: reviewTarget.id,
      data: {
        verificationStatus: reviewTarget.status,
        verificationNotes,
      },
    });
  };

  const isPending = isFileUploading || createMCMutation.isPending;

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Medical certificates"
        description="Manage certificate uploads, compliance review, expiry risk, and document trust signals while preserving existing upload, review, and document-access behavior."
        actions={
          !isAdminHR ? (
            <Button onClick={() => setIsUploading(!isUploading)}>
              <Upload className="w-5 h-5 mr-2" /> Upload MC
            </Button>
          ) : null
        }
      />

      <OpsHero
        badge={isAdminHR ? "Compliance review queue" : "My document record"}
        icon={FileSearch}
        tone={certificateSummary.expired > 0 || certificateSummary.needsFollowUp > 0 ? "attention" : "default"}
        title={isAdminHR ? "Keep medical-document review explainable, timely, and auditable." : "Upload documents once, then follow the review outcome and coverage window."}
        description={isAdminHR
          ? "The page now highlights what matters operationally: pending reviews, expiry pressure, suspicious or unreadable documents, and the notes needed to justify decisions later."
          : "Your upload and document links still work the same way, with clearer feedback about review status, coverage dates, and what HR is checking."}
      >
        <OpsQueueNotice
          tone={certificateSummary.needsFollowUp > 0 ? "attention" : "default"}
          title={isAdminHR ? `${certificateSummary.pending} pending review, ${certificateSummary.needsFollowUp} needing follow-up` : `${certificateSummary.total} certificate${certificateSummary.total === 1 ? "" : "s"} in view`}
          description={isAdminHR
            ? "Prioritize unreadable, suspicious, and expiring certificates so compliance actions happen before leave or attendance disputes escalate."
            : "Review notes and verification status remain visible so you can understand whether more information is needed."}
        />
      </OpsHero>

      {feedback && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-destructive/20 bg-destructive/10 text-destructive"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {isAdminHR && (
        <Card className="mb-6 border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
          Production validation checklist: confirm upload URL generation succeeds, file upload succeeds, the record saves with a normalized `/objects/...` path, `View Document` works through `/api/storage/objects/...`, and one worker cannot access another worker’s document.
        </Card>
      )}

      <OpsStatGrid>
        <OpsStatCard label="Pending review" value={certificateSummary.pending} hint="Certificates still awaiting verification." icon={FileSearch} tone={certificateSummary.pending > 0 ? "attention" : "success"} />
        <OpsStatCard label="Expiring soon" value={certificateSummary.expiringSoon} hint="Coverage ending within seven days." icon={CalendarClock} tone={certificateSummary.expiringSoon > 0 ? "attention" : "default"} />
        <OpsStatCard label="Expired" value={certificateSummary.expired} hint="Certificates whose coverage window has passed." icon={ShieldAlert} tone={certificateSummary.expired > 0 ? "critical" : "success"} />
        <OpsStatCard label="Needs follow-up" value={certificateSummary.needsFollowUp} hint="Suspicious or unreadable records needing review action." icon={ShieldCheck} tone={certificateSummary.needsFollowUp > 0 ? "attention" : "default"} />
      </OpsStatGrid>

      {isOperational && (
        <OpsSection
          title="Queue filters"
          description="Narrow the certificate queue by review status or expiry pressure without changing document access behavior."
          className="mb-6"
        >
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Status:</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={statusFilter === "" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("")}
                >
                  All
                </Button>
                <Button
                  variant={statusFilter === "pending" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("pending")}
                >
                  Pending
                </Button>
                <Button
                  variant={statusFilter === "verified" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("verified")}
                >
                  Verified
                </Button>
                <Button
                  variant={statusFilter === "suspicious" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter("suspicious")}
                >
                  Suspicious
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Expiry:</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant={expiryFilter === "" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setExpiryFilter("")}
                >
                  All
                </Button>
                <Button
                  variant={expiryFilter === "expiring_soon" ? "default" : "outline"}
                  size="sm"
                  className={expiryFilter === "expiring_soon" ? "" : "border-amber-400 text-amber-600"}
                  onClick={() => setExpiryFilter(expiryFilter === "expiring_soon" ? "" : "expiring_soon")}
                >
                  <AlertTriangle className="w-3 h-3 mr-1" /> Expiring Soon
                </Button>
                <Button
                  variant={expiryFilter === "expired" ? "default" : "outline"}
                  size="sm"
                  className={expiryFilter === "expired" ? "" : "border-destructive text-destructive"}
                  onClick={() => setExpiryFilter(expiryFilter === "expired" ? "" : "expired")}
                >
                  <X className="w-3 h-3 mr-1" /> Expired
                </Button>
              </div>
            </div>
          </div>
        </OpsSection>
      )}

      {isUploading && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-xl">Upload medical certificate</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsUploading(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Add clinic and coverage details now so the reviewer has enough context when the document enters the compliance queue.</p>
            <form onSubmit={handleUpload} className="grid grid-cols-1 gap-4">
              <div
                className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center bg-white cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileCheck2 className="w-12 h-12 mx-auto text-primary/50 mb-4" />
                {selectedFile ? (
                  <div>
                    <p className="font-semibold text-primary">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to browse a PDF or image file.</p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {isFileUploading && (
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="clinicName">Clinic Name</Label>
                  <Input
                    id="clinicName"
                    value={clinicName}
                    onChange={(e) => setClinicName(e.target.value)}
                    placeholder="e.g. General Clinic"
                  />
                </div>
                <div>
                  <Label htmlFor="doctorName">Doctor Name</Label>
                  <Input
                    id="doctorName"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mcStartDate">MC Start Date</Label>
                  <Input
                    id="mcStartDate"
                    type="date"
                    value={mcStartDate}
                    onChange={(e) => setMcStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="mcEndDate">MC End Date</Label>
                  <Input
                    id="mcEndDate"
                    type="date"
                    value={mcEndDate}
                    onChange={(e) => setMcEndDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-2">
                <Button type="button" variant="ghost" onClick={() => setIsUploading(false)}>Cancel</Button>
                <Button type="submit" disabled={isPending || !selectedFile}>
                  {isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Uploading...</>
                  ) : (
                    "Upload Document"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </Card>
      )}

      <OpsSection
        title={isAdminHR ? "Certificate review queue" : "My medical certificates"}
        description={isAdminHR
          ? "Review coverage windows, verification status, document trust signals, and reviewer notes before changing the record state."
          : "Track uploaded certificates, coverage dates, and the latest reviewer outcome for each document."}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredCerts.map((mc) => {
          const expiryInfo = getCertExpiryInfo(mc);
          return (
          <Card key={mc.id} className={`hover:shadow-xl transition-shadow ${expiryInfo?.variant === "destructive" ? "ring-1 ring-destructive/30" : expiryInfo?.variant === "warning" ? "ring-1 ring-amber-400/50" : ""}`}>
            <div className="p-5 border-b flex items-center justify-between bg-secondary/20">
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-semibold text-sm truncate w-40">{mc.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(mc.createdAt)}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant={
                    mc.verificationStatus === "verified"
                      ? "success"
                      : mc.verificationStatus === "suspicious" || mc.verificationStatus === "unreadable"
                        ? "destructive"
                        : "warning"
                  }
                  className="capitalize"
                >
                  {mc.verificationStatus}
                </Badge>
                {expiryInfo && (
                  <Badge variant={expiryInfo.variant} className="text-xs capitalize">
                    {expiryInfo.label}
                  </Badge>
                )}
              </div>
            </div>
            <div className="p-5 text-sm space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border bg-background/70 px-3 py-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee</span><p className="mt-1 font-medium text-right sm:text-left">{getEmployeeLabel(mc.userId)}</p></div>
                <div className="rounded-xl border bg-background/70 px-3 py-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Coverage</span><p className="mt-1 font-medium text-right sm:text-left text-xs">{mc.mcStartDate ?? "?"} → {mc.mcEndDate ?? "?"}</p></div>
                <div className="rounded-xl border bg-background/70 px-3 py-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Clinic</span><p className="mt-1 font-medium text-right sm:text-left">{mc.clinicName || "-"}</p></div>
                <div className="rounded-xl border bg-background/70 px-3 py-2"><span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Doctor</span><p className="mt-1 font-medium text-right sm:text-left">{mc.doctorName || "-"}</p></div>
              </div>
              <div className="rounded-2xl border bg-background/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Review framing</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {mc.verificationStatus === "pending"
                    ? "This document is still waiting for human verification before it should be treated as confirmed coverage."
                    : mc.verificationStatus === "verified"
                      ? "The document has been verified and remains in the record with reviewer attribution for auditability."
                      : mc.verificationStatus === "suspicious"
                        ? "The document needs follow-up because something about the submission does not align with expectations."
                        : "The document could not be confidently reviewed and may require resubmission or manual clarification."}
                </p>
              </div>
              {mc.verificationNotes && (
                <p className="pt-1 text-xs text-muted-foreground whitespace-pre-wrap">Review note: {mc.verificationNotes}</p>
              )}
              {mc.verifiedBy && mc.verifiedAt && (
                <div className="pt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <UserCheck className="w-3 h-3" />
                  <span>Verified by {getEmployeeLabel(mc.verifiedBy)} on {formatDate(mc.verifiedAt)}</span>
                </div>
              )}
              <div className="pt-4 mt-4 border-t flex flex-wrap justify-end gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a href={`${storageBasePath}${mc.fileUrl}`} target="_blank" rel="noopener noreferrer">
                    View Document
                  </a>
                </Button>
                {isAdminHR && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-emerald-500 text-emerald-600 hover:bg-emerald-50"
                      onClick={() => openReviewDialog(mc.id, "verified", mc.verificationNotes)}
                      disabled={updateMCMutation.isPending || mc.verificationStatus === "verified"}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive text-destructive hover:bg-destructive/10"
                      onClick={() => openReviewDialog(mc.id, "suspicious", mc.verificationNotes)}
                      disabled={updateMCMutation.isPending || mc.verificationStatus === "suspicious"}
                    >
                      Mark Suspicious
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openReviewDialog(mc.id, "pending", mc.verificationNotes)}
                      disabled={updateMCMutation.isPending || mc.verificationStatus === "pending"}
                    >
                      Reset Pending
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Card>
          );
        })}
        {filteredCerts.length === 0 && (
          <div className="col-span-full">
            <Empty className="py-16">
              <EmptyMedia variant="icon">{isOperational ? <SearchX className="w-10 h-10" /> : <Upload className="w-10 h-10" />}</EmptyMedia>
              <EmptyHeader>
                <EmptyTitle>{isOperational ? "No certificates match the current filters" : "No medical certificates uploaded yet"}</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>
                  {isOperational
                    ? "Try clearing the status or expiry filters to review the full queue."
                    : "Upload your first medical certificate so HR can review it and track expiry."}
                </EmptyDescription>
                <div className="flex gap-2">
                  {isOperational ? (
                    <Button variant="outline" size="sm" onClick={() => { setStatusFilter(""); setExpiryFilter(""); }}>
                      Reset filters
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" onClick={() => setIsUploading(true)}>
                      Upload MC
                    </Button>
                  )}
                </div>
              </EmptyContent>
            </Empty>
          </div>
        )}
      </div>
      </OpsSection>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update certificate review</DialogTitle>
            <DialogDescription>
              Add optional review notes for this medical certificate decision.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="mc-review-notes">Verification notes</Label>
            <Textarea
              id="mc-review-notes"
              value={verificationNotes}
              onChange={(event) => setVerificationNotes(event.target.value)}
              placeholder="Optional review notes for audit history"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button onClick={submitVerificationUpdate} disabled={updateMCMutation.isPending}>
              {updateMCMutation.isPending ? "Saving..." : "Save review"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
