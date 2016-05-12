'use strict';

var s3 = require('./s3')
var utils = require('./utils');
var request = require('./request');
var Database = require('./database');
var Promise = require('bluebird');

/*
	function crawlArticle, uploads images to s3 and updates figures document with imgUrls.	
	EX:
		crawl('aging', '100772', function(err) {
			...
		})
*/

module.exports.cleanS3 = function() {
	return s3.retrieve()
		.then(function(list) {
			var objects = list
				.filter(function(object) {
					return object.Key.match(/\.(jpg|png)$/);
				})
				.map(function(object) {
					return {
						Key: object.Key
					};
				});

			return s3.delete(objects);
		});
};

module.exports.crawlJournal = function(journal) {
	var db = new Database(journal);
	return db.getArticles()
		.then(function(docs) {
			recurse();
			function recurse() {
				setTimeout(function() {
					var doc = docs.pop();
					if (!doc) {
						console.log('COMPLETE');
						return;
					}
					if (!doc.ids.pmc) {
						console.log('MISSING:', doc._id, 'No PMC');
						return recurse();
					}
					crawl(journal, doc, function(err, results) {
						if (err) {
							console.log('ERROR:', doc._id, err);
						} else {
							console.log('SUCCESS:', doc._id, results);
						}
						recurse();
					});
				}, 250);
			}
		});
};

module.exports.crawlArticle = function(journal, pii, cb) {
	var db = new Database(journal);
	db.getArticle(pii)
		.then(function(articleDoc) {
			crawl(journal, articleDoc, cb);
		});
};

function crawl(journal, articleDoc, cb) {
	var db = new Database(journal);
	var figures;
	request.getPage(articleDoc.ids.pmc)
		.then(function(page) {
			var uploads = page('img[src-large]')
				.map(function(i, el) {
					var $el = page(el);
					var title = $el.attr('title').split(' ');
					var path = $el.attr('src-large');
					var split = path.split('.');
					return {
						path: path,
						extension: path.indexOf('.') === -1 ? 'png' : split[split.length - 1],
						id: title[0][0].toLowerCase() + title[1]
					};
				})
				.toArray()
				.map(function(figure) {
					var filename = (articleDoc._id + '_' + figure.id + '.' + figure.extension)
						.replace('..', '.')
						.replace('undefined', '1');

					return request.getImage(figure.path)
						.then(function(stream) {
							return s3.upload(filename, stream);
						});
				});

			return Promise.all(uploads);
		})
		.then(function(uploads) {
			figures = uploads
				.map(function(upload) {
					return upload.Location;
				})
				.map(function(location) {
					var id = location.match(/\_([a-zA-Z0-9\-]+)\./)[1];
					return {id: id, file: location};
				});
			return db.updateFigure(articleDoc._id, figures);
		})
		.then(function() {
			cb(null, figures.map(function(figure) {
				return figure.file;
			}));
		})
		.catch(function(err) {
			cb(err);
		});
}
