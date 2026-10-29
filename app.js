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
const code = (c) => CODES[c] || ["Unknown", "❔"];
const $ = (id) => document.getElementById(id);

async function loadWeather({ name, lat, lon }) {
  $("place").textContent = name;
  $("desc").textContent = "Loading…";
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,precipitation",
    hourly: "temperature_2m,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    wind_speed_unit: "mph",
    precipitation_unit: "inch",
    timezone: "auto",
    forecast_days: 7,
  });
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!res.ok) throw new Error(res.status);
    render(await res.json());
  } catch (err) {
    $("desc").textContent = "Couldn't load weather. Try again.";
  }
}

function render(d) {
  const c = d.current;
  const [desc, icon] = code(c.weather_code);
  $("desc").textContent = desc;
  $("icon").textContent = icon;
  $("temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("feels").textContent = `${Math.round(c.apparent_temperature)}°`;
  $("humidity").textContent = `${c.relative_humidity_2m}%`;
  $("wind").textContent = `${Math.round(c.wind_speed_10m)} mph`;
  $("precip").textContent = `${c.precipitation} in`;

  // Next 12 hours, starting at the current hour (times are in the location's timezone)
  const start = Math.max(0, d.hourly.time.findIndex((t) => t >= c.time.slice(0, 13)));
  $("hourly").innerHTML = d.hourly.time.slice(start, start + 12).map((t, i) => {
    const h = Number(t.slice(11, 13));
    const label = i === 0 ? "Now" : `${h % 12 || 12}${h < 12 ? "am" : "pm"}`;
    return `<div class="hour"><span class="muted">${label}</span>
      <span class="i">${code(d.hourly.weather_code[start + i])[1]}</span>
      <b>${Math.round(d.hourly.temperature_2m[start + i])}°</b></div>`;
  }).join("");

  $("daily").innerHTML = d.daily.time.map((t, i) => {
    const day = i === 0 ? "Today" : new Date(`${t}T12:00`).toLocaleDateString("en-US", { weekday: "short" });
    const [dDesc, dIcon] = code(d.daily.weather_code[i]);
    return `<div class="day"><span>${day}</span><span class="i" title="${dDesc}">${dIcon}</span>
      <span class="rain">${d.daily.precipitation_probability_max[i] ?? 0}% rain</span>
      <span class="range"><b>${Math.round(d.daily.temperature_2m_max[i])}°</b> <span>${Math.round(d.daily.temperature_2m_min[i])}°</span></span></div>`;
  }).join("");
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
