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
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.editProfile
);

router.patch(
  "/changePassword",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.changePassword
);
router.patch(
  "/changePassword/admin/:userId",
  auth(USER_ROLES.admin),
  UserController.changePasswordAdmin
);

router.get("/getAllUsers", auth(USER_ROLES.admin), UserController.getAllUsers);

router.get(
  "/getUsersForRegistration",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getUsersFroRegistration
);

// player data
router.get(
  "/:playerId/tournaments",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getPlayerTournaments
);

router.get(
  "/leaderboard/global",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getGlobalLeaderboard
);

router.get(
  "/leaderboards/tournament/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getPlayerLeaderboard
);

router.get(
  "/playerStatsBySeason/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getPlayerStatsBySeason
);
router.get(
  "/getMatchHistory/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getPlayerMatchHistory
);

router.get(
  "/getFullStats/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  UserController.getPlayerFullStats
);

router.get(
  "/getScoringStats/:playerId",
  auth(USER_ROLES.admin, USER_ROLES.player),
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

export const UserRoutes = router;
