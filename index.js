const { Games } = require('@openhud/api');
const { represent, position, Positions } = require('@openhud/helpers');
const { texasHoldem, omahaHoldem } = require('hutchison');


// Based on https://www.advancedpokertraining.com/poker/blog/the-importance-of-texas-holdem-starting-hands/
const texasHoldemThresholds = new Map([
    [Positions.Early, { playable: 30, strong: 34 }],
    [Positions.Middle, { playable: 27, strong: 31 }],
    [Positions.Late, { playable: 25, strong: 29 }]
]);


const generateTip = (game, seats, community) => {
    const tip = { players: {} };

    if (community.length === 0) {
        const players = seats.length;
        const mySeatId = seats.findIndex(seat => seat.isMe);
        const btnSeatId = seats.findIndex(seat => seat.isButton);

        if (mySeatId !== -1) {
            const index = (mySeatId - (btnSeatId + 1) + players) % players;
            const myPosition = position({ players, index });

            const mySeat = seats[mySeatId];
            const myHand = mySeat.cards;
            if (myHand.length === 0) {
                throw {
                    type: 'https://www.openhud.io/errors/invalid-data',
                    detail: 'Hero cards are missing'
                };
            }
            const myPlayerName = mySeat.playerName;

            switch (game.type) {
                case Games.TexasHoldem:
                    {
                        const myHandRep = represent({ hand: myHand });
                        const { points } = texasHoldem({ hand: myHand });
                        const thresholds = texasHoldemThresholds.get(myPosition);
                        if (points >= thresholds.strong) {
                            tip.players[myPlayerName] = `${myHandRep} should open / raise previous open in ${myPosition} position.`;
                        } else if (points >= thresholds.playable) {
                            tip.players[myPlayerName] = `${myHandRep} should open / call previous open in ${myPosition} position.`;
                        } else {
                            tip.players[myPlayerName] = `${myHandRep} should always fold in ${myPosition} position.`;
                        }
                    }
                    break;
                case Games.OmahaHoldem:
                    {
                        const myHandRep = represent({ hand: myHand });

                        const lines = [`Players     EV     Rank - ${myHandRep}`];
                        for (let players = 2; players <= 6; ++players) {
                            const { ev, percentile } = omahaHoldem({ hand: myHand, players });
                            lines.push(`    ${players}    ${(ev * 100).toFixed(1)}%    ${(percentile * 100).toFixed(1)}%`);
                        }
                        tip.players[myPlayerName] = lines.join('<br>');
                    }
                    break;
                default:
                    break;
            }
        }
    }

    return tip;
};

//////////

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const functions = require('firebase-functions');


const app = express()
app.use(cors({
    origin: '*', // Required to avoid chrome extension CORB error
    maxAge: 86400
}));
app.use(bodyParser.json());


const errors = {
    'https://www.openhud.io/errors/invalid-data': {
        status: 400,
        title: 'Invalid Data'
    },
    'https://www.openhud.io/errors/internal': {
        status: 500,
        title: 'Internal'
    }
};

const translateException = e => {
    const error = errors[e.type] || errors['https://www.openhud.io/errors/internal'];
    return {
        status: error.status,
        body: {
            type: e.type,
            title: error.title,
            detail: e.detail || e.message
        }
    };
};


app.post('/', (request, response) => {
    try {
        const { game, seats, community } = request.body;

        const tip = generateTip(game, seats, community);

        response.status(200).send(tip);
    } catch (e) {
        const error = translateException(e);
        response.status(error.status).send(error.body);
    }
});

const metadata = {
    title: 'Hutchison Point System',
    description: 'Hutchison Point System (http://www.erhutchison.com/)',
    games: [{
        type: Games.TexasHoldem,
        bet: '*',
        format: '*'
    }, {
        type: Games.OmahaHoldem,
        bet: '*',
        format: '*'
    }],
    author: {
        name: 'Danny Leshem',
        email: 'dleshem@gmail.com'
    }
};

app.get('/', (request, response) => {
    response.status(200).send(metadata);
});


module.exports = {
    openhud: functions.https.onRequest(app)
};