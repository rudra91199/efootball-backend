import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { MatchControllers } from "./match.controller.js";

const router = Router();

router.patch(
  "/submit-squad/:matchId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  MatchControllers.submitSquad
);

router.patch(
  "/squad-update/:matchId/:captainId",
  auth(USER_ROLES.admin, USER_ROLES.player),
  MatchControllers.updateSquad
);

router.patch(
  "/update-round-status/:matchId",
  auth(USER_ROLES.admin),
  MatchControllers.updateRoundStatus
);

// Sub-match score update for team tournaments
router.patch(
  "/submit-scores/:matchId/submatch/:subMatchId",
  auth(USER_ROLES.admin),
  MatchControllers.updateScore
);

// Score update for league and knockout matches
router.patch(
  "/submit-score/leagueAndKnockout",
  MatchControllers.scoreUpdateForLeagueAndKnockout
);

// Score update for tournament matches
router.patch(
  "/submit-score/tournament",
  auth(USER_ROLES.admin),
  MatchControllers.scoreUpdateForTournament
);

router.get(
  "/getPlayersByMatch/:matchId",
  auth(USER_ROLES.admin),
  MatchControllers.getPlayersByMatch
);

router.patch(
  "/setMatchOfTheMatch/:matchId/:playerId",
  auth(USER_ROLES.admin),
  MatchControllers.setManOfTheMatch
);

export const MatchRoutes = router;
