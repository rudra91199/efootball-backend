import { Router } from "express";
import { USER_ROLES } from "../users/user.constants.js";
import auth from "../../middlewares/auth.js";
import { TeamsControllers } from "./team.controller.js";

const router = Router();

router.post(
  "/register",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TeamsControllers.registerTeam
);
router.get(
  "/get/all/:id",
  // auth(USER_ROLES.admin),
  TeamsControllers.getAllRegisteredTeams
);

router.patch(
  "/update/status/:id",
  auth(USER_ROLES.admin),
  TeamsControllers.updateTeamStatus
);

export const teamRoutes = router;
