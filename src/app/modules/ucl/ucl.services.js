import { Tournament } from "../tournaments/tournament.model.js";
import { League } from "../league/league.model.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import ApiError from "../../errors/ApiError.js";
import { updateMatchHistoryHelper } from "../../helpers/match.helper.js";
import { generateLeagueLeaderboard } from "../league/league.services.js";
import { Knockout } from "../knockout/knockout.model.js";
import { Series } from "../series/series.model.js";

const registerUCLPlayers = async (tournamentId, playerIds) => {
  const tournament = await Tournament.findById(tournamentId);

  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  if (tournament.type !== "EC UCL") {
    throw new ApiError(
      400,
      "This registration function is strictly for the UCL format.",
    );
  }

  // Ensure exactly 16 players are provided
  if (!Array.isArray(playerIds) || playerIds.length !== 16) {
    throw new ApiError(
      400,
      `UCL format requires exactly 16 players. Provided: ${playerIds?.length || 0}`,
    );
  }

  // Remove any duplicate IDs just in case
  const uniquePlayers = [...new Set(playerIds)];
  if (uniquePlayers.length !== 16) {
    throw new ApiError(
      400,
      "Duplicate players detected in the registration array.",
    );
  }

  // Prevent accidental overwrites if tournament is already live
  if (tournament.status !== "Upcoming" && tournament.status !== "unPublished") {
    throw new ApiError(
      400,
      "Cannot modify participants after the tournament has started.",
    );
  }

  // Overwrite the teams array with the 16 User IDs
  tournament.teams = uniquePlayers;
  await tournament.save();

  return {
    success: true,
    message: "16 players successfully registered and locked in for the UCL.",
    registeredCount: tournament.teams.length,
  };
};

// Utility to randomly shuffle the 16 players for the Group Draw
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

const generatePhase1GroupStage = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId).populate("teams");
  if (!tournament) throw new ApiError(404, "Tournament not found");

  // Validation: Must be exactly 16 players
  if (tournament.teams.length !== 16) {
    throw new ApiError(
      400,
      `UCL format requires exactly 16 players. Currently registered: ${tournament.teams.length}`,
    );
  }

  // 1. The Official Group Stage Draw
  const participants = shuffleArray([...tournament.teams]);
  const groups = {
    A: participants.slice(0, 4),
    B: participants.slice(4, 8),
    C: participants.slice(8, 12),
    D: participants.slice(12, 16),
  };

  const createdStages = [];
  const allHistoryLogs = [];

  // 2. Process each Group (League)
  for (const [groupName, groupParticipants] of Object.entries(groups)) {
    // Create the Group Container (reusing your League model)
    const league = await League.create({
      name: `Group ${groupName}`,
      tournament: tournamentId,
      participants: groupParticipants.map((p) => p._id),
      maxParticipants: 4,
      status: "Active",
    });

    const groupMatches = [];
    const p = groupParticipants.map((p) => p._id);

    // Hardcoded round-robin pairings for 4 players
    const pairings = [
      [
        { t1: p[0], t2: p[1] },
        { t1: p[2], t2: p[3] },
      ], // Matchday 1
      [
        { t1: p[0], t2: p[2] },
        { t1: p[1], t2: p[3] },
      ], // Matchday 2
      [
        { t1: p[0], t2: p[3] },
        { t1: p[1], t2: p[2] },
      ], // Matchday 3
    ];

    // LEG 1: Home Fixtures
    pairings.forEach((roundMatches, roundIndex) => {
      roundMatches.forEach((matchInfo) => {
        groupMatches.push({
          tournament: tournamentId,
          league: league._id,
          round: `Matchday ${roundIndex + 1}`,
          team1: matchInfo.t1,
          team2: matchInfo.t2,
          status: "Unpublished",
        });
      });
    });

    // LEG 2: Away Fixtures (Reverse the home/away teams)
    pairings.forEach((roundMatches, roundIndex) => {
      roundMatches.forEach((matchInfo) => {
        groupMatches.push({
          tournament: tournamentId,
          league: league._id,
          round: `Matchday ${roundIndex + 4}`,
          team1: matchInfo.t2, // Swapped
          team2: matchInfo.t1, // Swapped
          status: "Unpublished",
        });
      });
    });

    // Insert the 12 matches for this group
    const insertedMatches = await Match.insertMany(groupMatches);

    // Update League with match IDs
    league.matches = insertedMatches.map((m) => m._id);
    await league.save();

    // Prepare History Logs for Player Profiles & Leaderboard Syncing
    insertedMatches.forEach((match) => {
      allHistoryLogs.push(
        {
          player: match.team1,
          opponent: match.team2,
          match: match._id,
          tournament: tournamentId,
          result: "Pending",
        },
        {
          player: match.team2,
          opponent: match.team1,
          match: match._id,
          tournament: tournamentId,
          result: "Pending",
        },
      );
    });

    // Add to Tournament Stages Array
    createdStages.push({
      stageOrder: 1,
      stageName: `Group ${groupName}`,
      stageType: "League",
      stageData: league._id,
    });
  }

  // 3. Save all match histories in bulk
  await MatchHistory.insertMany(allHistoryLogs);

  // 4. Update the main tournament document
  tournament.stages.push(...createdStages);
  tournament.status = "Live";
  await tournament.save();

  return {
    success: true,
    message:
      "UCL Phase 1: Group Stage Draw and Fixtures Generated Successfully!",
  };
};

