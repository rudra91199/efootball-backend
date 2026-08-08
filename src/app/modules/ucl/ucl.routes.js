import { Router } from "express";
import { UclControllers } from "./ucl.controllers.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.post(
  "/register-players",
  auth(USER_ROLES.admin),
  UclControllers.registerPlayers,
);

router.post(
  "/start-phase1",
  auth(USER_ROLES.admin),
  UclControllers.generatePhase1,
);

router.post(
  "/start-phase2",
  auth(USER_ROLES.admin),
  UclControllers.generatePhase2,
);

router.patch(
  "/submit-score",
  auth(USER_ROLES.admin, USER_ROLES.referee),
  UclControllers.submitTwoLeggedScore,
);

router.post(
  "/start-phase3",
  auth(USER_ROLES.admin),
  UclControllers.generatePhase3,
);

router.patch(
  "/submit-phase3-score",
  auth(USER_ROLES.admin, USER_ROLES.referee),
  UclControllers.submitPhase3Score,
);

// Using GET so you can easily trigger it from a browser or Postman if needed
router.get(
  "/sync-bracket/:tournamentId",
  auth(USER_ROLES.admin),
  UclControllers.forceSyncBracket
);

export const UclRoutes = router;
