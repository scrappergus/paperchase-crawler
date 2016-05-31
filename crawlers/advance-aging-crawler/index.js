'use strict';

var Promise = require('bluebird');
var Database = require('./database');
// var files = require('./filesystem');
var request = require('./request');
var s3 = require('./s3');

var crawlArticle = module.exports.crawlArticle = function(vol, num, pii) {
    var db = new Database;
    return Promise.all([
        request.getPage(vol, num, pii),
        db.getArticle(pii)
    ])
        .spread(function(page, doc) {
            page('table')
                .addClass('bordered')
                .wrap('<div class="article-table"></div>')
                .each(function(i, el) {
                    page(el).attr('id', 'T' + (i + 1).toString());
                });

            page('h3')
                .addClass('article-header-1')
                .wrap('<div class="section-container"></div>');

            page('h4')
                .addClass('article-header-2');

            page('.figure')
                .addClass('full-text-image-container');

            page('img')
                .addClass('full-text-image')
                .attr('width', '')
                .attr('height', '');

            var promises = page('.content')
                .find('img')
                .toArray()
                .map(function(el) {
                    return page(el);
                })
                .map(function($el) {
                    var src = $el.attr('src');
                    return request.getFile(vol, num, src)
                        .then(function(stream) {
                            return s3.upload(src.replace(/\//g, '-'), stream);
                        })
                        .then(function(upload) {
                            var url = upload.Location;
                            $el.attr('src', url);
                        });
                });
                //
                // var docxUrl = page('.c-exclude-from-xml > a').attr('href');
                // var supplements = !docxUrl ? Promise.resolve() : request.getFile(vol, num, docxUrl)
                //     .then(function(stream) {
                //         return s3.uploadSupplement(doc._id + '_sd1.docx', stream);
                //     })
                //     .then(function() {
                //         return [{
                //             file: doc._id + '_sd1.docx',
                //             display: true
                //         }];
                //     });
                //
                // var pdf = request.getFile(vol, num, pii)
                //     .then(function(stream) {
                //         return s3.uploadPdf(doc._id + '.pdf', stream);
                //     })
                //     .then(function() {
                //         return {
                //             file: doc._id + '.pdf',
                //             display: true
                //         };
                //     });

            return Promise.all(promises)
                .then(function(upload) {
                    var url = 'http://impactaging.com/papers/v' + vol + '/n' + num + '/pdf/' + pii + '.pdf';
                    var filename = 'pdf/' + doc._id + '.pdf';
                    return Promise.all([
                        page('.content').html(),
                        page('.abstract').children('p').html(),
                        request.getPdf(url, filename).then(function() {
                            return {
                                display: true,
                                file: doc._id + '.pdf'
                            };
                        })
                    ]);
                });
        })
        .spread(function(content, abstract, pdf) {
            return db.updateArticle(pii, content, abstract, pdf);
        });
};

module.exports.crawlArticles = function(vol, num) {
    var db = new Database;
    return db.getAdvanceArticles()
        .then(function(articles) {
            return Promise.all(articles.map(function(article) {
                console.log('ARTICLE', article._id, article.ids.pii);
                return crawlArticle(vol, num, article.ids.pii)
                    .then(function(val) {
                        console.log('SUCCESS', article._id, article.ids.pii, val);
                        return {
                            status: 'SUCCESS',
                            mongoId: article._id,
                            pii: article.ids.pii,
                            response: val
                        };
                    })
                    .catch(function(err) {
                        console.log('ERROR', article._id, article.ids.pii, err);
                        return {
                            status: 'ERROR',
                            mongoId: article._id,
                            pii: article.ids.pii,
                            response: err
                        };
                    });
            }));
        });
};
