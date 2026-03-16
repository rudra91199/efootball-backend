import ApiError from "../../errors/ApiError.js";
import { User } from "./user.model.js";
import bcrypt from "bcryptjs";
import { createToken } from "./user.utils.js";
import cloudinary from "../../config/cloudinary.config.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import mongoose, { get } from "mongoose";
import { Tournament } from "../tournaments/tournament.model.js";
import { Team } from "../team/team.model.js";
import { Match } from "../match/match.model.js";
import { DisciplinaryAction } from "../disciplinaryActions/disciplinaryActions.model.js";

const registerUserIntoDb = async (userData) => {
  try {
    const userAlreadyExists = await User.findOne({ email: userData.email });
    if (userAlreadyExists) {
      throw new ApiError(400, "User already exists.");
    }

    if (userData.image) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        userData.image,
        {
          upload_preset: "efootball",
          transformation: { fetch_format: "auto", quality: "auto" },
        },
      );
      userData.image = { url: secure_url, public_id };
    }

    const hashedPassword = await bcrypt.hash(userData.password, 10);

    const user = new User({
      ...userData,
      password: hashedPassword,
    });

    await user.save();

    return user;
  } catch (error) {
    throw new ApiError(error.statusCode || 500, error.message);
  }
};

const login = async (credentials) => {
  const { email, password } = credentials;
  const user = await User.findOne({ email });
  if (!user) {
    throw new ApiError(400, "Invalid Credentials.");
  }
  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid Credentials.");
  }

  const token = createToken(
    { userId: user._id, role: user.role },
    process.env.JWT_SECRET,
    "7d",
  );

  await User.findByIdAndUpdate(user._id, { lastLogin: new Date() });

  return {
    token,
    password: null,
    ...user._doc,
  };
};

const checkAuth = async (userId) => {
  const user = await User.findById(userId).select("-password");
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  return user;
};

const editProfile = async (userId, profileData) => {
  const { image, newImage, ...rest } = profileData;
  let userImage = image;
  try {
    if (newImage) {
      await cloudinary.uploader.destroy(userImage?.public_id);
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        newImage,
        {
          upload_preset: "efootball",
          transformation: { fetch_format: "auto", quality: "auto" },
        },
      );
      userImage = { url: secure_url, public_id };
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { ...rest, image: userImage },
      { new: true },
    ).select("-password");
    const { name, inGameUserName, inGameUserId, phone, phoneModel, image } =
      updatedUser;
    return {
      name,
      inGameUserName,
      inGameUserId,
      phone,
      phoneModel,
      image,
    };
  } catch (error) {
    throw new ApiError(500, "Error updating profile.");
  }
};

const changePassword = async (userId, currentPassword, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) {
    throw new ApiError(400, "Current password is incorrect.");
  }
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  user.password = hashedPassword;
  await user.save();
  return true;
};

const changePasswordAdmin = async (userId, newPassword) => {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, "User not found.");
  const hashedPassword = await bcrypt.hash(newPassword, 12);
  user.password = hashedPassword;
  await user.save();
  return true;
};

const getAllUsersFromDB = async () => {
  const users = await User.find().select("-password");
  return users;
};

const getUserBasicInfo = async (userId) => {
  const user = await User.findById(userId).select(
    "name inGameUserId inGameUserName image phoneModel",
  );
  if (!user) throw new ApiError(404, "User not found.");
  return user;
};

const getAllUsersFroRegistration = async () => {
  const users = await User.find().select(
    "name email role inGameUserId inGameUserName baseTeamName",
  );
  return users;
};

export async function findTournamentsForPlayer(playerId) {
  try {
    const tournaments = await MatchHistory.aggregate([
      // Stage 1: Find all match records for the specified player
      {
        $match: {
          player: new mongoose.Types.ObjectId(playerId),
        },
      },
      // Stage 2: Group by tournament to get a unique list of tournament IDs
      {
        $group: {
          _id: "$tournament",
        },
      },
      // Stage 3: Join with the 'tournaments' collection to get the details
      {
        $lookup: {
          from: "tournaments", // The name of your tournaments collection
          localField: "_id",
          foreignField: "_id",
          as: "tournamentInfo",
        },
      },
      // Stage 4: Reshape the document to only show the tournament info
      {
        $replaceRoot: {
          newRoot: { $arrayElemAt: ["$tournamentInfo", 0] },
        },
      },
      // Stage 5: Project only the fields you need (name and _id)
      {
        $project: {
          _id: 1,
          name: 1,
        },
      },
    ]);

    return tournaments;
  } catch (error) {
    console.error("Error finding tournaments for player:", error);
    return [];
  }
}

