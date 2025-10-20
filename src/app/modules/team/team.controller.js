import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { TeamServices } from "./team.services.js";

const registerTeam = catchAsync(async (req, res) => {
  const response = await TeamServices.registerTeamIntoTournamnet(req.body);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "team created successfully.",
    data: response,
  });
});

const getAllRegisteredTeams = catchAsync(async (req, res) => {
  const tournamentId = req.params.id;
  const response = await TeamServices.getAllRegisteredTeamFromTournament(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "teams retrieved successfully.",
    data: response,
  });
});
const updateTeamStatus = catchAsync(async (req, res) => {
  const teamId = req.params.id;
  const status = req.body.status;
  const response = await TeamServices.updateTeamStatus(teamId, status);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "team status updated successfully.",
    data: null,
  });
});

export const TeamsControllers = {
  registerTeam,
  getAllRegisteredTeams,
  updateTeamStatus,
};
