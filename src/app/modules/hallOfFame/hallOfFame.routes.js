import { Router } from "express";
import { HallOfFameControllers } from "./hallOfFame.controller.js";
import { USER_ROLES } from "../users/user.constants.js";
import auth from "../../middlewares/auth.js";

const router = Router();

router.get(
  "/get-hall-of-fame",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  HallOfFameControllers.getHallOfFame,
);

router.post(
  "/admin/fix-hof",
  auth(USER_ROLES.admin), // Assuming you have this auth middleware
  HallOfFameControllers.fixHallOfFame,
);

export const HallOfFameRoutes = router;
