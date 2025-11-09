import ApiError from "../../errors/ApiError.js";
import { CircuitPoint } from "../circuitPoint/circuitPoint.model.js";
import { League } from "../league/league.model.js";
import { generateLeagueLeaderboard } from "../league/league.services.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { User } from "../users/user.model.js";
import { Knockout } from "./knockout.model.js";

const generateGauntletKnockout = async (
  tournamentId,
  mainLeagueChampionIds
) => {
  try {
    // --- 1. Validation ---
    if (mainLeagueChampionIds.length !== 4) {
      throw new Error("Exactly 4 champion player IDs must be provided.");
    }

    // --- 2. Find the Underdog Contenders Automatically ---
    const tournament = await Tournament.findById(tournamentId).populate({
      path: "stages",
      match: { stageType: "League" },
    });

    const provingGroundsLeagueId = tournament.stages[0].stageData;
    const provingGroundsLeague = await League.findById(provingGroundsLeagueId);
    const leaderboard = await generateLeagueLeaderboard(provingGroundsLeagueId);

    if (leaderboard.length < 4) {
      throw new Error(
        "Proving Grounds league is not complete or has fewer than 4 players."
      );
    }
    const provingGroundsContenders = leaderboard
      .slice(0, 4)
      .map((p) => p.playerInfo);

    // --- 3. Seeding ---
    const seed1 = mainLeagueChampionIds[0];
    const seed2 = mainLeagueChampionIds[1];
    const seed3 = mainLeagueChampionIds[2];
    const seed4 = mainLeagueChampionIds[3];
    const seed5 = provingGroundsContenders[0]._id;
    const seed6 = provingGroundsContenders[1]._id;
    const seed7 = provingGroundsContenders[2]._id;
    const seed8 = provingGroundsContenders[3]._id;

    const participantIds = [
      seed1,
      seed2,
      seed3,
      seed4,
      seed5,
      seed6,
      seed7,
      seed8,
    ];

    // --- 4. Create the new Knockout document ---
    const newKnockout = new Knockout({
      name: `${tournament.name} - The Gauntlet of Eight`,
      tournament: tournament._id,
      size: 8,
      participants: participantIds,
      status: "Upcoming",
    });

    // --- 5. Create the Quarter-Final Match documents ---
    const quarterFinalMatchesToCreate = [
      {
        knockout: newKnockout._id,
        round: "Quarter-Final",
        team1: seed1,
        team2: seed8,
        status: "Unpublished",
      },
      {
        knockout: newKnockout._id,
        round: "Quarter-Final",
        team1: seed4,
        team2: seed5,
        status: "Unpublished",
      },
      {
        knockout: newKnockout._id,
        round: "Quarter-Final",
        team1: seed2,
        team2: seed7,
        status: "Unpublished",
      },
      {
        knockout: newKnockout._id,
        round: "Quarter-Final",
        team1: seed3,
        team2: seed6,
        status: "Unpublished",
      },
    ];
    const createdMatches = await Match.insertMany(quarterFinalMatchesToCreate);
    const matchIds = createdMatches.map((m) => m._id);

    // --- 6. Structure the knockout rounds ---
    newKnockout.rounds.push(
      { roundName: "Quarter-Finals", matches: matchIds },
      { roundName: "Semi-Finals", matches: [] },
      { roundName: "Finals", matches: [] }
    );
    await newKnockout.save();

    // --- 7. Create MatchHistory Records for the Quarter-Finals ---
    const historyLogsToCreate = [];
    for (const match of createdMatches) {
      historyLogsToCreate.push({
        player: match.team1,
        opponent: match.team2,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      });
      historyLogsToCreate.push({
        player: match.team2,
        opponent: match.team1,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      });
    }
    await MatchHistory.insertMany(historyLogsToCreate);

    // --- 8. Link the new Knockout stage to the main Tournament ---
    tournament.stages.push({
      stageOrder: 2,
      stageName: "The Gauntlet of Eight",
      stageType: "Knockout",
      stageData: newKnockout._id,
    });

    // --- 9. Mark Proving Grounds League as Completed ---
    provingGroundsLeague.status = "Completed";

    await provingGroundsLeague.save();
    await tournament.save();

    return { success: true, knockout: newKnockout };
  } catch (error) {
    console.error("Error generating 8-player knockout stage:", error);
    return { success: false, error: error.message };
  }
};

