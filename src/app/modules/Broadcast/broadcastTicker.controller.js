// backend/controllers/tickerController.js
import { BroadcastTicker } from "./broadcastTicker.model.js";
import { Match } from "../match/match.model.js"; // Adjust based on your match model
import { Tournament } from "../tournaments/tournament.model.js"; // <-- ADD THIS IMPORT

export const getLiveTickerData = async (req, res) => {
  try {
    // 1. Fetch GLOBAL Active Admin Broadcasts 
    const broadcasts = await BroadcastTicker.find({ 
      isActive: true,
      tournamentId: null 
    }).sort({ createdAt: -1 });

    const formattedBroadcasts = broadcasts.map(b => ({
      id: b._id,
      type: b.type, 
      text: b.message,
      link: b.link
    }));

    // 2. Find ALL currently "Live" tournaments
    const liveTournaments = await Tournament.find({ status: "Live" }).select("_id");
    const liveTournamentIds = liveTournaments.map(t => t._id);

    let matchData = [];

    // 3. Only fetch matches IF there is at least one Live tournament
    if (liveTournamentIds.length > 0) {
      const recentMatches = await Match.find({ 
        status: "Completed",
        team1: { $ne: null }, 
        team2: { $ne: null },
        tournament: { $in: liveTournamentIds } // <-- ONLY matches from LIVE tournaments
      })
      .sort({ updatedAt: -1 })
      .limit(10) // Max 10 matches
      .populate({ path: "team1", model: "users", select: "name inGameUserName image" })
      .populate({ path: "team2", model: "users", select: "name inGameUserName image" })
      .populate({ path: "winner", model: "users", select: "name inGameUserName image" });

      // Process Match Data safely
      matchData = recentMatches.map(match => {
        const isDraw = !match.winner;
        const margin = isDraw ? 0 : Math.abs((match.team1_score || 0) - (match.team2_score || 0));
        
        const t1Name = match.team1?.inGameUserName || match.team1?.name || "Unknown";
        const t2Name = match.team2?.inGameUserName || match.team2?.name || "Unknown";
        
        const t1Image = match.team1?.image?.url || match.team1?.image || null;
        const t2Image = match.team2?.image?.url || match.team2?.image || null;

        const winnerName = match.winner?.inGameUserName || match.winner?.name || "Unknown";
        const winnerImage = match.winner?.image?.url || match.winner?.image || null;
        
        let loserName = "Unknown";
        let loserImage = null;

        if (!isDraw && match.team1 && match.team2) {
          const isTeam1Winner = match.winner._id.toString() === match.team1._id.toString();
          loserName = isTeam1Winner ? t2Name : t1Name;
          loserImage = isTeam1Winner ? t2Image : t1Image;
        }

        return {
          id: match._id,
          type: "CombatLog",
          isDraw,
          team1: t1Name,
          team2: t2Name,
          team1Image: t1Image,
          team2Image: t2Image,
          winner: winnerName,
          loser: loserName,
          winnerImage,
          loserImage,
          score1: match.team1_score || 0,
          score2: match.team2_score || 0,
          margin
        };
      });
    }

    // 4. Combine and send (If no live tournaments, matchData is just an empty array)
    res.status(200).json({ success: true, data: [...formattedBroadcasts, ...matchData] });

  } catch (error) {
    console.error("Ticker Fetch Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};
// backend/controllers/tickerController.js

// Create a new custom broadcast
export const createBroadcast = async (req, res) => {
  try {
    const { message, type, link, tournamentId } = req.body;
    const newBroadcast = await BroadcastTicker.create({ 
      message, 
      type, 
      link, 
      tournamentId: tournamentId || null 
    });
    res.status(201).json({ success: true, data: newBroadcast });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete a broadcast when it's outdated
export const deleteBroadcast = async (req, res) => {
  try {
    await BroadcastTicker.findByIdAndDelete(req.params.id);
    res.status(200).json({ success: true, message: "Broadcast terminated." });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};