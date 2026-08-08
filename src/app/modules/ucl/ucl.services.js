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

  const series = await Series.findById(match.series._id).populate("matches");
  if (!series) throw new ApiError(404, "Series not found");

  // 1. Identify Leg 1 and Leg 2 matches from the series
  const leg1 = series.matches.find((m) => m.round.includes("Leg 1"));
  const leg2 = series.matches.find((m) => m.round.includes("Leg 2"));

  const isUpdatingLeg2 = match._id.toString() === leg2._id.toString();

  // 2. Perform Validation for 2nd Leg specifically
  if (isUpdatingLeg2) {
    if (!leg1 || leg1.status !== "Completed") {
      throw new ApiError(
        400,
        "Leg 1 must be completed before you can submit the score for Leg 2.",
      );
    }

    // Calculate Aggregate Scores based on Series Player 1 and Player 2
    let p1Aggregate = 0;
    let p2Aggregate = 0;

    // Add Leg 1 scores (already saved in DB)
    if (leg1.team1.toString() === series.player1.toString()) {
      p1Aggregate += leg1.team1_score;
      p2Aggregate += leg1.team2_score;
    } else {
      p1Aggregate += leg1.team2_score;
      p2Aggregate += leg1.team1_score;
    }

    // Add Leg 2 scores (from the incoming payload, NOT the DB yet)
    if (match.team1.toString() === series.player1.toString()) {
      p1Aggregate += team1_score;
      p2Aggregate += team2_score;
    } else {
      p1Aggregate += team2_score;
      p2Aggregate += team1_score;
    }

    // CORE RULE: If Aggregate is Tied, a winnerId MUST be provided
    if (p1Aggregate === p2Aggregate) {
      if (!winnerId) {
        throw new ApiError(
          400,
          `Aggregate score is tied at ${p1Aggregate}-${p2Aggregate}. You MUST select a winner (via shootout) to submit this match.`,
        );
      }
    }
  }

  // 3. Proceed with updating the individual match
  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";

  // Individual leg logic: can be a draw if the aggregate rule above didn't block it
  if (team1_score > team2_score) match.winner = match.team1;
  else if (team2_score > team1_score) match.winner = match.team2;
  else match.winner = null;

  await match.save();
  await updateMatchHistoryHelper(match);

  // 4. Finalize Series if this was the 2nd Leg
  if (isUpdatingLeg2 || series.matches.every((m) => m.status === "Completed")) {
    // Fetch fresh series data to calculate final outcome
    const updatedSeries = await Series.findById(match.series._id).populate(
      "matches",
    );
    let finalP1Agg = 0;
    let finalP2Agg = 0;

    updatedSeries.matches.forEach((m) => {
      if (m.team1.toString() === updatedSeries.player1.toString()) {
        finalP1Agg += m.team1_score;
        finalP2Agg += m.team2_score;
      } else {
        finalP1Agg += m.team2_score;
        finalP2Agg += m.team1_score;
      }
    });

    // Determine Official Series Winner
    if (finalP1Agg > finalP2Agg) {
      updatedSeries.winner = updatedSeries.player1;
    } else if (finalP2Agg > finalP1Agg) {
      updatedSeries.winner = updatedSeries.player2;
    } else {
      updatedSeries.winner = winnerId; // Tie-breaker applied
    }

    updatedSeries.status = "Completed";
    await updatedSeries.save();

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
    }
  }

  return {
    message: "Score updated successfully. Aggregate validation passed.",
    match,
  };
};

