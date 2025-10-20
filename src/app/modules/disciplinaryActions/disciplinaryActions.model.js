import { model, Schema } from "mongoose";

const disciplinaryActionSchema = new Schema({
  player: { type: Schema.Types.ObjectId, ref: "users", required: true },
  match: { type: Schema.Types.ObjectId, ref: "Match" }, // Optional, can be tournament-wide
  tournament: { type: Schema.Types.ObjectId, ref: "Tournament", required: true },
  cardType: { type: String, enum: ["Yellow", "Orange", "Red"], required: true },
  reason: { type: String, required: true },
  issuedBy: { type: Schema.Types.ObjectId, ref: "users", required: true },
}, { timestamps: true });

export const DisciplinaryAction = model("DisciplinaryAction", disciplinaryActionSchema);