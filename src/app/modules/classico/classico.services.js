import mongoose from "mongoose";
import cloudinary from "../../config/cloudinary.config.js";
import ApiError from "../../errors/ApiError.js";
import {
  awardTeamPoints,
  updateMatchHistoryHelper,
} from "../../helpers/match.helper.js";
import { ChampionshipPoint } from "../championshipPoint/championshipPoint.model.js";
import { League } from "../league/league.model.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { Series } from "../series/series.model.js";
import { Team } from "../team/team.model.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { Knockout } from "../knockout/knockout.model.js";

export const registerClassicoTeam = async (payload) => {
  if (payload.logo) {
    const { secure_url, public_id } = await cloudinary.uploader.upload(
      payload.logo,
      {
        upload_preset: "efootball",
        transformation: { fetch_format: "auto", quality: "auto" },
      },
    );
    payload.logo = { url: secure_url, public_id };
  }

  const team = await Team.create({
    ...payload,
    status: "Approved",
  });

  // Initialize ChampionshipPoint tracker
  await ChampionshipPoint.create({
    tournament: payload.tournament,
    team: team._id,
  });

  // Link to tournament
  await Tournament.findByIdAndUpdate(payload.tournament, {
    $push: { teams: team._id },
  });

  return team;
};

export const generatePhase1Fixtures = async (tournamentId) => {
  // 1. Fetch Tournament and Populate Teams to get the 'players' array
  const tournament = await Tournament.findById(tournamentId).populate("teams");

  if (!tournament || tournament.teams.length !== 2) {
    throw new Error("Tournament must have exactly 2 teams registered.");
  }

  const [teamA, teamB] = tournament.teams; // e.g., Real Madrid and Barca

  // 2. Create the League Document (The Stage Container)
  const league = await League.create({
    name: "Phase 1: The Grind (Scheveningen)",
    tournament: tournamentId,
    // Add all 16 players to the participants list
    participants: [...teamA.players, ...teamB.players],
    status: "Active",
    maxParticipants: [...teamA.players, ...teamB.players].length,
  });

  const matches = [];

  // 3. The Scheveningen Rotation Algorithm
  // We loop through 8 Rounds
  const totalRounds = league.maxParticipants / 2;
  for (let round = 0; round < totalRounds; round++) {
    for (let i = 0; i < totalRounds; i++) {
      // Player from Team A is fixed at index 'i'
      const playerA_Id = teamA.players[i];

      // Player from Team B rotates based on the round number
      // (i + round) % 8 ensures we cycle through 0-7 cleanly
      const teamB_Index = (i + round) % totalRounds;
      const playerB_Id = teamB.players[teamB_Index];

      matches.push({
        tournament: tournamentId,
        league: league._id,
        round: `Phase 1 - Round ${round + 1}`,

        // --- CONSTRAINT APPLIED ---
        // Storing Player IDs in team1/team2 fields as requested
        team1: playerA_Id,
        team2: playerB_Id,

        status: "Unpublished",
      });
    }
  }

  // 4. Insert All 64 Matches into Database
  const createdMatches = await Match.insertMany(matches);

  league.matches.push(...createdMatches.map((m) => m._id));
  league.status = "Active";
  await league.save();

  // 5. Create MatchHistory Logs (Crucial for Player Rankings)
  // We need 2 logs per match (one for each player) = 128 logs total
  const historyLogs = [];

  createdMatches.forEach((m) => {
    // Log for Player A
    historyLogs.push({
      player: m.team1, // Player A ID
      opponent: m.team2, // Player B ID
      match: m._id,
      tournament: tournamentId,
      result: "Pending",
    });

    // Log for Player B
    historyLogs.push({
      player: m.team2, // Player B ID
      opponent: m.team1, // Player A ID
      match: m._id,
      tournament: tournamentId,
      result: "Pending",
    });
  });

  await MatchHistory.insertMany(historyLogs);

  // 6. Link Stage to Tournament & Set Status to Live
  tournament.stages.push({
    stageOrder: 1,
    stageName: "Phase 1: The Grind",
    stageType: "League",
    stageData: league._id,
  });

  tournament.status = "Live";
  await tournament.save();

  return {
    success: true,
    message: "Phase 1 Generated Successfully",
    totalMatches: createdMatches.length,
  };
};

