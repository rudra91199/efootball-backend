import { Router } from "express";
import { LeagueControllers } from "./league.controllers.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.post(
  "/:leagueId/:tournamentId/register",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  LeagueControllers.registerPlayerInLeague,
);

router.post(
  "/:leagueId/generate-fixtures",
  auth(USER_ROLES.admin),
  LeagueControllers.generateFixtures,
);

router.get(
  "/:leagueId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  LeagueControllers.getLeagueById,
);

router.patch(
  "/:leagueId/publish-rounds",
  auth(USER_ROLES.admin, USER_ROLES.referee),
  LeagueControllers.publishRounds,
);

router.get(
  "/generate-leaderboard/:leagueId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  LeagueControllers.generateLeaderboard,
);

router.post(
  "/finalize-phase1-and-generate-gauntlet/:leagueId",
  auth(USER_ROLES.admin),
  LeagueControllers.finalizePhase1AndGenerateGauntlet,
);

export const LeagueRoutes = router;
