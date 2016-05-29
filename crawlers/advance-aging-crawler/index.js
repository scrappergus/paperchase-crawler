'use strict';

var request = require('./request');
var Database = require('./database');

module.exports.crawlArticle = function(vol, num, pii) {
    var db = new Database;
    return request.getPage(vol, num, pii)
        .then(function(page) {
            var content = page('.content').html();
            return db.updateArticle(pii, content);
        });
};