const finalizeTournamentIfComplete = async (tournamentId) => {
  // 1. Count any matches in this tournament that are NOT 'Completed'
  const pendingMatchesCount = await Match.countDocuments({
    tournament: tournamentId,
    status: { $ne: "Completed" },
  });

  // 2. If no matches are left, close the tournament
  if (pendingMatchesCount === 0) {
    await Tournament.findByIdAndUpdate(tournamentId, {
      status: "Completed",
    });

    console.log(`Tournament ${tournamentId} has been marked as Completed.`);

    // Optional: You could also trigger the final Championship Points
    // calculation here to ensure the winner is locked in.
  }
};

export const updateClassicoMatch = async (payload) => {
  try {
    // winnerId is optional: only required if scores are tied (Penalty Shootout)
    const { _id: matchId, team1_score, team2_score, winnerId } = payload;

    // 1. Fetch Match
    const match = await Match.findById(matchId).populate("series knockout");
    if (!match) throw new ApiError(404, "Match not found");
    // if (match.status === "Completed")
    //   throw new ApiError(400, "Match has already been completed");

    // 2. Determine the Winner
    let finalWinnerId;

    if (team1_score > team2_score) {
      finalWinnerId = match.team1; // Assuming Match uses player1/player2 for individual matches
    } else if (team2_score > team1_score) {
      finalWinnerId = match.team2;
    } else {
      // Scores are Tied: We rely on the penalty winner provided by Admin
      if (!winnerId) {
        throw new ApiError(
          400,
          "Match ended in a draw. Please provide a 'winnerId' for the penalty shootout winner.",
        );
      }
      finalWinnerId = winnerId;
    }

    // 3. Update Match Document
    match.team1_score = team1_score;
    match.team2_score = team2_score;
    match.status = "Completed";
    match.winner = finalWinnerId;

    // Check validation just in case
    if (!match.winner)
      throw new ApiError(400, "Winner could not be determined.");

    await match.save();

    // 4. Update Match History Logs (Win/Loss)
    const matchForHistory = {
      _id: match._id,
      winner: match.winner,
      player1: match.team1, // Mapping team1 -> player1 for the helper
      player2: match.team2, // Mapping team2 -> player2 for the helper
      team1_score: match.team1_score,
      team2_score: match.team2_score,
    };
    await updateMatchHistoryHelper(matchForHistory);

    // ======================================================
    //                 PROGRESSION ENGINE
    // ======================================================

    // --- PHASE 1: THE GRIND (Scheveningen) ---
    // Rule: Every win = 1 Point for the Team
    if (match.round.includes("Phase 1")) {
      const winnerTeam = await Team.findOne({
        tournament: match.tournament,
        players: finalWinnerId,
      });
      if (winnerTeam) {
        await awardTeamPoints(
          match.tournament,
          winnerTeam._id,
          1,
          "phase1_points",
        );
      }
    }

    // --- PHASE 2: NEMESIS DRAFT (Best of 3 Series) ---
    // Rule: Win Series = 3 Points for the Team
    else if (match.series) {
      const series = await Series.findById(match.series._id);

      // Update individual game count
      if (finalWinnerId.toString() === series.player1.toString())
        series.player1_wins++;
      else series.player2_wins++;

      // 2. DYNAMIC WIN THRESHOLD CALCULATION
      // Best of 3 needs 2 wins. Best of 5 needs 3 wins.
      // Formula: Math.ceil(TotalGames / 2)
      const winsNeeded = Math.ceil(series.bestOf / 2);

      const isSeriesWon =
        series.player1_wins >= winsNeeded || series.player2_wins >= winsNeeded;

      if (isSeriesWon) {
        // Series Complete
        series.status = "Completed";
        series.winner =
          series.player1_wins === 2 ? series.player1 : series.player2;

        // Award 3 Points to the Team
        const winnerTeam = await Team.findOne({
          tournament: match.tournament,
          players: series.winner,
        });
        await awardTeamPoints(
          match.tournament,
          winnerTeam._id,
          3,
          "phase2_points",
        );
      } else {
        // Series Continues -> Generate Next Game
        const nextGameNum = series.matches.length + 1;

        const nextMatch = await Match.create({
          tournament: match.tournament,
          series: series._id,
          knockout: match.knockout, // Link to Phase 2 stage
          round: `Nemesis Series - Game ${nextGameNum}`,
          team1: series.player1,
          team2: series.player2,
          status: "Unpublished",
        });

        series.matches.push(nextMatch._id);

        // Generate History for the new game
        await MatchHistory.insertMany([
          {
            player: nextMatch.team1,
            opponent: nextMatch.team2,
            match: nextMatch._id,
            tournament: match.tournament,
            result: "Pending",
          },
          {
            player: nextMatch.team2,
            opponent: nextMatch.team1,
            match: nextMatch._id,
            tournament: match.tournament,
            result: "Pending",
          },
        ]);
      }
      await series.save();
    }

    // --- PHASE 3: IRON CURTAIN (Blind Pick) ---
    // Rule: Win = 2 Points. Rank 8 beating Rank 1 = +5 Bonus Points.
    else if (match.round.includes("Iron Curtain")) {
      let pointsToAdd = 2; // Base win points

      const tournament = await Tournament.findById(match.tournament);
      const winnerTeam = await Team.findOne({
        tournament: match.tournament,
        players: finalWinnerId,
      });

      const loserId = match.team1.equals(finalWinnerId)
        ? match.team2
        : match.team1;
      const loserTeam = await Team.findOne({
        tournament: match.tournament,
        players: loserId,
      });

      // Determine which team is currently trailing (Losing Team in overall points)
      const pointsData = await ChampionshipPoint.find({
        tournament: match.tournament,
      });
      const rmaPoints = pointsData.find((p) =>
        p.team.equals(tournament.teams[0]),
      ).total_points;
      const barcaPoints = pointsData.find((p) =>
        p.team.equals(tournament.teams[1]),
      ).total_points;

      const isWinnerCurrentlyLosing =
        (winnerTeam.name.includes("Madrid") && rmaPoints < barcaPoints) ||
        (winnerTeam.name.includes("Barcelona") && barcaPoints < rmaPoints);

      // Identify metadata key for bonus tracking
      const bonusKey = winnerTeam.name.includes("Madrid")
        ? "rmaBonusClaimed"
        : "barcaBonusClaimed";

      if (
        winnerTeam &&
        loserTeam &&
        !tournament.metadata[bonusKey] &&
        isWinnerCurrentlyLosing
      ) {
        const winnerRank = winnerTeam.playerRankings.find((r) =>
          r.player.equals(finalWinnerId),
        )?.rank;
        const loserRank = loserTeam.playerRankings.find((r) =>
          r.player.equals(loserId),
        )?.rank;

        // --- NEW TACTICAL BONUS LOGIC ---
        // Condition: Winner (Losing Team) Rank 6-8 beats Loser (Winning Team) Rank 1-3
        const isWinnerLowRank = winnerRank >= 6 && winnerRank <= 8;
        const isLoserHighRank = loserRank >= 1 && loserRank <= 3;

        if (isWinnerLowRank && isLoserHighRank) {
          pointsToAdd += 3; // The +5 Bonus
          tournament.metadata[bonusKey] = true; // Mark as "Used Up"
          await tournament.save();
        }
      }

      await awardTeamPoints(
        match.tournament,
        winnerTeam._id,
        pointsToAdd,
        "phase3_points",
      );
      await finalizeTournamentIfComplete(match.tournament);
    }

    return { success: true, match };
  } catch (error) {
    console.error("Error updating Classico match:", error);
    throw new ApiError(500, "Failed to update Classico match.");
  }
};