const generatePhase2Playoffs = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new ApiError(404, "Tournament not found");

  // 1. Fetch the 4 Group Leagues
  const leagues = await League.find({ tournament: tournamentId });
  if (leagues.length !== 4)
    throw new ApiError(
      400,
      "Could not find exactly 4 groups for this tournament.",
    );

  const groupA = leagues.find((l) => l.name.includes("Group A"));
  const groupB = leagues.find((l) => l.name.includes("Group B"));
  const groupC = leagues.find((l) => l.name.includes("Group C"));
  const groupD = leagues.find((l) => l.name.includes("Group D"));

  // 2. Generate Final Leaderboards for all groups
  const lbA = await generateLeagueLeaderboard(groupA._id);
  const lbB = await generateLeagueLeaderboard(groupB._id);
  const lbC = await generateLeagueLeaderboard(groupC._id);
  const lbD = await generateLeagueLeaderboard(groupD._id);

  // Ensure all groups are fully completed (6 matches per group)
  const isComplete = (lb) => lb.every((p) => p.played === 6);
  if (
    !isComplete(lbA) ||
    !isComplete(lbB) ||
    !isComplete(lbC) ||
    !isComplete(lbD)
  ) {
    // throw new ApiError(400, "Cannot start Phase 2 until all Group Stage matches are fully completed.");
    console.warn(
      "Bypassing completion check for testing. Ensure groups are done in production.",
    );
  }

  // 3. Save the 1st Place Winners to bypass Phase 2
  tournament.metadata.uclGroupWinners = [
    lbA[0].playerInfo._id, // Group A Winner
    lbB[0].playerInfo._id, // Group B Winner
    lbC[0].playerInfo._id, // Group C Winner
    lbD[0].playerInfo._id, // Group D Winner
  ];

  // 4. Create the Knockout Container for Phase 2
  const knockout = await Knockout.create({
    name: "Phase 2: The Play-off Round",
    tournament: tournamentId,
    size: 8,
    status: "Active",
    rounds: [],
  });

  // 5. Define Cross-Group Matchups (2nd vs 3rd)
  const matchups = [
    {
      name: "Play-off 1",
      p1: lbA[1].playerInfo._id,
      p2: lbB[2].playerInfo._id,
    }, // 2nd A vs 3rd B
    {
      name: "Play-off 2",
      p1: lbB[1].playerInfo._id,
      p2: lbA[2].playerInfo._id,
    }, // 2nd B vs 3rd A
    {
      name: "Play-off 3",
      p1: lbC[1].playerInfo._id,
      p2: lbD[2].playerInfo._id,
    }, // 2nd C vs 3rd D
    {
      name: "Play-off 4",
      p1: lbD[1].playerInfo._id,
      p2: lbC[2].playerInfo._id,
    }, // 2nd D vs 3rd C
  ];

  const seriesIds = [];
  const allMatchesToInsert = [];
  const allHistoryLogs = [];

  // 6. Generate Two-Legged Series for each Matchup
  for (const tie of matchups) {
    // Create the Series wrapper for the two legs
    const series = await Series.create({
      knockout: knockout._id,
      roundName: tie.name,
      player1: tie.p1,
      player2: tie.p2,
      bestOf: 2, // 2 Legs
      status: "Active",
    });
    seriesIds.push(series._id);

    // Leg 1: 3rd Place Team is Home
    allMatchesToInsert.push({
      tournament: tournamentId,
      knockout: knockout._id,
      series: series._id,
      round: `${tie.name} - Leg 1`,
      team1: tie.p2, // 3rd Place
      team2: tie.p1, // 2nd Place
      status: "Unpublished",
    });

    // Leg 2: 2nd Place Team is Home (Advantage)
    allMatchesToInsert.push({
      tournament: tournamentId,
      knockout: knockout._id,
      series: series._id,
      round: `${tie.name} - Leg 2`,
      team1: tie.p1, // 2nd Place
      team2: tie.p2, // 3rd Place
      status: "Unpublished",
    });
  }

  // 7. Insert Matches and Create History Logs
  const createdMatches = await Match.insertMany(allMatchesToInsert);

  for (const match of createdMatches) {
    // Link Match to Series
    await Series.findByIdAndUpdate(match.series, {
      $push: { matches: match._id },
    });

    // History Logs
    allHistoryLogs.push(
      {
        player: match.team1,
        opponent: match.team2,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      },
      {
        player: match.team2,
        opponent: match.team1,
        match: match._id,
        tournament: tournamentId,
        result: "Pending",
      },
    );
  }

  await MatchHistory.insertMany(allHistoryLogs);

  // 8. Finalize Links
  knockout.rounds.push({
    roundName: "Two-Legged Play-offs",
    series: seriesIds,
    matches: createdMatches.map((m) => m._id),
  });
  await knockout.save();

  tournament.stages.push({
    stageOrder: 2,
    stageName: "The Play-off Round",
    stageType: "Knockout",
    stageData: knockout._id,
  });

  // Close the groups
  for (const league of leagues) {
    league.status = "Completed";
    await league.save();
  }

  await tournament.save();
  return {
    success: true,
    message: "Phase 2 generated! Group winners secured byes.",
  };
};

