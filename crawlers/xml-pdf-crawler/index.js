'use strict';

var s3 = require('./s3');
var Database = require('./database');
var ncbi = require('../../methods/ncbi');
var xmlCrawler = require('../xmlCrawler');
var Promise = require('bluebird');

module.exports.crawlArticle = function (journal, pii) {
    var db = new Database(journal);
    var id;
    return db.getArticle(pii)
        .then(function(article) {
            id = article._id;
            return Promise.all([
                getAndUploadPdf(journal, id, article.ids),
                getAndUploadXml(journal, id, article.ids.pmc)
            ]);
        })
        .then(function() {
            return db.updateArticle(id);
        });
};

function getAndUploadXml(journal, id, pmc) {
//    return Promise.resolve();
    return new Promise(function (resolve, reject) {
        xmlCrawler.getAndSavePmcXml({
            mongo_id: id,
            pmc: pmc
        }, journal, function (err) {
            err ? reject(err) : resolve();
        });
    });
}

function getAndUploadPdf(journal, id, ids) {
    return new Promise(function (resolve, reject) {
        ncbi.getPmcPdf(Object.assign(ids, {
            mongo_id: id
        }), function (err, data) {
            err ? reject(err) : resolve(s3.upload(journal, id + '.pdf', data));
        });
    });
}
