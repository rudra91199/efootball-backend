import ApiError from "../../errors/ApiError.js";
import { calculateAndSavePhase2Points } from "../circuitPoint/circuitPoint.services.js";
import { Knockout } from "../knockout/knockout.model.js";
import { generateChampionshipKnockout } from "../knockout/knockout.services.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { Series } from "./series.model.js";

/**
 * ENGINE FOR PHASE 2: GAUNTLET SERIES
 */
export const runPhase2GauntletEngine = async (seriesId, matchWinnerId) => {
  const series = await Series.findById(seriesId);
  // if (series.status === "Completed") return; // Series already handled

  if (matchWinnerId.equals(series.player1)) series.player1_wins += 1;
  else series.player2_wins += 1;

  const winsNeeded = Math.ceil(series.bestOf / 2); // 2 wins for Best-of-3
  let seriesComplete = false;

  if (series.player1_wins >= winsNeeded) {
    series.winner = series.player1;
    series.status = "Completed";
    seriesComplete = true;
  } else if (series.player2_wins >= winsNeeded) {
    series.winner = series.player2;
    series.status = "Completed";
    seriesComplete = true;
  }
  await series.save();

  // If Series is complete, generate the NEXT Series
  if (seriesComplete) {
    const knockout = await Knockout.findById(series.knockout).populate(
      "participants"
    );
    let nextSeries = null;
    let nextRoundName = "";

    const seed1 = knockout.participants[0];
    const seed2 = knockout.participants[1];

    if (series.roundName.includes("Round 1")) {
      nextRoundName = "Gauntlet Round 2";
      nextSeries = new Series({
        knockout: knockout._id,
        tournament: knockout.tournament,
        roundName: nextRoundName,
        player1: series.winner,
        player2: seed2, // Winner vs Seed 2
        bestOf: 3,
        status: "Upcoming",
      });
    } else if (series.roundName.includes("Round 2")) {
      nextRoundName = "Gauntlet Final";
      nextSeries = new Series({
        knockout: knockout._id,
        tournament: knockout.tournament,
        roundName: nextRoundName,
        player1: series.winner,
        player2: seed1, // Winner vs Seed 1
        bestOf: 3,
        status: "Upcoming",
      });
    } else if (series.roundName.includes("Final")) {
      // !! PHASE 2 IS OVER !!
      knockout.status = "Completed";
      await knockout.save();

      // Award P2 Points, then generate P3
      await calculateAndSavePhase2Points(knockout._id);
      await generateChampionshipKnockout(knockout.tournament);
      console.log("Phase 2 complete. P2 points awarded. P3 generated.");
    }

    // Save the next series and link it
    if (nextSeries) {
      await nextSeries.save();
      const roundDoc = knockout.rounds.find(
        (r) => r.roundName === nextRoundName
      );
      if (roundDoc) {
        roundDoc.series.push(nextSeries._id);
        await knockout.save();

        // Generate Game 1 of the new series
        const game1 = await Match.create({
          series: nextSeries._id,
          knockout: knockout._id,
          tournament: knockout.tournament,
          round: `${nextSeries.roundName} - Game 1`,
          team1: nextSeries.player1,
          team2: nextSeries.player2,
          status: "Unpublished",
        });
        nextSeries.matches.push(game1._id);
        await nextSeries.save();

        // Create MatchHistory for Game 1
        await MatchHistory.insertMany([
          {
            player: game1.team1,
            opponent: game1.team2,
            match: game1._id,
            tournament: knockout.tournament,
            result: "Pending",
          },
          {
            player: game1.team2,
            opponent: game1.team1,
            match: game1._id,
            tournament: knockout.tournament,
            result: "Pending",
          },
        ]);
      }
    }
  }
  // If Series is NOT complete, generate the NEXT Match
  else {
    const nextMatchNumber = series.matches.length + 1;
    const nextMatch = await Match.create({
      series: series._id,
      knockout: series.knockout,
      tournament: series.tournament,
      round: `${series.roundName} - Game ${nextMatchNumber}`,
      team1: series.player1,
      team2: series.player2,
      roundStartDate: series.seriesStartDate,
      roundEndDate: series.seriesEndDate,
      status: "Scheduled",
    });
    series.matches.push(nextMatch._id);
    await series.save();

    // Create MatchHistory for this next match
    await MatchHistory.insertMany([
      {
        player: nextMatch.team1,
        opponent: nextMatch.team2,
        match: nextMatch._id,
        tournament: series.tournament,
        result: "Pending",
      },
      {
        player: nextMatch.team2,
        opponent: nextMatch.team1,
        match: nextMatch._id,
        tournament: series.tournament,
        result: "Pending",
      },
    ]);
  }
};

const publishSeries = async (seriesId, payload) => {
  const series = await Series.findById(seriesId);
  if (!series) throw new ApiError(404, "Series not found");
  series.status = "Active";
  series.seriesStartDate = payload.startDateTime;
  series.seriesEndDate = payload.endDateTime;
  const firstMatch = await Match.findById(series.matches[0]);
  firstMatch.status = "Scheduled";
  firstMatch.roundStartDate = payload.startDateTime;
  firstMatch.roundEndDate = payload.endDateTime;
  await firstMatch.save();
  await series.save();
};

export const SeriesService = {
  publishSeries,
};
