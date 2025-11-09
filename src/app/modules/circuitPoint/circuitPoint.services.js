import { Knockout } from "../knockout/knockout.model.js";
import { League } from "../league/league.model.js";
import { generateLeagueLeaderboard } from "../league/league.services.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { CircuitPoint } from "./circuitPoint.model.js";

export async function calculateAndSavePhase1Points(leagueId) {
  // 1. Generate the final leaderboard for the league
  const leaderboard = await generateLeagueLeaderboard(leagueId);
  if (leaderboard.length < 4) {
    // Assuming 4 players for this format
    throw new Error("League leaderboard does not have enough players.");
  }

  // 2. Find the parent tournament ID
  const league = await League.findById(leagueId);
  if (!league) throw new Error("League not found.");
  const tournamentId = league.tournament;

  // 3. Define the point distribution
  const pointDistribution = [4, 3, 2, 1]; // Points for 1st, 2nd, 3rd, 4th

  // 4. Prepare bulk update operations
  const operations = leaderboard.map((playerStat, index) => {
    const points = pointDistribution[index] || 0; // Assign points based on rank
    return {
      updateOne: {
        filter: { tournament: tournamentId, player: playerStat.playerInfo._id },
        update: { $set: { phase1_points: points } },
        upsert: true, // Create the CircuitPoint document if it doesn't exist
      },
    };
  });

  // 5. Execute updates and mark league as completed
  await CircuitPoint.bulkWrite(operations);
  league.circuitPointsCalculated = true;
  league.status = "Completed";
  await league.save();

  console.log(`Phase 1 points saved for tournament ${tournamentId}`);
  return { success: true, message: "Phase 1 points saved." };
}

export async function calculateAndSavePhase2Points(knockoutId) {
  const knockout = await Knockout.findById(knockoutId).populate({
    path: "rounds.series",
    model: "Series",
  });
  const tournamentId = knockout.tournament;

  // 1. Determine final placings from the Gauntlet
  const r1 = knockout.rounds.find((r) => r.roundName === "Gauntlet Round 1")
    .series[0];
  const r2 = knockout.rounds.find((r) => r.roundName === "Gauntlet Round 2")
    .series[0];
  const r3 = knockout.rounds.find((r) => r.roundName === "Gauntlet Final")
    .series[0];

  const place1 = r3.winner;
  const place2 = r3.player1.equals(place1) ? r3.player2 : r3.player1;
  const place3 = r2.player1.equals(place2) ? r2.player2 : r2.player1;
  const place4 = r1.player1.equals(place3) ? r1.player2 : r1.player1;

  const placings = [place1, place2, place3, place4];
  const pointMap = { 0: 4, 1: 3, 2: 2, 3: 1 };

  // 2. Update points for each player
  for (let i = 0; i < placings.length; i++) {
    const player = placings[i];
    const points = pointMap[i] || 0;

    await CircuitPoint.updateOne(
      { tournament: tournamentId, player: player },
      {
        $set: { phase2_points: points },
        $inc: { total_points: points }, // Increment total with P2 points
      }
    );
  }
  console.log("Phase 2 Circuit Points awarded.");
}

export async function generateFinalSeedingLeaderboard(tournamentId) {
  // --- 1. Fetch all Circuit Point data for the tournament ---
  // Populate 'player' to get player details (name, etc.)
  const cpData = await CircuitPoint.find({ tournament: tournamentId }).populate(
    "player"
  );

  if (cpData.length < 4) {
    // Assuming 4 players
    throw new Error("Circuit Point data is incomplete for all players.");
  }

  // --- 2. Calculate the total points for each player ---
  const playersWithTotalPoints = cpData.map((item) => ({
    playerInfo: item.player,
    phase1_points: item.phase1_points,
    phase2_points: item.phase2_points,
    total_points: item.phase1_points + item.phase2_points,
  }));

  // --- 3. Fetch the Phase 1 Leaderboard for the tie-breaker rule ---
  // Find the League ID associated with Phase 1 of this tournament
  const tournament = await Tournament.findById(tournamentId); // Assuming Tournament model is imported
  const phase1LeagueStage = tournament.stages.find((s) => s.stageOrder === 1);
  const phase1LeagueId = phase1LeagueStage.stageData;
  const phase1Leaderboard = await generateLeagueLeaderboard(phase1LeagueId);

  // --- 4. Sort the players based on the final rules ---
  playersWithTotalPoints.sort((a, b) => {
    // a) Primary sort: by total_points (descending)
    if (a.total_points !== b.total_points) {
      return b.total_points - a.total_points;
    }

    // b) Tie-breaker: by Phase 1 rank
    // Find the index (rank) of each player in the Phase 1 leaderboard
    const rankA = phase1Leaderboard.findIndex((p) =>
      p.playerInfo._id.equals(a.playerInfo._id)
    );
    const rankB = phase1Leaderboard.findIndex((p) =>
      p.playerInfo._id.equals(b.playerInfo._id)
    );

    // The player with the lower index (better rank in Phase 1) wins the tie
    return rankA - rankB;
  });

  return playersWithTotalPoints;
}

export const CircuitPointService = {
  calculateAndSavePhase1Points,
  calculateAndSavePhase2Points,
  generateFinalSeedingLeaderboard,
};