export async function generateGlobalPlayerLeaderboard() {
  try {
    const globalLeaderboard = await MatchHistory.aggregate([
      // Stage 1: Group all match records by player and calculate stats
      {
        $match: {
          result: { $ne: "Pending" },
        },
      },
      // --- NEW: Sort matches by creation date (newest first) ---
      {
        $sort: { createdAt: -1 }
      },
      {
        $group: {
          _id: "$player",
          matchesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
          goalsScored: { $sum: "$scoreFor" },
          goalsConceded: { $sum: "$scoreAgainst" },
          // --- NEW: Push all results into an array (already sorted newest to oldest) ---
          allResults: { $push: "$result" }
        },
      },

      // Stage 2: Add calculated fields
      {
        $addFields: {
          goalDifference: { $subtract: ["$goalsScored", "$goalsConceded"] },
          points: {
            $add: [{ $multiply: ["$wins", 3] }, "$draws"],
          },
          winRate: {
            $cond: {
              if: { $gt: ["$matchesPlayed", 0] },
              then: {
                $multiply: [{ $divide: ["$wins", "$matchesPlayed"] }, 100],
              },
              else: 0,
            },
          },
          // --- NEW: Take the top 5 results for recent form ---
          recentForm: { $slice: ["$allResults", 5] }
        },
      },

      // Stage 3: Round the winRate
      {
        $addFields: {
          winRate: { $round: ["$winRate", 2] },
        },
      },

      // Stage 4: Join with the users collection to get player details
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "playerInfo",
        },
      },

      // Stage 5: Clean up the playerInfo field
      {
        $unwind: "$playerInfo",
      },

      // Stage 6: Sort by points first
      {
        $sort: {
          points: -1, // 1. Sort by points descending
          goalDifference: -1, // 2. Then by goal difference descending
          goalsScored: -1, // 3. Then by goals scored descending
        },
      },

      // Stage 7: Clean up unnecessary fields and Limit
      {
        $project: {
          allResults: 0 // Remove the large array from final output to save bandwidth
        }
      },
      {
        $limit: 100,
      },
    ]);

    return globalLeaderboard;
  } catch (error) {
    console.error("Error generating global leaderboard:", error);
    return [];
  }
}

export async function generatePlayerLeaderboard(tournamentId) {
  try {
    const leaderboard = await MatchHistory.aggregate([
      // Stage 1: Filter for the correct tournament
      {
        $match: {
          tournament: new mongoose.Types.ObjectId(tournamentId),
          result: { $ne: "Pending" },
        },
      },
      // --- NEW: Sort matches by creation date (newest first) ---
      {
        $sort: { createdAt: -1 }
      },
      // Stage 2: Group records by player and calculate stats
      {
        $group: {
          _id: "$player",
          matchesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
          goalsScored: { $sum: "$scoreFor" },
          goalsConceded: { $sum: "$scoreAgainst" },
          // --- NEW: Push all results into an array ---
          allResults: { $push: "$result" }
        },
      },

      // Stage 3: Add calculated fields, including Points
      {
        $addFields: {
          goalDifference: { $subtract: ["$goalsScored", "$goalsConceded"] },
          points: {
            $add: [{ $multiply: ["$wins", 3] }, "$draws"],
          },
          // --- NEW: Take the top 5 results for recent form ---
          recentForm: { $slice: ["$allResults", 5] }
        },
      },

      // Stage 4: Join with the users collection to get player details
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "playerInfo",
        },
      },

      // Stage 5: Clean up the playerInfo field
      {
        $unwind: "$playerInfo",
      },

      // Stage 6: Sort by points first
      {
        $sort: {
          points: -1, // 1. Sort by points descending
          goalDifference: -1, // 2. Then by goal difference descending
          goalsScored: -1, // 3. Then by goals scored descending
        },
      },

      // Stage 7: Clean up unnecessary fields
      {
        $project: {
          allResults: 0 // Keep API response clean
        }
      }
    ]);

    return leaderboard;
  } catch (error) {
    console.error("Error generating player leaderboard:", error);
    return [];
  }
}

