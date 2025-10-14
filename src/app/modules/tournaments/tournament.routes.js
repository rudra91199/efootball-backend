import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { TournamentControllers } from "./tournament.controller.js";

const router = Router();

router.post(
  "/create",
  auth(USER_ROLES.admin),
  TournamentControllers.createTournament
);

router.get("/all", TournamentControllers.getAllTournaments);

router.get(
  "/admin/all",
  auth(USER_ROLES.admin),
  TournamentControllers.getAllTournamentsForAdmin
)

router.get(
  "/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.getSingleTournament
);

router.patch(
  "/update-status/:id",
  auth(USER_ROLES.admin),
  TournamentControllers.updateTournamentStatus
);

router.patch(
  "/generateRoundRobinFixtures/:id",
  auth(USER_ROLES.admin),
  TournamentControllers.generateRoundRobinFixtures
);

router.get(
  "/registered/:id",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TournamentControllers.getRegisteredTournaments
);

router.get(
  "/:tournamentId/leaderboard/phase1",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TournamentControllers.generatePhase1Leaderbaord
);

router.patch(
  "/generatePhase2fixtures/:tournamentId",
  auth(USER_ROLES.admin),
  TournamentControllers.generatePhase2fixtures
);

router.get(
  "/generateFinalSeedingLeaderboard/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TournamentControllers.generateFinalSeedingLeaderboard
);

router.patch(
  "/generatePhase3fixtures/:tournamentId",
  auth(USER_ROLES.admin),
  TournamentControllers.startPhase3
);

router.get(
  "/:tournamentId/playerStatuses",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TournamentControllers.getPlayerStatusesForTournament
);

export const TournamentRoutes = router;
