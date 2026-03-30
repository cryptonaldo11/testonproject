import React, { useState, useEffect, useRef, useCallback } from "react";
import { Redirect } from "wouter";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListWorkers, useRegisterFace, useDeleteFace, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/core";
import { Button } from "@/components/ui/button";
import {
  OpsHero,
  OpsPageHeader,
  OpsQueueNotice,
  OpsSection,
  OpsStatCard,
  OpsStatGrid,
} from "@/components/ui/ops-cockpit";
import { ADMIN_HR_ROLES, useAuth } from "@/lib/auth";
import { Camera, CameraOff, CheckCircle2, AlertCircle, Scan, Trash2, ShieldCheck, Users, ShieldAlert } from "lucide-react";

const FACE_DETECT_MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

type FaceApiModule = typeof import("face-api.js");

function useFaceCapture(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [capturedDescriptor, setCapturedDescriptor] = useState<string | null>(null);
  const faceApiRef = useRef<FaceApiModule | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let mounted = true;
    async function loadModels() {
      try {
        const faceapi = await import("face-api.js");
        faceApiRef.current = faceapi;
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(FACE_DETECT_MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(FACE_DETECT_MODEL_URL),
          faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_DETECT_MODEL_URL),
        ]);
        if (mounted) setModelsLoaded(true);
      } catch {
        // Models unavailable
      }
    }
    loadModels();
    return () => { mounted = false; };
  }, []);

  const startDetection = useCallback(() => {
    const faceapi = faceApiRef.current;
    if (!faceapi || !modelsLoaded) return;

    intervalRef.current = setInterval(async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;

      try {
        const detection = await faceapi
          .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks(true)
          .withFaceDescriptor();

        const dims = faceapi.matchDimensions(canvas, video, true);
        if (detection) {
          const resized = faceapi.resizeResults(detection, dims);
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          faceapi.draw.drawDetections(canvas, [resized]);
          faceapi.draw.drawFaceLandmarks(canvas, [resized]);
          setFaceDetected(true);
          setCapturedDescriptor(Array.from(detection.descriptor).join(","));
        } else {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setFaceDetected(false);
          setCapturedDescriptor(null);
        }
      } catch {
        // ignore errors
      }
    }, 300);
  }, [modelsLoaded, videoRef, canvasRef]);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { modelsLoaded, faceDetected, capturedDescriptor, startDetection, stopDetection };
}

