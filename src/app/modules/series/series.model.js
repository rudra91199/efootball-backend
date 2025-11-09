import { model, Schema } from "mongoose";

const seriesSchema = new Schema(
  {
    knockout: {
      // Links to the Knockout stage it belongs to
      type: Schema.Types.ObjectId,
      ref: "Knockout",
      required: true,
    },
    roundName: {
      // e.g., "Gauntlet Round 1", "Gauntlet Final"
      type: String,
      required: true,
    },
    player1: { type: Schema.Types.ObjectId, ref: "users" },
    player2: { type: Schema.Types.ObjectId, ref: "users" },
    bestOf: {
      // e.g., 5 for Best-of-5
      type: Number,
      required: true,
      default: 3,
    },
    player1_wins: { type: Number, default: 0 },
    player2_wins: { type: Number, default: 0 },
    // Array storing the individual matches within the series
    matches: [{ type: Schema.Types.ObjectId, ref: "Match" }],
    winner: { type: Schema.Types.ObjectId, ref: "users" },
    status: {
      type: String,
      enum: ["Upcoming", "Active", "Completed"],
      default: "Upcoming",
    },
    seriesStartDate: { type: Date },
    seriesEndDate: { type: Date },
  },
  { timestamps: true }
);

export const Series = model("Series", seriesSchema);
