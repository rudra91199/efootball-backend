import { model, Schema } from "mongoose";

const squadSubmissionSchema = new Schema(
  {
    star_player: { type: Schema.Types.ObjectId, ref: "Player" },
    first_day_player: { type: Schema.Types.ObjectId, ref: "Player" },
    late_night_player: { type: Schema.Types.ObjectId, ref: "Player" },
  },
  { _id: false }
);

const matchSchema = new Schema(
  {
    // We will link matches to phases within the Tournament document itself
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
    },
    league: {
      type: Schema.Types.ObjectId,
      ref: "League",
    },
    knockout: {
      type: Schema.Types.ObjectId,
      ref: "Knockout",
    },
    phase: {
      type: Schema.Types.ObjectId,
    },
    round: {
      type: String, // e.g., "Round-1", "Semi-Final", "Gauntlet M1"
      required: true,
    },
    roundStartDate: {
      type: Date,
    },
    roundEndDate: {
      type: Date,
    },
    team1: {
      type: Schema.Types.ObjectId,
      ref: "Team",
    },
    team2: {
      type: Schema.Types.ObjectId,
      ref: "Team",
    },
    team1_squad: squadSubmissionSchema,
    team2_squad: squadSubmissionSchema,
    team1_score: {
      type: Number,
      default: 0,
    },
    team2_score: {
      type: Number,
      default: 0,
    },
    manOfTheMatch: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },
    winner: {
      type: Schema.Types.ObjectId,
      ref: "Team", // Can be null until the match is completed
    },
    orangeCardedPlayers: [{ type: Schema.Types.ObjectId, ref: 'users' }],
    details: {
      subMatches: [
        {
          matchType: String,
          player1: {
            type: Schema.Types.ObjectId,
            ref: "users",
          },
          player2: {
            type: Schema.Types.ObjectId,
            ref: "users",
          },
          player1Score: Number,
          player2Score: Number,
          winner: String,
          status: {
            type: String,
            enum: ["Scheduled", "Completed"],
            default: "Scheduled",
          },
        },
      ],
    },
    status: {
      type: String,
      enum: ["Unpublished", "Scheduled", "Completed"],
      default: "Unpublished",
    },
    subMatchesGenerated: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export const Match = model("Match", matchSchema);
