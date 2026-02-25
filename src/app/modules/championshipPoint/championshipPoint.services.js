import { ChampionshipPoint } from "./championshipPoint.model.js";

const getChampionshipPointByTournament = async (tournamentId) => {
  const response = await ChampionshipPoint.find({
    tournament: tournamentId,
  });
  return response;
};

export const championshipPointService = {
  getChampionshipPointByTournament,
};