const getPlayerTournamentMatches = async (tournamentId, playerId) => {
  // Find all non-pending matches for this specific player in this specific tournament
  const matches = await MatchHistory.find({
    tournament: tournamentId,
    player: playerId,
    result: { $ne: "Pending" },
  })
    // Populate the opponent's details from the User schema
    .populate("opponent", "name inGameUserName image")
    // Sort by most recent matches first
    .sort({ createdAt: -1 });

  return matches;
};

export async function generatePlayerSeasonStats(playerId) {
  try {
    const seasonStats = await MatchHistory.aggregate([
      // Stage 1: Find all matches for the specified player
      {
        $match: {
          player: new mongoose.Types.ObjectId(playerId),
        },
      },
      // Stage 2: Group matches by the YEAR of the `createdAt` timestamp
      {
        $group: {
          _id: { $year: "$createdAt" }, // <-- This extracts the year
          matchesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
          goalsScored: { $sum: "$scoreFor" },
          tournaments: { $addToSet: "$tournament" },
        },
      },
      // Stage 3: Add calculated fields
      {
        $addFields: {
          winRate: {
            $cond: {
              if: { $gt: ["$wins", 0] },
              then: {
                $multiply: [{ $divide: ["$wins", "$matchesPlayed"] }, 100],
              },
              else: 0,
            },
          },
          goalsPerMatch: {
            $cond: {
              if: { $gt: ["$matchesPlayed", 0] },
              then: { $divide: ["$goalsScored", "$matchesPlayed"] },
              else: 0,
            },
          },
          tournamentsPlayed: { $size: "$tournaments" },
        },
      },
      // Stage 4: Sort by season, most recent first
      {
        $sort: {
          _id: -1,
        },
      },
      // Stage 5: Reshape the final output
      {
        $project: {
          _id: 0,
          season: { $toString: "$_id" }, // Convert the year number to a string
          matches: "$matchesPlayed",
          wins: "$wins",
          draws: "$draws",
          losses: "$losses",
          goals: "$goalsScored",
          tournaments: "$tournamentsPlayed",
          winRate: { $round: ["$winRate", 1] },
          gmAvg: { $round: ["$goalsPerMatch", 1] },
        },
      },
    ]);

    return seasonStats;
  } catch (error) {
    console.error("Error generating season stats:", error);
    return [];
  }
}

export async function getPlayerMatchHistory(playerId) {
  try {
    // Find all history records for this player
    const history = await MatchHistory.find({ player: playerId })
      // Sort by the creation date, newest first
      .sort({ createdAt: -1 })
      // Populate the opponent's details (we only need their name)
      .populate("opponent", "name")
      // Populate the tournament's details (we only need its name)
      .populate("tournament", "name");

    return history;
  } catch (error) {
    console.error("Error fetching player match history:", error);
    return [];
  }
}

const getHeadToHeadStats = async (player1Id, player2Id) => {
  try {
    // 1. Fetch only completed matches between these two specific players
    const h2hMatches = await MatchHistory.find({
      player: player1Id,
      opponent: player2Id,
      result: { $ne: "Pending" },
    })
      .sort({ createdAt: -1 }) // Newest matches first
      .populate("tournament", "name")
      .populate("opponent", "name inGameUserName"); // Get the tournament name

    // 2. Calculate the Tale of the Tape stats
    let player1Wins = 0;
    let player2Wins = 0;
    let draws = 0;
    let player1Goals = 0;
    let player2Goals = 0;

    h2hMatches.forEach((match) => {
      if (match.result === "Win") player1Wins++;
      else if (match.result === "Loss") player2Wins++;
      else draws++;

      player1Goals += match.scoreFor;
      player2Goals += match.scoreAgainst;
    });

    return {
      totalMatches: h2hMatches.length,
      player1Wins,
      player2Wins,
      draws,
      player1Goals,
      player2Goals,
      winRate: h2hMatches.length > 0 ? Math.round((player1Wins / h2hMatches.length) * 100) : 0,
      matches: h2hMatches, // The actual list of past matches to display
    };
  } catch (error) {
    console.error("Error generating H2H stats:", error);
    throw new ApiError(500, "Failed to fetch Head-to-Head data.");
  }
};

