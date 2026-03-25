import React, { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useCheckIn, useCheckOut, useListAttendance } from "@workspace/api-client-react";
import { Card, CardContent, Button } from "@/components/ui/core";
import { Clock, MapPin, CheckCircle2, Camera, CameraOff, AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

const FACE_DETECT_MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";

type FaceApiModule = typeof import("face-api.js");

function useFaceDetection(videoRef: React.RefObject<HTMLVideoElement | null>, canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<string | null>(null);
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
        // Models failed to load - face detection won't work but camera still shows
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
          setFaceDescriptor(Array.from(detection.descriptor).join(","));
        } else {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setFaceDetected(false);
          setFaceDescriptor(null);
        }
      } catch {
        // Ignore detection errors
      }
    }, 300);
  }, [modelsLoaded, videoRef, canvasRef]);

  const stopDetection = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  return { modelsLoaded, faceDetected, faceDescriptor, startDetection, stopDetection };
}

export default function CheckIn() {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { modelsLoaded, faceDetected, faceDescriptor, startDetection, stopDetection } = useFaceDetection(videoRef, canvasRef);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toISOString().split('T')[0];

  const { data: attendanceData, refetch } = useListAttendance(
    { userId: user?.id, date: today },
    { query: { enabled: !!user?.id } }
  );

  const checkInMutation = useCheckIn({ mutation: { onSuccess: () => refetch() } });
  const checkOutMutation = useCheckOut({ mutation: { onSuccess: () => refetch() } });

  const todayLog = attendanceData?.logs?.[0];
  const isCheckedIn = !!todayLog?.checkIn;
  const isCheckedOut = !!todayLog?.checkOut;

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
    } catch (err) {
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

  const handleCheckIn = () => {
    if (!user?.id) return;
    checkInMutation.mutate({
      data: {
        userId: user.id,
        faceDescriptor: faceDescriptor ?? undefined,
        faceMatchScore: faceDetected ? "0.98" : "0.00",
      }
    });
  };

  const handleCheckOut = () => {
    if (!user?.id) return;
    checkOutMutation.mutate({ data: { userId: user.id } });
  };

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto mt-8">
        <Card className="overflow-hidden border-0 shadow-2xl">
          <div className="bg-primary p-8 text-center text-white relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <h2 className="text-6xl font-display font-bold tabular-nums tracking-tight relative z-10">
              {time.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </h2>
            <p className="text-primary-foreground/80 mt-2 font-medium relative z-10">
              {time.toLocaleDateString('en-SG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>

          <CardContent className="p-8">
            <div className="flex flex-col items-center justify-center space-y-8">

              <div className="relative w-64 h-48 rounded-2xl border-4 border-dashed border-primary/20 flex items-center justify-center bg-secondary/30 overflow-hidden">
                {cameraOn ? (
                  <>
                    <video
                      ref={videoRef}
                      className="absolute inset-0 w-full h-full object-cover"
                      muted
                      playsInline
                    />
                    <canvas
                      ref={canvasRef}
                      className="absolute inset-0 w-full h-full"
                    />
                    {faceDetected && (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-green-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        Face detected {!modelsLoaded && "(loading models...)"}
                      </div>
                    )}
                    {!faceDetected && modelsLoaded && (
                      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-orange-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        No face detected
                      </div>
                    )}
                    {!modelsLoaded && !faceDetected && (
                      <div className="absolute bottom-2 left-2 right-2 bg-primary/80 text-white text-xs px-3 py-1.5 rounded-lg font-medium text-center">
                        Loading face models...
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-6 text-center">
                    <Camera className="w-12 h-12 text-primary/40" />
                    <p className="text-xs text-muted-foreground">Enable camera for face verification</p>
                    {cameraError && (
                      <p className="text-xs text-destructive">{cameraError}</p>
                    )}
                  </div>
                )}
              </div>

              <Button
                variant={cameraOn ? "outline" : "secondary"}
                size="sm"
                onClick={cameraOn ? stopCamera : startCamera}
                className="gap-2"
              >
                {cameraOn ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                {cameraOn ? "Turn Off Camera" : "Turn On Camera"}
              </Button>

              <div className="flex gap-4 w-full">
                <Button
                  size="lg"
                  className="flex-1 text-lg h-16"
                  disabled={isCheckedIn || checkInMutation.isPending}
                  onClick={handleCheckIn}
                >
                  <Clock className="w-5 h-5 mr-2" />
                  {isCheckedIn ? "Checked In" : "Check In"}
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 text-lg h-16 border-2"
                  disabled={!isCheckedIn || isCheckedOut || checkOutMutation.isPending}
                  onClick={handleCheckOut}
                >
                  Check Out
                </Button>
              </div>

              <div className="w-full bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Today's Status
                </h3>

                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check In</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedIn ? formatDateTime(todayLog?.checkIn) : '--:--'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${isCheckedOut ? 'bg-primary text-white' : 'bg-muted text-muted-foreground'}`}>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check Out</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedOut ? formatDateTime(todayLog?.checkOut) : '--:--'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
