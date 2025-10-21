import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { SliderMatchService } from "./sliderMatch.services.js";

const createSliderMatch = catchAsync(async (req, res) => {
  const payload = req.body;
  const response = await SliderMatchService.createSliderMatch(payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Slider match created successfully",
    data: response,
  });
});

const getAllSliderMatches = catchAsync(async (req, res) => {
  const response = await SliderMatchService.getAllSliderMatches();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "All slider matches retrieved successfully",
    data: response,
  });
});

const getSliderMatch = catchAsync(async (req, res) => {
  const { id } = req.params;
  const response = await SliderMatchService.getSliderMatch(id);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Slider match retrieved successfully",
    data: response,
  });
});

export const SliderMatchController = {
  createSliderMatch,
  getAllSliderMatches,
  getSliderMatch,
};
