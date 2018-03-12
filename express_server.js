// server config
const express = require("express");
const app = express();
app.set("view engine", "ejs");
const PORT = process.env.PORT || 8080; // default port 8080
const bodyParser = require("body-parser");
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
const cookieSession = require('cookie-session');
const flash = require('express-flash');
app.use(flash());
app.use(cookieSession({
  name: 'session',
  keys: ["key 1"]
}));

// import dependency functionality
const icao = require('icao');
const terminalProcedures = require('terminal-procedures')
const notams = require('notams');
const MetarFetcher = require('metar-taf').MetarFetcher;
const metarFetcher = new MetarFetcher();
const TafFetcher = require('metar-taf').TafFetcher;
const tafFetcher = new TafFetcher();

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

// routes
app.get("/", (req, res) => {
  res.render("index");
});

app.post("/chart", (req, res) => {
  let airport = req.body.airport.toUpperCase();
  if (airport.length < 4 || airport.length > 4 || !icao[airport]) {
    req.flash('warning', 'That airport wasn\'t recognized. Please enter a valid ICAO code and try again.');
    res.redirect("/")
  } else {
    res.redirect("http://localhost:8080/" + airport);
  }
});

app.get("/:id", (req, res) => {
  let { id } = req.params;
  let airport = id.toUpperCase();
  if (!icao[airport]) {
    req.flash('warning', 'That airport wasn\'t recognized. Please enter a valid ICAO code and try again.');
    res.redirect("/")
  } else if (icao[airport]) {
    // get metar
    const currentMetar = metarFetcher.getData(airport)
    .then((metar) => {

      // get taf
      const currentTaf = tafFetcher.getData(airport)
      .then((taf) => {

        // get notams
        const notam = notams([airport], { format: 'DOMESTIC' })
        .then((notamList) => {

          // get charts
          let firstChar = airport.substring(0, 1);
          if (firstChar === 'K' || firstChar === 'P') {
            terminalProcedures.list(airport)
            .then(chartObj => {
              let templateVars = {
                icao: airport,
                metar: metar,
                taf: taf,
                notamList: notamList,
                chartObj: chartObj,
              }
              res.render("airport", templateVars);
            })
            .catch(error => {
              // error fetching charts
            });
          } else {
            // non-USA airport, don't show chart section
            let templateVars = {
              icao: airport,
              metar: metar,
              taf: taf,
              notamList: notamList,
            }
            res.render("airport", templateVars);
          }

        })
        .catch(error => {
          // error fetching NOTAMs
        });
      })
      .catch(error => {
        if (error.code == 'ENOTFOUND' &&
            error.syscall == 'getaddrinfo' &&
            error.host == 'tgftp.nws.noaa.gov') {
          req.flash('warning', `Uh oh. The latest TAF for ${airport} couldn't be fetched. Please check your network/connection settings and try again.`);
          res.redirect("/")
        }
      });
    })
    .catch(error => {
      if (error.code == 'ENOTFOUND' &&
          error.syscall == 'getaddrinfo' &&
          error.host == 'tgftp.nws.noaa.gov') {
        req.flash('warning', `Uh oh. The latest METAR for ${airport} couldn't be fetched. Please check your network/connection settings and try again.`);
        res.redirect("/")
      }
    });
  };
});
