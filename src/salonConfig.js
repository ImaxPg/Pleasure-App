import logoImage from "./pero4png.png";


export const SALON_CONFIG = {
  name: "Pleasure",
  
  logo: logoImage,

  adminRoutes: {
    "/admin-pero-081": 1,
    "/admin-dzeno-081": 2,
  },

  barbers: [
    {
      id: 1,
      name: "Pero",
      image: "/barbers/pero.jpg",
    },
    {
      id: 2,
      name: "Dženo",
      image: "/barbers/dzeno.jpg",
    },
  ],

  schedules: {
    1: {
      name: "Pero",
      workingStart: "08:00",
      workingEnd: "20:00",
      breaks: [{ start: "15:00", end: "17:00" }],
    },
    2: {
      name: "Dženo",
      workingStart: "09:00",
      workingEnd: "20:00",
      breaks: [{ start: "18:00", end: "20:00" }],
    },
  },

  colors: {
    pageBg: "#fcba03",
    heroBg: "linear-gradient(180deg, #111827 0%, #1f2937 100%)",
  },
};