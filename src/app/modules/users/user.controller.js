import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { UserServices } from "./user.services.js";

const registerUser = catchAsync(async (req, res) => {
  const response = await UserServices.registerUserIntoDb(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "User registered successfully",
    data: null,
  });
});

const loginUser = catchAsync(async (req, res) => {
  const response = await UserServices.login(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User logged in successfully",
    data: response,
  });
});

const checkAuth = catchAsync(async (req, res) => {
  const { userId } = req.user;

  const response = await UserServices.checkAuth(userId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "User authenticated successfully",
    data: response,
  });
});

const editProfile = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const profileData = req.body;
  const response = await UserServices.editProfile(userId, profileData);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Profile updated successfully",
    data: response,
  });
});

const changePassword = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const { currentPassword, newPassword } = req.body;
  await UserServices.changePassword(userId, currentPassword, newPassword);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});

const changePasswordAdmin = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const { newPassword } = req.body;
  await UserServices.changePasswordAdmin(userId, newPassword);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Password changed successfully",
    data: null,
  });
});

const getAllUsers = catchAsync(async (req, res) => {
  const response = await UserServices.getAllUsersFromDB();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users fetched successfully",
    data: response,
  });
});

const getUsersFroRegistration = catchAsync(async (req, res) => {
  const response = await UserServices.getAllUsersFroRegistration();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Users fetched successfully",
    data: response,
  });
});

// player data

const getPlayerTournaments = catchAsync(async (req, res) => {
  const { playerId } = req.params;
  const tournaments = await UserServices.findTournamentsForPlayer(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "tournaments fetched successfully",
    data: tournaments,
  });
});

const getGlobalLeaderboard = catchAsync(async (req, res) => {
  const leaderboard = await UserServices.generateGlobalPlayerLeaderboard();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "global leaderboard fetched successfully",
    data: leaderboard,
  });
});

const getPlayerLeaderboard = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const leaderboard = await UserServices.generatePlayerLeaderboard(
    tournamentId
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "global leaderboard fetched successfully",
    data: leaderboard,
  });
});

const getPlayerStatsBySeason = catchAsync(async (req, res) => {
  const { playerId } = req.params;
  const stats = await UserServices.generatePlayerSeasonStats(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "player stats fetched successfully",
    data: stats,
  });
});

const getPlayerMatchHistory = catchAsync(async (req, res) => {
  const { playerId } = req.params;
  const matches = await UserServices.getPlayerMatchHistory(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "match history fetched successfully",
    data: matches,
  });
});

const getPlayerFullStats = async (req, res) => {
  const { playerId } = req.params;

  // Run all stat calculations in parallel for efficiency
  const [coreStats, streakStats] = await Promise.all([
    UserServices.generatePlayerCareerHighlights(playerId),
    UserServices.calculateStreaks(playerId),
    // You could add a function here to count tournamentsWon
  ]);

  // Combine all stats into a single response object
  const fullStats = {
    ...coreStats,
    ...streakStats,
    // playTime: "1,247 hours", // Play time would need to be tracked separately
  };

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "full stats fetched successfully",
    data: fullStats,
  });
};

const getPlayerScoringStats = async (req, res) => {
  const { playerId } = req.params;

  // Run both calculations at the same time
  const [scoringRecords, goalMilestones] = await Promise.all([
    UserServices.generateScoringRecords(playerId),
    UserServices.findAllCareerMilestones(playerId),
  ]);

  // Combine into a single response
  const fullStats = {
    scoringRecords,
    goalMilestones,
  };

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "scoring stats fetched successfully",
    data: fullStats,
  });
};

const issueCardToPlayer = catchAsync(async (req, res) => {
  const { userId } = req.user;
  const payload = req.body;
  await UserServices.issueCardToPlayer(userId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Card issued successfully",
    data: null,
  });
});

const liftPlayerBan = catchAsync(async (req, res) => {
  const { playerId } = req.params;
  await UserServices.liftPlayerBan(playerId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Player ban lifted successfully",
    data: null,
  });
});

export const UserController = {
  registerUser,
  loginUser,
  checkAuth,
  editProfile,
  getAllUsers,
  getUsersFroRegistration,
  changePassword,
  changePasswordAdmin,
  //player data
  getPlayerTournaments,
  getGlobalLeaderboard,
  getPlayerLeaderboard,
  getPlayerStatsBySeason,
  getPlayerMatchHistory,
  getPlayerFullStats,
  getPlayerScoringStats,
  issueCardToPlayer,
  liftPlayerBan,
};
