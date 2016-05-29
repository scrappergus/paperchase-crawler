'use strict';

var Promise = require('bluebird');
var Database = require('./database');
var files = require('./filesystem');
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

            var docxUrl = page('.c-exclude-from-xml > a').attr('href');
            var supplements = !docxUrl ? Promise.resolve() : request.getFile(docxUrl)
                .then(function(stream) {
                    return s3.uploadSupplement(doc._id + '_sd1.docx', stream);
                })
                .then(function() {
                    return [{
                        file: doc._id + '_sd1.docx',
                        display: true
                    }];
                });


            /* EXTRACT SUPPLEMENTS
                        var supplements = !docxUrl ? Promise.resolve() : request.getFile(docxUrl)
                            .then(function(stream) {
                                return files.uploadStream(stream, 'sup.docx');
                            })
                            .then(function(stream) {
                                return files.extractMedia(stream);
                            })
                            .then(function(filepaths) {
                                var id;
                                var promises = filepaths
                                    .map(function(filepath, i) {
                                        var extension = filepath.match(/\.(\w+)$/);
                                        return {
                                            id: 'sd' + (i + 1).toString(),
                                            stream: files.getStream(filepath),
                                            name: doc._id + '_' + id + '.' + extension
                                        };
                                    })
                                    .map(function(file) {
                                        return s3.upload(file.stream, file.name)
                                            .then(function() {
                                                return {
                                                    id: file.id.toUpperCase(),
                                                    file: file.name
                                                };
                                            });
                                    });
                                return Promise.all(promises);
                            });
            */

            var pdfUrl = page('.pdf').attr('href');
            var pdf = !pdfUrl ? Promise.resolve() : request.getFile(pdfUrl)
                .then(function(stream) {
                    return s3.uploadPdf(doc._id + '.pdf', stream);
                })
                .then(function() {
                    return {
                        file: doc._id + '.pdf',
                        display: true
                    };
                });

            return Promise.all(promises)
                .then(function() {
                    return supplements;
                })
                .then(function(supplements) {
                    console.log('ABSTRACT:', Object.keys(page('.abstract > p')), page('.abstract > p').firstChild);
                    return Promise.all([
                        page('.content').html(),
                        page('.abstract').html(),
                        supplements,
                        pdf
                    ]);
                });
        })
        .spread(function(content, abstract, supplements, pdf) {
            return db.updateArticle(pii, content, abstract, supplements, pdf);
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
