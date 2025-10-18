import { model, Schema } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true },
  inGameUserName: { type: String, required: true },
  inGameUserId: { type: String, required: true },
  phone: { type: String, required: true },
  phoneModel: { type: String, required: true },
  image: {
    type: Object,
    required: true,
  },
  baseTeamName: { type: String },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, enum: ["active", "blocked"], default: "active" },
  role: {
    type: String,
    enum: ["admin", "referee", "player"],
    default: "player",
  },
  lastLogin: { type: Date },
  isDeleted: { type: Boolean, default: false },
  passwordChangedAt: { type: Date },
  // --- Disciplinary Fields ---
  isBanned: {
    type: Boolean,
    default: false,
  },
  banLiftDate: {
    type: Date,
    default: null,
  },
  activeYellowCards: [
    {
      cardId: { type: Schema.Types.ObjectId, ref: "DisciplinaryAction" },
      expiryDate: { type: Date },
    },
  ],
  matchHistory: [
    {
      type: Schema.Types.ObjectId,
      ref: "MatchHistory",
    },
  ],
});

export const User = model("users", userSchema);
