require("dotenv").config();
const jwt = require("jsonwebtoken");
const BOOKING_PIN = process.env.BOOKING_PIN;
const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const helmet = require("helmet");

const app = express();

app.set("trust proxy", 1);

app.use(helmet());

const bookingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
});

const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const EMAIL_TO = process.env.EMAIL_TO;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = (
  process.env.TELEGRAM_CHAT_IDS ||
  process.env.TELEGRAM_CHAT_ID ||
  ""
)
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASS,
  },
});

const allowedOrigins = [
  "https://pleasure-app.vercel.app",
  "https://pleasure-app-git-supabase-migration-imaxpgs-projects.vercel.app",
  "https://perofrizer.me",
  "https://frizerpavicevic.com",
  "https://www.frizerpavicevic.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS nije dozvoljen"));
      }
    },
  })
);

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS barbers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      active INTEGER DEFAULT 1
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id SERIAL PRIMARY KEY,
      date TEXT,
      time TEXT,
      client_name TEXT,
      client_phone TEXT,
      status TEXT,
      barber_id INTEGER DEFAULT 1 REFERENCES barbers(id),
      booked_by TEXT DEFAULT 'user'
    )
  `);

  await pool.query(`
    INSERT INTO barbers (id, name, active)
    VALUES
      (1, 'Pero', 1),
      (2, 'Dženo', 1)
    ON CONFLICT (id)
    DO UPDATE SET
      name = EXCLUDED.name,
      active = EXCLUDED.active
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot_barber
    ON appointments(date, time, barber_id)
    WHERE status IN ('pending', 'confirmed', 'blocked')
  `);

  console.log("PostgreSQL baza spremna ✅");
}

initDb().catch((err) => {
  console.error("Greška pri inicijalizaciji baze:", err);
});

function sendTelegramNotification(message) {
  if (!TELEGRAM_BOT_TOKEN || TELEGRAM_CHAT_IDS.length === 0) {
    console.log("Telegram notifikacije nijesu podešene.");
    return;
  }

  for (const chatId of TELEGRAM_CHAT_IDS) {
    fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Telegram greška za chat ${chatId}:`, errorText);
        }
      })
      .catch((err) => {
        console.error(`Greška pri slanju Telegram notifikacije za chat ${chatId}:`, err.message);
      });
  }
}

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Nije autorizovano" });
  }

  const token = authHeader.split(" ")[1];

  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token nije validan ili je istekao" });
  }
}

function getAdminBarberId(req) {
  return Number(req.admin?.barber_id || req.body?.barber_id || req.query?.barber_id || 1) || 1;
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
}

function isValidPhone(phone) {
  return /^06[0-9]{7}$/.test(String(phone || "").trim());
}

function isValidTime(time) {
  return /^([01][0-9]|2[0-3]):(00|30)$/.test(String(time || ""));
}

function getBarberName(barberId) {
  const id = Number(barberId) || 1;
  const barberNameMap = {
    1: "Pero",
    2: "Dženo",
  };

  return barberNameMap[id] || `Frizer ${id}`;
}


function isPastSlot(date, time) {
  return new Date(`${date}T${time}:00`) <= new Date();
}

async function cleanupExpiredPending() {
  try {
    await pool.query(`
      UPDATE appointments
      SET status = 'expired'
      WHERE status = 'pending'
      AND (date || 'T' || time)::timestamp <= NOW()
    `);
  } catch (err) {
    console.error("Greška pri čišćenju starih pending zahtjeva:", err);
  }
}

