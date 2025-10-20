import mongoose, { Schema } from "mongoose";
import { Match } from "../match/match.model.js";
import { Tournament } from "./tournament.model.js";
import ApiError from "../../errors/ApiError.js";
import { ChampionshipPoint } from "../championshipPoint/championshipPoint.model.js";
import { League } from "../league/league.model.js";
import { Team } from "../team/team.model.js";
import { User } from "../users/user.model.js";

const createTournamentIntoDB = async (payload) => {
  let phases = [];
  if (payload.type === "Trifecta") {
    ["Seeding Scramble", "King Of The HIll Gaunlet", "The Final Stage"].map(
      (name, i) => {
        phases.push({
          phaseName: name,
          phaseOrder: i + 1,
        });
      }
    );
    const response = await Tournament.create({ ...payload, phases });
    return response;
  } else if (payload.type === "League + Knockout Solo") {
    const newTournament = new Tournament({
      ...payload,
      type: "League + Knockout Solo",
    });

    const provingGroundsLeague = new League({
      name: `${newTournament.name} - Proving Grounds`,
      maxParticipants: newTournament.maxTeams,
      participants: [], // The league starts with an empty list of players
      tournament: newTournament._id,
    });

    await provingGroundsLeague.save();
    await newTournament.save();

    newTournament.stages.push({
      stageOrder: 1,
      stageName: "The Proving Grounds",
      stageType: "League",
      stageData: provingGroundsLeague._id,
    });

    const finalTournament = await newTournament.save();
    return { success: true, tournament: finalTournament };
  }
};

const getAllTournamentsFromDB = async () => {
  const response = await Tournament.find({
    status: { $ne: "unPublished" },
  }).sort({ createdAt: -1 });
  return response;
};

const getAllTournamentsForAdminFromDB = async () => {
  const response = await Tournament.find().sort({ createdAt: -1 });
  return response;
};

const getSingleTournamentFromDB = async (tournamentId) => {
  const response = await Tournament.findById(tournamentId)
    .populate({
      path: "teams",
      populate: {
        path: "players captain",
      },
    })
    .populate({
      path: "phases.matches",
      populate: {
        path: "team1 team2 winner details.subMatches.player1 details.subMatches.player2",
      },
    })
    .populate({
      path: "phases.matches",
      populate: {
        path: "manOfTheMatch",
        select: "name",
      },
    })
    .populate("stages.stageData");
  return response;
};

//update tournament status
const updateTournamentStatusInDB = async (tournamentId, status) => {
  const validStatuses = ["Upcoming", "Live", "Completed", "Published"];
  if (!validStatuses.includes(status)) {
    throw new ApiError(400, "Invalid status value");
  }
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }
  tournament.status = status;
  await tournament.save();
  return tournament;
};

const generateRoundRobinFixtures = async (tournamentId, teamIds) => {
  try {
    // --- 1. Input Validation ---
    if (teamIds.length !== 4) {
      throw new Error(
        "This function requires exactly 4 teams to generate fixtures."
      );
    }

    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) {
      throw new Error("Tournament not found.");
    }

    // Find the first phase (The Seeding Scramble)
    const phase1 = tournament.phases.find((p) => p.phaseOrder === 1);
    if (!phase1) {
      throw new Error("Phase 1 not found for this tournament.");
    }

    // --- 2. Define the Hardcoded Pairings for 4 Teams ---
    // The numbers correspond to the index in the teamIds array.
    const pairings = [
      // Round 1
      { team1Index: 0, team2Index: 1, round: "Round-1" },
      { team1Index: 2, team2Index: 3, round: "Round-2" },
      // Round 2
      { team1Index: 0, team2Index: 2, round: "Round-3" },
      { team1Index: 1, team2Index: 3, round: "Round-4" },
      // Round 3
      { team1Index: 0, team2Index: 3, round: "Round-5" },
      { team1Index: 1, team2Index: 2, round: "Round-6" },
    ];

    // --- 3. Prepare the Match Documents for Creation ---
    const matchesToCreate = pairings.map((pairing) => ({
      team1: teamIds[pairing.team1Index],
      team2: teamIds[pairing.team2Index],
      round: pairing.round,
      status: "Unpublished",
      tournament: tournamentId,
      phase: phase1._id,
    }));

    // --- 4. Create all 6 Match Documents in a Single Database Operation ---
    const createdMatches = await Match.insertMany(matchesToCreate);
    console.log(`${createdMatches.length} matches created successfully.`);

    // --- 5. Link the New Matches to the Tournament's First Phase ---
    const matchIds = createdMatches.map((match) => match._id);

    // Add the match IDs to the phase's matches array
    phase1.matches.push(...matchIds);
    phase1.status = "Active"; // Activate the phase as matches are now scheduled

    // Save the updated tournament document
    await tournament.save();

    console.log("Fixtures successfully linked to tournament phase 1.");
    return createdMatches;
  } catch (error) {
    console.error("Error generating round-robin fixtures:", error);
    // In a real app, you might want to clean up any matches that were created before the error
    return { success: false, error: error.message };
  }
};

