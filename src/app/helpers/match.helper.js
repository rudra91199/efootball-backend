import { ChampionshipPoint } from "../modules/championshipPoint/championshipPoint.model.js";
import { MatchHistory } from "../modules/matchHistory/matchHistory.model.js";
import { Team } from "../modules/team/team.model.js";

export const updateMatchHistoryHelper = async (match) => {
  try {
    // 1. IS IT A TEAM MATCH? (Check if it has subMatches)
    if (match.details && match.details.subMatches && match.details.subMatches.length > 0) {
      // Loop through all sub-matches
      for (const subMatch of match.details.subMatches) {
        // Only update history if the sub-match has been scored/completed
        if (subMatch.status === "Completed" || subMatch.player1Score !== undefined) {
          await upsertHistoryRecords(
            match._id,
            match.tournament,
            subMatch.player1,
            subMatch.player2,
            subMatch.player1Score,
            subMatch.player2Score,
            subMatch.winner // Might be a string ID or "Draw"
          );
        }
      }
    } 
    // 2. OTHERWISE, IT IS A SOLO MATCH (League or Knockout)
    else {
      await upsertHistoryRecords(
        match._id,
        match.tournament,
        match.team1, // In Solo tournaments, team1 is the player's User ID
        match.team2, 
        match.team1_score,
        match.team2_score,
        match.winner
      );
    }

    console.log(`✅ Successfully synced MatchHistory for Match: ${match._id}`);
    return true;
  } catch (error) {
    console.error(`❌ Failed to sync MatchHistory for Match ${match._id}:`, error);
    return false;
  }
};

const upsertHistoryRecords = async (matchId, tournamentId, p1Id, p2Id, score1, score2, winnerId) => {
  if (!p1Id || !p2Id) return;

  const p1Score = Number(score1) || 0;
  const p2Score = Number(score2) || 0;

  let p1Result = "Draw";
  let p2Result = "Draw";

  // Calculate standard Win/Loss
  if (p1Score > p2Score) {
    p1Result = "Win";
    p2Result = "Loss";
  } else if (p2Score > p1Score) {
    p1Result = "Loss";
    p2Result = "Win";
  }

  // Handle Knockout Penalty/Walkover Overrides (if score is tied but someone won)
  if (p1Result === "Draw" && winnerId && winnerId !== "Draw") {
    if (winnerId.toString() === p1Id.toString()) {
      p1Result = "Win";
      p2Result = "Loss";
    } else if (winnerId.toString() === p2Id.toString()) {
      p1Result = "Loss";
      p2Result = "Win";
    }
  }

  // UPSERT PLAYER 1
  await MatchHistory.findOneAndUpdate(
    { match: matchId, player: p1Id },
    {
      $set: {
        tournament: tournamentId,
        opponent: p2Id,
        scoreFor: p1Score,
        scoreAgainst: p2Score,
        result: p1Result,
        matchDate: new Date(),
      }
    },
    { new: true, upsert: true }
  );

  // UPSERT PLAYER 2
  await MatchHistory.findOneAndUpdate(
    { match: matchId, player: p2Id },
    {
      $set: {
        tournament: tournamentId,
        opponent: p1Id,
        scoreFor: p2Score,
        scoreAgainst: p1Score,
        result: p2Result,
        matchDate: new Date(),
      }
    },
    { new: true, upsert: true }
  );
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
