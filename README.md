# UniPark — Parking Management System

A web-based university parking management system. Students, staff, and visitors can find and book parking spots in real time. Admins can monitor occupancy, view analytics, and manage spots.

---

## Requirements

- Python 3.10 or higher
- A modern browser (Chrome, Firefox, Safari, Edge)

---

## Setup (first time only)

**Mac / Linux:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
python backend/seed.py --reset
```

**Windows:**

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
python backend/seed.py --reset
```

`seed.py --reset` creates the database and fills it with sample users, bookings, and historical occupancy data.

---

## Running the app

```bash
source .venv/bin/activate       # Mac/Linux (skip if already active)
.venv\Scripts\activate          # Windows (skip if already active)

python backend/app.py
```

Then open **http://127.0.0.1:5000** in your browser.

---

## Troubleshooting

**Port 5000 already in use (Mac)**
macOS uses port 5000 for AirPlay Receiver. To free it:
System Settings → General → AirDrop & Handoff → turn off AirPlay Receiver.
Then restart the app.

**"No module named flask" error**
Make sure the virtual environment is activated (you should see `(.venv)` in your terminal prompt) before running the app.

**Database errors**
Re-run the seed script to reset everything:

```bash
python backend/seed.py --reset
```

---
