import { model, Schema } from "mongoose";

const sliderMatchSchema = new Schema(
  {
    teamName: {
      type: String,
    },
    team1BannerUrl: {
      type: String,
    },
    team1LogoUrl: {
      type: String,
    },
    playerName: {
      type: String,
    },
    opponentTeamName: {
      type: String,
    },
    team2BannerUrl: {
      type: String,
    },
    team2LogoUrl: {
      type: String,
    },
    opponentPlayerName: {
      type: String,
    },
    motmDescription: {
      type: String,
    },
    // The field has been renamed from backgroundImageUrl
    motmImageUrl: {
      type: String,
    },
    displayOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const SliderMatch = model("SliderMatch", sliderMatchSchema);
