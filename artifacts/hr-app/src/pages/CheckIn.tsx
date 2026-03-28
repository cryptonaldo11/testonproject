import React, { useState, useEffect, useRef, useCallback } from "react";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useCheckIn, useCheckOut, useListAttendance, useGetMyFaceDescriptor } from "@workspace/api-client-react";
import { Card, CardContent, Button } from "@/components/ui/core";
import { Clock, MapPin, CheckCircle2, Camera, CameraOff, AlertCircle, ShieldAlert, ClipboardList } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type AttendanceExceptionType =
  | "missed_checkout"
  | "camera_unavailable"
  | "face_mismatch"
  | "manual_correction"
  | "dispute";

type FaceAttemptOutcome = "success" | "failure" | "fallback_used";
type FaceAttemptType = "check_in" | "check_out" | "registration";
type FaceFailureReason = "no_face" | "low_lighting" | "mismatch" | "camera_unavailable" | "quality_insufficient";

interface AttendanceExceptionRecord {
  id: number;
  userId: number;
  attendanceLogId: number | null;
  exceptionType: AttendanceExceptionType;
  status: string;
  requestedBy: number;
  reviewedBy: number | null;
  reviewedAt: string | null;
  reason: string;
  reviewNotes: string | null;
  evidenceUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FaceVerificationAttemptRecord {
  id: number;
  userId: number;
  attendanceLogId: number | null;
  attemptType: FaceAttemptType;
  outcome: FaceAttemptOutcome;
  failureReason: FaceFailureReason | null;
  confidenceScore: number | null;
  fallbackMethod: string | null;
  reviewedBy: number | null;
  notes: string | null;
  createdAt: string;
}

const FACE_DETECT_MODEL_URL = "https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights";
const FACE_MATCH_THRESHOLD = 0.6;

type FaceApiModule = typeof import("face-api.js");

function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

interface FaceDetectionResult {
  modelsLoaded: boolean;
  faceDetected: boolean;
  faceDescriptor: string | null;
  matchScore: number | null;
  startDetection: (registeredDescriptor: number[] | null) => void;
  stopDetection: () => void;
}

function useFaceDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): FaceDetectionResult {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState<string | null>(null);
  const [matchScore, setMatchScore] = useState<number | null>(null);
  const faceApiRef = useRef<FaceApiModule | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const registeredDescriptorRef = useRef<number[] | null>(null);

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

  const startDetection = useCallback((registeredDescriptor: number[] | null) => {
    const faceapi = faceApiRef.current;
    if (!faceapi || !modelsLoaded) return;

    registeredDescriptorRef.current = registeredDescriptor;

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

          const currentDescriptor = Array.from(detection.descriptor);
          setFaceDetected(true);
          setFaceDescriptor(currentDescriptor.join(","));

          if (registeredDescriptorRef.current) {
            const distance = euclideanDistance(currentDescriptor, registeredDescriptorRef.current);
            const score = Math.max(0, 1 - distance / FACE_MATCH_THRESHOLD);
            setMatchScore(parseFloat(score.toFixed(4)));
          } else {
            setMatchScore(null);
          }
        } else {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setFaceDetected(false);
          setFaceDescriptor(null);
          setMatchScore(null);
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

  return { modelsLoaded, faceDetected, faceDescriptor, matchScore, startDetection, stopDetection };
}

function getFailureReasonLabel(reason: FaceFailureReason | null) {
  switch (reason) {
    case "no_face":
      return "No face detected";
    case "low_lighting":
      return "Low lighting detected";
    case "mismatch":
      return "Face did not match registration";
    case "camera_unavailable":
      return "Camera unavailable";
    case "quality_insufficient":
      return "Image quality insufficient";
    default:
      return "Verification issue";
  }
}

export default function CheckIn() {
  const { user } = useAuth();
  const [time, setTime] = useState(new Date());
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<string | null>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);
  const [checkOutError, setCheckOutError] = useState<string | null>(null);
  const [faceAttempts, setFaceAttempts] = useState<FaceVerificationAttemptRecord[]>([]);
  const [attemptsLoading, setAttemptsLoading] = useState(false);
  const [isFallbackDialogOpen, setIsFallbackDialogOpen] = useState(false);
  const [fallbackReason, setFallbackReason] = useState<AttendanceExceptionType>("camera_unavailable");
  const [fallbackNotes, setFallbackNotes] = useState("");
  const [isSubmittingFallback, setIsSubmittingFallback] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const { modelsLoaded, faceDetected, faceDescriptor, matchScore, startDetection, stopDetection } = useFaceDetection(videoRef, canvasRef);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const today = new Date().toISOString().split("T")[0];

  const { data: attendanceData, refetch } = useListAttendance(
    { userId: user?.id, startDate: today, endDate: today },
    { query: { queryKey: ["attendance", "today", user?.id, today], enabled: !!user?.id } }
  );

  const { data: faceDescriptorData, isLoading: isLoadingDescriptor } = useGetMyFaceDescriptor(
    { query: { queryKey: ["face-descriptor", user?.id], enabled: !!user?.id } }
  );

  const registeredDescriptor = faceDescriptorData?.registered && faceDescriptorData.descriptor
    ? faceDescriptorData.descriptor.split(",").map(Number)
    : null;
  const descriptorLoaded = !isLoadingDescriptor;

  const todayLog = attendanceData?.logs?.[0];
  const isCheckedIn = !!todayLog?.checkIn;
  const isCheckedOut = !!todayLog?.checkOut;

  const isFaceMatched = faceDetected && registeredDescriptor !== null && matchScore !== null && matchScore > 0;
  const faceMatchDistance = faceDetected && registeredDescriptor !== null && matchScore !== null
    ? parseFloat((FACE_MATCH_THRESHOLD * (1 - matchScore)).toFixed(4))
    : null;

  const faceMatchScoreStr = matchScore !== null
    ? matchScore.toFixed(4)
    : faceDetected ? "0.0000" : "0.0000";

  const faceVerificationRequired = descriptorLoaded && registeredDescriptor !== null;
  const faceVerificationPassed = !faceVerificationRequired || isFaceMatched;

  const logFaceAttempt = useCallback(async ({
    attemptType,
    outcome,
    failureReason,
    fallbackMethod,
    notes,
  }: {
    attemptType: FaceAttemptType;
    outcome: FaceAttemptOutcome;
    failureReason?: FaceFailureReason | null;
    fallbackMethod?: string;
    notes?: string;
  }) => {
    if (!user?.id) return;

    try {
      await fetch("/api/face-verification-attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          attendanceLogId: todayLog?.id ?? null,
          attemptType,
          outcome,
          failureReason: failureReason ?? undefined,
          confidenceScore: matchScore ?? undefined,
          fallbackMethod,
          notes,
        }),
      });
    } catch {
      // Ignore audit logging failures in UI
    }
  }, [matchScore, todayLog?.id, user?.id]);

  const loadFaceAttempts = useCallback(async () => {
    if (!user?.id) return;

    setAttemptsLoading(true);
    try {
      const response = await fetch(`/api/face-verification-attempts/user/${user.id}`);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load verification history.");
      }
      setFaceAttempts((payload.attempts || []).slice(0, 5));
    } catch {
      setFaceAttempts([]);
    } finally {
      setAttemptsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadFaceAttempts();
  }, [loadFaceAttempts]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 320, height: 240 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          startDetection(registeredDescriptor);
        };
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera access denied. You can submit an exception and continue through fallback review.");
      void logFaceAttempt({
        attemptType: isCheckedIn && !isCheckedOut ? "check_out" : "check_in",
        outcome: "failure",
        failureReason: "camera_unavailable",
      });
    }
  }, [isCheckedIn, isCheckedOut, logFaceAttempt, registeredDescriptor, startDetection]);

  const stopCamera = useCallback(() => {
    stopDetection();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
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

  const checkInMutation = useCheckIn({
    mutation: {
      onSuccess: async () => {
        await refetch();
        setCheckInError(null);
        setCheckOutError(null);
        setCheckInSuccess("Check-in recorded successfully.");
        await logFaceAttempt({ attemptType: "check_in", outcome: "success" });
        await loadFaceAttempts();
      },
      onError: async (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setCheckInSuccess(null);
        setCheckInError(msg ?? "Check-in failed. Please try again.");
        await logFaceAttempt({
          attemptType: "check_in",
          outcome: "failure",
          failureReason: faceDetected ? "mismatch" : "no_face",
          notes: msg,
        });
        await loadFaceAttempts();
      },
    }
  });

  const checkOutMutationWithFace = useCheckOut({
    mutation: {
      onSuccess: async () => {
        await refetch();
        setCheckOutError(null);
        setCheckInError(null);
        setCheckInSuccess("Check-out recorded successfully.");
        await logFaceAttempt({ attemptType: "check_out", outcome: "success" });
        await loadFaceAttempts();
      },
      onError: async (err) => {
        const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setCheckInSuccess(null);
        setCheckOutError(msg ?? "Check-out failed. Please try again.");
        await logFaceAttempt({
          attemptType: "check_out",
          outcome: "failure",
          failureReason: faceDetected ? "mismatch" : "no_face",
          notes: msg,
        });
        await loadFaceAttempts();
      },
    }
  });

  const handleCheckIn = () => {
    if (!user?.id) return;
    if (faceVerificationRequired && !isFaceMatched) {
      void logFaceAttempt({
        attemptType: "check_in",
        outcome: "failure",
        failureReason: faceDetected ? "mismatch" : "no_face",
      });
      void loadFaceAttempts();
      return;
    }
    checkInMutation.mutate({
      data: {
        userId: user.id,
        faceDescriptor: faceDescriptor ?? undefined,
        faceMatchScore: faceMatchScoreStr,
      }
    });
  };

  const handleCheckOut = () => {
    if (!user?.id) return;
    if (faceVerificationRequired && !isFaceMatched) {
      void logFaceAttempt({
        attemptType: "check_out",
        outcome: "failure",
        failureReason: faceDetected ? "mismatch" : "no_face",
      });
      void loadFaceAttempts();
      return;
    }
    checkOutMutationWithFace.mutate({
      data: {
        userId: user.id,
        faceDescriptor: faceDescriptor ?? undefined,
        faceMatchScore: faceMatchScoreStr,
      }
    });
  };

  const submitFallback = async () => {
    if (!user?.id || !fallbackNotes.trim()) return;

    setIsSubmittingFallback(true);
    try {
      const exceptionResponse = await fetch("/api/attendance-exceptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          attendanceLogId: todayLog?.id ?? null,
          exceptionType: fallbackReason,
          reason: fallbackNotes.trim(),
        }),
      });
      const exceptionPayload = await exceptionResponse.json();
      if (!exceptionResponse.ok) {
        throw new Error(exceptionPayload?.error || "Failed to submit fallback review request.");
      }

      await logFaceAttempt({
        attemptType: isCheckedIn && !isCheckedOut ? "check_out" : "check_in",
        outcome: "fallback_used",
        failureReason: fallbackReason === "camera_unavailable" ? "camera_unavailable" : fallbackReason === "face_mismatch" ? "mismatch" : "quality_insufficient",
        fallbackMethod: "attendance_exception",
        notes: fallbackNotes.trim(),
      });

      setCheckInSuccess("Fallback request submitted for manager or HR review.");
      setCheckInError(null);
      setCheckOutError(null);
      setFallbackNotes("");
      setIsFallbackDialogOpen(false);
      await loadFaceAttempts();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to submit fallback review request.";
      setCheckInSuccess(null);
      setCheckInError(message);
    } finally {
      setIsSubmittingFallback(false);
    }
  };

  const getFaceStatusBanner = () => {
    if (!modelsLoaded) {
      return (
        <div className="absolute bottom-2 left-2 right-2 bg-primary/80 text-white text-xs px-3 py-1.5 rounded-lg font-medium text-center">
          Loading face models...
        </div>
      );
    }
    if (!faceDetected) {
      return (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-orange-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          No face detected
        </div>
      );
    }
    if (!descriptorLoaded) {
      return (
        <div className="absolute bottom-2 left-2 right-2 bg-primary/80 text-white text-xs px-3 py-1.5 rounded-lg font-medium text-center">
          Checking registration...
        </div>
      );
    }
    if (!registeredDescriptor) {
      return (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-yellow-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          Face detected (not registered)
        </div>
      );
    }
    if (isFaceMatched) {
      return (
        <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-green-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          Face matched ({(matchScore! * 100).toFixed(1)}%)
        </div>
      );
    }
    return (
      <div className="absolute bottom-2 left-2 right-2 flex items-center gap-1.5 bg-red-500/90 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
        Face not recognized (distance: {faceMatchDistance?.toFixed(3)})
      </div>
    );
  };

  const currentFailureReason = !cameraOn && cameraError
    ? "camera_unavailable"
    : !faceDetected
      ? "no_face"
      : faceVerificationRequired && !isFaceMatched
        ? "mismatch"
        : null;

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto mt-8 space-y-6">
        <Card className="overflow-hidden border-0 shadow-2xl">
          <div className="bg-primary p-8 text-center text-white relative">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            <h2 className="text-6xl font-display font-bold tabular-nums tracking-tight relative z-10">
              {time.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </h2>
            <p className="text-primary-foreground/80 mt-2 font-medium relative z-10">
              {time.toLocaleDateString("en-SG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
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
                    {getFaceStatusBanner()}
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

              {checkInSuccess && (
                <div className="w-full flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm px-4 py-3 rounded-xl">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {checkInSuccess}
                </div>
              )}

              {checkInError && (
                <div className="w-full flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {checkInError}
                </div>
              )}

              {faceVerificationRequired && !faceVerificationPassed && (
                <div className="w-full rounded-xl border border-orange-200 bg-orange-50 px-4 py-4 text-sm text-orange-900">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="space-y-2">
                      <p className="font-semibold">Face verification required before attendance can be recorded.</p>
                      <p>
                        {currentFailureReason === "camera_unavailable"
                          ? "Camera access is unavailable. You can submit a fallback request for manager or HR review."
                          : currentFailureReason === "no_face"
                            ? "No face was detected. Improve framing and lighting, then try again."
                            : "Your face did not match the stored registration. You can retry or request manual review."}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" onClick={() => setIsFallbackDialogOpen(true)}>
                          Request fallback review
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {checkOutError && (
                <div className="w-full flex items-center gap-2 bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-xl">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {checkOutError}
                </div>
              )}

              <div className="flex gap-4 w-full">
                <Button
                  size="lg"
                  className="flex-1 text-lg h-16"
                  disabled={isCheckedIn || checkInMutation.isPending || !faceVerificationPassed}
                  onClick={handleCheckIn}
                  title={faceVerificationRequired && !faceVerificationPassed ? "Face verification required — enable camera and ensure your face is recognized" : undefined}
                >
                  <Clock className="w-5 h-5 mr-2" />
                  {isCheckedIn ? "Checked In" : "Check In"}
                </Button>

                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 text-lg h-16 border-2"
                  disabled={!isCheckedIn || isCheckedOut || checkOutMutationWithFace.isPending || !faceVerificationPassed}
                  onClick={handleCheckOut}
                  title={faceVerificationRequired && !faceVerificationPassed ? "Face verification required for check-out" : undefined}
                >
                  Check Out
                </Button>
              </div>

              <div className="w-full bg-secondary/30 rounded-2xl p-6 border border-border/50">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-primary" />
                  Today&apos;s Status
                </h3>

                <div className="space-y-4 relative before:absolute before:inset-0 before:ml-2.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-border before:to-transparent">
                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                    <div className="flex items-center justify-center w-6 h-6 rounded-full border-2 border-white bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10">
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check In</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedIn ? formatDateTime(todayLog?.checkIn) : "--:--"}</span>
                      </div>
                      {todayLog?.faceMatchScore && (
                        <p className="text-xs text-muted-foreground mt-1">Match score: {parseFloat(todayLog.faceMatchScore).toFixed(2)}</p>
                      )}
                    </div>
                  </div>

                  <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    <div className={`flex items-center justify-center w-6 h-6 rounded-full border-2 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${isCheckedOut ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                      <CheckCircle2 className="w-3 h-3" />
                    </div>
                    <div className="w-[calc(100%-3rem)] md:w-[calc(50%-1.5rem)] bg-card p-3 rounded-xl border shadow-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">Check Out</span>
                        <span className="text-xs text-muted-foreground font-mono">{isCheckedOut ? formatDateTime(todayLog?.checkOut) : "--:--"}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-primary" />
              <h3 className="font-display text-xl font-bold">Recent face verification activity</h3>
            </div>
            {attemptsLoading ? (
              <p className="text-sm text-muted-foreground">Loading verification history...</p>
            ) : faceAttempts.length === 0 ? (
              <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                No verification attempts recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {faceAttempts.map((attempt) => (
                  <div key={attempt.id} className="rounded-xl border bg-secondary/20 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold capitalize">{attempt.attemptType.replace(/_/g, " ")} · {attempt.outcome.replace(/_/g, " ")}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(attempt.createdAt)}</p>
                      </div>
                      {attempt.failureReason && (
                        <p className="text-sm text-muted-foreground">{getFailureReasonLabel(attempt.failureReason)}</p>
                      )}
                    </div>
                    {(attempt.notes || attempt.fallbackMethod) && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {attempt.fallbackMethod ? `Fallback: ${attempt.fallbackMethod}` : ""}
                        {attempt.fallbackMethod && attempt.notes ? " · " : ""}
                        {attempt.notes || ""}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isFallbackDialogOpen} onOpenChange={setIsFallbackDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request fallback review</DialogTitle>
            <DialogDescription>
              Submit a manual review request when face verification cannot complete successfully.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fallback-reason">Fallback reason</Label>
              <Select value={fallbackReason} onValueChange={(value) => setFallbackReason(value as AttendanceExceptionType)}>
                <SelectTrigger id="fallback-reason">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="camera_unavailable">Camera unavailable</SelectItem>
                  <SelectItem value="face_mismatch">Face mismatch</SelectItem>
                  <SelectItem value="manual_correction">Manual correction</SelectItem>
                  <SelectItem value="dispute">Dispute</SelectItem>
                  <SelectItem value="missed_checkout">Missed checkout</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fallback-notes">What happened?</Label>
              <Textarea
                id="fallback-notes"
                value={fallbackNotes}
                onChange={(event) => setFallbackNotes(event.target.value)}
                placeholder="Describe the camera issue, mismatch, or why manual review is needed"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsFallbackDialogOpen(false)}>Cancel</Button>
            <Button onClick={submitFallback} disabled={isSubmittingFallback || !fallbackNotes.trim()}>
              {isSubmittingFallback ? "Submitting..." : "Submit fallback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
