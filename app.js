"use strict";

const Datastore = require("@google-cloud/datastore");
const request = require("request");
const express = require("express");
const body_parser = require("body-parser");
const snoowrap = require("snoowrap");

const secrets = require("./secrets");
const config = require("./config");

const app = express().use(body_parser.json()); // creates express http server
const datastore = new Datastore({
  projectId: config.APP_ID
});

const psidType = "PSID";

app.post("/webhook", (req, res) => {
  let body = req.body;

  if (body.object === "page") {
    body.entry.forEach(function(entry) {
      let webhook_event = entry.messaging[0];

      let sender_psid = webhook_event.sender.id;

      // Check if the event is a message
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      }
    });

    // Return a '200 OK' response to all events
    res.status(200).send("EVENT_RECEIVED");
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

// Accepts GET requests at the /webhook endpoint
app.get("/webhook", (req, res) => {
  // Parse params from the webhook verification request
  let mode = req.query["hub.mode"];
  let token = req.query["hub.verify_token"];
  let challenge = req.query["hub.challenge"];

  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === "subscribe" && token === secrets.VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

app.get("/cron", (req, res) => {
  const formatted = getTodayString();
  request(
    `https://statsapi.web.nhl.com/api/v1/schedule?site=en_nhl&startDate=${formatted}&endDate=${formatted}&teamId=10&expand=schedule.teams,schedule.venue,schedule.metadata,schedule.ticket,schedule.broadcasts.all`,
    { json: true },
    (err, nhlRes, body) => {
      if (err) {
        console.log("Error getting schedule");
        console.log(err);
        res.status(500).send(err);
        return;
      }

      if (!body.dates || body.dates.length < 1) {
        console.log("No games today");
        res.sendStatus(200);
        return;
      }

      const now = new Date();
      const gameTime = Date.parse(body.dates[0].games[0].gameDate);
      const timeUntilGame = gameTime - now.getTime();

      if (timeUntilGame < 10 * 60 * 1000 && timeUntilGame > 0) {
        console.log("Within 10 minutes of the game");
        getTheavsPost().then(post => {
          if (post) {
            console.log("Found post");

            // query for users
            const query = datastore.createQuery(psidType);
            datastore.runQuery(query, (err, entities, info) => {
              if (err) {
                console.log("Error getting psids");
                console.log(err);
                res.status(500).send(err);
                return;
              }

              console.log("Messaging " + entities.length + " people");

              for (let i = 0; i < entities.length; ++i) {
                callSendAPI(entities[i].psid, { text: post.url });
              }
              res.sendStatus(200);
            });
          } else {
            console.log("Could not find post");
            res.sendStatus(200);
          }
        });
      } else {
        console.log("Not within 10 minutes of game time");
        res.sendStatus(200);
      }
    }
  );
});

app.listen(process.env.PORT || 1337, () => console.log("webhook is listening"));

function handleMessage(sender_psid, received_message) {
  let response;

  // Check if the message contains text
  if (received_message.text) {
    const key = datastore.key([psidType, sender_psid]);

    if (received_message.text === "stop") {
      datastore.delete(key, err => {
        if (!err) {
          callSendAPI(sender_psid, { text: "Successfully unsubscribed" });
        } else {
          console.log("Error deleting");
          console.log(err);
          callSendAPI(sender_psid, { text: "Something went wrong" });
          return;
        }
      });
    } else {
      const entity = {
        key: key,
        method: "upsert",
        data: {
          psid: sender_psid
        }
      };
      datastore.save(entity, err => {
        if (!err) {
          callSendAPI(sender_psid, {
            text: "Successfully subscribed. Message 'stop' to unsubscribe."
          });
        } else {
          console.log("Error subscribing");
          console.log(err);
          callSendAPI(sender_psid, { text: "Something went wrong" });
          return;
        }
      });
    }
  }
}

function callSendAPI(sender_psid, response) {
  // Construct the message body
  let request_body = {
    recipient: {
      id: sender_psid
    },
    message: response
  };

  // Send the HTTP request to the Messenger Platform
  request(
    {
      uri: "https://graph.facebook.com/v2.6/me/messages",
      qs: { access_token: secrets.PAGE_ACCESS_TOKEN },
      method: "POST",
      json: request_body
    },
    (err, res, body) => {
      if (!err) {
        console.log("message sent!");
      } else {
        console.error("Unable to send message:" + err);
        return;
      }
    }
  );
}

function getTodayString() {
  const today = new Date();
  let dd = today.getDate();
  let mm = today.getMonth() + 1; //January is 0!
  const yyyy = today.getFullYear();

  if (dd < 10) {
    dd = "0" + dd;
  }

  if (mm < 10) {
    mm = "0" + mm;
  }

  return yyyy + "-" + mm + "-" + dd;
}

function getTheavsPost() {
  const r = new snoowrap({
    userAgent:
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.81 Safari/537.36",
    clientId: secrets.REDDIT_CLIENT_ID,
    clientSecret: secrets.REDDIT_CLIENT_SECRET,
    refreshToken: secrets.REDDIT_REFRESH_TOKEN
  });

  return r
    .getSubreddit("SafeStreams")
    .getNew()
    .find(
      post =>
        post.title.toLowerCase().includes("leafs") &&
        post.author.name === "theavs"
    );
}
