import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { SliderMatchController } from "./sliderMatch.controllers.js";

const router = Router();

router.post(
  "/create",
  auth(USER_ROLES.admin),
  SliderMatchController.createSliderMatch
);

router.get("/get-all-slider-match", SliderMatchController.getAllSliderMatches);

router.get("/get-slider-match/:id", SliderMatchController.getSliderMatch);

export const SliderMatchRoutes = router;
