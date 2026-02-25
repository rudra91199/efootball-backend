import { Router } from "express";
import { championshipPointController } from "./championshipPoint.controller.js";

const router = Router();

router.get(
  "/getByTournament/:tournamentId",
  championshipPointController.getChampionshipPointByTournament,
);

export const championshipPointRoute = router;
