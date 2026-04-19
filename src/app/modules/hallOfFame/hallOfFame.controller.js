import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { HallOfFameServices } from "./hallOfFame.Services.js";

const fixHallOfFame = catchAsync(async (req, res) => {
  const result = await HallOfFameServices.retroactivelyFixHallOfFame();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Hall of Fame historically updated.",
    data: result,
  });
});

const getHallOfFame = catchAsync(async (req, res) => {
  const data = await HallOfFameServices.getHallOfFameTournaments();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Hall of Fame data retrieved successfully.",
    data: data,
  });
});

export const HallOfFameControllers = {
  fixHallOfFame,
  getHallOfFame,
};
