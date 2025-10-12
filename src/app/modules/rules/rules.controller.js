import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { RulesServices } from "./rules.services.js";

const getRulesController = catchAsync(async (req, res) => {
  const rules = await RulesServices.getRules();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Rules fetched successfully",
    data: rules.categories,
  });
});

const updateRulesController = catchAsync(async (req, res) => {
  const categoriesData = req.body;
  if (!Array.isArray(categoriesData)) {
    return res
      .status(400)
      .json({ message: "Request body must be an array of categories." });
  }
  const updatedRules = await RulesServices.updateRules(categoriesData);
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: "Rules updated successfully",
    data: updatedRules,
  });
});

export const RulesControllers = {
  getRulesController,
  updateRulesController,
};
