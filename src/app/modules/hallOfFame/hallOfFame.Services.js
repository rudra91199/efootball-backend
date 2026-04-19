import mongoose from "mongoose";
import ApiError from "../../errors/ApiError.js";
import { classicoServices } from "../classico/classico.services.js";
import { Match } from "../match/match.model.js";
import { Tournament } from "../tournaments/tournament.model.js";
import { MatchHistory } from "../matchHistory/matchHistory.model.js";
import { HallOfFame } from "./hallOfFame.model.js";
import { Team } from "../team/team.model.js";

// ==========================================
// STAT GENERATOR HELPERS
// ==========================================

const getStrId = (field) => {
  if (!field) return null;
  return field._id ? field._id.toString() : field.toString();
};

async function generatePodiumStats(tournamentId, userId) {
  try {
    const uidStr = getStrId(userId);
    const uid = new mongoose.Types.ObjectId(uidStr);
    const tid = new mongoose.Types.ObjectId(tournamentId);

    const historyStats = await MatchHistory.aggregate([
      { $match: { tournament: tid, player: uid, result: { $ne: "Pending" } } },
      {
        $group: {
          _id: "$player",
          mp: { $sum: 1 },
          wins: { $sum: { $cond: [{ $eq: [{ $toLower: "$result" }, "win"] }, 1, 0] } },
          gf: { $sum: "$scoreFor" }
        }
      }
    ]);

    let h_mp = 0, h_wins = 0, h_gf = 0;
    if (historyStats && historyStats.length > 0) {
      h_mp = historyStats[0].mp || 0;
      h_wins = historyStats[0].wins || 0;
      h_gf = historyStats[0].gf || 0;
    }

    const matches = await Match.find({
      tournament: tid,
      status: { $regex: /^completed$/i },
      $or: [
        { team1: uid }, { team2: uid },
        { player1: uid }, { player2: uid }
      ],
    });

    let m_mp = matches.length;
    let m_wins = 0;
    let m_gf = 0;

    matches.forEach((m) => {
      const isTeam1 = getStrId(m.team1) === uidStr || getStrId(m.player1) === uidStr;
      const score1 = m.team1_score ?? m.score1 ?? m.player1Score ?? 0;
      const score2 = m.team2_score ?? m.score2 ?? m.player2Score ?? 0;
      const myScore = Number(isTeam1 ? score1 : score2) || 0;
      const oppScore = Number(isTeam1 ? score2 : score1) || 0;

      m_gf += myScore;
      if (myScore > oppScore) m_wins++;
      else if (getStrId(m.winner) === uidStr) m_wins++; 
    });

    let final_mp = 0, final_wins = 0, final_gf = 0;
    if (m_mp >= h_mp && m_mp > 0) {
      final_mp = m_mp; final_wins = m_wins; final_gf = m_gf;
    } else {
      final_mp = h_mp; final_wins = h_wins; final_gf = h_gf;
    }

    const winRate = final_mp > 0 ? Math.round((final_wins / final_mp) * 100) : 0;

    return [
      { label: "Matches Played", value: final_mp.toString() },
      { label: "Wins", value: final_wins.toString() },
      { label: "Goals Scored", value: final_gf.toString() },
      { label: "Win Rate", value: `${winRate}%` },
    ];
  } catch (error) {
    console.error("Error generating individual stats:", error);
    return [
      { label: "Matches Played", value: "0" }, { label: "Wins", value: "0" },
      { label: "Goals Scored", value: "0" }, { label: "Win Rate", value: "0%" },
    ];
  }
}

