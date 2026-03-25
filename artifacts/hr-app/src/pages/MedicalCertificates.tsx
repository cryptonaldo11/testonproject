import React, { useState } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListMedicalCertificates, useCreateMedicalCertificate } from "@workspace/api-client-react";
import { Card, Badge, Button, Input, Label } from "@/components/ui/core";
import { formatDate } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Upload, FileCheck2 } from "lucide-react";

export default function MedicalCertificates() {
  const { user, hasRole } = useAuth();
  const isAdminHR = hasRole(["admin", "hr"]);
  const [isUploading, setIsUploading] = useState(false);
  
  const { data: mcData, refetch } = useListMedicalCertificates(
    isAdminHR ? {} : { userId: user?.id }
  );

  const createMCMutation = useCreateMedicalCertificate({ onSuccess: () => { setIsUploading(false); refetch(); }});

  const handleUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if(user?.id) {
      // Mocking file upload to API by just passing URLs for now
      createMCMutation.mutate({
        data: {
          userId: user.id,
          fileName: "mc_document_scanned.pdf",
          fileUrl: "/mock/url",
          fileType: "application/pdf",
          clinicName: "General Clinic",
          doctorName: "Dr. Smith",
          issueDate: new Date().toISOString().split('T')[0]
        }
      });
    }
  };

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
            <h3 className="font-display font-bold text-xl mb-4">Upload Medical Certificate</h3>
            <form onSubmit={handleUpload} className="grid grid-cols-1 gap-4">
              <div className="border-2 border-dashed border-primary/30 rounded-xl p-8 text-center bg-white">
                <FileCheck2 className="w-12 h-12 mx-auto text-primary/50 mb-4" />
                <p className="text-sm text-muted-foreground mb-4">Drag and drop PDF or Image file here, or click to browse</p>
                <Input type="file" accept=".pdf,image/*" required className="max-w-xs mx-auto" />
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <Button type="button" variant="ghost" onClick={() => setIsUploading(false)}>Cancel</Button>
                <Button type="submit" disabled={createMCMutation.isPending}>Upload Document</Button>
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
                 <Button variant="outline" size="sm">View Document</Button>
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
