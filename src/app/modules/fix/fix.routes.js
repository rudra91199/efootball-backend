import { Router } from "express";
import { fixControllers } from "./fix.controllers.js";

const router = Router();

router.post(
  "/missing-match-histories",
  fixControllers.getMissingMatchHistories,
);

router.patch(
  "/pending-match-histories",
  fixControllers.getPendingMatchHistories,
);

export const fixRoutes = router;