// ==========================================
// GENERATE PHASE 3: THE BRACKET TOPOLOGY
// ==========================================
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
  let createdMatchIds = []; // Stores the real MongoDB IDs after insertion

  if (matchesToInsert.length > 0) {
    const createdMatches = await Match.insertMany(matchesToInsert);

    for (const match of createdMatches) {
      createdMatchIds.push(match._id); // Capture the generated Mongoose _id

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
    matches: createdMatchIds, // Uses the captured real ObjectIds
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

// // ==========================================
// // PHASE 3 SCORE SUBMISSION & AUTO-ADVANCEMENT
// // ==========================================
// const updateUclPhase3Score = async (payload) => {
//   const { _id: matchId, team1_score, team2_score, winnerId } = payload;

//   const match = await Match.findById(matchId).populate("series knockout");
//   if (!match) throw new ApiError(404, "Match not found");

//   const series = await Series.findById(match.series._id).populate("matches");
//   if (!series) throw new ApiError(404, "Series not found");

//   let isUpdatingFinalLeg = false;

//   // --- 1. PRE-EMPTIVE VALIDATION BASED ON SERIES TYPE ---
//   if (series.bestOf === 2) {
//     // Logic for Quarter-Finals & Semi-Finals (Two Legs)
//     const leg1 = series.matches.find((m) => m.round.includes("Leg 1"));
//     const leg2 = series.matches.find((m) => m.round.includes("Leg 2"));

//     if (match._id.toString() === leg2._id.toString()) {
//       isUpdatingFinalLeg = true;

//       if (!leg1 || leg1.status !== "Completed") {
//         throw new ApiError(
//           400,
//           "Leg 1 must be completed before you can submit the score for Leg 2.",
//         );
//       }

//       // Calculate Aggregate: Leg 1 (DB) + Leg 2 (Incoming Payload)
//       let p1Aggregate = 0;
//       let p2Aggregate = 0;

//       // Add Leg 1 scores
//       if (leg1.team1.toString() === series.player1.toString()) {
//         p1Aggregate += leg1.team1_score;
//         p2Aggregate += leg1.team2_score;
//       } else {
//         p1Aggregate += leg1.team2_score;
//         p2Aggregate += leg1.team1_score;
//       }

//       // Add Leg 2 scores
//       if (match.team1.toString() === series.player1.toString()) {
//         p1Aggregate += team1_score;
//         p2Aggregate += team2_score;
//       } else {
//         p1Aggregate += team2_score;
//         p2Aggregate += team1_score;
//       }

//       // Block submission if aggregate is tied and no shootout winner is provided
//       if (p1Aggregate === p2Aggregate && !winnerId) {
//         throw new ApiError(
//           400,
//           `Aggregate score is tied at ${p1Aggregate}-${p2Aggregate}. You MUST select a winner (via shootout) to submit this match.`,
//         );
//       }
//     }
//   } else if (series.bestOf === 1) {
//     // Logic strictly for the Grand Final (Single Leg)
//     isUpdatingFinalLeg = true;

//     if (team1_score === team2_score && !winnerId) {
//       throw new ApiError(
//         400,
//         "The Grand Final cannot end in a draw. You MUST select a winner (via shootout).",
//       );
//     }
//   }

//   // --- 2. UPDATE INDIVIDUAL MATCH ---
//   match.team1_score = team1_score;
//   match.team2_score = team2_score;
//   match.status = "Completed";

//   // Handle individual leg draw correctly (using null instead of "Draw")
//   if (team1_score > team2_score) match.winner = match.team1;
//   else if (team2_score > team1_score) match.winner = match.team2;
//   else match.winner = null;

//   await match.save();
//   await updateMatchHistoryHelper(match);

//   // --- 3. FINALIZE SERIES & ADVANCE BRACKET ---
//   if (
//     isUpdatingFinalLeg ||
//     series.matches.every((m) => m.status === "Completed")
//   ) {
//     const updatedSeries = await Series.findById(match.series._id).populate(
//       "matches",
//     );
//     let seriesWinner = null;

//     if (updatedSeries.bestOf === 2) {
//       // Re-calculate final aggregates natively from DB for safety
//       let finalP1Agg = 0;
//       let finalP2Agg = 0;

//       updatedSeries.matches.forEach((m) => {
//         if (m.team1.toString() === updatedSeries.player1.toString()) {
//           finalP1Agg += m.team1_score;
//           finalP2Agg += m.team2_score;
//         } else {
//           finalP1Agg += m.team2_score;
//           finalP2Agg += m.team1_score;
//         }
//       });

//       if (finalP1Agg > finalP2Agg) seriesWinner = updatedSeries.player1;
//       else if (finalP2Agg > finalP1Agg) seriesWinner = updatedSeries.player2;
//       else seriesWinner = winnerId; // Tie-breaker
//     } else {
//       // Grand Final Winner
//       seriesWinner = match.winner === null ? winnerId : match.winner;
//     }

//     updatedSeries.winner = seriesWinner;
//     updatedSeries.status = "Completed";
//     await updatedSeries.save();

//     // 4. DYNAMIC ADVANCEMENT ROUTER
//     // Pass the officially determined winner to advance them to the next bracket node
//     await handleBracketAdvancement(
//       updatedSeries,
//       seriesWinner,
//       match.tournament,
//     );
//   }

//   return {
//     success: true,
//     message: "Phase 3 match updated and bracket progression assessed.",
//     match,
//   };
// };

// // Internal helper to route winners to their correct next round nodes
// const handleBracketAdvancement = async (
//   completedSeries,
//   winnerId,
//   tournamentId,
// ) => {
//   const roundName = completedSeries.roundName;
//   let targetRoundName = "";
//   let slotKey = "";

//   // Map current node resolutions to parent nodes
//   if (roundName === "Quarter-Final A") {
//     targetRoundName = "Semi-Final 1";
//     slotKey = "player1";
//   } else if (roundName === "Quarter-Final B") {
//     targetRoundName = "Semi-Final 1";
//     slotKey = "player2";
//   } else if (roundName === "Quarter-Final C") {
//     targetRoundName = "Semi-Final 2";
//     slotKey = "player1";
//   } else if (roundName === "Quarter-Final D") {
//     targetRoundName = "Semi-Final 2";
//     slotKey = "player2";
//   } else if (roundName === "Semi-Final 1") {
//     targetRoundName = "Grand Final";
//     slotKey = "player1";
//   } else if (roundName === "Semi-Final 2") {
//     targetRoundName = "Grand Final";
//     slotKey = "player2";
//   } else if (roundName === "Grand Final") {
//     // Complete the entire tournament!
//     await Tournament.findByIdAndUpdate(tournamentId, { status: "Completed" });
//     return;
//   }

//   // Update target node slot with winner
//   const targetSeries = await Series.findOne({
//     knockout: completedSeries.knockout,
//     roundName: targetRoundName,
//   });
//   if (targetSeries) {
//     targetSeries[slotKey] = winnerId;
//     await targetSeries.save();

//     // If both nodes are ready, generate matches for the upcoming bracket node
//     if (targetSeries.player1 && targetSeries.player2) {
//       targetSeries.status = "Active";
//       await targetSeries.save();

//       const newMatches = [];
//       if (targetRoundName.includes("Semi-Final")) {
//         // Semi-Finals: 2 legs
//         newMatches.push(
//           {
//             tournament: tournamentId,
//             knockout: completedSeries.knockout,
//             series: targetSeries._id,
//             round: `${targetRoundName} - Leg 1`,
//             team1: targetSeries.player2,
//             team2: targetSeries.player1,
//             status: "Unpublished",
//           },
//           {
//             tournament: tournamentId,
//             knockout: completedSeries.knockout,
//             series: targetSeries._id,
//             round: `${targetRoundName} - Leg 2`,
//             team1: targetSeries.player1,
//             team2: targetSeries.player2,
//             status: "Unpublished",
//           },
//         );
//       } else if (targetRoundName === "Grand Final") {
//         // Grand Final: 1 leg showdown
//         newMatches.push({
//           tournament: tournamentId,
//           knockout: completedSeries.knockout,
//           series: targetSeries._id,
//           round: "Grand Final",
//           team1: targetSeries.player1,
//           team2: targetSeries.player2,
//           status: "Unpublished",
//         });
//       }

//       const inserted = await Match.insertMany(newMatches);
//       const historyLogs = [];

//       for (const m of inserted) {
//         await Series.findByIdAndUpdate(targetSeries._id, {
//           $push: { matches: m._id },
//         });
//         await Knockout.findByIdAndUpdate(completedSeries.knockout, {
//           $push: { "rounds.0.matches": m._id },
//         });

//         historyLogs.push(
//           {
//             player: m.team1,
//             opponent: m.team2,
//             match: m._id,
//             tournament: tournamentId,
//             result: "Pending",
//           },
//           {
//             player: m.team2,
//             opponent: m.team1,
//             match: m._id,
//             tournament: tournamentId,
//             result: "Pending",
//           },
//         );
//       }
//       await MatchHistory.insertMany(historyLogs);
//     }
//   }
// };

// // Add this near your other functions

//? new function to update Phase 3 scores and handle bracket progression

// ==========================================
// PHASE 3 SCORE SUBMISSION & AUTO-ADVANCEMENT
// ==========================================
const updateUclPhase3Score = async (payload) => {
  const { _id: matchId, team1_score, team2_score, winnerId } = payload;

  const match = await Match.findById(matchId).populate("series knockout");
  if (!match) throw new ApiError(404, "Match not found");

  const series = await Series.findById(match.series._id).populate("matches");
  if (!series) throw new ApiError(404, "Series not found");

  // --- 1. PRE-EMPTIVE LEG 1 VALIDATION ---
  if (series.bestOf === 2) {
    const leg1 = series.matches.find((m) => m.round.includes("Leg 1"));
    const leg2 = series.matches.find((m) => m.round.includes("Leg 2"));

    if (match._id.toString() === leg2._id.toString()) {
      if (!leg1 || leg1.status !== "Completed") {
        throw new ApiError(
          400,
          "Leg 1 must be completed before submitting the score for Leg 2.",
        );
      }
    }
  }

  // --- 2. UPDATE INDIVIDUAL MATCH FIRST ---
  match.team1_score = team1_score;
  match.team2_score = team2_score;
  match.status = "Completed";

  if (team1_score > team2_score) match.winner = match.team1;
  else if (team2_score > team1_score) match.winner = match.team2;
  else match.winner = null;

  await match.save();
  await updateMatchHistoryHelper(match);

  // --- 3. RE-FETCH SERIES TO CHECK COMPLETION ---
  const updatedSeries = await Series.findById(match.series._id).populate(
    "matches",
  );

  // Natively check if all matches in this series are now completed
  const isSeriesComplete = updatedSeries.matches.every(
    (m) => m.status === "Completed",
  );

  if (isSeriesComplete) {
    let seriesWinner = null;

    if (updatedSeries.bestOf === 2) {
      // Re-calculate aggregates from the DB for absolute safety
      let finalP1Agg = 0;
      let finalP2Agg = 0;

      updatedSeries.matches.forEach((m) => {
        if (m.team1.toString() === updatedSeries.player1.toString()) {
          finalP1Agg += m.team1_score;
          finalP2Agg += m.team2_score;
        } else {
          finalP1Agg += m.team2_score;
          finalP2Agg += m.team1_score;
        }
      });

      if (finalP1Agg > finalP2Agg) seriesWinner = updatedSeries.player1;
      else if (finalP2Agg > finalP1Agg) seriesWinner = updatedSeries.player2;
      else {
        if (!winnerId) {
          // Revert match status to allow shootout input
          match.status = "Scheduled";
          await match.save();
          throw new ApiError(
            400,
            `Aggregate tied at ${finalP1Agg}-${finalP2Agg}. A shootout winner is required.`,
          );
        }
        seriesWinner = winnerId;
      }
    } else {
      // Grand Final single-leg logic
      if (match.winner === null && !winnerId) {
        match.status = "Scheduled";
        await match.save();
        throw new ApiError(
          400,
          "The Grand Final cannot end in a draw. A shootout winner is required.",
        );
      }
      seriesWinner = match.winner === null ? winnerId : match.winner;
    }

    updatedSeries.winner = seriesWinner;
    updatedSeries.status = "Completed";
    await updatedSeries.save();

    // --- 4. FORCE ADVANCEMENT ---
    await handleBracketAdvancement(
      updatedSeries,
      seriesWinner,
      match.tournament,
    );
  }

  return {
    success: true,
    message: "Phase 3 match updated successfully.",
    match,
  };
};

// ==========================================
// DIRECT DATABASE BRACKET ADVANCEMENT
// ==========================================
const handleBracketAdvancement = async (
  completedSeries,
  winnerId,
  tournamentId,
) => {
  if (!winnerId) return; // Guard clause

  const roundName = completedSeries.roundName;
  let targetRoundName = "";
  let slotKey = "";

  // Map current node resolutions to parent nodes using strict includes
  if (roundName.includes("Quarter-Final A")) {
    targetRoundName = "Semi-Final 1";
    slotKey = "player1";
  } else if (roundName.includes("Quarter-Final B")) {
    targetRoundName = "Semi-Final 1";
    slotKey = "player2";
  } else if (roundName.includes("Quarter-Final C")) {
    targetRoundName = "Semi-Final 2";
    slotKey = "player1";
  } else if (roundName.includes("Quarter-Final D")) {
    targetRoundName = "Semi-Final 2";
    slotKey = "player2";
  } else if (roundName.includes("Semi-Final 1")) {
    targetRoundName = "Grand Final";
    slotKey = "player1";
  } else if (roundName.includes("Semi-Final 2")) {
    targetRoundName = "Grand Final";
    slotKey = "player2";
  } else if (roundName.includes("Grand Final")) {
    // Complete the entire tournament!
    await Tournament.findByIdAndUpdate(tournamentId, { status: "Completed" });
    return;
  }

  if (!targetRoundName) return;

  // --- CRITICAL FIX: DIRECT MONGO DB ATOMIC UPDATE ---
  // This bypasses Mongoose hydration bugs and forcefully injects the player ID into the database.
  const targetSeries = await Series.findOneAndUpdate(
    { knockout: completedSeries.knockout, roundName: targetRoundName },
    { $set: { [slotKey]: winnerId } },
    { new: true }, // Return the updated document
  );

  // If both players have now been pushed into the target series...
  if (targetSeries && targetSeries.player1 && targetSeries.player2) {
    // Prevent duplicate match generation if an admin amends a score later
    if (targetSeries.matches && targetSeries.matches.length > 0) {
      console.log(
        `Matches already generated for ${targetRoundName}. Bypassing duplication.`,
      );
      return;
    }

    targetSeries.status = "Active";
    await targetSeries.save();

    const newMatches = [];
    if (targetRoundName.includes("Semi-Final")) {
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
    } else if (targetRoundName.includes("Grand Final")) {
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

    if (newMatches.length > 0) {
      const inserted = await Match.insertMany(newMatches);
      const matchIds = inserted.map((m) => m._id);

      // Link matches to the target Series
      await Series.findByIdAndUpdate(targetSeries._id, {
        $push: { matches: { $each: matchIds } },
      });

      // Push matches to the overarching Knockout Document securely using positional operator
      await Knockout.updateOne(
        { _id: completedSeries.knockout, "rounds.roundName": "Bracket Phase" },
        { $push: { "rounds.$.matches": { $each: matchIds } } },
      );

      const historyLogs = [];
      for (const m of inserted) {
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

// ==========================================
// EMERGENCY BRACKET FORCE-SYNC ENGINE
// ==========================================
const syncPhase3Bracket = async (tournamentId) => {
  const tournament = await Tournament.findById(tournamentId);
  if (!tournament) throw new ApiError(404, "Tournament not found");

  const phase3 = await Knockout.findOne({
    tournament: tournamentId,
    name: "Phase 3: The Knockout Stage",
  });
  if (!phase3) throw new ApiError(404, "Phase 3 Knockout not found");

  // Fetch all series for Phase 3 and populate their matches
  const seriesList = await Series.find({ knockout: phase3._id }).populate(
    "matches",
  );

  const getSeries = (name) => seriesList.find((s) => s.roundName === name);
  const qfA = getSeries("Quarter-Final A");
  const qfB = getSeries("Quarter-Final B");
  const qfC = getSeries("Quarter-Final C");
  const qfD = getSeries("Quarter-Final D");
  const sf1 = getSeries("Semi-Final 1");
  const sf2 = getSeries("Semi-Final 2");
  const gf = getSeries("Grand Final");

  // Helper function to definitively calculate the winner of a series from DB state
  const evaluateSeries = async (series) => {
    if (!series) return null;
    if (series.winner) return series.winner; // Already has a winner

    // If no winner is saved, but matches exist and are completed, force evaluate it
    if (
      series.matches.length > 0 &&
      series.matches.every((m) => m.status === "Completed")
    ) {
      let p1Agg = 0;
      let p2Agg = 0;
      series.matches.forEach((m) => {
        if (m.team1.toString() === series.player1.toString()) {
          p1Agg += m.team1_score;
          p2Agg += m.team2_score;
        } else {
          p1Agg += m.team2_score;
          p2Agg += m.team1_score;
        }
      });

      if (p1Agg > p2Agg) series.winner = series.player1;
      else if (p2Agg > p1Agg) series.winner = series.player2;
      else return null; // Still needs penalty logic

      series.status = "Completed";
      await series.save();
      return series.winner;
    }
    return null;
  };

  // 1. Evaluate all Quarter Finals
  const winnerA = await evaluateSeries(qfA);
  const winnerB = await evaluateSeries(qfB);
  const winnerC = await evaluateSeries(qfC);
  const winnerD = await evaluateSeries(qfD);

  const matchesToInsert = [];

  // 2. Process Semi-Final 1
  if (winnerA && winnerB && sf1) {
    sf1.player1 = winnerA;
    sf1.player2 = winnerB;

    // Only generate if matches don't exist yet
    if (!sf1.matches || sf1.matches.length === 0) {
      sf1.status = "Active";
      matchesToInsert.push(
        {
          tournament: tournamentId,
          knockout: phase3._id,
          series: sf1._id,
          round: "Semi-Final 1 - Leg 1",
          team1: winnerB,
          team2: winnerA,
          status: "Unpublished",
        },
        {
          tournament: tournamentId,
          knockout: phase3._id,
          series: sf1._id,
          round: "Semi-Final 1 - Leg 2",
          team1: winnerA,
          team2: winnerB,
          status: "Unpublished",
        },
      );
    }
    await sf1.save();
  }

  // 3. Process Semi-Final 2 (This targets your exact broken state)
  if (winnerC && winnerD && sf2) {
    sf2.player1 = winnerC;
    sf2.player2 = winnerD;

    if (!sf2.matches || sf2.matches.length === 0) {
      sf2.status = "Active";
      matchesToInsert.push(
        {
          tournament: tournamentId,
          knockout: phase3._id,
          series: sf2._id,
          round: "Semi-Final 2 - Leg 1",
          team1: winnerD,
          team2: winnerC,
          status: "Unpublished",
        },
        {
          tournament: tournamentId,
          knockout: phase3._id,
          series: sf2._id,
          round: "Semi-Final 2 - Leg 2",
          team1: winnerC,
          team2: winnerD,
          status: "Unpublished",
        },
      );
    }
    await sf2.save();
  }

  // 4. Process Grand Final
  const winnerSF1 = await evaluateSeries(sf1);
  const winnerSF2 = await evaluateSeries(sf2);

  if (winnerSF1 && winnerSF2 && gf) {
    gf.player1 = winnerSF1;
    gf.player2 = winnerSF2;

    if (!gf.matches || gf.matches.length === 0) {
      gf.status = "Active";
      matchesToInsert.push({
        tournament: tournamentId,
        knockout: phase3._id,
        series: gf._id,
        round: "Grand Final",
        team1: winnerSF1,
        team2: winnerSF2,
        status: "Unpublished",
      });
    }
    await gf.save();
  }

  // 5. Bulk Insert New Matches & History Logs securely
  if (matchesToInsert.length > 0) {
    const inserted = await Match.insertMany(matchesToInsert);
    const historyLogs = [];

    for (const m of inserted) {
      await Series.findByIdAndUpdate(m.series, { $push: { matches: m._id } });
      await Knockout.findByIdAndUpdate(phase3._id, {
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

  return { success: true, message: "Bracket forcefully synced and fixed!" };
};

export const UclServices = {
  generatePhase1GroupStage,
  registerUCLPlayers,
  generatePhase2Playoffs,
  updateUclTwoLeggedScore,
  generatePhase3Knockout,
  updateUclPhase3Score,
  syncPhase3Bracket,
};
