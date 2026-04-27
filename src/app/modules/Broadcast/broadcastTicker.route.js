import { Router } from "express";
import {
  getLiveTickerData,
  createBroadcast,
  deleteBroadcast,
} from "./broadcastTicker.controller.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

// PUBLIC: Fetch the combined stream (Custom Messages + Match Roasts)

router.get(
  "/ticker-data",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  getLiveTickerData,
);

// ADMIN: Create a new custom broadcast message
router.post("/", auth(USER_ROLES.admin), createBroadcast);

// ADMIN: Delete an old broadcast message
router.delete("/:id", auth(USER_ROLES.admin), deleteBroadcast);

export const BroadcastTickerRoutes = router;