async function generateTeamPodiumStats(tournamentId, teamId) {
  try {
    const tid = new mongoose.Types.ObjectId(tournamentId);
    const uidStr = getStrId(teamId);
    const uid = new mongoose.Types.ObjectId(uidStr);

    const matches = await Match.find({
      tournament: tid,
      status: { $regex: /^completed$/i },
      $or: [{ team1: uid }, { team2: uid }],
    });

    let matchesPlayed = matches.length;
    let wins = 0;
    let goalsScored = 0;

    matches.forEach((m) => {
      const isTeam1 = getStrId(m.team1) === uidStr;
      const score1 = m.team1_score ?? m.score1 ?? 0;
      const score2 = m.team2_score ?? m.score2 ?? 0;
      const myScore = Number(isTeam1 ? score1 : score2) || 0;
      const oppScore = Number(isTeam1 ? score2 : score1) || 0;

      goalsScored += myScore;
      if (myScore > oppScore) wins++;
      else if (getStrId(m.winner) === uidStr) wins++;
    });

    const winRate = matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0;

    return [
      { label: "Series Played", value: matchesPlayed.toString() },
      { label: "Series Won", value: wins.toString() },
      { label: "Total Goals", value: goalsScored.toString() },
      { label: "Win Rate", value: `${winRate}%` },
    ];
  } catch (error) {
    console.error("Error generating team stats:", error);
    return [
      { label: "Series", value: "0" }, { label: "Wins", value: "0" },
      { label: "Goals", value: "0" }, { label: "Win Rate", value: "0%" },
    ];
  }
}

const generateMassacrePodiumStats = (leaderboardEntry) => {
  if (!leaderboardEntry) {
    return [
      { label: "Points", value: "0" }, { label: "Played", value: "0" },
      { label: "Wins", value: "0" }, { label: "Goal Diff", value: "0" },
    ];
  }
  return [
    { label: "Points", value: (leaderboardEntry.points || 0).toString() },
    { label: "Played", value: (leaderboardEntry.played || 0).toString() },
    { label: "Wins", value: (leaderboardEntry.won || 0).toString() },
    { label: "Goal Diff", value: (leaderboardEntry.gd || 0).toString() },
  ];
};


