import { Router } from "express";
import auth from "../../middlewares/auth.js";
import { USER_ROLES } from "../users/user.constants.js";
import { SeriesController } from "./series.controller.js";

const router = Router();

router.post(
  "/publish-round/:seriesId",
  auth(USER_ROLES.admin),
  SeriesController.publishSeries
);

export const SeriesRoutes = router;
