const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const ADMIN_PASSWORD = "admin123";
const ADMIN_TOKEN = "tajni-admin-token";

function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (authHeader === `Bearer ${ADMIN_TOKEN}`) {
    return next();
  }

  return res.status(401).json({ error: "Nije autorizovano" });
}

const app = express();

app.use(cors());
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

app.get("/", (req, res) => {
  res.send("Backend radi ✅");
});

// ADMIN LOGIN
app.post("/admin/login", (req, res) => {
  const { password } = req.body;

  if (password === ADMIN_PASSWORD) {
    return res.json({ token: ADMIN_TOKEN });
  }

  res.status(401).json({ error: "Pogrešna lozinka" });
});

// KORISNIK ŠALJE ZAHTJEV


function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
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

app.post("/appointments", (req, res) => {
  const { date, time, client_name, client_phone } = req.body;

  if (!date || !time || !client_name || !client_phone) {
    return res.status(400).json({ error: "Nedostaju podaci za zakazivanje." });
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
              error: "Već imate zakazan ili poslat zahtjev za ovaj datum.",
            });
          }

          db.run(
            `
            INSERT INTO appointments 
            (date, time, client_name, client_phone, status)
            VALUES (?, ?, ?, ?, ?)
            `,
            [date, time, client_name.trim(), client_phone.trim(), "pending"],
            function (err) {
              if (err) return res.status(500).json({ error: "Greška pri čuvanju termina." });

              res.json({ id: this.lastID });
            }
          );
        }
      );
    }
  );
});

// KORISNIK UČITAVA TERMINE ZA DATUM
app.get("/appointments", (req, res) => {
  const { date } = req.query;

  db.all(
    "SELECT * FROM appointments WHERE date = ?",
    [date],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Greška pri čitanju baze" });

      res.json(rows);
    }
  );
});

// ADMIN POTVRĐUJE
app.post("/appointments/:id/approve", requireAdmin, (req, res) => {
  db.run(
    "UPDATE appointments SET status = 'confirmed' WHERE id = ?",
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri potvrdi termina" });

      res.json({ success: true });
    }
  );
});

// ADMIN ODBIJA
app.post("/appointments/:id/reject", requireAdmin, (req, res) => {
  db.run(
    "UPDATE appointments SET status = 'rejected' WHERE id = ?",
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri odbijanju termina" });

      res.json({ success: true });
    }
  );
});

// ADMIN OTKAZUJE / BRIŠE TERMIN
app.delete("/appointments/:id", requireAdmin, (req, res) => {
  db.run(
    "DELETE FROM appointments WHERE id = ?",
    [req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri otkazivanju termina" });

      res.json({ success: true });
    }
  );
});

// ADMIN - SVI TERMINI
app.get("/admin/appointments", requireAdmin, (req, res) => {
  db.all(
    "SELECT * FROM appointments WHERE status != 'rejected' ORDER BY date ASC, time ASC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Greška pri čitanju termina" });

      res.json(rows);
    }
  );
});

// ADMIN BLOKIRA TERMIN
app.post("/admin/block-slot", requireAdmin, (req, res) => {
  const { date, time } = req.body;

  db.run(
    `INSERT INTO appointments 
    (date, time, client_name, client_phone, status) 
    VALUES (?, ?, ?, ?, ?)`,
    [date, time, "ADMIN", "", "blocked"],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri blokiranju termina" });

      res.json({ id: this.lastID });
    }
  );
});

const PORT = process.env.PORT || 4000;


// KORISNIK OTKAZUJE SVOJ TERMIN
app.delete("/appointments/:id/user-cancel", (req, res) => {
  const { client_phone } = req.body;

  db.get(
    "SELECT * FROM appointments WHERE id = ?",
    [req.params.id],
    (err, appointment) => {
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

      db.run(
        "DELETE FROM appointments WHERE id = ?",
        [req.params.id],
        function (err) {
          if (err) return res.status(500).json({ error: "Greška pri otkazivanju termina" });

          res.json({ success: true });
        }
      );
    }
  );
});


// ADMIN RUČNO OTVARA NERADNI TERMIN
app.post("/admin/open-slot", requireAdmin, (req, res) => {
  const { date, time } = req.body;

  db.run(
    `INSERT INTO appointments 
    (date, time, client_name, client_phone, status) 
    VALUES (?, ?, ?, ?, ?)`,
    [date, time, "ADMIN", "", "open"],
    function (err) {
      if (err) return res.status(500).json({ error: "Greška pri otvaranju termina" });

      res.json({ id: this.lastID });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Backend radi na portu ${PORT}`);
});