// ==========================================
// 1. RETROACTIVELY FIX HALL OF FAME
// ==========================================
export const retroactivelyFixHallOfFame = async (req, res) => {
  try {
    const pastTournaments = await Tournament.find({ status: "Completed" });

    let fixedCount = 0;
    const teamTournamentTypes = ["Trifecta", "The Massacre Trilogy", "League + Knockout Team"];

    for (const tournament of pastTournaments) {
      
      const isTeamTournament = teamTournamentTypes.includes(tournament.type);
      tournament.participantType = isTeamTournament ? "Team" : "users";
      await tournament.populate("teams");

      let massacreChampData = null;
      let massacreRunnerUpData = null;

      if (tournament.type === "The Massacre Trilogy") {
        const leaderboard = await classicoServices.getChampionshipLeaderboard(tournament._id);

        if (leaderboard && leaderboard.length > 0) {
          massacreChampData = leaderboard[0];
          massacreRunnerUpData = leaderboard.length > 1 ? leaderboard[1] : null;

          const champIdOrName = massacreChampData._id;
          const runnerIdOrName = massacreRunnerUpData ? massacreRunnerUpData._id : null;

          let champTeam = await Team.findById(champIdOrName).catch(() => null);
          if (!champTeam) champTeam = await Team.findOne({ tournament: tournament._id, name: champIdOrName });
          tournament.champion = champTeam ? champTeam._id : null;

          if (runnerIdOrName) {
            let runnerTeam = await Team.findById(runnerIdOrName).catch(() => null);
            if (!runnerTeam) runnerTeam = await Team.findOne({ tournament: tournament._id, name: runnerIdOrName });
            tournament.runnerUp = runnerTeam ? runnerTeam._id : null;
          } else if (tournament.champion) {
            tournament.runnerUp = tournament.teams.find((t) => !t._id.equals(tournament.champion))?._id;
          }
        }
      } else {
        const grandFinalMatch = await Match.findOne({
          tournament: tournament._id,
          round: { $regex: /Grand Final/i },
          status: "Completed",
        }).sort({ updatedAt: -1 });

        if (grandFinalMatch && grandFinalMatch.winner) {
          tournament.champion = grandFinalMatch.winner;
          if (getStrId(grandFinalMatch.winner) === getStrId(grandFinalMatch.team1)) {
            tournament.runnerUp = grandFinalMatch.team2;
          } else {
            tournament.runnerUp = grandFinalMatch.team1;
          }
        }
      }

      try {
        if (tournament.type === "The Massacre Trilogy") await calculateMassacreHoF(tournament);
        else await calculateStandardHoF(tournament);
      } catch (hofError) {
        console.error(`Legacy HoF Calc Error for ${tournament._id}:`, hofError);
      }

      let hofDoc = await HallOfFame.findOne({ tournament: tournament._id });
      if (!hofDoc) hofDoc = new HallOfFame({ tournament: tournament._id, awards: [] });

      try {
        const userModelType = isTeamTournament ? "Team" : "users";
        let championStats = [];
        let runnerUpStats = [];

        if (tournament.champion) {
          if (tournament.type === "The Massacre Trilogy") championStats = generateMassacrePodiumStats(massacreChampData);
          else if (isTeamTournament) championStats = [];
          else championStats = await generatePodiumStats(tournament._id, tournament.champion);
        }

        if (tournament.runnerUp) {
          if (tournament.type === "The Massacre Trilogy") runnerUpStats = generateMassacrePodiumStats(massacreRunnerUpData);
          else if (isTeamTournament) runnerUpStats = [];
          else runnerUpStats = await generatePodiumStats(tournament._id, tournament.runnerUp);
        }

        const champIndex = hofDoc.awards.findIndex((a) => a.awardName.includes("Champion"));
        const runnerIndex = hofDoc.awards.findIndex((a) => a.awardName.includes("Runner-Up"));

        if (tournament.champion) {
          const champObj = {
            awardName: isTeamTournament ? "Champion Team" : "Grand Champion",
            user: tournament.champion,
            userModel: userModelType,
            stats: championStats,
          };
          if (champIndex !== -1) hofDoc.awards[champIndex] = champObj;
          else hofDoc.awards.push(champObj);
        }

        if (tournament.runnerUp) {
          const runnerObj = {
            awardName: isTeamTournament ? "Runner-Up Team" : "Runner-Up",
            user: tournament.runnerUp,
            userModel: userModelType,
            stats: runnerUpStats,
          };
          if (runnerIndex !== -1) hofDoc.awards[runnerIndex] = runnerObj;
          else hofDoc.awards.push(runnerObj);
        }

        await hofDoc.save();
      } catch (podiumError) {
        console.error(`Podium Stats Error for tournament ${tournament._id}:`, podiumError);
      }

      await tournament.save();
      fixedCount++;
    }

    const successMessage = `Hall of Fame migration complete. Successfully updated ${fixedCount} tournaments.`;
    console.log(successMessage);

    if (res) return res.status(200).json({ message: successMessage });
    else return { message: successMessage };
  } catch (error) {
    console.error("Error backfilling Hall of Fame:", error);
    if (res) return res.status(500).json({ message: "Failed to backfill Hall of Fame." });
    throw new ApiError(500, "Failed to backfill Hall of Fame.");
  }
};


