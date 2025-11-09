import { Router } from "express";
import { KnockoutControllers } from "./knockout.controllers.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.post("/:tournamentId/generate-gauntlet-knockout", auth(USER_ROLES.admin), KnockoutControllers.generateGauntletKnockout);

router.get(
  "/:knockoutId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  KnockoutControllers.getKnockoutById
);

router.patch("/:knockoutId/publish-rounds", KnockoutControllers.publishRounds);

export const KnockoutRoutes = router;
