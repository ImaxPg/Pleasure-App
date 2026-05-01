import React, { useMemo, useState, useEffect, useRef } from "react";
import { Calendar, Mail, ShieldCheck } from "lucide-react";

const START_HOUR = 9;
const END_HOUR = 20;
const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

const COLOR_THEMES = {
  green: {
    pageBg: "linear-gradient(135deg, #f0fdf4 0%, #ffffff 42%, #ecfeff 100%)",
    softBorder: "#bbf7d0",
    focus: "#16a34a",
    focusRgb: "22,163,74",
    dateBg: "#f0fdf4",
    dateBgActive: "#dcfce7",
    dateBorder: "#bbf7d0",
    dateBorderActive: "#16a34a",
    dateText: "#111827",
    dateTextActive: "#166534",
    slotBg: "#ecfdf5",
    slotBgActive: "#15803d",
    slotBorder: "#bbf7d0",
    slotBorderActive: "#15803d",
    slotShadowActive: "rgba(21,128,61,0.28)",
    strong: "#15803d",
    strongHover: "#16a34a",
  },
  blue: {
    pageBg: "linear-gradient(135deg, #eff6ff 0%, #ffffff 42%, #ecfeff 100%)",
    softBorder: "#bfdbfe",
    focus: "#2563eb",
    focusRgb: "37,99,235",
    dateBg: "#eff6ff",
    dateBgActive: "#dbeafe",
    dateBorder: "#bfdbfe",
    dateBorderActive: "#2563eb",
    dateText: "#111827",
    dateTextActive: "#1e3a8a",
    slotBg: "#e0f2fe",
    slotBgActive: "#0284c7",
    slotBorder: "#bae6fd",
    slotBorderActive: "#0284c7",
    slotShadowActive: "rgba(2,132,199,0.28)",
    strong: "#2563eb",
    strongHover: "#1d4ed8",
  },
  gold: {
    pageBg: "linear-gradient(135deg, #fffbeb 0%, #ffffff 42%, #fef3c7 100%)",
    softBorder: "#fde68a",
    focus: "#d97706",
    focusRgb: "217,119,6",
    dateBg: "#fffbeb",
    dateBgActive: "#fef3c7",
    dateBorder: "#fde68a",
    dateBorderActive: "#d97706",
    dateText: "#111827",
    dateTextActive: "#78350f",
    slotBg: "#fef3c7",
    slotBgActive: "#b45309",
    slotBorder: "#fde68a",
    slotBorderActive: "#b45309",
    slotShadowActive: "rgba(180,83,9,0.28)",
    strong: "#b45309",
    strongHover: "#d97706",
  },
};

// Promijeni u "green", "blue" ili "gold".
const ACTIVE_THEME = "blue";

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

const addDaysISO = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// FIX za iPhone zoom / mala slova
if (typeof document !== "undefined") {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    const m = document.createElement("meta");
    m.name = "viewport";
    m.content = "width=device-width, initial-scale=1, maximum-scale=1";
    document.head.appendChild(m);
  } else {
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
  }
}