export const preparePhase2Draft = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId).populate("teams");
  const points = await ChampionshipPoint.find({
    tournament: tournamentId,
  }).sort({ total_points: 1 });

  // 1. Assign Draft Rights to the loser (lowest points)
  const losingTeamId = points[0].team;
  await Team.updateMany(
    { tournament: tournamentId },
    { hasDraftRights: false },
  );
  await Team.findByIdAndUpdate(losingTeamId, { hasDraftRights: true });

  // 2. Calculate Individual Ranks (1-8) for Phase 2/3 Strategy
  for (const team of tournament.teams) {
    // Get win counts for every player on this team
    const playerObjectIds = team.players.map(
      (p) => new mongoose.Types.ObjectId(p),
    );
    const stats = await MatchHistory.aggregate([
      {
        $match: {
          tournament: new mongoose.Types.ObjectId(tournamentId),
          player: { $in: playerObjectIds },
          result: "Win",
        },
      },
      { $group: { _id: "$player", wins: { $count: {} } } },
      { $sort: { wins: -1 } }, // High wins = Rank 1
    ]);

    // Map stats back to the Team schema
    const rankings = team.players.map((playerId) => {
      const stat = stats.find((s) => s._id.equals(playerId));
      return { player: playerId, wins: stat ? stat.wins : 0 };
    });

    // Sort and assign Rank (1 is best)
    rankings.sort((a, b) => b.wins - a.wins);
    rankings.forEach((r, idx) => (r.rank = idx + 1));

    await Team.findByIdAndUpdate(team._id, { playerRankings: rankings });
  }
};

