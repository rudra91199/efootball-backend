import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { UclServices } from "./ucl.services.js";

const registerPlayers = catchAsync(async (req, res) => {
  const { tournamentId, playerIds } = req.body;
  const response = await UclServices.registerUCLPlayers(
    tournamentId,
    playerIds,
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Players registered successfully",
    data: response,
  });
});

const generatePhase1 = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response = await UclServices.generatePhase1GroupStage(tournamentId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 1 Group Stage generated successfully",
    data: response,
  });
});

const generatePhase2 = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response = await UclServices.generatePhase2Playoffs(tournamentId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 2 generated successfully",
    data: response,
  });
});

const submitTwoLeggedScore = catchAsync(async (req, res) => {
  const response = await UclServices.updateUclTwoLeggedScore(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Two-Legged score updated successfully",
    data: response,
  });
});

const generatePhase3 = catchAsync(async (req, res) => {
  const { tournamentId } = req.body;
  const response = await UclServices.generatePhase3Knockout(tournamentId);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 3 bracket setup generated completely",
    data: response,
  });
});

const submitPhase3Score = catchAsync(async (req, res) => {
  const response = await UclServices.updateUclPhase3Score(req.body);

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Phase 3 match score processed",
    data: response,
  });
});

export const UclControllers = {
  generatePhase1,
  registerPlayers,
  generatePhase2,
  submitTwoLeggedScore,
  generatePhase3,
  submitPhase3Score,
};