async function generateNext7DaysReport(callback) {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 7);

  try {
    const result = await pool.query(`
      SELECT * FROM appointments
      WHERE status = 'confirmed'
      AND (date || 'T' || time)::timestamp >= NOW()
      ORDER BY date ASC, time ASC
    `);

    const rows = result.rows;

    let text = "FRIZERSKI SALON PLEASURE\n";
    text += "TERMINI ZA NAREDNIH 7 DANA\n\n";

    let currentDate = "";

    rows.forEach((r) => {
      const appointmentDate = new Date(`${r.date}T00:00:00`);

      if (appointmentDate > end) return;

      if (r.date !== currentDate) {
        currentDate = r.date;
        text += `\n${r.date}\n-------------------\n`;
      }

      const barberLabel = ` - ${getBarberName(r.barber_id)}`;
      const adminLabel = r.booked_by === "admin" ? " (Zakazao Admin)" : "";
      text += `${r.time} - ${r.client_name} - ${r.client_phone || "-"}${barberLabel}${adminLabel}\n`;
    });

    callback(null, text);
  } catch (err) {
    callback(err);
  }
}

cleanupExpiredPending();
setInterval(cleanupExpiredPending, 10 * 60 * 1000);

app.get("/", (req, res) => {
  res.send("Backend radi ✅");
});

app.get("/test-telegram", (req, res) => {
  sendTelegramNotification("✅ Test Telegram notifikacije iz Pleasure backend-a");
  res.json({ success: true, chat_count: TELEGRAM_CHAT_IDS.length });
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: "Previše pokušaja. Pokušajte ponovo za 15 minuta." },
});

app.post("/admin/login", adminLoginLimiter, (req, res) => {
  const { password, barber_id = 1 } = req.body;
  const selectedBarberId = Number(barber_id) || 1;

  const barberPasswordMap = {
  1: process.env.ADMIN_PASSWORD_PERO,
  2: process.env.ADMIN_PASSWORD_DZENO,
};


const expectedPassword = barberPasswordMap[selectedBarberId];

if (!expectedPassword) {
  return res.status(500).json({ error: "Admin lozinka nije podešena za ovog frizera." });
}

  

  if (password === expectedPassword) {
    const token = jwt.sign(
      {
        role: "admin",
        barber_id: selectedBarberId,
        barber_name: getBarberName(selectedBarberId),
      },
      JWT_SECRET,
      { expiresIn: "14h" }
    );

    return res.json({
      token,
      barber_id: selectedBarberId,
      barber_name: getBarberName(selectedBarberId),
    });
  }

  res.status(401).json({ error: "Pogrešna lozinka" });
});

