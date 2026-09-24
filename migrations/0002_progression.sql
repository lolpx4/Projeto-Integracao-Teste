CREATE TABLE IF NOT EXISTS car_upgrades (
  username TEXT NOT NULL,
  car TEXT NOT NULL,
  speed INTEGER NOT NULL DEFAULT 0,
  acceleration INTEGER NOT NULL DEFAULT 0,
  braking INTEGER NOT NULL DEFAULT 0,
  handling INTEGER NOT NULL DEFAULT 0,
  nitro INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (username, car)
);

CREATE INDEX IF NOT EXISTS idx_race_results_track ON race_results(track);