export const startPhase2NemesisDraft = async (payload) => {
  // 1. Start a Session for Atomicity (All or Nothing)
  const { tournamentId, draftingTeamId, draftingTeamOrderedIds } = payload;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const draftSize = draftingTeamOrderedIds.length;

    // Basic validation: Cannot have empty draft
    if (draftSize === 0) {
      throw new Error("Draft list cannot be empty.");
    }

    // 2. Fetch Tournament Data
    const tournament = await Tournament.findById(tournamentId)
      .populate("teams")
      .session(session);

    // Safety Check: Ensure Phase 2 hasn't already started
    const existingPhase2 = tournament.stages.find((s) =>
      s.stageName.includes("Nemesis Draft"),
    );
    if (existingPhase2) {
      throw new Error("Phase 2 has already been generated!");
    }

    // Identify Teams
    const drafterTeam = tournament.teams.find((t) =>
      t._id.equals(draftingTeamId),
    );
    const targetTeam = tournament.teams.find(
      (t) => !t._id.equals(draftingTeamId),
    );

    if (!drafterTeam.hasDraftRights) {
      throw new Error("This team does not have draft rights.");
    }

    // --- DYNAMIC SIZE VALIDATION ---
    // Ensure the captain submitted a full roster matching the opponent's size
    // (e.g., If it's 14v14, you must draft all 14 spots)
    if (draftSize !== targetTeam.players.length) {
      throw new Error(
        `Invalid draft size. You submitted ${draftSize} players, but the opponent has ${targetTeam.players.length}.`,
      );
    }

    // Validate: Ensure submitted players actually belong to the drafter team
    const validPlayerIds = drafterTeam.players.map((p) => p.toString());
    const allValid = draftingTeamOrderedIds.every((id) =>
      validPlayerIds.includes(id.toString()),
    );
    if (!allValid)
      throw new Error("Submission contains players not on your roster.");

    // 3. Prepare Target Lineup (Sorted by Rank 1 to N)
    const targetLineup = targetTeam.playerRankings
      .sort((a, b) => a.rank - b.rank)
      .map((entry) => entry.player);

    // 4. Create Stage Container
    const knockout = new Knockout({
      name: "Phase 2: Nemesis Draft",
      tournament: tournamentId,
      size: draftSize, // Dynamic Size (e.g., 2, 8, 14)
      status: "Active",
      rounds: [],
    });
    const savedKnockout = await knockout.save({ session });

    // 5. Generate Series Objects (Dynamic Loop)
    const seriesDocs = [];
    for (let i = 0; i < draftSize; i++) {
      seriesDocs.push({
        knockout: savedKnockout._id,
        roundName: `Duel ${i + 1} (vs Seed ${i + 1})`,
        player1: draftingTeamOrderedIds[i], // Captain's Choice
        player2: targetLineup[i], // Fixed Seed
        bestOf: 3,
        status: "Upcoming",
      });
    }

    // Insert Series
    const createdSeries = await Series.insertMany(seriesDocs, { session });

    // 6. Update Knockout with Series
    savedKnockout.rounds.push({
      roundName: "The Nemesis Duels",
      series: createdSeries.map((s) => s._id),
      matches: [],
    });
    await savedKnockout.save({ session });

    // 7. Generate "Game 1" for all Series
    const matchDocs = [];

    createdSeries.forEach((series) => {
      matchDocs.push({
        tournament: tournamentId,
        series: series._id,
        knockout: savedKnockout._id,
        round: `${series.roundName} - Game 1`,
        team1: series.player1,
        team2: series.player2,
        status: "Unpublished",
      });
    });

    const createdMatches = await Match.insertMany(matchDocs, { session });

    // 8. Generate History & Link Matches
    const historyDocs = [];

    for (const match of createdMatches) {
      historyDocs.push({
        player: match.team1,
        opponent: match.team2,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      });
      historyDocs.push({
        player: match.team2,
        opponent: match.team1,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      });

      await Series.findByIdAndUpdate(match.series, {
        $push: { matches: match._id },
      }).session(session);
    }

    await MatchHistory.insertMany(historyDocs, { session });

    // 9. Link to Tournament
    tournament.stages.push({
      stageOrder: 2,
      stageName: "Phase 2: Nemesis Draft",
      stageType: "Knockout",
      stageData: savedKnockout._id,
    });
    await tournament.save({ session });

    // 10. COMMIT TRANSACTION
    await session.commitTransaction();
    session.endSession();

    return { success: true, count: draftSize, series: createdSeries };
  } catch (error) {
    // 11. ROLLBACK ON ERROR
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

export const submitPhase3List = async (payload) => {
  const { tournamentId, teamId, orderedPlayerList } = payload;
  const tournament = await Tournament.findById(tournamentId).populate("teams");
  if (!tournament) throw new Error("Tournament not found");

  const team = await Team.findById(teamId);

  // DYNAMIC VALIDATION: Must submit exactly the number of players on the roster
  if (orderedPlayerList.length !== team.players.length) {
    throw new Error(`You must submit exactly ${team.players.length} players.`);
  }

  // Identify if this is Team 1 or Team 2 in the metadata
  const isTeam1 = tournament.teams[0]._id.equals(teamId);

  if (isTeam1) {
    tournament.metadata.phase3Submissions.team1List = orderedPlayerList;
  } else {
    tournament.metadata.phase3Submissions.team2List = orderedPlayerList;
  }
  team.teamSubmitted = true;
  await team.save();
  await tournament.save();
  return {
    message: "List submitted successfully. Waiting for opponent's list.",
  };
};

export const generateIronCurtainMatches = async (tournamentId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Fetch the tournament with lists populated in metadata
    const tournament = await Tournament.findById(tournamentId).session(session);

    if (!tournament) throw new Error("Tournament not found.");

    const { team1List, team2List } = tournament.metadata.phase3Submissions;

    // Validate that both teams have submitted their lists
    if (
      !team1List ||
      !team2List ||
      team1List.length === 0 ||
      team2List.length === 0
    ) {
      throw new Error(
        "Cannot generate Phase 3: One or both teams have not submitted their rosters.",
      );
    }

    if (team1List.length !== team2List.length) {
      throw new Error("Roster size mismatch between Team 1 and Team 2.");
    }

    const listSize = team1List.length;

    // 2. Create the Stage Container (Knockout model)
    const knockout = new Knockout({
      name: "Phase 3: Iron Curtain",
      tournament: tournamentId,
      size: listSize,
      status: "Active",
      rounds: [],
    });

    const savedKnockout = await knockout.save({ session });

    // 3. Prepare the 1v1 Matches (Index-to-Index pairing)
    const matchDocs = [];
    for (let i = 0; i < listSize; i++) {
      matchDocs.push({
        tournament: tournamentId,
        knockout: savedKnockout._id,
        round: `Iron Curtain - Duel ${i + 1}`,
        // Using team1 and team2 fields to store Player IDs
        team1: team1List[i],
        team2: team2List[i],
        // Unpublished means matches are hidden from public view until Admin Reveal
        status: "Unpublished",
      });
    }

    const createdMatches = await Match.insertMany(matchDocs, { session });

    // 4. Update the Knockout Stage with the Round information
    savedKnockout.rounds.push({
      roundName: "The Blind Reveal",
      matches: createdMatches.map((m) => m._id),
    });
    await savedKnockout.save({ session });

    // 5. Generate MatchHistory Logs (2 logs per match)
    const historyDocs = [];
    createdMatches.forEach((m) => {
      // Log for Player from Team 1
      historyDocs.push({
        player: m.team1,
        opponent: m.team2,
        match: m._id,
        tournament: tournamentId,
        result: "Pending",
      });
      // Log for Player from Team 2
      historyDocs.push({
        player: m.team2,
        opponent: m.team1,
        match: m._id,
        tournament: tournamentId,
        result: "Pending",
      });
    });

    await MatchHistory.insertMany(historyDocs, { session });

    // 6. Link the newly created stage to the Tournament document
    tournament.stages.push({
      stageOrder: 3,
      stageName: "Phase 3: Iron Curtain",
      stageType: "Knockout",
      stageData: savedKnockout._id,
    });

    // Lock the submission so captains cannot change their lists after reveal
    tournament.metadata.phase3Submissions.isLocked = true;

    await tournament.save({ session });

    // 7. Commit all changes to the Database
    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      message: "Iron Curtain Matches Generated Successfully",
      matchCount: createdMatches.length,
    };
  } catch (error) {
    // If any step fails, rollback all changes made during this session
    await session.abortTransaction();
    session.endSession();
    console.error("Iron Curtain Generation Failed:", error.message);
    throw error;
  }
};

