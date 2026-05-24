from __future__ import annotations

import random
import string
from datetime import datetime, timedelta, timezone

from werkzeug.security import generate_password_hash

from db import connect, init_db

SPOT_ICONS = {
    "Standard": "🚗",
    "Compact": "🚙",
    "Disabled": "♿",
    "EV Charging": "⚡",
    "Reserved": "🔒",
}

SPOT_PRICES = {
    "Standard": 3.0,
    "Compact": 2.0,
    "Disabled": 2.0,
    "EV Charging": 5.0,
    "Reserved": 6.0,
}

ZONES = [
    ("A", "Zone A – Science", 20, "2 min", "Near Science & Engineering buildings"),
    ("B", "Zone B – Library", 20, "4 min", "Near Library and central lecture theatres"),
    ("C", "Zone C – Sports", 20, "6 min", "Near sports centre and gymnasium"),
    ("D", "Zone D – Business", 20, "5 min", "Near Business School and administration"),
    ("E", "Zone E – Visitor", 20, "8 min", "Outer visitor and overflow parking"),
]

NAMES = [
    "Alex Johnson", "Jordan Lee", "Sam Taylor", "Casey Morgan", "Riley Chen",
    "Drew Parker", "Quinn Davis", "Avery Wilson", "Blake Foster", "Cameron Hall",
    "Dakota Smith", "Ellis Brown", "Finley Jones", "Gray Thompson", "Harper White",
    "Indigo Clark", "Jamie Lewis", "Kendall Walker", "Logan Allen", "Morgan Scott",
    "Taylor Nguyen", "Sky Patel", "Rowan Kim", "Bailey Martin", "Charlie Evans",
]


def iso(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def rand_id(length: int = 6) -> str:
    return "".join(random.choice(string.ascii_uppercase + string.digits) for _ in range(length))


def spot_type(index: int) -> str:
    if index % 10 == 0:
        return "EV Charging"
    if index % 7 == 0:
        return "Disabled"
    if index % 5 == 0:
        return "Compact"
    if index % 13 == 0:
        return "Reserved"
    return "Standard"


def plate() -> str:
    return random.choice(["ABC", "DEF", "GHI", "JKL", "MNO", "QRS", "TUV"]) + " " + str(random.randint(100, 999))


def seed(reset: bool = False) -> None:
    random.seed(42)
    init_db()

    with connect() as conn:
        if reset:
            conn.executescript(
                """
                DELETE FROM sessions;
                DELETE FROM bookings;
                DELETE FROM occupancy_history;
                DELETE FROM parking_spots;
                DELETE FROM parking_zones;
                DELETE FROM users;
                """
            )

        existing = conn.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"]
        if existing > 0:
            print("Database already contains data. Use --reset to reseed.")
            return

        now = datetime.now(timezone.utc)

        users = [
            (
                "u0", "demo@unipark.edu.au", generate_password_hash("password"),
                "Alex Johnson", "student", "XYZ 999", "premium", iso(now - timedelta(days=90)),
            ),
            (
                "ua", "admin@unipark.edu.au", generate_password_hash("admin123"),
                "Admin User", "admin", "", "staff", iso(now - timedelta(days=365)),
            ),
        ]

        roles = ["student", "student", "student", "student", "staff", "staff", "visitor"]
        for i in range(1, 101):
            role = random.choice(roles)
            sub = "staff" if role == "staff" else random.choice(["basic", "premium"])
            users.append(
                (
                    f"u{i}", f"user{i}@unipark.edu.au", generate_password_hash("password"),
                    f"{NAMES[i % len(NAMES)]} {i}", role, plate(), sub,
                    iso(now - timedelta(days=random.randint(1, 180))),
                )
            )

        conn.executemany(
            """
            INSERT INTO users (id, email, password_hash, name, role, plate, subscription, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            users,
        )

        conn.executemany(
            """
            INSERT INTO parking_zones (id, name, capacity, walk, description)
            VALUES (?, ?, ?, ?, ?)
            """,
            ZONES,
        )

        spots = []
        for zone_id, _name, capacity, _walk, _desc in ZONES:
            for i in range(1, capacity + 1):
                typ = spot_type(i)
                spots.append((f"{zone_id}{i}", zone_id, typ, SPOT_PRICES[typ], SPOT_ICONS[typ], 0))

        conn.executemany(
            """
            INSERT INTO parking_spots (id, zone, type, price, icon, closed)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            spots,
        )

        normal_users = [u for u in users if u[4] != "admin"]
        bookings = []
        # 150 historical/future bookings. Enough to satisfy 100+ test records.
        for _ in range(150):
            user = random.choice(normal_users)
            spot = random.choice(spots)
            days_offset = random.randint(-60, 10)
            hour = random.randint(7, 19)
            start = now + timedelta(days=days_offset)
            start = start.replace(hour=hour, minute=0, second=0, microsecond=0)
            duration = random.randint(1, 5)
            end = start + timedelta(hours=duration)
            expired = 1 if end < now else 0
            bookings.append(
                (
                    rand_id(), spot[0], spot[1], user[0], user[1], iso(start), iso(end),
                    round(duration * float(spot[3]), 2), random.choice(["card", "apple", "google"]),
                    "success", iso(start - timedelta(minutes=random.randint(2, 60))), 0, expired,
                )
            )

        conn.executemany(
            """
            INSERT INTO bookings
            (id, spot_id, zone, user_id, user_email, start_time, end_time, total,
             pay_method, payment_status, created_at, cancelled, expired)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            bookings,
        )

        history = []
        for d in range(30, -1, -1):
            for h in range(24):
                ts = now - timedelta(days=d)
                ts = ts.replace(hour=h, minute=0, second=0, microsecond=0)
                for zone_id, _name, cap, _walk, _desc in ZONES:
                    if 8 <= h <= 10:
                        base = 0.75 + random.random() * 0.20
                    elif 12 <= h <= 14:
                        base = 0.55 + random.random() * 0.15
                    elif 16 <= h <= 18:
                        base = 0.70 + random.random() * 0.20
                    elif 7 <= h < 8:
                        base = 0.40 + random.random() * 0.20
                    elif h >= 19 or h < 7:
                        base = 0.05 + random.random() * 0.10
                    else:
                        base = 0.30 + random.random() * 0.15
                    occupied = min(cap, round(cap * base))
                    history.append((iso(ts), zone_id, occupied, cap))

        conn.executemany(
            """
            INSERT INTO occupancy_history (ts, zone, occupied, capacity)
            VALUES (?, ?, ?, ?)
            """,
            history,
        )

    print("Seeded database with 102 users, 100 spots, 150 bookings, and 3720 occupancy records.")


if __name__ == "__main__":
    import sys

    seed(reset="--reset" in sys.argv)
