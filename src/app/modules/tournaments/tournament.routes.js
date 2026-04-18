import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { TournamentControllers } from "./tournament.controller.js";

const router = Router();

// 2. Public route for the frontend to fetch the Hall of Fame
router.get(
  "/hall-of-fame",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.getHallOfFame,
);

router.post(
  "/create",
  auth(USER_ROLES.admin),
  TournamentControllers.createTournament,
);

router.get(
  "/all",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  TournamentControllers.getAllTournaments,
);

router.get(
  "/admin/all",
  auth(USER_ROLES.admin),
  TournamentControllers.getAllTournamentsForAdmin,
);

router.get(
  "/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.getSingleTournament,
);

router.patch(
  "/update-status/:id",
  auth(USER_ROLES.admin),
  TournamentControllers.updateTournamentStatus,
);

router.patch(
  "/generateRoundRobinFixtures/:id",
  auth(USER_ROLES.admin),
  TournamentControllers.generateRoundRobinFixtures,
);

router.get(
  "/registered/:id",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.getRegisteredTournaments,
);

router.get(
  "/:tournamentId/leaderboard/phase1",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.generatePhase1Leaderbaord,
);

router.patch(
  "/generatePhase2fixtures/:tournamentId",
  auth(USER_ROLES.admin),
  TournamentControllers.generatePhase2fixtures,
);

router.get(
  "/generateFinalSeedingLeaderboard/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.generateFinalSeedingLeaderboard,
);

router.patch(
  "/generatePhase3fixtures/:tournamentId",
  auth(USER_ROLES.admin),
  TournamentControllers.startPhase3,
);

router.get(
  "/:tournamentId/playerStatuses",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  TournamentControllers.getPlayerStatusesForTournament,
);

// --- NEW HALL OF FAME ROUTES ---

// 1. Temporary Admin Route to fix old tournaments
router.post(
  "/admin/fix-hof",
  auth(USER_ROLES.admin), // Assuming you have this auth middleware
  TournamentControllers.fixHallOfFame,
);

// --- NEW HALL OF FAME ROUTES ---

// 1. Temporary Admin Route to fix old tournaments
router.post(
  "/admin/fix-hof",
  auth(USER_ROLES.admin), // Assuming you have this auth middleware
  TournamentControllers.fixHallOfFame
);

// 2. Public route for the frontend to fetch the Hall of Fame
router.get(
  "/hall-of-fame",
  auth(USER_ROLES.admin, USER_ROLES.player),
  TournamentControllers.getHallOfFame
);

export const TournamentRoutes = router;
