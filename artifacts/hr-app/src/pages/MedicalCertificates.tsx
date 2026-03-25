import React, { useState, useRef } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListMedicalCertificates, useCreateMedicalCertificate } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, Label } from "@/components/ui/core";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Upload, FileCheck2, X, Loader2 } from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";

export default function MedicalCertificates() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [doctorName, setDoctorName] = useState("");
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: mcData, refetch } = useListMedicalCertificates(
    isAdminHR ? {} : { userId: user?.id }
  );

  const createMCMutation = useCreateMedicalCertificate({
    mutation: {
      onSuccess: () => {
        setIsUploading(false);
        setSelectedFile(null);
        setClinicName("");
        setDoctorName("");
        refetch();
      }
    }
  });

  const { uploadFile, isUploading: isFileUploading, progress } = useUpload({
    basePath: "/api/storage",
    onError: (err) => console.error("Upload error:", err),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user?.id || !selectedFile) return;

    const uploadResult = await uploadFile(selectedFile);
    if (!uploadResult) return;

    createMCMutation.mutate({
      data: {
        userId: user.id,
        fileName: selectedFile.name,
        fileUrl: uploadResult.objectPath,
        fileType: selectedFile.type || "application/octet-stream",
        clinicName: clinicName || undefined,
        doctorName: doctorName || undefined,
        issueDate: issueDate || undefined,
      }
    });
  };

  const isPending = isFileUploading || createMCMutation.isPending;

  return (
    <DashboardLayout>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold">Medical Certificates</h1>
          <p className="text-muted-foreground">Upload and verify medical documents.</p>
        </div>
        {!isAdminHR && (
          <Button onClick={() => setIsUploading(!isUploading)}>
            <Upload className="w-5 h-5 mr-2" /> Upload MC
          </Button>
        )}
      </div>

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
                  <p className="text-sm text-muted-foreground">Drag and drop PDF or Image file here, or click to browse</p>
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
                    onChange={e => setClinicName(e.target.value)}
                    placeholder="e.g. General Clinic"
                  />
                </div>
                <div>
                  <Label htmlFor="doctorName">Doctor Name</Label>
                  <Input
                    id="doctorName"
                    value={doctorName}
                    onChange={e => setDoctorName(e.target.value)}
                    placeholder="e.g. Dr. Smith"
                  />
                </div>
                <div>
                  <Label htmlFor="issueDate">Issue Date</Label>
                  <Input
                    id="issueDate"
                    type="date"
                    value={issueDate}
                    onChange={e => setIssueDate(e.target.value)}
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
        {mcData?.certificates?.map((mc) => (
          <Card key={mc.id} className="hover:shadow-xl transition-shadow">
            <div className="p-5 border-b flex items-center justify-between bg-secondary/20">
              <div className="flex items-center gap-3">
                <FileCheck2 className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-semibold text-sm truncate w-40">{mc.fileName}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(mc.createdAt)}</p>
                </div>
              </div>
              <Badge variant={
                mc.verificationStatus === 'verified' ? 'success' :
                mc.verificationStatus === 'suspicious' ? 'destructive' : 'warning'
              } className="capitalize">{mc.verificationStatus}</Badge>
            </div>
            <div className="p-5 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">User ID:</span> <span className="font-medium">{mc.userId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{mc.clinicName || '-'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{mc.doctorName || '-'}</span></div>
              <div className="pt-4 mt-4 border-t flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/storage${mc.fileUrl}`} target="_blank" rel="noopener noreferrer">
                    View Document
                  </a>
                </Button>
              </div>
            </div>
          </Card>
        ))}
        {mcData?.certificates?.length === 0 && (
          <div className="col-span-full p-12 text-center text-muted-foreground border-2 border-dashed rounded-2xl">
            No medical certificates found.
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