const getRegisteredTournamentsFromDB = async (userId) => {
  const objectUserId = new mongoose.Types.ObjectId(userId);

  // 1. Find tournaments from team-based events (like Trifecta)
  const teams = await Team.find({ players: objectUserId }).select("tournament");
  const teamTournamentIds = teams.map((t) => t.tournament);

  // 2. Find tournaments from solo league events (like Gauntlet of Contenders)
  const leagues = await League.find({ participants: objectUserId }).select(
    "tournament"
  );
  const leagueTournamentIds = leagues.map((l) => l.tournament);

  // 3. Combine and get a unique list of all tournament IDs
  const allTournamentIds = [...teamTournamentIds, ...leagueTournamentIds];
  const uniqueTournamentIds = [
    ...new Set(allTournamentIds.map((id) => id.toString())),
  ];

  // 4. Fetch the full details for each unique tournament
  const registeredTournaments = await Tournament.find({
    _id: { $in: uniqueTournamentIds },
  }).sort({ createdAt: -1 }); // Sort by most recent

  const activeTournaments = registeredTournaments.filter(
    (tournament) => tournament.status !== "Completed"
  );
  const completedTournaments = registeredTournaments.filter(
    (tournament) => tournament.status === "Completed"
  );
  return { activeTournaments, completedTournaments };
};

