import React, { useMemo, useRef, useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  useCreateMedicalCertificate,
  useListMedicalCertificates,
  useListUsers,
  useUpdateMedicalCertificate,
} from "@workspace/api-client-react";
import { Card, Badge, Input, Label } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
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
import { AlertTriangle, CheckCircle2, FileCheck2, Loader2, Upload, X, Filter, UserCheck, CalendarClock } from "lucide-react";
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
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-display font-bold">Medical Certificates</h1>
          <p className="text-muted-foreground">Upload and review medical documents in your visible scope.</p>
        </div>
        {!isAdminHR && (
          <Button onClick={() => setIsUploading(!isUploading)}>
            <Upload className="w-5 h-5 mr-2" /> Upload MC
          </Button>
        )}
      </div>

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

      {isOperational && (
        <Card className="mb-6 p-4">
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
        </Card>
      )}

      {isUploading && (
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <div className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-display font-bold text-xl">Upload Medical Certificate</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsUploading(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
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
            <div className="p-5 text-sm space-y-2">
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Employee:</span> <span className="font-medium text-right">{getEmployeeLabel(mc.userId)}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Clinic:</span> <span className="font-medium text-right">{mc.clinicName || "-"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-muted-foreground">Doctor:</span> <span className="font-medium text-right">{mc.doctorName || "-"}</span></div>
              {(mc.mcStartDate || mc.mcEndDate) && (
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Coverage:</span>
                  <span className="font-medium text-right text-xs">
                    {mc.mcStartDate ?? "?"} → {mc.mcEndDate ?? "?"}
                  </span>
                </div>
              )}
              {mc.verificationNotes && (
                <p className="pt-2 text-xs text-muted-foreground whitespace-pre-wrap">Review note: {mc.verificationNotes}</p>
              )}
              {mc.verifiedBy && mc.verifiedAt && (
                <div className="pt-2 flex items-center gap-2 text-xs text-muted-foreground">
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
          <div className="col-span-full p-12 text-center text-muted-foreground border-2 border-dashed rounded-2xl">
            No medical certificates match the current filters.
          </div>
        )}
      </div>

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
