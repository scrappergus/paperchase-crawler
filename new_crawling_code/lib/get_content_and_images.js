'use strict';

const path = require('path');
const Promise = require('./promise');
const uploadToS3 = require('./upload_to_s3');

module.exports = (page, mongoId, partialUrl) => {
    page('table')
        .addClass('bordered')
        .each(function(i, el) {
            page(el).attr('id', 'T' + (i + 1).toString());
        });

    page('table').prepend("<caption>"+page('table').prev('h4').html()+"</caption>");

    page('table').prev('h4').remove();


    page('table')
        .parent('.figure')
        .addClass('article-table')
        .removeClass('figure');


    page('h3')
    .addClass('article-header-1');
//        .wrap('<div class="section-container"></div>');

    page('h4')
        .addClass('article-header-2');
//        .wrap('<div class="section-container"></div>');


    page('.figure').each(function(idx, el) {
            page(el).addClass('full-text-image-container');
        });

    page('img')
        .addClass('full-text-image')
        .attr('width', '')
        .attr('height', '');

    page('.c-exclude-from-xml').find('a').each(function(i,el) {
//            console.log(el);
        });

    return Promise.all(page('.content')
        .find('.figure')
        .toArray()
        .map((el, index) => {
                const img = page(el).children('img');
                if(img.attr('src')) {
                    var src = img.attr('src')
                    var numMatch = src.match('Figure([0-9])*');

                    var id = numMatch[1];

                    const url = partialUrl + img.attr('src');
                    const filename = `${mongoId}_f${id}${path.extname(url)}`;
                    const text = page(el).text().replace(/Figure \d\./g, '').trim();
                    console.log('--> url', url);
                    return uploadToS3(url, `paper_figures/${filename}`)
                    .then((data) => img.attr('src', data.Location))
                    .then(() => {
                            return {
                                id: `F${id}`,
                                label: `Figure ${id}.`,
                                caption: text,
                                file: filename
                            };
                        });
                }

        }))
        .then((figures) => Object.assign({
            content: page('.content').html(),
            figures
        }));
};
