import ApiError from "../../errors/ApiError.js";
import { Knockout } from "../knockout/knockout.model.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { User } from "../users/user.model.js";
import { League } from "./league.model.js";

//register player in league
const registerPlayerInLeague = async (leagueId, playerId, tournamentId) => {
  const league = await League.findById(leagueId);
  if (!league) {
    throw new ApiError(404, "League not found.");
  }

  // --- VALIDATION CHECKS ---
  if (league.status !== "Upcoming") {
    throw new ApiError(400, "Registration for this league is closed.");
  }
  if (league.participants.length >= league.maxParticipants) {
    throw new ApiError(400, "This league is already full.");
  }
  if (league.participants.includes(playerId)) {
    throw new ApiError(400, "You are already registered in this league.");
  }

  // --- UPDATE ---
  // Use $addToSet to safely add the player, preventing duplicates.
  await League.findByIdAndUpdate(leagueId, {
    $addToSet: { participants: playerId },
  });
  await Tournament.findByIdAndUpdate(tournamentId, {
    $addToSet: { teams: playerId },
  });
};

// Generate fixtures using Round-Robin algorithm and create MatchHistory logs
const generateFixtures = async (leagueId) => {
  const league = await League.findById(leagueId);
  if (!league) throw new Error("League not found.");
  // ... (rest of your validation)

  if (league.participants.length < league.maxParticipants) {
    throw new ApiError(400, "Not enough participants to generate fixtures.");
  }

  // --- 2. The Round-Robin Algorithm Setup (same as before) ---
  let players = [...league.participants];
  if (players.length % 2 !== 0) players.push(null);

  const playerCount = players.length;
  const rounds = playerCount - 1;
  const allMatchData = []; // Will hold temporary match data

  // --- 3. Generate Pairings for Both Halves ---
  // First Half
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < playerCount / 2; j++) {
      const p1 = players[j];
      const p2 = players[playerCount - 1 - j];
      if (p1 && p2)
        allMatchData.push({ round: `Round-${i + 1}`, team1: p1, team2: p2 });
    }
    players.splice(1, 0, players.pop());
  }
  // Second Half
  for (let i = 0; i < rounds; i++) {
    for (let j = 0; j < playerCount / 2; j++) {
      const p1 = players[j];
      const p2 = players[playerCount - 1 - j];
      if (p1 && p2)
        allMatchData.push({
          round: `Round-${i + 1 + rounds}`,
          team1: p2,
          team2: p1,
        });
    }
    players.splice(1, 0, players.pop());
  }

  // --- 4. Create the Match Documents ---
  const createdMatches = await Match.insertMany(
    allMatchData.map((m) => ({ ...m, league: league._id }))
  );

  // --- 5. NEW: Create the Corresponding MatchHistory Documents ---
  const allHistoryLogsToCreate = [];
  for (const match of createdMatches) {
    // Log for Player 1's perspective
    allHistoryLogsToCreate.push({
      player: match.team1,
      opponent: match.team2,
      match: match._id,
      tournament: league.tournament, // Assuming league has a tournament ref
      matchDate: match.roundStartDate, // If you set this
      result: "Pending",
    });
    // Log for Player 2's perspective
    allHistoryLogsToCreate.push({
      player: match.team2,
      opponent: match.team1,
      match: match._id,
      tournament: league.tournament,
      matchDate: match.roundStartDate,
      result: "Pending",
    });
  }

  if (allHistoryLogsToCreate.length > 0) {
    await MatchHistory.insertMany(allHistoryLogsToCreate);
  }

  // --- 6. Update the League ---
  league.matches.push(...createdMatches.map((m) => m._id));
  league.status = "Active";
  await league.save();

  console.log(
    `Generated ${createdMatches.length} fixtures and ${allHistoryLogsToCreate.length} history logs.`
  );
  return { success: true, league };
};

// Get league by ID
const getLeagueById = async (leagueId) => {
  const league = await League.findById(leagueId)
    .populate("participants", "name image inGameUserName")
    .populate({
      path: "matches",
      select: "-details -subMatchesGenerated",
      populate: {
        path: "team1 team2",
        select: "name image",
        model: User,
      },
    });
  return league;
};

const publishRounds = async (leagueId, payload) => {
  const { round, roundStartDate, roundEndDate } = payload;

  // Basic validation
  if (!round || !roundStartDate || !roundEndDate) {
    throw new ApiError(
      400,
      "round, roundStartDate, and roundEndDate are required."
    );
  }

  // 2. Find the league to get its list of match IDs
  const league = await League.findById(leagueId).select("matches");
  if (!league) {
    throw new ApiError(404, "League not found.");
  }

  // 3. Use `updateMany` to update all relevant matches in one command
  const result = await Match.updateMany(
    {
      _id: { $in: league.matches }, // Condition 1: Match must belong to this league
      round: round, // Condition 2: Match must be in the specified round
      status: "Unpublished", // Condition 3: Only update unpublished matches
    },
    {
      $set: {
        status: "Scheduled",
        roundStartDate,
        roundEndDate,
      },
    }
  );

  // 4. Send a success response
  if (result.modifiedCount === 0) {
    throw new ApiError(400, "No unpublished matches found for this round.");
  }

  return result;
};

export async function generateLeagueLeaderboard(leagueId) {
  try {
    // 1. Fetch the league and populate all its matches and participants
    const league = await League.findById(leagueId)
      .populate({
        path: "matches",
        populate: { path: "team1 team2", model: User },
      })
      .populate("participants");

    if (!league) throw new Error("League not found");

    // 2. Initialize a stats object for each participant
    const statsMap = new Map();
    league.participants.forEach((player) => {
      statsMap.set(player._id.toString(), {
        playerInfo: player,
        played: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      });
    });

    // 3. Process each completed match
    const completedMatches = league.matches.filter(
      (m) => m.status === "Completed"
    );

    for (const match of completedMatches) {
      const stats1 = statsMap.get(match.team1._id.toString());
      const stats2 = statsMap.get(match.team2._id.toString());

      // Update stats for both players if they exist in the map
      if (stats1 && stats2) {
        stats1.played += 1;
        stats2.played += 1;
        stats1.goalsFor += match.team1_score;
        stats1.goalsAgainst += match.team2_score;
        stats2.goalsFor += match.team2_score;
        stats2.goalsAgainst += match.team1_score;

        // Award points
        if (match.winner === null) {
          // Draw
          stats1.draws += 1;
          stats2.draws += 1;
          stats1.points += 1;
          stats2.points += 1;
        } else if (match.winner.equals(match.team1._id)) {
          // Player 1 won
          stats1.wins += 1;
          stats2.losses += 1;
          stats1.points += 3;
        } else {
          // Player 2 won
          stats2.wins += 1;
          stats1.losses += 1;
          stats2.points += 3;
        }
      }
    }

    // 4. Finalize calculations and convert to an array
    const leaderboardArray = Array.from(statsMap.values());
    leaderboardArray.forEach((stat) => {
      stat.goalDifference = stat.goalsFor - stat.goalsAgainst;
    });

    // 5. Sort the leaderboard
    leaderboardArray.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goalDifference !== b.goalDifference)
        return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    return leaderboardArray;
  } catch (error) {
    console.error("Error generating league leaderboard:", error);
    return [];
  }
}



export const LeagueServices = {
  registerPlayerInLeague,
  generateFixtures,
  getLeagueById,
  publishRounds,
  generateLeagueLeaderboard,
};