// ==========================================
// 2. FINALIZE TOURNAMENT (ENGINE ENTRY POINT)
// ==========================================
export const finalizeTournament = async (tournamentId, finalMatchId) => {
  try {
    const tournament = await Tournament.findById(tournamentId).populate("teams");
    if (!tournament || tournament.status === "Completed") return;

    let massacreChampData = null;
    let massacreRunnerUpData = null;

    if (tournament.type === "The Massacre Trilogy") {
      const leaderboard = await classicoServices.getChampionshipLeaderboard(tournamentId);

      if (leaderboard && leaderboard.length > 0) {
        massacreChampData = leaderboard[0];
        massacreRunnerUpData = leaderboard.length > 1 ? leaderboard[1] : null;

        const champIdOrName = massacreChampData._id;
        const runnerIdOrName = massacreRunnerUpData ? massacreRunnerUpData._id : null;

        let champTeam = await Team.findById(champIdOrName).catch(() => null);
        if (!champTeam) champTeam = await Team.findOne({ tournament: tournamentId, name: champIdOrName });
        tournament.champion = champTeam ? champTeam._id : null;

        if (runnerIdOrName) {
          let runnerTeam = await Team.findById(runnerIdOrName).catch(() => null);
          if (!runnerTeam) runnerTeam = await Team.findOne({ tournament: tournamentId, name: runnerIdOrName });
          tournament.runnerUp = runnerTeam ? runnerTeam._id : null;
        } else if (tournament.champion) {
          tournament.runnerUp = tournament.teams.find((t) => !t._id.equals(tournament.champion))?._id;
        }
      }
    } else {
      const finalMatch = await Match.findById(finalMatchId);
      if (finalMatch && finalMatch.winner) {
        tournament.champion = finalMatch.winner;
        tournament.runnerUp = getStrId(finalMatch.winner) === getStrId(finalMatch.team1) ? finalMatch.team2 : finalMatch.team1;
      }
    }

    try {
      if (tournament.type === "The Massacre Trilogy") await calculateMassacreHoF(tournament);
      else await calculateStandardHoF(tournament);
    } catch (hofError) {
      console.error("Hall of Fame Calculation Error:", hofError);
    }

    try {
      let hofDoc = await HallOfFame.findOne({ tournament: tournamentId });
      if (!hofDoc) hofDoc = new HallOfFame({ tournament: tournamentId, awards: [] });

      const teamTournamentTypes = ["Trifecta", "The Massacre Trilogy", "League + Knockout Team"];
      const isTeamTournament = teamTournamentTypes.includes(tournament.type);
      const userModelType = isTeamTournament ? "Team" : "users";

      let championStats = [];
      let runnerUpStats = [];

      if (tournament.champion) {
        if (tournament.type === "The Massacre Trilogy") championStats = generateMassacrePodiumStats(massacreChampData);
        else if (isTeamTournament) championStats = []; 
        else championStats = await generatePodiumStats(tournamentId, tournament.champion);
      }

      if (tournament.runnerUp) {
        if (tournament.type === "The Massacre Trilogy") runnerUpStats = generateMassacrePodiumStats(massacreRunnerUpData);
        else if (isTeamTournament) runnerUpStats = []; 
        else runnerUpStats = await generatePodiumStats(tournamentId, tournament.runnerUp);
      }

      const champIndex = hofDoc.awards.findIndex((a) => a.awardName.includes("Champion"));
      const runnerIndex = hofDoc.awards.findIndex((a) => a.awardName.includes("Runner-Up"));

      if (tournament.champion) {
        const champObj = {
          awardName: isTeamTournament ? "Champion Team" : "Grand Champion",
          user: tournament.champion,
          userModel: userModelType,
          stats: championStats,
        };
        if (champIndex !== -1) hofDoc.awards[champIndex] = champObj;
        else hofDoc.awards.push(champObj);
      }

      if (tournament.runnerUp) {
        const runnerObj = {
          awardName: isTeamTournament ? "Runner-Up Team" : "Runner-Up",
          user: tournament.runnerUp,
          userModel: userModelType,
          stats: runnerUpStats,
        };
        if (runnerIndex !== -1) hofDoc.awards[runnerIndex] = runnerObj;
        else hofDoc.awards.push(runnerObj);
      }

      await hofDoc.save();
    } catch (podiumError) {
      console.error("Podium Stats Calculation Error:", podiumError);
    }

    tournament.status = "Completed";
    await tournament.save();
    console.log(`Tournament ${tournamentId} finalized using match ${finalMatchId}`);
  } catch (err) {
    console.error("Finalization error:", err);
  }
};

