import { model, Schema } from "mongoose";

const circuitPointSchema = new Schema({
    tournament: {
        type: Schema.Types.ObjectId,
        ref: 'Tournament',
        required: true
    },
    player: { // Assuming solo tournament based on description
        type: Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    phase1_points: { type: Number, default: 0 },
    phase2_points: { type: Number, default: 0 },
    total_points: { type: Number, default: 0 } // Can be calculated or stored
});

export const CircuitPoint = model('CircuitPoint', circuitPointSchema);