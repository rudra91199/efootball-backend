import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { KnockoutServices } from "./knockout.services.js";

const generateGauntletKnockout = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;

  const response = await KnockoutServices.generateGauntletKnockout(tournamentId, req.body.mainLeagueChampionIds);
  sendResponse(res, {
    success: true,
    message: "Gauntlet knockout generated successfully",
    data: response,
    statusCode: 200,
  });
});

const getKnockoutById = catchAsync(async (req, res) => {
  const { knockoutId } = req.params;
  const response = await KnockoutServices.getKnockoutById(knockoutId);
  sendResponse(res, {
    success: true,
    message: "Knockout retrieved successfully",
    data: response,
    statusCode: 200,
  });
});

export const KnockoutControllers = {
  getKnockoutById,
  generateGauntletKnockout
};
