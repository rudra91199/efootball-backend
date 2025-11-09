import ApiError from "../../errors/ApiError.js";
import { ChampionshipPoint } from "../championshipPoint/championshipPoint.model.js";
import { Knockout } from "../knockout/knockout.model.js";
import { runPhase3PagePlayoffEngine } from "../knockout/knockout.services.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { runPhase2GauntletEngine } from "../series/series.service.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { generatePhase1Leaderboard } from "../tournaments/tournament.services.js";
import { User } from "../users/user.model.js";
import { Match } from "./match.model.js";

const submitSquadAndGenerateSubMatches = async (
  matchId,
  submittingCaptainId,
  players
) => {
  try {
    // --- Step 1: Get Data from the Request ---
    // Get the match ID from the URL parameters (e.g., /api/matches/60b8f9.../squad)

    // Get the user ID of the person submitting the form (from your authentication middleware)

    // Get the squad data from the request body
    const { star_player, first_day_player, late_night_player, tournament } =
      players;

    // --- Step 2: Vigorously Validate the Submission ---

    // 2a. Find the match and populate the team data to access captain and player info
    const match = await Match.findById(matchId)
      .populate({
        path: "team1",
        populate: { path: "players captain" }, // Populate players within the team
      })
      .populate({
        path: "team2",
        populate: { path: "players captain" }, // Populate players within the team
      });

    if (!match) {
      return res.status(404).json({ message: "Match not found." });
    }

    // 2b. Determine which team the submitting user is the captain of
    let submittingTeamKey; // This will be 'team1' or 'team2'
    let submittingTeamObject;

    if (match.team1.captain._id.toString() === submittingCaptainId) {
      submittingTeamKey = "team1";
      submittingTeamObject = match.team1;
    } else if (match.team2.captain._id.toString() === submittingCaptainId) {
      submittingTeamKey = "team2";
      submittingTeamObject = match.team2;
    } else {
      // If the user is not a captain of either team, they are not authorized
      return res
        .status(403)
        .json({ message: "Forbidden: You are not a captain for this match." });
    }

    // 2c. Check if this team has already submitted their squad
    if (
      match[`${submittingTeamKey}_squad`] &&
      match[`${submittingTeamKey}_squad`].star_player
    ) {
      return res.status(400).json({
        message: "Your squad has already been submitted for this match.",
      });
    }

    // 2d. Validate the submitted player IDs
    const submittedPlayerIds = [
      star_player,
      first_day_player,
      late_night_player,
    ];
    const teamPlayerIds = submittingTeamObject.players.map((p) =>
      p._id.toString()
    );

    // Check if all submitted players are actually on the team
    const allPlayersAreValid = submittedPlayerIds.every((id) =>
      teamPlayerIds.includes(id)
    );
    if (!allPlayersAreValid) {
      return res.status(400).json({
        message:
          "Invalid submission: One or more players are not on your team.",
      });
    }

    // --- Step 3: Save the Squad Submission ---

    // Create the squad object
    const newSquadSubmission = {
      star_player,
      first_day_player,
      late_night_player,
    };

    // Assign it to the correct team's squad field in the match document
    match[`${submittingTeamKey}_squad`] = newSquadSubmission;

    // --- Step 4: Check if Both Squads Are Now Submitted ---

    let subMatchesGenerated = false;
    // This check is the main trigger for the automatic generation
    if (
      match.team1_squad &&
      match.team1_squad.star_player &&
      match.team2_squad &&
      match.team2_squad.star_player
    ) {
      console.log("Both squads are in! Generating sub-matches");

      // --- Step 5: Generate the Sub-Matches Based on Roles ---

      const subMatches = [
        {
          matchType: "Star Player",
          player1: match.team1_squad.star_player,
          player2: match.team2_squad.star_player,
          player1Score: null, // To be filled in by an admin later
          player2Score: null,
          winner: null,
        },
        {
          matchType: "First Day Player",
          player1: match.team1_squad.first_day_player,
          player2: match.team2_squad.first_day_player,
          player1Score: null, // To be filled in by an admin later
          player2Score: null,
          winner: null,
        },
        {
          matchType: "Late Night Player",
          player1: match.team1_squad.late_night_player,
          player2: match.team2_squad.late_night_player,
          player1Score: null, // To be filled in by an admin later
          player2Score: null,
          winner: null,
        },
      ];

      // Assign the generated array to the match's details field
      match.details = { subMatches: subMatches };
      subMatchesGenerated = true;

      for (const subMatch of subMatches) {
        const { player1, player2 } = subMatch;

        // Create the log object for player 1's perspective
        const player1Log = {
          player: player1,
          match: match._id,
          opponent: player2,
          matchDate: match.roundStartDate, // Get the date from the main match document
          result: "Pending", // The result is pending until the match is played
          tournament: tournament,
        };

        // Create the log object for player 2's perspective
        const player2Log = {
          player: player2,
          match: match._id,
          opponent: player1,
          matchDate: match.roundStartDate,
          result: "Pending",
          tournament: tournament,
        };

        // Use MongoDB's $push operator to add the new log to each player's history array
        const createMatchHistoryForPlayer1 = await MatchHistory.create(
          player1Log
        );
        await User.findByIdAndUpdate(player1, {
          $push: { matchHistory: createMatchHistoryForPlayer1._id },
        });
        const createMatchHistoryForPlayer2 = await MatchHistory.create(
          player2Log
        );
        await User.findByIdAndUpdate(player2, {
          $push: { matchHistory: createMatchHistoryForPlayer2._id },
        });
      }
    }

    // --- Step 6: Save All Changes to the Database and Send Response ---

    const updatedMatch = await match.save();

    let responseMessage = "Squad submitted successfully.";
    if (subMatchesGenerated) {
      responseMessage =
        "Final squad submitted and sub-matches have been generated!";
    }

    return {
      message: responseMessage,
      match: updatedMatch,
    };
  } catch (error) {
    // Generic error handler for any other issues
    console.error("Error in submitSquad:", error);
  }
};

