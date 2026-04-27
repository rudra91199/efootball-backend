import mongoose from "mongoose";
import { Team } from "./team.model.js";
import ApiError from "../../errors/ApiError.js";
import { Tournament } from "../tournaments/tournament.model.js";
import cloudinary from "../../config/cloudinary.config.js";

const registerTeamIntoTournamnet = async (payload) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    if (payload.logo) {
      const { secure_url, public_id } = await cloudinary.uploader.upload(
        payload.logo,
        {
          upload_preset: "efootball",
          transformation: { fetch_format: "auto", quality: "auto" },
        },
      );
      payload.logo = { url: secure_url, public_id };
    }
    const response = await Team.create([payload], { session });
    if (!response.length) {
      throw new ApiError(400, "Failed to create team");
    }
    const team = response[0];
    const tournament = await Tournament.findById(payload.tournament).session(
      session,
    );

    if (!tournament) {
      throw new ApiError(404, "Tournament not found");
    }
    if (tournament.teams.length >= tournament.maxTeams) {
      throw new ApiError(400, "Tournament is already at maximum capacity");
    }
    // --- MASSACRE TRILOGY FACTION LOGIC ---
    if (tournament.type === "The Massacre Trilogy") {
      // Slot them into Faction 1 if empty
      if (!tournament.metadata.faction1.teamId) {
        tournament.metadata.faction1.teamId = team._id;
      }
      // Slot them into Faction 2 if Faction 1 is taken
      else if (!tournament.metadata.faction2.teamId) {
        tournament.metadata.faction2.teamId = team._id;
      }
      // Reject if both factions are somehow full
      else {
        throw new ApiError(
          400,
          "Both faction slots are already full for this Trilogy.",
        );
      }
    }
    // Push the team to the main array (works for ALL tournament types)
    tournament.teams.push(team._id);

    // Save the updated document within the transaction
    await tournament.save({ session });

    await session.commitTransaction();
    await session.endSession();
    return team;
  } catch (error) {
    await session.abortTransaction();
    await session.endSession();
    throw new ApiError(500, "Something went wrong. Team creation failed.");
  }
};

const getAllRegisteredTeamFromTournament = async (tournamentId) => {
  const response = await Team.find({ tournament: tournamentId })
    .populate("captain", "-password -createdAt -updatedAt -__v")
    .populate("players", "-password -createdAt -updatedAt -__v");
  return response;
};

const updateTeamStatus = async (teamId, status) => {
  if (status === "Approved") {
    const response = await Team.findByIdAndUpdate(
      teamId,
      { status },
      { new: true },
    );
    return response;
  } else if (status === "Rejected") {
    const team = await Team.findById(teamId);
    const removeTeamFromTournament = await Tournament.findOneAndUpdate(
      { _id: team.tournament },
      { $pull: { teams: teamId } },
    );
    const deleteTeam = await Team.findByIdAndDelete(teamId);
    return {
      message: "Team has been rejected and removed successfully",
    };
  }
};

export const TeamServices = {
  registerTeamIntoTournamnet,
  getAllRegisteredTeamFromTournament,
  updateTeamStatus,
};
