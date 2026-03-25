import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import departmentsRouter from "./departments";
import attendanceRouter from "./attendance";
import leavesRouter from "./leaves";
import medicalCertificatesRouter from "./medical_certificates";
import alertsRouter from "./alerts";
import productivityRouter from "./productivity";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(departmentsRouter);
router.use(attendanceRouter);
router.use(leavesRouter);
router.use(medicalCertificatesRouter);
router.use(alertsRouter);
router.use(productivityRouter);

export default router;