const generateOrUpdateSubMatches = async (matchId) => {
  const match = await Match.findById(matchId);

  // --- 1. CLEANUP PHASE ---
  // Check if there are existing sub-matches that need to be deleted first.
  if (match.details?.subMatches?.length > 0) {
    console.log(`Cleaning up old sub-matches for match: ${matchId}`);

    // Find all old MatchHistory documents linked to this match
    const oldHistoryDocs = await MatchHistory.find({ match: match._id });
    const oldHistoryIds = oldHistoryDocs.map((doc) => doc._id);

    // Collect all unique player IDs from the old sub-matches
    const oldPlayerIds = new Set();
    match.details.subMatches.forEach((sm) => {
      oldPlayerIds.add(sm.player1.toString());
      oldPlayerIds.add(sm.player2.toString());
    });

    // A) Delete the old MatchHistory documents
    if (oldHistoryIds.length > 0) {
      await MatchHistory.deleteMany({ _id: { $in: oldHistoryIds } });

      // B) Use $pull to remove the old references from all affected players
      await User.updateMany(
        { _id: { $in: [...oldPlayerIds] } },
        { $pull: { matchHistory: { $in: oldHistoryIds } } }
      );
    }
  }

  // --- 2. GENERATION PHASE ---
  // Check if both teams have submitted their squads
  if (match.team1_squad?.star_player && match.team2_squad?.star_player) {
    console.log(
      `Both squads are in for match ${matchId}. Generating new sub-matches.`
    );

    // A) Create the new sub-match objects
    const newSubMatches = [
      {
        matchType: "Star Player",
        player1: match.team1_squad.star_player,
        player2: match.team2_squad.star_player,
      },
      {
        matchType: "First Day Player",
        player1: match.team1_squad.first_day_player,
        player2: match.team2_squad.first_day_player,
      },
      {
        matchType: "Late Night Player",
        player1: match.team1_squad.late_night_player,
        player2: match.team2_squad.late_night_player,
      },
    ];

    // B) Create new MatchHistory documents and update player profiles
    for (const subMatch of newSubMatches) {
      const { player1, player2 } = subMatch;

      const player1Log = {
        player: player1,
        match: match._id,
        opponent: player2,
        matchDate: match.roundStartDate,
        tournament: match.tournament,
      };
      const player2Log = {
        player: player2,
        match: match._id,
        opponent: player1,
        matchDate: match.roundStartDate,
        tournament: match.tournament,
      };

      const newHistory1 = await MatchHistory.create(player1Log);
      const newHistory2 = await MatchHistory.create(player2Log);

      await User.findByIdAndUpdate(player1, {
        $push: { matchHistory: newHistory1._id },
      });
      await User.findByIdAndUpdate(player2, {
        $push: { matchHistory: newHistory2._id },
      });
    }

    // C) Assign the newly generated sub-matches to the main match document
    match.details = { subMatches: newSubMatches };
  } else {
    // If only one squad is in, ensure the sub-matches are cleared and wait.
    match.details = { subMatches: [] };
  }

  // --- 3. SAVE ---
  // Save the final state of the match document
  await match.save();
};