// ==========================================
// 3. PUBLIC HALL OF FAME FETCHER (V-SHAPE ENGINE)
// ==========================================
export const getHallOfFameTournaments = async () => {
  const tournaments = await Tournament.find({
    status: "Completed",
    hallOfFame: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select(
      "name type participantType metadata champion runnerUp hallOfFame createdAt updatedAt",
    )
    .populate({
      path: "champion runnerUp",
      select: "name inGameUserName image avatar logo players",
      populate: {
        path: "players",
        select: "name inGameUserName image avatar",
        strictPopulate: false, 
      },
    })
    .populate({
      path: "hallOfFame",
      populate: [
        {
          path: "awards.user",
          select: "name inGameUserName image avatar logo players captain", 
          strictPopulate: false,
          populate: [
            {
              path: "players",
              select: "name inGameUserName image avatar",
              strictPopulate: false,
            },
            {
              path: "captain",
              select: "name inGameUserName image avatar",
              strictPopulate: false,
            }
          ]
        },
        {
          path: "awards.teamContext",
          select: "name logo",
          strictPopulate: false, 
        },
      ],
    });

  // RANKING ENGINE FOR TEAM V-SHAPE DISPLAY
  for (let tDoc of tournaments) {
    if (!tDoc.hallOfFame) continue;

    for (let award of tDoc.hallOfFame.awards) {
      // Check if it's a team with more than 3 players
      if (award.userModel === "Team" && award.user && award.user.players && award.user.players.length > 3) {
        const teamPlayers = award.user.players;
        const captainId = getStrId(award.user.captain);

        // 1. Get stats for ALL players in this team for this tournament: Wins > GD > GF
        const playerPerformance = await MatchHistory.aggregate([
          { 
            $match: { 
              tournament: tDoc._id, 
              player: { $in: teamPlayers.map(p => p._id) },
              result: { $ne: "Pending" }
            } 
          },
          {
            $group: {
              _id: "$player",
              wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
              gf: { $sum: "$scoreFor" },
              ga: { $sum: "$scoreAgainst" }
            }
          },
          { $addFields: { gd: { $subtract: ["$gf", "$ga"] } } },
          { $sort: { wins: -1, gd: -1, gf: -1 } }
        ]);

        // 2. Map performance results back to player objects
        const sortedPlayerObjects = playerPerformance.map(perf => 
          teamPlayers.find(tp => getStrId(tp) === getStrId(perf._id))
        ).filter(Boolean);

        // 3. Include any players who didn't play a match (at the bottom)
        const unplayedPlayers = teamPlayers.filter(tp => 
          !playerPerformance.some(perf => getStrId(perf._id) === getStrId(tp))
        );
        const fullRankedList = [...sortedPlayerObjects, ...unplayedPlayers];

        // 4. V-SHAPE RULE: [CAPTAIN, STAR1, STAR2, STAR3, ...OTHERS]
        const captainObj = teamPlayers.find(tp => getStrId(tp) === captainId) || teamPlayers[0];
        
        // Find top 3 performers WHO ARE NOT the captain
        const starsExcludingCaptain = fullRankedList
          .filter(p => getStrId(p) !== getStrId(captainObj))
          .slice(0, 3);
          
        // Gather the remaining roster members
        const remainingPlayers = fullRankedList.filter(p => 
            getStrId(p) !== getStrId(captainObj) && 
            !starsExcludingCaptain.some(s => getStrId(s) === getStrId(p))
        );

        // 5. Re-order the players array for the frontend: [0]=Captain, [1..3]=Top Stars
        award.user.players = [captainObj, ...starsExcludingCaptain, ...remainingPlayers].filter(Boolean);
      }
    }
  }

  return tournaments;
};

// --- HELPER: MASSACRE AWARDS (Wins > GD > GF) ---
async function calculateMassacreHoF(tournament) {
  const awardsArray = [];
  const leaderboard = await classicoServices.getChampionshipLeaderboard(tournament._id);

  let allPlayers = [];
  leaderboard.forEach((t) => t.players.forEach((p) => { allPlayers.push({ ...p, teamContext: t._id }); }));

  const getID = async (username) => {
    const user = await mongoose.model("users").findOne({ inGameUserName: username });
    return user ? user._id : null;
  };

  const mvp = allPlayers.sort((a, b) => {
    const aWins = a.wins || 0;
    const bWins = b.wins || 0;
    return b.total - a.total || bWins - aWins || b.gd - a.gd || b.gf - a.gf;
  })[0];

  if (mvp) {
    awardsArray.push({
      awardName: "Trilogy MVP",
      user: await getID(mvp.username),
      teamContext: mvp.teamContext,
      stats: [
        { label: "Championship Pts", value: mvp.total },
        { label: "Total Wins", value: mvp.wins || 0 },
        { label: "Goal Difference", value: mvp.gd },
        { label: "Goals Scored", value: mvp.gf || 0 }, 
      ],
    });
  }

  const phase1Stats = await MatchHistory.aggregate([
    { $match: { tournament: tournament._id, result: { $ne: "Pending" } } },
    { $lookup: { from: "matches", localField: "match", foreignField: "_id", as: "m" } },
    { $unwind: "$m" },
    { $match: { "m.league": { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$player",
        mp: { $sum: 1 },
        gf: { $sum: "$scoreFor" },
        ga: { $sum: "$scoreAgainst" },
        wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
      },
    },
    { $addFields: { gd: { $subtract: ["$gf", "$ga"] } } },
    { $sort: { gf: -1, wins: -1, gd: -1 } },
    { $limit: 1 },
  ]);

  const gmWinner = phase1Stats[0];
  if (gmWinner) {
    const gmTeam = tournament.teams.find((t) => t.players.some((p) => p.equals(gmWinner._id)));
    awardsArray.push({
      awardName: "Grind Master",
      user: gmWinner._id,
      teamContext: gmTeam ? gmTeam._id : null,
      stats: [
        { label: "Matches Played", value: gmWinner.mp },
        { label: "Wins", value: gmWinner.wins },
        { label: "Goals Scored", value: gmWinner.gf },
        { label: "Phase 1 Pts", value: gmWinner.wins }, 
      ],
    });
  }

  const phase2Stats = await MatchHistory.aggregate([
    { $match: { tournament: tournament._id, result: { $ne: "Pending" } } },
    { $lookup: { from: "matches", localField: "match", foreignField: "_id", as: "m" } },
    { $unwind: "$m" },
    { $match: { "m.series": { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$player",
        mp: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
        losses: { $sum: { $cond: [{ $eq: ["$result", "Loss"] }, 1, 0] } },
        gf: { $sum: "$scoreFor" },
        ga: { $sum: "$scoreAgainst" },
      },
    },
    { $addFields: { gd: { $subtract: ["$gf", "$ga"] } } },
  ]);

  const User = mongoose.model("users");
  const nemesisCandidates = await Promise.all(
    phase2Stats.map(async (stat) => {
      const userDoc = await User.findById(stat._id).select("inGameUserName");
      const p1Data = allPlayers.find((p) => p.username === (userDoc ? userDoc.inGameUserName : null));
      return {
        userId: stat._id,
        mp: stat.mp,
        gd: stat.gd,
        gf: stat.gf,
        losses: stat.losses,
        wins: stat.wins,
        p1: p1Data ? p1Data.p1 : 0,
      };
    })
  );

  nemesisCandidates.sort((a, b) => {
    if (b.gd !== a.gd) return b.gd - a.gd;
    if (b.gf !== a.gf) return b.gf - a.gf;
    if (a.losses !== b.losses) return a.losses - b.losses;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return b.p1 - a.p1;
  });

  const nemesisWinner = nemesisCandidates[0];
  if (nemesisWinner) {
    awardsArray.push({
      awardName: "The Nemesis",
      user: nemesisWinner.userId,
      stats: [
        { label: "Matches Played", value: nemesisWinner.mp },
        { label: "Goal Difference", value: nemesisWinner.gd },
        { label: "Goals For", value: nemesisWinner.gf },
        { label: "Phase 1 Pts", value: nemesisWinner.p1 },
      ],
    });
  }

  if (tournament.metadata?.giantKillers && tournament.metadata.giantKillers.length > 0) {
    const uniqueKillers = [...new Set(tournament.metadata.giantKillers)];
    for (const killerId of uniqueKillers) {
      
      const killerStats = await MatchHistory.aggregate([
        { $match: { tournament: tournament._id, player: new mongoose.Types.ObjectId(killerId), result: { $ne: "Pending" } } },
        { $group: { _id: "$player", mp: { $sum: 1 }, wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } }, gf: { $sum: "$scoreFor" } } }
      ]);
      const ks = killerStats[0] || { mp: 0, wins: 0, gf: 0 };

      awardsArray.push({
        awardName: "Giant Killer",
        user: killerId,
        stats: [
          { label: "Bonus Points", value: 5 },
          { label: "Matches Played", value: ks.mp },
          { label: "Wins", value: ks.wins },
          { label: "Goals Scored", value: ks.gf }
        ],
      });
    }
  }

  const newHoF = await HallOfFame.create({
    tournament: tournament._id,
    awards: awardsArray,
  });
  tournament.hallOfFame = newHoF._id;
}

// --- HELPER: STANDARD (SOLO / TRIFECTA) ---
async function calculateStandardHoF(tournament) {
  const awardsArray = [];

  const scorer = await MatchHistory.aggregate([
    { $match: { tournament: tournament._id, result: { $ne: "Pending" } } },
    { $group: { 
        _id: "$player", 
        totalGoals: { $sum: "$scoreFor" }, 
        mp: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } }
      } 
    },
    { $sort: { totalGoals: -1, mp: 1 } },
    { $limit: 1 },
  ]);

  if (scorer[0]) {
    const gpm = scorer[0].mp > 0 ? (scorer[0].totalGoals / scorer[0].mp).toFixed(2) : 0;
    awardsArray.push({
      awardName: "Top Scorer",
      user: scorer[0]._id,
      stats: [
        { label: "Matches Played", value: scorer[0].mp },
        { label: "Goals Scored", value: scorer[0].totalGoals },
        { label: "Wins", value: scorer[0].wins }, 
        { label: "Goals/Match", value: gpm }      
      ],
    });
  }

  const defender = await MatchHistory.aggregate([
    { $match: { tournament: tournament._id, result: { $ne: "Pending" } } },
    {
      $group: {
        _id: "$player",
        mp: { $sum: 1 },
        cleanSheets: { $sum: { $cond: [{ $eq: ["$scoreAgainst", 0] }, 1, 0] } },
        ga: { $sum: "$scoreAgainst" },
      },
    },
    { $sort: { cleanSheets: -1, ga: 1 } },
    { $limit: 1 },
  ]);

  if (defender[0] && defender[0].cleanSheets > 0) {
    const csPct = defender[0].mp > 0 ? Math.round((defender[0].cleanSheets / defender[0].mp) * 100) : 0;
    awardsArray.push({
      awardName: "Golden Glove",
      user: defender[0]._id,
      stats: [
        { label: "Matches Played", value: defender[0].mp },
        { label: "Clean Sheets", value: defender[0].cleanSheets },
        { label: "Goals Against", value: defender[0].ga }, 
        { label: "CS Rate", value: `${csPct}%` },          
      ],
    });
  }

  let mvpData = await MatchHistory.aggregate([
    { $match: { tournament: tournament._id, result: { $ne: "Pending" } } },
    {
      $group: {
        _id: "$player",
        mp: { $sum: 1 },
        wins: { $sum: { $cond: [{ $eq: ["$result", "Win"] }, 1, 0] } },
        gf: { $sum: "$scoreFor" },
        ga: { $sum: "$scoreAgainst" },
        cs: { $sum: { $cond: [{ $eq: ["$scoreAgainst", 0] }, 1, 0] } },
        motm: { $sum: { $cond: ["$isManOfTheMatch", 1, 0] } },
      },
    },
    {
      $addFields: {
        gd: { $subtract: ["$gf", "$ga"] },
        winPct: { $multiply: [{ $divide: ["$wins", "$mp"] }, 100] },
      },
    },
    {
      $sort: tournament.type === "Trifecta" ? { motm: -1, wins: -1 } : { wins: -1, gd: -1, gf: -1 },
    },
    { $limit: 1 },
  ]);

  if (mvpData[0]) {
    const winRate = `${Math.round(mvpData[0].winPct)}%`;
    awardsArray.push({
      awardName: "Tournament MVP",
      user: mvpData[0]._id,
      stats: [
        { label: "Matches Played", value: mvpData[0].mp },
        { label: "Wins", value: mvpData[0].wins },
        { label: "Win Rate", value: winRate },
        { label: "Goals Scored", value: mvpData[0].gf },
        { label: "Clean Sheets", value: mvpData[0].cs },
      ],
    });
  }

  const newHoF = await HallOfFame.create({
    tournament: tournament._id,
    awards: awardsArray,
  });
  tournament.hallOfFame = newHoF._id;
}

export const HallOfFameServices = {
  retroactivelyFixHallOfFame,
  getHallOfFameTournaments,
  finalizeTournament,
};