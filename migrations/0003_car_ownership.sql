CREATE TABLE IF NOT EXISTS owned_cars (
  username TEXT NOT NULL,
  car TEXT NOT NULL,
  purchased_at INTEGER NOT NULL,
  PRIMARY KEY (username, car)
);

CREATE INDEX IF NOT EXISTS idx_owned_cars_user ON owned_cars(username);

INSERT OR IGNORE INTO owned_cars (username, car, purchased_at)
SELECT username, 'red', created_at
FROM users;
