import { model, Schema } from "mongoose";

const knockoutRoundSchema = new Schema(
  {
    roundName: { type: String, required: true }, // e.g., "Quarter-Finals"
    matches: [{ type: Schema.Types.ObjectId, ref: "Match" }],
    series: [{ type: Schema.Types.ObjectId, ref: "Series" }],
  },
  { _id: false }
);

const knockoutSchema = new Schema(
  {
    name: {
      type: String,
      required: true, // e.g., "The Gauntlet of Contenders - Finals"
    },
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
    },
    size: {
      type: Number, // e.g., 4, 6, 8, 16
      required: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "users", // Or 'Team'
      },
    ],
    rounds: [knockoutRoundSchema],
    status: {
      type: String,
      enum: ["Upcoming", "Active", "Completed"],
      default: "Upcoming",
    },
  },
  { timestamps: true }
);

export const Knockout = model("Knockout", knockoutSchema);