app.post("/appointments", bookingLimiter, async (req, res) => {
  const { date, time, client_name, client_phone, booking_pin, barber_id = 1 } = req.body;
  const selectedBarberId = Number(barber_id) || 1;

  if (!date || !time || !client_name || !client_phone) {
    return res.status(400).json({ error: "Nedostaju podaci za zakazivanje." });
  }

  if (!booking_pin || booking_pin !== BOOKING_PIN) {
    return res.status(403).json({ error: "Neispravan PIN kod." });
  }

  if (!isValidPhone(client_phone)) {
    return res.status(400).json({ error: "Telefon mora imati 9 cifara i početi sa 06." });
  }

  if (!isValidTime(time)) {
    return res.status(400).json({ error: "Neispravno vrijeme termina." });
  }

  if (date < todayISO() || isPastSlot(date, time)) {
    return res.status(400).json({ error: "Nije moguće zakazati termin koji je prošao." });
  }

  try {
    const dayOffResult = await pool.query(
      `
      SELECT id
      FROM barber_days_off
      WHERE barber_id = $1
        AND date = $2
      LIMIT 1
      `,
      [selectedBarberId, date]
    );

    if (dayOffResult.rows.length > 0) {
      return res.status(400).json({ error: "Frizer ne radi ovog dana. Izaberite drugi datum." });
    }

    const takenSlotResult = await pool.query(
      `
      SELECT * FROM appointments
      WHERE date = $1
        AND time = $2
        AND barber_id = $3
        AND status IN ('pending', 'confirmed', 'blocked')
      LIMIT 1
      `,
      [date, time, selectedBarberId]
    );

    if (takenSlotResult.rows.length > 0) {
      return res.status(409).json({ error: "Ovaj termin više nije dostupan." });
    }

    const countResult = await pool.query(
      `
      SELECT COUNT(*)::int as count
      FROM appointments
      WHERE client_phone = $1
      AND date = $2
      AND status IN ('pending', 'confirmed')
      `,
      [client_phone, date]
    );

    if (countResult.rows[0].count >= 4) {
      return res.status(409).json({
        error: "Možete rezervisati najviše četiri termina dnevno.",
      });
    }

    const insertResult = await pool.query(
      `
      INSERT INTO appointments 
      (date, time, client_name, client_phone, status, booked_by, barber_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [date, time, client_name.trim(), client_phone.trim(), "pending", "user", selectedBarberId]
    );

    res.json({ id: insertResult.rows[0].id });

    const barberName = getBarberName(selectedBarberId);

    const telegramMessage =
      `✂️ Novi zahtjev za termin\n\n` +
      `Frizer: ${barberName}\n` +
      `Ime: ${client_name.trim()}\n` +
      `Telefon: ${client_phone.trim()}\n` +
      `Datum: ${date}\n` +
      `Vrijeme: ${time}\n\n` +
      `Status: čeka potvrdu admina`;

    sendTelegramNotification(telegramMessage);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "Ovaj termin je upravo zauzet. Izaberite drugi termin.",
      });
    }

    console.error("Greška pri zakazivanju:", err);
    return res.status(500).json({ error: "Greška pri čuvanju termina." });
  }
});


app.get("/barber-schedules", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM barber_schedules
      ORDER BY barber_id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Greška pri čitanju radnog vremena:", err);
    res.status(500).json({ error: "Greška pri čitanju radnog vremena." });
  }
});

app.get("/appointments", async (req, res) => {
  const { date, barber_id } = req.query;

  const params = [date];
  let sql = `
    SELECT appointments.*, barbers.name AS barber_name
    FROM appointments
    LEFT JOIN barbers ON appointments.barber_id = barbers.id
    WHERE date = $1
  `;

  if (barber_id) {
    sql += " AND appointments.barber_id = $2";
    params.push(Number(barber_id));
  }

  try {
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Greška pri čitanju termina:", err);
    res.status(500).json({ error: "Greška pri čitanju baze" });
  }
});

app.post("/appointments/:id/approve", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  try {
    const result = await pool.query(
      "UPDATE appointments SET status = 'confirmed' WHERE id = $1 AND barber_id = $2",
      [req.params.id, selectedBarberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Termin nije pronađen za ovog frizera" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri potvrdi termina:", err);
    res.status(500).json({ error: "Greška pri potvrdi termina" });
  }
});

app.post("/appointments/:id/reject", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  try {
    const result = await pool.query(
      "UPDATE appointments SET status = 'rejected' WHERE id = $1 AND barber_id = $2",
      [req.params.id, selectedBarberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Termin nije pronađen za ovog frizera" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri odbijanju termina:", err);
    res.status(500).json({ error: "Greška pri odbijanju termina" });
  }
});

app.delete("/appointments/:id", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  try {
    const result = await pool.query(
      "UPDATE appointments SET status = 'cancelled_by_admin' WHERE id = $1 AND barber_id = $2",
      [req.params.id, selectedBarberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Termin nije pronađen za ovog frizera" });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri otkazivanju termina:", err);
    res.status(500).json({ error: "Greška pri otkazivanju termina" });
  }
});


app.put("/admin/barber-schedule", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  const {
    working_start,
    working_end,
    break_start,
    break_end,
    saturday_end,
    sunday_closed,
    temporary_enabled,
    temporary_start_date,
    temporary_end_date,
    temporary_working_start,
    temporary_working_end,
    temporary_break_start,
    temporary_break_end,
  } = req.body;

  if (!isValidTime(working_start) || !isValidTime(working_end)) {
    return res.status(400).json({ error: "Početak i kraj radnog vremena moraju biti ispravni termini." });
  }

  if (break_start && !isValidTime(break_start)) {
    return res.status(400).json({ error: "Početak pauze nije ispravan." });
  }

  if (break_end && !isValidTime(break_end)) {
    return res.status(400).json({ error: "Kraj pauze nije ispravan." });
  }

  if (saturday_end && !isValidTime(saturday_end)) {
    return res.status(400).json({ error: "Subotnje radno vrijeme nije ispravno." });
  }

  if (temporary_enabled) {
    if (!temporary_start_date || !temporary_end_date || !temporary_working_start || !temporary_working_end) {
      return res.status(400).json({ error: "Za privremeno radno vrijeme unesite period i početak/kraj rada." });
    }

    if (!isValidTime(temporary_working_start) || !isValidTime(temporary_working_end)) {
      return res.status(400).json({ error: "Privremeni početak i kraj rada nijesu ispravni." });
    }

    if (temporary_break_start && !isValidTime(temporary_break_start)) {
      return res.status(400).json({ error: "Privremeni početak pauze nije ispravan." });
    }

    if (temporary_break_end && !isValidTime(temporary_break_end)) {
      return res.status(400).json({ error: "Privremeni kraj pauze nije ispravan." });
    }
  }

  try {
    const result = await pool.query(
      `
      UPDATE barber_schedules
      SET
        working_start = $1,
        working_end = $2,
        break_start = $3,
        break_end = $4,
        saturday_end = $5,
        sunday_closed = $6,
        temporary_enabled = $7,
        temporary_start_date = $8,
        temporary_end_date = $9,
        temporary_working_start = $10,
        temporary_working_end = $11,
        temporary_break_start = $12,
        temporary_break_end = $13
      WHERE barber_id = $14
      RETURNING *
      `,
      [
        working_start,
        working_end,
        break_start || null,
        break_end || null,
        saturday_end || null,
        Boolean(sunday_closed),
        Boolean(temporary_enabled),
        temporary_start_date || null,
        temporary_end_date || null,
        temporary_working_start || null,
        temporary_working_end || null,
        temporary_break_start || null,
        temporary_break_end || null,
        selectedBarberId,
      ]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Radno vrijeme nije pronađeno za ovog frizera." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Greška pri izmjeni radnog vremena:", err);
    res.status(500).json({ error: "Greška pri izmjeni radnog vremena." });
  }
});



app.get("/barber-days-off", async (req, res) => {
  const selectedBarberId = Number(req.query.barber_id || 1) || 1;

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM barber_days_off
      WHERE barber_id = $1
        AND date >= TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')
      ORDER BY date ASC
      `,
      [selectedBarberId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Greška pri javnom čitanju neradnih dana:", err);
    res.status(500).json({ error: "Greška pri čitanju neradnih dana." });
  }
});

app.get("/admin/barber-days-off", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  try {
    const result = await pool.query(
      `
      SELECT *
      FROM barber_days_off
      WHERE barber_id = $1
      ORDER BY date ASC
      `,
      [selectedBarberId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Greška pri čitanju neradnih dana:", err);
    res.status(500).json({ error: "Greška pri čitanju neradnih dana." });
  }
});

app.post("/admin/barber-days-off", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);
  const { date, reason = "" } = req.body;

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
    return res.status(400).json({ error: "Datum mora biti u formatu YYYY-MM-DD." });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO barber_days_off (barber_id, date, reason)
      VALUES ($1, $2, $3)
      ON CONFLICT (barber_id, date)
      DO UPDATE SET reason = EXCLUDED.reason
      RETURNING *
      `,
      [selectedBarberId, date, String(reason || "").trim()]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Greška pri dodavanju neradnog dana:", err);
    res.status(500).json({ error: "Greška pri dodavanju neradnog dana." });
  }
});

app.delete("/admin/barber-days-off/:id", requireAdmin, async (req, res) => {
  const selectedBarberId = getAdminBarberId(req);

  try {
    const result = await pool.query(
      `
      DELETE FROM barber_days_off
      WHERE id = $1 AND barber_id = $2
      RETURNING *
      `,
      [req.params.id, selectedBarberId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Neradni dan nije pronađen za ovog frizera." });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri brisanju neradnog dana:", err);
    res.status(500).json({ error: "Greška pri brisanju neradnog dana." });
  }
});

app.get("/admin/appointments", requireAdmin, async (req, res) => {
  const { filter = "all", search = "" } = req.query;
  const selectedBarberId = getAdminBarberId(req);

  const where = ["appointments.barber_id = $1"];
  const params = [selectedBarberId];

  if (filter === "all") {
    where.push("status != 'expired'");
  }

  if (filter === "today") {
    where.push("date = TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD')");
  }

  if (filter === "tomorrow") {
    where.push("date = TO_CHAR(CURRENT_DATE + INTERVAL '1 day', 'YYYY-MM-DD')");
  }

  if (filter === "week") {
    where.push("date BETWEEN TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD') AND TO_CHAR(CURRENT_DATE + INTERVAL '7 day', 'YYYY-MM-DD')");
  }

  if (["pending", "confirmed", "blocked", "rejected", "open"].includes(filter)) {
    params.push(filter);
    where.push(`status = $${params.length}`);
  }

  if (search.trim()) {
    const q = `%${search.trim()}%`;
    params.push(q, q);
    where.push(`(client_name ILIKE $${params.length - 1} OR client_phone ILIKE $${params.length})`);
  }

  const sql = `
    SELECT appointments.*, barbers.name AS barber_name
    FROM appointments
    LEFT JOIN barbers ON appointments.barber_id = barbers.id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY appointments.date ASC, appointments.time ASC
  `;

  try {
    const result = await pool.query(sql, params);
    res.json(result.rows);
  } catch (err) {
    console.error("Admin appointments error:", err);
    res.status(500).json({ error: "Greška pri čitanju termina" });
  }
});

app.post("/admin/block-slot", requireAdmin, async (req, res) => {
  const { date, time } = req.body;
  const selectedBarberId = getAdminBarberId(req);

  if (!date || !time) {
    return res.status(400).json({ error: "Datum i vrijeme su obavezni." });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO appointments 
      (date, time, client_name, client_phone, status, booked_by, barber_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [date, time, "ADMIN", "", "blocked", "admin", selectedBarberId]
    );

    res.json({ id: result.rows[0].id });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Termin je već zauzet." });
    }

    console.error("Greška pri blokiranju termina:", err);
    res.status(500).json({ error: "Greška pri blokiranju termina" });
  }
});

app.post("/admin/open-slot", requireAdmin, async (req, res) => {
  const { date, time } = req.body;
  const selectedBarberId = getAdminBarberId(req);

  if (!date || !time) {
    return res.status(400).json({ error: "Datum i vrijeme su obavezni." });
  }

  try {
    const result = await pool.query(
      `
      INSERT INTO appointments 
      (date, time, client_name, client_phone, status, booked_by, barber_id) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
      `,
      [date, time, "ADMIN", "", "open", "admin", selectedBarberId]
    );

    res.json({ id: result.rows[0].id });
  } catch (err) {
    console.error("Greška pri otvaranju termina:", err);
    res.status(500).json({ error: "Greška pri otvaranju termina" });
  }
});

app.post("/admin/manual-appointment", requireAdmin, async (req, res) => {
  const { date, time, client_name, client_phone = "" } = req.body;
  const selectedBarberId = getAdminBarberId(req);

  if (!date || !time || !client_name) {
    return res.status(400).json({ error: "Datum, vrijeme i ime su obavezni." });
  }

  if (!isValidTime(time)) {
    return res.status(400).json({ error: "Neispravno vrijeme termina." });
  }

  if (date < todayISO() || isPastSlot(date, time)) {
    return res.status(400).json({ error: "Nije moguće ručno zakazati termin koji je prošao." });
  }

  if (client_phone && !isValidPhone(client_phone)) {
    return res.status(400).json({ error: "Telefon mora imati 9 cifara i početi sa 06." });
  }

  try {
    const takenSlotResult = await pool.query(
      `
      SELECT * FROM appointments
      WHERE date = $1
      AND time = $2
      AND barber_id = $3
      AND status IN ('pending', 'confirmed', 'blocked')
      LIMIT 1
      `,
      [date, time, selectedBarberId]
    );

    if (takenSlotResult.rows.length > 0) {
      return res.status(409).json({ error: "Termin je već zauzet." });
    }

    const insertResult = await pool.query(
      `
      INSERT INTO appointments 
      (date, time, client_name, client_phone, status, booked_by, barber_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, date, time, client_name, client_phone, status, booked_by, barber_id
      `,
      [date, time, client_name.trim(), client_phone.trim(), "confirmed", "admin", selectedBarberId]
    );

    const appointment = insertResult.rows[0];
    const barberName = getBarberName(selectedBarberId);

    res.json({
      ...appointment,
      barber_name: barberName,
    });

    const telegramMessage =
      `✂️ Ručno dodat termin\n\n` +
      `Frizer: ${barberName}\n` +
      `Ime: ${client_name.trim()}\n` +
      `Telefon: ${client_phone.trim() || "-"}\n` +
      `Datum: ${date}\n` +
      `Vrijeme: ${time}\n\n` +
      `Status: potvrđen`;

    sendTelegramNotification(telegramMessage);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Termin je već zauzet." });
    }

    console.error("Greška pri ručnom zakazivanju:", err);
    res.status(500).json({ error: "Greška pri ručnom zakazivanju." });
  }
});

app.delete("/appointments/:id/user-cancel", async (req, res) => {
  const { client_phone } = req.body;

  try {
    const appointmentResult = await pool.query(
      "SELECT * FROM appointments WHERE id = $1",
      [req.params.id]
    );

    const appointment = appointmentResult.rows[0];

    if (!appointment) {
      return res.status(404).json({ error: "Termin nije pronađen" });
    }

    if (appointment.client_phone !== client_phone) {
      return res.status(403).json({ error: "Nemate dozvolu za otkazivanje ovog termina" });
    }

    if (!["confirmed", "pending"].includes(appointment.status)) {
      return res.status(400).json({
        error: "Može se otkazati samo potvrđen termin ili zahtjev na čekanju",
      });
    }

    await pool.query("DELETE FROM appointments WHERE id = $1", [req.params.id]);

    res.json({ success: true });
  } catch (err) {
    console.error("Greška pri otkazivanju korisničkog termina:", err);
    res.status(500).json({ error: "Greška pri otkazivanju termina" });
  }
});

app.get("/appointments/my-booking", async (req, res) => {
  const { phone } = req.query;

  

  if (!/^06[0-9]{7}$/.test(String(phone || "").trim())) {
    return res.status(400).json({ error: "Neispravan telefon" });
  }

  try {
    const result = await pool.query(
      `
      SELECT appointments.*, barbers.name AS barber_name
      FROM appointments
      LEFT JOIN barbers ON appointments.barber_id = barbers.id
      WHERE client_phone = $1
      AND status = 'confirmed'
      AND (date || 'T' || time)::timestamp > NOW()
      ORDER BY date ASC, time ASC
      `,
      [phone]
    );



    res.json(result.rows);
  } catch (err) {
    console.error("Greška pri čitanju korisničkih termina:", err);
    res.status(500).json({ error: "Greška pri čitanju termina" });
  }
});

cron.schedule(
  "0 20 * * *",
  () => {
    console.log("Šaljem dnevni email izvještaj...");

    generateNext7DaysReport((err, report) => {
      if (err) {
        console.error("Greška pri generisanju izvještaja:", err);
        return;
      }

      transporter.sendMail(
        {
          from: EMAIL_USER,
          to: EMAIL_TO,
          subject: "Termini za narednih 7 dana",
          text: report,
        },
        (error, info) => {
          if (error) {
            console.error("Greška pri slanju emaila:", error);
          } else {
            console.log("Email poslat:", info.response);
          }
        }
      );
    });
  },
  {
    timezone: "Europe/Podgorica",
  }
);


app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      ok: true,
      uptime: process.uptime(),
      time: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
});

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend radi na portu ${PORT}`);
});