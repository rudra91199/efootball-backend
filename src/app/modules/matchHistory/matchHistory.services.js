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

export const updateMatchHistoryHelper = async (match) => {
  const loser = match.winner.equals(match.team1) ? match.team2 : match.team1;

  try {
    // Update the winner's log
    await MatchHistory.updateOne(
      { match: match._id, player: match.winner },
      {
        result: "Win",
        scoreFor: match.winner.equals(match.team1)
          ? match.team1_score
          : match.team2_score,
        scoreAgainst: match.winner.equals(match.team1)
          ? match.team2_score
          : match.team1_score,
        matchDate: new Date(),
      }
    );

    // Update the loser's log
    await MatchHistory.updateOne(
      { match: match._id, player: loser },
      {
        result: "Loss",
        scoreFor: loser.equals(match.team1)
          ? match.team1_score
          : match.team2_score,
        scoreAgainst: loser.equals(match.team1)
          ? match.team2_score
          : match.team1_score,
        matchDate: new Date(),
      }
    );
  } catch (error) {
    console.error("Failed to update MatchHistory:", error);
  }
};

export const MatchHistoryServices = {
  getTournamentMatchesFromDB,
};
