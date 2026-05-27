from __future__ import annotations

import re
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from flask import Flask, Response, jsonify, request, send_from_directory
from werkzeug.security import check_password_hash, generate_password_hash

from db import DB_PATH, all_rows, connect, init_db, row_to_dict, rows_to_dicts

FRONTEND_DIR = Path(__file__).resolve().parents[1] / "frontend"

app = Flask(__name__, static_folder=None)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
SAFE_TEXT_RE = re.compile(r"^[^<>]{1,120}$")

SPOT_ICONS = {
    "Standard": "🚗",
    "Compact": "🚙",
    "Disabled": "♿",
    "EV Charging": "⚡",
    "Reserved": "🔒",
}


def now_utc() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt: datetime) -> str:
    return dt.isoformat().replace("+00:00", "Z")


def parse_dt(value: str) -> datetime:
    # HTML datetime-local values arrive as YYYY-MM-DDTHH:MM.
    # Existing seed/API values may arrive with Z.
    value = value.strip()
    if value.endswith("Z"):
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def clean_text(value: str, field: str, required: bool = True) -> str:
    value = (value or "").strip()
    if required and not value:
        raise ValueError(f"{field} is required.")
    if value and not SAFE_TEXT_RE.match(value):
        raise ValueError(f"{field} contains invalid characters.")
    return value


def error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def get_token() -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:].strip()
    return request.cookies.get("unipark_token")


def public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "name": row["name"],
        "role": row["role"],
        "plate": row.get("plate") or "",
        "subscription": row.get("subscription") or "basic",
        "joinedAt": row.get("joined_at"),
    }


def current_user() -> dict[str, Any] | None:
    token = get_token()
    if not token:
        return None
    with connect() as conn:
        row = conn.execute(
            """
            SELECT u.*
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ?
            """,
            (token,),
        ).fetchone()
    return dict(row) if row else None


def require_user() -> dict[str, Any] | tuple[Any, int]:
    user = current_user()
    if not user:
        return error("Authentication required.", 401)
    return user


def require_admin() -> dict[str, Any] | tuple[Any, int]:
    user = require_user()
    if isinstance(user, tuple):
        return user
    if user["role"] != "admin":
        return error("Admin access required.", 403)
    return user


def zone_rows() -> list[dict[str, Any]]:
    rows = all_rows("SELECT id, name, capacity, walk, description AS desc FROM parking_zones ORDER BY id")
    return rows_to_dicts(rows)


def spot_rows() -> list[dict[str, Any]]:
    rows = all_rows("SELECT id, zone, type, price, icon, closed FROM parking_spots ORDER BY zone, CAST(SUBSTR(id, 2) AS INTEGER)")
    return [
        {
            "id": r["id"],
            "zone": r["zone"],
            "type": r["type"],
            "price": float(r["price"]),
            "icon": r["icon"],
            "closed": bool(r["closed"]),
        }
        for r in rows
    ]


def booking_dict(row: dict[str, Any], reveal_user: bool = True, current_email: str | None = None) -> dict[str, Any]:
    expired = bool(row.get("expired")) or row["end_time"] <= iso(now_utc()) or bool(row.get("cancelled"))
    own = current_email and row["user_email"] == current_email
    user_email = row["user_email"] if (reveal_user or own) else "occupied@system"
    user_id = row["user_id"] if (reveal_user or own) else "occupied"
    return {
        "id": row["id"],
        "spotId": row["spot_id"],
        "zone": row["zone"],
        "userEmail": user_email,
        "userId": user_id,
        "start": row["start_time"],
        "end": row["end_time"],
        "total": float(row["total"]),
        "payMethod": row["pay_method"],
        "paymentStatus": row.get("payment_status", "success"),
        "createdAt": row["created_at"],
        "cancelled": bool(row.get("cancelled")),
        "expired": expired,
    }


