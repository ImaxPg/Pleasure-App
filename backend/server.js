const jwt = require("jsonwebtoken");
const BOOKING_PIN = process.env.BOOKING_PIN;
const rateLimit = require("express-rate-limit");
const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
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
  "https://perofrizer.me",
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

const db = new sqlite3.Database("./database.db");

db.run(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT,
    time TEXT,
    client_name TEXT,
    client_phone TEXT,
    status TEXT
  )
`);

db.run(
  `ALTER TABLE appointments ADD COLUMN booked_by TEXT DEFAULT 'user'`,
  (err) => {
    if (err && !String(err.message).includes("duplicate column name")) {
      console.error("Greška pri dodavanju booked_by kolone:", err.message);
    }
  }
);

db.run(`
  CREATE UNIQUE INDEX IF NOT EXISTS unique_active_slot
  ON appointments(date, time)
  WHERE status IN ('pending', 'confirmed', 'blocked')
`);


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
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: "Token nije validan ili je istekao" });
  }
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

function isPastSlot(date, time) {
  return new Date(`${date}T${time}:00`) <= new Date();
}

function cleanupExpiredPending() {
  db.run(
    `
    UPDATE appointments
    SET status = 'expired'
    WHERE status = 'pending'
    AND datetime(date || 'T' || time) <= datetime('now')
    `,
    [],
    (err) => {
      if (err) console.error("Greška pri čišćenju starih pending zahtjeva:", err);
    }
  );
}

function generateNext7DaysReport(callback) {
  const today = new Date();
  const end = new Date();
  end.setDate(today.getDate() + 7);

  db.all(
    `
    SELECT * FROM appointments
    WHERE status = 'confirmed'
    AND datetime(date || 'T' || time) >= datetime('now')
    ORDER BY date ASC, time ASC
    `,
    [],
    (err, rows) => {
      if (err) return callback(err);

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

        const adminLabel = r.booked_by === "admin" ? " (Zakazao Admin)" : "";
        text += `${r.time} - ${r.client_name} - ${r.client_phone || "-"}${adminLabel}\n`;
      });

      callback(null, text);
    }
  );
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
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "14h" });
    return res.json({ token });
  }

  res.status(401).json({ error: "Pogrešna lozinka" });
});

app.post("/appointments", bookingLimiter, (req, res) => {
  const { date, time, client_name, client_phone, booking_pin } = req.body;

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

  db.get(
    `
    SELECT * FROM appointments
    WHERE date = ?
    AND time = ?
    AND status IN ('pending', 'confirmed', 'blocked')
    `,
    [date, time],
    (err, takenSlot) => {
      if (err) return res.status(500).json({ error: "Greška pri provjeri termina." });

      if (takenSlot) {
        return res.status(409).json({ error: "Ovaj termin više nije dostupan." });
      }

      db.get(
        `
        SELECT * FROM appointments
        WHERE client_phone = ?
        AND date = ?
        AND status IN ('pending', 'confirmed')
        `,
        [client_phone, date],
        (err, existing) => {
          if (err) return res.status(500).json({ error: "Greška pri provjeri korisnika." });

          if (existing) {
            return res.status(409).json({
              error: "Već imate rezervisan termin za ovaj dan",
            });
          }

          db.run(
            `
            INSERT INTO appointments 
            (date, time, client_name, client_phone, status, booked_by)
            VALUES (?, ?, ?, ?, ?, ?)
            `,
            [date, time, client_name.trim(), client_phone.trim(), "pending", "user"],
            function (err) {
              if (err) {
                if (err.code === "SQLITE_CONSTRAINT") {
                  return res.status(409).json({
                    error: "Ovaj termin je upravo zauzet. Izaberite drugi termin.",
                  });
                }

                return res.status(500).json({ error: "Greška pri čuvanju termina." });
              }

              res.json({ id: this.lastID });

              const telegramMessage =
                `✂️ Novi zahtjev za termin\n\n` +
                `Ime: ${client_name.trim()}\n` +
                `Telefon: ${client_phone.trim()}\n` +
                `Datum: ${date}\n` +
                `Vrijeme: ${time}\n\n` +
                `Status: čeka potvrdu admina`;

              sendTelegramNotification(telegramMessage);
            }
          );
        }
      );
    }
  );
});

app.get("/appointments", (req, res) => {
  const { date } = req.query;

  db.all("SELECT * FROM appointments WHERE date = ?", [date], (err, rows) => {
    if (err) return res.status(500).json({ error: "Greška pri čitanju baze" });
    res.json(rows);
  });
});

app.post("/appointments/:id/approve", requireAdmin, (req, res) => {
  db.run("UPDATE appointments SET status = 'confirmed' WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: "Greška pri potvrdi termina" });
    res.json({ success: true });
  });
});

app.post("/appointments/:id/reject", requireAdmin, (req, res) => {
  db.run("UPDATE appointments SET status = 'rejected' WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: "Greška pri odbijanju termina" });
    res.json({ success: true });
  });
});

app.delete("/appointments/:id", requireAdmin, (req, res) => {
  db.run("DELETE FROM appointments WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: "Greška pri otkazivanju termina" });
    res.json({ success: true });
  });
});

app.get("/admin/appointments", requireAdmin, (req, res) => {
  const { filter = "all", search = "" } = req.query;

  const where = [];
  const params = [];

  if (filter === "all") {
    where.push("status != 'expired'");
  }

  if (filter === "today") {
    where.push("date = DATE('now')");
  }

  if (filter === "tomorrow") {
    where.push("date = DATE('now', '+1 day')");
  }

  if (filter === "week") {
    where.push("date BETWEEN DATE('now') AND DATE('now', '+7 day')");
  }

  if (["pending", "confirmed", "blocked", "rejected", "open"].includes(filter)) {
    where.push("status = ?");
    params.push(filter);
  }

  if (search.trim()) {
    where.push("(client_name LIKE ? OR client_phone LIKE ?)");
    const q = `%${search.trim()}%`;
    params.push(q, q);
  }

  const sql = `
    SELECT *
    FROM appointments
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY date ASC, time ASC
  `;

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("Admin appointments error:", err);
      return res.status(500).json({ error: "Greška pri čitanju termina" });
    }

    res.json(rows);
  });
});

app.post("/admin/block-slot", requireAdmin, (req, res) => {
  const { date, time } = req.body;

  if (!date || !time) {
    return res.status(400).json({ error: "Datum i vrijeme su obavezni." });
  }

  db.run(
    `
    INSERT INTO appointments 
    (date, time, client_name, client_phone, status, booked_by) 
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [date, time, "ADMIN", "", "blocked", "admin"],
    function (err) {
      if (err) {
        if (err.code === "SQLITE_CONSTRAINT") {
          return res.status(409).json({ error: "Termin je već zauzet." });
        }

        return res.status(500).json({ error: "Greška pri blokiranju termina" });
      }

      res.json({ id: this.lastID });
    }
  );
});