const updateUclTwoLeggedScore = async (payload) => {
  const { _id: matchId, team1_score, team2_score, winnerId } = payload;

  const match = await Match.findById(matchId).populate("series knockout");
  if (!match) throw new ApiError(404, "Match not found");

  // 1. Update the Individual Match
  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";

  if (team1_score > team2_score) match.winner = match.team1;
  else if (team2_score > team1_score) match.winner = match.team2;
  else match.winner = "Draw"; // Individual legs can end in a draw

  await match.save();
  await updateMatchHistoryHelper(match);

  // 2. Check Aggregate Score if part of a Series
  if (match.series) {
    const series = await Series.findById(match.series._id).populate("matches");
    const isSeriesComplete = series.matches.every(
      (m) => m.status === "Completed",
    );

    if (isSeriesComplete) {
      let p1Aggregate = 0;
      let p2Aggregate = 0;

      // Sum goals across both legs
      series.matches.forEach((m) => {
        if (m.team1.toString() === series.player1.toString()) {
          p1Aggregate += m.team1_score;
          p2Aggregate += m.team2_score;
        } else {
          p1Aggregate += m.team2_score;
          p2Aggregate += m.team1_score;
        }
      });

      // Determine Tie Winner
      if (p1Aggregate > p2Aggregate) {
        series.winner = series.player1;
      } else if (p2Aggregate > p1Aggregate) {
        series.winner = series.player2;
      } else {
        // AGGREGATE IS TIED! Require penalty winner from Leg 2
        if (!winnerId) {
          // Revert match status so the admin can re-enter it with the penalty winner
          match.status = "Scheduled";
          await match.save();
          throw new ApiError(
            400,
            `Aggregate score is tied ${p1Aggregate}-${p2Aggregate}! Please provide the penalty shootout winner.`,
          );
        }
        series.winner = winnerId;
      }

      series.status = "Completed";
      await series.save();

      // Auto-Complete Knockout Stage if all series are done
      const knockout = await Knockout.findById(match.knockout._id).populate(
        "rounds.series",
      );
      const allSeriesDone = knockout.rounds[0].series.every(
        (s) => s.status === "Completed",
      );
      if (allSeriesDone) {
        knockout.status = "Completed";
        await knockout.save();
        console.log("Phase 2 completely finished! Ready for Phase 3.");
      }
    }
  }

  return { message: "Match updated successfully. Aggregate checked.", match };
};

