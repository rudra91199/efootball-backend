import { Router } from "express";
import { LeagueControllers } from "./league.controllers.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.post(
  "/:leagueId/:tournamentId/register",
  auth(USER_ROLES.admin, USER_ROLES.player),
  LeagueControllers.registerPlayerInLeague
);
router.post("/:leagueId/generate-fixtures", LeagueControllers.generateFixtures);
router.get("/:leagueId", LeagueControllers.getLeagueById);
router.patch("/:leagueId/publish-rounds", LeagueControllers.publishRounds);
router.get(
  "/generate-leaderboard/:leagueId",
  LeagueControllers.generateLeaderboard
);

export const LeagueRoutes = router;