const updateRoundStatus = async (matchId, payload) => {
  const response = await Match.findByIdAndUpdate(matchId, payload, {
    new: true,
  });
  return response;
};

async function updateHistoryAfterSubMatch(subMatch, matchInfo) {
  const { player1, player2, player1Score, player2Score } = subMatch;
  const { matchId } = matchInfo;

  // 1. Determine the result for each player
  const player1Result =
    player1Score > player2Score
      ? "Win"
      : player1Score < player2Score
      ? "Loss"
      : "Draw";
  const player2Result =
    player2Score > player1Score
      ? "Win"
      : player2Score < player1Score
      ? "Loss"
      : "Draw";

  // 2. Update the MatchHistory document for Player 1
  await MatchHistory.findOneAndUpdate(
    { player: player1, opponent: player2, match: matchId },
    {
      $set: {
        scoreFor: player1Score,
        scoreAgainst: player2Score,
        result: player1Result,
      },
    }
  );

  // 3. Update the MatchHistory document for Player 2
  await MatchHistory.findOneAndUpdate(
    { player: player2, opponent: player1, match: matchId },
    {
      $set: {
        scoreFor: player2Score,
        scoreAgainst: player1Score,
        result: player2Result,
      },
    }
  );

  console.log(`Updated real-time match history for sub-match ${subMatch._id}`);
}

