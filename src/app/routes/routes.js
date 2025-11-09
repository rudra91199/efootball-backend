import { Router } from "express";
import { UserRoutes } from "../modules/users/user.router.js";
import { TournamentRoutes } from "../modules/tournaments/tournament.routes.js";
import { teamRoutes } from "../modules/team/team.routes.js";
import { MatchRoutes } from "../modules/match/match.routes.js";
import { MatchHistoryRoutes } from "../modules/matchHistory/matchHistory.routes.js";
import { LeagueRoutes } from "../modules/league/league.route.js";
import { RulesRoutes } from "../modules/rules/rules.routes.js";
import { KnockoutRoutes } from "../modules/knockout/knockout.route.js";
import { SliderMatchRoutes } from "../modules/sliderMatch/sliderMatch.routes.js";
import { CircuitPointRoutes } from "../modules/circuitPoint/circuitPoint.routes.js";
import { SeriesRoutes } from "../modules/series/series.routes.js";

const router = Router();

const moduleRoutes = [
  {
    path: "/users",
    router: UserRoutes,
  },
  {
    path: "/teams",
    router: teamRoutes,
  },
  {
    path: "/tournaments",
    router: TournamentRoutes,
  },
  {
    path: "/leagues",
    router: LeagueRoutes,
  },
  {
    path: "/knockouts",
    router: KnockoutRoutes,
  },
  {
    path: "/matches",
    router: MatchRoutes,
  },
  {
    path: "/matchHistory",
    router: MatchHistoryRoutes,
  },
  {
    path: "/rules",
    router: RulesRoutes,
  },
  {
    path: "/slider-match",
    router: SliderMatchRoutes,
  },
  {
    path: "/circuit-points",
    router: CircuitPointRoutes,
  },
  {
    path: "/series",
    router: SeriesRoutes,
  }
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.router);
});

export default router;
