'use strict';

const config = require('../config');
const Promise = require('./promise');
const extend = require('./extend_object');
const client = require('mongodb').MongoClient;

module.exports = (pii) => new Promise((resolve, reject) => {
    const q = {
        'ids.pii': pii
    };
    client.connect(config.db.url, (e, db) => {
        e ? reject(e) : db.collection('articles').findOne(q, (e, article) => {
            article = article || {};
            e ? reject(e) : resolve({
                id: article._id,
                update: (data) => new Promise((resolve, reject) => {
                    const doc = extend(article, data);
                    doc.files = extend(article.files, data.files);
//                    doc.advanceContent = data.advanceContent;
                    doc.ids = {pii:pii};
                    doc.authors = data.authors;
                    doc.articleJson = data.articleJson;
                    doc.dates = data.dates;
                    doc.history = data.history;
                    doc.correspondence = data.correspondence;
                    doc.keywords = data.keywords;

                    e ? reject(e) : db.collection('articles').updateOne(q, doc, (e) => {
                        e ? reject(e) : resolve(doc);
                    });
                })
            });
        });
    });
});
