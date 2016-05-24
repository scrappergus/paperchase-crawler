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
		// This will batch save the PDF to S3 and update the Paperchase DB
		var journalDb = journalSettings[journal].dbUrl,
			journalIssn = journalSettings[journal].issn;
		var s3Folder = 'pdf';
		paperchase.allArticles(journal, {'ids.pmc' : {$exists:true},'ids.pii' : {$exists:true}, 'files.xml': {$exists:true}}, {ids:true},function(paperchaseArticlesError,paperchaseArticles){
			if(paperchaseArticlesError){
				console.error('paperchaseArticlesError',paperchaseArticlesError);
			}else if(paperchaseArticles){
				console.log('article count = ' + paperchaseArticles.length);
				async.mapSeries(paperchaseArticles, function(article,mapCb){
					var articleMongoId = article._id;
					// article.ids.mongo_id = article._id;
					// console.log(article);
					ncbi.getPmcPdf(article.ids, function(errorPdf, resultPdfData){
						if(errorPdf){
							console.error('errorPdf',errorPdf);
							// mapCb(errorPdf);
						}else if(resultPdfData){
							var fileName = articleMongoId + '.pdf';
							assets.saveLocallyAndUploadFile(journal, fileName, resultPdfData, s3Folder, function(pdfUploadError,pdfUploadRes){
								if(pdfUploadError){
									console.error('pdfUploadError');
								}else if(pdfUploadRes){
									article.pdf_url =  'http://s3-us-west-1.amazonaws.com/paperchase-' + journal + '/pdf/' + pdfUploadRes; // TODO: method uploadFileToS3 should return public URL but the folder is not being included.
									mapCb(null,article);
								}else{
									console.error('Unable to save file locally and upload to S3');
								}
							});
						}else{
							console.log('else');
							mapCb(null,null);
						}
					});
				},function(error,result){
					console.log('DONE crawling PDFs');
					cbBatch(null,result);
				});
			}
		});
	},
	getByArticle: function(journal, articleMongoId, cb){
		// console.log('..getByArticle: ' + articleMongoId);
		var s3Folder = 'pdf';
		var article = {};
		paperchase.getArticle(journal, {_id : articleMongoId}, {ids : 1}, function(paperchaseError,paperchaseArticle){
			if(paperchaseError){
				console.error('paperchaseError',paperchaseError);
			}else if(paperchaseArticle){
				article.ids = paperchaseArticle.ids;
				article.ids.mongo_id = paperchaseArticle._id;
				ncbi.getPmcPdf(article.ids, function(errorPdf, resultPdfData){
					if(errorPdf){
						// console.error('errorPdf',errorPdf);
						cb(errorPdf);
					}else if(resultPdfData){
                        if(resultPdfData.match('The IP address used for your Internet connection is part of a subnet that has been blocked from access to PubMed Central')) {
                            cb('Crawling blocked by PMC');
                        }
                        else {
                            var fileName = articleMongoId + '.pdf';
                            assets.saveLocallyAndUploadFile(journal, fileName, resultPdfData, s3Folder, function(pdfUploadError,pdfUploadRes){
                                    if(pdfUploadError){
                                        // console.error('pdfUploadError');
                                        cb(pdfUploadError)
                                    }else if(pdfUploadRes){
                                        article.pdf_url =  'http://s3-us-west-1.amazonaws.com/paperchase-' + journal + '/pdf/' + pdfUploadRes; // TODO: method uploadFileToS3 should return public URL but the folder is not being included.
                                        cb(null,article);
                                    }else{
                                        console.error('Unable to save file locally and upload to S3');
                                    }
                                });

                        }
					}else{
						cb(null,null);
					}
				});
			}
		});
	}
}
