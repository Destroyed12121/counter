// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cookieParser());

const DATA_FILE = path.join(__dirname, 'data.json');

// Initialize data structure for counters and visitor tracking.
let data = {
  allTime: 0,
  today: 0,
  yesterday: 0,
  todayDate: getTodayDate(),
  // visitors object maps a unique visitor ID to an object { lastSeen, counted }
  visitors: {}
};

function getTodayDate() {
  // Returns date as "YYYY-MM-DD"
  const now = new Date();
  return now.toISOString().split('T')[0];
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      data = JSON.parse(fs.readFileSync(DATA_FILE));
    } catch (err) {
      console.error('Error reading data file, using defaults:', err);
    }
  }
}

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

// Called on each request to check if the day has changed.
function updateDate() {
  const currentDate = getTodayDate();
  if (data.todayDate !== currentDate) {
    // move today's count to yesterday, reset today count
    data.yesterday = data.today;
    data.today = 0;
    data.todayDate = currentDate;
    // Reset the "counted" flag for each visitor so they can be counted again.
    for (let visitor in data.visitors) {
      data.visitors[visitor].counted = false;
    }
    saveData();
  }
}

// Visitor hit endpoint – call this when a visitor loads your page.
app.get('/api/visit', (req, res) => {
  updateDate();
  let visitorId = req.cookies.visitorId;
  if (!visitorId) {
    // Generate a new unique ID for this visitor and set a cookie (lasting 1 year)
    visitorId = generateVisitorId();
    res.cookie('visitorId', visitorId, { maxAge: 365 * 24 * 60 * 60 * 1000 });
  }
  const now = Date.now();
  // Create or update the visitor record
  if (!data.visitors[visitorId]) {
    data.visitors[visitorId] = { lastSeen: now, counted: false };
  } else {
    data.visitors[visitorId].lastSeen = now;
  }
  // If this visitor has not yet been counted for today, update the counts.
  if (!data.visitors[visitorId].counted) {
    data.today++;
    data.allTime++;
    data.visitors[visitorId].counted = true;
  }
  saveData();
  res.json({ success: true });
});

// Endpoint for periodic pings to update the visitor’s last-seen time.
app.get('/api/ping', (req, res) => {
  let visitorId = req.cookies.visitorId;
  if (visitorId && data.visitors[visitorId]) {
    data.visitors[visitorId].lastSeen = Date.now();
    saveData();
  }
  res.json({ success: true });
});

// Endpoint to fetch the current stats.
app.get('/api/stats', (req, res) => {
  updateDate();
  const now = Date.now();
  // Consider visitors with a lastSeen within the last 5 minutes (300000 ms) as online.
  let online = 0;
  for (let visitor in data.visitors) {
    if (now - data.visitors[visitor].lastSeen <= 300000) {
      online++;
    }
  }
  res.json({
    online: online,
    today: data.today,
    yesterday: data.yesterday,
    allTime: data.allTime
  });
});

// Helper: generate a simple unique visitor ID.
function generateVisitorId() {
  return Math.random().toString(36).substring(2, 15);
}

const PORT = process.env.PORT || 3000;
loadData();
app.listen(PORT, () => {
  console.log(`Visitor counter server running on port ${PORT}`);
});
