var config = require('../config');
var assets = require('../methods/assets');
var journalSettings = config.journalSettings;
var fs = require('fs');
var s3 = require('s3');
var phantom = require('node-phantom-simple');
var async = require('async');
var request = require('request').defaults({ encoding: null });
var paperchase = require('../methods/paperchase');
var ncbi = require('../methods/ncbi');

var getArticlePmcPdf = function(article,cb){
	ncbi.getPmcPdf(article.ids,function(error,result){
		if(error){
			console.error('get PDF');
			cb(error);
		}else if(result){
			cb(null,result);
		}
	})
}


module.exports = {
	batchByJournal: function(journal,cbBatch){
		// This will batch save the PDF to S3. It will NOT update the Paperchase DB. It will send JSON to Paperchase to update the DB.
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
		var s3Folder = 'pdf';
		paperchase.allArticles(journal, {'ids.pmc' : {$exists:true}}, {ids:true},function(paperchaseArticlesError,paperchaseArticles){
			if(paperchaseArticlesError){
				console.error('paperchaseArticlesError',paperchaseArticlesError);
			}else if(paperchaseArticles){
				console.log('paperchaseArticles count = ',paperchaseArticles.length);
				var failed = [];
				var success = [];
				async.mapSeries(paperchaseArticles, function(article,mapCb){
					ncbi.getPmcPdf(article.ids, function(errorPdf, resultPdfData){
						if(errorPdf){
							console.error('errorPdf');
							mapCb(errorPdf);
						}else if(resultPdfData){
							var fileName = article.ids.paperchase_id + '.pdf';
							assets.saveLocallyAndUploadFile(journal, fileName, resultPdfData, s3Folder, function(pdfUploadError,pdfUploadRes){
								if(pdfUploadError){
									console.error('pdfUploadError');
									// cb(pdfUploadError);
									// failed.push(article.ids);
									mapCb();
								}else if(pdfUploadRes){
									// success.push(pdfUploadRes);
									article.pdf_url = pdfUploadRes;
									mapCb(null,article);
									// console.log('pdfUploadRes',pdfUploadRes);
									// cb(null,pdfUploadRes);
								}else{
									mapCb();
								}
							});
						}
					});
				},function(error,result){
					console.log('DONE crawling PDFs');
					cbBatch(null,result);
				});

			}
		});
	}
}