app.post("/admin/open-slot", requireAdmin, (req, res) => {
  const { date, time } = req.body;

  if (!date || !time) {
    return res.status(400).json({ error: "Datum i vrijeme su obavezni." });
  }

  db.run(
    `
    INSERT INTO appointments 
    (date, time, client_name, client_phone, status, booked_by) 
    VALUES (?, ?, ?, ?, ?, ?)
    `,
    [date, time, "ADMIN", "", "open", "admin"],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri otvaranju termina" });
      res.json({ id: this.lastID });
    }
  );
});

app.post("/admin/manual-appointment", requireAdmin, (req, res) => {
  const { date, time, client_name, client_phone = "" } = req.body;

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

  db.get(
    `
    SELECT * FROM appointments
    WHERE date = ?
    AND time = ?
    AND status IN ('pending', 'confirmed', 'blocked')
    `,
    [date, time],
    (err, takenSlot) => {
      if (err) return res.status(500).json({ error: "Greška pri provjeri termina." });

      if (takenSlot) {
        return res.status(409).json({ error: "Termin je već zauzet." });
      }

      db.run(
        `
        INSERT INTO appointments 
        (date, time, client_name, client_phone, status, booked_by)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [date, time, client_name.trim(), client_phone.trim(), "confirmed", "admin"],
        function (err) {
          if (err) {
            if (err.code === "SQLITE_CONSTRAINT") {
              return res.status(409).json({ error: "Termin je već zauzet." });
            }

            return res.status(500).json({ error: "Greška pri ručnom zakazivanju." });
          }

          res.json({ id: this.lastID });
        }
      );
    }
  );
});

app.delete("/appointments/:id/user-cancel", (req, res) => {
  const { client_phone } = req.body;

  db.get("SELECT * FROM appointments WHERE id = ?", [req.params.id], (err, appointment) => {
    if (err) return res.status(500).json({ error: "Greška pri čitanju termina" });

    if (!appointment) {
      return res.status(404).json({ error: "Termin nije pronađen" });
    }

    if (appointment.client_phone !== client_phone) {
      return res.status(403).json({ error: "Nemate dozvolu za otkazivanje ovog termina" });
    }

    if (appointment.status !== "confirmed") {
      return res.status(400).json({ error: "Može se otkazati samo potvrđen termin" });
    }

    db.run("DELETE FROM appointments WHERE id = ?", [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: "Greška pri otkazivanju termina" });
      res.json({ success: true });
    });
  });
});

app.get("/appointments/my-booking", (req, res) => {
  const { phone } = req.query;

  if (!/^06[0-9]{7}$/.test(String(phone || "").trim())) {
    return res.status(400).json({ error: "Neispravan telefon" });
  }

  db.all(
    `
    SELECT * FROM appointments
    WHERE client_phone = ?
    AND status = 'confirmed'
    AND datetime(date || 'T' || time) > datetime('now')
    ORDER BY date ASC, time ASC
    `,
    [phone],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Greška pri čitanju termina" });
      res.json(rows);
    }
  );
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

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`Backend radi na portu ${PORT}`);
});