const generatePhase3Knockout = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new ApiError(404, "Tournament not found");

  // 1. Fetch Phase 2 to extract the Play-off Winners
  const phase2Knockout = await Knockout.findOne({
    tournament: tournamentId,
    name: "Phase 2: The Play-off Round",
  }).populate("rounds.series");

  if (!phase2Knockout) {
    throw new ApiError(
      400,
      "Phase 2 Play-off data not found. Ensure Phase 2 was initialized.",
    );
  }

  const playOffSeries = phase2Knockout.rounds[0]?.series || [];
  const poWinners = {};

  // Map winners by their specific play-off name
  playOffSeries.forEach((s) => {
    if (s.status === "Completed" && s.winner) {
      poWinners[s.roundName] = s.winner;
    }
  });

  // Ensure all 4 play-offs are played out
  if (Object.keys(poWinners).length !== 4) {
    // throw new ApiError(400, "Cannot start Phase 3 until all 4 Play-off matches are fully completed.");
    console.warn("Bypassing completion check for development/testing.");
  }

  // 2. Extract Group Winners from Metadata
  const groupWinners = tournament.metadata.uclGroupWinners || [];
  if (groupWinners.length !== 4) {
    throw new ApiError(
      400,
      "Group stage winners are missing from tournament metadata.",
    );
  }

  const [winnerA, winnerB, winnerC, winnerD] = groupWinners;

  // 3. Create the Phase 3 Knockout Container
  const knockoutPhase3 = await Knockout.create({
    name: "Phase 3: The Knockout Stage",
    tournament: tournamentId,
    size: 8,
    status: "Active",
    rounds: [],
  });

  // 4. Bracket Blueprint Mapping (Pre-creating all series structures)
  const seriesDefinitions = [
    { name: "Quarter-Final A", p1: winnerA, p2: poWinners["Play-off 3"] },
    { name: "Quarter-Final B", p1: winnerD, p2: poWinners["Play-off 2"] },
    { name: "Quarter-Final C", p1: winnerB, p2: poWinners["Play-off 4"] },
    { name: "Quarter-Final D", p1: winnerC, p2: poWinners["Play-off 1"] },
    { name: "Semi-Final 1", p1: null, p2: null }, // To be populated dynamically
    { name: "Semi-Final 2", p1: null, p2: null }, // To be populated dynamically
    { name: "Grand Final", p1: null, p2: null }, // To be populated dynamically
  ];

  const createdSeriesMap = {};
  const allSeriesIds = [];
  const matchesToInsert = [];
  const historyLogs = [];

  for (const def of seriesDefinitions) {
    const isFinal = def.name === "Grand Final";
    const series = await Series.create({
      knockout: knockoutPhase3._id,
      roundName: def.name,
      player1: def.p1 || undefined,
      player2: def.p2 || undefined,
      bestOf: isFinal ? 1 : 2, // Grand Final is a single leg, QF/SF are 2 legs
      status: def.p1 && def.p2 ? "Active" : "Upcoming",
    });

    createdSeriesMap[def.name] = series._id;
    allSeriesIds.push(series._id);

    // Only generate matches immediately for the active Quarter-Finals
    if (def.p1 && def.p2) {
      // Leg 1: Play-off winner hosts Group Winner
      matchesToInsert.push({
        tournament: tournamentId,
        knockout: knockoutPhase3._id,
        series: series._id,
        round: `${def.name} - Leg 1`,
        team1: def.p2,
        team2: def.p1,
        status: "Unpublished",
      });

      // Leg 2: Group Winner hosts Leg 2 (Traditional Second-Leg Home Advantage)
      matchesToInsert.push({
        tournament: tournamentId,
        knockout: knockoutPhase3._id,
        series: series._id,
        round: `${def.name} - Leg 2`,
        team1: def.p1,
        team2: def.p2,
        status: "Unpublished",
      });
    }
  }

  // 5. Insert Initial QF Matches & History Data
  if (matchesToInsert.length > 0) {
    const createdMatches = await Match.insertMany(matchesToInsert);

    for (const match of createdMatches) {
      await Series.findByIdAndUpdate(match.series, {
        $push: { matches: match._id },
      });

      historyLogs.push(
        {
          player: match.team1,
          opponent: match.team2,
          match: match._id,
          tournament: tournamentId,
          result: "Pending",
        },
        {
          player: match.team2,
          opponent: match.team1,
          match: match._id,
          tournament: tournamentId,
          result: "Pending",
        },
      );
    }
    await MatchHistory.insertMany(historyLogs);
  }

  // 6. Finalize Phase 3 Structure Document
  knockoutPhase3.rounds.push({
    roundName: "Bracket Phase",
    series: allSeriesIds,
    matches: matchesToInsert.map((_, i) => matchesToInsert[i]._id), // Tracks initial matches
  });
  await knockoutPhase3.save();

  // Update Tournament Phase Logs
  tournament.stages.push({
    stageOrder: 3,
    stageName: "The Knockout Stage",
    stageType: "Knockout",
    stageData: knockoutPhase3._id,
  });

  await tournament.save();
  return { success: true, message: "Phase 3 layout generated successfully!" };
};

