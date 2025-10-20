import ApiError from "../../errors/ApiError.js";
import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { Tournament } from "./tournament.model.js";
import { TournamentServices } from "./tournament.services.js";

const createTournament = catchAsync(async (req, res) => {
  const response = await TournamentServices.createTournamentIntoDB(req.body);
  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Tournament created successfully.",
    data: response,
  });
});

const getAllTournaments = catchAsync(async (req, res) => {
  const response = await TournamentServices.getAllTournamentsFromDB();
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Tournament retrieved successfully.",
    data: response,
  });
});

const getAllTournamentsForAdmin = catchAsync(async (req, res) => {
  const response = await TournamentServices.getAllTournamentsForAdminFromDB();
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "All tournaments retrieved successfully.",
    data: response,
  });
});

const getSingleTournament = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response = await TournamentServices.getSingleTournamentFromDB(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Tournament retrieved successfully.",
    data: response,
  });
});

const getRegisteredTournaments = catchAsync(async (req, res) => {
  const { id } = req.params;
  const response = await TournamentServices.getRegisteredTournamentsFromDB(id);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Registered tournaments retrieved successfully.",
    data: response,
  });
});

// Controller to update tournament status
const updateTournamentStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const updatedTournament = await TournamentServices.updateTournamentStatusInDB(
    id,
    status
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Tournament status updated successfully.",
    data: updatedTournament,
  });
});

// Controller to generate round-robin fixtures
const generateRoundRobinFixtures = catchAsync(async (req, res) => {
  const { id } = req.params;

  // First, fetch the tournament to get the team IDs
  const tournament = await Tournament.findById(id).populate("teams");
  if (!tournament) {
    return res.status(404).json({ message: "Tournament not found" });
  }
  const teamIds = tournament.teams.map((team) => team._id);

  // Call the generation function
  const result = await TournamentServices.generateRoundRobinFixtures(
    id,
    teamIds
  );

  sendResponse(res, {
    success: true,
    statusCode: 201,
    message: "Round-robin fixtures generated successfully.",
    data: result,
  });
});

// Controller to generate phase 1 leaderboard
const generatePhase1Leaderbaord = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const leaderboard = await TournamentServices.generatePhase1Leaderboard(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Leaderboard retrieved successfully.",
    data: leaderboard,
  });
});

// Controller to finalize phase 1 and generate phase 2 fixtures
const generatePhase2fixtures = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response = await TournamentServices.generatePhase2GauntletFixtures(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "phase 2 fixture generated successfully.",
    data: response,
  });
});

// Controller to generate final seeding leaderboard after phase 2
const generateFinalSeedingLeaderboard = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const response = await TournamentServices.generateFinalSeedingLeaderboard(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Final seeding leaderboard generated successfully.",
    data: response,
  });
});

// Controller to start phase 3 and generate semi-final fixtures
export const startPhase3 = async (req, res) => {
  const { tournamentId } = req.params;

  const tournament = await Tournament.findById(tournamentId).populate("phases");
  if (!tournament) {
    throw new ApiError(404, "Tournament not found");
  }

  const response = await TournamentServices.generatePhase3Fixtures(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Phase 3 started and semi-final fixtures are generated!",
    data: response,
  });
};

const getPlayerStatusesForTournament = catchAsync(async (req, res) => {
  const { tournamentId } = req.params;
  const statusMap = await TournamentServices.getPlayerStatusesForTournament(
    tournamentId
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Player statuses retrieved successfully.",
    data: statusMap,
  });
});

export const TournamentControllers = {
  createTournament,
  getAllTournaments,
  getSingleTournament,
  updateTournamentStatus,
  generateRoundRobinFixtures,
  getRegisteredTournaments,
  generatePhase1Leaderbaord,
  generatePhase2fixtures,
  generateFinalSeedingLeaderboard,
  startPhase3,
  getPlayerStatusesForTournament,
  getAllTournamentsForAdmin,
};
