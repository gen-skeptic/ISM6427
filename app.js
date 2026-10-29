const DEFAULT = { name: "Boynton Beach, Florida", lat: 26.5318, lon: -80.0905 };

// WMO weather codes -> [description, icon]
const CODES = {
  0: ["Clear sky", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"], 3: ["Overcast", "☁️"],
  45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"], 57: ["Freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"], 77: ["Snow grains", "❄️"],
  80: ["Rain showers", "🌦️"], 81: ["Rain showers", "🌧️"], 82: ["Violent showers", "⛈️"],
  85: ["Snow showers", "🌨️"], 86: ["Snow showers", "🌨️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm, hail", "⛈️"], 99: ["Thunderstorm, hail", "⛈️"],
};
const NIGHT_ICONS = { 0: "🌙", 1: "🌙", 2: "☁️" };
const code = (c, isDay = 1) => {
  const [desc, icon] = CODES[c] || ["Unknown", "❔"];
  return [desc, (!isDay && NIGHT_ICONS[c]) || icon];
};
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const $ = (id) => document.getElementById(id);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
const fmtTime = (iso) => {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}:${iso.slice(14, 16)}${h < 12 ? "am" : "pm"}`;
};

// Ignore responses from a previous location if the user switched mid-load
let seq = 0;

async function loadWeather(place) {
  const { name, lat, lon } = place;
  const id = ++seq;
  $("place").textContent = name;
  loadAlerts(place, id);
  loadMarine(place, id);
  loadAir(place, id);
  setRadar(place);
  $("desc").textContent = "Loading…";
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,dew_point_2m,weather_code,is_day," +
      "wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover",
    hourly: "temperature_2m,weather_code,uv_index,precipitation_probability,is_day,visibility",
    minutely_15: "precipitation",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,daylight_duration",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: 7,
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    if (id !== seq) return;
    render(data);
    loadTides(place, data.timezone, id);
  } catch (err) {
    if (id === seq) $("desc").textContent = "Couldn't load weather. Try again.";
  }
}

function render(d) {
  const c = d.current;
  const [desc, icon] = code(c.weather_code, c.is_day);
  $("desc").textContent = desc;
  $("icon").textContent = icon;
  $("temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("feels").textContent = `${Math.round(c.apparent_temperature)}°`;
  $("humidity").textContent = `${c.relative_humidity_2m}%`;
  $("dew").textContent = `${Math.round(c.dew_point_2m)}°`;
  $("wind").textContent = `${Math.round(c.wind_speed_10m)} mph ${COMPASS[Math.round(c.wind_direction_10m / 45) % 8]}`;
  // Arrow points where the wind is blowing to (direction is where it comes from)
  $("wind-arrow").style.transform = `rotate(${c.wind_direction_10m}deg)`;
  $("gusts").textContent = `${Math.round(c.wind_gusts_10m)} mph`;
  $("pressure").textContent = `${(c.pressure_msl * 0.02953).toFixed(2)} inHg`;
  $("precip").textContent = `${(d.daily.precipitation_sum[0] ?? 0).toFixed(2)} in`;

  // Rain in the next 2 hours, from 15-minute data — handy for Florida pop-up storms
  const m = d.minutely_15;
  const soon = m.time.map((t, i) => [t, m.precipitation[i]])
    .filter(([t]) => t >= c.time.slice(0, 16)).slice(0, 8);
  const wet = soon.findIndex(([, p]) => p > 0);
  $("nowcast").textContent = !soon.length ? "" : wet === -1 ? "☂ No rain expected in the next 2 hours"
    : wet === 0 ? "☂ Rain now" : `☂ Rain likely in ~${wet * 15} min`;

  // Next 12 hours, starting at the current hour (times are in the location's timezone)
  const start = Math.max(0, d.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)));
  $("hourly").innerHTML = d.hourly.time.slice(start, start + 12).map((t, i) => {
    const h = Number(t.slice(11, 13));
    const label = i === 0 ? "Now" : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    return `<div class="hour"><span class="muted">${label}</span>
      <span class="i">${code(d.hourly.weather_code[start + i], d.hourly.is_day[start + i])[1]}</span>
      <b>${Math.round(d.hourly.temperature_2m[start + i])}°</b>
      <span class="pop">${d.hourly.precipitation_probability[start + i] ?? 0}%</span></div>`;
  }).join("");

  // Visibility comes back in feet with imperial units, meters otherwise
  const vis = d.hourly.visibility[start];
  const miles = vis / (d.hourly_units.visibility === "ft" ? 5280 : 1609.34);
  $("vis").textContent = vis == null ? "--" : `${miles >= 10 ? "10+" : miles.toFixed(1)} mi · ${c.cloud_cover}%`;

  const uv = d.hourly.uv_index[start];
  $("uv").textContent = uv == null ? "--" : uv.toFixed(1);
  setLevel("uv-level", uv, UV_LEVELS);

  $("sunrise").textContent = fmtTime(d.daily.sunrise[0]);
  $("sunset").textContent = fmtTime(d.daily.sunset[0]);
  const mins = Math.round(d.daily.daylight_duration[0] / 60);
  $("daylight").textContent = `${Math.floor(mins / 60)}h ${mins % 60}m`;

  $("daily").innerHTML = d.daily.time.map((t, i) => {
    const day = i === 0 ? "Today" : new Date(`${t}T12:00`).toLocaleDateString("en-US", { weekday: "short" });
    const [dDesc, dIcon] = code(d.daily.weather_code[i]);
    return `<div class="day"><span>${day}</span><span class="i" title="${dDesc}">${dIcon}</span>
      <span class="rain">${d.daily.precipitation_probability_max[i] ?? 0}% rain</span>
      <span class="range"><b>${Math.round(d.daily.temperature_2m_max[i])}°</b> <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></span></div>`;
  }).join("");
}

// [upper bound, label] for color-coded scales; index maps to .lv-N classes
const UV_LEVELS = [[3, "Low"], [6, "Moderate"], [8, "High"], [11, "Very high"], [Infinity, "Extreme"]];
const AQI_LEVELS = [[51, "Good"], [101, "Moderate"], [151, "Unhealthy for sensitive groups"],
  [201, "Unhealthy"], [301, "Very unhealthy"], [Infinity, "Hazardous"]];
function setLevel(elId, value, levels) {
  const el = $(elId);
  if (value == null) { el.textContent = ""; el.className = "level"; return; }
  const i = levels.findIndex(([max]) => value < max);
  el.textContent = levels[i][1];
  el.className = `level lv-${i}`;
}

// National Weather Service alerts (US only). Each alert links to the NWS forecast
// page for this location, which lists the full statement for every active hazard.
async function loadAlerts({ lat, lon }, id) {
  const box = $("alerts");
  box.hidden = true;
  box.innerHTML = "";
  try {
    const res = await fetch(`https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lon.toFixed(4)}`,
      { headers: { Accept: "application/geo+json" } });
    if (!res.ok) return; // outside the US, or NWS unavailable
    const { features = [] } = await res.json();
    if (id !== seq || !features.length) return;
    const link = `https://forecast.weather.gov/MapClick.php?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    box.innerHTML = features.map(({ properties: a }) => {
      const sev = /extreme|severe/i.test(a.severity) ? "severe" : /moderate/i.test(a.severity) ? "moderate" : "";
      return `<a class="glass alert ${sev}" href="${link}" target="_blank" rel="noopener">
        <b>⚠ ${esc(a.event)}</b>
        <span>${esc(a.headline || "")}</span>
        <small>Tap for details on weather.gov ↗</small></a>`;
    }).join("");
    box.hidden = false;
  } catch {}
}

