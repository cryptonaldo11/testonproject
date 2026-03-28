import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import rolesRouter from "./roles";
import workersRouter from "./workers";
import departmentsRouter from "./departments";
import attendanceRouter from "./attendance";
import leavesRouter from "./leaves";
import medicalCertificatesRouter from "./medical_certificates";
import alertsRouter from "./alerts";
import productivityRouter from "./productivity";
import storageRouter from "./storage";
import attendanceExceptionsRouter from "./attendance_exceptions";
import faceVerificationRouter from "./face_verification";
import anomaliesRouter from "./anomalies";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(rolesRouter);
router.use(workersRouter);
router.use(departmentsRouter);
router.use(attendanceRouter);
router.use(leavesRouter);
router.use(medicalCertificatesRouter);
router.use(alertsRouter);
router.use(productivityRouter);
router.use(storageRouter);
router.use(attendanceExceptionsRouter);
router.use(faceVerificationRouter);
router.use(anomaliesRouter);

export default router;
