import { Router } from "express";
import { championshipPointController } from "./championshipPoint.controller.js";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";

const router = Router();

router.get(
  "/getByTournament/:tournamentId",
  auth(USER_ROLES.admin, USER_ROLES.referee, USER_ROLES.player),
  championshipPointController.getChampionshipPointByTournament,
);

export const championshipPointRoute = router;
