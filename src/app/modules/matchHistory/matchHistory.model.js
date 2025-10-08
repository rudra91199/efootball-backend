import { model, Schema } from "mongoose";

// A sub-schema for the match history entries
const playerMatchRecordSchema = new Schema(
  {
    player: {
      type: Schema.Types.ObjectId,
      ref: "users",
    },
    match: {
      // Reference to the main Team vs Team match
      type: Schema.Types.ObjectId,
      ref: "Match",
      required: true,
    },
    isManOfTheMatch: {
      type: Boolean,
      default: false,
    },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
    },
    opponent: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    matchDate: {
      type: Date,
    },
    // These fields will be updated after the match is played
    result: {
      type: String,
      enum: ["Win", "Loss", "Draw", "Pending"],
      default: "Pending",
    },
    scoreFor: { type: Number },
    scoreAgainst: { type: Number },
  },
  {
    timestamps: true,
  }
);

export const MatchHistory = model("MatchHistory", playerMatchRecordSchema);
