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
      tournament: tournamentId,
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
    tournament.status = "Live";
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
        select: "name image",
        model: User,
      },
    });
  return knockout;
};
export const KnockoutServices = {
  getKnockoutById,
  generateGauntletKnockout,
};
