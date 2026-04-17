import { Router } from "express";
import { classicoControllers } from "./classico.controllers.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.post(
  "/register-team",
  auth(USER_ROLES.admin),
  classicoControllers.registerClassicoTeam,
);

router.post(
  "/start-phase1",
  auth(USER_ROLES.admin),
  classicoControllers.generatePhase1Fixtures,
);

router.patch(
  "/update-score",
  auth(USER_ROLES.admin, USER_ROLES.referee),
  classicoControllers.updateClassicoMatchScore,
);

router.post(
  "/end-phase1",
  auth(USER_ROLES.admin),
  classicoControllers.endPhase1,
); //Check who has hasDraftRights

router.post(
  "/phase2-draft",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.generatePhase2Fixtures,
); //Losing Captain sends pairings.

router.patch(
  "/phase-3/team-submit",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.phase3TeamSubmit,
);

router.post(
  "/start-phase3",
  auth(USER_ROLES.admin),
  classicoControllers.phase3FixtureGeneration
);

router.get(
  "/phase1-leaderboard/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.getPhase1Leaderboard,
);

router.get(
  "/overall-leaderboard-byTeams/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.getOverallTeamLeaderboards,
);

router.get(
  "/overall-leaderboard-global/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.getGlobalPlayerLeaderboardclassico,
);

router.get(
  "/championship-leaderboard/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  classicoControllers.getChampionshipLeaderboard,
);

export const classicoRoutes = router;