const updateUclPhase3Score = async (payload) => {
  const { _id: matchId, team1_score, team2_score, winnerId } = payload;

  const match = await Match.findById(matchId).populate("series knockout");
  if (!match) throw new ApiError(404, "Match not found");

  // 1. Process Individual Match Result
  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";
  match.winner =
    team1_score > team2_score
      ? match.team1
      : team2_score > team1_score
        ? match.team2
        : "Draw";

  await match.save();
  await updateMatchHistoryHelper(match);

  const series = await Series.findById(match.series._id).populate("matches");
  const isSeriesComplete = series.matches.every(
    (m) => m.status === "Completed",
  );

  // 2. Handle Series Completion & Progression Logic
  if (isSeriesComplete && series.status !== "Completed") {
    let seriesWinner = null;

    if (series.bestOf === 2) {
      // Aggregate scoring calculations for QF and SF
      let p1Goals = 0;
      let p2Goals = 0;

      series.matches.forEach((m) => {
        if (m.team1.toString() === series.player1.toString()) {
          p1Goals += m.team1_score;
          p2Goals += m.team2_score;
        } else {
          p1Goals += m.team2_score;
          p2Goals += m.team1_score;
        }
      });

      if (p1Goals > p2Goals) seriesWinner = series.player1;
      else if (p2Goals > p1Goals) seriesWinner = series.player2;
      else {
        if (!winnerId) {
          match.status = "Scheduled"; // Reset match to allow penalty input
          await match.save();
          throw new ApiError(
            400,
            `Aggregate is tied (${p1Goals}-${p2Goals}). Shootout winner required.`,
          );
        }
        seriesWinner = winnerId;
      }
    } else {
      // Single leg logic (strictly for the Grand Final)
      if (match.winner === "Draw" && !winnerId) {
        match.status = "Scheduled";
        await match.save();
        throw new ApiError(
          400,
          "Grand Final matches cannot end in a draw. Please pass the shootout winnerId.",
        );
      }
      seriesWinner = match.winner === "Draw" ? winnerId : match.winner;
    }

    series.winner = seriesWinner;
    series.status = "Completed";
    await series.save();

    // 3. Dynamic Advancement Router
    await handleBracketAdvancement(series, seriesWinner, match.tournament);
  }

  return {
    success: true,
    message: "Match updated and bracket progression assessed.",
    match,
  };
};

