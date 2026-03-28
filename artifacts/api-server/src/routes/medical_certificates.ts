import { Router, type IRouter } from "express";
import { db, medicalCertificatesTable, type McVerificationStatus } from "@workspace/db";
import { eq, and, SQL, inArray } from "drizzle-orm";
import {
  ListMedicalCertificatesQueryParams,
  ListMedicalCertificatesResponse,
  CreateMedicalCertificateBody,
  GetMedicalCertificateParams,
  GetMedicalCertificateResponse,
  UpdateMedicalCertificateParams,
  UpdateMedicalCertificateBody,
  UpdateMedicalCertificateResponse,
} from "@workspace/api-zod";
import { requireAuth, requireRole, getScopedUserIds, canAccessUserId } from "../lib/auth";
import { checkMcExpiry } from "../lib/mcExpiryService";

const router: IRouter = Router();

function mapCert(c: typeof medicalCertificatesTable.$inferSelect) {
  return {
    id: c.id,
    userId: c.userId,
    leaveApplicationId: c.leaveApplicationId ?? null,
    fileName: c.fileName,
    fileUrl: c.fileUrl,
    fileType: c.fileType,
    doctorName: c.doctorName ?? null,
    clinicName: c.clinicName ?? null,
    issueDate: c.issueDate ?? null,
    mcStartDate: c.mcStartDate ?? null,
    mcEndDate: c.mcEndDate ?? null,
    verificationStatus: c.verificationStatus,
    verificationNotes: c.verificationNotes ?? null,
    verifiedBy: c.verifiedBy ?? null,
    verifiedAt: c.verifiedAt ?? null,
    reminderSentAt: c.reminderSentAt ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get("/medical-certificates", requireAuth, async (req, res): Promise<void> => {
  const params = ListMedicalCertificatesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const jwtUser = req.user!;
  const scopedUserIds = await getScopedUserIds(jwtUser, params.data.userId);
  if (scopedUserIds !== null && scopedUserIds.length === 0) {
    res.json(ListMedicalCertificatesResponse.parse({ certificates: [], total: 0 }));
    return;
  }

  const conditions: SQL[] = [];
  if (scopedUserIds !== null) {
    conditions.push(inArray(medicalCertificatesTable.userId, scopedUserIds));
  }

  if (params.data.verificationStatus) {
    conditions.push(eq(medicalCertificatesTable.verificationStatus, params.data.verificationStatus as McVerificationStatus));
  }

  const certs = await db.select().from(medicalCertificatesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  res.json(ListMedicalCertificatesResponse.parse({ certificates: certs.map(mapCert), total: certs.length }));
});

router.post("/medical-certificates", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMedicalCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const jwtUser = req.user!;

  if (!["admin", "hr"].includes(jwtUser.role) && parsed.data.userId !== jwtUser.userId) {
    res.status(403).json({ error: "Forbidden: can only upload MC for yourself" });
    return;
  }

  const [cert] = await db.insert(medicalCertificatesTable).values({
    userId: parsed.data.userId,
    leaveApplicationId: parsed.data.leaveApplicationId ?? null,
    fileName: parsed.data.fileName,
    fileUrl: parsed.data.fileUrl,
    fileType: parsed.data.fileType,
    doctorName: parsed.data.doctorName ?? null,
    clinicName: parsed.data.clinicName ?? null,
    issueDate: parsed.data.issueDate ?? null,
    mcStartDate: parsed.data.mcStartDate ?? null,
    mcEndDate: parsed.data.mcEndDate ?? null,
    verificationStatus: "pending",
  }).returning();

  res.status(201).json(GetMedicalCertificateResponse.parse(mapCert(cert)));
});

router.get("/medical-certificates/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetMedicalCertificateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [cert] = await db.select().from(medicalCertificatesTable).where(eq(medicalCertificatesTable.id, params.data.id));
  if (!cert) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }

  const jwtUser = req.user!;
  if (!(await canAccessUserId(jwtUser, cert.userId))) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  res.json(GetMedicalCertificateResponse.parse(mapCert(cert)));
});

// Only admin and HR can update verification status
router.patch("/medical-certificates/:id", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const params = UpdateMedicalCertificateParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const body = UpdateMedicalCertificateBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const jwtUser = req.user!;

  const updateData: Partial<typeof medicalCertificatesTable.$inferInsert> = {};
  if (body.data.verificationStatus) {
    updateData.verificationStatus = body.data.verificationStatus as McVerificationStatus;
    // Stamp reviewer when verification status changes to verified or suspicious
    if (["verified", "suspicious", "unreadable"].includes(body.data.verificationStatus)) {
      updateData.verifiedBy = jwtUser.userId;
      updateData.verifiedAt = new Date();
    }
  }
  if (body.data.verificationNotes !== undefined) updateData.verificationNotes = body.data.verificationNotes;
  if (body.data.doctorName !== undefined) updateData.doctorName = body.data.doctorName;
  if (body.data.clinicName !== undefined) updateData.clinicName = body.data.clinicName;

  const [cert] = await db.update(medicalCertificatesTable)
    .set(updateData)
    .where(eq(medicalCertificatesTable.id, params.data.id))
    .returning();

  if (!cert) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }

  res.json(UpdateMedicalCertificateResponse.parse(mapCert(cert)));
});

// POST /medical-certificates/check-expiry — triggers expiry scan and alert creation (admin/HR only)
// Designed to be called by a scheduled cron job. Optionally accepts { expiryDays?: number }.
router.post("/medical-certificates/check-expiry", requireAuth, requireRole("admin", "hr"), async (req, res): Promise<void> => {
  const expiryDays = req.body?.expiryDays !== undefined ? parseInt(req.body.expiryDays, 10) : 7;
  if (isNaN(expiryDays) || expiryDays < 1 || expiryDays > 90) {
    res.status(400).json({ error: "expiryDays must be between 1 and 90" });
    return;
  }

  const result = await checkMcExpiry(expiryDays);
  res.json({
    expiringSoon: result.expiringSoon,
    alreadyExpired: result.alreadyExpired,
    alertsCreated: result.alertsCreated,
    skipped: result.skipped,
    message: `Scan complete. ${result.alertsCreated} alert(s) created.`,
  });
});

export default router;
