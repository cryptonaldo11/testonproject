import { Router, type IRouter } from "express";
import { GetOperationalControlSummaryQueryParams, GetOperationalControlSummaryResponse } from "@workspace/api-zod";
import { requireAuth, canReadOperationalData, getVisibleUserIds } from "../lib/auth";
import { getOperationalControlSummary } from "../lib/operationalControl";

const router: IRouter = Router();

router.get("/operational-control/summary", requireAuth, async (req, res): Promise<void> => {
  const jwtUser = req.user!;
  if (!canReadOperationalData(jwtUser.role)) {
    res.status(403).json({ error: "Forbidden: insufficient permissions" });
    return;
  }

  const params = GetOperationalControlSummaryQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const visibleUserIds = await getVisibleUserIds(jwtUser);
  const summary = await getOperationalControlSummary({
    visibleUserIds,
    workflow: params.data.workflow,
  });

  res.json(GetOperationalControlSummaryResponse.parse(summary));
});

export default router;