def bookings_for_user(user: dict[str, Any]) -> list[dict[str, Any]]:
    rows = all_rows(
        """
        SELECT * FROM bookings
        WHERE cancelled = 0
        ORDER BY created_at ASC
        """
    )
    reveal = user["role"] == "admin"
    return [booking_dict(dict(r), reveal_user=reveal, current_email=user["email"]) for r in rows]


def active_booking_conflict(conn, spot_id: str, start_iso: str, end_iso: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM bookings
        WHERE spot_id = ?
          AND cancelled = 0
          AND expired = 0
          AND start_time < ?
          AND end_time > ?
        LIMIT 1
        """,
        (spot_id, end_iso, start_iso),
    ).fetchone()
    return row is not None


def expire_old_bookings() -> None:
    with connect() as conn:
        conn.execute(
            "UPDATE bookings SET expired = 1 WHERE end_time <= ? AND expired = 0",
            (iso(now_utc()),),
        )


@app.after_request
def add_cors_headers(resp: Response) -> Response:
    resp.headers["Access-Control-Allow-Origin"] = request.headers.get("Origin", "*")
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PATCH, DELETE, OPTIONS"
    return resp


@app.route("/api/<path:_path>", methods=["OPTIONS"])
def options(_path: str):
    return "", 204


@app.route("/")
def root():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def frontend(path: str):
    if path.startswith("api/"):
        return error("Unknown API endpoint.", 404)
    file_path = FRONTEND_DIR / path
    if file_path.exists() and file_path.is_file():
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "database": str(DB_PATH)})


@app.get("/api/bootstrap")
def bootstrap():
    return jsonify({
        "ok": True,
        "zones": zone_rows(),
        "spots": spot_rows(),
    })


@app.post("/api/login")
def login():
    data = request.get_json(force=True, silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return error("Email and password are required.")

    with connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE LOWER(email) = LOWER(?)", (email,)).fetchone()
        if not row or not check_password_hash(row["password_hash"], password):
            return error("Invalid email or password.", 401)
        token = secrets.token_urlsafe(32)
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, row["id"], iso(now_utc())),
        )

    return jsonify({"ok": True, "token": token, "user": public_user(dict(row))})


@app.post("/api/register")
def register():
    data = request.get_json(force=True, silent=True) or {}
    try:
        name = clean_text(data.get("name", ""), "Name")
        email = clean_text(data.get("email", ""), "Email").lower()
        plate = clean_text(data.get("plate", ""), "Plate", required=False).upper()
    except ValueError as exc:
        return error(str(exc))

    password = data.get("password") or ""
    role = data.get("role") or "student"
    subscription = data.get("subscription") or "basic"

    if not EMAIL_RE.match(email):
        return error("A valid email address is required.")
    if len(password) < 6:
        return error("Password must be at least 6 characters.")
    if role not in {"student", "staff", "visitor"}:
        return error("Invalid registration role.")
    if subscription not in {"basic", "premium", "staff"}:
        subscription = "basic"

    user_id = "u" + secrets.token_hex(4)
    token = secrets.token_urlsafe(32)

    with connect() as conn:
        exists = conn.execute("SELECT 1 FROM users WHERE LOWER(email) = LOWER(?)", (email,)).fetchone()
        if exists:
            return error("An account with this email already exists.", 409)
        conn.execute(
            """
            INSERT INTO users (id, email, password_hash, name, role, plate, subscription, joined_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (user_id, email, generate_password_hash(password), name, role, plate, subscription, iso(now_utc())),
        )
        conn.execute(
            "INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)",
            (token, user_id, iso(now_utc())),
        )
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()

    return jsonify({"ok": True, "token": token, "user": public_user(dict(row))})


@app.post("/api/logout")
def logout():
    token = get_token()
    if token:
        with connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    return jsonify({"ok": True})


@app.get("/api/me")
def me():
    user = require_user()
    if isinstance(user, tuple):
        return user
    return jsonify({"ok": True, "user": public_user(user)})


@app.get("/api/users")
def users():
    admin = require_admin()
    if isinstance(admin, tuple):
        return admin
    rows = all_rows("SELECT * FROM users ORDER BY joined_at DESC")
    return jsonify({"ok": True, "users": [public_user(dict(r)) for r in rows]})


@app.get("/api/spots")
def spots():
    return jsonify({"ok": True, "spots": spot_rows()})


@app.patch("/api/spots/<spot_id>/toggle-closed")
def toggle_spot(spot_id: str):
    admin = require_admin()
    if isinstance(admin, tuple):
        return admin
    with connect() as conn:
        row = conn.execute("SELECT * FROM parking_spots WHERE id = ?", (spot_id,)).fetchone()
        if not row:
            return error("Parking spot not found.", 404)
        new_value = 0 if row["closed"] else 1
        conn.execute("UPDATE parking_spots SET closed = ? WHERE id = ?", (new_value, spot_id))
        updated = conn.execute("SELECT * FROM parking_spots WHERE id = ?", (spot_id,)).fetchone()
    return jsonify({"ok": True, "spot": dict(updated)})


@app.get("/api/bookings")
def bookings():
    user = require_user()
    if isinstance(user, tuple):
        return user
    expire_old_bookings()
    return jsonify({"ok": True, "bookings": bookings_for_user(user)})


@app.post("/api/bookings")
def create_booking():
    user = require_user()
    if isinstance(user, tuple):
        return user
    data = request.get_json(force=True, silent=True) or {}

    spot_id = (data.get("spotId") or data.get("spot_id") or "").strip().upper()
    pay_method = data.get("payMethod") or data.get("pay_method") or "card"
    requested_id = (data.get("id") or "").strip().upper()

    if pay_method not in {"card", "apple", "sim"}:
        return error("Invalid payment method.")

    try:
        start_dt = parse_dt(data.get("start", ""))
        end_dt = parse_dt(data.get("end", ""))
    except Exception:
        return error("Invalid booking time.")

    if end_dt <= start_dt:
        return error("End time must be after start time.")
    if start_dt < now_utc() - timedelta(minutes=5):
        return error("Booking start time cannot be in the past.")
    if (end_dt - start_dt).total_seconds() > 24 * 3600:
        return error("Bookings cannot exceed 24 hours.")

    start_iso = iso(start_dt)
    end_iso = iso(end_dt)

    with connect() as conn:
        spot = conn.execute("SELECT * FROM parking_spots WHERE id = ?", (spot_id,)).fetchone()
        if not spot:
            return error("Parking spot not found.", 404)
        if spot["closed"]:
            return error("This parking spot is closed.")
        if active_booking_conflict(conn, spot_id, start_iso, end_iso):
            return error("This parking spot is no longer available for the selected time.", 409)

        hours = (end_dt - start_dt).total_seconds() / 3600
        total = round(hours * float(spot["price"]), 2)
        booking_id = requested_id if requested_id else secrets.token_hex(3).upper()
        while conn.execute("SELECT 1 FROM bookings WHERE id = ?", (booking_id,)).fetchone():
            booking_id = secrets.token_hex(3).upper()

        conn.execute(
            """
            INSERT INTO bookings
            (id, spot_id, zone, user_id, user_email, start_time, end_time, total,
             pay_method, payment_status, created_at, cancelled, expired)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
            """,
            (
                booking_id,
                spot["id"],
                spot["zone"],
                user["id"],
                user["email"],
                start_iso,
                end_iso,
                total,
                pay_method,
                "success",
                iso(now_utc()),
            ),
        )
        row = conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()

    return jsonify({"ok": True, "booking": booking_dict(dict(row), reveal_user=True, current_email=user["email"])})


@app.delete("/api/bookings/<booking_id>")
def cancel_booking(booking_id: str):
    user = require_user()
    if isinstance(user, tuple):
        return user
    with connect() as conn:
        row = conn.execute("SELECT * FROM bookings WHERE id = ?", (booking_id,)).fetchone()
        if not row:
            return error("Booking not found.", 404)
        if user["role"] != "admin" and row["user_id"] != user["id"]:
            return error("You can only cancel your own bookings.", 403)
        conn.execute("UPDATE bookings SET cancelled = 1, expired = 1 WHERE id = ?", (booking_id,))
    return jsonify({"ok": True})


@app.post("/api/bookings/expire")
def expire_bookings_route():
    user = require_user()
    if isinstance(user, tuple):
        return user
    expire_old_bookings()
    return jsonify({"ok": True})


@app.get("/api/history")
def history():
    user = require_user()
    if isinstance(user, tuple):
        return user
    rows = all_rows("SELECT ts, zone, occupied, capacity FROM occupancy_history ORDER BY ts ASC")
    return jsonify({"ok": True, "history": rows_to_dicts(rows)})


@app.get("/api/admin-stats")
def admin_stats():
    admin = require_admin()
    if isinstance(admin, tuple):
        return admin
    expire_old_bookings()
    with connect() as conn:
        total_bookings = conn.execute("SELECT COUNT(*) AS n FROM bookings WHERE user_id <> 'sim' AND cancelled = 0").fetchone()["n"]
        total_users = conn.execute("SELECT COUNT(*) AS n FROM users WHERE role <> 'admin'").fetchone()["n"]
        revenue = conn.execute("SELECT COALESCE(SUM(total), 0) AS n FROM bookings WHERE user_id <> 'sim' AND cancelled = 0").fetchone()["n"]
        active_now = conn.execute(
            "SELECT COUNT(*) AS n FROM bookings WHERE cancelled = 0 AND expired = 0 AND end_time > ?",
            (iso(now_utc()),),
        ).fetchone()["n"]
        total_spots = conn.execute("SELECT COUNT(*) AS n FROM parking_spots").fetchone()["n"]
    return jsonify({
        "ok": True,
        "stats": {
            "totalBookings": total_bookings,
            "totalUsers": total_users,
            "revenue": float(revenue or 0),
            "activeNow": active_now,
            "totalSpots": total_spots,
        },
    })


@app.post("/api/simulation/tick")
def simulation_tick():
    user = require_user()
    if isinstance(user, tuple):
        return user

    current = now_utc()
    hour = current.hour
    occupy_prob = 0.6 if (8 <= hour <= 10 or 16 <= hour <= 18) else 0.45 if 11 <= hour <= 15 else 0.15

    with connect() as conn:
        expire_old_bookings()
        spots = conn.execute("SELECT * FROM parking_spots WHERE closed = 0").fetchall()
        active = conn.execute(
            "SELECT * FROM bookings WHERE cancelled = 0 AND expired = 0 AND end_time > ?",
            (iso(current),),
        ).fetchall()
        occupied_ids = {r["spot_id"] for r in active}
        available = [s for s in spots if s["id"] not in occupied_ids]
        simulated_active = [r for r in active if r["user_id"] == "sim"]

        if secrets.randbelow(1000) / 1000 < occupy_prob and available:
            spot = available[secrets.randbelow(len(available))]
            duration = 1 + secrets.randbelow(3)
            end_dt = current + timedelta(hours=duration)
            booking_id = secrets.token_hex(3).upper()
            conn.execute(
                """
                INSERT INTO bookings
                (id, spot_id, zone, user_id, user_email, start_time, end_time, total,
                 pay_method, payment_status, created_at, cancelled, expired)
                VALUES (?, ?, ?, 'sim', 'sim@system', ?, ?, ?, 'sim', 'success', ?, 0, 0)
                """,
                (
                    booking_id,
                    spot["id"],
                    spot["zone"],
                    iso(current),
                    iso(end_dt),
                    round(duration * float(spot["price"]), 2),
                    iso(current),
                ),
            )
        elif simulated_active and secrets.randbelow(1000) > 600:
            chosen = simulated_active[secrets.randbelow(len(simulated_active))]
            conn.execute("UPDATE bookings SET expired = 1 WHERE id = ?", (chosen["id"],))

    return jsonify({"ok": True, "bookings": bookings_for_user(user)})


if __name__ == "__main__":
    init_db()
    app.run(host="127.0.0.1", port=5000, debug=True)