export async function calculateStreaks(playerId) {
  // Fetch all matches for the player, sorted oldest to newest
  const history = await MatchHistory.find({ player: playerId }).sort({
    createdAt: 1,
  });

  let longestWinStreak = 0;
  let currentWinStreak = 0;
  let longestUnbeatenStreak = 0;
  let currentUnbeatenStreak = 0;

  for (const match of history) {
    // Check win streak
    if (match.result === "Win") {
      currentWinStreak++;
    } else {
      longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
      currentWinStreak = 0;
    }

    // Check unbeaten streak
    if (match.result === "Win" || match.result === "Draw") {
      currentUnbeatenStreak++;
    } else {
      longestUnbeatenStreak = Math.max(
        longestUnbeatenStreak,
        currentUnbeatenStreak,
      );
      currentUnbeatenStreak = 0;
    }
  }

  // Final check in case the streak was ongoing at the end
  longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
  longestUnbeatenStreak = Math.max(
    longestUnbeatenStreak,
    currentUnbeatenStreak,
  );

  return { longestWinStreak, longestUnbeatenStreak };
}

export async function generatePlayerCareerHighlights(playerId) {
  try {
    const objectPlayerId = new mongoose.Types.ObjectId(playerId);

    // --- 1. Pre-calculate Tournament Wins ---
    // Find all teams the player has been on
    const playerTeams = await Team.find({ players: objectPlayerId });
    const playerTeamIds = playerTeams.map((t) => t._id);
    const tournamentsPlayed = await Tournament.find({
      $or: [{ teams: { $in: playerTeamIds } }, { players: objectPlayerId }],
    }).countDocuments();
    const tournamentsWon = await Tournament.find({
      $or: [{ champion: { $in: playerTeamIds } }, { champion: playerId }],
    }).countDocuments();
    const stats = await MatchHistory.aggregate([
      // 1. Find all matches for this player
      {
        $match: {
          player: new mongoose.Types.ObjectId(playerId),
        },
      },
      // 2. Group all matches together to calculate totals
      {
        $group: {
          _id: null,
          totalMatches: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
          totalGoals: { $sum: "$scoreFor" },
          motmAwards: { $sum: { $cond: ["$isManOfTheMatch", 1, 0] } },

          // --- REVISED LOGIC ---
          // Count a clean sheet if the opponent's score was 0
          cleanSheets: {
            $sum: { $cond: [{ $eq: ["$scoreAgainst", 0] }, 1, 0] },
          },
        },
      },
      {
        $project: {
          _id: 0,
          totalMatches: 1,
          wins: 1,
          draws: 1,
          losses: 1,
          totalGoals: 1,
          motmAwards: 1,
          cleanSheets: 1,
          winRate: {
            $cond: {
              if: { $gt: ["$totalMatches", 0] },
              then: {
                $multiply: [{ $divide: ["$wins", "$totalMatches"] }, 100],
              },
              else: 0,
            },
          },
          goalsPerMatch: {
            $cond: {
              if: { $gt: ["$totalMatches", 0] },
              then: { $divide: ["$totalGoals", "$totalMatches"] },
              else: 0,
            },
          },
        },
      },
    ]);

    return { tournamentsWon, tournamentsPlayed, ...stats[0] } || null;
  } catch (error) {
    console.error("Error generating career highlights:", error);
    return null;
  }
}

export async function generateScoringRecords(playerId) {
  try {
    const records = await MatchHistory.aggregate([
      // 1. Find all matches for this player where they scored at least one goal
      {
        $match: {
          player: new mongoose.Types.ObjectId(playerId),
          scoreFor: { $gt: 0 },
        },
      },
      // 2. Group all matches to get the totals
      {
        $group: {
          _id: null,
          careerGoals: { $sum: "$scoreFor" },
          // Count Braces (2 goals)
          braces: {
            $sum: { $cond: [{ $eq: ["$scoreFor", 2] }, 1, 0] },
          },
          // Count standard hat-tricks (3-5 goals)
          hatTricks: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$scoreFor", 3] }, { $lt: ["$scoreFor", 6] }],
                },
                1,
                0,
              ],
            },
          },
          // Count double hat-tricks (6-8 goals)
          doubleHatTricks: {
            $sum: {
              $cond: [
                {
                  $and: [{ $gte: ["$scoreFor", 6] }, { $lt: ["$scoreFor", 9] }],
                },
                1,
                0,
              ],
            },
          },
          // Count triple hat-tricks (9+ goals)
          tripleHatTricks: {
            $sum: { $cond: [{ $gte: ["$scoreFor", 9] }, 1, 0] },
          },
        },
      },
      // 3. Clean up the output
      { $project: { _id: 0 } },
    ]);

    return (
      records[0] || {
        careerGoals: 0,
        braces: 0,
        hatTricks: 0,
        doubleHatTricks: 0,
        tripleHatTricks: 0,
      }
    );
  } catch (error) {
    console.error("Error generating scoring records:", error);
    return null;
  }
}

