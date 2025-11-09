import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { CircuitPointController } from "./circuitPoint.controllers.js";

const router = Router();

router.post(
  "/calculate-circuit-points-stage1/:leagueId",
  auth(USER_ROLES.admin),
  CircuitPointController.calculateAndSavePhase1Points
);

router.get(
  "/generateFinalSeedingLeaderboard/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  CircuitPointController.generateFinalSeedingLeaderboard
);

export const CircuitPointRoutes = router;
