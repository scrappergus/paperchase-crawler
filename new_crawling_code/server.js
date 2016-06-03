'use strict';

const crawl = require('./bin');
const express = require('express');
const app = express();
const port = process.env.port || 8000;

app.get('/crawl/:vol/:num/:pii', (req, res) => {
    crawl(req.params.vol, req.params.num, req.params.pii)
        .then(function(doc) {
            res.status(200).send(doc);
        })
        .catch(function(err) {
            res.status(400).send(err.toString());
        });
});

app.listen(port, () => console.log('listening on', port));