// Open-Meteo marine: waves, swell and water temperature (null when inland)
async function loadMarine({ lat, lon }, id) {
  ["waves", "swell", "water"].forEach((k) => ($(k).textContent = "--"));
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "wave_height,wave_period,swell_wave_height,sea_surface_temperature",
    length_unit: "imperial",
    temperature_unit: "fahrenheit",
    cell_selection: "sea",
    timezone: "auto",
  });
  try {
    const res = await fetch(`https://marine-api.open-meteo.com/v1/marine?${params}`);
    if (!res.ok) return;
    const { current: m } = await res.json();
    if (id !== seq || !m) return;
    if (m.wave_height != null) $("waves").textContent = `${m.wave_height.toFixed(1)} ft · ${Math.round(m.wave_period)}s`;
    if (m.swell_wave_height != null) $("swell").textContent = `${m.swell_wave_height.toFixed(1)} ft`;
    if (m.sea_surface_temperature != null) $("water").textContent = `${Math.round(m.sea_surface_temperature)}°`;
  } catch {}
}

// Open-Meteo air quality: US AQI, PM2.5 and ozone
async function loadAir({ lat, lon }, id) {
  ["aqi", "pm25", "ozone"].forEach((k) => ($(k).textContent = "--"));
  setLevel("aqi-level", null);
  try {
    const res = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,pm2_5,ozone&timezone=auto`);
    if (!res.ok) return;
    const { current: a } = await res.json();
    if (id !== seq || !a) return;
    if (a.us_aqi != null) $("aqi").textContent = Math.round(a.us_aqi);
    setLevel("aqi-level", a.us_aqi, AQI_LEVELS);
    if (a.pm2_5 != null) $("pm25").textContent = `${a.pm2_5.toFixed(1)} µg/m³`;
    if (a.ozone != null) $("ozone").textContent = `${Math.round(a.ozone)} µg/m³`;
  } catch {}
}

// NOAA tide predictions from the nearest station (within ~50 km)
let stationsPromise;
const getStations = () => (stationsPromise ??= fetch(
  "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions"
).then((r) => r.json()).then((j) => j.stations).catch(() => { stationsPromise = null; return []; }));

async function loadTides({ lat, lon }, tz, id) {
  const list = $("tides"), link = $("tide-link");
  list.innerHTML = "<li class='muted'>Loading…</li>";
  link.textContent = "";
  link.removeAttribute("href");
  const none = (msg) => { if (id === seq) list.innerHTML = `<li class='muted'>${msg}</li>`; };
  try {
    const km = (s) => {
      const x = ((s.lng ?? s.lon) - lon) * Math.cos((lat * Math.PI) / 180), y = s.lat - lat;
      return Math.hypot(x, y) * 111;
    };
    const station = (await getStations()).reduce((best, s) => (!best || km(s) < km(best) ? s : best), null);
    if (!station || km(station) > 50) return none("No tide station nearby");

    // "now" and today's date in the location's timezone, matching NOAA's local-time strings
    const now = new Intl.DateTimeFormat("sv-SE", { timeZone: tz, dateStyle: "short", timeStyle: "short" }).format(new Date());
    const params = new URLSearchParams({
      product: "predictions", datum: "MLLW", station: station.id, interval: "hilo",
      begin_date: now.slice(0, 10).replaceAll("-", ""), range: 48,
      time_zone: "lst_ldt", units: "english", format: "json", application: "weather-app",
    });
    const res = await fetch(`https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?${params}`);
    const { predictions = [] } = await res.json();
    if (id !== seq) return;
    const next = predictions.filter((p) => p.t >= now).slice(0, 4);
    if (!next.length) return none("No tide data");
    link.textContent = `· ${station.name} ↗`;
    link.href = `https://tidesandcurrents.noaa.gov/noaatidepredictions.html?id=${station.id}`;
    list.innerHTML = next.map((p) => {
      const day = p.t.slice(0, 10) === now.slice(0, 10) ? "" : "tmrw ";
      return `<li><span>${p.type === "H" ? "High" : "Low"} · ${day}${fmtTime(p.t.replace(" ", "T"))}</span><b>${Number(p.v).toFixed(1)} ft</b></li>`;
    }).join("");
  } catch {
    none("Tides unavailable");
  }
}

