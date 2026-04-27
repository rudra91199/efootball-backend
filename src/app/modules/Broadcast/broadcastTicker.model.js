import { model, Schema } from "mongoose";

const broadcastTickerSchema = new Schema(
  {
    message: { type: String, required: true },
    type: { 
      type: String, 
      enum: ["Info", "Warning", "Hype", "Promo"], 
      default: "Info" 
    },
    link: { type: String, default: null }, // Optional URL
    tournamentId: { 
      type: Schema.Types.ObjectId, 
      ref: "Tournament", 
      default: null // If null, it shows globally
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const BroadcastTicker = model("BroadcastTicker", broadcastTickerSchema);