'use strict';

const co = require('co');
const Promise = require('../lib/promise');
const extend = require('../lib/extend_object');
const getHtml = require('../lib/get_html');
const uploadToS3 = require('../lib/upload_to_s3');
const supplementToS3 = require('../lib/supplement_to_s3');
const getContent = require('../lib/get_content_and_images');
const getMeta = require('../lib/get_metadata');
const getAbstract = require('../lib/get_abstract');
const getArticle = require('../lib/get_article');

module.exports = (v, n, pii) => co(function*() {
    const baseUrl = `http://impactaging.com/papers/v${v}/n${n}`;
    const pageUrl = `${baseUrl}/full/${pii}.html`;
    const pdfUrl = `${baseUrl}/pdf/${pii}.pdf`;
    const supUrl = `${baseUrl}/full/${pii}/SupData.docx`;
    const imgUrl = `${baseUrl}/full/`;
    console.log('get article from db by pii', pii);
    const article = yield getArticle(pii);
    console.log('get html from page', pageUrl);
    const page = yield getHtml(pageUrl);
    console.log('upload pdf to s3', pdfUrl, `${article.id}.pdf`);
    const pdfUpload = yield uploadToS3(pdfUrl, `${article.id}.pdf`);
    console.log('upload images and parse and format content');
    const contentData = yield getContent(page, article.id, imgUrl);
    const advanceContent = contentData.content;
    const figures = contentData.figures.length > 1 ?
        contentData.figures :
        undefined;
    const pdf = {
        file: pdfUpload.Key
    };
    console.log('determine if supplement file exists on page');
    const supExists = page('body').html().indexOf(`${pii}/SupData.docx`) !== -1;
    console.log('get supplement file and extract images (if exists)');
    const supplemental = yield supExists ?
        supplementToS3(supUrl, `supplemental_materials/${article.id}_sd`) :
        Promise.resolve();
    console.log('get abstract');
    const abstract = getAbstract(page);
    console.log('get metadata');
    const metaData = getMeta(page);
    const files = extend({}, {
        supplemental,
        figures,
        pdf
    });
    console.log('update article');

    return article.update(Object.assign({
        advanceContent,
        files,
        abstract
    }, metaData));
});