//leaderboards

//phase 1 team leaderboard
export const getPhase1TeamLeaderboards = async (tournamentId) => {
  const results = await MatchHistory.aggregate([
    // 1. Filter by Tournament and ensure the match is played
    {
      $match: {
        tournament: new mongoose.Types.ObjectId(tournamentId),
        result: { $in: ["Win", "Loss", "Draw"] },
      },
    },

    // 2. Join with the 'matches' collection to check the stage
    {
      $lookup: {
        from: "matches",
        localField: "match",
        foreignField: "_id",
        as: "matchInfo",
      },
    },
    { $unwind: "$matchInfo" },

    // 3. CRITICAL: Filter only matches that have the 'league' field
    // This effectively isolates Phase 1 matches
    {
      $match: {
        "matchInfo.league": { $exists: true, $ne: null },
      },
    },

    // 4. Join with 'teams' to group players
    {
      $lookup: {
        from: "teams",
        localField: "player",
        foreignField: "players",
        as: "teamInfo",
      },
    },
    { $unwind: "$teamInfo" },
    {
      $match: {
        "teamInfo.tournament": new mongoose.Types.ObjectId(tournamentId),
      },
    },

    // 5. Project the necessary fields for calculation
    {
      $project: {
        teamName: "$teamInfo.name",
        teamLogo: "$teamInfo.logo.url",
        player: 1,
        isWin: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] },
        isLoss: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] },
        gf: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
          ],
        },
        ga: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
          ],
        },
      },
    },

    // 6. Group by Player to sum stats
    {
      $group: {
        _id: { team: "$teamName", player: "$player" },
        logo: { $first: "$teamLogo" },
        wins: { $sum: "$isWin" },
        losses: { $sum: "$isLoss" },
        gf: { $sum: "$gf" },
        ga: { $sum: "$ga" },
      },
    },

    // 7. Get Player Details
    {
      $lookup: {
        from: "users",
        localField: "_id.player",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },

    // 8. Final Grouping by Team
    {
      $group: {
        _id: "$_id.team",
        teamLogo: { $first: "$logo" },
        players: {
          $push: {
            id: "$_id.player",
            username: "$profile.inGameUserName",
            name: "$profile.name",
            image: "$profile.image.url",
            avatar: "$profile.avatar.url",
            wins: "$wins",
            losses: "$losses",
            gf: "$gf",
            ga: "$ga",
            gd: { $subtract: ["$gf", "$ga"] },
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return results;
};

//overall leaderboard team separated
export const getOverallTeamLeaderboards = async (tournamentId) => {
  const results = await MatchHistory.aggregate([
    {
      $match: {
        tournament: new mongoose.Types.ObjectId(tournamentId),
        result: { $in: ["Win", "Loss", "Draw"] }, // Include all completed matches
      },
    },
    // Join with Match to get scores
    {
      $lookup: {
        from: "matches",
        localField: "match",
        foreignField: "_id",
        as: "matchInfo",
      },
    },
    { $unwind: "$matchInfo" },
    // Join with Team to associate players
    {
      $lookup: {
        from: "teams",
        localField: "player",
        foreignField: "players",
        as: "teamInfo",
      },
    },
    { $unwind: "$teamInfo" },
    {
      $match: {
        "teamInfo.tournament": new mongoose.Types.ObjectId(tournamentId),
      },
    },
    {
      $project: {
        teamName: "$teamInfo.name",
        teamLogo: "$teamInfo.logo.url",
        player: 1,
        isWin: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] },
        isLoss: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] },
        gf: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
          ],
        },
        ga: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: { team: "$teamName", player: "$player" },
        logo: { $first: "$teamLogo" },
        wins: { $sum: "$isWin" },
        losses: { $sum: "$isLoss" },
        gf: { $sum: "$gf" },
        ga: { $sum: "$ga" },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id.player",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
    {
      $group: {
        _id: "$_id.team",
        teamLogo: { $first: "$logo" },
        players: {
          $push: {
            id: "$_id.player",
            username: "$profile.inGameUserName",
            name: "$profile.name",
            image: "$profile.image.url",
            avatar: "$profile.avatar.url",
            wins: "$wins",
            losses: "$losses",
            gf: "$gf",
            ga: "$ga",
            gd: { $subtract: ["$gf", "$ga"] },
          },
        },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  return results;
};

//overall leaderboard merged (no team separation)
export const getGlobalPlayerLeaderboardclassico = async (tournamentId) => {
  return await MatchHistory.aggregate([
    {
      $match: {
        tournament: new mongoose.Types.ObjectId(tournamentId),
        result: { $in: ["Win", "Loss", "Draw"] },
      },
    },
    // Join with Match to get goals
    {
      $lookup: {
        from: "matches",
        localField: "match",
        foreignField: "_id",
        as: "matchInfo",
      },
    },
    { $unwind: "$matchInfo" },
    // Join with Team to know which team the player belongs to
    {
      $lookup: {
        from: "teams",
        localField: "player",
        foreignField: "players",
        as: "teamInfo",
      },
    },
    { $unwind: "$teamInfo" },
    // Only players in this tournament
    {
      $match: {
        "teamInfo.tournament": new mongoose.Types.ObjectId(tournamentId),
      },
    },
    {
      $project: {
        player: 1,
        teamName: "$teamInfo.name",
        teamLogo: "$teamInfo.logo.url",
        isWin: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] },
        isLoss: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] },
        isDraw: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] },
        gf: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
          ],
        },
        ga: {
          $cond: [
            { $eq: ["$player", "$matchInfo.team1"] },
            { $ifNull: ["$matchInfo.team2_score", 0] },
            { $ifNull: ["$matchInfo.team1_score", 0] },
          ],
        },
      },
    },
    {
      $group: {
        _id: "$player",
        team: { $first: "$teamName" },
        logo: { $first: "$teamLogo" },
        mp: { $sum: 1 }, // Matches Played
        wins: { $sum: "$isWin" },
        losses: { $sum: "$isLoss" },
        draws: { $sum: "$isDraw" },
        gf: { $sum: "$gf" },
        ga: { $sum: "$ga" },
      },
    },
    {
      $addFields: {
        gd: { $subtract: ["$gf", "$ga"] },
      },
    },
    // Rank by Wins (Primary), then GD (Secondary)
    { $sort: { wins: -1, gd: -1, gf: -1 } },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
    {
      $project: {
        _id: 1,
        username: "$profile.inGameUserName",
        name: "$profile.name",
        image: "$profile.image.url",
        team: 1,
        logo: 1,
        mp: 1,
        wins: 1,
        losses: 1,
        draws: 1,
        gf: 1,
        ga: 1,
        gd: 1,
      },
    },
  ]);
};

