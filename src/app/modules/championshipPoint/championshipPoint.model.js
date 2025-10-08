import { model, Schema } from "mongoose";

const championshipPointSchema = new Schema({
    tournament: {
        type: Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    team: {
        type: Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },
    phase1_points: { type: Number, default: 0 },
    phase2_points: { type: Number, default: 0 },
    // You can calculate totalPoints on the fly or store it for efficiency
    total_points: { type: Number, default: 0 }
});

export const ChampionshipPoint = model('ChampionshipPoint', championshipPointSchema);