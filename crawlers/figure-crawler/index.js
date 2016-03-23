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

var crawl = exports.crawl = function(journal, pii, cb) {
	var db = new Database(journal);
	var articleId, figureId, figures, locations;

	Promise.all([
		db.getArticle(pii),
		db.getFigure(pii)
	])
		.spread(function(articleDoc, figureDoc) {
			articleId = articleDoc._id;
			figureId = figureDoc._id;
			figures = figureDoc.figures;

			return request.getPage(articleDoc.ids.pmc)
		})
		.then(function(page) {
			var uploads = figures.map(function(figure) {
				var path = page('#' + figure.figureID + ' img').attr('src-large');
				return request.getImage(path)
					.then(function(stream) {
						return s3.upload(articleId + '_' + figure.figureID, stream);
					});
			});

			return Promise.all(uploads);
		})
		.then(function(uploads) {
			locations = uploads.map(function(upload) {
				return upload.Location;
			});

			var updatedFigures = utils.zip(figures, locations, function(figure, location) {
				var updatedFigure = Object.assign({}, figure);
				updatedFigure.imgUrls = [location];
				return updatedFigure;
			});

			return db.updateFigure(figureId, updatedFigures);
		})
		.then(function() {
			cb(null, locations);
		})
		.catch(function(err) {
			cb(err);
		});
};
