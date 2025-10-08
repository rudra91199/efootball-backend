import { Schema, model } from "mongoose";

const teamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    logo: { type: Object, required: true },
    // Link to the tournament this team belongs to
    tournament: {
      type: Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    // Link to the captain (a single player)
    captain: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: true,
    },
    // Array of links to all players on the team (including the captain)
    players: [
      {
        type: Schema.Types.ObjectId,
        ref: "users",
      },
    ],
    status:{
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    }
  },
  { timestamps: true }
);

export const Team = model("Team", teamSchema);
