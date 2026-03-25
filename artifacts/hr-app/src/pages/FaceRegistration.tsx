import React, { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useListWorkers, useRegisterFace, useDeleteFace, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, Button, Badge } from "@/components/ui/core";
import { Camera, CameraOff, CheckCircle2, AlertCircle, Scan, Trash2 } from "lucide-react";

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
  const { data: workersData, refetch } = useListWorkers();
  const { data: usersData } = useListUsers();

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

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-3xl font-display font-bold">Face Registration</h1>
        <p className="text-muted-foreground">Enroll or remove worker face descriptors for biometric check-in/out.</p>
      </div>

      {successMsg && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl text-sm">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Scan className="w-5 h-5 text-primary" />
              Enroll New Face
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Select Worker</label>
                <select
                  className="w-full border rounded-lg px-3 py-2 bg-background text-sm"
                  value={selectedWorkerId ?? ""}
                  onChange={e => setSelectedWorkerId(e.target.value ? parseInt(e.target.value, 10) : null)}
                >
                  <option value="">-- Select a worker --</option>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>
                      {getUserName(w.userId)}{w.hasFaceRegistered ? " ✓ registered" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative w-full aspect-video rounded-2xl border-4 border-dashed border-primary/20 flex items-center justify-center bg-secondary/30 overflow-hidden">
                {cameraOn ? (
                  <>
                    <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
                    <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
                    {faceDetected ? (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-green-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Face detected — ready to register
                      </div>
                    ) : modelsLoaded ? (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-orange-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        Position face in frame
                      </div>
                    ) : (
                      <div className="absolute bottom-2 left-2 right-2 bg-primary/80 text-white text-xs px-3 py-1.5 rounded-lg font-medium text-center">
                        Loading face models...
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                    <Camera className="w-16 h-16 text-primary/30" />
                    <p className="text-sm text-muted-foreground">Turn on camera to capture face</p>
                    {cameraError && <p className="text-xs text-destructive">{cameraError}</p>}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  variant={cameraOn ? "outline" : "secondary"}
                  size="sm"
                  onClick={cameraOn ? stopCamera : startCamera}
                  className="gap-2 flex-1"
                  disabled={!selectedWorkerId}
                >
                  {cameraOn ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                  {cameraOn ? "Turn Off Camera" : "Turn On Camera"}
                </Button>

                <Button
                  size="sm"
                  className="flex-1 gap-2"
                  disabled={!selectedWorkerId || !capturedDescriptor || registerFaceMutation.isPending}
                  onClick={handleRegister}
                >
                  <Scan className="w-4 h-4" />
                  {registerFaceMutation.isPending ? "Registering..." : "Register Face"}
                </Button>
              </div>

              {!selectedWorkerId && (
                <p className="text-xs text-muted-foreground text-center">Select a worker before turning on the camera.</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h2 className="text-lg font-semibold mb-4">Worker Face Status</h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {workers.length === 0 && (
                <p className="text-muted-foreground text-sm">No workers found.</p>
              )}
              {workers.map(w => (
                <div key={w.id} className="flex items-center justify-between p-3 rounded-xl border bg-card">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{getUserName(w.userId)}</p>
                    <p className="text-xs text-muted-foreground">{w.jobTitle ?? "—"}</p>
                  </div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {w.hasFaceRegistered ? (
                      <>
                        <Badge variant="secondary" className="text-green-700 bg-green-100">Registered</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/30 hover:bg-destructive/10 h-8 w-8 p-0"
                          onClick={() => handleDelete(w.id)}
                          disabled={deleteFaceMutation.isPending}
                          title="Remove face registration"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Not registered</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
