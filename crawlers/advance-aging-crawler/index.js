'use strict';

var Promise = require('bluebird');
var Database = require('./database');
var request = require('./request');
var s3 = require('./s3');

module.exports.crawlArticle = function(vol, num, pii) {
    var db = new Database;
    return request.getPage(vol, num, pii)
        .then(function(page) {
            page('table')
                .addClass('bordered')
                .each(function(i, el) {
                    page(el).attr('id', 'T' + (i + 1).toString());
                });

            page('h3')
                .addClass('article-header-1')
                .wrap('<div class="section-container"></div>');

            page('h4')
                .addClass('article-header-2');

            var promises = page('.content')
                .find('img')
                .toArray()
                .map(function(el) {
                    return page(el);
                })
                .map(function($el) {
                    var src = $el.attr('src');
                    return request.getImage(vol, num, src)
                        .then(function(stream) {
                            return s3.upload(src.replace(/\//g, '-'), stream);
                        })
                        .then(function(upload) {
                            var url = upload.Location;
                            $el.attr('src', url);
                        });
                });

            return Promise.all(promises).then(function(figures) {
                return page('.content').html();
            });
        })
        .then(function(content) {
            return db.updateArticle(pii, content);
        });
};
