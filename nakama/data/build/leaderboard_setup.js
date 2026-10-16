function createLeaderboards(nk, logger) {
  try {
    nk.leaderboardCreate("best_wave", false, "desc", "best", "", {});
    nk.leaderboardCreate("most_kills", false, "desc", "best", "", {});
    nk.leaderboardCreate("total_wins", false, "desc", "incr", "", {});
    logger.info("Leaderboards created.");
  } catch (e) {
    logger.info("Leaderboards already exist or failed: " + String(e.message || e));
  }
}
