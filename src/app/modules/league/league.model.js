import { model, Schema } from "mongoose";

const leagueSchema = new Schema(
  {
    name: {
      type: String,
      required: true, // e.g., "The Proving Grounds - Season 1"
    },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    season: {
      type: String, // e.g., "2025"
    },
    // Can be teams or individual players
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "users", // Or 'Team' if it's a team-based league
      },
    ],
    maxParticipants: {
      type: Number,
      required: true, // e.g., 9
    },
    matches: [
      {
        type: Schema.Types.ObjectId,
        ref: "Match",
      },
    ],
    status: {
      type: String,
      enum: ["Upcoming", "Active", "Completed"],
      default: "Upcoming",
    },
    // Optional: Store the calculated leaderboard to improve performance
    leaderboardCache: {
      type: Array,
      default: [],
    },
    circuitPointsCalculated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const League = model("League", leagueSchema);
