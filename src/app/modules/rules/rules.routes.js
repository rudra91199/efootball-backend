import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { RulesControllers } from "./rules.controller.js";

const router = Router();

router.get(
  "/get-all-rules",
  auth(USER_ROLES.admin, USER_ROLES.player),
  RulesControllers.getRulesController
);

router.post(
  "/create",
  auth(USER_ROLES.admin),
  RulesControllers.updateRulesController
);

export const RulesRoutes = router;
