import { model, Schema } from "mongoose";

const hallOfFameSchema = new Schema(
  {
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    awards: [
      {
        awardName: { type: String, required: true }, // e.g., "Top Scorer", "Tournament MVP"
        user: {
          type: Schema.Types.ObjectId,
          refPath: "awards.userModel",
          required: true,
        },
        userModel: {
          type: String,
          required: true,
          enum: ["users", "Team"], // Must match your exact Mongoose model names
          default: "users",
        },
        stats: [
          {
            label: { type: String }, // e.g., "Win Rate", "Matches Played"
            value: { type: Schema.Types.Mixed }, // Mixed allows Numbers (15) or Strings ("85%")
          },
        ],
        teamContext: { type: Schema.Types.ObjectId, ref: "Team" }, // Optional, for Classico teams
      },
    ],
  },
  { timestamps: true },
);

export const HallOfFame = model("HallOfFame", hallOfFameSchema);

// in hof schema, I need match played, goal scored/ clean sheets, wins, win percentage for mvp, for nemesis match played
