import { ChampionshipPoint } from "../modules/championshipPoint/championshipPoint.model.js";
import { MatchHistory } from "../modules/matchHistory/matchHistory.model.js";
import { Team } from "../modules/team/team.model.js";

export const updateMatchHistoryHelper = async (match) => {
  const loserId = match.winner.equals(match.player1)
    ? match.player2
    : match.player1;

  try {
    // Update Winner's Log
    await MatchHistory.updateOne(
      { match: match._id, player: match.winner },
      {
        result: "Win",
        scoreFor: match.winner.equals(match.player1)
          ? match.team1_score
          : match.team2_score,
        scoreAgainst: match.winner.equals(match.player1)
          ? match.team2_score
          : match.team1_score,
        matchDate: new Date(),
      },
    );

    // Update Loser's Log
    await MatchHistory.updateOne(
      { match: match._id, player: loserId },
      {
        result: "Loss",
        scoreFor: loserId.equals(match.player1)
          ? match.team1_score
          : match.team2_score,
        scoreAgainst: loserId.equals(match.player1)
          ? match.team2_score
          : match.team1_score,
        matchDate: new Date(),
      },
    );
  } catch (error) {
    console.error("Failed to update MatchHistory:", error);
  }
};

export const awardTeamPoints = async (
  tournamentId,
  teamId,
  points,
  phaseField,
) => {
  try {
    // 1. Update the Team model (for quick frontend access)
    await Team.findByIdAndUpdate(teamId, {
      $inc: { totalTeamPoints: points },
    });

    // 2. Update the ChampionshipPoint history model (for detailed tracking)
    // We use $inc to add to the existing score
    await ChampionshipPoint.updateOne(
      { tournament: tournamentId, team: teamId },
      {
        $inc: {
          [phaseField]: points, // e.g., phase1_points: 1
          total_points: points, // Also increment the grand total
        },
      },
      { upsert: true }, // Create the doc if it doesn't exist (safety net)
    );

    console.log(`Awarded ${points} points to Team ${teamId} for ${phaseField}`);
  } catch (error) {
    console.error("Error awarding team points:", error);
  }
};