export async function findAllCareerMilestones(playerId) {
  const objectPlayerId = new mongoose.Types.ObjectId(playerId);

  // --- 1. Pre-calculate Tournament Wins ---
  const playerTeams = await Team.find({ players: objectPlayerId });
  const playerTeamIds = playerTeams.map((t) => t._id);

  const wonTournaments = await Tournament.find({
    $or: [{ champion: { $in: playerTeamIds } }, { champion: objectPlayerId }]
  }).sort({ updatedAt: 1 });

  // --- 2. Fetch the player's entire match history, sorted chronologically ---
  const history = await MatchHistory.find({ player: objectPlayerId }).sort({
    createdAt: 1,
  });

  // --- 3. Initialize tracking variables ---
  const milestones = {};

  if (wonTournaments.length > 0) milestones.tournamentChampion = wonTournaments[0].updatedAt;
  if (wonTournaments.length >= 3) milestones.multiChampion = wonTournaments[2].updatedAt;

  let matchesPlayed = 0;
  let cumulativeWins = 0;
  let cumulativeGoals = 0;
  let cumulativeCleanSheets = 0;
  let cumulativeMOTM = 0;
  let currentWinStreak = 0;
  let currentUnbeatenStreak = 0;

  // --- 4. Loop through history ---
  for (const match of history) {
    matchesPlayed++;
    
    // Match appearance milestones
    if (!milestones.firstMatch) milestones.firstMatch = match.createdAt;
    if (!milestones.veteran50 && matchesPlayed >= 50) milestones.veteran50 = match.createdAt;
    if (!milestones.centurionMatches && matchesPlayed >= 100) milestones.centurionMatches = match.createdAt;

    // Win & Streak logic
    if (match.result === "Win") {
      cumulativeWins++;
      currentWinStreak++;
      currentUnbeatenStreak++;

      if (!milestones.firstWin) milestones.firstWin = match.createdAt;
      if (!milestones.halfCenturyWins && cumulativeWins >= 50) milestones.halfCenturyWins = match.createdAt;
      if (!milestones.centurionWins && cumulativeWins >= 100) milestones.centurionWins = match.createdAt;

      if (!milestones.winStreak5 && currentWinStreak >= 5) milestones.winStreak5 = match.createdAt;
      if (!milestones.winStreak10 && currentWinStreak >= 10) milestones.winStreak10 = match.createdAt;
      if (!milestones.winStreakMaster && currentWinStreak >= 15) milestones.winStreakMaster = match.createdAt;

      if (!milestones.unbeaten10 && currentUnbeatenStreak >= 10) milestones.unbeaten10 = match.createdAt;
      if (!milestones.unbeaten20 && currentUnbeatenStreak >= 20) milestones.unbeaten20 = match.createdAt;

    } else if (match.result === "Draw") {
      currentWinStreak = 0;
      currentUnbeatenStreak++;
      
      if (!milestones.unbeaten10 && currentUnbeatenStreak >= 10) milestones.unbeaten10 = match.createdAt;
      if (!milestones.unbeaten20 && currentUnbeatenStreak >= 20) milestones.unbeaten20 = match.createdAt;
    } else {
      currentWinStreak = 0;
      currentUnbeatenStreak = 0;
    }

    // Goal logic (Single match & Cumulative)
    if (match.scoreFor > 0) {
      if (!milestones.firstGoal) milestones.firstGoal = match.createdAt;
      
      // FIX: >= use করার ফলে যদি কেউ ৬ গোল করে, তবে তার ২,৩,৪,৫ গোলের সব মাইলস্টোনও একসাথে আনলক হয়ে যাবে!
      if (!milestones.brace && match.scoreFor >= 2) milestones.brace = match.createdAt;
      if (!milestones.hatTrickHero && match.scoreFor >= 3) milestones.hatTrickHero = match.createdAt;
      if (!milestones.poker && match.scoreFor >= 4) milestones.poker = match.createdAt;
      if (!milestones.glut && match.scoreFor >= 5) milestones.glut = match.createdAt;
      if (!milestones.doubleHatTrick && match.scoreFor >= 6) milestones.doubleHatTrick = match.createdAt;
      if (!milestones.tripleHatTrick && match.scoreFor >= 9) milestones.tripleHatTrick = match.createdAt;

      cumulativeGoals += match.scoreFor;
      
      // FIX: Cumulative Goals Logic
      if (!milestones.halfCenturyGoals && cumulativeGoals >= 50) milestones.halfCenturyGoals = match.createdAt;
      if (!milestones.centuryClub && cumulativeGoals >= 100) milestones.centuryClub = match.createdAt;
      if (!milestones.doubleCenturyGoals && cumulativeGoals >= 200) milestones.doubleCenturyGoals = match.createdAt;
    }

    // Clean sheet logic
    if (match.scoreAgainst === 0) {
      cumulativeCleanSheets++;
      if (!milestones.firstCleanSheet) milestones.firstCleanSheet = match.createdAt;
      if (!milestones.cleanSheet10 && cumulativeCleanSheets >= 10) milestones.cleanSheet10 = match.createdAt;
      if (!milestones.cleanSheetKing && cumulativeCleanSheets >= 50) milestones.cleanSheetKing = match.createdAt;
    }

    // MOTM logic
    if (match.isManOfTheMatch) {
      cumulativeMOTM++;
      if (!milestones.firstMOTM) milestones.firstMOTM = match.createdAt;
      if (!milestones.motm10 && cumulativeMOTM >= 10) milestones.motm10 = match.createdAt;
      if (!milestones.motm50 && cumulativeMOTM >= 50) milestones.motm50 = match.createdAt;
    }
  }

  return milestones;
}

