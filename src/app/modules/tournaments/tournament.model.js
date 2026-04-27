import { model, Schema } from "mongoose";

const phaseSchema = new Schema({
  phaseName: { type: String, required: true },
  phaseOrder: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Active", "Completed"],
    default: "Pending",
  },
  matches: [
    {
      type: Schema.Types.ObjectId,
      ref: "Match",
    },
  ],
});

const stageSchema = new Schema({
  stageOrder: { type: Number, required: true },
  stageName: { type: String, required: true },
  stageType: {
    type: String,
    enum: ["League", "Knockout"],
    required: true,
  },
  stageData: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: "stages.stageType",
  },
});

const tournamentSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "Trifecta",
        "League",
        "Knockout",
        "League + Knockout Solo",
        "League + Knockout Team",
        "Champions Circuit",
        "The Massacre Trilogy",
      ],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["Upcoming", "Live", "Completed", "Published", "unPublished"],
      default: "unPublished",
    },
    maxTeams: {
      type: Number,
      required: true,
    },

    participantType: {
      type: String,
      enum: ["users", "Team"],
      default: "Team",
    },

    teams: [
      {
        type: Schema.Types.ObjectId,
        refPath: "participantType",
      },
    ],

    phases: [phaseSchema],
    stages: [stageSchema],

    // ==========================================
    // HALL OF FAME & PLACEMENT TRACKING
    // ==========================================
    champion: {
      type: Schema.Types.ObjectId,
      refPath: "participantType",
    },
    runnerUp: {
      type: Schema.Types.ObjectId,
      refPath: "participantType",
    },
    thirdPlace: {
      type: Schema.Types.ObjectId,
      refPath: "participantType",
    },

    hallOfFame: {
      type: Schema.Types.ObjectId,
      ref: "HallOfFame",
    },
    // ==========================================

    entryFee: {
      type: Number,
      required: true,
    },
    registrationDeadline: {
      type: Date,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    rules: [String],
    prizes: {
      totalPool: {
        type: Number,
        required: true,
      },
      placements: [
        {
          position: {
            type: String,
            required: true,
          },
          amount: {
            type: Number,
            required: true,
          },
        },
      ],
      individualAwards: [
        {
          awardName: {
            type: String,
            required: true,
          },
          amount: {
            type: Number,
            required: true,
          },
        },
      ],
    },
    metadata: {
      // --- Future-Proof Completion Logic ---
      finalRoundName: {
        type: String,
        default: "Grand Final",
      },
      giantKillers: [{ type: Schema.Types.ObjectId, ref: "users" }],
      
      // ==========================================
      // GENERIC 1v1 FACTION TRACKING (Replaces RMA/Barca)
      // ==========================================
      faction1: {
        teamId: { type: Schema.Types.ObjectId, refPath: "participantType" },
        score: { type: Number, default: 0 },
        bonusClaimed: { type: Boolean, default: false },
        phase3List: [{ type: Schema.Types.ObjectId, ref: "users" }] // Moved list here for cleaner data
      },
      faction2: {
        teamId: { type: Schema.Types.ObjectId, refPath: "participantType" },
        score: { type: Number, default: 0 },
        bonusClaimed: { type: Boolean, default: false },
        phase3List: [{ type: Schema.Types.ObjectId, ref: "users" }]
      },
      isPhase3Locked: { type: Boolean, default: false }
    },
  },
  { timestamps: true },
);

export const Tournament = model("Tournament", tournamentSchema);