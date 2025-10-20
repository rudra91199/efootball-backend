import { MatchHistory } from "./matchHistory.model.js";

const getTournamentMatchesFromDB = async (playerId, tournamenId) => {
  const response = MatchHistory.find({
    player: playerId,
    tournament: tournamenId,
  })
    .populate("player opponent")
    .populate({
      path: "match",
      populate: [
        {
          path: "team1",
          select: "name",
        },
        {
          path: "team2",
          select: "name",
        },
      ],
    })
    .populate({
      path: "tournament",
      select: "type",
    });
  return response;
};

export const MatchHistoryServices = {
  getTournamentMatchesFromDB,
};