export default function MassageBookingSite() {
  const slots = useMemo(makeSlots, []);
  const theme = COLOR_THEMES[ACTIVE_THEME] || COLOR_THEMES.green;
const [selectedDate, setSelectedDate] = useState(todayISO());
const [selectedSlot, setSelectedSlot] = useState("");

const userDateCards = useMemo(() => {
  const dayLabels = ["Ned", "Pon", "Uto", "Sri", "Čet", "Pet", "Sub"];
  return Array.from({ length: 21 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const iso = `${year}-${month}-${day}`;
    return {
      iso,
      label: index === 0 ? "Danas" : index === 1 ? "Sjutra" : dayLabels[date.getDay()],
      day,
    };
  });
}, []);

const [clientName, setClientName] = useState(() => localStorage.getItem("savedName") || "");
const [clientPhone, setClientPhone] = useState(() => localStorage.getItem("savedPhone") || "");
const [bookingPin, setBookingPin] = useState("");
const [bookingPinError, setBookingPinError] = useState("");
const [rememberData, setRememberData] = useState(() => Boolean(localStorage.getItem("savedName")));

  const [booked, setBooked] = useState({});
  const [pending, setPending] = useState([]);
  const [blocked, setBlocked] = useState({});
  const [overrideOpen, setOverrideOpen] = useState({});
  const [userMessage, setUserMessage] = useState("");
  const [userPopup, setUserPopup] = useState(null);
  const [trackedBookingId, setTrackedBookingId] = useState(() => localStorage.getItem("trackedBookingId"));
  const [userConfirmedBookings, setUserConfirmedBookings] = useState(() => {
    const savedList = localStorage.getItem("userConfirmedBookings");
    if (savedList) return JSON.parse(savedList);

    // kompatibilnost sa starom verzijom koja je čuvala samo jedan termin
    const oldSaved = localStorage.getItem("userConfirmedBooking");
    return oldSaved ? [JSON.parse(oldSaved)] : [];
  });
  const [adminAppointments, setAdminAppointments] = useState([]);
  const [adminLastUpdated, setAdminLastUpdated] = useState("");
  const [userLastUpdated, setUserLastUpdated] = useState("");
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const [adminPopups, setAdminPopups] = useState([]);
  const knownPendingIdsRef = useRef(new Set());
  const knownConfirmedIdsRef = useRef(new Set());
  const knownConfirmedAppointmentsRef = useRef(new Map());
  const adminCancelledIdsRef = useRef(new Set());
  const userAdminCancelledNotifiedIdsRef = useRef(new Set());
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
  const isAdminPage = window.location.pathname.startsWith("/admin-pero-081");
  const [adminPasswordInput, setAdminPasswordInput] = useState("");
  const [isHoverBooking, setIsHoverBooking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [focusedField, setFocusedField] = useState("");
  const pulseStyle = {
    animation: "pulseStatus 1.6s infinite",
  };
  const [now, setNow] = useState(new Date());
  const [adminFilterDate, setAdminFilterDate] = useState(todayISO());
  const [adminQuickFilter, setAdminQuickFilter] = useState("today");
  const [adminSearch, setAdminSearch] = useState("");
  const [isAdminAuth, setIsAdminAuth] = useState(() => Boolean(sessionStorage.getItem("adminToken")));

  useEffect(() => {
    if (adminQuickFilter === "today") {
      setAdminFilterDate(todayISO());
    }

    if (adminQuickFilter === "tomorrow") {
      setAdminFilterDate(addDaysISO(1));
    }
  }, [adminQuickFilter]);

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

  const syncUserConfirmedBookings = async () => {
    if (isAdminPage || !isValidPhone(clientPhone)) return;

    try {
      const response = await fetch(`${API}/appointments/my-booking?phone=${clientPhone}&t=${Date.now()}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        localStorage.setItem("userConfirmedBookings", JSON.stringify([]));
        localStorage.removeItem("userConfirmedBooking");
        // Ne brišemo lokalnu listu ako backend trenutno ne vrati rezultat,
        // da ne izgubimo već prikazane termine zbog cache/deploy kašnjenja.
        setUserConfirmedBookings((current) => current.filter((booking) => !isPastSlot(booking.date, booking.time)));
        return;
      }

      const result = await response.json();
      const bookings = Array.isArray(result) ? result : [result];
      const confirmedBookings = bookings
        .filter((booking) => booking?.id && !isPastSlot(booking.date, booking.time))
        .map((booking) => ({
          id: booking.id,
          date: booking.date,
          time: booking.time,
          client_name: booking.client_name,
          client_phone: booking.client_phone,
        }))
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.time.localeCompare(b.time);
        });

      localStorage.setItem("userConfirmedBookings", JSON.stringify(confirmedBookings));
      localStorage.removeItem("userConfirmedBooking");
      setUserConfirmedBookings(confirmedBookings);
    } catch (error) {
      // Ako nema konekcije, ostavljamo postojeći lokalni prikaz.
    }
  };

  useEffect(() => {
    syncUserConfirmedBookings();
  }, [clientPhone, isAdminPage]);

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
          const overrideMap = {};

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
                setUserConfirmedBookings((current) => {
                  const withoutDuplicate = current.filter((booking) => String(booking.id) !== String(confirmedBooking.id));
                  const next = [...withoutDuplicate, confirmedBooking].sort((a, b) => {
                    if (a.date !== b.date) return a.date.localeCompare(b.date);
                    return a.time.localeCompare(b.time);
                  });
                  localStorage.setItem("userConfirmedBookings", JSON.stringify(next));
                  localStorage.removeItem("userConfirmedBooking");
                  return next;
                });
                setTimeout(() => {
                  syncUserConfirmedBookings();
                }, 500);
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

            if (item.status === "open") {
              overrideMap[`${item.date}_${item.time}`] = {
                id: item.id,
                date: item.date,
                slot: item.time,
              };
            }
          });

          setBooked(bookedMap);
          setPending(pendingList);
          setBlocked(blockedMap);
          setOverrideOpen(overrideMap);

          if (userConfirmedBookings.length > 0) {
            const confirmedIdsForSelectedDate = new Set(
              data
                .filter((item) => item.status === "confirmed")
                .map((item) => String(item.id))
            );

            const removedBookings = userConfirmedBookings.filter(
              (booking) =>
                booking.date === selectedDate &&
                !confirmedIdsForSelectedDate.has(String(booking.id)) &&
                !userAdminCancelledNotifiedIdsRef.current.has(String(booking.id))
            );

            if (removedBookings.length > 0) {
              removedBookings.forEach((booking) => {
                userAdminCancelledNotifiedIdsRef.current.add(String(booking.id));
              });

              const nextBookings = userConfirmedBookings.filter(
                (booking) =>
                  booking.date !== selectedDate ||
                  confirmedIdsForSelectedDate.has(String(booking.id))
              );

              localStorage.setItem("userConfirmedBookings", JSON.stringify(nextBookings));
              localStorage.removeItem("userConfirmedBooking");
              setUserConfirmedBookings(nextBookings);
              setUserMessage("");
              setUserPopup({
                title: "Termin je otkazan",
                message: "Jedan od vaših termina je otkazan od strane administratora.",
              });
            }
          }

          if (!isAdminPage && isValidPhone(clientPhone)) {
            syncUserConfirmedBookings();
          }

          setUserLastUpdated(new Date().toLocaleTimeString("sr-ME"));
        })
        .catch(() => {
          setIsBackendOnline(false);
        });
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);

    return () => clearInterval(interval);
  }, [selectedDate, trackedBookingId, clientPhone]);

  useEffect(() => {
    if (!isAdminPage || !isAdminAuth) return;

    const fetchAdminAppointments = () => {
      fetch(`${API}/admin/appointments?t=${Date.now()}`, {
        headers: getAdminHeaders(),
        cache: "no-store",
      })
        .then((res) => {
          if (res.status === 401) {
            setIsAdminAuth(false);
            sessionStorage.removeItem("adminToken");
            setUserMessage("Sesija je istekla. Molimo prijavite se ponovo.");
            throw new Error("Token istekao");
          }

          if (!res.ok) {
            throw new Error("Greška pri čitanju termina.");
          }

          return res.json();
        })
        .then((data) => {
          const activeData = data.filter(
            (item) => !(item.status === "pending" && isPastAppointment(item))
          );

          const pendingNow = activeData.filter((item) => item.status === "pending");
          const confirmedNow = activeData.filter((item) => item.status === "confirmed");
          const newPendingItems = pendingNow.filter((item) => !knownPendingIdsRef.current.has(item.id));

          if (!adminFirstLoadRef.current && newPendingItems.length > 0) {
            setAdminPopups((current) => [...current, ...newPendingItems]);
            playAdminNotificationSound();
          }

          // DETEKCIJA OTKAZANIH TERMINA
          const previousConfirmed = knownConfirmedIdsRef.current;
          const currentConfirmedIds = new Set(confirmedNow.map((item) => String(item.id)));

          const cancelledIds = [...previousConfirmed].filter(
            (id) => !currentConfirmedIds.has(String(id)) && !adminCancelledIdsRef.current.has(String(id))
          );

          adminCancelledIdsRef.current.forEach((id) => {
            if (!currentConfirmedIds.has(id)) {
              adminCancelledIdsRef.current.delete(id);
            }
          });

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
          knownConfirmedIdsRef.current = new Set(confirmedNow.map((item) => String(item.id)));
          knownConfirmedAppointmentsRef.current = new Map(
            confirmedNow.map((item) => [String(item.id), item])
          );
          adminFirstLoadRef.current = false;

          setAdminAppointments(sortAdminAppointments(activeData));
          setAdminLastUpdated(new Date().toLocaleTimeString("sr-ME"));
          setIsBackendOnline(true);
        })
        .catch(() => {
          setIsBackendOnline(false);
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

  const isPastAppointment = (appointment) => {
    return new Date(`${appointment.date}T${appointment.time}:00`) <= new Date();
  };

  const adminQuickFilters = [
    { key: "all", label: "Svi" },
    { key: "today", label: "Danas" },
    { key: "tomorrow", label: "Sjutra" },
    { key: "week", label: "7 dana" },
    { key: "confirmed", label: "Potvrđeni" },
    { key: "blocked", label: "Blokirani" },
    { key: "open", label: "Ručno otvoreni" },
    { key: "archive", label: "Arhiva" },
    { key: "rejected", label: "Odbijeni" },
  ];

  const matchesAdminQuickFilter = (appointment) => {
    const status = normalizeStatus(appointment.status);

    if (adminQuickFilter === "all") return true;
    if (adminQuickFilter === "today") return appointment.date === todayISO();
    if (adminQuickFilter === "tomorrow") return appointment.date === addDaysISO(1);
    if (adminQuickFilter === "week") {
      return appointment.date >= todayISO() && appointment.date <= addDaysISO(7);
    }
    if (adminQuickFilter === "archive") {
      return status === "confirmed" && isPastAppointment(appointment);
    }

    return status === adminQuickFilter;
  };

  const matchesAdminSearch = (appointment) => {
    const q = adminSearch.trim().toLowerCase();
    if (!q) return true;

    return [
      appointment.client_name,
      appointment.client_phone,
      appointment.date,
      appointment.time,
      appointment.status,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
  };

  const displayedAdminAppointments = sortAdminAppointments(
    adminAppointments.filter((appointment) => matchesAdminQuickFilter(appointment) && matchesAdminSearch(appointment))
  );
  const adminDateColorMap = getDateColorMap(adminAppointments);

  // Novi zahtjevi moraju biti uvijek vidljivi, bez obzira na odabranu karticu.
  // Search i dalje važi, da admin može brzo pronaći konkretan zahtjev.
  const pendingAdminAppointments = sortAdminAppointments(
    adminAppointments.filter(
      (appointment) =>
        normalizeStatus(appointment.status) === "pending" &&
        !isPastAppointment(appointment) &&
        matchesAdminSearch(appointment)
    )
  );

  const expiredPendingAppointments = sortAdminAppointments(
    adminAppointments.filter(
      (appointment) =>
        normalizeStatus(appointment.status) === "pending" &&
        isPastAppointment(appointment) &&
        matchesAdminSearch(appointment)
    )
  );
  const overviewAppointments = displayedAdminAppointments.filter((appointment) => {
    const status = normalizeStatus(appointment.status);

    if (["pending", "blocked", "open"].includes(status)) return false;

    if (adminQuickFilter === "archive") {
      return status === "confirmed" && isPastAppointment(appointment) && appointment.date === adminFilterDate;
    }

    if (status !== "confirmed" || isPastAppointment(appointment)) return false;

    if (adminQuickFilter === "today") return appointment.date === todayISO();
    if (adminQuickFilter === "tomorrow") return appointment.date === addDaysISO(1);
    if (adminQuickFilter === "week") return appointment.date >= todayISO() && appointment.date <= addDaysISO(7);

    if (adminQuickFilter === "all" || adminQuickFilter === "confirmed") {
      return appointment.date >= todayISO();
    }

    return appointment.date === adminFilterDate;
  });

  const overviewGroupedByDate = overviewAppointments.reduce((groups, appointment) => {
    if (!groups[appointment.date]) groups[appointment.date] = [];
    groups[appointment.date].push(appointment);
    return groups;
  }, {});

  const overviewDates = Object.keys(overviewGroupedByDate).sort();
  const isOverviewRangeMode = ["all", "today", "tomorrow", "week", "confirmed"].includes(adminQuickFilter);

  const todayAppointments = displayedAdminAppointments.filter((appointment) => appointment.date === todayISO());
  const selectedDayAllAppointments = displayedAdminAppointments.filter((appointment) => appointment.date === adminFilterDate);

  const stats = {
    pending: adminAppointments.filter((a) => normalizeStatus(a.status) === "pending" && !isPastAppointment(a)).length,
    confirmedToday: todayAppointments.filter((a) => normalizeStatus(a.status) === "confirmed").length,
    confirmedSelectedDate: selectedDayAllAppointments.filter((a) => normalizeStatus(a.status) === "confirmed").length,
    blockedSelectedDate: selectedDayAllAppointments.filter((a) => normalizeStatus(a.status) === "blocked").length,
    openedSelectedDate: selectedDayAllAppointments.filter((a) => normalizeStatus(a.status) === "open").length,
  };

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
    const slotKey = `${date}_${slot}`;
    if (overrideOpen[slotKey]) return false;

    const day = getDayFromISO(date);
    const hour = Number(slot.split(":")[0]);

    if (day === 0) return true;
    if (day === 6 && hour >= 15) return true;

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
      !isBlocked(selectedDate, slot) &&
      !isBooked(selectedDate, slot) &&
      !isPending(selectedDate, slot)
  );

  const cancelUserBooking = async (bookingToCancel) => {
    if (!bookingToCancel) return;

    const confirmed = window.confirm(
      `Da li ste sigurni da želite da otkažete termin ${bookingToCancel.date} u ${bookingToCancel.time}?`
    );

    if (!confirmed) return;

    try {
      const response = await fetch(`${API}/appointments/${bookingToCancel.id}/user-cancel`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ client_phone: bookingToCancel.client_phone }),
      });

      if (!response.ok) {
        throw new Error("Otkazivanje nije uspjelo.");
      }

      setUserConfirmedBookings((current) => {
        const next = current.filter((booking) => String(booking.id) !== String(bookingToCancel.id));
        localStorage.setItem("userConfirmedBookings", JSON.stringify(next));
        localStorage.removeItem("userConfirmedBooking");
        return next;
      });
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

if (!bookingPin.trim()) {
  setBookingPinError("Unesite PIN za zakazivanje.");
  setUserMessage("Unesite PIN za zakazivanje.");
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
      setBookingPinError("");

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
          booking_pin: bookingPin.trim(),
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

      if (rememberData) {
        localStorage.setItem("savedName", clientName);
        localStorage.setItem("savedPhone", clientPhone);
      } else {
        localStorage.removeItem("savedName");
        localStorage.removeItem("savedPhone");
      }
      localStorage.setItem("trackedBookingId", String(request.id));
      setTrackedBookingId(String(request.id));
  setUserMessage("Zahtjev je poslat administratoru. Ostanite na stranici i dobićete poruku kada termin bude potvrđen ili odbijen.");
  setSelectedSlot("");
  setBookingPin("");
  setBookingPinError("");
  setIsSubmitting(false);
} catch (error) {
  setIsSubmitting(false);
  const message = error.message || "Greška: zahtjev nije poslat backendu.";
  if (message.toLowerCase().includes("pin")) {
    setBookingPinError(message);
  }
  setUserMessage(message);
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
      adminCancelledIdsRef.current.delete(String(booking.id));
      setUserMessage("Greška: termin nije otkazan u backendu.");
    }
  };

  const cancelAdminAppointment = async (appointment) => {
    adminCancelledIdsRef.current.add(String(appointment.id));

    if (isPastSlot(appointment.date, appointment.time)) {
      setUserMessage("Termin je već prošao i ne može se otkazati.");
      adminCancelledIdsRef.current.delete(String(appointment.id));
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
      setAdminPopups((current) => [
        ...current,
        {
          id: `admin-cancel-${appointment.id}`,
          adminCancelled: true,
          client_name: appointment.client_name,
          client_phone: appointment.client_phone,
          date: appointment.date,
          time: appointment.time,
        },
      ]);
      setUserMessage(`Termin ${appointment.date} u ${appointment.time} je otkazan.`);
    } catch (error) {
      setUserMessage("Greška: termin nije otkazan u backendu.");
    }
  };

  const toggleBlock = async (date, slot) => {
    const slotKey = key(date, slot);
    if (isBooked(date, slot)) return;

    const slotKeyOverride = key(date, slot);

    // ako je termin ručno otvoren -> novi klik ga vraća u neradno stanje
    if (overrideOpen[slotKeyOverride]) {
      const openSlot = overrideOpen[slotKeyOverride];

      if (!openSlot?.id) {
        setUserMessage("Greška: ne mogu da pronađem ID ručno otvorenog termina.");
        return;
      }

      try {
        const response = await fetch(`${API}/appointments/${openSlot.id}`, {
          method: "DELETE",
          headers: getAdminHeaders(),
        });

        if (!response.ok) throw new Error("Greška pri ponovnom zaključavanju termina.");

        setOverrideOpen((current) => {
          const copy = { ...current };
          delete copy[slotKeyOverride];
          return copy;
        });

        setUserMessage(`Termin ${date} u ${slot} je ponovo vraćen kao neradni.`);
      } catch (error) {
        setUserMessage("Greška: termin nije vraćen kao neradni u backendu.");
      }
      return;
    }

    // ako je neradni termin -> klik ga otključava (override)
    if (isNonWorkingSlot(date, slot)) {
      try {
        const response = await fetch(`${API}/admin/open-slot`, {
          method: "POST",
          headers: getAdminJsonHeaders(),
          body: JSON.stringify({ date, time: slot }),
        });

        if (!response.ok) throw new Error("Greška pri ručnom otvaranju termina.");

        const data = await response.json();

        setOverrideOpen((current) => ({
          ...current,
          [slotKeyOverride]: {
            id: data.id,
            date,
            slot,
          },
        }));

        setUserMessage(`Termin ${date} u ${slot} je ručno otvoren za zakazivanje.`);
      } catch (error) {
        setUserMessage("Greška: termin nije ručno otvoren u backendu.");
      }
      return;
    }

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

  const exportNextSevenDaysTxt = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);

    const confirmed = displayedAdminAppointments
      .filter((appointment) => {
        const status = normalizeStatus(appointment.status);
        const appointmentDate = new Date(`${appointment.date}T00:00:00`);
        return status === "confirmed" && appointmentDate >= start && appointmentDate < end;
      })
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return a.time.localeCompare(b.time);
      });

    const lines = [];
    lines.push("FRIZERSKI SALON PLEASURE");
    lines.push("TERMINI ZA NAREDNIH 7 DANA");
    lines.push(`Export: ${new Date().toLocaleString("sr-ME")}`);
    lines.push("");

    if (confirmed.length === 0) {
      lines.push("Nema potvrđenih termina za narednih 7 dana.");
    } else {
      let currentDate = "";
      confirmed.forEach((appointment) => {
        if (appointment.date !== currentDate) {
          currentDate = appointment.date;
          lines.push("");
          lines.push(currentDate);
          lines.push("-------------------------");
        }

        lines.push(
          `${appointment.time} - ${appointment.client_name || "Bez imena"} - ${appointment.client_phone || "Bez telefona"}`
        );
      });
    }

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `termini-narednih-7-dana-${todayISO()}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        style={{ minHeight: "100vh", background: theme.pageBg, color: "#18181b", padding: "16px", fontSize: 16, WebkitTextSizeAdjust: "100%" }}
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
                  {adminPopups[0].adminCancelled
                    ? "Uspješno ste otkazali termin"
                    : adminPopups[0].cancelled
                    ? "Termin je otkazan"
                    : "Novi zahtjev za termin"}
                </h2>
                {!adminPopups[0].cancelled && !adminPopups[0].adminCancelled && (
                <p style={{ fontSize: 18, marginBottom: 8 }}>
                  <strong>{adminPopups[0].client_name}</strong>
                </p>
                )}
                {!adminPopups[0].cancelled && !adminPopups[0].adminCancelled && (
                <p style={{ fontSize: 16, marginBottom: 8 }}>
                  Datum: <strong>{adminPopups[0].date}</strong>
                </p>
                )}
                {!adminPopups[0].cancelled && !adminPopups[0].adminCancelled && (
                <p style={{ fontSize: 16, marginBottom: 16 }}>
                  Vrijeme: <strong>{adminPopups[0].time}</strong>
                </p>
                )
                }
                {adminPopups[0].adminCancelled && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ fontSize: 16, marginBottom: 8 }}>
                      Uspješno ste otkazali termin.
                    </p>
                    {adminPopups[0].client_name && (
                      <p style={{ fontSize: 16, marginBottom: 8 }}>
                        Korisnik: <strong>{adminPopups[0].client_name}</strong>
                      </p>
                    )}
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
                  </div>
                )}
                {adminPopups[0].cancelled && !adminPopups[0].adminCancelled && (
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
          <header style={{ background: "rgba(255,255,255,0.92)", border: `1px solid ${theme.softBorder}`, borderRadius: 30, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,0.08)" }}>
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
              <h1 className="text-3xl md:text-4xl font-bold" style={{ color: "#111827", fontSize: "clamp(30px, 8vw, 44px)", lineHeight: 1.15, WebkitTextFillColor: "#111827" }}>Admin stranica</h1>
            </div>
            <p className="text-zinc-600">
              Pregled svih zahtjeva i zakazanih termina, poređanih po datumu i vremenu.
            </p>
          </header>

          {pendingAdminAppointments.length > 0 && (
          <section style={{ background: "rgba(255,247,237,0.96)", border: "1px solid #fed7aa", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-semibold" style={{ color: "#111827", fontSize: 26, lineHeight: 1.2, WebkitTextFillColor: "#111827" }}>Novi zahtjevi</h2>
            </div>

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
          </section>

          )}

          <section style={{ background: "rgba(255,255,255,0.94)", border: "1px solid #e5e7eb", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
              <h2 className="text-2xl font-semibold" style={{ color: "#111827", fontSize: 26, lineHeight: 1.2, WebkitTextFillColor: "#111827", margin: 0 }}>
                Filteri i pretraga
              </h2>
              <button
                onClick={() => {
                  setAdminQuickFilter("today");
                  setAdminSearch("");
                }}
                style={{ border: "1px solid #d4d4d8", borderRadius: 14, background: "white", color: "#18181b", padding: "9px 12px", fontWeight: 800, cursor: "pointer", WebkitTextFillColor: "#18181b" }}
              >
                Reset
              </button>
            </div>

            <input
              type="text"
              placeholder="Pretraga po imenu, telefonu, datumu, vremenu ili statusu..."
              value={adminSearch}
              onChange={(e) => setAdminSearch(e.target.value)}
              style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 16, padding: "13px 14px", fontSize: 16, outline: "none", marginBottom: 14, color: "#111827", WebkitTextFillColor: "#111827", background: "white" }}
            />

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {adminQuickFilters.map((item) => {
                const active = adminQuickFilter === item.key;
                return (
                  <button
                    key={item.key}
                    onClick={() => setAdminQuickFilter(item.key)}
                    style={{
                      border: active ? "1px solid #18181b" : "1px solid #e5e7eb",
                      borderRadius: 999,
                      background: active ? "#18181b" : "white",
                      color: active ? "white" : "#18181b",
                      padding: "9px 13px",
                      fontWeight: 800,
                      cursor: "pointer",
                      WebkitTextFillColor: active ? "white" : "#18181b",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

          </section>

          <section style={{ background: "rgba(240,253,244,0.96)", border: "1px solid #bbf7d0", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", fontSize: 26, lineHeight: 1.2, WebkitTextFillColor: "#111827" }}>{adminQuickFilter === "archive" ? "Arhiva završenih termina" : "Pregled termina po datumu"}</h2>

            {isOverviewRangeMode ? (
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16, color: "#166534", fontWeight: 800 }}>
                {adminQuickFilter === "today"
                  ? `Prikaz: danas (${todayISO()})`
                  : adminQuickFilter === "tomorrow"
                  ? `Prikaz: sjutra (${addDaysISO(1)})`
                  : adminQuickFilter === "week"
                  ? `Prikaz: narednih 7 dana (${todayISO()} – ${addDaysISO(7)})`
                  : "Prikaz: svi budući potvrđeni termini"}
              </div>
            ) : (
              <label style={{ display: "flex", alignItems: "center", gap: 14, border: "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16 }}>
                <span style={{ minWidth: 160, fontWeight: 700 }}>{adminQuickFilter === "archive" ? "Datum arhive" : "Izaberi datum"}</span>
                <input
                  type="date"
                  value={adminFilterDate}
                  onChange={(e) => setAdminFilterDate(e.target.value)}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 18, color: "#111827", WebkitTextFillColor: "#111827", background: "transparent", textAlign: "center", minHeight: 36 }}
                />
              </label>
            )}

            {overviewAppointments.length === 0 ? (
              <p className="text-zinc-500">{adminQuickFilter === "archive" ? "Nema završenih termina za izabrani datum." : "Nema potvrđenih termina za izabrani prikaz."}</p>
            ) : (
              <div style={{ display: "grid", gap: 14 }}>
                {overviewDates.map((date) => (
                  <div key={date} style={{ display: "grid", gap: 8 }}>
                    {isOverviewRangeMode && (
                      <h3 style={{ margin: "4px 0", color: "#166534", fontSize: 18, fontWeight: 900 }}>{date}</h3>
                    )}

                    {overviewGroupedByDate[date].map((appointment) => {
                      const status = normalizeStatus(appointment.status);
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
                          <span style={{ minWidth: 100 }}>{appointment.date}</span>
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
                ))}
              </div>
            )}
          </section>
<section style={{ background: "rgba(239,246,255,0.96)", border: "1px solid #bfdbfe", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", fontSize: 26, lineHeight: 1.2, WebkitTextFillColor: "#111827" }}>Blokiranje termina</h2>

            <label style={{ display: "flex", alignItems: "center", gap: 14, border: focusedField === "date" ? "2px solid #be185d" : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", marginBottom: 16, boxShadow: focusedField === "date" ? `0 0 0 4px rgba(${theme.focusRgb},0.12)` : "none", transition: "all 0.2s ease" }}>
              <span style={{ minWidth: 120, fontWeight: 700, fontSize: 16, color: "#111827", WebkitTextFillColor: "#111827" }}>Datum</span>
              <input
                type="date"
                min={todayISO()}
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 17, color: "#111827", WebkitTextFillColor: "#111827", background: "transparent", textAlign: "center", minHeight: 34 }}
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
                const manuallyOpenNow = Boolean(overrideOpen[key(selectedDate, slot)]);

                return (
                  <button
                    key={slot}
                    disabled={bookedNow}
                    onClick={() => toggleBlock(selectedDate, slot)}
                    style={{
                      borderRadius: 14,
                      border: blockedNow ? "1px solid #1e3a8a" : "1px solid #dbeafe",
                      padding: "10px 12px",
                      fontSize: 14,
                      fontWeight: 700,
                      background: bookedNow || nonWorkingNow ? "#f4f4f5" : manuallyOpenNow ? "#ecfdf5" : blockedNow ? "#1e3a8a" : "white",
                      color: bookedNow || nonWorkingNow ? "#71717a" : manuallyOpenNow ? "#166534" : blockedNow ? "white" : "#1e3a8a",
                      cursor: bookedNow ? "not-allowed" : "pointer",
                      opacity: bookedNow ? 0.55 : 1,
                      boxShadow: blockedNow ? "0 8px 18px rgba(30,58,138,0.18)" : "0 6px 14px rgba(15,23,42,0.05)",
                    }}
                  >
                    {slot} {bookedNow ? "Zakazano" : manuallyOpenNow ? "✅ Ručno otvoreno (klik za neradno)" : nonWorkingNow ? "Neradno (klik za otvaranje)" : blockedNow ? "🔒 Zaključano" : "Slobodno"}
                  </button>
                );
              })}
            </div>
          </section>

          <section style={{ background: "rgba(245,243,255,0.96)", border: "1px solid #ddd6fe", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
              <h2 className="text-2xl font-semibold" style={{ color: "#111827", fontSize: 26, lineHeight: 1.2, WebkitTextFillColor: "#111827", margin: 0 }}>
                Statistika
              </h2>
              <button
                onClick={exportNextSevenDaysTxt}
                style={{
                  border: "1px solid #7c3aed",
                  borderRadius: 14,
                  background: "white",
                  color: "#5b21b6",
                  padding: "9px 12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  WebkitTextFillColor: "#5b21b6",
                  whiteSpace: "nowrap",
                }}
              >
                Export 7 dana
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Novi zahtjevi</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#111827" }}>{stats.pending}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Potvrđeno danas</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#166534" }}>{stats.confirmedToday}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Potvrđeno za izabrani datum</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#166534" }}>{stats.confirmedSelectedDate}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Zaključano za izabrani datum</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#1e3a8a" }}>{stats.blockedSelectedDate}</div>
              </div>
              <div style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: 14 }}>
                <div style={{ fontSize: 13, color: "#6b7280" }}>Ručno otvoreno</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: "#7c3aed" }}>{stats.openedSelectedDate}</div>
              </div>
            </div>
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
    <div style={{ minHeight: "100vh", background: theme.pageBg, color: "#18181b", padding: "14px", fontSize: 17, lineHeight: 1.45, fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", WebkitTextSizeAdjust: "100%" }}>
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
        <header style={{ background: "rgba(255,255,255,0.92)", border: `1px solid ${theme.softBorder}`, borderRadius: 30, padding: 28, boxShadow: "0 20px 60px rgba(15,23,42,0.08)" }}>
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
          <div
            style={{
              color: "#374151",
              marginTop: 18,
              lineHeight: 1.55,
              textAlign: "center",
              fontSize: 17,
              fontWeight: 500,
              WebkitTextFillColor: "#374151",
              wordSpacing: 0,
              letterSpacing: 0,
            }}
          >
            <div>Radno vrijeme salona: <strong>09:00–20:00</strong></div>
            <div>Termini su na 30 minuta.</div>
            <div>Administrator potvrđuje zakazivanje.</div>
          </div>
        </header>

        {userMessage && (
          <div className="rounded-2xl bg-white border border-zinc-200 shadow-sm p-4 flex gap-3 items-start">
            <Mail className="w-5 h-5 mt-0.5" />
            <p>{userMessage}</p>
          </div>
        )}

        <main className="grid gap-6">
          {userConfirmedBookings.filter((booking) => !isPastSlot(booking.date, booking.time)).length > 0 && (
            <section style={{ background: "#ecfdf5", border: "1px solid #bbf7d0", borderRadius: 30, padding: 20, boxShadow: "0 12px 35px rgba(15,23,42,0.06)", boxSizing: "border-box", overflow: "hidden" }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 16, color: "#166534" }}>
                Vaši zakazani termini ({userConfirmedBookings.filter((booking) => !isPastSlot(booking.date, booking.time)).length})
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 16, width: "100%", boxSizing: "border-box" }}>
                {userConfirmedBookings
                  .filter((booking) => !isPastSlot(booking.date, booking.time))
                  .map((booking, index) => (
                    <div
                      key={`${booking.id}-${booking.date}-${booking.time}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr",
                        gap: 10,
                        width: "100%",
                        maxWidth: "100%",
                        minWidth: 0,
                        boxSizing: "border-box",
                        background: "#ffffff",
                        border: "1px solid #86efac",
                        borderRadius: 18,
                        padding: 16,
                      }}
                    >
                      <div style={{ color: "#166534", fontWeight: 900, fontSize: 16 }}>
                        Termin {index + 1}
                      </div>
                      <div style={{ color: "#166534", fontWeight: 900, fontSize: 20 }}>
                        {booking.date} u {booking.time}
                      </div>
                      <button
                        onClick={() => cancelUserBooking(booking)}
                        style={{
                          width: "100%",
                          maxWidth: "100%",
                          boxSizing: "border-box",
                          border: "1px solid #dc2626",
                          borderRadius: 14,
                          background: "#ffffff",
                          color: "#991b1b",
                          padding: "11px 12px",
                          fontWeight: 800,
                          cursor: "pointer",
                          WebkitTextFillColor: "#991b1b",
                        }}
                      >
                        Otkaži ovaj termin
                      </button>
                    </div>
                  ))}
              </div>
            </section>
          )}
          <section style={{ background: "rgba(255,255,255,0.94)", border: "1px solid #f1f5f9", borderRadius: 30, padding: 24, boxShadow: "0 16px 45px rgba(15,23,42,0.08)" }}>
            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", WebkitTextFillColor: "#111827", fontSize: 25, lineHeight: 1.2 }}>Podaci korisnika</h2>

            <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 6, border: focusedField === "name" ? `2px solid ${theme.focus}` : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", boxShadow: focusedField === "name" ? `0 0 0 4px rgba(${theme.focusRgb},0.12)` : "none", transition: "all 0.2s ease" }}>
                <span style={{ fontWeight: 700, fontSize: 16, color: "#111827", WebkitTextFillColor: "#111827" }}>Ime i prezime</span>
                <input
                  type="text"
                  placeholder="Unesite ime"
                  value={clientName}
                  onFocus={() => setFocusedField("name")}
                  onBlur={() => setFocusedField("")}
                  onChange={(e) => setClientName(e.target.value)}
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, textAlign: "center", background: "transparent", color: "#111827", WebkitTextFillColor: "#111827", caretColor: "#111827" }}
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6, border: focusedField === "phone" ? `2px solid ${theme.focus}` : "1px solid #e5e7eb", borderRadius: 14, padding: "10px 12px", background: "white", boxShadow: focusedField === "phone" ? `0 0 0 4px rgba(${theme.focusRgb},0.12)` : "none", transition: "all 0.2s ease" }}>
                <span style={{ fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#111827", WebkitTextFillColor: "#111827", fontSize: 16 }}>
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
                  style={{ flex: 1, border: "none", outline: "none", fontSize: 16, textAlign: "center", background: "transparent", color: "#111827", WebkitTextFillColor: "#111827", caretColor: "#111827" }}
                />
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <input
                  type="checkbox"
                  checked={rememberData}
                  onChange={(e) => setRememberData(e.target.checked)}
                />
                <span style={{ fontSize: 16, color: "#374151", WebkitTextFillColor: "#374151" }}>Zapamti moje podatke</span>
              </label>
            </div>

            <h2 className="text-2xl font-semibold mb-4" style={{ color: "#111827", WebkitTextFillColor: "#111827", fontSize: 25, lineHeight: 1.2 }}>Izaberite termin</h2>

            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                <span style={{ fontWeight: 900, fontSize: 17, color: "#111827", WebkitTextFillColor: "#111827" }}>Datum</span>
                <span style={{ fontSize: 13, color: "#71717a", WebkitTextFillColor: "#71717a" }}>Naredni 21 dan</span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridAutoFlow: "column",
                  gridAutoColumns: "minmax(76px, 1fr)",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 6,
                }}
              >
                {userDateCards.map((item) => {
                  const active = selectedDate === item.iso;
                  return (
                    <button
                      key={item.iso}
                      type="button"
                      onClick={() => {
                        setSelectedDate(item.iso);
                        setSelectedSlot("");
                        setUserMessage("");
                      }}
                      style={{
                        border: active ? `2px solid ${theme.dateBorderActive}` : `1px solid ${theme.dateBorder}`,
                        borderRadius: 18,
                        background: active ? theme.dateBgActive : theme.dateBg,
                        color: active ? theme.dateTextActive : theme.dateText,
                        padding: "11px 8px",
                        minHeight: 70,
                        cursor: "pointer",
                        boxShadow: active ? `0 8px 22px rgba(${theme.focusRgb},0.18)` : "0 5px 16px rgba(15,23,42,0.05)",
                        WebkitTextFillColor: active ? theme.dateTextActive : theme.dateText,
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 21, fontWeight: 950, lineHeight: 1 }}>{item.day}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
              {visibleUserSlots.map((slot) => {
                const checked = selectedSlot === slot;

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => {
                      setSelectedSlot(checked ? "" : slot);
                      setUserMessage("");
                    }}
                    style={{
                      border: checked ? `2px solid ${theme.slotBorderActive}` : `1px solid ${theme.slotBorder}`,
                      borderRadius: 16,
                      padding: "14px 8px",
                      background: checked ? theme.slotBgActive : theme.slotBg,
                      color: checked ? "white" : "#111827",
                      fontWeight: 900,
                      fontSize: 15,
                      cursor: "pointer",
                      boxShadow: checked ? `0 10px 24px ${theme.slotShadowActive}` : "0 5px 14px rgba(15,23,42,0.04)",
                      WebkitTextFillColor: checked ? "white" : "#111827",
                    }}
                  >
                    {slot}
                  </button>
                );
              })}
              {visibleUserSlots.length === 0 && (
                <p style={{ color: "#71717a", marginTop: 12, gridColumn: "1 / -1" }}>
                  Za izabrani datum nema dostupnih termina ili je salon neradan.
                </p>
              )}
            </div>

            <label
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                border: bookingPinError ? "2px solid #dc2626" : focusedField === "pin" ? `2px solid ${theme.focus}` : "1px solid #e5e7eb",
                borderRadius: 14,
                padding: "10px 12px",
                background: bookingPinError ? "#fef2f2" : "white",
                boxShadow: bookingPinError
                  ? "0 0 0 4px rgba(220,38,38,0.12)"
                  : focusedField === "pin"
                  ? `0 0 0 4px rgba(${theme.focusRgb},0.12)`
                  : "none",
                transition: "all 0.2s ease",
                marginTop: 18,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 16, color: bookingPinError ? "#991b1b" : "#111827", WebkitTextFillColor: bookingPinError ? "#991b1b" : "#111827" }}>
                PIN za zakazivanje
              </span>
              <input
                type="password"
                inputMode="numeric"
                placeholder="Unesite PIN"
                value={bookingPin}
                onFocus={() => setFocusedField("pin")}
                onBlur={() => setFocusedField("")}
                onChange={(e) => {
                  setBookingPin(e.target.value.replace(/\D/g, "").slice(0, 10));
                  setBookingPinError("");
                }}
                style={{ flex: 1, border: "none", outline: "none", fontSize: 16, textAlign: "center", background: "transparent", color: bookingPinError ? "#991b1b" : "#111827", WebkitTextFillColor: bookingPinError ? "#991b1b" : "#111827", caretColor: bookingPinError ? "#991b1b" : "#111827" }}
              />
              {bookingPinError && (
                <span style={{ color: "#dc2626", WebkitTextFillColor: "#dc2626", fontSize: 13, fontWeight: 800, textAlign: "center" }}>
                  {bookingPinError}
                </span>
              )}
            </label>

            {(() => {
              const isReady = clientName.trim() && isValidPhone(clientPhone) && selectedSlot && bookingPin.trim();
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
                    border: isReady ? `1px solid ${theme.strong}` : "1px solid #d1d5db",
                    borderRadius: 14,
                    padding: "10px 12px",
                    background: isReady
                      ? isHoverBooking
                        ? theme.strongHover
                        : theme.strong
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
