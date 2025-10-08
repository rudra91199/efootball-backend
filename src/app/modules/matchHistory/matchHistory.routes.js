import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { MatchHistoryControllers } from "./matchHistory.controllers.js";

const router = Router();

router.get(
  "/getTournamentMatches/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  MatchHistoryControllers.getTournamentMatches
);



export const MatchHistoryRoutes = router;
