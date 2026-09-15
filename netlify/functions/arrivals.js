// TfL call happens here, on Netlify's servers, not on the reception screen.
// The screen only ever talks to *.netlify.app, which it can already reach.

const STOP_ID = "490007707E";              // Hammersmith Hospital, Stop B
const ALLOWED_ROUTES = ["7", "70", "72", "272", "N7", "N72"];
const MAX_ROWS = 5;

// Set TFL_APP_KEY in Netlify > Site settings > Environment variables.
// The fallback keeps the site working before that is done.
const API_KEY = process.env.TFL_APP_KEY || "234aa01f10b4466187963c1b6cea4f9c";

function cleanDestination(name) {
  return String(name || "Unknown destination")
    .replace(/\s+/g, " ")
    .replace(/^\s*-/, "")
    .trim();
}

exports.handler = async function () {
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  };

  // London time, worked out on the server, so a player with a wrong clock
  // still shows a sensible "updated" stamp.
  const generatedAt = new Date().toLocaleTimeString("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit"
  });

  try {
    const url =
      "https://api.tfl.gov.uk/StopPoint/" +
      encodeURIComponent(STOP_ID) +
      "/Arrivals?app_key=" +
      encodeURIComponent(API_KEY);

    const response = await fetch(url, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: "TfL returned " + response.status,
          generatedAt,
          departures: []
        })
      };
    }

    const data = await response.json();

    const rows = data
      .filter(function (x) {
        const route = String(x.lineName || "").trim();
        return !ALLOWED_ROUTES.length || ALLOWED_ROUTES.indexOf(route) !== -1;
      })
      .map(function (x) {
        // timeToStation is seconds until arrival, calculated by TfL.
        // Using it means the screen's own clock is irrelevant.
        return {
          route: String(x.lineName || ""),
          destination: cleanDestination(x.destinationName),
          seconds: Number(x.timeToStation),
          vehicleId: String(x.vehicleId || "")
        };
      })
      .filter(function (x) {
        return Number.isFinite(x.seconds);
      })
      .sort(function (a, b) {
        return a.seconds - b.seconds;
      });

    const seen = {};
    const unique = [];
    rows.forEach(function (row) {
      const key = row.route + "|" + row.destination + "|" + row.vehicleId + "|" + row.seconds;
      if (!seen[key]) {
        seen[key] = true;
        unique.push(row);
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        generatedAt,
        departures: unique.slice(0, MAX_ROWS)
      })
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: false,
        error: String((err && err.message) || err),
        generatedAt,
        departures: []
      })
    };
  }
};
