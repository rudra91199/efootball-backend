import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { SeriesService } from "./series.service.js";

const publishSeries = catchAsync(async (req, res) => {
  const { seriesId } = req.params;
  const payload = req.body;
  const response = await SeriesService.publishSeries(seriesId, payload);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Series published successfully",
    data: response,
  });
});

export const SeriesController = {
  publishSeries,
};