const updateSingleSubMatchScore = async (matchId, subMatchId, scores) => {
  try {
    const { player1Score, player2Score, winnerId } = scores;

    // 1. Find the main match and the specific sub-match
    const match = await Match.findById(matchId)
      .populate({
        path: "tournament",
        populate: { path: "phases" },
      })
      .populate({
        path: "team1 team2",
        populate: {
          path: "players",
          select: "_id",
        },
      });
    if (!match) throw new ApiError(404, "Match not found");

    const subMatch = match.details.subMatches.id(subMatchId);
    if (!subMatch) throw new ApiError(404, "Sub-match not found");

    // 2. Update the scores and status for the specific sub-match
    subMatch.player1Score = player1Score;
    subMatch.player2Score = player2Score;
    subMatch.status = "Completed";
    if (player1Score > player2Score)
      subMatch.winner = subMatch.player1.toString();
    else if (player2Score > player1Score)
      subMatch.winner = subMatch.player2.toString();
    else {
      const phase = match.tournament.phases.find((p) =>
        p._id.equals(match.phase)
      );
      const isKnockoutStage = phase?.phaseOrder > 1;

      if (isKnockoutStage) {
        if (!winnerId)
          throw new ApiError(
            400,
            "A penalty winner must be provided for a draw in a knockout match."
          );
        subMatch.winner = winnerId;
      } else {
        const phase = match.tournament.phases.find((p) =>
          p._id.equals(match.phase)
        );
        const isKnockoutStage = phase?.phaseOrder > 1;

        if (isKnockoutStage) {
          if (!winnerId)
            throw new ApiError(
              400,
              "A penalty winner must be provided for a draw in a knockout match."
            );
          subMatch.winner = winnerId;
        } else {
          subMatch.winner = "Draw";
        }
      }
    }

    // 3. Recalculate and update the main team scores for a live scoreboard
    let team1Points = 0;
    let team2Points = 0;
    match.details.subMatches.forEach((sm) => {
      if (sm.status === "Completed") {
        if (sm.winner === "Draw") {
          team1Points += 1;
          team2Points += 1;
        } else {
          // A player won
          const winnerPlayerId = sm.winner;
          const isWinnerInTeam1 = match.team1.players.some((p) =>
            p._id.equals(winnerPlayerId)
          );
          if (isWinnerInTeam1) {
            team1Points += 3;
          } else {
            team2Points += 3;
          }
        }
      }
    });

    // Update the parent match document with the new live point totals
    match.team1_score = team1Points;
    match.team2_score = team2Points;

    // 4. Save changes and trigger real-time history logging
    await match.save();
    await updateHistoryAfterSubMatch(subMatch, { matchId: match._id });

    // 5. Auto-Finalization Check
    const allSubMatchesCompleted = match.details.subMatches.every(
      (sm) => sm.status === "Completed"
    );

    if (allSubMatchesCompleted) {
      console.log(
        `All sub-matches for Match ${matchId} are complete. Finalizing...`
      );

      if (match.team1_score > match.team2_score) match.winner = match.team1;
      else if (match.team2_score > match.team1_score)
        match.winner = match.team2;
      else match.winner = null;

      match.status = "Completed";
      await match.save();

      // Trigger final updates for player career stats (W/L totals) and full history logs
      // await updatePlayerStatsFromMatch(matchId);
      // await saveMatchHistory(matchId); // This may be redundant if updateHistoryAfterSubMatch is sufficient

      // --- NEW: Dynamic Gauntlet Logic ---
      const tournament = match.tournament;
      const phase = tournament.phases.find((p) => p._id.equals(match.phase));

      if (tournament.type === "Trifecta" && phase.phaseOrder === 2) {
        const leaderboard = await generatePhase1Leaderboard(tournament._id);
        let nextMatch = null;

        // If Gauntlet Match 1 just finished, create Match 2
        if (match.round === "Gauntlet M1") {
          const secondPlaceTeam = leaderboard[1].teamInfo;
          nextMatch = new Match({
            tournament: tournament._id,
            phase: phase._id,
            round: "Gauntlet M2",
            team1: match.winner, // Winner of M1
            team2: secondPlaceTeam._id,
            status: "Unpublished",
          });
        }

        // If Gauntlet Match 2 just finished, create Match 3 (Final)
        else if (match.round === "Gauntlet M2") {
          const firstPlaceTeam = leaderboard[0].teamInfo;
          nextMatch = new Match({
            tournament: tournament._id,
            phase: phase._id,
            round: "Gauntlet M3 (Final)",
            team1: match.winner, // Winner of M2
            team2: firstPlaceTeam._id,
            status: "Unpublished",
          });
        }

        // If a new match was created, save it and link it to the phase
        if (nextMatch) {
          await nextMatch.save();
          phase.matches.push(nextMatch._id);
          await tournament.save();
          console.log(
            `Dynamically generated next gauntlet match: ${nextMatch.round}`
          );
        }
      }

      // --- NEW: LOGIC TO CALCULATE AND SAVE PHASE 2 CP ---
      if (
        tournament.type === "Trifecta" &&
        phase?.phaseOrder === 2 &&
        match.round === "Gauntlet M3 (Final)"
      ) {
        console.log(
          "Final Gauntlet match completed. Calculating Phase 2 Championship Points..."
        );

        // 1. Identify all 4 teams and their placement
        const kingId = match.winner;
        const runnerUpId = match.team1.equals(kingId)
          ? match.team2
          : match.team1;

        const match2 = await Match.findOne({
          phase: phase._id,
          round: "Gauntlet M2",
        });
        const semiFinalLoserId = match2.team1.equals(match2.winner)
          ? match2.team2
          : match2.team1;

        const match1 = await Match.findOne({
          phase: phase._id,
          round: "Gauntlet M1",
        });
        const firstRoundLoserId = match1.team1.equals(match1.winner)
          ? match1.team2
          : match1.team1;

        // 2. Prepare the database update operations
        const operations = [
          {
            // King gets 4 points
            updateOne: {
              filter: { tournament: tournament._id, team: kingId },
              update: { $set: { phase2_points: 4 } },
            },
          },
          {
            // Runner-Up gets 3 points
            updateOne: {
              filter: { tournament: tournament._id, team: runnerUpId },
              update: { $set: { phase2_points: 3 } },
            },
          },
          {
            // Semi-Final Loser gets 2 points
            updateOne: {
              filter: { tournament: tournament._id, team: semiFinalLoserId },
              update: { $set: { phase2_points: 2 } },
            },
          },
          {
            // First Round Loser gets 1 point
            updateOne: {
              filter: { tournament: tournament._id, team: firstRoundLoserId },
              update: { $set: { phase2_points: 1 } },
            },
          },
        ];

        // 3. Execute all updates in one command
        await ChampionshipPoint.bulkWrite(operations);
        console.log("Phase 2 Championship Points saved.");

        // 4. Mark Phase 2 as completed
        tournament.phases[2].status = "Active";
        phase.status = "Completed";
        await tournament.save();
      }

      // Check if a Semi-Final in Phase 3 just finished
      if (
        tournament.type === "Trifecta" &&
        phase?.phaseOrder === 3 &&
        match.round === "Semi-Final"
      ) {
        // Find all completed semi-final matches in this phase
        const completedSemis = await Match.find({
          phase: phase._id,
          round: "Semi-Final",
          status: "Completed",
        });

        // If BOTH semi-finals are now complete, generate the final matches
        if (completedSemis.length === 2) {
          console.log(
            "Both semi-finals are complete. Generating final matches..."
          );

          // Identify the two winners and two losers
          const winners = completedSemis.map((m) => m.winner);
          const losers = completedSemis.map((m) =>
            m.team1.equals(m.winner) ? m.team2 : m.team1
          );

          // Create the new match documents
          const finalMatchesToCreate = [
            {
              // 3rd Place Match
              tournament: tournament._id,
              phase: phase._id,
              round: "3rd Place Match",
              team1: losers[0],
              team2: losers[1],
              status: "Unpublished",
            },
            {
              // Grand Final
              tournament: tournament._id,
              phase: phase._id,
              round: "Grand Final",
              team1: winners[0],
              team2: winners[1],
              status: "Unpublished",
            },
          ];

          const createdMatches = await Match.insertMany(finalMatchesToCreate);

          // Link the new matches to the phase
          phase.matches.push(...createdMatches.map((m) => m._id));
          await tournament.save();
          console.log("Grand Final and 3rd Place Match have been generated.");
        }
      }

      if (phase?.phaseOrder === 3 && match.round === "Grand Final") {
        console.log(
          "Grand Final is complete. Finalizing the entire tournament..."
        );

        // 1. Update the phase status
        phase.status = "Completed";

        // 2. Update the main tournament document
        tournament.status = "Completed";
        tournament.champion = match.winner; // Set the overall tournament champion

        // 3. Save the changes
        await tournament.save();
      }

      return {
        message:
          "Final score submitted. Match has been automatically finalized!",
        match,
      };
    }

    // If not finalized, just send a standard success response with the live score
    return {
      message: "Sub-match score updated successfully! Team score is now live.",
      match,
    };
  } catch (error) {
    console.error("Error updating sub-match score:", error);
    throw new ApiError(500, "Server error");
  }
};