// Internal helper to route winners to their correct next round nodes
const handleBracketAdvancement = async (
  completedSeries,
  winnerId,
  tournamentId,
) => {
  const roundName = completedSeries.roundName;
  let targetRoundName = "";
  let slotKey = "";

  // Map current node resolutions to parent nodes
  if (roundName === "Quarter-Final A") {
    targetRoundName = "Semi-Final 1";
    slotKey = "player1";
  } else if (roundName === "Quarter-Final B") {
    targetRoundName = "Semi-Final 1";
    slotKey = "player2";
  } else if (roundName === "Quarter-Final C") {
    targetRoundName = "Semi-Final 2";
    slotKey = "player1";
  } else if (roundName === "Quarter-Final D") {
    targetRoundName = "Semi-Final 2";
    slotKey = "player2";
  } else if (roundName === "Semi-Final 1") {
    targetRoundName = "Grand Final";
    slotKey = "player1";
  } else if (roundName === "Semi-Final 2") {
    targetRoundName = "Grand Final";
    slotKey = "player2";
  } else if (roundName === "Grand Final") {
    // Complete the entire tournament!
    await Tournament.findByIdAndUpdate(tournamentId, { status: "Completed" });
    return;
  }

  // Update target node slot with winner
  const targetSeries = await Series.findOne({
    knockout: completedSeries.knockout,
    roundName: targetRoundName,
  });
  if (targetSeries) {
    targetSeries[slotKey] = winnerId;
    await targetSeries.save();

    // If both nodes are ready, generate matches for the upcoming bracket node
    if (targetSeries.player1 && targetSeries.player2) {
      targetSeries.status = "Active";
      await targetSeries.save();

      const newMatches = [];
      if (targetRoundName.includes("Semi-Final")) {
        // Semi-Finals: 2 legs
        newMatches.push(
          {
            tournament: tournamentId,
            knockout: completedSeries.knockout,
            series: targetSeries._id,
            round: `${targetRoundName} - Leg 1`,
            team1: targetSeries.player2,
            team2: targetSeries.player1,
            status: "Unpublished",
          },
          {
            tournament: tournamentId,
            knockout: completedSeries.knockout,
            series: targetSeries._id,
            round: `${targetRoundName} - Leg 2`,
            team1: targetSeries.player1,
            team2: targetSeries.player2,
            status: "Unpublished",
          },
        );
      } else if (targetRoundName === "Grand Final") {
        // Grand Final: 1 leg showdown
        newMatches.push({
          tournament: tournamentId,
          knockout: completedSeries.knockout,
          series: targetSeries._id,
          round: "Grand Final",
          team1: targetSeries.player1,
          team2: targetSeries.player2,
          status: "Unpublished",
        });
      }

      const inserted = await Match.insertMany(newMatches);
      const historyLogs = [];

      for (const m of inserted) {
        await Series.findByIdAndUpdate(targetSeries._id, {
          $push: { matches: m._id },
        });
        await Knockout.findByIdAndUpdate(completedSeries.knockout, {
          $push: { "rounds.0.matches": m._id },
        });

        historyLogs.push(
          {
            player: m.team1,
            opponent: m.team2,
            match: m._id,
            tournament: tournamentId,
            result: "Pending",
          },
          {
            player: m.team2,
            opponent: m.team1,
            match: m._id,
            tournament: tournamentId,
            result: "Pending",
          },
        );
      }
      await MatchHistory.insertMany(historyLogs);
    }
  }
};

export const UclServices = {
  generatePhase1GroupStage,
  registerUCLPlayers,
  generatePhase2Playoffs,
  updateUclTwoLeggedScore,
  generatePhase3Knockout,
  updateUclPhase3Score,
};
