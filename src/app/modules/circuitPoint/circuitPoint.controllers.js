import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { CircuitPointService } from "./circuitPoint.services.js";

const calculateAndSavePhase1Points = catchAsync(async (req, res) => {
  const { leagueId } = req.params;
  const response = await CircuitPointService.calculateAndSavePhase1Points(
    leagueId
  );
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: `Circuit points for phase 1 calculated for league ${leagueId}`,
    data: null,
  });
});

const generateFinalSeedingLeaderboard = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response = await CircuitPointService.generateFinalSeedingLeaderboard(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Final seeding leaderboard generated successfully.",
    data: response,
  });
});

export const CircuitPointController = {
  calculateAndSavePhase1Points,
  generateFinalSeedingLeaderboard,
};
