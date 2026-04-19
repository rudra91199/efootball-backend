import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { fixServices } from "./fix.services.js";

const getMissingMatchHistories = catchAsync(async (req, res) => {
  const missingHistories =
    await fixServices.findMissingMatchHistoriesaAndGenerate();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Missing match histories retrieved successfully",
    data: missingHistories,
  });
});

const getPendingMatchHistories = catchAsync(async (req, res) => {
  const pendingMatches = await fixServices.getMatchesWithPendingHistories();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Pending match histories retrieved successfully",
    data: pendingMatches,
  });
});

export const fixControllers = {
  getMissingMatchHistories,
  getPendingMatchHistories,
};