//championship points leaderboard (team standings based on points)
// export const getChampionshipLeaderboard = async (tournamentId) => {
//   return await ChampionshipPoint.aggregate([
//     {
//       $match: {
//         tournament: new mongoose.Types.ObjectId(tournamentId),
//       },
//     },
//     // 1. Group by Team and sum points from all phases
//     {
//       $group: {
//         _id: "$team",
//         phase1: { $sum: "$phase1_points" },
//         phase2: { $sum: "$phase2_points" },
//         phase3: { $sum: "$phase3_points" },
//         total: { $sum: "$total_points" },
//       },
//     },
//     // 2. Sort by Total Points (Primary)
//     { $sort: { total: -1 } },
//     // 3. Join with Team collection for name and logo
//     {
//       $lookup: {
//         from: "teams",
//         localField: "_id",
//         foreignField: "_id",
//         as: "teamData",
//       },
//     },
//     { $unwind: "$teamData" },
//     {
//       $project: {
//         _id: 1,
//         teamName: "$teamData.name",
//         teamLogo: "$teamData.logo.url",
//         phase1: 1,
//         phase2: 1,
//         phase3: 1,
//         total: 1,
//       },
//     },
//   ]);
// };
export const getChampionshipLeaderboard = async (tournamentId) => {
  return await MatchHistory.aggregate([
    { $match: { tournament: new mongoose.Types.ObjectId(tournamentId) } },

    // 1. Link to Matches to identify Phases
    {
      $lookup: {
        from: "matches",
        localField: "match",
        foreignField: "_id",
        as: "m",
      },
    },
    { $unwind: "$m" },

    // 2. Assign Points per Phase logic
    {
      $project: {
        player: 1,
        result: 1,
        seriesId: "$m.series",
        // Phase 1: Check for league field
        p1: {
          $cond: [
            {
              $and: [{ $gt: ["$m.league", null] }, { $eq: ["$result", "Win"] }],
            },
            1,
            0,
          ],
        },
        // Phase 3: Check round name strictly
        p3: {
          $cond: [
            {
              $and: [
                {
                  $regexMatch: {
                    input: "$m.round",
                    regex: "Iron Curtain",
                    options: "i",
                  },
                },
                { $eq: ["$result", "Win"] },
              ],
            },
            2,
            0,
          ],
        },
      },
    },

    // 3. Group by Player + Series to catch Phase 2 (3 pts)
    {
      $group: {
        _id: { player: "$player", series: "$seriesId" },
        p1Total: { $sum: "$p1" },
        p3Total: { $sum: "$p3" },
      },
    },

    // 4. Calculate Series Wins (Phase 2)
    {
      $lookup: {
        from: "series",
        localField: "_id.series",
        foreignField: "_id",
        as: "s",
      },
    },
    {
      $addFields: {
        p2Total: {
          $cond: [
            {
              $and: [
                { $gt: [{ $size: "$s" }, 0] },
                { $eq: ["$_id.player", { $arrayElemAt: ["$s.winner", 0] }] },
              ],
            },
            3,
            0,
          ],
        },
      },
    },

    // 5. Aggregate back to individual players
    {
      $group: {
        _id: "$_id.player",
        p1: { $sum: "$p1Total" },
        p2: { $sum: "$p2Total" },
        p3: { $sum: "$p3Total" },
        playerTotal: { $sum: { $add: ["$p1Total", "$p2Total", "$p3Total"] } },
      },
    },

    // 6. Join User and Team info
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "profile",
      },
    },
    { $unwind: "$profile" },
    {
      $lookup: {
        from: "teams",
        localField: "_id",
        foreignField: "players",
        as: "team",
      },
    },
    { $unwind: "$team" },
    {
      $match: { "team.tournament": new mongoose.Types.ObjectId(tournamentId) },
    },

    // 7. Group by Team to create the Nested Structure
    {
      $group: {
        _id: "$team.name",
        teamLogo: { $first: "$team.logo.url" },
        teamP1: { $sum: "$p1" },
        teamP2: { $sum: "$p2" },
        teamP3: { $sum: "$p3" },
        teamGrandTotal: { $sum: "$playerTotal" },
        players: {
          $push: {
            username: "$profile.inGameUserName",
            p1: "$p1",
            p2: "$p2",
            p3: "$p3",
            image: "$profile.image.url",
            total: "$playerTotal",
          },
        },
      },
    },
    { $sort: { teamGrandTotal: -1 } },
  ]);
};

export const classicoServices = {
  registerClassicoTeam,
  generatePhase1Fixtures,
  updateClassicoMatch,
  preparePhase2Draft,
  startPhase2NemesisDraft,
  submitPhase3List,
  generateIronCurtainMatches,
  getPhase1TeamLeaderboards,
  getOverallTeamLeaderboards,
  getGlobalPlayerLeaderboardclassico,
  getChampionshipLeaderboard,
};