const getKnockoutById = async (knockoutId) => {
  const knockout = await Knockout.findById(knockoutId)
    .populate("participants", "name image inGameUserName")
    .populate({
      path: "rounds.matches",
      select: "-details -subMatchesGenerated",
      populate: {
        path: "team1 team2 winner",
        select: "name image inGameUserName",
        model: User,
      },
    })
    .populate({
      path: "rounds.series",
      populate: [
        {
          path: "player1 player2",
          select: "name image inGameUserName",
          model: User,
        },
        {
          path: "matches",
          select: "-details -subMatchesGenerated ",
          populate: {
            path: "team1 team2 winner",
            select: "name image inGameUserName",
            model: User,
          },
        },
      ],
    });
  return knockout;
};

const publishRounds = async (knockoutId, payload) => {
  const { round, roundStartDate, roundEndDate } = payload;

  // Basic validation
  if (!round || !roundStartDate || !roundEndDate) {
    throw new ApiError(
      400,
      "round, roundStartDate, and roundEndDate are required."
    );
  }

  // 2. Find the knockout to get its list of match IDs
  const knockout = await Knockout.findById(knockoutId).select("rounds");
  if (!knockout) {
    throw new ApiError(404, "Knockout not found.");
  }
  const knockoutMatchIds = knockout.rounds.find(
    (r) => r.roundName === round
  )?.matches;
  if (!knockoutMatchIds || knockoutMatchIds.length === 0) {
    throw new ApiError(400, `No matches found for round: ${round}`);
  }

  console.log(knockoutMatchIds);

  // 3. Use `updateMany` to update all relevant matches in one command
  const result = await Match.updateMany(
    {
      _id: { $in: knockoutMatchIds }, // Condition 1: Match must belong to this knockout
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

export async function generateChampionshipKnockout(tournamentId) {
  try {
    // 1. Get final seeding based on total Circuit Points
    const pointsData = await CircuitPoint.find({ tournament: tournamentId });
    if (
      pointsData.length < 4 ||
      pointsData.some((p) => p.phase1_points === 0 || p.phase2_points === 0)
    ) {
      throw new Error("Phase 1 or Phase 2 results are incomplete.");
    }

    // We trust the total_points field which was summed by the P2 engine
    const tournament = await Tournament.findById(tournamentId);
    const phase1LeagueStage = tournament.stages.find((s) => s.stageOrder === 1);
    const phase1Leaderboard = await generateLeagueLeaderboard(
      phase1LeagueStage.stageData
    );

    // Sort using total points, then Phase 1 rank
    pointsData.sort((a, b) => {
      if (a.total_points !== b.total_points)
        return b.total_points - a.total_points;
      const rankA = phase1Leaderboard.findIndex((p) =>
        p.playerInfo._id.equals(a.player)
      );
      const rankB = phase1Leaderboard.findIndex((p) =>
        p.playerInfo._id.equals(b.player)
      );
      return rankA - rankB;
    });

    const seed1 = pointsData[0].player;
    const seed2 = pointsData[1].player;
    const seed3 = pointsData[2].player;
    const seed4 = pointsData[3].player;
    const participantIds = [seed1, seed2, seed3, seed4];

    // 2. Create the Knockout document for Phase 3
    const newKnockout = new Knockout({
      name: "Champions Circuit - Phase 3 Playoff", // Specific name
      tournament: tournamentId,
      size: 4,
      participants: participantIds,
      status: "Upcoming",
    });

    // 3. Create the initial Page Playoff matches (A & B)
    const initialMatches = [
      {
        knockout: newKnockout._id,
        tournament: tournamentId,
        round: "Match A (1v2)",
        team1: seed1,
        team2: seed2,
        status: "Unpublished",
      },
      {
        knockout: newKnockout._id,
        tournament: tournamentId,
        round: "Match B (3v4)",
        team1: seed3,
        team2: seed4,
        status: "Unpublished",
      },
    ];
    const createdMatches = await Match.insertMany(initialMatches);

    // 4. Structure rounds and save Knockout
    newKnockout.rounds.push(
      {
        roundName: "Initial Matches",
        matches: createdMatches.map((m) => m._id),
      },
      { roundName: "Semi-Final", matches: [] }, // Match C
      { roundName: "Grand Final", matches: [] } // Match D
    );
    await newKnockout.save();

    // 5. Create initial MatchHistory
    const historyLogs = [];
    createdMatches.forEach((m) => {
      historyLogs.push({
        player: m.team1,
        opponent: m.team2,
        match: m._id,
        tournament: tournamentId,
        result: "Pending",
      });
      historyLogs.push({
        player: m.team2,
        opponent: m.team1,
        match: m._id,
        tournament: tournamentId,
        result: "Pending",
      });
    });
    await MatchHistory.insertMany(historyLogs);

    // 6. Link to Tournament
    tournament.stages.push({
      stageOrder: 3,
      stageName: "Phase 3: The Final Playoff",
      stageType: "Knockout",
      stageData: newKnockout._id,
    });
    await tournament.save();

    return { success: true, knockout: newKnockout };
  } catch (error) {
    console.error("Error generating Championship Knockout:", error);
    return { success: false, error: error.message };
  }
}

export const runPhase3PagePlayoffEngine = async (knockoutId) => {
  const knockout = await Knockout.findById(knockoutId);
  if (knockout.status === "Completed") return;
  const tournamentId = knockout.tournament;

  const completedMatches = await Match.find({
    knockout: knockout._id,
    status: "Completed",
  });

  // --- A) Generate Semi-Final (Match C) ---
  const matchA = completedMatches.find((m) => m.round === "Match A (1v2)");
  const matchB = completedMatches.find((m) => m.round === "Match B (3v4)");
  const existingSemi = await Match.findOne({
    knockout: knockout._id,
    round: "Match C (Semi-Final)",
  });

  if (matchA && matchB && !existingSemi) {
    console.log("Generating Page Playoff Semi-Final (Match C)...");
    const loserA = matchA.team1.equals(matchA.winner)
      ? matchA.team2
      : matchA.team1;
    const winnerB = matchB.winner;

    const semiFinal = await Match.create({
      knockout: knockout._id,
      tournament: tournamentId,
      round: "Match C (Semi-Final)",
      team1: loserA,
      team2: winnerB,
      status: "Unpublished",
    });
    knockout.rounds
      .find((r) => r.roundName === "Semi-Final")
      .matches.push(semiFinal._id);
    await knockout.save();

    // Create MatchHistory
    await MatchHistory.insertMany([
      {
        player: semiFinal.team1,
        opponent: semiFinal.team2,
        match: semiFinal._id,
        tournament: tournamentId,
        result: "Pending",
      },
      {
        player: semiFinal.team2,
        opponent: semiFinal.team1,
        match: semiFinal._id,
        tournament: tournamentId,
        result: "Pending",
      },
    ]);
  }

  // --- B) Generate Grand Final (Match D) ---
  const matchC = completedMatches.find(
    (m) => m.round === "Match C (Semi-Final)"
  );
  const existingFinal = await Match.findOne({
    knockout: knockout._id,
    round: "Match D (Grand Final)",
  });

  if (matchA && matchC && !existingFinal) {
    console.log("Generating Page Playoff Grand Final (Match D)...");
    const winnerA = matchA.winner;
    const winnerC = matchC.winner;

    const grandFinal = await Match.create({
      knockout: knockout._id,
      tournament: tournamentId,
      round: "Match D (Grand Final)",
      team1: winnerA,
      team2: winnerC,
      status: "Unpublished",
    });
    knockout.rounds
      .find((r) => r.roundName === "Grand Final")
      .matches.push(grandFinal._id);
    await knockout.save();

    // Create MatchHistory
    await MatchHistory.insertMany([
      {
        player: grandFinal.team1,
        opponent: grandFinal.team2,
        match: grandFinal._id,
        tournament: tournamentId,
        result: "Pending",
      },
      {
        player: grandFinal.team2,
        opponent: grandFinal.team1,
        match: grandFinal._id,
        tournament: tournamentId,
        result: "Pending",
      },
    ]);
  }

  // --- C) Complete Tournament after Grand Final (Match D) ---
  const matchD = completedMatches.find(
    (m) => m.round === "Match D (Grand Final)"
  );
  if (matchD) {
    console.log("Grand Final complete. Finalizing tournament...");
    knockout.status = "Completed";
    await knockout.save();
    await Tournament.findByIdAndUpdate(tournamentId, {
      status: "Completed",
      champion: matchD.winner,
    });
  }
};

export const KnockoutServices = {
  getKnockoutById,
  generateGauntletKnockout,
  publishRounds,
};