// Windy radar embed, centered on the location
function setRadar({ lat, lon }) {
  const params = new URLSearchParams({
    lat, lon, detailLat: lat, detailLon: lon, zoom: 8, level: "surface",
    overlay: "radar", product: "radar", marker: "true", calendar: "now",
    type: "map", location: "coordinates", metricWind: "mph", metricTemp: "°F", radarRange: "-1",
  });
  $("radar").src = `https://embed.windy.com/embed2.html?${params}`;
}

// City search via Open-Meteo geocoding
const results = $("results");
$("search").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("query").value.trim();
  if (!q) return;
  results.innerHTML = "<li class='muted'>Searching…</li>";
  results.hidden = false;
  try {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=en`);
    const { results: places = [] } = await res.json();
    if (!places.length) { results.innerHTML = "<li class='muted'>No matches</li>"; return; }
    results.innerHTML = "";
    places.forEach((p) => {
      const li = document.createElement("li");
      const region = [p.admin1, p.country].filter(Boolean).join(", ");
      li.innerHTML = `${p.name} <small>${region}</small>`;
      li.onclick = () => {
        results.hidden = true;
        $("query").value = "";
        loadWeather({ name: [p.name, p.admin1 || p.country].filter(Boolean).join(", "), lat: p.latitude, lon: p.longitude });
      };
      results.appendChild(li);
    });
  } catch {
    results.innerHTML = "<li class='muted'>Search failed</li>";
  }
});
document.addEventListener("click", (e) => { if (!$("search").contains(e.target)) results.hidden = true; });

// Theme switch: light / dark / system (follows OS setting)
const themeButtons = document.querySelectorAll("[data-theme-option]");
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButtons.forEach((b) => b.setAttribute("aria-pressed", b.dataset.themeOption === theme));
  try { localStorage.setItem("theme", theme); } catch {}
}
themeButtons.forEach((b) => b.addEventListener("click", () => setTheme(b.dataset.themeOption)));
setTheme(document.documentElement.dataset.theme);

loadWeather(DEFAULT);
