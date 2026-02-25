import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { championshipPointService } from "./championshipPoint.services.js";

const getChampionshipPointByTournament = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const result =
    await championshipPointService.getChampionshipPointByTournament(
      tournamentId,
    );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Championship point retrieved successfully",
    data: result,
  });
});

export const championshipPointController = {
  getChampionshipPointByTournament,
};