const getPlayersByMatch = async (matchId) => {
  const match = await Match.findById(matchId)
    // 2. Populate both team fields (team1 and team2)
    .populate({
      path: "team1 team2",
      // 3. Within each team, further populate the 'players' array
      populate: {
        path: "players",
        select: "name inGameUserName image", // Optional: select only the fields you need
      },
    });

  if (!match) {
    throw new Error("Match not found");
  }

  // 4. Combine the player arrays from both teams into a single list
  const allPlayers = [...match.team1.players, ...match.team2.players];

  return allPlayers;
};

export const setManOfTheMatch = async (matchId, playerId) => {
  const updateMatch = await Match.findByIdAndUpdate(
    matchId,
    {
      manOfTheMatch: playerId,
    },
    { new: true }
  );

  const updateHistory = await MatchHistory.findOneAndUpdate(
    { player: playerId, match: matchId },
    {
      isManOfTheMatch: true,
    },
    {
      new: true,
    }
  );
  return { updateHistory, updateMatch };
};

//score update for league and knockout matches
const updateMatchScoreForLeagueAndKnockout = async (payload) => {
  // The winnerId is optional, only sent for knockout draws
  const { team1_score, team2_score, _id: matchId, winnerId } = payload;

  // 1. Find and update the current match
  const match = await Match.findById(matchId).populate("knockout");
  if (!match) {
    throw new ApiError(404, "Match not found");
  }

  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";

  // 2. Context-Aware Winner Logic (for knockout draws)
  if (team1_score > team2_score) {
    match.winner = match.team1;
  } else if (team2_score > team1_score) {
    match.winner = match.team2;
  } else {
    // Scores are tied
    if (match.knockout) {
      // This is a knockout match
      if (!winnerId) {
        throw new ApiError(
          400,
          "Scores are tied. A penalty winner must be provided for this knockout match."
        );
      }
      match.winner = winnerId;
    } else {
      // This is a league match
      match.winner = null;
    }
  }

  await match.save();

  // 3. Update the two related MatchHistory Documents
  const player1Result =
    match.winner === null
      ? "Draw"
      : match.winner.equals(match.team1)
      ? "Win"
      : "Loss";
  const player2Result =
    player1Result === "Win"
      ? "Loss"
      : player1Result === "Loss"
      ? "Win"
      : "Draw";

  await MatchHistory.findOneAndUpdate(
    { match: matchId, player: match.team1 },
    {
      $set: {
        scoreFor: team1_score,
        scoreAgainst: team2_score,
        result: player1Result,
      },
    }
  );
  await MatchHistory.findOneAndUpdate(
    { match: matchId, player: match.team2 },
    {
      $set: {
        scoreFor: team2_score,
        scoreAgainst: team1_score,
        result: player2Result,
      },
    }
  );

  // 4. Dynamic Knockout Progression Logic
  if (match.knockout) {
    const knockoutId = match.knockout._id;
    const knockout = await Knockout.findById(knockoutId);
    const tournamentId = knockout.tournament;

    // A) Generate Semi-Finals after all Quarter-Finals are complete
    if (match.round === "Quarter-Final") {
      const completedQFs = await Match.find({
        knockout: knockoutId,
        round: "Quarter-Final",
        status: "Completed",
      });
      if (completedQFs.length === 4) {
        // Find the winners of the specific QF matchups based on seeding
        const winner1v8 = completedQFs.find((m) =>
          m.team1.equals(knockout.participants[0])
        ).winner;
        const winner4v5 = completedQFs.find((m) =>
          m.team1.equals(knockout.participants[3])
        ).winner;
        const winner2v7 = completedQFs.find((m) =>
          m.team1.equals(knockout.participants[1])
        ).winner;
        const winner3v6 = completedQFs.find((m) =>
          m.team1.equals(knockout.participants[2])
        ).winner;

        const semiFinalMatches = [
          {
            knockout: knockoutId,
            tournament: tournamentId,
            round: "Semi-Final",
            team1: winner1v8,
            team2: winner4v5,
            status: "Unpublished",
          },
          {
            knockout: knockoutId,
            tournament: tournamentId,
            round: "Semi-Final",
            team1: winner2v7,
            team2: winner3v6,
            status: "Unpublished",
          },
        ];
        const createdSemis = await Match.insertMany(semiFinalMatches);

        const semiFinalsRound = knockout.rounds.find(
          (r) => r.roundName === "Semi-Finals"
        );
        semiFinalsRound.matches.push(...createdSemis.map((m) => m._id));
        await knockout.save();
        // Create MatchHistory records for the new semi-final matches
      }
    }

    // B) Generate Finals after all Semi-Finals are complete
    if (match.round === "Semi-Final") {
      const completedSFs = await Match.find({
        knockout: knockoutId,
        round: "Semi-Final",
        status: "Completed",
      });
      if (completedSFs.length === 2) {
        const winners = completedSFs.map((m) => m.winner);
        const losers = completedSFs.map((m) =>
          m.team1.equals(m.winner) ? m.team2 : m.team1
        );

        const finalMatches = [
          {
            knockout: knockoutId,
            tournament: tournamentId,
            round: "Grand Final",
            team1: winners[0],
            team2: winners[1],
            status: "Unpublished",
          },
          {
            knockout: knockoutId,
            tournament: tournamentId,
            round: "3rd Place Match",
            team1: losers[0],
            team2: losers[1],
            status: "Unpublished",
          },
        ];
        const createdFinals = await Match.insertMany(finalMatches);

        const finalsRound = knockout.rounds.find(
          (r) => r.roundName === "Finals"
        );
        finalsRound.matches.push(...createdFinals.map((m) => m._id));
        await knockout.save();
        // Create MatchHistory records for the new final matches
      }
    }

    // C) (Optional) Complete the tournament after the final is played
    if (match.round === "Grand Final") {
      knockout.status = "Completed";
      await knockout.save();
      await Tournament.findByIdAndUpdate(tournamentId, {
        status: "Completed",
        champion: match.winner,
      });
    }
  }

  return { message: "Match score updated successfully", match };
};

