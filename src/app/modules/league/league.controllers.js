import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { LeagueServices } from "./league.services.js";

const registerPlayerInLeague = catchAsync(async (req, res) => {
  const { leagueId, tournamentId } = req.params;
  const { playerId } = req.body;
  const response = await LeagueServices.registerPlayerInLeague(
    leagueId,
    playerId,
    tournamentId
  );
  sendResponse(res, {
    success: true,
    message: "Player registered in league successfully",
    data: response,
    statusCode: 200,
  });
});

const generateFixtures = catchAsync(async (req, res) => {
  const { leagueId } = req.params;
  const response = await LeagueServices.generateFixtures(leagueId);
  sendResponse(res, {
    success: true,
    message: "Fixtures generated successfully",
    data: response,
    statusCode: 200,
  });
});

const getLeagueById = catchAsync(async (req, res) => {
  const { leagueId } = req.params;
  const response = await LeagueServices.getLeagueById(leagueId);
  sendResponse(res, {
    success: true,
    message: "League retrieved successfully",
    data: response,
    statusCode: 200,
  });
});

const publishRounds = catchAsync(async (req, res) => {
  const { leagueId } = req.params;
  const response = await LeagueServices.publishRounds(leagueId, req.body);
  sendResponse(res, {
    success: true,
    message: "Rounds published successfully",
    data: response,
    statusCode: 200,
  });
});

const generateLeaderboard = catchAsync(async (req, res) => {
  const { leagueId } = req.params;

  const response = await LeagueServices.generateLeagueLeaderboard(leagueId);
  sendResponse(res, {
    success: true,
    message: "Leaderboard generated successfully",
    data: response,
    statusCode: 200,
  });
});

const finalizePhase1AndGenerateGauntlet = catchAsync(async (req, res) => {
  const { leagueId } = req.params;
  const response = await LeagueServices.finalizePhase1AndGenerateGauntlet(
    leagueId
  );
  sendResponse(res, {
    success: true,
    message: "Phase 1 finalized and Gauntlet generated successfully",
    data: response,
    statusCode: 200,
  });
});

export const LeagueControllers = {
  registerPlayerInLeague,
  generateFixtures,
  getLeagueById,
  publishRounds,
  generateLeaderboard,
  finalizePhase1AndGenerateGauntlet,
};