const issueCardToPlayer = async (issuerId, payload) => {
  const { matchId, playerId, cardType, reason, tournamentId } = payload;
  const player = await User.findById(playerId);
  if (!player) return new ApiError(404, "Player not found.");

  let actionLog;
  // --- Orange Card Logic ---
  if (cardType === "Orange") {
    // Add the player to the match's orange card list.
    await Match.findByIdAndUpdate(matchId, {
      $addToSet: { orangeCardedPlayers: playerId },
    });
  }

  // --- Red Card Logic ---
  if (cardType === "Red") {
    player.isBanned = true;
    const banLiftDate = new Date();
    banLiftDate.setDate(banLiftDate.getDate() + 2); // Add 2 days
    player.banLiftDate = banLiftDate;
  }

  // --- Yellow Card Logic ---
  // (A yellow card is active for 7 days. A second yellow within this time results in a Red Card.)
  if (cardType === "Yellow") {
    const now = new Date();
    // Check if there are any non-expired yellow cards
    const hasActiveYellow = player.activeYellowCards.some(
      (card) => card.expiryDate > now,
    );

    if (hasActiveYellow) {
      // This is the second active yellow card -> becomes a Red Card
      player.isBanned = true;
      const banLiftDate = new Date();
      banLiftDate.setDate(banLiftDate.getDate() + 2); // 2-day ban
      player.banLiftDate = banLiftDate;
      player.activeYellowCards = []; // Clear the yellow cards as they've resulted in a red
    } else {
      // This is the first active yellow card
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7); // Set expiry to 1 week from now
      // We will create the disciplinary log first to get its ID
      actionLog = await DisciplinaryAction.create({
        player: playerId,
        tournament: tournamentId,
        cardType,
        reason,
        issuedBy: issuerId,
      });
      player.activeYellowCards.push({ cardId: actionLog._id, expiryDate });
    }
  }

  await player.save();
  // ... (Log the action in DisciplinaryAction collection for records) ...
  if (!actionLog) {
    actionLog = await DisciplinaryAction.create({
      player: playerId,
      match: cardType === "orange" ? matchId : null,
      tournament: tournamentId,
      cardType,
      reason,
      issuedBy: issuerId,
    });
  }
  return null;
};

const liftPlayerBan = async (playerId) => {
  const updatedPlayer = await User.findByIdAndUpdate(
    playerId,
    { $set: { isBanned: false, banLiftDate: null, activeYellowCards: [] } },
    { new: true },
  );
  return null;
};