async function updateMatchHistoryHelper(match) {
  const loser = match.winner.equals(match.team1) ? match.team2 : match.team1;

  try {
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
}

export async function updateTournamentMatchScore(payload) {
  const { _id: matchId, team1_score, team2_score, winnerId } = payload;

  // 1. Update the individual Match
  const match = await Match.findById(matchId).populate("series knockout");
  if (!match) throw new ApiError(404, "Match not found.");

  // if (match.status === "Completed") {
  //   throw new ApiError(400, "Match is already completed.");
  // }

  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";

  if (team1_score > team2_score) match.winner = match.team1;
  else if (team2_score > team1_score) match.winner = match.team2;
  else {
    if (match.knockout || match.series) {
      // This is a knockout match
      if (!winnerId) {
        throw new ApiError(
          400,
          "Scores are tied. A penalty winner must be provided for this knockout match."
        );
      }
      match.winner = winnerId;
    } else {
      // This is a league match
      match.winner = null;
    }
  }
  await match.save();

  // 2. Update MatchHistory
  await updateMatchHistoryHelper(match);

  // 3. --- Progression Logic ---
  // A) If it's a Phase 2 (Gauntlet Series) match...
  if (match.series) {
    await runPhase2GauntletEngine(match.series, match.winner);
  }
  // B) If it's a Phase 3 (Page Playoff) match...
  else if (match.knockout && match.knockout.name.includes("Phase 3 Playoff")) {
    await runPhase3PagePlayoffEngine(match.knockout._id);
  }
  // C) If it's a Phase 1 (League) match...
  else if (match.league) {
    console.log(`Updated Phase 1 League match ${matchId}`);
  }

  return { message: "Match score updated, tournament progressed.", match };
}

export const MatchServices = {
  submitSquadAndGenerateSubMatches,
  generateOrUpdateSubMatches,
  updateRoundStatus,
  updateSingleSubMatchScore,
  getPlayersByMatch,
  setManOfTheMatch,
  updateMatchScoreForLeagueAndKnockout,
  updateTournamentMatchScore,
};
