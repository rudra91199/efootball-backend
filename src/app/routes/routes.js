import { Router } from "express";
import { UserRoutes } from "../modules/users/user.router.js";
import { TournamentRoutes } from "../modules/tournaments/tournament.routes.js";
import { teamRoutes } from "../modules/team/team.routes.js";
import { MatchRoutes } from "../modules/match/match.routes.js";
import { MatchHistoryRoutes } from "../modules/matchHistory/matchHistory.routes.js";
import { LeagueRoutes } from "../modules/league/league.route.js";

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
    path: "/matches",
    router: MatchRoutes,
  },
  {
    path: "/matchHistory",
    router: MatchHistoryRoutes,
  },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.router);
});

export default router;
