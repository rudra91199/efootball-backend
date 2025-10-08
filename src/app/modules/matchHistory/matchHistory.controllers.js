import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { MatchHistoryServices } from "./matchHistory.services.js";

const getTournamentMatches = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const player = req.user.userId;
  const response = await MatchHistoryServices.getTournamentMatchesFromDB(
    player,
    tournamentId
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Squad submitted successfully.",
    data: response,
  });
});

export const MatchHistoryControllers = {
  getTournamentMatches,
};
