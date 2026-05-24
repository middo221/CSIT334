PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'staff', 'visitor', 'admin')),
    plate TEXT,
    subscription TEXT NOT NULL DEFAULT 'basic',
    joined_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS parking_zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    walk TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS parking_spots (
    id TEXT PRIMARY KEY,
    zone TEXT NOT NULL,
    type TEXT NOT NULL,
    price REAL NOT NULL CHECK (price >= 0),
    icon TEXT NOT NULL,
    closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
    FOREIGN KEY (zone) REFERENCES parking_zones(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    spot_id TEXT NOT NULL,
    zone TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_email TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    total REAL NOT NULL CHECK (total >= 0),
    pay_method TEXT NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'success',
    created_at TEXT NOT NULL,
    cancelled INTEGER NOT NULL DEFAULT 0 CHECK (cancelled IN (0, 1)),
    expired INTEGER NOT NULL DEFAULT 0 CHECK (expired IN (0, 1)),
    FOREIGN KEY (spot_id) REFERENCES parking_spots(id),
    FOREIGN KEY (zone) REFERENCES parking_zones(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS occupancy_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    zone TEXT NOT NULL,
    occupied INTEGER NOT NULL CHECK (occupied >= 0),
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    FOREIGN KEY (zone) REFERENCES parking_zones(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_spot_time ON bookings(spot_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_history_zone_ts ON occupancy_history(zone, ts);
