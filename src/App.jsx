import React, { useMemo, useState, useEffect, useRef } from "react";
import { Calendar, Mail, ShieldCheck } from "lucide-react";

const START_HOUR = 9;
const END_HOUR = 20;
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function makeSlots() {
  const slots = [];
  for (let hour = START_HOUR; hour < END_HOUR; hour++) {
    slots.push(`${String(hour).padStart(2, "0")}:00`);
    slots.push(`${String(hour).padStart(2, "0")}:30`);
  }
  return slots;
}

const todayISO = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export default function MassageBookingSite() {
  const slots = useMemo(makeSlots, []);
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [selectedSlot, setSelectedSlot] = useState("");

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const [booked, setBooked] = useState({});
  const [pending, setPending] = useState([]);
  const [blocked, setBlocked] = useState({});
  const [userMessage, setUserMessage] = useState("");
  const [userPopup, setUserPopup] = useState(null);
  const [trackedBookingId, setTrackedBookingId] = useState(() => localStorage.getItem("trackedBookingId"));
  const [userConfirmedBooking, setUserConfirmedBooking] = useState(() => {
    const saved = localStorage.getItem("userConfirmedBooking");
    return saved ? JSON.parse(saved) : null;
  });
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [adminLastUpdated, setAdminLastUpdated] = useState("");
  const [userLastUpdated, setUserLastUpdated] = useState("");
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [adminPopups, setAdminPopups] = useState([]);
  const knownPendingIdsRef = useRef(new Set());
  const knownConfirmedIdsRef = useRef(new Set());
  const knownConfirmedAppointmentsRef = useRef(new Map());
  const adminFirstLoadRef = useRef(true);
  const audioContextRef = useRef(null);

  const unlockAdminSound = () => {
    try {      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }
    } catch (error) {      // Browser može blokirati zvuk dok korisnik ne klikne na stranicu.
    }
  };

  const playAdminNotificationSound = () => {
    try {
      unlockAdminSound();

      const audioContext = audioContextRef.current;
      if (!audioContext) return;

      const playTone = (frequency, start, duration) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
        gain.gain.setValueAtTime(0.001, audioContext.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.22, audioContext.currentTime + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + start + duration);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(audioContext.currentTime + start);
        oscillator.stop(audioContext.currentTime + start + duration);
      };

      playTone(880, 0, 0.22);
      playTone(1175, 0.24, 0.24);
    } catch (error) {
      // Zvuk nije presudan za rad aplikacije.
    }
  };
  const isAdminPage = window.location.pathname.startsWith("/admin");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isHoverBooking, setIsHoverBooking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const pulseStyle = {
    animation: "pulseStatus 1.6s infinite",
  };
  const [now, setNow] = useState(new Date());
  const [adminFilterDate, setAdminFilterDate] = useState(todayISO());
  const [archiveFilterDate, setArchiveFilterDate] = useState(todayISO());
  const [isAdminAuth, setIsAdminAuth] = useState(() => Boolean(sessionStorage.getItem("adminToken")));

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isAdminPage && selectedDate < todayISO()) {
      setSelectedDate(todayISO());
      setSelectedSlot("");
      setIsSubmitting(false);
    }
  }, [selectedDate, isAdminPage]);

  const handleAdminLogin = async () => {
    unlockAdminSound();

    try {
      const response = await fetch(`${API}/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: adminPasswordInput }),
      });

      if (!response.ok) {
        throw new Error("Pogrešna lozinka.");
      }

      const data = await response.json();

      sessionStorage.setItem("adminToken", data.token);
      setIsAdminAuth(true);
      setAdminPasswordInput("");
      setUserMessage("");
    } catch (error) {
      setUserMessage("Pogrešna lozinka.");
    }
  };

  const getAdminHeaders = () => ({
    Authorization: `Bearer ${sessionStorage.getItem("adminToken")}`,
  });

  const getAdminJsonHeaders = () => ({
    "Content-Type": "application/json",
    Authorization: `Bearer ${sessionStorage.getItem("adminToken")}`,
  });

  const handleAdminLogout = () => {
    setIsAdminAuth(false);
    sessionStorage.removeItem("adminToken");
  };

  // UCITAVANJE TERMINA IZ BACKENDA (auto refresh svakih 3s)
  useEffect(() => {
    const fetchData = () => {
      fetch(`${API}/appointments?date=${selectedDate}`)
        .then((res) => {
          if (!res.ok) throw new Error("Backend nije dostupan");
          setIsBackendOnline(true);
          return res.json();
        })
        .then((data) => {
          const bookedMap = {};
          const pendingList = [];
          const blockedMap = {};

          data.forEach((item) => {
            if (item.status === "confirmed") {
              bookedMap[`${item.date}_${item.time}`] = {
                id: item.id,
                date: item.date,
                slot: item.time,
                clientName: item.client_name,
                clientPhone: item.client_phone,
              };
            }

            if (trackedBookingId && String(item.id) === String(trackedBookingId)) {
              if (item.status === "confirmed") {
                setUserPopup({
                  title: "Termin je potvrđen",
                  message: `Vaš termin ${item.date} u ${item.time} je zakazan.`,
                });
                const confirmedBooking = {
                  id: item.id,
                  date: item.date,
                  time: item.time,
                  client_name: item.client_name,
                  client_phone: item.client_phone,
                };
                localStorage.setItem("userConfirmedBooking", JSON.stringify(confirmedBooking));
                setUserConfirmedBooking(confirmedBooking);
                setUserMessage("");
                localStorage.removeItem("trackedBookingId");
                setTrackedBookingId(null);
              }

              if (item.status === "rejected") {
                setUserPopup({
                  title: "Termin je odbijen",
                  message: `Vaš zahtjev za ${item.date} u ${item.time} je odbijen. Molimo izaberite drugi termin.`,
                });
                setUserMessage("");
                localStorage.removeItem("trackedBookingId");
                setTrackedBookingId(null);
              }
            }

            if (item.status === "pending") {
              pendingList.push({
                id: item.id,
                date: item.date,
                slot: item.time,
                clientName: item.client_name,
                clientPhone: item.client_phone,
              });
            }

            if (item.status === "blocked") {
              blockedMap[`${item.date}_${item.time}`] = {
                id: item.id,
                date: item.date,
                slot: item.time,
              };
            }
          });

          setBooked(bookedMap);
          setPending(pendingList);
          setBlocked(blockedMap);
          setUserLastUpdated(new Date().toLocaleTimeString("sr-ME"));
        })
        .catch(() => {
          setIsBackendOnline(false);
        });
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);

    return () => clearInterval(interval);
  }, [selectedDate, trackedBookingId]);

  useEffect(() => {
    if (!isAdminPage || !isAdminAuth) return;

    const fetchAdminAppointments = () => {
      fetch(`${API}/admin/appointments?t=${Date.now()}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
      })
        .then((res) => {
          if (!res.ok) throw new Error("Admin nije autorizovan.");
          return res.json();
        })
        .then((data) => {
          const pendingNow = data.filter((item) => item.status === "pending");
          const confirmedNow = data.filter((item) => item.status === "confirmed");
          const newPendingItems = pendingNow.filter((item) => !knownPendingIdsRef.current.has(item.id));

          if (!adminFirstLoadRef.current && newPendingItems.length > 0) {
            setAdminPopups((current) => [...current, ...newPendingItems]);
            playAdminNotificationSound();
          }

          // DETEKCIJA OTKAZANIH TERMINA
          const previousConfirmed = knownConfirmedIdsRef.current;
          const currentConfirmedIds = new Set(confirmedNow.map((item) => item.id));

          const cancelledIds = [...previousConfirmed].filter((id) => !currentConfirmedIds.has(id));

          if (!adminFirstLoadRef.current && cancelledIds.length > 0) {
            const cancelledPopups = cancelledIds.map((id) => {
              const oldAppointment = knownConfirmedAppointmentsRef.current.get(id);

              return {
                id,
                client_name: oldAppointment?.client_name || "Korisnik",
                client_phone: oldAppointment?.client_phone || "",
                date: oldAppointment?.date || "",
                time: oldAppointment?.time || "",
                cancelled: true,
              };
            });

            setAdminPopups((current) => [...current, ...cancelledPopups]);
            playAdminNotificationSound();
          }

          knownPendingIdsRef.current = new Set(pendingNow.map((item) => item.id));
          knownConfirmedIdsRef.current = new Set(confirmedNow.map((item) => item.id));
          knownConfirmedAppointmentsRef.current = new Map(
            confirmedNow.map((item) => [item.id, item])
          );
          adminFirstLoadRef.current = false;

          setAdminAppointments(sortAdminAppointments(data));
          setAdminLastUpdated(new Date().toLocaleTimeString("sr-ME"));
          setIsBackendOnline(true);
        })
        .catch(() => {
          setIsBackendOnline(false);
          setIsAdminAuth(false);
          sessionStorage.removeItem("adminToken");
        });
    };

    fetchAdminAppointments();
    const interval = setInterval(fetchAdminAppointments, 3000);

    return () => clearInterval(interval);
  }, [isAdminPage, isAdminAuth]);

  const normalizeStatus = (status) => (status || "").toLowerCase().trim();

  const sortAdminAppointments = (items) => {
    return [...items].sort((a, b) => {
      const aStatus = normalizeStatus(a.status);
      const bStatus = normalizeStatus(b.status);

      // 1. Svi pending zahtjevi uvijek idu na vrh
      if (aStatus === "pending" && bStatus !== "pending") return -1;
      if (aStatus !== "pending" && bStatus === "pending") return 1;

      // 2. Unutar iste grupe sortiramo po datumu, pa po vremenu
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
  };

  const getDateColorMap = (items) => {
    const colors = ["#dbeafe", "#fef3c7", "#dcfce7", "#fce7f3", "#ede9fe", "#cffafe"];
    const map = {};
    let index = 0;

    sortAdminAppointments(items).forEach((item) => {
      if (!map[item.date]) {
        map[item.date] = colors[index % colors.length];
        index += 1;
      }
    });

    return map;
  };

  const displayedAdminAppointments = sortAdminAppointments(adminAppointments);
  const adminDateColorMap = getDateColorMap(displayedAdminAppointments);
  const pendingAdminAppointments = displayedAdminAppointments.filter(
    (appointment) => normalizeStatus(appointment.status) === "pending"
  );
  const selectedDateAppointments = displayedAdminAppointments.filter((appointment) => {
    const status = normalizeStatus(appointment.status);
    return appointment.date === adminFilterDate && status !== "pending" && status !== "blocked";
  });

  const isValidPhone = (phone) => {
    return /^06[0-9]{7}$/.test(phone.trim());
  };

  const formatPhone = (digits) => {
    const d = (digits || "").replace(/\D/g, "").slice(0, 9);
    const p1 = d.slice(0, 3);
    const p2 = d.slice(3, 6);
    const p3 = d.slice(6, 9);
    return [p1, p2, p3].filter(Boolean).join(" ");
  };

  const formatPublicName = (fullName) => {
    const parts = (fullName || "").trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "";
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[1][0]}.`;
  };

  const isPastSlot = (date, slot) => {
    const slotDate = new Date(`${date}T${slot}:00`);
    return slotDate <= now;
  };

  const getDayFromISO = (date) => {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(year, month - 1, day).getDay(); // 0 = nedjelja, 6 = subota
  };

  const isNonWorkingSlot = (date, slot) => {
    const day = getDayFromISO(date);
    const hour = Number(slot.split(":")[0]);

    if (day === 0) return true; // nedjelja - neradno cijeli dan
    if (day === 6 && hour >= 15) return true; // subota od 15:00 nadalje

    return false;
  };

  const key = (date, slot) => `${date}_${slot}`;

  const isBooked = (date, slot) => Boolean(booked[key(date, slot)]);
  const isBlocked = (date, slot) => Boolean(blocked[key(date, slot)]);
  const isPending = (date, slot) => pending.some((p) => p.date === date && p.slot === slot);
  const isUnavailable = (date, slot) =>
    isBooked(date, slot) || isBlocked(date, slot) || isPending(date, slot) || isNonWorkingSlot(date, slot);

  const visibleUserSlots = slots.filter(
    (slot) =>
      !isPastSlot(selectedDate, slot) &&
      !isNonWorkingSlot(selectedDate, slot) &&
      !isBlocked(selectedDate, slot)
  );

  const cancelUserBooking = async () => {
    if (!userConfirmedBooking) return;

    const confirmed = window.confirm(
      `Da li ste sigurni da želite da otkažete termin ${userConfirmedBooking.date} u ${userConfirmedBooking.time}?`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API}/appointments/${userConfirmedBooking.id}/user-cancel`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_phone: userConfirmedBooking.client_phone }),
      });

      if (!response.ok) {
        throw new Error("Otkazivanje nije uspjelo.");
      }

      localStorage.removeItem("userConfirmedBooking");
      setUserConfirmedBooking(null);
      setUserPopup({
        title: "Termin je otkazan",
        message: "Vaš termin je uspješno otkazan. Termin je ponovo slobodan.",
      });
    } catch (error) {
      setUserMessage("Greška: termin nije otkazan. Pokušajte ponovo ili kontaktirajte salon.");
    }
  };

  const requestBooking = async () => {
    if (isSubmitting) return;
    if (!clientName.trim()) {
      setUserMessage("Molimo unesite ime i prezime.");
      return;
    }

    if (!isValidPhone(clientPhone)) {
      setUserMessage("Molimo unesite telefon od 9 cifara koji počinje sa 06 (npr. 067123456), bez razmaka i crtica.");
      return;
    }

    if (!selectedDate || !selectedSlot) {
      setUserMessage("Izaberite datum i termin prije zakazivanja.");
      return;
    }

    if (isNonWorkingSlot(selectedDate, selectedSlot)) {
      setUserMessage("Izabrani termin je neradni i nije moguće zakazivanje.");
      setSelectedSlot("");
      return;
    }

    if (isUnavailable(selectedDate, selectedSlot)) {
      setUserMessage("Ovaj termin više nije dostupan. Izaberite drugi termin.");
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await fetch(`${API}/appointments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          date: selectedDate,
          time: selectedSlot,
          client_name: clientName,
          client_phone: clientPhone.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || "Backend nije prihvatio zahtjev.");
      }

      const data = await response.json();

      const request = {
        id: data.id || crypto.randomUUID(),
        date: selectedDate,
        slot: selectedSlot,
        clientName,
        clientPhone: clientPhone.trim(),
        createdAt: new Date().toLocaleString("sr-ME"),
      };

      setPending((current) => [...current, request]);
      localStorage.setItem("trackedBookingId", String(request.id));
      setTrackedBookingId(String(request.id));
      setUserMessage("Zahtjev je poslat administratoru. Ostanite na stranici i dobićete poruku kada termin bude potvrđen ili odbijen.");
      setSelectedSlot("");
      setIsSubmitting(false);
    } catch (error) {
      setIsSubmitting(false);
      setUserMessage(error.message || "Greška: zahtjev nije poslat backendu.");
    }
  };

  const approveBooking = async (request) => {
    try {
      const response = await fetch(`${API}/appointments/${request.id}/approve`, {
        method: "POST",
        headers: getAdminHeaders(),
      });

      if (!response.ok) {
        throw new Error("Greška pri potvrdi termina.");
      }

      setBooked((current) => ({
        ...current,
        [key(request.date, request.slot)]: request,
      }));

      setPending((current) => current.filter((p) => p.id !== request.id));

      setAdminAppointments((current) =>
        current.map((item) =>
          item.id === request.id ? { ...item, status: "confirmed" } : item
        )
      );

      setUserMessage(`Termin ${request.date} u ${request.slot} je potvrđen i zakazan.`);
    } catch (error) {
      setUserMessage("Greška: termin nije potvrđen u backendu.");
    }
  };

  const rejectBooking = async (request) => {
  try {
    const response = await fetch(`${API}/appointments/${request.id}/reject`, {
      method: "POST",
      headers: getAdminHeaders(),
    });

    if (!response.ok) {
      throw new Error("Greška pri odbijanju.");
    }

    setPending((current) => current.filter((p) => p.id !== request.id));

    setUserMessage(`Zahtjev za ${request.date} u ${request.slot} je odbijen.`);
  } catch (error) {
    setUserMessage("Greška: zahtjev nije odbijen u backendu.");
  }
};

  const cancelBooking = async (date, slot) => {
    const slotKey = key(date, slot);
    const booking = booked[slotKey];

    if (!booking?.id) {
      setUserMessage("Greška: ne mogu da pronađem ID termina za otkazivanje.");
      return;
    }

    try {
      const response = await fetch(`${API}/appointments/${booking.id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
      });

      if (!response.ok) {
        throw new Error("Greška pri otkazivanju termina.");
      }

      setBooked((current) => {
        const copy = { ...current };
        delete copy[slotKey];
        return copy;
      });

      setAdminAppointments((current) => current.filter((item) => item.id !== booking.id));
      setUserMessage(`Termin ${date} u ${slot} je otkazan${booking?.clientName ? ` za korisnika ${booking.clientName}` : ""}. Termin je ponovo slobodan.`);
    } catch (error) {
      setUserMessage("Greška: termin nije otkazan u backendu.");
    }
  };

  const cancelAdminAppointment = async (appointment) => {
    if (isPastSlot(appointment.date, appointment.time)) {
      setUserMessage("Termin je već prošao i ne može se otkazati.");
      return;
    }

    try {
      const response = await fetch(`${API}/appointments/${appointment.id}`, {
        method: "DELETE",
        headers: getAdminHeaders(),
      });

      if (!response.ok) {
        throw new Error("Greška pri otkazivanju termina.");
      }

      setAdminAppointments((current) => current.filter((item) => item.id !== appointment.id));
      setUserMessage(`Termin ${appointment.date} u ${appointment.time} je otkazan.`);
    } catch (error) {
      setUserMessage("Greška: termin nije otkazan u backendu.");
    }
  };

  const toggleBlock = async (date, slot) => {
    const slotKey = key(date, slot);
    if (isBooked(date, slot) || isNonWorkingSlot(date, slot)) return;

    if (isBlocked(date, slot)) {
      const blockedSlot = blocked[slotKey];

      if (!blockedSlot?.id) {
        setUserMessage("Greška: ne mogu da pronađem ID blokiranog termina.");
        return;
      }

      try {
        const response = await fetch(`${API}/appointments/${blockedSlot.id}`, {
          method: "DELETE",
          headers: getAdminHeaders(),
        });

        if (!response.ok) throw new Error("Greška pri otključavanju termina.");

        setBlocked((current) => {
          const copy = { ...current };
          delete copy[slotKey];
          return copy;
        });

        setUserMessage(`Termin ${date} u ${slot} je otključan.`);
      } catch (error) {
        setUserMessage("Greška: termin nije otključan u backendu.");
      }

      return;
    }

    try {
      const response = await fetch(`${API}/admin/block-slot`, {
        method: "POST",
        headers: getAdminJsonHeaders(),
        body: JSON.stringify({ date, time: slot }),
      });

      if (!response.ok) throw new Error("Greška pri blokiranju termina.");

      const data = await response.json();

      setBlocked((current) => ({
        ...current,
        [slotKey]: {
          id: data.id,
          date,
          slot,
        },
      }));

      setUserMessage(`Termin ${date} u ${slot} je zaključan.`);
    } catch (error) {
      setUserMessage("Greška: termin nije zaključan u backendu.");
    }
  };

  const blockWholeDay = async () => {
    try {
      const newBlocked = {};

      for (const slot of slots) {
        const slotKey = key(selectedDate, slot);

        if (isBooked(selectedDate, slot) || isBlocked(selectedDate, slot) || isNonWorkingSlot(selectedDate, slot)) {
          continue;
        }

        const response = await fetch(`${API}/admin/block-slot`, {
          method: "POST",
          headers: getAdminJsonHeaders(),
          body: JSON.stringify({ date: selectedDate, time: slot }),
        });

        if (!response.ok) {
          throw new Error("Greška pri blokiranju dana.");
        }

        const data = await response.json();

        newBlocked[slotKey] = {
          id: data.id,
          date: selectedDate,
          slot,
        };
      }

      setBlocked((current) => ({
        ...current,
        ...newBlocked,
      }));

      setUserMessage(`Zaključani su svi slobodni termini za ${selectedDate}.`);
    } catch (error) {
      setUserMessage("Greška: dan nije zaključan u backendu.");
    }
  };

  const unblockWholeDay = async () => {
    try {
      const blockedForDate = Object.values(blocked).filter((item) => item.date === selectedDate);

      for (const item of blockedForDate) {
        await fetch(`${API}/appointments/${item.id}`, {
          method: "DELETE",
          headers: getAdminHeaders(),
        });
      }

      setBlocked((current) => {
        const copy = { ...current };
        slots.forEach((slot) => delete copy[key(selectedDate, slot)]);
        return copy;
      });

      setUserMessage(`Otključani su termini za ${selectedDate}.`);
    } catch (error) {
      setUserMessage("Greška: dan nije otključan u backendu.");
    }
  };

  if (isAdminPage) {
    if (!isAdminAuth) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-sm border border-zinc-200 w-full max-w-md">
            <h1 className="text-2xl font-bold mb-4">Admin login</h1>
            <input
              type="password"
              placeholder="Unesite lozinku"
              value={adminPasswordInput}
              onChange={(e) => setAdminPasswordInput(e.target.value)}
              className="w-full mb-4 rounded-2xl border border-zinc-300 px-4 py-3"
            />
            <button
              onClick={handleAdminLogin}
              className="w-full rounded-2xl bg-zinc-900 text-white py-3 font-bold hover:bg-zinc-700"
            >
              Prijavi se
            </button>
            {userMessage && <p className="mt-3 text-sm text-red-500">{userMessage}</p>}
          </div>
        </div>
      );
    }

    return (
      <div
        onClick={unlockAdminSound}
        style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fdf2f8 0%, #f8fafc 45%, #ecfeff 100%)", color: "#18181b", padding: "16px" }}
      >
        <style>{`
          @keyframes pulseStatus {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.22); opacity: 0.72; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}</style>
        <div className="max-w-5xl mx-auto grid gap-6">
          {adminPopups.length > 0 && (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                zIndex: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
              }}
            >
              <div
                style={{
                  background: "white",
                  borderRadius: 24,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                  padding: 28,
                  width: "100%",
                  maxWidth: 440,
                  textAlign: "center",
                  border: "1px solid #e5e7eb",
                }}
              >
                <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16 }}>
                  {adminPopups[0].cancelled ? "Termin je otkazan" : "Novi zahtjev za termin"}
                </h2>
                {!adminPopups[0].cancelled && (
                <p style={{ fontSize: 18, marginBottom: 8 }}>
                  <strong>{adminPopups[0].client_name}</strong>
                </p>
                )}
                {!adminPopups[0].cancelled && (
                <p style={{ fontSize: 16, marginBottom: 8 }}>
                  Datum: <strong>{adminPopups[0].date}</strong>
                </p>
                )}
                {!adminPopups[0].cancelled && (
                <p style={{ fontSize: 16, marginBottom: 16 }}>
                  Vrijeme: <strong>{adminPopups[0].time}</strong>
                </p>
                )
                }
                {adminPopups[0].cancelled && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 16, marginBottom: 8 }}>
                      <strong>{adminPopups[0].client_name}</strong> je otkazao/la termin.
                    </p>
                    {adminPopups[0].date && (
                      <p style={{ fontSize: 16, marginBottom: 8 }}>
                        Datum: <strong>{adminPopups[0].date}</strong>
                      </p>
                    )}
                    {adminPopups[0].time && (
                      <p style={{ fontSize: 16, marginBottom: 8 }}>
                        Vrijeme: <strong>{adminPopups[0].time}</strong>
                      </p>
                    )}
                    <p style={{ fontSize: 14, color: "#71717a" }}>
                      Termin je ponovo slobodan.
                    </p>
                  </div>
                )}
                {adminPopups[0].client_phone && (
                  <p style={{ fontSize: 14, color: "#71717a", marginBottom: 16 }}>
                    Telefon: {adminPopups[0].client_phone}
                  </p>
                )}
                {adminPopups.length > 1 && (
                  <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
                    Još novih zahtjeva: {adminPopups.length - 1}
                  </p>
                )}
                <button
                  onClick={() => setAdminPopups((current) => current.slice(1))}
                  style={{
                    width: "100%",
                    border: 0,
                    borderRadius: 16,
                    background: "#18181b",
                    color: "white",
                    padding: "14px 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  U redu
                </button>
              </div>
            </div>
          )}
          <header style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #fce7f3", borderRadius: 30, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,0.08)" }}>
            <div className="flex justify-end mb-2">
              <button onClick={handleAdminLogout} className="text-sm underline">Logout</button>
            </div>
            <div className="flex items-center justify-center gap-3 mb-3">
              <span
                title={isBackendOnline ? "Backend je dostupan" : "Backend nije dostupan"}
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: isBackendOnline ? "#22c55e" : "#ef4444",
                  display: "inline-block",
                  boxShadow: isBackendOnline ? "0 0 0 4px rgba(34,197,94,0.18)" : "0 0 0 4px rgba(239,68,68,0.18)",
                  ...(isBackendOnline ? pulseStyle : {}),
                }}
              />
              <h1 className="text-3xl md:text-4xl font-bold" style={{color:"#111827"}}>Admin stranica</h1>
            </div>
            <p className="text-zinc-600">
              Pregled svih zahtjeva i zakazanih termina, poređanih po datumu i vremenu.
            </p>
          </header>

          <section style={{ background: "rgba(239,246,255,0.96)", border: "1px solid #bfdbfe", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{color:"#111827"}}>Blokiranje termina</h2>

            <label style={{ display: "flex", alignItems: "center", gap: 14, border: focusedField === "date" ? "2px solid #be185d" : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16, boxShadow: focusedField === "date" ? "0 0 0 4px rgba(190,24,93,0.12)" : "none", transition: "all 0.2s ease" }}>
              <span style={{ minWidth: 120, fontWeight: 700 }}>Datum</span>
              <input
                type="date"
                min={todayISO()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16 }}
              />
            </label>

            <p className="text-sm text-zinc-600 mb-3">
              Izabrani datum: <strong>{selectedDate}</strong>
            </p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  blockWholeDay();
                  setUserMessage(`Zaključani su svi slobodni termini za ${selectedDate}.`);
                }}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)",
                  color: "white",
                  padding: "12px 14px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 10px 25px rgba(37,99,235,0.22)",
                  letterSpacing: "0.01em",
                }}
              >
                🔒 Zaključaj cijeli dan
              </button>
              <button
                onClick={() => {
                  unblockWholeDay();
                  setUserMessage(`Otključani su termini za ${selectedDate}.`);
                }}
                style={{
                  flex: 1,
                  borderRadius: 16,
                  background: "linear-gradient(135deg, #15803d 0%, #22c55e 100%)",
                  color: "white",
                  padding: "12px 14px",
                  fontWeight: 800,
                  border: "none",
                  cursor: "pointer",
                  boxShadow: "0 10px 25px rgba(34,197,94,0.22)",
                  letterSpacing: "0.01em",
                }}
              >
                🔓 Otključaj dan
              </button>
            </div>

            {userMessage && (
              <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-3 mb-4 text-sm">
                {userMessage}
              </div>
            )}

            <p className="text-sm text-zinc-600 mb-3">
              Pojedinačni termini za izabrani datum:
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {slots.map((slot) => {
                const blockedNow = isBlocked(selectedDate, slot);
                const bookedNow = isBooked(selectedDate, slot);
                const nonWorkingNow = isNonWorkingSlot(selectedDate, slot);

                return (
                  <button
                    key={slot}
                    disabled={bookedNow || nonWorkingNow}
                    onClick={() => toggleBlock(selectedDate, slot)}
                    style={{
                      borderRadius: 14,
                      border: blockedNow ? "1px solid #1e3a8a" : "1px solid #dbeafe",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: 700,
                      background: bookedNow || nonWorkingNow ? "#f4f4f5" : blockedNow ? "#1e3a8a" : "white",
                      color: bookedNow || nonWorkingNow ? "#71717a" : blockedNow ? "white" : "#1e3a8a",
                      cursor: bookedNow || nonWorkingNow ? "not-allowed" : "pointer",
                      opacity: bookedNow || nonWorkingNow ? 0.55 : 1,
                      boxShadow: blockedNow ? "0 8px 18px rgba(30,58,138,0.18)" : "0 6px 14px rgba(15,23,42,0.05)",
                    }}
                  >
                    {slot} {bookedNow ? "Zakazano" : nonWorkingNow ? "Neradno" : blockedNow ? "🔒 Zaključano" : "Slobodno"}
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ background: "rgba(255,247,237,0.96)", border: "1px solid #fed7aa", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-semibold" style={{color:"#111827"}}>Novi zahtjevi</h2>
            </div>

            {pendingAdminAppointments.length === 0 ? (
              <p className="text-zinc-500">Nema novih zahtjeva.</p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {pendingAdminAppointments.map((appointment) => (
                  <div
                    key={appointment.id}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      flexWrap: "nowrap",
                      alignItems: "center",
                      gap: 14,
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: "10px 12px",
                      background: adminDateColorMap[appointment.date] || "#ffffff",
                      borderLeft: "6px solid #f97316",
                      whiteSpace: "nowrap",
                      overflowX: "auto",
                    }}
                  >
                    <div style={{ minWidth: 60, fontWeight: 800, fontSize: 18 }}>{appointment.time}</div>
                    <div style={{ minWidth: 110, fontSize: 14 }}>{appointment.date}</div>
                    <div style={{ minWidth: 180, fontWeight: 700 }}>
                      {appointment.client_name}
                      {appointment.client_phone && (
                        <span style={{ color: "#71717a", fontWeight: 400 }}> · {appointment.client_phone}</span>
                      )}
                    </div>
                    <div style={{ minWidth: 110, fontSize: 14, color: "#71717a" }}>Čeka potvrdu</div>
                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                      <button
                        onClick={async () => {
                          await fetch(`${API}/appointments/${appointment.id}/approve`, {
                            method: "POST",
                            headers: getAdminHeaders(),
                          });
                          setAdminAppointments((current) =>
                            sortAdminAppointments(
                              current.map((item) =>
                                item.id === appointment.id ? { ...item, status: "confirmed" } : item
                              )
                            )
                          );
                        }}
                        style={{ border: 0, borderRadius: 10, background: "#18181b", color: "white", padding: "8px 12px", cursor: "pointer" }}
                      >
                        Potvrdi
                      </button>
                      <button
                        onClick={async () => {
                          const confirmed = window.confirm(
                            `Da li ste sigurni da želite da odbijete zahtjev za ${appointment.date} u ${appointment.time}?`
                          );
                          if (!confirmed) return;

                          await fetch(`${API}/appointments/${appointment.id}/reject`, {
                            method: "POST",
                            headers: getAdminHeaders(),
                          });
                          setAdminAppointments((current) => current.filter((item) => item.id !== appointment.id));
                        }}
                        style={{ border: "1px solid #d4d4d8", borderRadius: 10, background: "white", color: "#18181b", padding: "8px 12px", cursor: "pointer", fontWeight: 700 }}
                      >
                        Odbij
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section style={{ background: "rgba(240,253,244,0.96)", border: "1px solid #bbf7d0", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{color:"#111827"}}>Pregled termina po datumu</h2>

            <label style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16 }}>
              <span style={{ minWidth: 160, fontWeight: 700 }}>Izaberi datum</span>
              <input
                type="date"
                value={adminFilterDate}
                onChange={(e) => setAdminFilterDate(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16 }}
              />
            </label>

            {selectedDateAppointments.length === 0 ? (
              <p className="text-zinc-500">Nema potvrđenih ili odbijenih termina za izabrani datum.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {selectedDateAppointments
                  .filter((appointment) => normalizeStatus(appointment.status) !== "blocked")
                  .map((appointment) => {
                const status = normalizeStatus(appointment.status);
                if (status === "blocked") return null;
                const isConfirmed = status === "confirmed";
                const isRejected = status === "rejected";

                return (
                  <div
                    key={appointment.id}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      border: "1px solid #e5e7eb",
                      borderRadius: 14,
                      padding: "10px 12px",
                      whiteSpace: "nowrap",
                      overflowX: "auto",
                      background: adminDateColorMap[appointment.date] || "#ffffff",
                    }}
                  >
                    <strong style={{ minWidth: 60 }}>{appointment.time}</strong>
                    <span style={{ minWidth: 180 }}>{appointment.client_name}</span>
                    <span style={{ minWidth: 120, color: "#71717a" }}>{appointment.client_phone || "Bez telefona"}</span>
                    <span style={{ color: "#71717a", minWidth: 100 }}>
                      {isConfirmed ? "Potvrđen" : isRejected ? "Odbijen" : appointment.status}
                    </span>
                    {isConfirmed && !isPastSlot(appointment.date, appointment.time) && (
                      <button
                        onClick={() => {
                          const confirmed = window.confirm(
                            `Da li ste sigurni da želite da otkažete termin ${appointment.date} u ${appointment.time}?`
                          );
                          if (!confirmed) return;
                          cancelAdminAppointment(appointment);
                        }}
                        style={{
                          marginLeft: "auto",
                          border: "1px solid #d4d4d8",
                          borderRadius: 10,
                          background: "white",
                          color: "#18181b",
                          padding: "8px 12px",
                          cursor: "pointer",
                          fontWeight: 700,
                          WebkitTextFillColor: "#18181b",
                        }}
                      >
                        Otkaži
                      </button>
                    )}
                  </div>
                );
              })}
              </div>
            )}
          </section>
        {adminLastUpdated && (
          <footer style={{ textAlign: "center", color: "#71717a", fontSize: 12, padding: "8px 0 4px" }}>
            Ažurirano: {adminLastUpdated}
          </footer>
        )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fff1f2 0%, #ffffff 42%, #ecfeff 100%)", color: "#18181b", padding: "16px" }}>
      <style>{`
        @keyframes pulseStatus {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.22); opacity: 0.72; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      {userPopup && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          {(() => {
            const isSuccess = userPopup.title.toLowerCase().includes("potvrđen");
            const isError = userPopup.title.toLowerCase().includes("odbijen");

            const bgColor = isSuccess ? "#ecfdf5" : isError ? "#fef2f2" : "white";
            const borderColor = isSuccess ? "#16a34a" : isError ? "#dc2626" : "#e5e7eb";
            const icon = isSuccess ? "✔️" : isError ? "❌" : "ℹ️";
            const buttonColor = isSuccess ? "#16a34a" : isError ? "#dc2626" : "#18181b";

            return (
              <div
                style={{
                  background: bgColor,
                  borderRadius: 24,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                  padding: 28,
                  width: "100%",
                  maxWidth: 440,
                  textAlign: "center",
                  border: `2px solid ${borderColor}`,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 10 }}>{icon}</div>
                <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 16, color: "#18181b" }}>{userPopup.title}</h2>
                <p style={{ fontSize: 16, marginBottom: 20, color: "#374151" }}>{userPopup.message}</p>
                <button
                  onClick={() => setUserPopup(null)}
                  style={{
                    width: "100%",
                    border: 0,
                    borderRadius: 16,
                    background: buttonColor,
                    color: "white",
                    padding: "14px 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  U redu
                </button>
              </div>
            );
          })()}
        </div>
      )}
      <div className="max-w-6xl mx-auto grid gap-6">
        <header style={{ background: "rgba(255,255,255,0.92)", border: "1px solid #fce7f3", borderRadius: 30, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,0.08)" }}>
          <div className="flex items-center justify-between gap-3">
            <div style={{ width: "100%", textAlign: "center" }}>
              <div>
                <h1 style={{ fontSize: "clamp(30px, 8vw, 44px)", lineHeight: 1.18, fontWeight: 900, letterSpacing: "-0.03em", margin: 0, color: "#111827", WebkitTextFillColor: "#111827" }}>
                  <span style={{ display: "block" }}>Frizerski salon</span>
                  <span style={{ display: "block", marginTop: 8 }}>"Pleasure"</span>
                </h1>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
                  <p style={{ color: "#374151", WebkitTextFillColor: "#374151", margin: 0 }}>Zakazivanje termina</p>
                  <span
                    title={isBackendOnline ? "Backend je dostupan" : "Backend nije dostupan"}
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: isBackendOnline ? "#22c55e" : "#ef4444",
                      display: "inline-block",
                      boxShadow: isBackendOnline ? "0 0 0 4px rgba(34,197,94,0.18)" : "0 0 0 4px rgba(239,68,68,0.18)",
                      ...(isBackendOnline ? pulseStyle : {}),
                    }}
                  />
                </div>
              </div>
            </div>
            
          </div>
          <p
            style={{
              color: "#52525b",
              maxWidth: 720,
              marginTop: 18,
              lineHeight: 1.75,
              textAlign: "justify",
              textWrap: "pretty",
              fontSize: 15,
            }}
          >
            Radno vrijeme salona je od 09:00 do 20:00. Termini su podijeljeni na slotove od 30 minuta.
            Korisnik bira datum i termin, a administrator potvrđuje zakazivanje.
          </p>
        </header>

        {userMessage && (
          <div className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-4 flex gap-3 items-start">
            <Mail className="w-5 h-5 mt-0.5" />
            <p>{userMessage}</p>
          </div>
        )}

        <main className="grid gap-6">
          {userConfirmedBooking && !isPastSlot(userConfirmedBooking.date, userConfirmedBooking.time) && (
            <section style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 30, padding: 20, boxShadow: "0 12px 35px rgba(15,23,42,0.06)" }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: "#166534" }}>
                Vaš zakazani termin
              </h2>
              <p style={{ color: "#166534", marginBottom: 12 }}>
                {userConfirmedBooking.date} u {userConfirmedBooking.time}
              </p>
              <button
                onClick={cancelUserBooking}
                style={{
                  width: "100%",
                  border: "1px solid #dc2626",
                  borderRadius: 14,
                  background: "white",
                  color: "#991b1b",
                  padding: "10px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  WebkitTextFillColor: "#991b1b",
                }}
              >
                Otkaži moj termin
              </button>
            </section>
          )}
          <section style={{ background: "rgba(255,255,255,0.94)", border: "1px solid #f1f5f9", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", WebkitTextFillColor: "#111827" }}>Podaci korisnika</h2>

            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, border: focusedField === "name" ? "2px solid #be185d" : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", boxShadow: focusedField === "name" ? "0 0 0 4px rgba(190,24,93,0.12)" : "none", transition: "all 0.2s ease" }}>
                <span style={{ fontWeight: 700 }}>Ime i prezime</span>
                <input
                  type="text"
                  placeholder="Unesite ime"
                  value={clientName}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField("")}
                  onChange={(e) => setClientName(e.target.value)}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, textAlign: "center", background: "transparent" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, border: focusedField === "phone" ? "2px solid #be185d" : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", boxShadow: focusedField === "phone" ? "0 0 0 4px rgba(190,24,93,0.12)" : "none", transition: "all 0.2s ease" }}>
                <span style={{ fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  Telefon
                  {isValidPhone(clientPhone) && (
                    <span style={{ color: "#16a34a", fontWeight: 900 }}>✓</span>
                  )}
                </span>
                <input
                  type="text"
                  placeholder="npr. 067 123 456"
                  value={formatPhone(clientPhone)}
                  onFocus={() => setFocusedField("phone")}
                  onBlur={() => setFocusedField("")}
                  onChange={(e) => {
                    let digits = e.target.value.replace(/\D/g, "").slice(0, 9);
                    if (digits.length === 1 && digits !== "0") {
                      digits = `06${digits}`.slice(0, 9);
                    }
                    setClientPhone(digits);
                  }}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, textAlign: "center", background: "transparent" }}
                />
              </label>
            </div>

            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", WebkitTextFillColor: "#111827" }}>Izaberite termin</h2>

            <label style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16 }}>
              <span style={{ minWidth: 120, fontWeight: 700 }}>Datum</span>
              <input
                type="date"
                min={todayISO()}
                value={selectedDate}
                onFocus={() => setFocusedField("date")}
                onBlur={() => setFocusedField("")}
                onChange={(e) => {
                  const nextDate = e.target.value < todayISO() ? todayISO() : e.target.value;
                  setSelectedDate(nextDate);
                  setSelectedSlot("");
                }}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16 }}
              />
            </label>

            

            <div style={{ display: "grid", gap: 10 }}>
              {visibleUserSlots.map((slot) => {
                const unavailable = isUnavailable(selectedDate, slot);
                const checked = selectedSlot === slot;
                let label = "Slobodno";
                let statusBackground = "#ecfdf5";
                let statusBorder = "#bbf7d0";
                let statusColor = "#166534";

                if (isBooked(selectedDate, slot)) {
                  label = `Zakazano: ${formatPublicName(booked[key(selectedDate, slot)]?.clientName)}`;
                  statusBackground = "#fee2e2";
                  statusBorder = "#fecaca";
                  statusColor = "#991b1b";
                } else if (isNonWorkingSlot(selectedDate, slot)) {
                  label = "Neradno";
                  statusBackground = "#f4f4f5";
                  statusBorder = "#d4d4d8";
                  statusColor = "#52525b";
                } else if (isBlocked(selectedDate, slot)) {
                  label = "Zaključano";
                  statusBackground = "#f4f4f5";
                  statusBorder = "#d4d4d8";
                  statusColor = "#52525b";
                } else if (isPending(selectedDate, slot)) {
                  label = "Čeka potvrdu";
                  statusBackground = "#fef3c7";
                  statusBorder = "#fde68a";
                  statusColor = "#92400e";
                }

                return (
                  <label
                    key={slot}
                    style={{
                      display: "flex",
                      flexDirection: "row",
                      flexWrap: "nowrap",
                      alignItems: "center",
                      gap: 14,
                      border: checked ? "2px solid #be185d" : `1px solid ${statusBorder}`,
                      borderRadius: 16,
                      padding: "11px 13px",
                      background: unavailable ? "#f8fafc" : checked ? "#fdf2f8" : statusBackground,
                      opacity: unavailable ? 0.65 : 1,
                      cursor: unavailable ? "not-allowed" : "pointer",
                      whiteSpace: "nowrap",
                      overflowX: "auto",
                    }}
                  >
                    <span style={{ minWidth: 70, fontWeight: 800, fontSize: 18 }}>{slot}</span>
                    <span style={{ flex: 1, color: statusColor, fontWeight: 700 }}>{label}</span>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={unavailable}
                      onChange={() => setSelectedSlot(checked ? "" : slot)}
                      style={{ width: 18, height: 18 }}
                    />
                  </label>
                );
              })}
              {visibleUserSlots.length === 0 && (
                <p style={{ color: "#71717a", marginTop: 12 }}>
                  Za izabrani datum nema dostupnih termina ili je salon neradan.
                </p>
              )}
            </div>

            {(() => {
              const isReady = clientName.trim() && isValidPhone(clientPhone) && selectedSlot;
              return (
                <button
                  onClick={requestBooking}
                  disabled={!isReady || isSubmitting}
                  onMouseEnter={() => setIsHoverBooking(true)}
                  onMouseLeave={() => setIsHoverBooking(false)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 14,
                    border: isReady ? "1px solid #15803d" : "1px solid #d1d5db",
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: isReady
                      ? isHoverBooking
                        ? "#16a34a"
                        : "#15803d"
                      : "#e5e7eb",
                    color: isReady ? "white" : "#9ca3af",
                    fontWeight: 800,
                    fontSize: 16,
                    cursor: isReady ? "pointer" : "not-allowed",
                    marginTop: 32,
                    transition: "all 0.2s ease",
                  }}
                >
                  {isSubmitting ? "Slanje..." : "ZAKAŽI"}
                </button>
              );
            })()}
          </section>
        </main>
        {userLastUpdated && (
          <footer style={{ textAlign: "center", color: "#71717a", fontSize: 12, padding: "8px 0 4px" }}>
            Ažurirano: {userLastUpdated}
          </footer>
        )}
      </div>
    </div>
  );
}