export default function FaceRegistration() {
  const { hasRole } = useAuth();
  const isAdminHR = hasRole(ADMIN_HR_ROLES);
  const { data: workersData, refetch } = useListWorkers(undefined, { query: { queryKey: ["workers", "face-registration"], enabled: isAdminHR } });
  const { data: usersData } = useListUsers(undefined, { query: { queryKey: ["users", "face-registration"], enabled: isAdminHR } });

  const registerFaceMutation = useRegisterFace();
  const deleteFaceMutation = useDeleteFace();

  const [selectedWorkerId, setSelectedWorkerId] = useState<number | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { modelsLoaded, faceDetected, capturedDescriptor, startDetection, stopDetection } = useFaceCapture(videoRef, canvasRef);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startDetection();
        };
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera access denied. Please allow camera permissions.");
    }
  }, [startDetection]);

  const stopCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext("2d");
      if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
    setCameraOn(false);
  }, [stopDetection]);

  useEffect(() => { return () => stopCamera(); }, [stopCamera]);

  const getUserName = (userId: number) => {
    const u = usersData?.users?.find(u => u.id === userId);
    return u ? `${u.name} (${u.employeeId || u.email})` : `User #${userId}`;
  };

  const handleRegister = () => {
    if (!selectedWorkerId || !capturedDescriptor) return;
    registerFaceMutation.mutate(
      { workerId: selectedWorkerId, data: { faceDescriptor: capturedDescriptor } },
      {
        onSuccess: () => {
          setSuccessMsg("Face registered successfully!");
          stopCamera();
          setSelectedWorkerId(null);
          refetch();
          setTimeout(() => setSuccessMsg(null), 3000);
        },
      }
    );
  };

  const handleDelete = (workerId: number) => {
    deleteFaceMutation.mutate(
      { workerId },
      {
        onSuccess: () => {
          setSuccessMsg("Face registration removed.");
          refetch();
          setTimeout(() => setSuccessMsg(null), 3000);
        },
      }
    );
  };

  const workers = workersData?.workers ?? [];
  const registeredCount = workers.filter((worker) => worker.hasFaceRegistered).length;
  const unregisteredCount = workers.length - registeredCount;

  if (!isAdminHR) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <DashboardLayout>
      <OpsPageHeader
        eyebrow="Workforce operations cockpit"
        title="Face registration"
        description="Enroll and remove biometric face descriptors with clearer readiness, controlled access, and reviewer-friendly context while preserving the current registration behavior."
      />

      <OpsHero
        badge="Biometric enrollment control"
        icon={ShieldCheck}
        tone={cameraError ? "attention" : "default"}
        title="Keep biometric enrollment explainable, deliberate, and role-controlled."
        description="This page still uses the current registration and deletion APIs, but now frames enrollment as a controlled readiness workflow that supports fair check-in and fallback review later."
      >
        <OpsQueueNotice
          tone={registeredCount < workers.length ? "attention" : "success"}
          title={workers.length === 0 ? "No workers available" : `${registeredCount} of ${workers.length} worker${workers.length === 1 ? "" : "s"} enrolled`}
          description={workers.length === 0
            ? "Add workers first so biometric enrollment can begin."
            : registeredCount < workers.length
              ? "Unenrolled workers will rely on fallback attendance paths until a face descriptor is registered."
              : "All visible workers currently have registered descriptors in place."}
        />
      </OpsHero>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMsg}
        </div>
      )}

      <OpsStatGrid>
        <OpsStatCard label="Visible workers" value={workers.length} hint="Workers returned for biometric administration in the current scope." icon={Users} tone="success" />
        <OpsStatCard label="Registered" value={registeredCount} hint="Workers with a stored face descriptor available for attendance verification." icon={ShieldCheck} tone={registeredCount > 0 ? "success" : "default"} />
        <OpsStatCard label="Awaiting enrollment" value={unregisteredCount} hint="Workers still relying on manual fallback or pending enrollment setup." icon={ShieldAlert} tone={unregisteredCount > 0 ? "attention" : "success"} />
        <OpsStatCard label="Camera status" value={cameraOn ? "Active" : "Idle"} hint={cameraError ? cameraError : cameraOn ? "Camera and face detection are active for enrollment." : "Turn on the camera after selecting a worker."} icon={cameraOn ? Camera : CameraOff} tone={cameraError ? "attention" : cameraOn ? "success" : "default"} />
      </OpsStatGrid>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <OpsSection
          title="Enroll new face"
          description="Select a worker, capture a detectable face, then save the descriptor only when the enrollment signal is clear."
        >
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Select worker</label>
              <select
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                value={selectedWorkerId ?? ""}
                onChange={(e) => setSelectedWorkerId(e.target.value ? parseInt(e.target.value, 10) : null)}
              >
                <option value="">-- Select a worker --</option>
                {workers.map((w) => (
                  <option key={w.id} value={w.id}>
                    {getUserName(w.userId)}{w.hasFaceRegistered ? " ✓ registered" : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-4 border-dashed border-primary/20 bg-secondary/30">
              {cameraOn ? (
                <>
                  <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" muted playsInline />
                  <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
                  {faceDetected ? (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-white">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      Face detected — ready to register
                    </div>
                  ) : modelsLoaded ? (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 rounded-lg bg-amber-500/90 px-3 py-1.5 text-xs font-medium text-white">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Position the face clearly in frame
                    </div>
                  ) : (
                    <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-primary/80 px-3 py-1.5 text-center text-xs font-medium text-white">
                      Loading face models...
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <Camera className="h-16 w-16 text-primary/30" />
                  <p className="text-sm text-muted-foreground">Turn on the camera to capture a face descriptor.</p>
                  {cameraError && <p className="text-xs text-destructive">{cameraError}</p>}
                </div>
              )}
            </div>

            <div className="rounded-2xl border bg-background/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Enrollment guidance</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Register only when the worker is correctly selected and a clear face is detected. Removing a descriptor will return future attendance to manual fallback or re-enrollment until a new face is saved.
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                variant={cameraOn ? "outline" : "secondary"}
                size="sm"
                onClick={cameraOn ? stopCamera : startCamera}
                className="flex-1 gap-2"
                disabled={!selectedWorkerId}
              >
                {cameraOn ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                {cameraOn ? "Turn off camera" : "Turn on camera"}
              </Button>

              <Button
                size="sm"
                className="flex-1 gap-2"
                disabled={!selectedWorkerId || !capturedDescriptor || registerFaceMutation.isPending}
                onClick={handleRegister}
              >
                <Scan className="h-4 w-4" />
                {registerFaceMutation.isPending ? "Registering..." : "Register face"}
              </Button>
            </div>

            {!selectedWorkerId && (
              <p className="text-center text-xs text-muted-foreground">Select a worker before turning on the camera.</p>
            )}
          </div>
        </OpsSection>

        <OpsSection
          title="Worker face status"
          description="Use the current list to confirm who is enrolled, who still needs setup, and where biometric access should be removed."
        >
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {workers.length === 0 && (
              <OpsQueueNotice
                title="No workers found"
                description="There are no workers available for enrollment in the current scope."
              />
            )}
            {workers.map((w) => (
              <div key={w.id} className="flex items-center justify-between rounded-xl border bg-card p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{getUserName(w.userId)}</p>
                  <p className="text-xs text-muted-foreground">{w.jobTitle ?? "—"}</p>
                </div>
                <div className="ml-3 flex shrink-0 items-center gap-2">
                  {w.hasFaceRegistered ? (
                    <>
                      <Badge variant="success">Registered</Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 w-8 border-destructive/30 p-0 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDelete(w.id)}
                        disabled={deleteFaceMutation.isPending}
                        title="Remove face registration"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Not registered</Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </OpsSection>
      </div>
    </DashboardLayout>
  );
}