export async function generatePhase1Leaderboard(tournamentId) {
  try {
    // 1. Fetch all necessary data with deep population
    const tournament = await Tournament.findById(tournamentId)
      .populate({
        path: "phases",
        populate: {
          path: "matches",
          populate: [
            // Populate multiple fields within each match
            {
              path: "team1 team2",
              populate: {
                path: "players",
                select: "_id", // We only need the player IDs for comparison
              },
            },
          ],
        },
      })
      .populate("teams");

    if (!tournament) throw new Error("Tournament not found");

    const phase1 = tournament.phases.find((p) => p.phaseOrder === 1);
    if (!phase1) throw new Error("Phase 1 not found");

    // 2. Initialize stats for each team (unchanged)
    const teamStats = new Map();
    tournament.teams.forEach((team) => {
      teamStats.set(team._id.toString(), {
        teamInfo: team,
        matchesPlayed: 0,
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
    const completedMatches = phase1.matches.filter(
      (m) => m.status === "Completed"
    );

    for (const match of completedMatches) {
      const team1Id = match.team1._id.toString();
      const team2Id = match.team2._id.toString();
      const stats1 = teamStats.get(team1Id);
      const stats2 = teamStats.get(team2Id);

      stats1.matchesPlayed += 1;
      stats2.matchesPlayed += 1;

      // --- REVISED GOAL CALCULATION LOGIC ---
      let matchGoalsForTeam1 = 0;
      let matchGoalsForTeam2 = 0;

      for (const subMatch of match.details.subMatches) {
        // Find which team player1 of the sub-match belongs to
        const isPlayer1OnTeam1 = match.team1.players.some((p) =>
          p._id.equals(subMatch.player1)
        );

        if (isPlayer1OnTeam1) {
          matchGoalsForTeam1 += subMatch.player1Score;
          matchGoalsForTeam2 += subMatch.player2Score;
        } else {
          matchGoalsForTeam1 += subMatch.player2Score;
          matchGoalsForTeam2 += subMatch.player1Score;
        }
      }

      stats1.goalsFor += matchGoalsForTeam1;
      stats1.goalsAgainst += matchGoalsForTeam2;
      stats2.goalsFor += matchGoalsForTeam2;
      stats2.goalsAgainst += matchGoalsForTeam1;
      // --- END OF REVISION ---

      // Point calculation logic remains the same
      if (match.winner === null) {
        stats1.draws += 1;
        stats2.draws += 1;
        stats1.points += 1;
        stats2.points += 1;
      } else if (match.winner.toString() === team1Id) {
        stats1.wins += 1;
        stats2.losses += 1;
        stats1.points += 3;
      } else {
        stats2.wins += 1;
        stats1.losses += 1;
        stats2.points += 3;
      }
    }

    // 4. Finalize calculations and sort (unchanged)
    const leaderboardArray = Array.from(teamStats.values());
    leaderboardArray.forEach((team) => {
      team.goalDifference = team.goalsFor - team.goalsAgainst;
    });

    leaderboardArray.sort((a, b) => {
      if (a.points !== b.points) return b.points - a.points;
      if (a.goalDifference !== b.goalDifference)
        return b.goalDifference - a.goalDifference;
      return b.goalsFor - a.goalsFor;
    });

    return leaderboardArray;
  } catch (error) {
    console.error("Error generating leaderboard:", error);
    return [];
  }
}

async function generatePhase2GauntletFixtures(tournamentId) {
  try {
    // 1. Get the final, sorted leaderboard from Phase 1
    const leaderboard = await generatePhase1Leaderboard(tournamentId);
    if (leaderboard.length < 4) {
      throw new Error(
        "Cannot generate gauntlet without at least 4 teams from Phase 1."
      );
    }

    const pointDistribution = [4, 3, 2, 1]; // 1st gets 4, 2nd gets 3, etc.

    for (let i = 0; i < leaderboard.length; i++) {
      const teamId = leaderboard[i].teamInfo._id;
      const points = pointDistribution[i];

      // Use findOneAndUpdate with 'upsert' to either create or update the CP document
      await ChampionshipPoint.findOneAndUpdate(
        { tournament: tournamentId, team: teamId }, // The query to find the document
        { $set: { phase1_points: points } }, // The update to apply
        { upsert: true, new: true } // Options: create if not found
      );
    }

    // 2. Identify the 3rd and 4th place teams
    const fourthPlaceTeam = leaderboard[3].teamInfo;
    const thirdPlaceTeam = leaderboard[2].teamInfo;

    // 3. Find the tournament and its Phase 2 document
    const tournament = await Tournament.findById(tournamentId);
    const phase1 = tournament.phases.find((p) => p.phaseOrder === 1);
    phase1.status = "Completed";
    await phase1.save();
    const phase2 = tournament.phases.find((p) => p.phaseOrder === 2);
    if (!phase2) throw new ApiError(404, "Phase 2 not found");

    // 4. Create the first gauntlet match
    const gauntletMatch1 = new Match({
      tournament: tournament._id,
      phase: phase2._id,
      round: "Gauntlet M1",
      team1: fourthPlaceTeam._id,
      team2: thirdPlaceTeam._id,
      status: "Unpublished",
    });

    await gauntletMatch1.save();

    // 5. Link the match and activate the phase
    phase2.matches.push(gauntletMatch1._id);
    phase2.status = "Active";
    await tournament.save();

    return { success: true, match: gauntletMatch1 };
  } catch (error) {
    console.error("Error generating Phase 2 fixtures:", error);
    return { success: false, error: error.message };
  }
}

//leaderboard after phase 2
export async function generateFinalSeedingLeaderboard(tournamentId) {
  try {
    // --- 1. Fetch all Championship Point data for the tournament ---
    // We populate 'team' to get the full team details (name, etc.)
    const cpData = await ChampionshipPoint.find({
      tournament: tournamentId,
    }).populate("team");

    if (cpData.length < 4) {
      throw new Error("Championship Point data is incomplete.");
    }

    // --- 2. Calculate the total points for each team ---
    const teamsWithTotalPoints = cpData.map((item) => ({
      teamInfo: item.team,
      phase1_points: item.phase1_points,
      phase2_points: item.phase2_points,
      total_points: item.phase1_points + item.phase2_points,
    }));

    // --- 3. Fetch the Phase 1 Leaderboard for the tie-breaker rule ---
    const phase1Leaderboard = await generatePhase1Leaderboard(tournamentId);

    // --- 4. Sort the teams based on the final rules ---
    teamsWithTotalPoints.sort((a, b) => {
      // a) Primary sort: by total_points (descending)
      if (a.total_points !== b.total_points) {
        return b.total_points - a.total_points;
      }

      // b) Tie-breaker: by Phase 1 rank
      // Find the index (rank) of each team in the Phase 1 leaderboard
      const rankA = phase1Leaderboard.findIndex((t) =>
        t.teamInfo._id.equals(a.teamInfo._id)
      );
      const rankB = phase1Leaderboard.findIndex((t) =>
        t.teamInfo._id.equals(b.teamInfo._id)
      );

      // The team with the lower index (better rank) wins the tie
      return rankA - rankB;
    });

    return teamsWithTotalPoints;
  } catch (error) {
    console.error("Error generating final seeding:", error);
    return [];
  }
}

//phase 3 fixture
export async function generatePhase3Fixtures(tournamentId) {
  try {
    // --- 1. Get the final sorted leaderboard ---
    const finalSeeding = await generateFinalSeedingLeaderboard(tournamentId);

    if (finalSeeding.length < 4) {
      throw new ApiError(
        404,
        "Cannot generate final phase without at least 4 ranked teams."
      );
    }

    // --- 2. Identify the top 4 teams ---
    const team1st = finalSeeding[0].teamInfo;
    const team2nd = finalSeeding[1].teamInfo;
    const team3rd = finalSeeding[2].teamInfo;
    const team4th = finalSeeding[3].teamInfo;

    // --- 3. Find the tournament and its Phase 3 document ---
    const tournament = await Tournament.findById(tournamentId);
    if (!tournament) throw new Error("Tournament not found");

    const phase3 = tournament.phases.find((p) => p.phaseOrder === 3);
    if (!phase3) throw new Error("Phase 3 not found for this tournament");

    // --- 4. Create the two semi-final matches ---
    const semiFinalMatchesToCreate = [
      {
        // 1st vs 4th
        tournament: tournament._id,
        phase: phase3._id,
        round: "Semi-Final",
        team1: team1st._id,
        team2: team4th._id,
        status: "Unpublished",
      },
      {
        // 2nd vs 3rd
        tournament: tournament._id,
        phase: phase3._id,
        round: "Semi-Final",
        team1: team2nd._id,
        team2: team3rd._id,
        status: "Unpublished",
      },
    ];

    const createdMatches = await Match.insertMany(semiFinalMatchesToCreate);
    const matchIds = createdMatches.map((m) => m._id);

    // --- 5. Link the matches and activate the phase ---
    phase3.matches.push(...matchIds);
    // phase3.status = "Active";
    await tournament.save();

    console.log(
      `Successfully generated Phase 3 fixtures for tournament ${tournamentId}`
    );
    return { success: true, matches: createdMatches };
  } catch (error) {
    console.error("Error generating Phase 3 fixtures:", error);
    return { success: false, error: error.message };
  }
}

const getPlayerStatusesForTournament = async (tournamentId) => {
  try {
    // 1. Find the tournament to get a list of all participating team IDs
    const tournament = await Tournament.findById(tournamentId).select("teams");
    if (!tournament) {
      return new ApiError(404, "Tournament not found.");
    }

    // 2. Find all players on those teams
    const teams = await Team.find({ _id: { $in: tournament.teams } }).select(
      "players"
    );
    const playerIds = teams.flatMap((team) => team.players);

    // 3. Fetch the status for all those players at once
    const playersWithStatus = await User.find({
      _id: { $in: playerIds },
    }).select("name isBanned banLiftDate activeYellowCards");

    // 4. Convert the array to an object (a map) for easy lookup on the frontend
    const statusMap = {};
    playersWithStatus.forEach((player) => {
      statusMap[player._id] = player;
    });

    return statusMap;
  } catch (error) {
    console.error("Error fetching player statuses:", error);
    throw new ApiError(500, "Server error.");
  }
};

export const TournamentServices = {
  createTournamentIntoDB,
  getAllTournamentsFromDB,
  getAllTournamentsForAdminFromDB,
  getSingleTournamentFromDB,
  updateTournamentStatusInDB,
  generateRoundRobinFixtures,
  getRegisteredTournamentsFromDB,
  generatePhase1Leaderboard,
  generatePhase2GauntletFixtures,
  generateFinalSeedingLeaderboard,
  generatePhase3Fixtures,
  getPlayerStatusesForTournament,
};
