import { SliderMatch } from "./sliderMatch.model.js";

const createSliderMatch = (payload) => {
    const response = SliderMatch.create(payload);
    return response;
}

const getAllSliderMatches = () => {
    const response = SliderMatch.find();
    return response;
}

const getSliderMatch = (id) => {
    const response = SliderMatch.findById(id);
    return response;
}

export const SliderMatchService = {
    createSliderMatch,
    getAllSliderMatches,
    getSliderMatch,
};