const getPlayerComparison = async (player1Id, player2Id, tournamentId) => {
  try {
    const objectP1 = new mongoose.Types.ObjectId(player1Id);
    const objectP2 = new mongoose.Types.ObjectId(player2Id);

    // Helper function to dynamically calculate overall stats (Global or Tournament)
    const getOverallStats = async (playerId) => {
      const matchFilter = { player: playerId, result: { $ne: "Pending" } };
      
      // If a specific tournament is selected, filter by it
      if (tournamentId && tournamentId !== "global") {
        matchFilter.tournament = new mongoose.Types.ObjectId(tournamentId);
      }

      const stats = await MatchHistory.aggregate([
        { $match: matchFilter },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: null,
            matches: { $sum: 1 },
            wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
            draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
            losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
            goalsFor: { $sum: "$scoreFor" },
            goalsAgainst: { $sum: "$scoreAgainst" },
            cleanSheets: { $sum: { $cond: [{ $eq: ["$scoreAgainst", 0] }, 1, 0] } },
            allResults: { $push: "$result" }
          }
        },
        {
          $addFields: {
            winRate: {
              $cond: {
                if: { $gt: ["$matches", 0] },
                then: { $round: [{ $multiply: [{ $divide: ["$wins", "$matches"] }, 100] }, 0] },
                else: 0
              }
            },
            recentForm: { $slice: ["$allResults", 5] } // Last 5 matches form
          }
        },
        { $project: { allResults: 0, _id: 0 } }
      ]);

      return stats[0] || { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, winRate: 0, recentForm: [] };
    };

    // Helper for Direct Head-to-Head stats
    const getDirectH2H = async () => {
      const h2hFilter = { player: objectP1, opponent: objectP2, result: { $ne: "Pending" } };
      if (tournamentId && tournamentId !== "global") {
        h2hFilter.tournament = new mongoose.Types.ObjectId(tournamentId);
      }

      const h2hMatches = await MatchHistory.find(h2hFilter)
        .sort({ createdAt: -1 })
        .populate("tournament", "name");

      let p1Wins = 0, p2Wins = 0, draws = 0, p1Goals = 0, p2Goals = 0, p1CleanSheets = 0, p2CleanSheets = 0;

      h2hMatches.forEach(match => {
        if (match.result === "Win") p1Wins++;
        else if (match.result === "Loss") p2Wins++;
        else draws++;

        p1Goals += match.scoreFor;
        p2Goals += match.scoreAgainst;
        
        if (match.scoreAgainst === 0) p1CleanSheets++;
        if (match.scoreFor === 0) p2CleanSheets++;
      });

      return {
        totalMatches: h2hMatches.length,
        player1Wins: p1Wins,
        player2Wins: p2Wins,
        draws,
        player1Goals: p1Goals,
        player2Goals: p2Goals,
        player1CleanSheets: p1CleanSheets,
        player2CleanSheets: p2CleanSheets,
        matches: h2hMatches.slice(0, 5) // Send only last 5 direct matches to save bandwidth
      };
    };

    // Run all 3 queries concurrently for maximum performance
    const [player1Stats, player2Stats, headToHead] = await Promise.all([
      getOverallStats(objectP1),
      getOverallStats(objectP2),
      getDirectH2H()
    ]);

    // Fetch basic user info
    const [p1Info, p2Info] = await Promise.all([
      User.findById(player1Id).select("name inGameUserName image"),
      User.findById(player2Id).select("name inGameUserName image")
    ]);

    return {
      player1: { info: p1Info, overall: player1Stats },
      player2: { info: p2Info, overall: player2Stats },
      headToHead
    };

  } catch (error) {
    console.error("Error generating comparison:", error);
    throw new ApiError(500, "Failed to fetch comparison data.");
  }
};



export const UserServices = {
  registerUserIntoDb,
  login,
  checkAuth,
  editProfile,
  changePassword,
  changePasswordAdmin,
  //playerData
  getAllUsersFromDB,
  getUserBasicInfo,
  getAllUsersFroRegistration,
  findTournamentsForPlayer,
  generateGlobalPlayerLeaderboard,
  generatePlayerLeaderboard,
  generatePlayerSeasonStats,
  getPlayerTournamentMatches,
  getPlayerMatchHistory,
  getHeadToHeadStats,
  calculateStreaks,
  generatePlayerCareerHighlights,
  generateScoringRecords,
  findAllCareerMilestones,
  issueCardToPlayer,
  liftPlayerBan,
  getPlayerComparison

};
