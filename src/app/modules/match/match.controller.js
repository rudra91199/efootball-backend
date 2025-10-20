import catchAsync from "../../utils/catchAsync.js";
import sendResponse from "../../utils/sendResponse.js";
import { Match } from "./match.model.js";
import { MatchServices } from "./match.services.js";

const submitSquad = catchAsync(async (req, res) => {
  const { matchId } = req.params;
  const submittingCaptainId = req.user.userId;
  const players = req.body;
  const response = await MatchServices.submitSquadAndGenerateSubMatches(
    matchId,
    submittingCaptainId,
    players
  );

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Squad submitted successfully.",
    data: response,
  });
});

export const updateSquad = async (req, res) => {
  const { matchId, captainId } = req.params;
  const submittingCaptainId = captainId; // Assuming auth middleware provides this
  const squadData = req.body;

  // --- 1. VALIDATION ---
  const match = await Match.findById(matchId)
    .populate("team1")
    .populate("team2");
  if (!match) {
    return res.status(404).json({ message: "Match not found." });
  }

  // Check if the submission deadline has passed
  // if (new Date() > match.squadSubmissionDeadline) {
  //   return res.status(403).json({ message: "The squad submission deadline has passed." });
  // }

  // Determine the submitting team
  let submittingTeamKey;
  if (match.team1?.captain.toString() === submittingCaptainId) {
    submittingTeamKey = "team1";
  } else if (match.team2?.captain.toString() === submittingCaptainId) {
    submittingTeamKey = "team2";
  } else {
    return res
      .status(403)
      .json({ message: "Forbidden: You are not a captain for this match." });
  }

  // --- 2. SAVE THE SQUAD ---
  match[`${submittingTeamKey}_squad`] = {
    star_player: squadData.star_player,
    first_day_player: squadData.first_day_player,
    late_night_player: squadData.late_night_player,
  };
  await match.save();

  // --- 3. TRIGGER THE GENERATION LOGIC ---
  await MatchServices.generateOrUpdateSubMatches(matchId);

  // --- 4. RESPOND ---
  const finalMatch = await Match.findById(matchId); // Fetch final state to return'
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Squad submitted/updated successfully.",
    data: finalMatch,
  });
};

const updateRoundStatus = async (req, res) => {
  const { matchId } = req.params;
  const statusInfo = req.body;
  const response = await MatchServices.updateRoundStatus(matchId, statusInfo);
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "Round status changed successfully.",
    data: null,
  });
};

const updateScore = async (req, res) => {
  const { matchId, subMatchId } = req.params;
  const scores = req.body;
  const response = await MatchServices.updateSingleSubMatchScore(
    matchId,
    subMatchId,
    scores
  );
  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "score updated successfully.",
    data: response,
  });
};

// Score update for league and knockout matches
const scoreUpdateForLeagueAndKnockout = catchAsync(async (req, res) => {
  const response = await MatchServices.updateMatchScoreForLeagueAndKnockout(
    req.body
  );
  sendResponse(res, {
    success: true,
    message: "Score updated successfully",
    data: response,
    statusCode: 200,
  });
});

const getPlayersByMatch = catchAsync(async (req, res) => {
  const { matchId } = req.params;
  const response = await MatchServices.getPlayersByMatch(matchId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "players retrieved successfully.",
    data: response,
  });
});
const setManOfTheMatch = catchAsync(async (req, res) => {
  const { matchId, playerId } = req.params;
  const response = await MatchServices.setManOfTheMatch(matchId, playerId);

  sendResponse(res, {
    success: true,
    statusCode: 200,
    message: "players retrieved successfully.",
    data: response,
  });
});

export const MatchControllers = {
  submitSquad,
  updateSquad,
  updateRoundStatus,
  updateScore,
  getPlayersByMatch,
  setManOfTheMatch,
  scoreUpdateForLeagueAndKnockout,
};
