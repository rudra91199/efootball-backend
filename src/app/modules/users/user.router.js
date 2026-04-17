import { Router } from "express";
import validateRequest from "../../middlewares/validateRequest.js";
import { userValidations } from "./user.validation.js";
import { UserController } from "./user.controller.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "./user.constants.js";

const router = Router();

router.post(
  "/signup",
  validateRequest(userValidations.userRegistrationValidationSchema),
  UserController.registerUser
);

router.post("/login", UserController.loginUser);

router.get(
  "/checkAuth",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  UserController.checkAuth
);

router.patch(
  "/editProfile",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.editProfile
);

router.patch(
  "/changePassword",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.changePassword
);
router.patch(
  "/changePassword/admin/:userId",
  auth(USER_ROLES.admin),
  UserController.changePasswordAdmin
);

router.get("/getAllUsers", auth(USER_ROLES.admin), UserController.getAllUsers);

router.get(
  "/getUserBasicInfo/:userId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  UserController.getUserBasicInfo,
);

router.get(
  "/getUsersForRegistration",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  UserController.getUsersFroRegistration
);

// player data
router.get(
  "/:playerId/tournaments",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerTournaments
);

router.get(
  "/leaderboard/global",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getGlobalLeaderboard
);

router.get(
  "/leaderboards/tournament/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerLeaderboard
);

router.get(
  "/leaderboards/tournament/:tournamentId/player/:playerId/matches",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerTournamentMatches
);

router.get(
  "/playerStatsBySeason/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerStatsBySeason
);
router.get(
  "/getMatchHistory/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerMatchHistory
);

router.get(
  "/h2h/:player1Id/:player2Id",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getHeadToHeadStats
);

router.get(
  "/getFullStats/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerFullStats
);

router.get(
  "/getScoringStats/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee),
  UserController.getPlayerScoringStats
);

router.post(
  "/issue-card",
  auth(USER_ROLES.admin),
  UserController.issueCardToPlayer
);

router.patch(
  "/liftBan/:playerId",
  auth(USER_ROLES.admin),
  UserController.liftPlayerBan
);

// ?tournamentId=global OR ?tournamentId=123456789
router.get("/compare/:player1Id/:player2Id", auth(USER_ROLES.admin, USER_ROLES.player, USER_ROLES.referee), UserController.getPlayerComparison);

export const UserRoutes = router;
