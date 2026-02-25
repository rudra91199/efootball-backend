import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { classicoServices } from "./classico.services.js";

const registerClassicoTeam = catchAsync(async (req, res) => {
  const response = await classicoServices.registerClassicoTeam(req.body);
  sendResponse(res, {
    statusCode: 201,
    success: true,
    message: "Team registered successfully",
    data: response,
  });
});

const generatePhase1Fixtures = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response = await classicoServices.generatePhase1Fixtures(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 1 fixtures generated successfully",
    data: response,
  });
});

const updateClassicoMatchScore = catchAsync(async (req, res) => {
  const response = await classicoServices.updateClassicoMatch(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Match score updated successfully",
    data: response,
  });
});

const endPhase1 = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response = await classicoServices.preparePhase2Draft(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "phase 1 ended and draft rights assigned successfully",
    data: response,
  });
});

const generatePhase2Fixtures = catchAsync(async (req, res) => {
  const response = await classicoServices.startPhase2NemesisDraft(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 2 fixtures generated successfully",
    data: response,
  });
});

const phase3TeamSubmit = catchAsync(async (req, res) => {
  const response = await classicoServices.submitPhase3List(req.body);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 3 team submission successful",
    data: response,
  });
});

const phase3FixtureGeneration = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response =
    await classicoServices.generateIronCurtainMatches(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 3 fixtures generated successfully",
    data: response,
  });
});

const getPhase1Leaderboard = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response =
    await classicoServices.getPhase1TeamLeaderboards(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 1 leaderboard retrieved successfully",
    data: response,
  });
});
const getOverallTeamLeaderboards = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response =
    await classicoServices.getOverallTeamLeaderboards(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Overall team leaderboard retrieved successfully",
    data: response,
  });
});
const getGlobalPlayerLeaderboardclassico = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response =
    await classicoServices.getGlobalPlayerLeaderboardclassico(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Overall team leaderboard retrieved successfully",
    data: response,
  });
});
const getChampionshipLeaderboard = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response =
    await classicoServices.getChampionshipLeaderboard(tournamentId);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Overall team leaderboard retrieved successfully",
    data: response,
  });
});

export const classicoControllers = {
  registerClassicoTeam,
  generatePhase1Fixtures,
  updateClassicoMatchScore,
  endPhase1,
  generatePhase2Fixtures,
  phase3TeamSubmit,
  phase3FixtureGeneration,
  getPhase1Leaderboard,
  getOverallTeamLeaderboards,
  getGlobalPlayerLeaderboardclassico,
  getChampionshipLeaderboard,
};
