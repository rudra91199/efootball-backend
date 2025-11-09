import { model, Schema } from "mongoose";

// We define the Phase schema here to be embedded inside the Tournament
const phaseSchema = new Schema({
  phaseName: { type: String, required: true }, // "Phase 1: Seeding Scramble", etc.
  phaseOrder: { type: Number, required: true }, // 1, 2, or 3
  status: {
    type: String,
    enum: ["Pending", "Active", "Completed"],
    default: "Pending",
  },
  // This will hold the IDs of all matches in this phase
  matches: [
    {
      type: Schema.Types.ObjectId,
      ref: "Match",
    },
  ],
});

const stageSchema = new Schema({
  stageOrder: { type: Number, required: true },
  stageName: { type: String, required: true }, // "Proving Grounds", "Finals"
  stageType: {
    type: String,
    enum: ["League", "Knockout"],
    required: true,
  },
  // This is a dynamic reference. It can link to a document in either
  // the 'League' or 'Knockout' collection based on the 'stageType' field.
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
    // An array of teams participating in this tournament
    teams: [
      {
        type: Schema.Types.ObjectId,
        ref: "Team",
      },
    ],
    // The Trifecta phases will be an array of documents within the tournament
    phases: [phaseSchema],
    // The stages will be an array of documents within the tournament
    stages: [stageSchema],
    champion: {
      type: Schema.Types.ObjectId,
      ref: "Team", // Can be null until the end
    },
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
        required: true, // e.g., 4400
      },
      // Array for rank-based prizes (1st, 2nd, etc.)
      placements: [
        {
          position: {
            type: String, // Using String is flexible (e.g., "1st Place", "Runner-Up")
            required: true,
          },
          amount: {
            type: Number, // Storing the prize as a Number is crucial for calculations
            required: true,
          },
        },
      ],
      // Array for individual skill-based awards
      individualAwards: [
        {
          awardName: {
            type: String, // e.g., "MVP of the Tournament"
            required: true,
          },
          amount: {
            type: Number,
            required: true,
          },
        },
      ],
    },
  },
  { timestamps: true }
);

export const Tournament = model("Tournament", tournamentSchema);
