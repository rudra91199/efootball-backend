import { updateMatchHistoryHelper } from "../../helpers/match.helper.js";
import { Match } from "../match/match.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";

async function findMissingMatchHistoriesaAndGenerate() {
  try {
    const missingHistories = await Match.aggregate([
      {
        // 1. Join using the exact MongoDB collection name Mongoose generated
        $lookup: {
          from: "matchhistories",
          localField: "_id",
          foreignField: "match",
          as: "histories",
        },
      },
      {
        // 2. Filter out matches that have exactly 2 histories
        $match: {
          $expr: {
            $lt: [{ $size: "$histories" }, 2],
          },
        },
      },
    ]);

    for (const m of missingHistories) {
      const historyDocs = [];
      const existingHistoryCount = m.histories.length;

      // Only insert if NO histories exist
      if (existingHistoryCount === 0) {
        historyDocs.push({
          player: m.team1, // Ensure this is the correct ID type for your schema
          opponent: m.team2,
          match: m._id,
          tournament: m.tournament,
          result: "Pending",
        });
        historyDocs.push({
          player: m.team2,
          opponent: m.team1,
          match: m._id,
          tournament: m.tournament,
          result: "Pending",
        });
      } else if (existingHistoryCount === 1) {
        console.warn(
          `Match ${m._id} has exactly 1 history. Manual check required to avoid duplicates.`,
        );
        // Add logic here to insert only the missing half
      }
      console.log("historyDocs =>", historyDocs);

      if (historyDocs.length > 0) {
        console.log(
          `Inserting ${historyDocs.length} histories for match =>`,
          m._id,
        );

        // This will now properly wait for the insert to finish
        const newHistories = await MatchHistory.insertMany(historyDocs);

        if (newHistories && newHistories.length > 0) {
          // This will now properly wait for the helper function to finish
          await updateMatchHistoryHelper(m);
        }
      }
    }

    console.log(
      `Found ${missingHistories.length} matches missing complete histories.`,
    );
    const count = missingHistories.length;
    return { missingHistories, count };
  } catch (error) {
    console.error("Error finding missing match histories:", error);
    throw error;
  }
}

export async function getMatchesWithPendingHistories() {
  try {
    const pendingMatches = await Match.aggregate([
      {
        // 1. Attach the match histories
        $lookup: {
          from: "matchhistories",
          localField: "_id",
          foreignField: "match",
          as: "histories",
        },
      },
      {
        // 2. Filter for matches where ANY history has a result of "Pending"
        $match: {
          "histories.result": "Pending",
        },
      },
      // Note: No $project stage is used, so this returns the full Match document
      // along with the complete "histories" array attached to it.
    ]);

    console.log(pendingMatches);

    for (const match of pendingMatches) {
      await updateMatchHistoryHelper(match);
    }

    console.log(
      `Found ${pendingMatches.length} matches with pending histories.`,
    );
    const count = pendingMatches.length;
    return { pendingMatches, count };
  } catch (error) {
    console.error("Error finding pending match histories:", error);
    throw error;
  }
}

export const fixServices = {
  findMissingMatchHistoriesaAndGenerate,
  getMatchesWithPendingHistories,
};
