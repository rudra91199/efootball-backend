import { Router } from "express";
import { classicoControllers } from "./classico.controllers.js";

const router = Router();

router.post("/register-team", classicoControllers.registerClassicoTeam);

router.post("/start-phase1", classicoControllers.generatePhase1Fixtures);

router.patch("/update-score", classicoControllers.updateClassicoMatchScore);

router.post("/end-phase1", classicoControllers.endPhase1); //Check who has hasDraftRights

router.post("/phase2-draft", classicoControllers.generatePhase2Fixtures); //Losing Captain sends pairings.

router.patch("/phase-3/team-submit", classicoControllers.phase3TeamSubmit);

router.post("/start-phase3", classicoControllers.phase3FixtureGeneration);

router.get(
  "/phase1-leaderboard/:tournamentId",
  classicoControllers.getPhase1Leaderboard,
);

router.get(
  "/overall-leaderboard-byTeams/:tournamentId",
  classicoControllers.getOverallTeamLeaderboards,
);

router.get(
  "/overall-leaderboard-global/:tournamentId",
  classicoControllers.getGlobalPlayerLeaderboardclassico,
);

router.get(
  "/championship-leaderboard/:tournamentId",
  classicoControllers.getChampionshipLeaderboard,
);

export const classicoRoutes = router;
