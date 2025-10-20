import ApiError from "../../errors/ApiError.js";
import { User } from "./user.model.js";
import bcrypt from "bcryptjs";
import { createToken } from "./user.utils.js";
import cloudinary from "../../config/cloudinary.config.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import mongoose from "mongoose";
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
        }
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
    "7d"
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
        }
      );
      userImage = { url: secure_url, public_id };
    }
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { ...rest, image: userImage },
      { new: true }
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

const getAllUsersFroRegistration = async () => {
  const users = await User.find().select(
    "name email role inGameUserId inGameUserName baseTeamName"
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
        $group: {
          _id: "$player",
          matchesPlayed: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
          losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
          draws: { $sum: { $cond: [{ $eq: ["$result", "Draw"] }, 1, 0] } },
          goalsScored: { $sum: "$scoreFor" },
          goalsConceded: { $sum: "$scoreAgainst" },
        },
      },

      // Stage 2: Add calculated fields
      {
        $addFields: {
          goalDifference: { $subtract: ["$goalsScored", "$goalsConceded"] },
          // --- NEW: Calculate points based on wins and draws ---
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

      // --- Stage 6: REVISED - Sort by points first ---
      {
        $sort: {
          points: -1, // 1. Sort by points descending
          goalDifference: -1, // 2. Then by goal difference descending
          goalsScored: -1, // 3. Then by goals scored descending
        },
      },

      // Stage 7: Limit the leaderboard
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
        },
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
        },
      },

      // Stage 3: Add calculated fields, including Points
      {
        $addFields: {
          goalDifference: { $subtract: ["$goalsScored", "$goalsConceded"] },
          // --- THE FIX: Calculate points ---
          points: {
            $add: [{ $multiply: ["$wins", 3] }, "$draws"],
          },
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

      // Stage 6: REVISED - Sort by points first
      {
        $sort: {
          points: -1, // 1. Sort by points descending
          goalDifference: -1, // 2. Then by goal difference descending
          goalsScored: -1, // 3. Then by goals scored descending
        },
      },
    ]);

    return leaderboard;
  } catch (error) {
    console.error("Error generating player leaderboard:", error);
    return [];
  }
}

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
        currentUnbeatenStreak
      );
      currentUnbeatenStreak = 0;
    }
  }

  // Final check in case the streak was ongoing at the end
  longestWinStreak = Math.max(longestWinStreak, currentWinStreak);
  longestUnbeatenStreak = Math.max(
    longestUnbeatenStreak,
    currentUnbeatenStreak
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
  // Find all teams the player has been on
  const playerTeams = await Team.find({ players: objectPlayerId });
  const playerTeamIds = playerTeams.map((t) => t._id);

  // Find the first tournament won by any of those teams
  const firstWin = await Tournament.findOne({
    champion: { $in: playerTeamIds },
  }).sort({ updatedAt: 1 }); // Find the earliest completed win

  // --- 2. Fetch the player's entire match history, sorted chronologically ---
  const history = await MatchHistory.find({ player: objectPlayerId }).sort({
    createdAt: 1,
  });

  // --- 3. Initialize variables to track progress ---
  const milestones = {
    tournamentChampion: firstWin ? firstWin.updatedAt : null,
  };
  let cumulativeGoals = 0;
  let cumulativeCleanSheets = 0;
  let currentWinStreak = 0;

  // --- 4. Loop through the history to find the date of each milestone ---
  for (const match of history) {
    // Check for goal-based milestones
    if (!milestones.firstGoal && match.scoreFor > 0) {
      milestones.firstGoal = match.createdAt;
    }
    if (!milestones.hatTrickHero && match.scoreFor >= 3) {
      milestones.hatTrickHero = match.createdAt;
    }
    if (!milestones.doubleHatTrick && match.scoreFor >= 6) {
      milestones.doubleHatTrick = match.createdAt;
    }
    if (!milestones.tripleHatTrick && match.scoreFor >= 9) {
      milestones.tripleHatTrick = match.createdAt;
    }

    // Check for cumulative goals (Century Club)
    const goalsBeforeThisMatch = cumulativeGoals;
    cumulativeGoals += match.scoreFor;
    if (
      !milestones.centuryClub &&
      goalsBeforeThisMatch < 100 &&
      cumulativeGoals >= 100
    ) {
      milestones.centuryClub = match.createdAt;
    }

    // Check for cumulative clean sheets
    if (match.scoreAgainst === 0) {
      cumulativeCleanSheets++;
      if (!milestones.cleanSheetKing && cumulativeCleanSheets >= 50) {
        milestones.cleanSheetKing = match.createdAt;
      }
    }

    // Check for win streak
    if (match.result === "Win") {
      currentWinStreak++;
      if (!milestones.winStreakMaster && currentWinStreak >= 15) {
        milestones.winStreakMaster = match.createdAt;
      }
    } else {
      currentWinStreak = 0; // Reset streak on a loss or draw
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
      (card) => card.expiryDate > now
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
    { new: true }
  );
  return null;
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
  getAllUsersFroRegistration,
  findTournamentsForPlayer,
  generateGlobalPlayerLeaderboard,
  generatePlayerLeaderboard,
  generatePlayerSeasonStats,
  getPlayerMatchHistory,
  calculateStreaks,
  generatePlayerCareerHighlights,
  generateScoringRecords,
  findAllCareerMilestones,
  issueCardToPlayer,
  liftPlayerBan,
};
